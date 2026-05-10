use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use walkdir::WalkDir;

// ── Types ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FsEntry>>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct SessionState {
    pub project_path: Option<String>,
    pub open_files: Vec<String>,
    pub active_file: Option<String>,
    pub sidebar: Option<String>,
    pub bottom_pane: Option<String>,
    pub editor_prefs: Option<serde_json::Value>,
}

struct WatcherState {
    _watcher: Option<notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>>,
}

// ── Helpers ──

fn session_file_path() -> PathBuf {
    let data_dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.venugopal.pystudio");
    fs::create_dir_all(&data_dir).ok();
    data_dir.join("session.json")
}

fn is_hidden_or_ignored(name: &str) -> bool {
    name.starts_with('.')
        || name == "node_modules"
        || name == "__pycache__"
        || name == "target"
        || name == ".git"
        || name == "dist"
        || name == "build"
        || name == ".venv"
        || name == "venv"
        || name == "env"
}

fn build_tree(dir: &Path, max_depth: usize, current_depth: usize) -> Vec<FsEntry> {
    let mut entries: Vec<FsEntry> = Vec::new();

    let read = match fs::read_dir(dir) {
        Ok(r) => r,
        Err(_) => return entries,
    };

    let mut items: Vec<_> = read.filter_map(|e| e.ok()).collect();
    items.sort_by(|a, b| {
        let a_is_dir = a.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let b_is_dir = b.file_type().map(|t| t.is_dir()).unwrap_or(false);
        match (a_is_dir, b_is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.file_name().cmp(&b.file_name()),
        }
    });

    for item in items {
        let name = item.file_name().to_string_lossy().to_string();
        if is_hidden_or_ignored(&name) {
            continue;
        }
        let path = item.path();
        let is_dir = path.is_dir();
        let children = if is_dir && current_depth < max_depth {
            Some(build_tree(&path, max_depth, current_depth + 1))
        } else if is_dir {
            Some(Vec::new())
        } else {
            None
        };
        entries.push(FsEntry {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir,
            children,
        });
    }

    entries
}

// ── Commands ──

#[tauri::command]
fn read_directory(path: String) -> Result<Vec<FsEntry>, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    if !p.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }
    Ok(build_tree(p, 20, 0))
}

#[tauri::command]
fn read_file_content(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
fn write_file_content(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent dirs: {}", e))?;
    }
    fs::write(&path, content).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[tauri::command]
fn create_directory(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("Failed to create directory: {}", e))
}

#[tauri::command]
fn create_file(path: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent dirs: {}", e))?;
    }
    if !Path::new(&path).exists() {
        fs::write(&path, "").map_err(|e| format!("Failed to create file: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| format!("Failed to delete directory: {}", e))
    } else {
        fs::remove_file(&path).map_err(|e| format!("Failed to delete file: {}", e))
    }
}

#[tauri::command]
fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path)
        .map_err(|e| format!("Failed to rename {} to {}: {}", old_path, new_path, e))
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
fn get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine home directory".to_string())
}

#[tauri::command]
fn list_recent_dirs() -> Result<Vec<String>, String> {
    let session = load_session()?;
    // Return just the project path as a recent if it exists
    if let Some(p) = session.project_path {
        if Path::new(&p).exists() {
            return Ok(vec![p]);
        }
    }
    Ok(vec![])
}

// ── Session persistence ──

#[tauri::command]
fn save_session(state: SessionState) -> Result<(), String> {
    let path = session_file_path();
    let json = serde_json::to_string_pretty(&state)
        .map_err(|e| format!("Failed to serialize session: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Failed to write session: {}", e))
}

#[tauri::command]
fn load_session() -> Result<SessionState, String> {
    let path = session_file_path();
    if !path.exists() {
        return Ok(SessionState::default());
    }
    let data = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read session: {}", e))?;
    serde_json::from_str(&data).map_err(|e| format!("Failed to parse session: {}", e))
}

#[tauri::command]
fn clear_session() -> Result<(), String> {
    let path = session_file_path();
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Failed to clear session: {}", e))?;
    }
    Ok(())
}

// ── File watcher ──

#[tauri::command]
fn watch_directory(path: String, app: AppHandle) -> Result<(), String> {
    let watcher_state = app.state::<Mutex<WatcherState>>();
    let mut state = watcher_state.lock().map_err(|e| e.to_string())?;

    let app_handle = app.clone();
    let watch_path = path.clone();

    let debouncer = new_debouncer(
        Duration::from_millis(500),
        move |result: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
            match result {
                Ok(events) => {
                    let changed_paths: Vec<String> = events
                        .iter()
                        .filter(|e| e.kind == DebouncedEventKind::Any)
                        .map(|e| e.path.to_string_lossy().to_string())
                        .collect();
                    if !changed_paths.is_empty() {
                        let _ = app_handle.emit("fs-changed", &changed_paths);
                    }
                }
                Err(e) => {
                    let _ = app_handle.emit("fs-error", format!("{}", e));
                }
            }
        },
    )
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    let watcher = debouncer;
    // We need to watch recursively
    let mut debouncer = watcher;
    debouncer
        .watcher()
        .watch(
            Path::new(&watch_path),
            notify::RecursiveMode::Recursive,
        )
        .map_err(|e| format!("Failed to watch directory: {}", e))?;

    state._watcher = Some(debouncer);
    Ok(())
}

#[tauri::command]
fn unwatch_directory(app: AppHandle) -> Result<(), String> {
    let watcher_state = app.state::<Mutex<WatcherState>>();
    let mut state = watcher_state.lock().map_err(|e| e.to_string())?;
    state._watcher = None;
    Ok(())
}

// ── Directory stats ──

#[tauri::command]
fn get_directory_stats(path: String) -> Result<serde_json::Value, String> {
    let p = Path::new(&path);
    if !p.is_dir() {
        return Err("Not a directory".to_string());
    }
    let mut file_count: u64 = 0;
    let mut dir_count: u64 = 0;
    for entry in WalkDir::new(p).into_iter().filter_map(|e| e.ok()) {
        let name = entry.file_name().to_string_lossy();
        if is_hidden_or_ignored(&name) {
            continue;
        }
        if entry.file_type().is_file() {
            file_count += 1;
        } else if entry.file_type().is_dir() {
            dir_count += 1;
        }
    }
    Ok(serde_json::json!({
        "files": file_count,
        "directories": dir_count,
        "name": p.file_name().unwrap_or_default().to_string_lossy(),
    }))
}

// ── App entry ──

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(Mutex::new(WatcherState { _watcher: None }))
        .invoke_handler(tauri::generate_handler![
            read_directory,
            read_file_content,
            write_file_content,
            create_directory,
            create_file,
            delete_path,
            rename_path,
            path_exists,
            get_home_dir,
            list_recent_dirs,
            save_session,
            load_session,
            clear_session,
            watch_directory,
            unwatch_directory,
            get_directory_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
