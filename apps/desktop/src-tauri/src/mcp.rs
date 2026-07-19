use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

// ─── MCP Types ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServer {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub enabled: bool,
    pub r#type: String, // "global" or "project"
    pub tools: Vec<String>,
    pub author: Option<String>,
    pub homepage: Option<String>,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub config: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpMarketplaceItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub author: String,
    pub homepage: Option<String>,
    pub downloads: u64,
    pub rating: f64,
    pub tags: Vec<String>,
    pub featured: bool,
    pub installer: Option<String>, // "npm", "pip", "cargo", "go"
    pub install_command: Option<String>,
    pub config_template: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpStatus {
    pub installed: bool,
    pub servers: Vec<McpServer>,
    pub error: Option<String>,
}

// ─── Mock Marketplace Data ───

fn get_marketplace_data() -> Vec<McpMarketplaceItem> {
    vec![
        McpMarketplaceItem {
            id: "filesystem".to_string(),
            name: "Filesystem".to_string(),
            description: "Access and manipulate the local filesystem with enhanced capabilities".to_string(),
            version: "1.0.0".to_string(),
            author: "ModelContext".to_string(),
            homepage: Some("https://github.com/modelcontextprotocol/servers".to_string()),
            downloads: 15000,
            rating: 4.8,
            tags: vec!["filesystem".to_string(), "productivity".to_string(), "official".to_string()],
            featured: true,
            installer: Some("npm".to_string()),
            install_command: Some("npx -y @modelcontextprotocol/server-filesystem".to_string()),
            config_template: None,
        },
        McpMarketplaceItem {
            id: "github".to_string(),
            name: "GitHub".to_string(),
            description: "Interact with GitHub repositories, issues, pull requests, and actions".to_string(),
            version: "1.0.0".to_string(),
            author: "ModelContext".to_string(),
            homepage: Some("https://github.com/modelcontextprotocol/servers".to_string()),
            downloads: 12000,
            rating: 4.7,
            tags: vec!["github".to_string(), "development".to_string(), "git".to_string()],
            featured: true,
            installer: Some("npm".to_string()),
            install_command: Some("npx -y @modelcontextprotocol/server-github".to_string()),
            config_template: None,
        },
        McpMarketplaceItem {
            id: "sqlite".to_string(),
            name: "SQLite".to_string(),
            description: "Query and manage SQLite databases".to_string(),
            version: "1.0.0".to_string(),
            author: "ModelContext".to_string(),
            homepage: Some("https://github.com/modelcontextprotocol/servers".to_string()),
            downloads: 8500,
            rating: 4.6,
            tags: vec!["database".to_string(), "sqlite".to_string(), "query".to_string()],
            featured: false,
            installer: Some("npm".to_string()),
            install_command: Some("npx -y @modelcontextprotocol/server-sqlite".to_string()),
            config_template: None,
        },
        McpMarketplaceItem {
            id: "postgres".to_string(),
            name: "PostgreSQL".to_string(),
            description: "Connect and query PostgreSQL databases".to_string(),
            version: "1.0.0".to_string(),
            author: "ModelContext".to_string(),
            homepage: Some("https://github.com/modelcontextprotocol/servers".to_string()),
            downloads: 7200,
            rating: 4.5,
            tags: vec!["database".to_string(), "postgresql".to_string(), "sql".to_string()],
            featured: false,
            installer: Some("npm".to_string()),
            install_command: Some("npx -y @modelcontextprotocol/server-postgres".to_string()),
            config_template: None,
        },
        McpMarketplaceItem {
            id: "brave-search".to_string(),
            name: "Brave Search".to_string(),
            description: "Search the web using Brave's private search API".to_string(),
            version: "1.0.0".to_string(),
            author: "ModelContext".to_string(),
            homepage: Some("https://github.com/modelcontextprotocol/servers".to_string()),
            downloads: 9500,
            rating: 4.4,
            tags: vec!["search".to_string(), "web".to_string(), "api".to_string()],
            featured: true,
            installer: Some("npm".to_string()),
            install_command: Some("npx -y @modelcontextprotocol/server-brave-search".to_string()),
            config_template: None,
        },
        McpMarketplaceItem {
            id: "puppeteer".to_string(),
            name: "Puppeteer".to_string(),
            description: "Automate web browsers and extract content from websites".to_string(),
            version: "1.0.0".to_string(),
            author: "ModelContext".to_string(),
            homepage: Some("https://github.com/modelcontextprotocol/servers".to_string()),
            downloads: 6800,
            rating: 4.3,
            tags: vec!["browser".to_string(), "automation".to_string(), "scraping".to_string()],
            featured: false,
            installer: Some("npm".to_string()),
            install_command: Some("npx -y @modelcontextprotocol/server-puppeteer".to_string()),
            config_template: None,
        },
        McpMarketplaceItem {
            id: "slack".to_string(),
            name: "Slack".to_string(),
            description: "Interact with Slack workspaces, channels, and messages".to_string(),
            version: "1.0.0".to_string(),
            author: "ModelContext".to_string(),
            homepage: Some("https://github.com/modelcontextprotocol/servers".to_string()),
            downloads: 4500,
            rating: 4.2,
            tags: vec!["slack".to_string(), "communication".to_string(), "api".to_string()],
            featured: false,
            installer: Some("npm".to_string()),
            install_command: Some("npx -y @modelcontextprotocol/server-slack".to_string()),
            config_template: None,
        },
        McpMarketplaceItem {
            id: "exa".to_string(),
            name: "Exa".to_string(),
            description: "AI-powered search API for intelligent web research".to_string(),
            version: "1.0.0".to_string(),
            author: "ModelContext".to_string(),
            homepage: Some("https://github.com/modelcontextprotocol/servers".to_string()),
            downloads: 3200,
            rating: 4.1,
            tags: vec!["search".to_string(), "ai".to_string(), "research".to_string()],
            featured: false,
            installer: Some("npm".to_string()),
            install_command: Some("npx -y @modelcontextprotocol/server-exa".to_string()),
            config_template: None,
        },
    ]
}

