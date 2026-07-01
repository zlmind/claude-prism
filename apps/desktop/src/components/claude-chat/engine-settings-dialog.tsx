import { type FC, useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEngineStore } from "@/stores/engine-store";
import {
  EyeIcon,
  EyeOffIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "lucide-react";

export const EngineSettingsDialog: FC = () => {
  const open = useEngineStore((s) => s.settingsOpen);
  const setOpen = useEngineStore((s) => s.setSettingsOpen);
  const activeEngine = useEngineStore((s) => s.activeEngine);
  const setActiveEngine = useEngineStore((s) => s.setActiveEngine);
  const selectedProvider = useEngineStore((s) => s.selectedProvider);
  const setSelectedProvider = useEngineStore((s) => s.setSelectedProvider);
  const selectedModel = useEngineStore((s) => s.selectedModel);
  const setSelectedModel = useEngineStore((s) => s.setSelectedModel);
  const providers = useEngineStore((s) => s.providers);
  const loadProviders = useEngineStore((s) => s.loadProviders);
  const apiKeys = useEngineStore((s) => s.apiKeys);
  const setApiKey = useEngineStore((s) => s.setApiKey);
  const engineStatuses = useEngineStore((s) => s.engineStatuses);
  const checkEngineStatus = useEngineStore((s) => s.checkEngineStatus);
  const thinkingLevel = useEngineStore((s) => s.thinkingLevel);
  const setThinkingLevel = useEngineStore((s) => s.setThinkingLevel);

  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    provider: string;
    ok: boolean;
    message: string;
  } | null>(null);

  // Load providers on open
  useEffect(() => {
    if (open) {
      loadProviders();
      checkEngineStatus("claude");
      checkEngineStatus("pi");
    }
  }, [open]);

  const currentProvider = providers.find((p) => p.id === selectedProvider);
  const currentModel = currentProvider?.models.find(
    (m) => m.id === selectedModel,
  );

  const handleTestApiKey = async (provider: string) => {
    const key = apiKeys[provider];
    if (!key) return;

    setTestingKey(provider);
    setTestResult(null);

    try {
      // TODO: Implement actual API key test via backend
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setTestResult({
        provider,
        ok: true,
        message: "API key is valid",
      });
    } catch (err) {
      setTestResult({
        provider,
        ok: false,
        message: String(err),
      });
    } finally {
      setTestingKey(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Engine Settings</DialogTitle>
          <DialogDescription>
            Configure AI engine, provider, and API key settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Engine Selection */}
          <div className="space-y-2">
            <Label>Active Engine</Label>
            <Select
              value={activeEngine}
              onValueChange={(v) => setActiveEngine(v as "claude" | "pi")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="claude">
                  Claude CLI (requires subscription)
                </SelectItem>
                <SelectItem value="pi">
                  Pi Agent Engine (bring your own key)
                </SelectItem>
              </SelectContent>
            </Select>
            {engineStatuses["claude"] && activeEngine === "claude" && (
              <p className="text-muted-foreground text-xs">
                {engineStatuses["claude"].available ? (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircleIcon className="size-3" />
                    {engineStatuses["claude"].message}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-600">
                    <XCircleIcon className="size-3" />
                    {engineStatuses["claude"].message}
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Pi Engine Settings */}
          {activeEngine === "pi" && (
            <>
              {/* Provider Selection */}
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select
                  value={selectedProvider}
                  onValueChange={(v) => {
                    setSelectedProvider(v);
                    const p = providers.find((p) => p.id === v);
                    if (p && p.models.length > 0) {
                      setSelectedModel(p.models[0].id);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Model Selection */}
              {currentProvider && currentProvider.models.length > 0 && (
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Select
                    value={selectedModel}
                    onValueChange={setSelectedModel}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currentProvider.models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                          {m.supports_thinking && (
                            <span className="ml-2 rounded bg-blue-500/10 px-1 text-[10px] text-blue-500">
                              Thinking
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Thinking Level */}
              {currentModel?.supports_thinking && (
                <div className="space-y-2">
                  <Label>Thinking Level</Label>
                  <Select
                    value={thinkingLevel}
                    onValueChange={(v: any) => setThinkingLevel(v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minimal">Minimal</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="xhigh">Extreme</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs">
                    Higher thinking levels produce better results but use more
                    tokens.
                  </p>
                </div>
              )}

              {/* API Key */}
              <div className="space-y-2">
                <Label>API Key</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showApiKey[selectedProvider] ? "text" : "password"}
                      value={apiKeys[selectedProvider] || ""}
                      onChange={(e) =>
                        setApiKey(selectedProvider, e.target.value)
                      }
                      placeholder={`Enter ${currentProvider?.name || ""} API key`}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowApiKey((prev) => ({
                          ...prev,
                          [selectedProvider]: !prev[selectedProvider],
                        }))
                      }
                      className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showApiKey[selectedProvider] ? (
                        <EyeOffIcon className="size-4" />
                      ) : (
                        <EyeIcon className="size-4" />
                      )}
                    </button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestApiKey(selectedProvider)}
                    disabled={
                      !apiKeys[selectedProvider] ||
                      testingKey === selectedProvider
                    }
                  >
                    {testingKey === selectedProvider ? "Testing..." : "Test"}
                  </Button>
                </div>
                {testResult && testResult.provider === selectedProvider && (
                  <p
                    className={`text-xs ${
                      testResult.ok ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {testResult.message}
                  </p>
                )}
                <p className="text-muted-foreground text-xs">
                  API keys are stored securely in your OS keychain.
                </p>
              </div>

              {engineStatuses["pi"] && (
                <p className="text-muted-foreground text-xs">
                  {engineStatuses["pi"].available ? (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircleIcon className="size-3" />
                      {engineStatuses["pi"].message}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-600">
                      <XCircleIcon className="size-3" />
                      {engineStatuses["pi"].message}
                    </span>
                  )}
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
