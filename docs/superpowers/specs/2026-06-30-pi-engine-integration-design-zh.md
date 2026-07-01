# Pi Agent 引擎集成设计

**日期：** 2026-06-30
**状态：** 草稿
**作者：** Claude Prism 团队

## 1. 动机

ClaudePrism 目前硬编码 Claude Code CLI 作为唯一 AI 引擎（`claude.rs`）。这限制了用户只能使用单一提供商（Anthropic），并且需要 Claude Pro/Max 订阅。我们需要一个多引擎架构，实现：

- 允许用户自带 API 密钥（支持任意 LLM 提供商）
- 默认提供能力强劲的引擎，无需 Claude 订阅
- 跨提供商支持"深度合成"（深度推理/思考）
- 可扩展，未来可添加新引擎（Codex 等），无需重写核心代码

## 2. 架构概览

### 2.1 引擎抽象层

```
┌────────────────────────────────────────────────────┐
│                  AIEngineManager                     │
│  通过 trait 将命令路由到所选引擎                      │
├──────────────┬──────────────┬──────────────────────┤
│  ClaudeEngine│  PiEngine    │  CodexEngine (未来)   │
│  (现有)      │  (新增，默认)│                       │
└──────┬───────┴──────┬───────┴──────┬───────────────┘
       │              │              │
       ▼              ▼              ▼
┌──────────────────────────────────────────────┐
│              ChildProcessManager               │
│  stdin/stdout JSON 流、生命周期、路由           │
└──────────────────────────────────────────────┘
```

### 2.2 引擎 Trait（Rust）

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

### 2.3 引擎注册

引擎通过静态注册表惰性注册：

```rust
lazy_static! {
    static ref ENGINES: Vec<Box<dyn AIEngine>> = vec![
        Box::new(ClaudeEngine::new()),
        Box::new(PiEngine::new()),  // 默认
        // Box::new(CodexEngine::new()),  // 未来
    ];
}
```

每个引擎独立实现 trait。添加新引擎无需修改现有引擎或管理器。

## 3. Pi 引擎设计

### 3.1 什么是 Pi

Pi（`@earendil-works/pi`）是一个 TypeScript Agent 框架，内置多提供商支持：

| 包名 | 角色 |
|------|------|
| `@earendil-works/pi-ai` | 统一 LLM API —— 30+ 提供商（Anthropic、OpenAI、DeepSeek、Google、小米、ZAI、Minimax-CN、MoonshotAI-CN 等） |
| `@earendil-works/pi-agent-core` | Agent 运行时：工具调用、会话管理、思考抽象 |
| `@earendil-works/pi-coding-agent` | 内置 RPC 模式的 CLI（`pi --mode rpc`） |

### 3.2 RPC 协议（Pi 内置）

Pi 的 `rpc-entry.ts` + `rpc-mode.ts` 提供了基于 stdin/stdout 的完整 JSON-RPC 接口：

```
→ {"id":"1","type":"prompt","message":"Hello","streamingBehavior":"steer"}
← {"type":"text_start","contentIndex":0,"partial":{...}}
← {"type":"text_delta","contentIndex":0,"delta":"Hello!"}
← {"type":"text_end","contentIndex":0,"content":"Hello!"}
← {"id":"1","type":"response","command":"prompt","success":true}
```

Pi 还提供了 `RpcClient` 类，封装了该协议的类型化方法（`prompt()`、`setModel()`、`bash()` 等）。

### 3.3 Pi 引擎实现

Rust 中的 PiEngine：

1. **启动**：生成运行 Pi RPC 入口点的 Node.js 子进程
2. **认证**：通过 `--api-key` 标志或 `PI_*_API_KEY` 环境变量传递用户 API 密钥
3. **执行**：通过 stdin 发送 `{"type":"prompt","message":"..."}` 
4. **流式传输**：从 stdout 读取 JSON 行，将事件作为 Tauri 事件路由到前端
5. **取消**：通过 stdin 发送 `{"type":"abort"}`，或终止进程

```rust
struct PiEngine {
    // 每个标签页/会话惰性生成的 Node.js 进程
    rpc_client: Mutex<HashMap<String, PiRpcProcess>>,
}

impl AIEngine for PiEngine {
    fn id(&self) -> &'static str { "pi" }
    fn display_name(&self) -> String { "Pi Agent Engine" }
    
    async fn execute(&self, window: WebviewWindow, params: EngineExecuteParams) -> Result<()> {
        // 1. 生成 Node.js: node pi-rpc-host.js --mode rpc
        // 2. 发送 prompt JSON-RPC 命令
        // 3. 将 text_delta 事件转发到前端作为 "pi-output"
        // 4. 完成后发出 "pi-complete"
    }
}
```

### 3.4 通信模式

