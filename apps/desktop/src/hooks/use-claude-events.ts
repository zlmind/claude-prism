import { useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  useClaudeChatStore,
  type ClaudeStreamMessage,
} from "@/stores/claude-chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { useHistoryStore } from "@/stores/history-store";
import { useProposedChangesStore } from "@/stores/proposed-changes-store";
import { useSettingsStore } from "@/stores/settings-store";
import { readTexFileContent } from "@/lib/tauri/fs";
import {
  compileLatex,
  resolveCompileTarget,
  formatCompileError,
} from "@/lib/latex-compiler";
import { createLogger } from "@/lib/debug/logger";

const log = createLogger("claude-event");

/** Backend event payload shapes (tab_id is present but unused — single session). */
interface ClaudeOutputPayload {
  tab_id: string;
  data: string;
}

interface ClaudeCompletePayload {
  tab_id: string;
  success: boolean;
}

interface ClaudeErrorPayload {
  tab_id: string;
  data: string;
}

/**
 * Hook that manages Tauri event listeners for Claude CLI streaming output.
 *
 * Listeners are kept alive at all times (no race condition with invoke).
 * The app runs a single chat session, so mutable stream state is stored in
 * plain refs (no per-tab keying).
 */
export function useClaudeEvents() {
  // Mutable per-stream state stored in refs so the long-lived listeners
  // always read the latest values without needing to be re-created.
  const pendingToolUsesRef = useRef(
    new Map<string, { name: string; input: any }>(),
  );
  const hasTexChangesRef = useRef(false);
  const cancelledForAskRef = useRef(false);
  const listenersRef = useRef<UnlistenFn[]>([]);
  const msgCountRef = useRef(0);
  const streamStartTimeRef = useRef<number | null>(null);
  const lastMsgTimeRef = useRef<number | null>(null);

  // Reset per-stream state whenever a new stream starts
  const isStreaming = useClaudeChatStore((s) => s.isStreaming);
  useEffect(() => {
    if (isStreaming) {
      // New stream started — initialize state
      pendingToolUsesRef.current = new Map();
      hasTexChangesRef.current = false;
      cancelledForAskRef.current = false;
      msgCountRef.current = 0;
      streamStartTimeRef.current = null;
      lastMsgTimeRef.current = null;
    }
  }, [isStreaming]);

  // ── One-time listener setup (mount only) ──
  useEffect(() => {
    async function registerProposedChange(
      filePath: string,
      toolUseId: string,
      toolName: string,
    ) {
      const docState = useDocumentStore.getState();
      const projectRoot = docState.projectRoot;
      let relativePath = filePath;
      if (projectRoot && filePath.startsWith(projectRoot)) {
        relativePath = filePath.slice(projectRoot.length).replace(/^\//, "");
      }
      const file = docState.files.find(
        (f) => f.relativePath === relativePath || f.absolutePath === filePath,
      );
      if (!file) return;

      const oldContent = file.content ?? "";
      try {
        const newContent = await readTexFileContent(file.absolutePath);
        if (oldContent !== newContent) {
          useProposedChangesStore.getState().addChange({
            id: toolUseId,
            filePath: file.relativePath,
            absolutePath: file.absolutePath,
            oldContent,
            newContent,
            toolName,
          });
        }
      } catch {
        // readTexFileContent failed — not critical
      }
    }

    function elapsed() {
      const start = streamStartTimeRef.current;
      if (!start) return "";
      return `+${((performance.now() - start) / 1000).toFixed(1)}s`;
    }

    function handleStreamMessage(payload: ClaudeOutputPayload) {
      const { data } = payload;

      let msg: ClaudeStreamMessage;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }

      const chatStore = useClaudeChatStore.getState();

      // Only process messages while streaming
      if (!chatStore.isStreaming) return;

      const count = msgCountRef.current + 1;
      msgCountRef.current = count;
      const now = performance.now();
      if (count === 1) streamStartTimeRef.current = now;
      const lastTime = lastMsgTimeRef.current;
      const gap = lastTime ? ((now - lastTime) / 1000).toFixed(1) : "0";
      lastMsgTimeRef.current = now;

      // Log ALL message types with gap detection
      const contentTypes =
        msg.message?.content?.map((b: any) => b.type).join(",") ?? "";
      const gapWarning = Number(gap) > 10 ? ` GAP ${gap}s` : "";
      log.debug(
        `${elapsed()} #${count} type=${msg.type} sub=${msg.subtype ?? ""} content=[${contentTypes}] gap=${gap}s${gapWarning}`,
      );

      if (msg.type === "assistant") {
        const thinkingBlock = msg.message?.content?.find(
          (b: any) => b.type === "thinking",
        );
        if (thinkingBlock) {
          log.debug(
            `${elapsed()} thinking: ${(thinkingBlock.thinking || "").slice(0, 100)}`,
          );
        }
        const textBlock = msg.message?.content?.find(
          (b: any) => b.type === "text",
        );
        if (textBlock?.text) {
          log.debug(`${elapsed()} text: ${textBlock.text.slice(0, 100)}`);
        }
        const toolBlock = msg.message?.content?.find(
          (b: any) => b.type === "tool_use",
        );
        if (toolBlock) {
          log.debug(
            `${elapsed()} tool_use: ${toolBlock.name} ${toolBlock.input?.file_path ?? ""}`,
          );
        }
      }
      if (msg.type === "user" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "tool_result") {
            const preview =
              typeof block.content === "string"
                ? block.content.slice(0, 80)
                : JSON.stringify(block.content)?.slice(0, 80);
            log.debug(
              `${elapsed()} tool_result: id=${block.tool_use_id} err=${block.is_error ?? false} len=${preview?.length ?? 0}`,
            );
          }
        }
      }
      if (msg.type === "result") {
        log.info(
          `${elapsed()} result cost=$${msg.cost_usd} api=${msg.duration_api_ms}ms total=${msg.duration_ms}ms`,
        );
      }

      // Extract session_id from system:init
      if (msg.type === "system" && msg.subtype === "init" && msg.session_id) {
        chatStore._setSessionId(msg.session_id);
      }

      // Detect rate limit events and surface to user — never append to messages
      if ((msg as any).type === "rate_limit_event") {
        const info = (msg as any).rate_limit_info;
        if (info) {
          const resetsAt = info.resetsAt
            ? new Date(info.resetsAt * 1000).toLocaleTimeString()
            : "unknown";
          log.warn(
            `rate_limit: status=${info.status} type=${info.rateLimitType} resets=${resetsAt} overage=${info.overageStatus}`,
          );
          if (info.status !== "allowed") {
            chatStore._setError(
              `Rate limited (${info.rateLimitType}). Resets at ${resetsAt}`,
            );
          }
        }
        return; // rate_limit_event is informational — do not append to messages
      }

      // Track tool_use blocks for file change detection
      const toolUses = pendingToolUsesRef.current;
      if (msg.type === "assistant" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "tool_use" && block.id && block.name) {
            toolUses.set(block.id, {
              name: block.name,
              input: block.input,
            });
          }
        }
      }

      // Detect file modifications from tool_results → register as proposed changes
      if (msg.type === "user" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "tool_result" && block.tool_use_id) {
            const toolUse = toolUses.get(block.tool_use_id);
            if (
              toolUse &&
              !block.is_error &&
              /^(Write|write|Edit|edit|MultiEdit|multiedit)$/.test(toolUse.name)
            ) {
              const fp = toolUse.input?.file_path || toolUse.input?.path;
              if (fp) {
                registerProposedChange(fp, block.tool_use_id!, toolUse.name);
                if (/\.(tex|bib|sty|cls|dtx)$/i.test(fp)) {
                  hasTexChangesRef.current = true;
                }
              }
            }
          }
        }
      }

      // Skip duplicate user messages we already added locally
      if (
        msg.type === "user" &&
        msg.message?.content?.length === 1 &&
        msg.message.content[0].type === "text"
      ) {
        return;
      }

      chatStore._appendMessage(msg);

      // When AskUserQuestion is detected, cancel the process so the user
      // can interact with the widget before Claude continues.
      if (msg.type === "assistant" && msg.message?.content) {
        const hasAskUser = msg.message.content.some(
          (b: any) => b.type === "tool_use" && b.name === "AskUserQuestion",
        );
        if (hasAskUser) {
          log.info(
            `${elapsed()} AskUserQuestion detected — cancelling process for user input`,
          );
          cancelledForAskRef.current = true;
          invoke("cancel_claude_execution", { tabId: "main" }).catch(() => {});
        }
      }
    }

    async function handleComplete(payload: ClaudeCompletePayload) {
      const { success } = payload;
      const count = msgCountRef.current;

      log.info(
        `complete success=${success} (${count} messages) cancelledForAsk=${cancelledForAskRef.current}`,
      );
      const chatStore = useClaudeChatStore.getState();

      // Guard against duplicate complete events
      if (!chatStore.isStreaming) {
        log.warn("ignoring duplicate complete event (not streaming)");
        return;
      }

      if (
        !success &&
        !chatStore.error &&
        !cancelledForAskRef.current &&
        !chatStore._cancelledByUser
      ) {
        if (count === 0) {
          const isWindows = navigator.userAgent.includes("Windows");
          chatStore._setError(
            isWindows
              ? "Claude process failed to start. Check that Claude Code CLI is installed and git-bash is available."
              : "Claude process failed to start. Check that Claude Code CLI is installed.",
          );
        } else {
          chatStore._setError(
            "Claude process exited unexpectedly. This may be due to rate limiting or an API error.",
          );
        }
      }

      // Clean up per-stream state
      pendingToolUsesRef.current = new Map();
      hasTexChangesRef.current = false;
      cancelledForAskRef.current = false;

      chatStore._setStreaming(false);

      // Snapshot after Claude edit
      const projectPath = useDocumentStore.getState().projectRoot;
      if (projectPath) {
        try {
          await useHistoryStore
            .getState()
            .createSnapshot(projectPath, "[claude] After Claude edit");
        } catch {
          // snapshot failure should not break the flow
        }
      }

      const docStore = useDocumentStore.getState();
      await docStore.refreshFiles();

      // Auto-recompile after Claude finishes
      const {
        projectRoot,
        files,
        activeFileId,
        isCompiling: alreadyCompiling,
      } = useDocumentStore.getState();
      if (projectRoot && !alreadyCompiling) {
        const resolved = resolveCompileTarget(activeFileId, files);
        if (resolved) {
          const { rootId, targetPath } = resolved;
          useDocumentStore.getState().setIsCompiling(true);
          useDocumentStore.getState().setPendingRecompile(false);
          try {
            await useDocumentStore.getState().saveAllFiles();
            const texlive =
              useSettingsStore.getState().compilerBackend === "texlive";
            const pdfData = await compileLatex(
              projectRoot,
              targetPath,
              texlive,
            );
            useDocumentStore.getState().setPdfData(pdfData, rootId);
          } catch (err) {
            useDocumentStore
              .getState()
              .setCompileError(formatCompileError(err), rootId);
          } finally {
            useDocumentStore.getState().setIsCompiling(false);
          }
        }
      } else if (alreadyCompiling) {
        // Queue recompile — it will run when the current compile finishes
        useDocumentStore.getState().setPendingRecompile(true);
        log.info("queued post-Claude recompile — already compiling");
      }
    }

    // Set up listeners once and keep them alive for the component lifetime.
    // Each listener is added to listenersRef immediately after registration
    // to avoid a race condition where unmount happens mid-setup.
    let cancelled = false;
    (async () => {
      const unlistenOutput = await listen<ClaudeOutputPayload>(
        "claude-output",
        (event) => {
          if (!cancelled) handleStreamMessage(event.payload);
        },
      );
      if (cancelled) {
        unlistenOutput();
        return;
      }
      listenersRef.current.push(unlistenOutput);

      const unlistenComplete = await listen<ClaudeCompletePayload>(
        "claude-complete",
        (event) => {
          if (!cancelled) handleComplete(event.payload);
        },
      );
      if (cancelled) {
        unlistenComplete();
        return;
      }
      listenersRef.current.push(unlistenComplete);

      const unlistenError = await listen<ClaudeErrorPayload>(
        "claude-error",
        (event) => {
          if (!cancelled) {
            const { data: payload } = event.payload;
            log.warn(`stderr: ${payload}`);
            if (
              payload.includes("Error") ||
              payload.includes("error") ||
              payload.includes("ECONNREFUSED") ||
              payload.includes("timeout")
            ) {
              log.error(`CRITICAL: ${payload}`);
            }
            // Surface critical stderr messages to the user UI (only if no error is already set)
            if (
              (payload.includes("git-bash") ||
                payload.includes("git bash") ||
                payload.includes("bash.exe")) &&
              !useClaudeChatStore.getState().error
            ) {
              useClaudeChatStore
                .getState()
                ._setError(
                  "Claude Code requires git-bash on Windows. Please install Git for Windows or set the CLAUDE_CODE_GIT_BASH_PATH environment variable.",
                );
            }
            // Backend reports a stdout read failure — the stream is dead and
            // claude-complete will never arrive, so tell the user explicitly.
            if (
              payload.startsWith("Claude stdout read error:") &&
              !useClaudeChatStore.getState().error
            ) {
              useClaudeChatStore
                .getState()
                ._setError(
                  `${payload} — output stream lost. The session may be stuck; you can cancel and retry.`,
                );
            }
          }
        },
      );
      if (cancelled) {
        unlistenError();
        return;
      }
      listenersRef.current.push(unlistenError);
    })();

    return () => {
      cancelled = true;
      for (const unlisten of listenersRef.current) {
        unlisten();
      }
      listenersRef.current = [];
    };
  }, []); // mount-only
}
