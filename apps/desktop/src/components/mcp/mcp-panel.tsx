import { useState, useEffect, useCallback } from "react";
import {
  ServerIcon,
  PlusIcon,
  DownloadIcon,
  CheckIcon,
  XIcon,
  RefreshCwIcon,
  ExternalLinkIcon,
  StarIcon,
  PackageIcon,
  Trash2Icon,
  ToggleLeftIcon,
  ToggleRightIcon,
  ZapIcon,
  TerminalIcon,
} from "lucide-react";
import {
  useMcpStore,
  type McpServer,
  type McpMarketplaceItem,
} from "@/stores/mcp-store";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface McpPanelProps {
  projectPath: string | null;
}

export function McpPanel({ projectPath }: McpPanelProps) {
  const {
    globalMcpStatus,
    projectMcpStatus,
    marketplaceItems,
    isLoading,
    error,
    installingMcp,
    fetchMarketplace,
    installMcp,
    installMcpFromUrl,
    toggleMcpEnabled,
    removeMcp,
    checkGlobalMcpStatus,
    checkProjectMcpStatus,
  } = useMcpStore();

  const [showMarketplace, setShowMarketplace] = useState(false);
  const [selectedTab, setSelectedTab] = useState<"installed" | "marketplace">(
    "installed",
  );
  const [installConfirmItem, setInstallConfirmItem] =
    useState<McpMarketplaceItem | null>(null);
  const [showManualConfig, setShowManualConfig] = useState(false);
  const [manualConfigJson, setManualConfigJson] = useState("");

  // Load marketplace data on mount
  useEffect(() => {
    if (!marketplaceItems) {
      fetchMarketplace();
    }
  }, [marketplaceItems, fetchMarketplace]);

  // Check MCP status when project path changes
  useEffect(() => {
    checkGlobalMcpStatus();
    if (projectPath) {
      checkProjectMcpStatus(projectPath);
    }
  }, [projectPath, checkGlobalMcpStatus, checkProjectMcpStatus]);

  // Combined MCP servers (global + project) with deduplication
  const allServers = [
    ...(globalMcpStatus?.servers || []),
    ...(projectMcpStatus?.servers || []),
  ].filter(
    (server, index, self) =>
      index === self.findIndex((s) => s.id === server.id),
  ); // Remove duplicates by ID

  const totalServers = allServers.length;
  const enabledServers = allServers.filter((s) => s.enabled).length;
  const mcpLabel =
    totalServers > 0 ? `${enabledServers}/${totalServers}` : "Not installed";

  const handleInstallClick = useCallback((item: McpMarketplaceItem) => {
    setInstallConfirmItem(item);
  }, []);

  const handleConfirmInstall = useCallback(async () => {
    if (!installConfirmItem) return;

    await installMcp(installConfirmItem.id, projectPath || undefined);
    setInstallConfirmItem(null);
    setShowMarketplace(false);
  }, [installConfirmItem, installMcp, projectPath]);

  const handleToggleEnabled = useCallback(
    async (server: McpServer) => {
      await toggleMcpEnabled(server.id, !server.enabled);
    },
    [toggleMcpEnabled],
  );

  const handleRemove = useCallback(
    async (server: McpServer) => {
      if (confirm(`Are you sure you want to remove ${server.name}?`)) {
        await removeMcp(server.id);
      }
    },
    [removeMcp],
  );

  const handleManualConfig = useCallback(async () => {
    if (!manualConfigJson.trim()) {
      alert("JSON configuration is required");
      return;
    }

    try {
      // Parse the JSON configuration
      const config = JSON.parse(manualConfigJson);

      // Check if it's mcpServers format
      if (!config.mcpServers || typeof config.mcpServers !== "object") {
        alert("JSON must contain 'mcpServers' object");
        return;
      }

      const mcpServers = config.mcpServers;
      const serverIds = Object.keys(mcpServers);

      if (serverIds.length === 0) {
        alert("No servers found in mcpServers configuration");
        return;
      }

      // Add each server
      let addedCount = 0;
      for (const serverId of serverIds) {
        const serverConfig = mcpServers[serverId];

        if (!serverConfig.command) {
          console.warn(`Server ${serverId} missing 'command' field, skipping`);
          continue;
        }

        // Extract configuration values
        const command = serverConfig.command;
        const args = serverConfig.args
          ? Array.isArray(serverConfig.args)
            ? serverConfig.args
            : [serverConfig.args]
          : undefined;
        const env = serverConfig.env
          ? typeof serverConfig.env === "object"
            ? serverConfig.env
            : undefined
          : undefined;

        try {
          await installMcpFromUrl({
            id: serverId.trim(),
            name: serverId.trim(), // Use ID as name for now
            description: `Manually configured ${serverId.trim()} MCP server`,
            url: "https://github.com/modelcontextprotocol/servers",
            command: command,
            args: args,
            env: env as Record<string, string>,
            projectPath: undefined, // Always add to global config
          });
          addedCount++;
        } catch (error) {
          console.error(`Failed to add server ${serverId}:`, error);
        }
      }

      if (addedCount === 0) {
        alert("No servers were added successfully");
      } else {
        // Refresh MCP status to show the newly added servers
        await checkGlobalMcpStatus();
      }

      // Clear and close dialog regardless of result
      setManualConfigJson("");
      setShowManualConfig(false);
      setShowMarketplace(false);
    } catch (error) {
      alert(`Invalid JSON configuration: ${error}`);
      // Still close the dialog even on error
      setManualConfigJson("");
      setShowManualConfig(false);
      setShowMarketplace(false);
    }
  }, [manualConfigJson, installMcpFromUrl, projectPath, checkGlobalMcpStatus]);

  // Featured and other marketplace items
  const featuredItems = marketplaceItems?.filter((item) => item.featured) || [];
  const otherItems = marketplaceItems?.filter((item) => !item.featured) || [];

  return (
    <>
      {/* MCP Status Button */}
      <button
        className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-sidebar-accent/50"
        onClick={() => setShowMarketplace(true)}
        title="Manage MCP Servers"
      >
        <ServerIcon
          className={cn(
            "size-3.5 shrink-0",
            totalServers > 0 ? "text-foreground" : "text-muted-foreground",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-xs">MCP</span>
        <span
          className={cn(
            "shrink-0 text-xs",
            totalServers > 0 ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {mcpLabel}
        </span>
      </button>

      {/* MCP Marketplace Dialog */}
      <Dialog open={showMarketplace} onOpenChange={setShowMarketplace}>
        <DialogContent className="flex max-h-[80vh] flex-col overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ServerIcon className="size-5" />
              MCP Servers Manager
            </DialogTitle>
            <DialogDescription>
              Manage installed Model Context Protocol servers or browse the
              marketplace for new ones
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={selectedTab}
            onValueChange={(v) => setSelectedTab(v as typeof selectedTab)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger
                value="installed"
                className="flex items-center gap-2"
              >
                <PackageIcon className="size-4" />
                Installed ({totalServers})
              </TabsTrigger>
              <TabsTrigger
                value="marketplace"
                className="flex items-center gap-2"
              >
                <ZapIcon className="size-4" />
                Marketplace ({marketplaceItems?.length || 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="installed"
              className="mt-4 min-h-0 flex-1 overflow-y-auto"
            >
              {totalServers === 0 ? (
                <div className="flex h-full flex-col items-center justify-center py-8 text-center">
                  <ServerIcon className="mb-3 size-12 text-muted-foreground" />
                  <h3 className="mb-1 font-semibold">
                    No MCP Servers Installed
                  </h3>
                  <p className="mb-4 text-muted-foreground text-sm">
                    Get started by installing your first server from the
                    marketplace
                  </p>
                  <Button
                    onClick={() => setSelectedTab("marketplace")}
                    className="gap-2"
                  >
                    <PlusIcon className="size-4" />
                    Browse Marketplace
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {allServers.map((server) => (
                    <McpServerCard
                      key={server.id}
                      server={server}
                      onToggleEnabled={() => handleToggleEnabled(server)}
                      onRemove={() => handleRemove(server)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent
              value="marketplace"
              className="mt-4 min-h-0 flex-1 overflow-y-auto"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold">MCP Marketplace</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowManualConfig(true)}
                  className="gap-2"
                >
                  <TerminalIcon className="size-4" />
                  Manual Config
                </Button>
              </div>

              {error ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <XIcon className="mx-auto mb-2 size-8 text-destructive" />
                    <p className="text-muted-foreground text-sm">{error}</p>
                    <Button
                      onClick={() => fetchMarketplace()}
                      className="mt-3 gap-2"
                    >
                      <RefreshCwIcon className="size-4" />
                      Retry
                    </Button>
                  </div>
                </div>
              ) : isLoading || !marketplaceItems ? (
                <div className="flex h-full items-center justify-center">
                  <RefreshCwIcon className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Featured Section */}
                  {featuredItems.length > 0 && (
                    <div>
                      <h3 className="mb-3 flex items-center gap-2 font-semibold">
                        <StarIcon className="size-4 text-yellow-500" />
                        Featured
                      </h3>
                      <div className="grid gap-3">
                        {featuredItems.map((item) => (
                          <McpMarketplaceCard
                            key={item.id}
                            item={item}
                            onInstall={() => handleInstallClick(item)}
                            isInstalling={installingMcp === item.id}
                            isInstalled={allServers.some(
                              (s) => s.id === item.id,
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* All Servers Section */}
                  {otherItems.length > 0 && (
                    <div>
                      <h3 className="mb-3 font-semibold">All Servers</h3>
                      <div className="grid gap-3">
                        {otherItems.map((item) => (
                          <McpMarketplaceCard
                            key={item.id}
                            item={item}
                            onInstall={() => handleInstallClick(item)}
                            isInstalling={installingMcp === item.id}
                            isInstalled={allServers.some(
                              (s) => s.id === item.id,
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className="border-t pt-4">
            <Button onClick={() => setShowMarketplace(false)} variant="outline">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Installation Confirmation Dialog */}
      <Dialog
        open={!!installConfirmItem}
        onOpenChange={() => setInstallConfirmItem(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Install {installConfirmItem?.name}</DialogTitle>
            <DialogDescription>
              This will install the MCP server and its dependencies
            </DialogDescription>
          </DialogHeader>

          {installConfirmItem && (
            <div className="space-y-3 py-4">
              <div className="space-y-1">
                <div className="font-medium text-sm">Description</div>
                <p className="text-muted-foreground text-sm">
                  {installConfirmItem.description}
                </p>
              </div>

              <div className="space-y-1">
                <div className="font-medium text-sm">Installation Command</div>
                <code className="block rounded bg-muted p-2 font-mono text-xs">
                  {installConfirmItem.installCommand}
                </code>
              </div>

              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <DownloadIcon className="size-3 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {installConfirmItem.downloads.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <StarIcon className="size-3 text-yellow-500" />
                  <span>{installConfirmItem.rating}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {installConfirmItem.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => setInstallConfirmItem(null)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmInstall} disabled={!!installingMcp}>
              {installingMcp === installConfirmItem?.id ? (
                <>
                  <RefreshCwIcon className="mr-2 size-4 animate-spin" />
                  Installing...
                </>
              ) : (
                <>
                  <DownloadIcon className="mr-2 size-4" />
                  Install
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Config Dialog */}
      <Dialog open={showManualConfig} onOpenChange={setShowManualConfig}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TerminalIcon className="size-5" />
              Manual MCP Configuration
            </DialogTitle>
            <DialogDescription>
              Paste the complete mcpServers JSON configuration to add servers
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="font-medium text-sm">JSON Configuration *</div>
              <div className="relative">
                <textarea
                  className="h-48 w-full resize-none rounded-md border px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={`{
  "mcpServers": {
    "发现报告": {
      "command": "uvx",
      "args": ["fxbaogao-mcp@latest"],
      "env": {}
    }
  }
}`}
                  value={manualConfigJson}
                  onChange={(e) => setManualConfigJson(e.target.value)}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Paste the complete mcpServers JSON configuration - server IDs
                will be extracted automatically
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => setShowManualConfig(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={handleManualConfig}
              disabled={!manualConfigJson.trim() || installingMcp !== null}
            >
              {installingMcp?.startsWith("manual-") ? (
                <>
                  <RefreshCwIcon className="mr-2 size-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <DownloadIcon className="mr-2 size-4" />
                  Add Servers
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── MCP Server Card Component ───

interface McpServerCardProps {
  server: McpServer;
  onToggleEnabled: () => void;
  onRemove: () => void;
}

function McpServerCard({
  server,
  onToggleEnabled,
  onRemove,
}: McpServerCardProps) {
  return (
    <div
      className={cn(
        "space-y-3 rounded-lg border p-4",
        !server.enabled && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h4 className="truncate font-semibold">{server.name}</h4>
            <Badge variant="outline" className="text-xs">
              {server.version}
            </Badge>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-xs",
                server.type === "global"
                  ? "bg-blue-500/10 text-blue-500"
                  : "bg-purple-500/10 text-purple-500",
              )}
            >
              {server.type === "global" ? "Global" : "Project"}
            </span>
          </div>
          <p className="line-clamp-2 text-muted-foreground text-sm">
            {server.description}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={onToggleEnabled}
          title={server.enabled ? "Disable" : "Enable"}
        >
          {server.enabled ? (
            <ToggleRightIcon className="size-4 text-green-500" />
          ) : (
            <ToggleLeftIcon className="size-4 text-muted-foreground" />
          )}
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {server.tools.slice(0, 3).map((tool) => (
            <Badge key={tool} variant="secondary" className="text-xs">
              {tool}
            </Badge>
          ))}
          {server.tools.length > 3 && (
            <Badge variant="secondary" className="text-xs">
              +{server.tools.length - 3}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-destructive"
            onClick={onRemove}
            title="Remove server"
          >
            <Trash2Icon className="size-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── MCP Marketplace Card Component ───

interface McpMarketplaceCardProps {
  item: McpMarketplaceItem;
  onInstall: () => void;
  isInstalling: boolean;
  isInstalled: boolean;
}

function McpMarketplaceCard({
  item,
  onInstall,
  isInstalling,
  isInstalled,
}: McpMarketplaceCardProps) {
  return (
    <div className="space-y-3 rounded-lg border p-4 transition-colors hover:bg-accent/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h4 className="truncate font-semibold">{item.name}</h4>
            {item.featured && (
              <Badge variant="default" className="text-xs">
                <StarIcon className="mr-1 size-3" />
                Featured
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {item.version}
            </Badge>
          </div>
          <p className="mb-2 line-clamp-2 text-muted-foreground text-sm">
            {item.description}
          </p>

          <div className="flex items-center gap-3 text-muted-foreground text-xs">
            <div className="flex items-center gap-1">
              <DownloadIcon className="size-3" />
              <span>{item.downloads.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <StarIcon className="size-3 text-yellow-500" />
              <span>{item.rating}</span>
            </div>
            <div className="flex items-center gap-1">
              <span>{item.author}</span>
            </div>
          </div>
        </div>

        <Button
          onClick={onInstall}
          disabled={isInstalling || isInstalled}
          className={cn(
            "shrink-0 gap-2",
            isInstalled && "bg-green-500 hover:bg-green-600",
          )}
        >
          {isInstalling ? (
            <>
              <RefreshCwIcon className="size-4 animate-spin" />
              Installing...
            </>
          ) : isInstalled ? (
            <>
              <CheckIcon className="size-4" />
              Installed
            </>
          ) : (
            <>
              <DownloadIcon className="size-4" />
              Install
            </>
          )}
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {item.tags.slice(0, 4).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
          {item.tags.length > 4 && (
            <Badge variant="secondary" className="text-xs">
              +{item.tags.length - 4}
            </Badge>
          )}
        </div>

        {item.homepage && (
          <Button variant="ghost" size="icon" className="size-7" asChild>
            <a
              href={item.homepage}
              target="_blank"
              rel="noopener noreferrer"
              title="View documentation"
            >
              <ExternalLinkIcon className="size-3" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