// ─── File Path Helpers ───

fn get_mcp_config_path(global: bool, project_path: Option<&str>) -> Result<PathBuf, String> {
    if global {
        // Try Claude's main config file first
        let home_dir = dirs::home_dir()
            .ok_or_else(|| "Failed to get home directory".to_string())?;

        let claude_config = home_dir.join(".claude.json");
        if claude_config.exists() {
            return Ok(claude_config);
        }

        // Fallback to other possible locations
        let possible_paths = vec![
            // App data location
            dirs::config_dir()
                .map(|p| p.join("claude-paper").join("mcp.json")),
            // Alternative app data location
            dirs::data_dir()
                .map(|p| p.join("claude-paper").join("mcp.json")),
        ];

        for path_option in possible_paths {
            if let Some(path) = path_option {
                if path.exists() {
                    return Ok(path);
                }
            }
        }

        // If none exist, return the Claude config for creation
        Ok(claude_config)
    } else {
        // Project-specific MCP config path
        let project_root = project_path
            .ok_or_else(|| "Project path required for project MCP config".to_string())?;
        let mut path = PathBuf::from(project_root);
        path.push(".claudepaper");
        path.push("mcp.json");
        Ok(path)
    }
}

fn load_installed_mcps(global: bool, project_path: Option<&str>) -> Result<Vec<McpServer>, String> {
    let config_path = get_mcp_config_path(global, project_path)?;

    eprintln!("DEBUG: Loading MCP from: {:?}", config_path);
    eprintln!("DEBUG: Config exists: {}", config_path.exists());

    if !config_path.exists() {
        eprintln!("DEBUG: Config file does not exist, returning empty list");
        return Ok(vec![]);
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read MCP config: {}", e))?;

    eprintln!("DEBUG: Config content length: {} bytes", content.len());

    let config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse MCP config: {}", e))?;

    // Try both "mcpServers" and "mcpServers" formats
    let servers = config.get("mcpServers")
        .or_else(|| config.get("mcpServers"))
        .and_then(|v| v.as_object())
        .ok_or_else(|| "Invalid MCP config format".to_string())?;

    eprintln!("DEBUG: Found {} MCP servers in config", servers.len());
    eprintln!("DEBUG: MCP server IDs: {:?}", servers.keys().collect::<Vec<_>>());

    let mut result = Vec::new();
    for (id, server_config) in servers {
        let server_obj = server_config.as_object()
            .ok_or_else(|| format!("Invalid server config for {}", id))?;

        let _command = server_obj.get("command")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");

        let _args = server_obj.get("args")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter()
                .filter_map(|v| v.as_str())
                .map(|s| s.to_string())
                .collect::<Vec<_>>()
                .join(" "))
            .unwrap_or_default();

        // Extract server name and description from ID or command
        let name = if id.contains("chrome-devtools") {
            "Chrome DevTools".to_string()
        } else if id.contains("openpets") {
            "OpenPets".to_string()
        } else if id.contains("filesystem") {
            "Filesystem".to_string()
        } else if id.contains("github") {
            "GitHub".to_string()
        } else if id.contains("sqlite") {
            "SQLite".to_string()
        } else if id.contains("postgres") {
            "PostgreSQL".to_string()
        } else if id.contains("brave") || id.contains("tavily") {
            if id.contains("tavily") {
                "Tavily Search".to_string()
            } else {
                "Brave Search".to_string()
            }
        } else if id.contains("puppeteer") {
            "Puppeteer".to_string()
        } else if id.contains("slack") {
            "Slack".to_string()
        } else if id.contains("knowledge") || id.contains("backend") {
            "Knowledge Base".to_string()
        } else {
            // Use the original ID as name (supports Chinese and other characters)
            id.clone()
        };

        let description = if name == "OpenPets" {
            "OpenPets - 虚拟宠物管理MCP服务器".to_string()
        } else if name == "Chrome DevTools" {
            "Chrome DevTools - 浏览器开发者工具MCP服务器".to_string()
        } else if name == "Knowledge Base" {
            "Knowledge Base - 知识库后端服务器".to_string()
        } else if name == "Tavily Search" {
            "Tavily Search - AI搜索MCP服务器".to_string()
        } else {
            format!("{} MCP server", name)
        };

        let version = server_obj.get("version")
            .and_then(|v| v.as_str())
            .unwrap_or("1.0.0")
            .to_string();

        let enabled = server_obj.get("disabled")
            .and_then(|v| v.as_bool())
            .map(|d| !d)
            .unwrap_or(true);

        let tools = server_obj.get("tools")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter()
                .filter_map(|v| v.as_str())
                .map(|s| s.to_string())
                .collect())
            .unwrap_or_default();

        let env: std::collections::HashMap<String, serde_json::Value> = server_obj.get("env")
            .and_then(|v| v.as_object())
            .map(|obj| obj.iter()
                .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), serde_json::Value::String(s.to_string()))))
                .collect())
            .unwrap_or_default();

        let command = server_obj.get("command")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let args = server_obj.get("args")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter()
                .filter_map(|v| v.as_str())
                .map(|s| s.to_string())
                .collect::<Vec<_>>());

        result.push(McpServer {
            id: id.clone(),
            name,
            description,
            version,
            enabled,
            r#type: if global { "global".to_string() } else { "project".to_string() },
            tools,
            author: Some("ModelContext".to_string()),
            homepage: Some("https://github.com/modelcontextprotocol/servers".to_string()),
            command,
            args,
            config: if env.is_empty() { None } else { Some(env) },
        });
    }

    Ok(result)
}

