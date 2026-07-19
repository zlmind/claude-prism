import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

// ─── MCP Types ───

export interface McpServer {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  type: "global" | "project";
  tools: string[];
  author?: string;
  homepage?: string;
  command?: string;
  args?: string[];
  config?: Record<string, unknown>;
}

export interface McpMarketplaceItem {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  homepage?: string;
  downloads: number;
  rating: number;
  tags: string[];
  featured: boolean;
  installer?: "npm" | "pip" | "cargo" | "go";
  installCommand?: string;
  configTemplate?: Record<string, unknown>;
}

export interface McpStatus {
  installed: boolean;
  servers: McpServer[];
  error?: string;
}

// ─── MCP Store ───

interface McpStoreState {
  // Global MCPs
  globalMcpStatus: McpStatus | null;
  projectMcpStatus: McpStatus | null;
  marketplaceItems: McpMarketplaceItem[] | null;
  isLoading: boolean;
  error: string | null;

  // Installation state
  installingMcp: string | null;

  // Actions
  checkGlobalMcpStatus: () => Promise<void>;
  checkProjectMcpStatus: (projectPath: string) => Promise<void>;
  fetchMarketplace: () => Promise<void>;
  installMcp: (itemId: string, projectPath?: string) => Promise<void>;
  installMcpFromUrl: (request: {
    id: string;
    name: string;
    description: string;
    url: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
    projectPath?: string;
  }) => Promise<void>;
  toggleMcpEnabled: (serverId: string, enabled: boolean) => Promise<void>;
  removeMcp: (serverId: string) => Promise<void>;
  refreshMcpStatus: (projectPath?: string) => Promise<void>;
}

export const useMcpStore = create<McpStoreState>((set, get) => ({
  // Initial state
  globalMcpStatus: null,
  projectMcpStatus: null,
  marketplaceItems: null,
  isLoading: false,
  error: null,
  installingMcp: null,

  checkGlobalMcpStatus: async () => {
    set({ isLoading: true, error: null });
    try {
      const status = await invoke<McpStatus>("check_mcp_installed", {
        projectPath: null,
      });
      set({ globalMcpStatus: status, isLoading: false });
    } catch (error) {
      set({
        error: `Failed to check MCP status: ${error}`,
        isLoading: false,
      });
    }
  },

  checkProjectMcpStatus: async (projectPath: string) => {
    set({ isLoading: true, error: null });
    try {
      const status = await invoke<McpStatus>("check_mcp_installed", {
        projectPath,
      });
      set({ projectMcpStatus: status, isLoading: false });
    } catch (error) {
      set({
        error: `Failed to check project MCP status: ${error}`,
        isLoading: false,
      });
    }
  },

  fetchMarketplace: async () => {
    set({ isLoading: true, error: null });
    try {
      const items = await invoke<McpMarketplaceItem[]>("fetch_mcp_marketplace");
      set({ marketplaceItems: items, isLoading: false });
    } catch (error) {
      set({
        error: `Failed to fetch marketplace: ${error}`,
        isLoading: false,
        marketplaceItems: null,
      });
    }
  },

  installMcp: async (itemId: string, projectPath?: string) => {
    const { marketplaceItems } = get();
    const item = marketplaceItems?.find((i) => i.id === itemId);
    if (!item) {
      set({ error: `MCP item ${itemId} not found in marketplace` });
      return;
    }

    set({ installingMcp: itemId, error: null });
    try {
      await invoke("install_mcp_server", {
        itemId,
        installCommand: item.installCommand,
        projectPath: projectPath || null,
      });

      // Refresh status after installation
      if (projectPath) {
        await get().checkProjectMcpStatus(projectPath);
      } else {
        await get().checkGlobalMcpStatus();
      }
    } catch (error) {
      set({
        error: `Failed to install ${item.name}: ${error}`,
        installingMcp: null,
      });
    } finally {
      set({ installingMcp: null });
    }
  },

  installMcpFromUrl: async (request) => {
    set({ installingMcp: `manual-${request.id}`, error: null });
    try {
      await invoke("install_mcp_from_url", {
        request: {
          id: request.id,
          name: request.name,
          description: request.description,
          url: request.url,
          command: request.command,
          args: request.args || null,
          env: request.env || null,
        },
        projectPath: null, // Always use global config for manual config
      });

      // Always refresh global status after manual config
      await get().checkGlobalMcpStatus();
    } catch (error) {
      set({
        error: `Failed to install ${request.name}: ${error}`,
        installingMcp: null,
      });
      throw error; // Re-throw to let caller handle
    } finally {
      set({ installingMcp: null });
    }
  },

  toggleMcpEnabled: async (serverId: string, enabled: boolean) => {
    set({ error: null });
    try {
      await invoke("toggle_mcp_server", {
        serverId,
        enabled,
        projectPath: null,
      });

      // Refresh both global and project status to ensure UI is updated
      await get().checkGlobalMcpStatus();
    } catch (error) {
      set({ error: `Failed to toggle MCP server: ${error}` });
    }
  },

  removeMcp: async (serverId: string) => {
    set({ error: null });
    try {
      await invoke("remove_mcp_server", { serverId, projectPath: null });

      // Refresh global status to ensure UI is updated
      await get().checkGlobalMcpStatus();
    } catch (error) {
      set({ error: `Failed to remove MCP server: ${error}` });
    }
  },

  refreshMcpStatus: async (projectPath?: string) => {
    await Promise.all([
      get().checkGlobalMcpStatus(),
      projectPath
        ? get().checkProjectMcpStatus(projectPath)
        : Promise.resolve(),
    ]);
  },
}));
