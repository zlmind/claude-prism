import { useClaudeChatStore } from "@/stores/claude-chat-store";
import { useClaudeEvents } from "@/hooks/use-claude-events";
import { ChatMessages } from "./chat-messages";
import { ChatComposer } from "./chat-composer";
import { ChatTabBar } from "./chat-tab-bar";
import { XIcon } from "lucide-react";

interface ChatPanelProps {
  onClose?: () => void;
}

export function ChatPanel({ onClose }: ChatPanelProps) {
  // Initialize event listeners for Claude streaming
  useClaudeEvents();

  const error = useClaudeChatStore((s) => s.error);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Tab bar */}
      <div className="flex items-center justify-between border-border border-b pr-1">
        <div className="min-w-0 flex-1">
          <ChatTabBar />
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close chat panel"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-3 mt-1 mb-0 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-destructive text-xs">
          {error}
        </div>
      )}

      {/* Messages area — fills available space */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <ChatMessages />
      </div>

      {/* Composer */}
      <ChatComposer isOpen={true} />
    </div>
  );
}