fn save_installed_mcps(global: bool, project_path: Option<&str>, servers: &[McpServer]) -> Result<(), String> {
    let config_path = get_mcp_config_path(global, project_path)?;

    // Create parent directory if it doesn't exist
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create MCP config directory: {}", e))?;
    }

    // Read existing config if it exists
    let mut existing_config = if config_path.exists() {
        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read existing config: {}", e))?;
        serde_json::from_str::<serde_json::Value>(&content)
            .map_err(|e| format!("Failed to parse existing config: {}", e))?
    } else {
        serde_json::Value::Object(serde_json::Map::new())
    };

    // Convert servers to MCP config format
    let mut mcp_servers = serde_json::Map::new();

    for server in servers {
        let mut server_obj = serde_json::Map::new();

        // Add command (use actual command if available, otherwise fallback to default format)
        if let Some(command) = &server.command {
            server_obj.insert("command".to_string(), serde_json::Value::String(command.clone()));
        } else {
            server_obj.insert("command".to_string(), serde_json::Value::String(
                format!("npx -y @modelcontextprotocol/server-{}", server.id)
            ));
        }

        // Add args if present
        if let Some(args) = &server.args {
            if !args.is_empty() {
                server_obj.insert("args".to_string(), serde_json::Value::Array(
                    args.iter().map(|a| serde_json::Value::String(a.clone())).collect()
                ));
            }
        }

        // Add disabled status
        server_obj.insert("disabled".to_string(), serde_json::Value::Bool(!server.enabled));

        // Add tools if present
        if !server.tools.is_empty() {
            server_obj.insert("tools".to_string(), serde_json::Value::Array(
                server.tools.iter().map(|t| serde_json::Value::String(t.clone())).collect()
            ));
        }

        // Add env/config if present
        if let Some(config) = &server.config {
            if !config.is_empty() {
                // Convert HashMap to serde_json::Map
                let map: serde_json::Map<String, serde_json::Value> = config.iter()
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect();
                server_obj.insert("env".to_string(), serde_json::Value::Object(map));
            }
        }

        mcp_servers.insert(server.id.clone(), serde_json::Value::Object(server_obj));
    }

    // Update the existing config with the new mcpServers
    if let Some(obj) = existing_config.as_object_mut() {
        obj.insert("mcpServers".to_string(), serde_json::Value::Object(mcp_servers));
    }

    let content = serde_json::to_string_pretty(&existing_config)
        .map_err(|e| format!("Failed to serialize MCP config: {}", e))?;

    fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write MCP config: {}", e))?;

    Ok(())
}

