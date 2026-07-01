import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import { createLogger } from "@/lib/debug/logger";

const log = createLogger("engine-store");

// ─── Types ───

export type EngineId = "claude" | "pi";

export interface ProviderInfo {
  id: string;
  name: string;
  needs_api_key: boolean;
  models: ModelInfo[];
}

export interface ModelInfo {
  id: string;
  name: string;
  supports_thinking: boolean;
}

export interface EngineConfigSchema {
  needs_binary: boolean;
  needs_api_key: boolean;
  providers: ProviderInfo[];
  needs_auth: boolean;
}

export interface EngineStatus {
  available: boolean;
  message: string;
}

export interface ApiKeyEntry {
  provider: string;
  key: string;
  isValid?: boolean;
}

// ─── State Interface ───

interface EngineState {
  // Active engine
  activeEngine: EngineId;
  setActiveEngine: (engine: EngineId) => void;

  // Pi-specific settings
  selectedProvider: string;
  setSelectedProvider: (provider: string) => void;

  selectedModel: string;
  setSelectedModel: (model: string) => void;

  // API keys (encrypted at rest via OS keychain, stored here for UI)
  apiKeys: Record<string, string>;
  setApiKey: (provider: string, key: string) => void;
  getApiKey: (provider: string) => string | undefined;

  // Provider/model list from backend
  providers: ProviderInfo[];
  loadProviders: () => Promise<void>;

  // Engine status
  engineStatuses: Record<string, EngineStatus>;
  checkEngineStatus: (engine: string) => Promise<EngineStatus>;

  // Thinking level for Pi engine
  thinkingLevel: "minimal" | "low" | "medium" | "high" | "xhigh";
  setThinkingLevel: (
    level: "minimal" | "low" | "medium" | "high" | "xhigh",
  ) => void;

  // Settings dialog
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}

// ─── Store ───

export const useEngineStore = create<EngineState>()(
  persist(
    (set, get) => ({
      // Active engine
      activeEngine: "claude",
      setActiveEngine: (engine) => {
        log.info(`Switching engine to: ${engine}`);
        set({ activeEngine: engine });
      },

      // Pi-specific settings
      selectedProvider: "anthropic",
      setSelectedProvider: (provider) => {
        log.info(`Selecting provider: ${provider}`);
        set({ selectedProvider: provider });
        // Auto-select first model of the provider
        const providers = get().providers;
        const p = providers.find((p) => p.id === provider);
        if (p && p.models.length > 0) {
          set({ selectedModel: p.models[0].id });
        }
      },

      selectedModel: "claude-sonnet-4-6",
      setSelectedModel: (model) => set({ selectedModel: model }),

      // API keys
      apiKeys: {},
      setApiKey: (provider, key) => {
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: key },
        }));
        // TODO: Persist to OS keychain via Tauri command
      },
      getApiKey: (provider) => get().apiKeys[provider],

      // Provider/model list
      providers: [],
      loadProviders: async () => {
        try {
          const providers = await invoke<ProviderInfo[]>("list_providers");
          log.info(`Loaded ${providers.length} providers`);
          set({ providers });
        } catch (err) {
          log.error("Failed to load providers", { error: String(err) });
        }
      },

      // Engine status
      engineStatuses: {},
      checkEngineStatus: async (engine) => {
        try {
          const status = await invoke<EngineStatus>("check_engine_status", {
            engine,
          });
          set((state) => ({
            engineStatuses: { ...state.engineStatuses, [engine]: status },
          }));
          return status;
        } catch (err) {
          const status: EngineStatus = {
            available: false,
            message: String(err),
          };
          set((state) => ({
            engineStatuses: { ...state.engineStatuses, [engine]: status },
          }));
          return status;
        }
      },

      // Thinking level
      thinkingLevel: "medium",
      setThinkingLevel: (level) => set({ thinkingLevel: level }),

      // Settings dialog
      settingsOpen: false,
      setSettingsOpen: (open) => set({ settingsOpen: open }),
    }),
    {
      name: "claude-prism-engine",
      partialize: (state) => ({
        activeEngine: state.activeEngine,
        selectedProvider: state.selectedProvider,
        selectedModel: state.selectedModel,
        thinkingLevel: state.thinkingLevel,
        apiKeys: state.apiKeys,
      }),
    },
  ),
);
