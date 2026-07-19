import { useState } from "react";
import {
  DownloadIcon,
  Trash2Icon,
  Loader2Icon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface SkillCardProps {
  name: string;
  folder: string;
  description?: string;
  installed: boolean;
  source?: string;
  onInstall?: () => Promise<void>;
  onUninstall?: () => Promise<void>;
}

export function SkillCard({
  name,
  folder,
  description,
  installed,
  source,
  onInstall,
  onUninstall,
}: SkillCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleInstall = async () => {
    if (!onInstall || isLoading) return;
    setIsLoading(true);
    try {
      await onInstall();
    } finally {
      setIsLoading(false);
    }
  };

  const handleUninstall = async () => {
    if (!onUninstall || isLoading) return;
    setIsLoading(true);
    try {
      await onUninstall();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card/50 p-3 transition-colors hover:border-border/80 hover:bg-accent/30",
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <button
            className="flex w-full items-center gap-1.5 text-left"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate font-medium text-sm">{name}</span>
          </button>
          <p className="mt-0.5 pl-[18px] font-mono text-[10px] text-muted-foreground/60">
            {folder}
          </p>
          {source && (
            <p className="mt-0.5 flex items-center gap-1.5 pl-[18px]">
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px]",
                  source === "global"
                    ? "bg-blue-500/10 text-blue-500"
                    : "bg-purple-500/10 text-purple-500",
                )}
              >
                {source === "global" ? "Global" : "Project"}
              </span>
            </p>
          )}
        </div>

        {/* Action */}
        <div className="shrink-0">
          {installed ? (
            <div className="flex items-center gap-1.5">
              <Badge
                variant="secondary"
                className="gap-1 px-1.5 py-0.5 text-[10px]"
              >
                <CheckCircle2Icon className="size-2.5" />
                Installed
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-destructive"
                onClick={handleUninstall}
                disabled={isLoading}
                title="Uninstall"
              >
                {isLoading ? (
                  <Loader2Icon className="size-3 animate-spin" />
                ) : (
                  <Trash2Icon className="size-3" />
                )}
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-6 gap-1 px-2 text-xs"
              onClick={handleInstall}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : (
                <DownloadIcon className="size-3" />
              )}
              Install
            </Button>
          )}
        </div>
      </div>

      {/* Description (always show a short version, expand for full) */}
      {description && (
        <p
          className={cn(
            "mt-1.5 pl-[18px] text-muted-foreground text-xs leading-relaxed",
            !expanded && "line-clamp-2",
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}
