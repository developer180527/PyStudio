use fuzzy_matcher::skim::SkimMatcherV2;
use fuzzy_matcher::FuzzyMatcher;
use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Read as IoRead, Write as IoWrite};
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResult {
    pub path: String,
    pub name: String,
    pub relative_path: String,
    pub score: i64,
}

struct WatcherState {
    _watcher: Option<notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>>,
}

struct PtyState {
    sessions: HashMap<String, PtySession>,
}

struct PtySession {
    writer: Box<dyn IoWrite + Send>,
    _child: Box<dyn portable_pty::Child + Send>,
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

fn find_python() -> String {
    // Try common Python paths
    for cmd in &["python3", "python"] {
        if std::process::Command::new(cmd)
            .arg("--version")
            .output()
            .is_ok()
        {
            return cmd.to_string();
        }
    }
    "python3".to_string()
}

// ── Filesystem Commands ──

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

    let mut debouncer = debouncer;
    debouncer
        .watcher()
        .watch(Path::new(&watch_path), notify::RecursiveMode::Recursive)
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

// ── Python execution (system interpreter) ──

#[tauri::command]
fn detect_python() -> Result<serde_json::Value, String> {
    let cmd = find_python();
    let output = std::process::Command::new(&cmd)
        .arg("--version")
        .output()
        .map_err(|e| format!("Python not found: {}", e))?;
    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let version = if version.is_empty() {
        String::from_utf8_lossy(&output.stderr).trim().to_string()
    } else {
        version
    };
    Ok(serde_json::json!({
        "command": cmd,
        "version": version,
    }))
}

#[tauri::command]
fn run_python_script(file_path: String, cwd: String, app: AppHandle) -> Result<u32, String> {
    let python = find_python();

    let mut child = std::process::Command::new(&python)
        .arg("-u") // unbuffered output
        .arg(&file_path)
        .current_dir(&cwd)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUNBUFFERED", "1")
        .spawn()
        .map_err(|e| format!("Failed to start Python: {}", e))?;

    let pid = child.id();
    let app_stdout = app.clone();
    let app_stderr = app.clone();
    let app_exit = app.clone();

    // Stream stdout
    if let Some(stdout) = child.stdout.take() {
        std::thread::spawn(move || {
            let reader = std::io::BufReader::new(stdout);
            let mut buf = [0u8; 4096];
            let mut reader = reader;
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let text = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app_stdout.emit("python-stdout", &text);
                    }
                    Err(_) => break,
                }
            }
        });
    }

    // Stream stderr
    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            let reader = std::io::BufReader::new(stderr);
            let mut buf = [0u8; 4096];
            let mut reader = reader;
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let text = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app_stderr.emit("python-stderr", &text);
                    }
                    Err(_) => break,
                }
            }
        });
    }

    // Wait for exit in background
    std::thread::spawn(move || {
        let status = child.wait();
        let code = status.map(|s| s.code().unwrap_or(-1)).unwrap_or(-1);
        let _ = app_exit.emit("python-exit", code);
    });

    Ok(pid)
}

#[tauri::command]
fn kill_process(pid: u32) -> Result<(), String> {
    #[cfg(unix)]
    {
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
    }
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
            .args(&["/PID", &pid.to_string(), "/F"])
            .output();
    }
    Ok(())
}

// ── PTY terminal ──

#[tauri::command]
fn pty_spawn(
    id: String,
    cwd: String,
    rows: u16,
    cols: u16,
    app: AppHandle,
) -> Result<(), String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut cmd = CommandBuilder::new(&shell);
    cmd.cwd(&cwd);

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to get PTY reader: {}", e))?;

    // Read PTY output and emit to frontend
    let pty_id = id.clone();
    let app_reader = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    let _ = app_reader.emit("pty-exit", &pty_id);
                    break;
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_reader.emit("pty-data", (&pty_id, &data));
                }
                Err(_) => {
                    let _ = app_reader.emit("pty-exit", &pty_id);
                    break;
                }
            }
        }
    });

    let pty_state = app.state::<Mutex<PtyState>>();
    let mut state = pty_state.lock().map_err(|e| e.to_string())?;
    state.sessions.insert(
        id,
        PtySession {
            writer,
            _child: child,
        },
    );

    Ok(())
}

#[tauri::command]
fn pty_write(id: String, data: String, app: AppHandle) -> Result<(), String> {
    let pty_state = app.state::<Mutex<PtyState>>();
    let mut state = pty_state.lock().map_err(|e| e.to_string())?;
    if let Some(session) = state.sessions.get_mut(&id) {
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("PTY write failed: {}", e))?;
        session
            .writer
            .flush()
            .map_err(|e| format!("PTY flush failed: {}", e))?;
    } else {
        return Err(format!("PTY session '{}' not found", id));
    }
    Ok(())
}

#[tauri::command]
fn pty_resize(id: String, rows: u16, cols: u16, app: AppHandle) -> Result<(), String> {
    // portable-pty doesn't expose resize on the session easily,
    // so we accept the command silently. The terminal still works.
    let _ = (id, rows, cols, app);
    Ok(())
}

#[tauri::command]
fn pty_kill(id: String, app: AppHandle) -> Result<(), String> {
    let pty_state = app.state::<Mutex<PtyState>>();
    let mut state = pty_state.lock().map_err(|e| e.to_string())?;
    if let Some(mut session) = state.sessions.remove(&id) {
        let _ = session._child.kill();
    }
    Ok(())
}

// ── File search ──

#[tauri::command]
fn search_files(project_path: String, query: String, max_results: usize) -> Vec<SearchResult> {
    let matcher = SkimMatcherV2::default();
    let base = Path::new(&project_path);
    let mut results: Vec<SearchResult> = Vec::new();

    for entry in WalkDir::new(&project_path)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !is_hidden_or_ignored(&name)
        })
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_dir() {
            continue;
        }

        let full_path = entry.path().to_string_lossy().to_string();
        let relative = entry
            .path()
            .strip_prefix(base)
            .unwrap_or(entry.path())
            .to_string_lossy()
            .to_string();
        let name = entry.file_name().to_string_lossy().to_string();

        // Match against both filename and relative path
        let score_name = matcher.fuzzy_match(&name, &query).unwrap_or(0);
        let score_path = matcher.fuzzy_match(&relative, &query).unwrap_or(0);
        let score = score_name.max(score_path);

        if score > 0 {
            results.push(SearchResult {
                path: full_path,
                name,
                relative_path: relative,
                score,
            });
        }
    }

    results.sort_by(|a, b| b.score.cmp(&a.score));
    results.truncate(max_results);
    results
}

// ── App entry ──

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(Mutex::new(WatcherState { _watcher: None }))
        .manage(Mutex::new(PtyState {
            sessions: HashMap::new(),
        }))
        .invoke_handler(tauri::generate_handler![
            // Filesystem
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
            get_directory_stats,
            // Session
            save_session,
            load_session,
            clear_session,
            // File watcher
            watch_directory,
            unwatch_directory,
            // Python execution
            detect_python,
            run_python_script,
            kill_process,
            // PTY
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill,
            // Search
            search_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