// ─── URL Installation Support ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpUrlInstallRequest {
    pub id: String,
    pub name: String,
    pub description: String,
    pub url: String,
    pub command: String,
    pub args: Option<Vec<String>>,
    pub env: Option<std::collections::HashMap<String, String>>,
}

// ─── Tauri Commands ───

#[tauri::command]
pub fn check_mcp_installed(
    project_path: Option<String>,
) -> Result<McpStatus, String> {
    eprintln!("DEBUG: check_mcp_installed called with project_path: {:?}", project_path);

    let global_servers = load_installed_mcps(true, None)?;
    eprintln!("DEBUG: Loaded {} global MCP servers", global_servers.len());

    let project_servers = if let Some(ref path) = project_path {
        load_installed_mcps(false, Some(path))?
    } else {
        vec![]
    };
    eprintln!("DEBUG: Loaded {} project MCP servers", project_servers.len());

    let all_servers = [global_servers, project_servers].concat();
    eprintln!("DEBUG: Total MCP servers to return: {}", all_servers.len());
    eprintln!("DEBUG: Total MCP server IDs: {:?}", all_servers.iter().map(|s| &s.id).collect::<Vec<_>>());

    Ok(McpStatus {
        installed: !all_servers.is_empty(),
        servers: all_servers,
        error: None,
    })
}

#[tauri::command]
pub fn fetch_mcp_marketplace() -> Result<Vec<McpMarketplaceItem>, String> {
    Ok(get_marketplace_data())
}

