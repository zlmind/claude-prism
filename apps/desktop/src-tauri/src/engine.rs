use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Emitter, Manager, WebviewWindow};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

// ─── Engine Trait ───

#[derive(Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EngineId {
    Claude,
    Pi,
}

impl std::fmt::Display for EngineId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EngineId::Claude => write!(f, "claude"),
            EngineId::Pi => write!(f, "pi"),
        }
    }
}

#[derive(Clone, serde::Serialize)]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub needs_api_key: bool,
    pub models: Vec<ModelInfo>,
}

#[derive(Clone, serde::Serialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub supports_thinking: bool,
}

#[derive(Clone, serde::Serialize)]
pub struct EngineConfigSchema {
    pub needs_binary: bool,
    pub needs_api_key: bool,
    pub providers: Vec<ProviderInfo>,
    pub needs_auth: bool,
}

#[derive(Clone, serde::Serialize)]
pub struct EngineStatus {
    pub available: bool,
    pub message: String,
}

// ─── Event payloads ───

#[derive(Clone, serde::Serialize)]
pub struct EngineOutputEvent {
    pub engine: String,
    pub tab_id: String,
    pub data: String,
}

#[derive(Clone, serde::Serialize)]
pub struct EngineCompleteEvent {
    pub engine: String,
    pub tab_id: String,
    pub success: bool,
}

#[derive(Clone, serde::Serialize)]
pub struct EngineErrorEvent {
    pub engine: String,
    pub tab_id: String,
    pub data: String,
}

// ─── Process State (shared across engines) ───

#[derive(Clone)]
pub struct EngineProcessState {
    pub processes: Arc<Mutex<HashMap<String, Child>>>,
}

