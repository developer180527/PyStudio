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

// ── Git clone ──

export async function gitClone(
  repoUrl: string,
  targetDir: string,
  onProgress?: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = Command.create("git", ["clone", "--progress", repoUrl, targetDir]);

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