#[tauri::command]
pub async fn install_mcp_server(
    _app: AppHandle,
    item_id: String,
    install_command: String,
    project_path: Option<String>,
) -> Result<(), String> {
    // Find the item in marketplace
    let marketplace = get_marketplace_data();
    let item = marketplace
        .iter()
        .find(|i| i.id == item_id)
        .ok_or_else(|| format!("MCP item {} not found in marketplace", item_id))?;

    // Determine if this is global or project installation
    let global = project_path.is_none();

    // Load existing servers
    let mut servers = load_installed_mcps(global, project_path.as_deref())?;

    // Check if already installed
    if servers.iter().any(|s| s.id == item_id) {
        return Err(format!("{} is already installed", item.name));
    }

    // Install the MCP server using the install command
    eprintln!("Installing MCP server {} with command: {}", item.name, install_command);

    // Execute the install command
    let install_result = if std::env::consts::OS == "windows" {
        tokio::process::Command::new("cmd")
            .args(["/C", &install_command])
            .output()
            .await
    } else {
        tokio::process::Command::new("sh")
            .arg("-c")
            .arg(&install_command)
            .output()
            .await
    };

    match install_result {
        Ok(output) => {
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("Installation failed: {}", stderr));
            }
            eprintln!("Installation output: {}", String::from_utf8_lossy(&output.stdout));
        }
        Err(e) => {
            return Err(format!("Failed to execute install command: {}", e));
        }
    }

    // Add the new server
    let new_server = McpServer {
        id: item.id.clone(),
        name: item.name.clone(),
        description: item.description.clone(),
        version: item.version.clone(),
        enabled: true,
        r#type: if global { "global".to_string() } else { "project".to_string() },
        tools: vec![],
        author: Some(item.author.clone()),
        homepage: item.homepage.clone(),
        command: Some(format!("npx -y @modelcontextprotocol/server-{}", item.id)),
        args: None,
        config: item.config_template.clone(),
    };

    servers.push(new_server);

    // Save the updated server list
    save_installed_mcps(global, project_path.as_deref(), &servers)?;

    eprintln!("Successfully installed MCP server: {}", item.name);
    Ok(())
}

#[tauri::command]
pub fn toggle_mcp_server(
    server_id: String,
    enabled: bool,
    project_path: Option<String>,
) -> Result<(), String> {
    let global = project_path.is_none();

    // Load existing servers
    let mut servers = load_installed_mcps(global, project_path.as_deref())?;

    // Find and toggle the server
    let server = servers
        .iter_mut()
        .find(|s| s.id == server_id)
        .ok_or_else(|| format!("Server {} not found", server_id))?;

    server.enabled = enabled;

    // Save the updated server list
    save_installed_mcps(global, project_path.as_deref(), &servers)?;

    Ok(())
}

#[tauri::command]
pub fn remove_mcp_server(
    server_id: String,
    project_path: Option<String>,
) -> Result<(), String> {
    let global = project_path.is_none();

    // Load existing servers
    let mut servers = load_installed_mcps(global, project_path.as_deref())?;

    // Remove the server
    let original_len = servers.len();
    servers.retain(|s| s.id != server_id);

    if servers.len() == original_len {
        return Err(format!("Server {} not found", server_id));
    }

    // Save the updated server list
    save_installed_mcps(global, project_path.as_deref(), &servers)?;

    Ok(())
}

#[tauri::command]
pub async fn install_mcp_from_url(
    request: McpUrlInstallRequest,
    project_path: Option<String>,
) -> Result<(), String> {
    let global = project_path.is_none();

    // Load existing servers
    let mut servers = load_installed_mcps(global, project_path.as_deref())?;

    // Use the provided ID
    let id = request.id.trim();

    // Validate ID format
    if id.is_empty() {
        return Err("Server ID cannot be empty".to_string());
    }

    // Check if already installed
    if servers.iter().any(|s| s.id == id) {
        return Err(format!("Server {} is already installed", id));
    }

    // Skip installation - just save the configuration
    eprintln!("Adding MCP server {} with command: {}", request.name, request.command);

    // Add the new server
    let new_server = McpServer {
        id: id.to_string(),
        name: request.name.clone(),
        description: request.description.clone(),
        version: "1.0.0".to_string(),
        enabled: true,
        r#type: if global { "global".to_string() } else { "project".to_string() },
        tools: vec![],
        author: None,
        homepage: Some(request.url.clone()),
        command: Some(request.command.clone()),
        args: request.args.clone(),
        config: request.env
            .map(|env_map| env_map.into_iter()
                .map(|(k, v)| (k, serde_json::Value::String(v)))
                .collect::<std::collections::HashMap<_, _>>())
            .filter(|map| !map.is_empty()),
    };

    servers.push(new_server);

    // Save the updated server list
    save_installed_mcps(global, project_path.as_deref(), &servers)?;

    eprintln!("Successfully installed MCP server: {}", request.name);
    Ok(())
}