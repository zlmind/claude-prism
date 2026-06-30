# Pi Agent Engine Integration Design

**Date:** 2026-06-30
**Status:** Draft
**Authors:** Claude Prism Team

## 1. Motivation

ClaudePrism currently hardcodes Claude Code CLI as its sole AI engine (`claude.rs`). This limits users to a single provider (Anthropic) and requires a Claude Pro/Max subscription. We need a multi-engine architecture that:

- Lets users bring their own API keys (ANY LLM provider)
- Defaults to a capable engine without requiring a Claude subscription
- Supports "深度合成" (deep reasoning/thinking) across providers
- Is extensible for future engines (Codex, etc.) without rewriting core code

## 2. Architecture Overview

### 2.1 Engine Abstraction Layer

```
┌────────────────────────────────────────────────────┐
│                  AIEngineManager                     │
│  Routes commands to the selected engine via trait   │
├──────────────┬──────────────┬──────────────────────┤
│  ClaudeEngine│  PiEngine    │  CodexEngine (future) │
│  (existing)  │  (new, def.) │                       │
└──────┬───────┴──────┬───────┴──────┬───────────────┘
       │              │              │
       ▼              ▼              ▼
┌──────────────────────────────────────────────┐
│              ChildProcessManager               │
│  stdin/stdout JSON streaming, lifecycle, route │
└──────────────────────────────────────────────┘
```

### 2.2 Engine Trait (Rust)

```rust
#[async_trait]
trait AIEngine: Send + Sync {
    fn id(&self) -> &'static str;
    fn display_name(&self) -> String;
    async fn check_status(&self) -> EngineStatus;
    async fn execute(&self, window: WebviewWindow, params: EngineExecuteParams) -> Result<()>;
    async fn r#continue(&self, window: WebviewWindow, params: EngineContinueParams) -> Result<()>;
    async fn cancel(&self, window: WebviewWindow, tab_id: String) -> Result<()>;
    fn config_schema(&self) -> EngineConfigSchema;
}

struct EngineExecuteParams {
    pub project_path: String,
    pub prompt: String,
    pub tab_id: String,
    pub model: Option<String>,
    pub api_key: Option<String>,
    pub provider: Option<String>,
    pub effort_level: Option<String>,
}

struct EngineConfigSchema {
    pub needs_binary: bool,
    pub needs_api_key: bool,
    pub providers: Vec<ProviderInfo>,
    pub needs_auth: bool,
}
```

### 2.3 Engine Registration

Engines are lazily registered in a static registry:

```rust
lazy_static! {
    static ref ENGINES: Vec<Box<dyn AIEngine>> = vec![
        Box::new(ClaudeEngine::new()),
        Box::new(PiEngine::new()),  // default
        // Box::new(CodexEngine::new()),  // future
    ];
}
```

Each engine implements the trait independently. Adding a new engine requires zero changes to existing engines or the manager.

## 3. Pi Engine Design

### 3.1 What is Pi

Pi (`@earendil-works/pi`) is a TypeScript agent framework with built-in multi-provider support:

| Package | Role |
|---------|------|
| `@earendil-works/pi-ai` | Unified LLM API — 30+ providers (Anthropic, OpenAI, DeepSeek, Google, Xiaomi, ZAI, Minimax-CN, MoonshotAI-CN, etc.) |
| `@earendil-works/pi-agent-core` | Agent runtime: tool calling, session management, thinking abstraction |
| `@earendil-works/pi-coding-agent` | CLI with built-in RPC mode (`pi --mode rpc`) |

### 3.2 RPC Protocol (Already Built in Pi)

Pi's `rpc-entry.ts` + `rpc-mode.ts` provide a complete JSON-RPC interface over stdin/stdout:

```
→ {"id":"1","type":"prompt","message":"Hello","streamingBehavior":"steer"}
← {"type":"text_start","contentIndex":0,"partial":{...}}
← {"type":"text_delta","contentIndex":0,"delta":"Hello!"}
← {"type":"text_end","contentIndex":0,"content":"Hello!"}
← {"id":"1","type":"response","command":"prompt","success":true}
```

Pi also ships an `RpcClient` class that wraps this protocol with typed methods (`prompt()`, `setModel()`, `bash()`, etc.).

### 3.3 Pi Engine Implementation

The PiEngine in Rust:

1. **Startup**: Spawns Node.js subprocess running Pi's RPC entry point
2. **Auth**: Passes user API key via `--api-key` flag or `PI_*_API_KEY` env vars
3. **Execute**: Sends `{"type":"prompt","message":"..."}` over stdin
4. **Stream**: Reads JSON lines from stdout, routes events to frontend as Tauri events
5. **Cancel**: Sends `{"type":"abort"}` over stdin, or kills the process