impl Default for EngineProcessState {
    fn default() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

/// Kill all processes for a window label.
pub async fn kill_process_for_window(state: &EngineProcessState, window_label: &str) {
    let mut processes = state.processes.lock().await;
    let prefix = format!("{}:", window_label);
    let keys_to_remove: Vec<String> = processes
        .keys()
        .filter(|k| k.starts_with(&prefix))
        .cloned()
        .collect();
    for key in keys_to_remove {
        if let Some(mut child) = processes.remove(&key) {
            let _ = child.kill().await;
        }
    }
}

// ─── Provider Registry ───

pub fn get_pi_providers() -> Vec<ProviderInfo> {
    vec![
        ProviderInfo {
            id: "anthropic".to_string(),
            name: "Anthropic".to_string(),
            needs_api_key: true,
            models: vec![
                ModelInfo { id: "claude-sonnet-4-6".to_string(), name: "Claude Sonnet 4.6".to_string(), supports_thinking: true },
                ModelInfo { id: "claude-opus-4-6".to_string(), name: "Claude Opus 4.6".to_string(), supports_thinking: true },
                ModelInfo { id: "claude-haiku-3-5".to_string(), name: "Claude Haiku 3.5".to_string(), supports_thinking: false },
            ],
        },
        ProviderInfo {
            id: "openai".to_string(),
            name: "OpenAI".to_string(),
            needs_api_key: true,
            models: vec![
                ModelInfo { id: "gpt-4o".to_string(), name: "GPT-4o".to_string(), supports_thinking: false },
                ModelInfo { id: "gpt-4o-mini".to_string(), name: "GPT-4o Mini".to_string(), supports_thinking: false },
                ModelInfo { id: "o3".to_string(), name: "o3".to_string(), supports_thinking: true },
            ],
        },
        ProviderInfo {
            id: "deepseek".to_string(),
            name: "DeepSeek".to_string(),
            needs_api_key: true,
            models: vec![
                ModelInfo { id: "deepseek-chat".to_string(), name: "DeepSeek Chat".to_string(), supports_thinking: false },
                ModelInfo { id: "deepseek-reasoner".to_string(), name: "DeepSeek Reasoner".to_string(), supports_thinking: true },
            ],
        },
        ProviderInfo {
            id: "google".to_string(),
            name: "Google".to_string(),
            needs_api_key: true,
            models: vec![
                ModelInfo { id: "gemini-2.5-pro".to_string(), name: "Gemini 2.5 Pro".to_string(), supports_thinking: true },
                ModelInfo { id: "gemini-2.5-flash".to_string(), name: "Gemini 2.5 Flash".to_string(), supports_thinking: true },
            ],
        },
    ]
}

// ─── Pi Engine Implementation ───

/// Find node binary on the system.
fn find_node_binary() -> Result<String, String> {
    // Try which first
    if let Ok(path) = which::which("node") {
        return Ok(path.to_string_lossy().to_string());
    }

    // Check common locations
    if let Some(home) = dirs::home_dir() {
        #[cfg(target_os = "windows")]
        {
            let candidates = vec![
                home.join("AppData").join("Local").join("Programs").join("node").join("node.exe"),
                PathBuf::from(r"C:\Program Files\nodejs\node.exe"),
            ];
            for path in candidates {
                if path.exists() {
                    return Ok(path.to_string_lossy().to_string());
                }
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            let candidates = vec![
                home.join(".nvm").join("versions").join("node"),
            ];
            for dir in candidates {
                if dir.exists() {
                    if let Ok(entries) = std::fs::read_dir(&dir) {
                        let mut versions: Vec<PathBuf> = entries
                            .filter_map(|e| e.ok())
                            .map(|e| e.path().join("bin").join("node"))
                            .filter(|p| p.exists())
                            .collect();
                        versions.sort();
                        versions.reverse();
                        if let Some(path) = versions.first() {
                            return Ok(path.to_string_lossy().to_string());
                        }
                    }
                }
            }
            let standard = ["/usr/local/bin/node", "/opt/homebrew/bin/node", "/usr/bin/node"];
            for path in &standard {
                if PathBuf::from(path).exists() {
                    return Ok(path.to_string());
                }
            }
        }
    }

    Err("Node.js not found. Please install Node.js to use Pi Engine.".to_string())
}

/// Find the Pi RPC entry point script.
fn find_pi_rpc_script() -> Result<String, String> {
    // Check if pi is installed globally
    if let Ok(path) = which::which("pi") {
        let pi_dir = path.parent().unwrap_or(std::path::Path::new("/"));
        // Look for rpc-entry.ts relative to pi binary
        let candidates = [
            // npm global: pi -> ../lib/node_modules/@earendil-works/pi/dist/rpc-entry.js
            pi_dir.join("../lib/node_modules/@earendil-works/pi/dist/rpc-entry.js"),
            // Direct in node_modules
            pi_dir.join("node_modules/@earendil-works/pi/dist/rpc-entry.js"),
        ];
        for candidate in &candidates {
            if candidate.exists() {
                return Ok(candidate.canonicalize().map_err(|e| e.to_string())?.to_string_lossy().to_string());
            }
        }
    }

    // Check home directory for local install
    if let Some(home) = dirs::home_dir() {
        let local_path = home.join("node_modules/@earendil-works/pi/dist/rpc-entry.js");
        if local_path.exists() {
            return Ok(local_path.to_string_lossy().to_string());
        }
    }

    Err("Pi Agent Engine not found. Run: npm install -g @earendil-works/pi".to_string())
}

/// Spawn Pi RPC process and stream output via Tauri events.
async fn spawn_pi_process(
    window: WebviewWindow,
    project_path: String,
    prompt: String,
    tab_id: String,
    provider: Option<String>,
    model: Option<String>,
    api_key: Option<String>,
    thinking_level: Option<String>,
) -> Result<(), String> {
    let node_path = find_node_binary()?;
    let rpc_script = find_pi_rpc_script()?;

    let window_label = window.label().to_string();
    let process_key = format!("{}:{}", window_label, tab_id);

    let mut cmd = Command::new(&node_path);
    cmd.arg(&rpc_script);
    cmd.arg("--mode").arg("rpc");
    cmd.current_dir(&project_path);

    // Set API key via environment variable
    if let Some(ref key) = api_key {
        let provider_id = provider.as_deref().unwrap_or("anthropic");
        let env_key = format!("{}_API_KEY", provider_id.to_uppercase().replace('-', "_"));
        cmd.env(&env_key, key);
    }

    // Set provider and model via environment
    if let Some(ref p) = provider {
        cmd.env("PI_PROVIDER", p);
    }
    if let Some(ref m) = model {
        cmd.env("PI_MODEL", m);
    }
    if let Some(ref level) = thinking_level {
        cmd.env("PI_THINKING_LEVEL", level);
    }

    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    cmd.stdin(std::process::Stdio::piped());

    // On Windows, prevent console window flash
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn().map_err(|e| {
        format!("Failed to spawn Pi process: {}. Is Node.js installed?", e)
    })?;

    // Send the prompt as JSON-RPC over stdin
    let prompt_json = serde_json::json!({
        "id": "1",
        "type": "prompt",
        "message": prompt,
        "streamingBehavior": "steer"
    });

    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        let payload = serde_json::to_string(&prompt_json).map_err(|e| e.to_string())?;
        stdin.write_all(payload.as_bytes()).await.map_err(|e| e.to_string())?;
        stdin.write_all(b"\n").await.map_err(|e| e.to_string())?;
        stdin.shutdown().await.map_err(|e| e.to_string())?;
    }

    let stdout = child.stdout.take().ok_or("Failed to capture Pi stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture Pi stderr")?;

    // Get process state
    let process_arc = window
        .state::<EngineProcessState>()
        .inner()
        .processes
        .clone();

    // Store child process
    {
        let mut processes = process_arc.lock().await;
        if let Some(mut existing) = processes.remove(&process_key) {
            let _ = existing.kill().await;
        }
        processes.insert(process_key.clone(), child);
    }

    let stdout_reader = BufReader::new(stdout);
    let stderr_reader = BufReader::new(stderr);

    let start_time = std::time::Instant::now();

    // Spawn stdout streaming task
    let win_stdout = window.clone();
    let tab_id_stdout = tab_id.clone();
    let stdout_task = tokio::spawn(async move {
        let mut lines = stdout_reader.lines();
        let mut line_count: u64 = 0;
        while let Ok(Some(line)) = lines.next_line().await {
            line_count += 1;
            let elapsed = start_time.elapsed().as_secs_f64();
            eprintln!(
                "[pi-stdout] [{}] +{:.1}s #{} len={}",
                tab_id_stdout, elapsed, line_count, line.len()
            );

            let _ = win_stdout.emit(
                "engine-output",
                EngineOutputEvent {
                    engine: "pi".to_string(),
                    tab_id: tab_id_stdout.clone(),
                    data: line,
                },
            );
        }
    });

    // Spawn stderr streaming task
    let win_stderr = window.clone();
    let tab_id_stderr = tab_id.clone();
    let stderr_task = tokio::spawn(async move {
        let mut lines = stderr_reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            eprintln!(
                "[pi-stderr] [{}] +{:.1}s {}",
                tab_id_stderr,
                start_time.elapsed().as_secs_f64(),
                &line[..line.len().min(200)]
            );
            let _ = win_stderr.emit(
                "engine-error",
                EngineErrorEvent {
                    engine: "pi".to_string(),
                    tab_id: tab_id_stderr.clone(),
                    data: line,
                },
            );
        }
    });

