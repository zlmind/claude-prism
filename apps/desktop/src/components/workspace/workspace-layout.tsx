import { useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { PanelRightCloseIcon, PanelRightOpenIcon } from "lucide-react";
import { Sidebar } from "./sidebar";
import { LatexEditor } from "./editor/latex-editor";
import { ChatPanel } from "@/components/claude-chat/chat-panel";
import { useDocumentStore } from "@/stores/document-store";

export function WorkspaceLayout() {
  const initialized = useDocumentStore((s) => s.initialized);
  const [chatVisible, setChatVisible] = useState(true);

  if (!initialized) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading project...</div>
      </div>
    );
  }

  return (
    <PanelGroup direction="horizontal" className="h-full">
      <Panel defaultSize={15} minSize={10} maxSize={25}>
        <Sidebar />
      </Panel>

      <PanelResizeHandle className="w-px bg-border transition-colors hover:bg-ring" />

      <Panel defaultSize={chatVisible ? 55 : 70} minSize={25}>
        <div className="relative h-full">
          <LatexEditor />
          <button
            type="button"
            onClick={() => setChatVisible((v) => !v)}
            title={chatVisible ? "Hide chat panel" : "Show chat panel"}
            className="absolute right-3 bottom-3 z-40 rounded-md border bg-background/85 p-1.5 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted hover:text-foreground"
          >
            {chatVisible ? (
              <PanelRightCloseIcon className="size-4" />
            ) : (
              <PanelRightOpenIcon className="size-4" />
            )}
          </button>
        </div>
      </Panel>

      {chatVisible && (
        <>
          <PanelResizeHandle className="w-px bg-border transition-colors hover:bg-ring" />

          <Panel defaultSize={30} minSize={20} maxSize={50}>
            <ChatPanel />
          </Panel>
        </>
      )}
    </PanelGroup>
  );
}