```rust
struct PiEngine {
    // Lazily spawned Node.js process per tab/session
    rpc_client: Mutex<HashMap<String, PiRpcProcess>>,
}

impl AIEngine for PiEngine {
    fn id(&self) -> &'static str { "pi" }
    fn display_name(&self) -> String { "Pi Agent Engine" }
    
    async fn execute(&self, window: WebviewWindow, params: EngineExecuteParams) -> Result<()> {
        // 1. Spawn Node.js: node pi-rpc-host.js --mode rpc
        // 2. Send prompt JSON-RPC command
        // 3. Forward text_delta events to frontend as "pi-output"
        // 4. On completion emit "pi-complete"
    }
}
```

### 3.4 Communication Pattern

```
[Tauri Rust]                    [Node.js Pi RPC Process]           [LLM API]
     │                                   │                              │
     │── spawn("node pi-rpc.js") ────────│                              │
     │── {"type":"prompt",...} ──────────→│                              │
     │                                   │── provider.stream() ────────→│
     │← {"type":"text_delta",...} ←──────│← stream events ←────────────│
     │← {"type":"text_delta",...} ←──────│                              │
     │← {"type":"response",...}   ←──────│← done                       │
     │                                   │                              │
     │── {"type":"abort"} ──────────────→│── abort()                    │
     │                                   │                              │
     │── kill on window close ──────────→│  exit                        │
```

## 4. Frontend Changes

### 4.1 Provider/Engine Settings Panel

New settings UI allowing users to:

- Select active engine (Claude | Pi)
- For Pi: select provider (Anthropic, DeepSeek, OpenAI, etc.)
- For Pi: select model (auto-populated from Pi's model registry)
- Enter API key (stored in OS keychain via `tauri-plugin-store`)
- Test connection button

### 4.2 Engine Indicator

Chat composer area shows current engine + provider:

```
Anthropic · claude-sonnet-4-6  [▼]
```

Status bar shows engine state:

```
● Pi (Anthropic)  │ ◆ Claude CLI (connected)
```

### 4.3 API Key Storage

- **Primary**: OS keychain (Windows Credential Manager, macOS Keychain)
- **Fallback**: Encrypted file at `~/.claude-prism/credentials.json` (AES-256-GCM)
- API key is injected into Pi's credential store at runtime; never stored in plaintext or frontend memory

## 5. Migration Path (Existing Claude Code Path)

The existing Claude CLI path remains **completely untouched**:

- `execute_claude_code`, `continue_claude_code`, `resume_claude_code` — unchanged
- `find_claude_binary()`, `common_claude_args()` — unchanged
- `ClaudeProcessState` — generalized to `EngineProcessState` to share process tracking

The only shared component is the process lifecycle manager (renamed for clarity).

## 6. Future Extensibility: Codex

When Codex integration is needed:

1. Implement `AIEngine` trait for CodexEngine
2. Register in `ENGINES` vec
3. Frontend selector auto-picks it up via `config_schema()`

No changes to existing engines. No changes to the routing layer.

## 7. "深度合成" (Deep Synthesis) Support

Pi's `@earendil-works/pi-ai` has a mature thinking abstraction:

```typescript
type ThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh";
interface Model<TApi> {
    reasoning: boolean;
    thinkingLevelMap?: Partial<Record<ThinkingLevel, string | null>>;
}
```

This maps to provider-specific parameters (Anthropic `thinking`, OpenAI `reasoning_effort`, DeepSeek `thinking.type`, etc.) automatically. ClaudePrism passes the thinking level through the RPC protocol and Pi handles the provider-specific translation.

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Pi bundle size (~50-80MB with Node.js) | Bundle `node.exe` minimal runtime or use `bun build --compile` for single binary; first-run download |
| Pi written in TypeScript, requires Node.js | Ship `node` binary alongside app (VS Code pattern); or pre-compile Pi to standalone binary |
| Dual-engine maintenance burden | Engine trait ensures clear boundaries; engine-specific bugs don't cross the interface |
| Pi RPC process crash recovery | Health-check heartbeat; auto-restart on crash; emit error event to frontend |
| Node.js subprocess memory overhead | Lazy spawn on first Pi use; kill on window close; manage via `EngineProcessState` |
| Pi lacks permission system | ClaudePrism already handles permissions; Pi runs with inherited OS-level permissions |

## 9. Implementation Phases

### Phase 1: Engine Trait + Pi Integration
- Define `AIEngine` trait in Rust
- Implement `PiEngine` with Node.js subprocess management
- Pi RPC bridge for prompt/response/abort streaming
- Frontend engine selector (basic)

### Phase 2: Settings & Key Management
- Provider/model settings UI
- API key storage in OS keychain
- Provider auto-detection (which providers have keys configured)

### Phase 3: Deep Features
- Thinking level controls in UI
- Pi session management (list/resume sessions)
- Model list browser (fetch available models from Pi)

### Phase 4: Polish
- Status bar indicators
- Engine health monitoring
- Performance comparisons
- Documentation