    // Spawn wait task
    let process_arc_wait = process_arc.clone();
    let win_wait = window;
    let process_key_wait = process_key;
    let tab_id_wait = tab_id;
    tokio::spawn(async move {
        let _ = stdout_task.await;
        let _ = stderr_task.await;

        let mut processes = process_arc_wait.lock().await;
        let success = if let Some(mut child) = processes.remove(&process_key_wait) {
            match child.wait().await {
                Ok(status) => {
                    eprintln!(
                        "[pi-process] [{}] exited with status={} ({:.1}s)",
                        tab_id_wait,
                        status,
                        start_time.elapsed().as_secs_f64()
                    );
                    status.success()
                }
                Err(e) => {
                    eprintln!(
                        "[pi-process] [{}] wait error: {} ({:.1}s)",
                        tab_id_wait,
                        e,
                        start_time.elapsed().as_secs_f64()
                    );
                    false
                }
            }
        } else {
            false
        };
        drop(processes);

        let _ = win_wait.emit(
            "engine-complete",
            EngineCompleteEvent {
                engine: "pi".to_string(),
                tab_id: tab_id_wait,
                success,
            },
        );
    });

    Ok(())
}

// ─── Tauri Commands ───

#[tauri::command]
pub async fn get_available_engines() -> Result<Vec<EngineConfigSchema>, String> {
    let mut engines = Vec::new();

    // Claude engine
    engines.push(EngineConfigSchema {
        needs_binary: true,
        needs_api_key: false,
        providers: vec![],
        needs_auth: true,
    });

    // Pi engine
    let node_ok = find_node_binary().is_ok();
    let pi_ok = find_pi_rpc_script().is_ok();

    engines.push(EngineConfigSchema {
        needs_binary: false,
        needs_api_key: true,
        providers: get_pi_providers(),
        needs_auth: false,
    });

    Ok(engines)
}

