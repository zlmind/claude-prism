import { describe, it, expect, beforeEach, vi } from "vitest";
import { useClaudeChatStore } from "@/stores/claude-chat-store";
import { useProposedChangesStore } from "@/stores/proposed-changes-store";

// ─── Mocks ───

vi.mock("@/stores/document-store", () => ({
  useDocumentStore: {
    getState: vi.fn(() => ({
      projectRoot: "/project",
      files: [],
      activeFileId: null,
      selectionRange: null,
      reloadFile: vi.fn(),
      refreshFiles: vi.fn(() => Promise.resolve()),
      saveAllFiles: vi.fn(() => Promise.resolve()),
    })),
  },
}));

vi.mock("@/stores/history-store", () => ({
  useHistoryStore: {
    getState: vi.fn(() => ({
      createSnapshot: vi.fn(() => Promise.resolve()),
    })),
  },
}));

vi.mock("@/lib/tauri/fs", () => ({
  writeTexFileContent: vi.fn(() => Promise.resolve()),
  readTexFileContent: vi.fn(() => Promise.resolve("")),
}));

function resetStores() {
  useClaudeChatStore.setState({
    messages: [],
    sessionId: null,
    isStreaming: false,
    error: null,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    _cancelledByUser: false,
  });
  useProposedChangesStore.setState({ changes: [] });
}

// ─── Tests ───

describe("proposed-changes merge behavior", () => {
  beforeEach(resetStores);

  describe("proposed-changes-store is file-scoped", () => {
    it("resolving a change removes it", () => {
      useProposedChangesStore.getState().addChange({
        id: "tool-1",
        filePath: "main.tex",
        absolutePath: "/project/main.tex",
        oldContent: "original",
        newContent: "edited",
        toolName: "Edit",
      });

      useProposedChangesStore.getState().resolveChange("tool-1");

      expect(useProposedChangesStore.getState().changes).toHaveLength(0);
    });
  });

  describe("concurrent file edits merge correctly", () => {
    it("second edit to same file preserves original baseline", () => {
      useProposedChangesStore.getState().addChange({
        id: "edit-a",
        filePath: "main.tex",
        absolutePath: "/project/main.tex",
        oldContent: "original",
        newContent: "v1",
        toolName: "Edit",
      });

      useProposedChangesStore.getState().addChange({
        id: "edit-b",
        filePath: "main.tex",
        absolutePath: "/project/main.tex",
        oldContent: "v1",
        newContent: "v2",
        toolName: "Edit",
      });

      const { changes } = useProposedChangesStore.getState();
      // Should be merged into a single entry
      expect(changes).toHaveLength(1);
      // Baseline must be "original" (the true pre-edit state)
      expect(changes[0].oldContent).toBe("original");
      expect(changes[0].newContent).toBe("v2");
      expect(changes[0].id).toBe("edit-b");
    });

    it("edits to different files stay independent", () => {
      useProposedChangesStore.getState().addChange({
        id: "tool-main",
        filePath: "main.tex",
        absolutePath: "/project/main.tex",
        oldContent: "main-original",
        newContent: "main-edited",
        toolName: "Edit",
      });

      useProposedChangesStore.getState().addChange({
        id: "tool-bib",
        filePath: "refs.bib",
        absolutePath: "/project/refs.bib",
        oldContent: "bib-original",
        newContent: "bib-edited",
        toolName: "Write",
      });

      const { changes } = useProposedChangesStore.getState();
      expect(changes).toHaveLength(2);

      const mainChange = changes.find((c) => c.filePath === "main.tex");
      const bibChange = changes.find((c) => c.filePath === "refs.bib");
      expect(mainChange!.oldContent).toBe("main-original");
      expect(bibChange!.oldContent).toBe("bib-original");
    });

    it("three sequential edits to the same file all preserve the original baseline", () => {
      const store = useProposedChangesStore.getState();

      store.addChange({
        id: "edit-1",
        filePath: "doc.tex",
        absolutePath: "/project/doc.tex",
        oldContent: "baseline",
        newContent: "v1",
        toolName: "Edit",
      });
      store.addChange({
        id: "edit-2",
        filePath: "doc.tex",
        absolutePath: "/project/doc.tex",
        oldContent: "v1",
        newContent: "v2",
        toolName: "Edit",
      });
      store.addChange({
        id: "edit-3",
        filePath: "doc.tex",
        absolutePath: "/project/doc.tex",
        oldContent: "v2",
        newContent: "v3",
        toolName: "MultiEdit",
      });

      const { changes } = useProposedChangesStore.getState();
      expect(changes).toHaveLength(1);
      expect(changes[0].oldContent).toBe("baseline");
      expect(changes[0].newContent).toBe("v3");
      expect(changes[0].id).toBe("edit-3");
      expect(changes[0].toolName).toBe("MultiEdit");
    });
  });

  describe("chat message state", () => {
    it("_appendMessage appends to the session messages", () => {
      const chat = useClaudeChatStore.getState();

      chat._appendMessage({
        type: "assistant",
        message: { content: [{ type: "text", text: "Hello from stream" }] },
      });

      const state = useClaudeChatStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].message?.content?.[0].text).toBe(
        "Hello from stream",
      );
    });

    it("_setSessionId updates the session id", () => {
      const chat = useClaudeChatStore.getState();
      chat._setSessionId("session-123");
      expect(useClaudeChatStore.getState().sessionId).toBe("session-123");
    });

    it("_setStreaming toggles streaming state", () => {
      const chat = useClaudeChatStore.getState();
      chat._setStreaming(true);
      expect(useClaudeChatStore.getState().isStreaming).toBe(true);
      chat._setStreaming(false);
      expect(useClaudeChatStore.getState().isStreaming).toBe(false);
    });

    it("_setError sets the error message", () => {
      const chat = useClaudeChatStore.getState();
      chat._setError("Rate limited");
      expect(useClaudeChatStore.getState().error).toBe("Rate limited");
    });
  });

  describe("new session does not affect proposed changes", () => {
    it("starting a new session leaves proposed changes intact", () => {
      useProposedChangesStore.getState().addChange({
        id: "existing-edit",
        filePath: "main.tex",
        absolutePath: "/project/main.tex",
        oldContent: "old",
        newContent: "new",
        toolName: "Edit",
      });

      useClaudeChatStore.getState().newSession();

      expect(useProposedChangesStore.getState().changes).toHaveLength(1);
    });

    it("keepAll clears all changes", () => {
      useProposedChangesStore.getState().addChange({
        id: "edit-1",
        filePath: "main.tex",
        absolutePath: "/project/main.tex",
        oldContent: "old-main",
        newContent: "new-main",
        toolName: "Edit",
      });
      useProposedChangesStore.getState().addChange({
        id: "edit-2",
        filePath: "refs.bib",
        absolutePath: "/project/refs.bib",
        oldContent: "old-bib",
        newContent: "new-bib",
        toolName: "Write",
      });

      useProposedChangesStore.getState().keepAll();

      expect(useProposedChangesStore.getState().changes).toHaveLength(0);
    });
  });
});
