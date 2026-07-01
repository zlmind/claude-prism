import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { useDocumentStore } from "./document-store";
import { useHistoryStore } from "./history-store";
import { useEngineStore, type EngineId } from "./engine-store";
import { createLogger } from "@/lib/debug/logger";

const log = createLogger("claude");

/** Convert a character offset to 1-based line:col */
export function offsetToLineCol(
  content: string,
  offset: number,
): { line: number; col: number } {
  const before = content.slice(0, offset);
  const lines = before.split("\n");
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

// ─── Types ───

export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result" | "thinking";
  // text block
  text?: string;
  // tool_use block
  id?: string;
  name?: string;
  input?: any;
  // tool_result block
  tool_use_id?: string;
  content?: any;
  is_error?: boolean;
  // thinking block
  thinking?: string;
  signature?: string;
}

export interface ClaudeStreamMessage {
  type: "system" | "assistant" | "user" | "result";
  subtype?: string;
  session_id?: string;
  model?: string;
  cwd?: string;
  tools?: string[];
  message?: {
    content?: ContentBlock[];
    usage?: { input_tokens: number; output_tokens: number };
  };
  usage?: { input_tokens: number; output_tokens: number };
  cost_usd?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  result?: string;
  is_error?: boolean;
  num_turns?: number;
  /** Internal: tracks Pi engine text accumulation */
  _piAccumulating?: boolean;
}

// ─── Tab Types ───

export interface TabDraft {
  input: string;
  pinnedContexts: {
    label: string;
    filePath: string;
    selectedText: string;
    imageDataUrl?: string;
  }[];
}

export interface TabState {
  id: string;
  title: string;
  sessionId: string | null;
  messages: ClaudeStreamMessage[];
  isStreaming: boolean;
  error: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  draft: TabDraft;
}

/** Fields that are projected from the active tab to top-level state */
const TAB_FIELDS = [
  "sessionId",
  "messages",
  "isStreaming",
  "error",
  "totalInputTokens",
  "totalOutputTokens",
] as const;

function makeDefaultTab(id: string): TabState {
  return {
    id,
    title: "New Chat",
    sessionId: null,
    messages: [],
    isStreaming: false,
    error: null,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    draft: {
      input: "",
      pinnedContexts: [],
    },
  };
}

const DEFAULT_TAB_ID = "tab-1";

function applyTabUpdate(
  state: ClaudeChatState,
  tabId: string,
  updates: Partial<TabState>,
): Partial<ClaudeChatState> {
  const newTabs = state.tabs.map((t) =>
    t.id === tabId ? { ...t, ...updates } : t,
  );
  const result: Partial<ClaudeChatState> = { tabs: newTabs };
  if (tabId === state.activeTabId) {
    for (const field of TAB_FIELDS) {
      if (field in updates) {
        (result as any)[field] = (updates as any)[field];
      }
    }
  }
  return result;
}

// ─── Store Interface ───

export interface ClaudeChatState {
  // Projected from active tab
  messages: ClaudeStreamMessage[];
  sessionId: string | null;
  isStreaming: boolean;
  error: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;

  // Tab management
  tabs: TabState[];
  activeTabId: string;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  effortLevel: string;
  setEffortLevel: (level: string) => void;
  activeEngine: string;
  setActiveEngine: (engine: string) => void;

  // Pending initial prompt (consumed once)
  pendingInitialPrompt: string | null;
  setPendingInitialPrompt: (prompt: string) => void;
  consumePendingInitialPrompt: () => string | null;

  // Pending attachments (consumed once)
  pendingAttachments: PinnedContext[];
  addPendingAttachment: (attachment: PinnedContext) => void;
  consumePendingAttachments: () => PinnedContext[];

  // Tab actions
  createTab: () => string;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  saveDraft: (tabId: string, draft: TabDraft) => void;

  /** True when any tab is streaming */
  anyStreaming: () => boolean;

  // Internal actions (called by event hook, routed by tabId)
  _appendMessage: (tabId: string, msg: ClaudeStreamMessage) => void;
  _updateLastMessage: (tabId: string, msg: ClaudeStreamMessage) => void;
  _setSessionId: (tabId: string, id: string) => void;
  _setStreaming: (tabId: string, streaming: boolean) => void;
  _setError: (tabId: string, error: string | null) => void;
  _cancelledByUser: boolean;
}

