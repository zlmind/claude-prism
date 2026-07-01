import { type FC, useState, useRef, useEffect } from "react";
import {
  ChevronDownIcon,
  CheckIcon,
  SettingsIcon,
  CpuIcon,
  ZapIcon,
} from "lucide-react";
import { useEngineStore } from "@/stores/engine-store";
import { cn } from "@/lib/utils";

export const EngineSelector: FC = () => {
  const activeEngine = useEngineStore((s) => s.activeEngine);
  const setActiveEngine = useEngineStore((s) => s.setActiveEngine);
  const selectedProvider = useEngineStore((s) => s.selectedProvider);
  const setSelectedProvider = useEngineStore((s) => s.setSelectedProvider);
  const selectedModel = useEngineStore((s) => s.selectedModel);
  const setSelectedModel = useEngineStore((s) => s.setSelectedModel);
  const providers = useEngineStore((s) => s.providers);
  const setSettingsOpen = useEngineStore((s) => s.setSettingsOpen);
  const engineStatuses = useEngineStore((s) => s.engineStatuses);

  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  const currentProvider = providers.find((p) => p.id === selectedProvider);
  const currentModel = currentProvider?.models.find(
    (m) => m.id === selectedModel,
  );

  const status = engineStatuses[activeEngine];
  const isAvailable = status?.available ?? activeEngine === "claude";

  const providerLabel =
    activeEngine === "pi" && currentProvider ? currentProvider.name : "";
  const modelLabel =
    activeEngine === "pi" && currentModel ? currentModel.name : "Claude CLI";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
          "hover:bg-muted",
          !isAvailable && "opacity-50",
        )}
      >
        {activeEngine === "claude" ? (
          <CpuIcon className="size-3 text-muted-foreground" />
        ) : (
          <ZapIcon className="size-3 text-blue-500" />
        )}
        <span className="font-medium text-muted-foreground">
          {activeEngine === "claude" ? "Claude" : providerLabel}
        </span>
        {activeEngine === "pi" && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="max-w-[120px] truncate">{modelLabel}</span>
          </>
        )}
        <ChevronDownIcon className="size-3 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-64 rounded-lg border bg-background shadow-lg">
          {/* Engine selector */}
          <div className="border-border border-b p-1.5">
            <div className="px-2 py-1 text-muted-foreground text-xs">
              Engine
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveEngine("claude");
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                "hover:bg-muted",
                activeEngine === "claude" && "bg-muted",
              )}
            >
              <CpuIcon className="size-3.5 text-muted-foreground" />
              <span className="flex-1 text-left">Claude CLI</span>
              {activeEngine === "claude" && (
                <CheckIcon className="size-3.5 text-primary" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveEngine("pi");
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                "hover:bg-muted",
                activeEngine === "pi" && "bg-muted",
              )}
            >
              <ZapIcon className="size-3.5 text-blue-500" />
              <span className="flex-1 text-left">Pi Agent Engine</span>
              {activeEngine === "pi" && (
                <CheckIcon className="size-3.5 text-primary" />
              )}
            </button>
          </div>

          {/* Pi provider/model selector */}
          {activeEngine === "pi" && providers.length > 0 && (
            <div className="p-1.5">
              <div className="px-2 py-1 text-muted-foreground text-xs">
                Provider
              </div>
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => {
                    setSelectedProvider(provider.id);
                    if (provider.models.length > 0) {
                      setSelectedModel(provider.models[0].id);
                    }
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                    "hover:bg-muted",
                    selectedProvider === provider.id && "bg-muted",
                  )}
                >
                  <span className="flex-1 text-left">{provider.name}</span>
                  {selectedProvider === provider.id && (
                    <CheckIcon className="size-3.5 text-primary" />
                  )}
                </button>
              ))}

              {currentProvider && currentProvider.models.length > 0 && (
                <>
                  <div className="mt-1 border-border border-t px-2 py-1 text-muted-foreground text-xs">
                    Model
                  </div>
                  {currentProvider.models.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => {
                        setSelectedModel(model.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                        "hover:bg-muted",
                        selectedModel === model.id && "bg-muted",
                      )}
                    >
                      <span className="flex-1 text-left">{model.name}</span>
                      {model.supports_thinking && (
                        <span className="rounded bg-blue-500/10 px-1 text-[10px] text-blue-500">
                          Thinking
                        </span>
                      )}
                      {selectedModel === model.id && (
                        <CheckIcon className="size-3.5 text-primary" />
                      )}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Settings button */}
          <div className="border-border border-t p-1.5">
            <button
              type="button"
              onClick={() => {
                setSettingsOpen(true);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-muted"
            >
              <SettingsIcon className="size-3.5 text-muted-foreground" />
              <span>Engine Settings</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