```
[Tauri Rust]                    [Node.js Pi RPC 进程]           [LLM API]
     │                                   │                              │
     │── spawn("node pi-rpc.js") ────────│                              │
     │── {"type":"prompt",...} ──────────→│                              │
     │                                   │── provider.stream() ────────→│
     │← {"type":"text_delta",...} ←──────│← 流事件 ←────────────────────│
     │← {"type":"text_delta",...} ←──────│                              │
     │← {"type":"response",...}   ←──────│← 完成                        │
     │                                   │                              │
     │── {"type":"abort"} ──────────────→│── abort()                    │
     │                                   │                              │
     │── 窗口关闭时 kill ──────────────→│  退出                        │
```

## 4. 前端变更

### 4.1 提供商/引擎设置面板

新增设置界面，允许用户：

- 选择活跃引擎（Claude | Pi）
- Pi：选择提供商（Anthropic、DeepSeek、OpenAI 等）
- Pi：选择模型（从 Pi 的模型注册表自动填充）
- 输入 API 密钥（通过 `tauri-plugin-store` 存储在 OS 密钥链中）
- 测试连接按钮

### 4.2 引擎指示器

聊天输入区域显示当前引擎 + 提供商：

```
Anthropic · claude-sonnet-4-6  [▼]
```

状态栏显示引擎状态：

```
● Pi (Anthropic)  │ ◆ Claude CLI (已连接)
```

### 4.3 API 密钥存储

- **主要**：OS 密钥链（Windows 凭据管理器、macOS 钥匙串）
- **备选**：`~/.claude-prism/credentials.json` 加密文件（AES-256-GCM）
- API 密钥在运行时注入 Pi 的凭据存储；从不以明文形式存储在前端内存中

## 5. 迁移路径（现有 Claude Code 路径）

现有 Claude CLI 路径**完全不变**：

- `execute_claude_code`、`continue_claude_code`、`resume_claude_code` —— 不变
- `find_claude_binary()`、`common_claude_args()` —— 不变
- `ClaudeProcessState` —— 泛化为 `EngineProcessState` 以共享进程跟踪

唯一共享的组件是进程生命周期管理器（为清晰起见重命名）。

## 6. 未来可扩展性：Codex

当需要 Codex 集成时：

1. 为 CodexEngine 实现 `AIEngine` trait
2. 注册到 `ENGINES` vec 中
3. 前端选择器通过 `config_schema()` 自动识别

无需修改现有引擎。无需修改路由层。

## 7. "深度合成"（深度推理）支持

Pi 的 `@earendil-works/pi-ai` 具有成熟的思考抽象：

```typescript
type ThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh";
interface Model<TApi> {
    reasoning: boolean;
    thinkingLevelMap?: Partial<Record<ThinkingLevel, string | null>>;
}
```

这会自动映射到提供商特定的参数（Anthropic `thinking`、OpenAI `reasoning_effort`、DeepSeek `thinking.type` 等）。ClaudePrism 通过 RPC 协议传递思考级别，Pi 处理提供商特定的转换。

## 8. 风险与缓解措施

| 风险 | 缓解措施 |
|------|----------|
| Pi 包体积（~50-80MB 含 Node.js） | 捆绑 `node.exe` 最小运行时或使用 `bun build --compile` 生成单文件；首次运行下载 |
| Pi 用 TypeScript 编写，需要 Node.js | 随应用分发 `node` 二进制文件（VS Code 模式）；或将 Pi 预编译为独立二进制文件 |
| 双引擎维护负担 | 引擎 trait 确保清晰边界；引擎特定 bug 不跨越接口 |
| Pi RPC 进程崩溃恢复 | 健康检查心跳；崩溃时自动重启；向前端发出错误事件 |
| Node.js 子进程内存开销 | 首次使用 Pi 时惰性生成；窗口关闭时终止；通过 `EngineProcessState` 管理 |
| Pi 缺少权限系统 | ClaudePrism 已处理权限；Pi 使用继承的 OS 级权限运行 |

## 9. 实现阶段

### 阶段 1：引擎 trait + Pi 集成
- 在 Rust 中定义 `AIEngine` trait
- 实现带 Node.js 子进程管理的 `PiEngine`
- Pi RPC 桥接 prompt/response/abort 流
- 前端引擎选择器（基础版）

### 阶段 2：设置与密钥管理
- 提供商/模型设置界面
- OS 密钥链中的 API 密钥存储
- 提供商自动检测（哪些提供商已配置密钥）

### 阶段 3：深度功能
- UI 中的思考级别控制
- Pi 会话管理（列出/恢复会话）
- 模型列表浏览器（从 Pi 获取可用模型）

### 阶段 4：打磨
- 状态栏指示器
- 引擎健康监控
- 性能对比
- 文档