interface PinnedContext {
  label: string;
  filePath: string;
  selectedText: string;
  imageDataUrl?: string;
}

// ─── Store ───

export const useClaudeChatStore = create<ClaudeChatState>()((set, get) => ({
  // Projected fields (initialized from default tab)
  messages: [],
  sessionId: null,
  isStreaming: false,
  error: null,
  _cancelledByUser: false,
  totalInputTokens: 0,
  totalOutputTokens: 0,

  // Tab state
  tabs: [makeDefaultTab(DEFAULT_TAB_ID)],
  activeTabId: DEFAULT_TAB_ID,

  selectedModel: "opus",
  setSelectedModel: (model) => set({ selectedModel: model }),

  effortLevel: "medium",
  setEffortLevel: (level) => set({ effortLevel: level }),

  activeEngine: "claude",
  setActiveEngine: (engine) => set({ activeEngine: engine }),

  pendingInitialPrompt: null,
  setPendingInitialPrompt: (prompt) => set({ pendingInitialPrompt: prompt }),
  consumePendingInitialPrompt: () => {
    const { pendingInitialPrompt } = get();
    if (pendingInitialPrompt) {
      set({ pendingInitialPrompt: null });
    }
    return pendingInitialPrompt;
  },

  pendingAttachments: [],
  addPendingAttachment: (attachment) => {
    set((state) => ({
      pendingAttachments: [...state.pendingAttachments, attachment],
    }));
  },
  consumePendingAttachments: () => {
    const { pendingAttachments } = get();
    if (pendingAttachments.length > 0) {
      set({ pendingAttachments: [] });
    }
    return pendingAttachments;
  },

  anyStreaming: () => get().tabs.some((t) => t.isStreaming),

  sendPrompt: async (
    userPrompt: string,
    contextOverride?: { label: string; filePath: string; selectedText: string },
  ) => {
    const state = get();
    const { activeTabId } = state;
    const activeTab = state.tabs.find((t) => t.id === activeTabId);
    // Guard: prevent sending from a tab that's already streaming
    if (activeTab?.isStreaming) return;

    const { sessionId, selectedModel, effortLevel } = state;
    const {
      activeEngine,
      selectedProvider,
      selectedModel: piModel,
      apiKeys,
      thinkingLevel,
    } = useEngineStore.getState();

    const sendStart = performance.now();
    log.info("sendPrompt start", {
      sessionId: !!sessionId,
      hasContext: !!contextOverride,
      tab: activeTabId,
    });

    const docState = useDocumentStore.getState();
    const projectPath = docState.projectRoot;
    if (!projectPath) {
      set((s) => applyTabUpdate(s, activeTabId, { error: "No project open" }));
      return;
    }

    // Compute context label for display in chat history
    const activeFile = docState.files.find(
      (f) => f.id === docState.activeFileId,
    );
    let contextLabel: string | null = null;

    if (contextOverride) {
      contextLabel = contextOverride.label;
    } else if (activeFile) {
      const selRange = docState.selectionRange;
      if (selRange && activeFile.content) {
        const content = activeFile.content;
        const startLC = offsetToLineCol(content, selRange.start);
        const endLC = offsetToLineCol(content, selRange.end);
        contextLabel = `@${activeFile.relativePath}:${startLC.line}:${startLC.col}-${endLC.line}:${endLC.col}`;
      }
    }

    // Add user message to the list for display (with context label visible)
    const displayText = contextLabel
      ? `${contextLabel}\n${userPrompt}`
      : userPrompt;
    const userMessage: ClaudeStreamMessage = {
      type: "user",
      message: {
        content: [{ type: "text", text: displayText }],
      },
    };

    // Auto-set tab title from first prompt
    const isFirstMessage = activeTab && activeTab.messages.length === 0;
    const tabTitle = isFirstMessage
      ? userPrompt.slice(0, 40) + (userPrompt.length > 40 ? "..." : "")
      : undefined;

    set((s) => {
      const tabUpdates: Partial<TabState> = {
        messages: [
          ...(s.tabs.find((t) => t.id === activeTabId)?.messages ?? []),
          userMessage,
        ],
        isStreaming: true,
        error: null,
      };
      if (tabTitle) tabUpdates.title = tabTitle;
      return {
        ...applyTabUpdate(s, activeTabId, tabUpdates),
        _cancelledByUser: false,
      };
    });

    // Flush unsaved edits to disk so Claude reads the latest content
    if (docState.files.some((f) => f.isDirty)) {
      log.debug("saving dirty files...");
      await docState.saveAllFiles();
      log.debug("saveAllFiles done");
    }

    // Snapshot before Claude edit
    if (projectPath) {
      try {
        log.debug("creating snapshot...");
        await useHistoryStore
          .getState()
          .createSnapshot(projectPath, "[claude] Before Claude edit");
        log.debug("snapshot done");
      } catch {
        /* snapshot failure should not block Claude */
      }
    }

    // Build prompt with full context for Claude
    let prompt = userPrompt;
    if (activeFile) {
      const selRange = docState.selectionRange;
      const selectedText =
        selRange && activeFile.content
          ? activeFile.content.slice(selRange.start, selRange.end)
          : null;
      let ctx = `[Currently open file: ${activeFile.relativePath}]`;
      if (contextOverride) {
        ctx += `\n[Selection: ${contextOverride.label}]`;
        ctx += `\n[Selected text:\n${contextOverride.selectedText}\n]`;
      } else if (selectedText && selRange) {
        const content = activeFile.content ?? "";
        const startLC = offsetToLineCol(content, selRange.start);
        const endLC = offsetToLineCol(content, selRange.end);
        ctx += `\n[Selection: @${activeFile.relativePath}:${startLC.line}:${startLC.col}-${endLC.line}:${endLC.col}]`;
        ctx += `\n[Selected text:\n${selectedText}\n]`;
      }
      prompt = `${ctx}\n\n${userPrompt}`;
    }
    log.info("invoking CLI", {
      promptLength: prompt.length,
      mode: sessionId ? "resume" : "new",
    });

    try {
      if (activeEngine === "pi") {
        // Route to Pi engine
        const apiKey = apiKeys[selectedProvider] || "";
        if (!apiKey) {
          set((s) =>
            applyTabUpdate(s, activeTabId, {
              isStreaming: false,
              error:
                "API key required for Pi engine. Open Engine Settings to configure.",
            }),
          );
          return;
        }

        // Build context from previous messages for Pi (new process each time)
        const prevMessages = state.tabs.find(t => t.id === activeTabId)?.messages || [];
        let fullPrompt = prompt;
        if (prevMessages.length > 0) {
          // Include conversation history as context
          const history = prevMessages
            .filter(m => m.type === "user" || m.type === "assistant")
            .map(m => {
              const role = m.type === "user" ? "User" : "Assistant";
              const text = m.message?.content?.map(c => c.text || "").filter(Boolean).join("\n") || "";
              return `[${role}]:\n${text}`;
            })
            .join("\n\n");
          fullPrompt = `[Conversation history]\n${history}\n\n[New message]\n${prompt}`;
        }

        await invoke("execute_with_engine", {
          engine: "pi",
          projectPath,
          prompt: fullPrompt,
          tabId: activeTabId,
          model: piModel,
          provider: selectedProvider,
          apiKey,
          effortLevel: thinkingLevel,
        });
      } else {
        // Route to Claude engine (existing behavior)
        if (sessionId) {
          await invoke("resume_claude_code", {
            projectPath,
            sessionId,
            prompt,
            tabId: activeTabId,
            model: selectedModel,
            effortLevel,
          });
        } else {
          await invoke("execute_claude_code", {
            projectPath,
            prompt,
            tabId: activeTabId,
            model: selectedModel,
            effortLevel,
          });
        }
      }
      log.info(
        `sendPrompt complete in ${(performance.now() - sendStart).toFixed(0)}ms`,
      );
    } catch (err: any) {
      log.error("sendPrompt invoke failed", err);
      // Only clear streaming + set error if the tab wasn't already stopped by engine-complete
      const currentTab = get().tabs.find((t) => t.id === activeTabId);
      if (currentTab?.isStreaming) {
        set((s) =>
          applyTabUpdate(s, activeTabId, {
            isStreaming: false,
            error: `Failed to start Claude Code: ${err}`,
          }),
        );
      }
    }
  },

  cancelExecution: async () => {
    const { activeTabId, activeEngine } = get();
    const engine = activeEngine;
    if (activeEngine === "pi") {
      await invoke("cancel_engine_execution", { engine, tabId: activeTabId });
    } else {
      await invoke("cancel_claude_execution", { tabId: activeTabId });
    }
    set((s) => ({
      ...applyTabUpdate(s, activeTabId, { isStreaming: false, error: "Cancelled" }),
      _cancelledByUser: true,
    }));
    log.info("execution cancelled by user", { tab: activeTabId });
  },

  createTab: () => {
    const newId = `tab-${Date.now()}`;
    set((state) => ({ tabs: [...state.tabs, makeDefaultTab(newId)] }));
    return newId;
  },

  closeTab: (tabId: string) => {
    // Don't close the last tab
    const state = get();
    if (state.tabs.length <= 1) return;

    const idx = state.tabs.findIndex((t) => t.id === tabId);
    const newTabs = state.tabs.filter((t) => t.id !== tabId);

    if (tabId === state.activeTabId) {
      // Switch to the neighbor tab (prefer left)
      const newIdx = Math.max(0, idx - 1);
      const targetTab = newTabs[newIdx];
      set({
        tabs: newTabs,
        activeTabId: targetTab.id,
        messages: targetTab.messages,
        sessionId: targetTab.sessionId,
        isStreaming: targetTab.isStreaming,
        error: targetTab.error,
        totalInputTokens: targetTab.totalInputTokens,
        totalOutputTokens: targetTab.totalOutputTokens,
      });
    } else {
      set({ tabs: newTabs });
    }
  },

  setActiveTab: (tabId: string) => {
    const state = get();
    if (tabId === state.activeTabId) return;
    const targetTab = state.tabs.find((t) => t.id === tabId);
    if (!targetTab) return;

    // Project the target tab's fields to top-level
    set({
      activeTabId: tabId,
      messages: targetTab.messages,
      sessionId: targetTab.sessionId,
      isStreaming: targetTab.isStreaming,
      error: targetTab.error,
      totalInputTokens: targetTab.totalInputTokens,
      totalOutputTokens: targetTab.totalOutputTokens,
    });
  },

  saveDraft: (tabId: string, draft: TabDraft) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, draft } : t)),
    }));
  },

  // ─── Internal Actions (routed by explicit tabId) ───

  _appendMessage: (tabId: string, msg: ClaudeStreamMessage) => {
    set((state) => {
      let inputDelta = 0;
      let outputDelta = 0;
      const usage = msg.usage || msg.message?.usage;
      if (usage) {
        inputDelta = usage.input_tokens || 0;
        outputDelta = usage.output_tokens || 0;
      }

      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab) return {};

      return applyTabUpdate(state, tabId, {
        messages: [...tab.messages, msg],
        totalInputTokens: tab.totalInputTokens + inputDelta,
        totalOutputTokens: tab.totalOutputTokens + outputDelta,
      });
    });
  },

  // Pi engine: update last message in-place (replace, not append — avoid duplicates on delta)
  _updateLastMessage: (tabId: string, msg: ClaudeStreamMessage) => {
    set((state) => {
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab || tab.messages.length === 0) return {};
      return applyTabUpdate(state, tabId, {
        messages: [...tab.messages.slice(0, -1), msg],
      });
    });
  },

  _setSessionId: (tabId: string, id: string) => {
    set((state) => applyTabUpdate(state, tabId, { sessionId: id }));
  },

  _setStreaming: (tabId: string, streaming: boolean) => {
    set((state) => applyTabUpdate(state, tabId, { isStreaming: streaming }));
  },

  _setError: (tabId: string, error: string | null) => {
    set((state) => applyTabUpdate(state, tabId, { error }));
  },
}));
