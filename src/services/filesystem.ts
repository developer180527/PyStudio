import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { Command } from "@tauri-apps/plugin-shell";

export interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children: FsEntry[] | null;
}

export interface SessionState {
  project_path: string | null;
  open_files: string[];
  active_file: string | null;
  sidebar: string | null;
  bottom_pane: string | null;
  editor_prefs: Record<string, unknown> | null;
}

export interface SearchResult {
  path: string;
  name: string;
  relative_path: string;
  score: number;
}

// ── Filesystem commands ──

export async function readDirectory(path: string): Promise<FsEntry[]> {
  return invoke<FsEntry[]>("read_directory", { path });
}

export async function readFileContent(path: string): Promise<string> {
  return invoke<string>("read_file_content", { path });
}

export async function writeFileContent(
  path: string,
  content: string,
): Promise<void> {
  return invoke("write_file_content", { path, content });
}

export async function createDirectory(path: string): Promise<void> {
  return invoke("create_directory", { path });
}

export async function createFile(path: string): Promise<void> {
  return invoke("create_file", { path });
}

export async function deletePath(path: string): Promise<void> {
  return invoke("delete_path", { path });
}

export async function renamePath(
  oldPath: string,
  newPath: string,
): Promise<void> {
  return invoke("rename_path", { oldPath, newPath });
}

export async function pathExists(path: string): Promise<boolean> {
  return invoke<boolean>("path_exists", { path });
}

export async function getHomeDir(): Promise<string> {
  return invoke<string>("get_home_dir");
}

export async function getDirectoryStats(
  path: string,
): Promise<{ files: number; directories: number; name: string }> {
  return invoke("get_directory_stats", { path });
}

// ── Dialog ──

export async function openFolderDialog(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Open Project Folder",
  });
  if (typeof selected === "string") {
    return selected;
  }
  return null;
}

// ── Session ──

export async function saveSession(state: SessionState): Promise<void> {
  return invoke("save_session", { state });
}

export async function loadSession(): Promise<SessionState> {
  return invoke<SessionState>("load_session");
}

export async function clearSession(): Promise<void> {
  return invoke("clear_session");
}

// ── File watcher ──

export async function watchDirectory(path: string): Promise<void> {
  return invoke("watch_directory", { path });
}

export async function unwatchDirectory(): Promise<void> {
  return invoke("unwatch_directory");
}

export async function onFsChanged(
  callback: (paths: string[]) => void,
): Promise<UnlistenFn> {
  return listen<string[]>("fs-changed", (event) => {
    callback(event.payload);
  });
}

// ── Python execution (system interpreter) ──

export async function detectPython(): Promise<{
  command: string;
  version: string;
}> {
  return invoke("detect_python");
}

export async function runPythonScript(
  filePath: string,
  cwd: string,
): Promise<number> {
  return invoke<number>("run_python_script", { filePath, cwd });
}

export async function killProcess(pid: number): Promise<void> {
  return invoke("kill_process", { pid });
}

export async function onPythonStdout(
  callback: (data: string) => void,
): Promise<UnlistenFn> {
  return listen<string>("python-stdout", (event) => {
    callback(event.payload);
  });
}

export async function onPythonStderr(
  callback: (data: string) => void,
): Promise<UnlistenFn> {
  return listen<string>("python-stderr", (event) => {
    callback(event.payload);
  });
}

export async function onPythonExit(
  callback: (code: number) => void,
): Promise<UnlistenFn> {
  return listen<number>("python-exit", (event) => {
    callback(event.payload);
  });
}

// ── PTY terminal ──

export async function ptySpawn(
  id: string,
  cwd: string,
  rows: number,
  cols: number,
): Promise<void> {
  return invoke("pty_spawn", { id, cwd, rows, cols });
}

export async function ptyWrite(id: string, data: string): Promise<void> {
  return invoke("pty_write", { id, data });
}

export async function ptyResize(
  id: string,
  rows: number,
  cols: number,
): Promise<void> {
  return invoke("pty_resize", { id, rows, cols });
}

export async function ptyKill(id: string): Promise<void> {
  return invoke("pty_kill", { id });
}

export async function onPtyData(
  callback: (id: string, data: string) => void,
): Promise<UnlistenFn> {
  return listen<[string, string]>("pty-data", (event) => {
    callback(event.payload[0], event.payload[1]);
  });
}

export async function onPtyExit(
  callback: (id: string) => void,
): Promise<UnlistenFn> {
  return listen<string>("pty-exit", (event) => {
    callback(event.payload);
  });
}

// ── File search ──

export async function searchFiles(
  projectPath: string,
  query: string,
  maxResults: number = 20,
): Promise<SearchResult[]> {
  return invoke<SearchResult[]>("search_files", {
    projectPath,
    query,
    maxResults,
  });
}

// ── LSP server ──

export async function lspStart(projectPath: string): Promise<string> {
  return invoke<string>("lsp_start", { projectPath });
}

export async function lspSend(message: string): Promise<void> {
  return invoke("lsp_send", { message });
}

export async function lspStop(): Promise<void> {
  return invoke("lsp_stop");
}

export async function onLspMessage(
  callback: (message: string) => void,
): Promise<UnlistenFn> {
  return listen<string>("lsp-message", (event) => {
    callback(event.payload);
  });
}

// ── Git clone ──

export async function gitClone(
  repoUrl: string,
  targetDir: string,
  onProgress?: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = Command.create("git", [
      "clone",
      "--progress",
      repoUrl,
      targetDir,
    ]);

    cmd.on("error", (err) => {
      reject(new Error(`Git clone failed: ${err}`));
    });

    cmd.on("close", (data) => {
      if (data.code === 0) {
        resolve();
      } else {
        reject(new Error(`Git clone exited with code ${data.code}`));
      }
    });

    cmd.stdout.on("data", (line) => {
      onProgress?.(line);
    });

    cmd.stderr.on("data", (line) => {
      onProgress?.(line);
    });

    cmd.spawn().catch(reject);
  });
}