#[tauri::command]
pub async fn check_engine_status(engine: String) -> Result<EngineStatus, String> {
    match engine.as_str() {
        "claude" => {
            // Delegate to existing claude status check
            let status = super::claude::check_claude_status().await?;
            Ok(EngineStatus {
                available: status.installed,
                message: if status.installed {
                    format!("Claude CLI {} available", status.version.unwrap_or_default())
                } else {
                    "Claude CLI not installed".to_string()
                },
            })
        }
        "pi" => {
            let node_ok = find_node_binary();
            let pi_ok = find_pi_rpc_script();

            match (node_ok, pi_ok) {
                (Ok(_), Ok(_)) => Ok(EngineStatus {
                    available: true,
                    message: "Pi Agent Engine ready".to_string(),
                }),
                (Err(e), _) | (_, Err(e)) => Ok(EngineStatus {
                    available: false,
                    message: e,
                }),
            }
        }
        _ => Err(format!("Unknown engine: {}", engine)),
    }
}

#[tauri::command]
pub async fn execute_with_engine(
    window: WebviewWindow,
    engine: String,
    project_path: String,
    prompt: String,
    tab_id: String,
    model: Option<String>,
    provider: Option<String>,
    api_key: Option<String>,
    effort_level: Option<String>,
) -> Result<(), String> {
    match engine.as_str() {
        "pi" => {
            spawn_pi_process(
                window,
                project_path,
                prompt,
                tab_id,
                provider,
                model,
                api_key,
                effort_level,
            )
            .await
        }
        "claude" | _ => {
            // Delegate to existing claude execution
            super::claude::execute_claude_code(
                window,
                project_path,
                prompt,
                tab_id,
                model,
                effort_level,
            )
            .await
        }
    }
}

#[tauri::command]
pub async fn cancel_engine_execution(
    window: WebviewWindow,
    engine: String,
    tab_id: String,
) -> Result<(), String> {
    let window_label = window.label().to_string();
    let process_key = format!("{}:{}", window_label, tab_id);

    if engine == "pi" {
        let engine_state = window.state::<EngineProcessState>();
        let mut processes = engine_state.processes.lock().await;
        if let Some(mut child) = processes.remove(&process_key) {
            let _ = child.kill().await;
            let _ = window.emit(
                "engine-complete",
                EngineCompleteEvent {
                    engine: "pi".to_string(),
                    tab_id,
                    success: false,
                },
            );
        }
        Ok(())
    } else {
        // Delegate to existing claude cancel
        super::claude::cancel_claude_execution(window, tab_id).await
    }
}

#[tauri::command]
pub async fn list_providers() -> Result<Vec<ProviderInfo>, String> {
    Ok(get_pi_providers())
}
