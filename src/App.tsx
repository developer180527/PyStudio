import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Panel,
  Group as PanelGroup,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import { CodeEditor } from "./components/Editor";
import { Console } from "./components/Console";
import { SimulatedTerminal } from "./components/Terminal";
import { AIChat } from "./components/AIChat";
import { FileExplorer } from "./components/FileExplorer";
import { FileSearch } from "./components/FileSearch";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { Settings } from "./components/Settings";
import {
  DebuggerSidebar,
  DebugVariable,
  CallStackFrame,
} from "./components/DebuggerSidebar";
import {
  PackagesSidebar,
  InstalledPackage,
} from "./components/PackagesSidebar";
import { SourceControlSidebar } from "./components/SourceControlSidebar";
import { MenuBar, MenuData } from "./components/MenuBar";
import { useGit } from "./hooks/useGit";
import {
  runPython,
  installPythonPackage,
  getPyodide,
  debugPython,
  type TraceEvent,
} from "./services/pyodide";
import {
  readDirectory,
  readFileContent,
  writeFileContent,
  createFile,
  createDirectory,
  deletePath,
  renamePath,
  saveSession,
  loadSession,
  watchDirectory,
  unwatchDirectory,
  onFsChanged,
  openFolderDialog,
  detectPython,
  runPythonScript,
  killProcess,
  onPythonStdout,
  onPythonStderr,
  onPythonExit,
  type FsEntry,
  type SessionState,
} from "./services/filesystem";
import {
  Play,
  RotateCcw,
  FolderOpen,
  Save,
  Cpu,
  X,
  Trash2,
  Bug,
  Undo2,
  Redo2,
  FileCode2,
  Search,
  Settings as SettingsIcon,
  Layout,
  Package,
  GitBranch,
  Replace,
  Square,
} from "lucide-react";

interface ConsoleLine {
  text: string;
  type: "output" | "error" | "system";
}

export default function App() {
  // ── Project state ──
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [fileTree, setFileTree] = useState<FsEntry[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  // ── Editor state ──
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [openFilePaths, setOpenFilePaths] = useState<string[]>([]);
  const [fileContents, setFileContents] = useState<Map<string, string>>(
    new Map(),
  );
  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set());

  // ── UI state ──
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [activeSidebar, setActiveSidebar] = useState("files");
  const [isInitializing, setIsInitializing] = useState(true);
  const [bottomPaneTab, setBottomPaneTab] = useState<
    "error-list" | "output" | "terminal"
  >("output");

  // ── Debugger state ──
  const [breakpoints, setBreakpoints] = useState<
    { fileId: string; line: number; enabled: boolean }[]
  >([]);
  const [isDebugging, setIsDebugging] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [debugVariables, setDebugVariables] = useState<DebugVariable[]>([]);
  const [callStack, setCallStack] = useState<CallStackFrame[]>([]);
  const [executionLine, setExecutionLine] = useState<number | undefined>(
    undefined,
  );
  const [debugTrace, setDebugTrace] = useState<TraceEvent[]>([]);
  const [debugIndex, setDebugIndex] = useState<number>(-1);

  // ── Package state ──
  const [installedPackages, setInstalledPackages] = useState<
    InstalledPackage[]
  >([]);

  // ── Python execution state ──
  const [pythonPid, setPythonPid] = useState<number | null>(null);
  const [pythonInfo, setPythonInfo] = useState<string>("");
  const [isFileSearchOpen, setIsFileSearchOpen] = useState(false);

  // ── Git state (uses legacy ProjectItem for now) ──
  const gitItems = useRef<any[]>([]);
  const gitState = useGit(gitItems.current);

  // ── Refs ──
  const unlistenFsRef = useRef<(() => void) | null>(null);
  const sessionSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pythonListeners = useRef<(() => void)[]>([]);

  // ── Helpers ──

  const activeFileName =
    activeFilePath?.split("/").pop() || null;
  const activeFileContent =
    activeFilePath ? fileContents.get(activeFilePath) ?? "" : "";

  const refreshFileTree = useCallback(
    async (path: string) => {
      try {
        const tree = await readDirectory(path);
        setFileTree(tree);
      } catch (err: any) {
        setConsoleLines((prev) => [
          ...prev,
          {
            text: `Failed to read directory: ${err?.message || err}`,
            type: "error",
          },
        ]);
      }
    },
    [],
  );

  // ── Session persistence ──

  const persistSession = useCallback(() => {
    if (!projectPath) return;
    if (sessionSaveTimer.current) clearTimeout(sessionSaveTimer.current);
    sessionSaveTimer.current = setTimeout(async () => {
      const state: SessionState = {
        project_path: projectPath,
        open_files: openFilePaths,
        active_file: activeFilePath,
        sidebar: activeSidebar,
        bottom_pane: bottomPaneTab,
        editor_prefs: null,
      };
      try {
        await saveSession(state);
      } catch (e) {
        console.error("Failed to save session", e);
      }
    }, 1000);
  }, [projectPath, openFilePaths, activeFilePath, activeSidebar, bottomPaneTab]);

  useEffect(() => {
    persistSession();
  }, [persistSession]);

  // ── Load session on mount ──

  useEffect(() => {
    (async () => {
      try {
        const session = await loadSession();
        if (session.project_path) {
          await openProject(session.project_path, session);
        }
      } catch {
        // no session
      } finally {
        setIsLoadingSession(false);
      }
    })();
    return () => {
      if (unlistenFsRef.current) unlistenFsRef.current();
      unwatchDirectory().catch(() => {});
    };
  }, []);

  // ── Detect system Python ──

  useEffect(() => {
    const init = async () => {
      setConsoleLines([
        { text: "Detecting system Python interpreter...", type: "system" },
      ]);
      try {
        const info = await detectPython();
        setPythonInfo(`${info.command} (${info.version})`);
        setConsoleLines((prev) => [
          ...prev,
          {
            text: `Environment Ready. ${info.version} via system interpreter.`,
            type: "system",
          },
        ]);
      } catch {
        setConsoleLines((prev) => [
          ...prev,
          {
            text: "Python not found on system. Install Python 3 to run scripts.",
            type: "error",
          },
        ]);
      } finally {
        setIsInitializing(false);
      }
    };
    init();

    // Also initialize Pyodide in background for debugger
    getPyodide().catch(() => {});
  }, []);

  // ── Project management ──

  const openProject = useCallback(
    async (path: string, session?: SessionState) => {
      setProjectPath(path);

      // Load file tree
      const tree = await readDirectory(path);
      setFileTree(tree);

      // Set up file watcher
      if (unlistenFsRef.current) unlistenFsRef.current();
      try {
        await unwatchDirectory();
      } catch {}
      try {
        await watchDirectory(path);
        const unlisten = await onFsChanged(() => {
          refreshFileTree(path);
        });
        unlistenFsRef.current = unlisten;
      } catch (err) {
        console.error("File watcher setup failed:", err);
      }

      // Restore session state
      if (session?.open_files && session.open_files.length > 0) {
        const contents = new Map<string, string>();
        const validPaths: string[] = [];
        for (const filePath of session.open_files) {
          try {
            const content = await readFileContent(filePath);
            contents.set(filePath, content);
            validPaths.push(filePath);
          } catch {
            // file might have been deleted
          }
        }
        setOpenFilePaths(validPaths);
        setFileContents(contents);
        if (
          session.active_file &&
          validPaths.includes(session.active_file)
        ) {
          setActiveFilePath(session.active_file);
        } else if (validPaths.length > 0) {
          setActiveFilePath(validPaths[0]);
        }
        if (session.sidebar) setActiveSidebar(session.sidebar);
        if (session.bottom_pane)
          setBottomPaneTab(
            session.bottom_pane as "error-list" | "output" | "terminal",
          );
      }

      setConsoleLines((prev) => [
        ...prev,
        { text: `Opened project: ${path}`, type: "system" },
      ]);
    },
    [refreshFileTree],
  );

  const handleOpenFolder = useCallback(async () => {
    const path = await openFolderDialog();
    if (path) {
      await openProject(path);
    }
  }, [openProject]);

  // ── File operations ──

  const handleSelectFile = useCallback(
    async (path: string) => {
      if (!openFilePaths.includes(path)) {
        setOpenFilePaths((prev) => [...prev, path]);
      }
      setActiveFilePath(path);

      if (!fileContents.has(path)) {
        try {
          const content = await readFileContent(path);
          setFileContents((prev) => new Map(prev).set(path, content));
        } catch (err: any) {
          setConsoleLines((prev) => [
            ...prev,
            {
              text: `Failed to read file: ${err?.message || err}`,
              type: "error",
            },
          ]);
        }
      }
    },
    [openFilePaths, fileContents],
  );

  const handleCodeChange = useCallback(
    (newCode: string | undefined) => {
      if (newCode === undefined || !activeFilePath) return;
      setFileContents((prev) => new Map(prev).set(activeFilePath, newCode));
      setDirtyFiles((prev) => new Set(prev).add(activeFilePath));

      // Autosave logic
      const prefs = (() => {
        try {
          const raw = localStorage.getItem("pystudio_editor_prefs");
          return raw ? JSON.parse(raw) : {};
        } catch {
          return {};
        }
      })();

      if (prefs.autoSave === "afterDelay") {
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(async () => {
          try {
            await writeFileContent(activeFilePath, newCode);
            setDirtyFiles((prev) => {
              const next = new Set(prev);
              next.delete(activeFilePath);
              return next;
            });
          } catch {}
        }, 1000);
      }
    },
    [activeFilePath],
  );

  // Autosave on focus change
  useEffect(() => {
    const handleVisibility = async () => {
      const prefs = (() => {
        try {
          const raw = localStorage.getItem("pystudio_editor_prefs");
          return raw ? JSON.parse(raw) : {};
        } catch {
          return {};
        }
      })();

      if (
        (prefs.autoSave === "onFocusChange" ||
          prefs.autoSave === "onWindowChange") &&
        document.hidden
      ) {
        // Save all dirty files
        const dirty: string[] = Array.from(dirtyFiles);
        for (const fp of dirty) {
          const content = fileContents.get(fp);
          if (content !== undefined) {
            try {
              await writeFileContent(fp, content);
            } catch {}
          }
        }
        if (dirty.length > 0) setDirtyFiles(new Set());
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleVisibility);
    };
  }, [dirtyFiles, fileContents]);

  const handleSave = useCallback(async () => {
    if (!activeFilePath) return;
    const content = fileContents.get(activeFilePath);
    if (content === undefined) return;
    try {
      await writeFileContent(activeFilePath, content);
      setDirtyFiles((prev) => {
        const next = new Set(prev);
        next.delete(activeFilePath);
        return next;
      });
      setConsoleLines((prev) => [
        ...prev,
        {
          text: `Saved "${activeFilePath.split("/").pop()}" to disk.`,
          type: "system",
        },
      ]);
    } catch (err: any) {
      setConsoleLines((prev) => [
        ...prev,
        {
          text: `Failed to save: ${err?.message || err}`,
          type: "error",
        },
      ]);
    }
  }, [activeFilePath, fileContents]);

  const handleSaveAll = useCallback(async () => {
    const dirty: string[] = Array.from(dirtyFiles);
    for (const fp of dirty) {
      const content = fileContents.get(fp);
      if (content === undefined) continue;
      try {
        await writeFileContent(fp, content);
      } catch (err: any) {
        setConsoleLines((prev) => [
          ...prev,
          {
            text: `Failed to save ${fp.split("/").pop()}: ${err?.message || err}`,
            type: "error",
          },
        ]);
      }
    }
    setDirtyFiles(new Set());
    if (dirty.length > 0) {
      setConsoleLines((prev) => [
        ...prev,
        { text: `Saved ${dirty.length} file(s) to disk.`, type: "system" },
      ]);
    }
  }, [dirtyFiles, fileContents]);

  const handleCreateFile = useCallback(
    async (parentDir: string, name: string) => {
      const fullPath = `${parentDir}/${name}`;
      try {
        await createFile(fullPath);
        if (projectPath) await refreshFileTree(projectPath);
        await handleSelectFile(fullPath);
      } catch (err: any) {
        setConsoleLines((prev) => [
          ...prev,
          {
            text: `Failed to create file: ${err?.message || err}`,
            type: "error",
          },
        ]);
      }
    },
    [projectPath, refreshFileTree, handleSelectFile],
  );

  const handleCreateFolder = useCallback(
    async (parentDir: string, name: string) => {
      const fullPath = `${parentDir}/${name}`;
      try {
        await createDirectory(fullPath);
        if (projectPath) await refreshFileTree(projectPath);
      } catch (err: any) {
        setConsoleLines((prev) => [
          ...prev,
          {
            text: `Failed to create folder: ${err?.message || err}`,
            type: "error",
          },
        ]);
      }
    },
    [projectPath, refreshFileTree],
  );

  const handleDeletePath = useCallback(
    async (path: string) => {
      try {
        await deletePath(path);
        // Remove from open files
        setOpenFilePaths((prev) =>
          prev.filter((p) => !p.startsWith(path)),
        );
        setFileContents((prev) => {
          const next = new Map<string, string>(prev);
          Array.from(next.keys()).forEach((k) => {
            if (k.startsWith(path)) next.delete(k);
          });
          return next;
        });
        if (activeFilePath && activeFilePath.startsWith(path)) {
          setActiveFilePath(null);
        }
        if (projectPath) await refreshFileTree(projectPath);
      } catch (err: any) {
        setConsoleLines((prev) => [
          ...prev,
          {
            text: `Failed to delete: ${err?.message || err}`,
            type: "error",
          },
        ]);
      }
    },
    [projectPath, activeFilePath, refreshFileTree],
  );

  const handleRenamePath = useCallback(
    async (oldPath: string, newName: string) => {
      const parentDir = oldPath.substring(0, oldPath.lastIndexOf("/"));
      const newPath = `${parentDir}/${newName}`;
      try {
        await renamePath(oldPath, newPath);
        // Update open file references
        setOpenFilePaths((prev) =>
          prev.map((p) =>
            p === oldPath
              ? newPath
              : p.startsWith(oldPath + "/")
                ? newPath + p.substring(oldPath.length)
                : p,
          ),
        );
        setFileContents((prev) => {
          const next = new Map<string, string>();
          for (const [key, value] of prev) {
            if (key === oldPath) {
              next.set(newPath, value);
            } else if (key.startsWith(oldPath + "/")) {
              next.set(newPath + key.substring(oldPath.length), value);
            } else {
              next.set(key, value);
            }
          }
          return next;
        });
        if (activeFilePath === oldPath) {
          setActiveFilePath(newPath);
        } else if (activeFilePath?.startsWith(oldPath + "/")) {
          setActiveFilePath(
            newPath + activeFilePath.substring(oldPath.length),
          );
        }
        if (projectPath) await refreshFileTree(projectPath);
      } catch (err: any) {
        setConsoleLines((prev) => [
          ...prev,
          {
            text: `Failed to rename: ${err?.message || err}`,
            type: "error",
          },
        ]);
      }
    },
    [projectPath, activeFilePath, refreshFileTree],
  );

  const handleToggleFolder = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleCloseTab = useCallback(
    (path: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const newOpen = openFilePaths.filter((p) => p !== path);
      setOpenFilePaths(newOpen);
      if (activeFilePath === path) {
        setActiveFilePath(
          newOpen.length > 0 ? newOpen[newOpen.length - 1] : null,
        );
      }
    },
    [openFilePaths, activeFilePath],
  );

  const handleOpenSettings = () => {
    if (!openFilePaths.includes("__settings__")) {
      setOpenFilePaths((prev) => [...prev, "__settings__"]);
    }
    setActiveFilePath("__settings__");
  };

  // ── Run / Debug ──

  const handleRun = useCallback(async () => {
    if (isRunning || isInitializing || !activeFilePath || !projectPath) return;

    // Save all dirty files before running (so imports work)
    const dirty: string[] = Array.from(dirtyFiles);
    for (const fp of dirty) {
      const content = fileContents.get(fp);
      if (content !== undefined) {
        try {
          await writeFileContent(fp, content);
        } catch {}
      }
    }
    setDirtyFiles(new Set());

    setIsRunning(true);
    setBottomPaneTab("output");
    setConsoleLines((prev) => [
      ...prev,
      {
        text: `> Running ${activeFilePath.split("/").pop()} (system Python, cwd: ${projectPath})...`,
        type: "system",
      },
    ]);

    // Clean up previous listeners
    pythonListeners.current.forEach((fn) => fn());
    pythonListeners.current = [];

    try {
      const u1 = await onPythonStdout((data) => {
        setConsoleLines((prev) => [...prev, { text: data, type: "output" }]);
      });
      const u2 = await onPythonStderr((data) => {
        setConsoleLines((prev) => [...prev, { text: data, type: "error" }]);
      });
      const u3 = await onPythonExit((code) => {
        setConsoleLines((prev) => [
          ...prev,
          {
            text: `> Process exited with code ${code}.`,
            type: code === 0 ? "system" : "error",
          },
        ]);
        setIsRunning(false);
        setPythonPid(null);
      });
      pythonListeners.current = [u1, u2, u3];

      const pid = await runPythonScript(activeFilePath, projectPath);
      setPythonPid(pid);
    } catch (err: any) {
      setConsoleLines((prev) => [
        ...prev,
        {
          text: `> Failed to run: ${err?.message || err}`,
          type: "error",
        },
      ]);
      setIsRunning(false);
    }
  }, [activeFilePath, projectPath, isRunning, isInitializing, dirtyFiles, fileContents]);

  const handleStop = useCallback(async () => {
    if (pythonPid) {
      try {
        await killProcess(pythonPid);
        setConsoleLines((prev) => [
          ...prev,
          { text: "> Process terminated.", type: "system" },
        ]);
      } catch {}
      setPythonPid(null);
      setIsRunning(false);
    }
  }, [pythonPid]);

  // ── Packages ──

  const handleInstallPackage = async (packageName: string) => {
    return new Promise<void>((resolve, reject) => {
      setConsoleLines((prev) => [
        ...prev,
        { text: `> Installing package '${packageName}'...`, type: "system" },
      ]);
      installPythonPackage(
        packageName,
        (output) => {
          setConsoleLines((prev) => [
            ...prev,
            { text: output, type: "output" },
          ]);
        },
        (error) => {
          setConsoleLines((prev) => [...prev, { text: error, type: "error" }]);
          reject(new Error(error));
        },
      )
        .then(() => {
          setInstalledPackages((prev) => {
            if (!prev.find((p) => p.name === packageName)) {
              return [...prev, { name: packageName }];
            }
            return prev;
          });
          resolve();
        })
        .catch(reject);
    });
  };

  const handleUninstallPackage = (packageName: string) => {
    setInstalledPackages((prev) => prev.filter((p) => p.name !== packageName));
    setConsoleLines((prev) => [
      ...prev,
      { text: `> Uninstalled package '${packageName}'.`, type: "system" },
    ]);
  };

  // ── Debugger ──

  const applyDebugIndex = useCallback(
    (events: TraceEvent[], idx: number) => {
      if (idx < 0 || idx >= events.length) {
        setIsPaused(false);
        setExecutionLine(undefined);
        setCallStack([]);
        setDebugVariables([]);
        setConsoleLines((prev) => [
          ...prev,
          { text: `> Debugger: end of trace.`, type: "system" },
        ]);
        return;
      }
      const evt = events[idx];
      setExecutionLine(evt.line);
      setCallStack(
        evt.stack.map((f, i) => ({
          id: `${i}-${f.name}-${f.line}`,
          name: f.name,
          file: activeFileName || f.file,
          line: f.line,
        })),
      );
      setDebugVariables(
        evt.locals.map((v) => ({
          name: v.name,
          value: v.value,
          type: v.type,
        })),
      );
      setIsPaused(true);
    },
    [activeFileName],
  );

  const handleStartDebug = useCallback(async () => {
    if (!activeFilePath || isInitializing) return;
    setActiveSidebar("debug");
    setIsDebugging(true);
    setIsPaused(false);
    setExecutionLine(undefined);
    setCallStack([]);
    setDebugVariables([]);
    setConsoleLines((prev) => [
      ...prev,
      {
        text: `> Tracing execution of ${activeFileName}...`,
        type: "system",
      },
    ]);
    try {
      const result = await debugPython(activeFileContent);
      if (result.output) {
        setConsoleLines((prev) => [
          ...prev,
          { text: result.output, type: "output" },
        ]);
      }
      if (result.error) {
        setConsoleLines((prev) => [
          ...prev,
          { text: result.error!, type: "error" },
        ]);
      }
      setDebugTrace(result.events);
      if (result.events.length === 0) {
        setConsoleLines((prev) => [
          ...prev,
          {
            text: `> No traceable lines (empty file or error before first line).`,
            type: "system",
          },
        ]);
        setIsDebugging(false);
        return;
      }
      const fileBps = breakpoints
        .filter((b) => b.fileId === activeFilePath && b.enabled)
        .map((b) => b.line);
      const firstStop =
        fileBps.length > 0
          ? result.events.findIndex((e) => fileBps.includes(e.line))
          : 0;
      const stopAt = firstStop >= 0 ? firstStop : 0;
      setDebugIndex(stopAt);
      applyDebugIndex(result.events, stopAt);
    } catch (err: any) {
      setConsoleLines((prev) => [
        ...prev,
        {
          text: `> Debug failed: ${err?.message || err}`,
          type: "error",
        },
      ]);
      setIsDebugging(false);
    }
  }, [activeFilePath, activeFileName, activeFileContent, isInitializing, breakpoints, applyDebugIndex]);

  const handleStopDebug = useCallback(() => {
    setIsDebugging(false);
    setIsPaused(false);
    setExecutionLine(undefined);
    setCallStack([]);
    setDebugVariables([]);
    setDebugTrace([]);
    setDebugIndex(-1);
    setConsoleLines((prev) => [
      ...prev,
      { text: `> Debugging stopped.`, type: "system" },
    ]);
  }, []);

  const handlePause = useCallback(() => {
    setIsPaused(true);
  }, []);

  const handleResume = useCallback(() => {
    if (!isDebugging || debugTrace.length === 0) return;
    const fileBps = breakpoints
      .filter((b) => b.fileId === activeFilePath && b.enabled)
      .map((b) => b.line);
    const next = debugTrace.findIndex(
      (e, i) => i > debugIndex && fileBps.includes(e.line),
    );
    if (next >= 0) {
      setDebugIndex(next);
      applyDebugIndex(debugTrace, next);
    } else {
      setDebugIndex(debugTrace.length);
      applyDebugIndex(debugTrace, debugTrace.length);
    }
  }, [isDebugging, debugTrace, debugIndex, breakpoints, activeFilePath, applyDebugIndex]);

  const handleStepOver = useCallback(() => {
    if (!isDebugging || debugIndex < 0) return;
    const current = debugTrace[debugIndex];
    if (!current) return;
    const currentDepth = current.stack.length;
    const next = debugTrace.findIndex(
      (e, i) => i > debugIndex && e.stack.length <= currentDepth,
    );
    if (next >= 0) {
      setDebugIndex(next);
      applyDebugIndex(debugTrace, next);
    } else {
      setDebugIndex(debugTrace.length);
      applyDebugIndex(debugTrace, debugTrace.length);
    }
  }, [isDebugging, debugIndex, debugTrace, applyDebugIndex]);

  const handleStepInto = useCallback(() => {
    if (!isDebugging || debugIndex < 0) return;
    const next = debugIndex + 1;
    setDebugIndex(next);
    applyDebugIndex(debugTrace, next);
  }, [isDebugging, debugIndex, debugTrace, applyDebugIndex]);

  const handleStepOut = useCallback(() => {
    if (!isDebugging || debugIndex < 0) return;
    const current = debugTrace[debugIndex];
    if (!current) return;
    const currentDepth = current.stack.length;
    const next = debugTrace.findIndex(
      (e, i) => i > debugIndex && e.stack.length < currentDepth,
    );
    if (next >= 0) {
      setDebugIndex(next);
      applyDebugIndex(debugTrace, next);
    } else {
      setDebugIndex(debugTrace.length);
      applyDebugIndex(debugTrace, debugTrace.length);
    }
  }, [isDebugging, debugIndex, debugTrace, applyDebugIndex]);

  const handleRestart = useCallback(() => {
    handleStopDebug();
    handleStartDebug();
  }, [handleStopDebug, handleStartDebug]);

  const handleBreakpointToggle = (fileId: string, line: number) => {
    setBreakpoints((prev) => {
      const existing = prev.find((b) => b.fileId === fileId && b.line === line);
      if (existing) {
        return prev.filter((b) => b !== existing);
      } else {
        return [...prev, { fileId, line, enabled: true }];
      }
    });
  };

  const clearConsole = () => setConsoleLines([]);

  // ── Keyboard shortcuts ──

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+P / Cmd+P: File search
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        setIsFileSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── Close project (go back to welcome) ──

  const handleCloseProject = useCallback(async () => {
    // Save dirty files prompt could go here
    if (unlistenFsRef.current) unlistenFsRef.current();
    try {
      await unwatchDirectory();
    } catch {}
    setProjectPath(null);
    setFileTree([]);
    setOpenFilePaths([]);
    setActiveFilePath(null);
    setFileContents(new Map());
    setDirtyFiles(new Set());
    setExpandedPaths(new Set());
  }, []);

  // ── Menu ──

  const menuData: MenuData[] = [
    {
      title: "File",
      items: [
        {
          label: "Open Folder...",
          shortcut: "Ctrl+Shift+O",
          action: () => handleOpenFolder(),
        },
        {
          label: "New File",
          action: () => {
            if (projectPath) {
              const name = `new_file_${Date.now().toString().slice(-4)}.py`;
              handleCreateFile(projectPath, name);
            }
          },
        },
        {
          label: "New Folder",
          action: () => {
            if (projectPath) {
              const name = `new_folder_${Date.now().toString().slice(-4)}`;
              handleCreateFolder(projectPath, name);
            }
          },
        },
        { divider: true },
        { label: "Save", shortcut: "Ctrl+S", action: "save" },
        { label: "Save All", shortcut: "Ctrl+Shift+S", action: "save_all" },
        { divider: true },
        { label: "Settings", shortcut: "Ctrl+,", action: "settings" },
        { divider: true },
        { label: "Close Project", action: "close_project" },
      ],
    },
    {
      title: "Edit",
      items: [
        { label: "Undo", shortcut: "Ctrl+Z", action: "undo" },
        { label: "Redo", shortcut: "Ctrl+Y", action: "redo" },
        { divider: true },
        { label: "Cut", shortcut: "Ctrl+X", action: "cut" },
        { label: "Copy", shortcut: "Ctrl+C", action: "copy" },
        { label: "Paste", shortcut: "Ctrl+V", action: "paste" },
      ],
    },
    {
      title: "View",
      items: [
        { label: "Solution Explorer", action: "view_solution" },
        { label: "Source Control", action: "view_source_control" },
        { label: "Package Manager", action: "view_packages" },
        { divider: true },
        { label: "Terminal", action: "view_terminal" },
        { label: "Output", action: "view_output" },
      ],
    },
    {
      title: "Project",
      items: [
        { label: "Build Solution", shortcut: "Ctrl+Shift+B", action: "build" },
        { label: "Clean Solution", action: "clean" },
      ],
    },
    {
      title: "Build",
      items: [
        { label: "Run Without Debugging", shortcut: "Ctrl+F5", action: "run" },
      ],
    },
    {
      title: "Debug",
      items: [
        { label: "Start Debugging", shortcut: "F5", action: "debug" },
        { label: "Step Over", shortcut: "F10", action: "step_over" },
        { label: "Step Into", shortcut: "F11", action: "step_into" },
      ],
    },
    {
      title: "Format",
      items: [
        {
          label: "Format Document",
          shortcut: "Shift+Alt+F",
          action: "format_doc",
        },
        {
          label: "Format Selection",
          shortcut: "Ctrl+K Ctrl+F",
          action: "format_selection",
        },
        { divider: true },
        { label: "Find", shortcut: "Ctrl+F", action: "find" },
        { label: "Replace", shortcut: "Ctrl+H", action: "replace" },
      ],
    },
    {
      title: "Test",
      items: [
        { label: "Run All Tests", action: "test_run_all" },
        { label: "Debug All Tests", action: "test_debug_all" },
      ],
    },
    {
      title: "Analyze",
      items: [
        {
          label: "Run Code Analysis",
          shortcut: "Alt+F11",
          action: "analyze_code",
        },
        { label: "Code Cleanup", action: "cleanup_code" },
      ],
    },
    {
      title: "Tools",
      items: [
        {
          label: "Go to File...",
          shortcut: "Ctrl+P",
          action: "go_to_file",
        },
        {
          label: "Command Palette...",
          shortcut: "Ctrl+Shift+P",
          action: "command_palette",
        },
        { label: "Python Environments", action: "python_envs" },
      ],
    },
    {
      title: "Extensions",
      items: [{ label: "Manage Extensions", action: "manage_extensions" }],
    },
    {
      title: "Window",
      items: [
        { label: "Close All Tabs", action: "close_all_tabs" },
        { divider: true },
        { label: "Split Display", action: "split_display" },
      ],
    },
    {
      title: "Help",
      items: [
        { label: "View Help", shortcut: "F1", action: "view_help" },
        { label: "Release Notes", action: "release_notes" },
        { divider: true },
        { label: "About PyStudio", action: "about" },
      ],
    },
  ];

  const handleMenuAction = (action: string | (() => void)) => {
    if (typeof action === "function") {
      action();
    } else {
      switch (action) {
        case "save":
          handleSave();
          break;
        case "save_all":
          handleSaveAll();
          break;
        case "settings":
          handleOpenSettings();
          break;
        case "close_project":
          handleCloseProject();
          break;
        case "close_all_tabs":
          setOpenFilePaths([]);
          setActiveFilePath(null);
          break;
        case "view_solution":
          setActiveSidebar("files");
          break;
        case "view_source_control":
          setActiveSidebar("source-control");
          break;
        case "view_packages":
          setActiveSidebar("packages");
          break;
        case "view_terminal":
          setBottomPaneTab("terminal");
          break;
        case "view_output":
          setBottomPaneTab("output");
          break;
        case "go_to_file":
          setIsFileSearchOpen(true);
          break;
        case "run":
          handleRun();
          break;
        case "debug":
          handleStartDebug();
          break;
        case "step_over":
          handleStepOver();
          break;
        case "step_into":
          handleStepInto();
          break;
        case "find":
        case "replace":
        case "format_doc":
        case "format_selection":
          window.dispatchEvent(
            new CustomEvent("editor:command", { detail: action }),
          );
          break;
        default:
          setConsoleLines((prev) => [
            ...prev,
            { text: `> Menu action triggered: ${action}`, type: "system" },
          ]);
          break;
      }
    }
  };

  // ── Loading state ──

  if (isLoadingSession) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[var(--theme-panel)]">
        <div className="animate-spin text-[var(--theme-text-accent)]">
          <Cpu size={32} />
        </div>
      </div>
    );
  }

  // ── Welcome screen ──

  if (!projectPath) {
    return <WelcomeScreen onOpenProject={(path) => openProject(path)} />;
  }

  // ── Main IDE ──

  const isSettingsOpen = activeFilePath === "__settings__";

  return (
    <div className="flex flex-col bg-[var(--theme-surface)] h-screen w-screen overflow-hidden select-none text-[var(--theme-text-main)]">
      {/* Menu Bar */}
      <div className="flex items-center h-7 border-b border-[var(--theme-border)] bg-[var(--theme-surface-alt)] pr-2 text-[13px] text-[var(--theme-text-secondary)] shadow-sm shrink-0">
        <MenuBar menus={menuData} onAction={handleMenuAction} />
        <div className="flex-1" />
        <div
          onClick={() => setIsFileSearchOpen(true)}
          className="flex items-center h-5 bg-[var(--theme-panel)] border border-[var(--theme-border)] rounded-sm px-1.5 text-[11px] w-56 mx-2 overflow-hidden shadow-inner cursor-pointer hover:bg-[var(--theme-hover)] transition-colors"
          title="Go to File (Ctrl+P)"
        >
          <Search size={12} className="text-[var(--theme-text-muted)] mr-1.5" />
          <span className="text-[var(--theme-text-muted)]">Go to File...</span>
        </div>
      </div>

      {/* Tool Bar */}
      <div className="flex items-center h-8 border-b border-[var(--theme-border)] bg-[var(--theme-surface)] px-2 gap-1.5 text-[var(--theme-text-secondary)] shadow-sm shrink-0">
        <div className="flex items-center gap-0.5">
          <button
            className="p-1 hover:bg-[var(--theme-hover)] rounded"
            title="Undo"
          >
            <Undo2 size={16} />
          </button>
          <button
            className="p-1 hover:bg-[var(--theme-hover)] rounded"
            title="Redo"
          >
            <Redo2 size={16} />
          </button>
        </div>
        <div className="w-[1px] h-5 bg-[var(--theme-border)] mx-1" />
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleSave}
            className="p-1 hover:bg-[var(--theme-hover)] rounded"
            title="Save"
          >
            <Save size={16} />
          </button>
          <button
            onClick={handleOpenFolder}
            className="p-1 hover:bg-[var(--theme-hover)] rounded"
            title="Open Folder"
          >
            <FolderOpen size={16} />
          </button>
        </div>
        <div className="w-[1px] h-5 bg-[var(--theme-border)] mx-1" />
        <div className="flex items-center bg-[var(--theme-panel)] rounded border border-[var(--theme-border)] overflow-hidden h-6 shadow-xs select-none">
          <button
            className="flex items-center gap-1.5 px-3 h-full hover:bg-[var(--theme-hover)] border-r border-[var(--theme-border)] transition-colors active:bg-[var(--theme-active)] disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={isDebugging ? handleResume : handleStartDebug}
            disabled={!activeFilePath || isSettingsOpen || (isDebugging && !isPaused)}
            title="Start Debugging"
          >
            <Play size={12} className="text-[var(--theme-text-accent)] fill-current" />
            <span className="text-xs font-semibold text-[var(--theme-text-main)]">
              Start
            </span>
          </button>
          <div className="px-2 h-full flex items-center bg-[var(--theme-surface-alt)] hover:bg-[var(--theme-hover)] cursor-pointer text-[11px] text-[var(--theme-text-main)] border-r border-[var(--theme-border)]">
            Any CPU{" "}
            <span className="ml-1 text-[var(--theme-text-muted)] text-[8px]">
              ▼
            </span>
          </div>
          {isRunning ? (
            <button
              onClick={handleStop}
              className="flex items-center justify-center p-1 px-2 h-full hover:bg-[var(--theme-hover)] transition-colors text-[var(--theme-danger)]"
              title="Stop Execution"
            >
              <Square size={12} className="fill-current" />
            </button>
          ) : (
            <button
              onClick={handleRun}
              disabled={isInitializing || !activeFilePath || isSettingsOpen}
              className="flex items-center justify-center p-1 px-2 h-full hover:bg-[var(--theme-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Run with System Python"
            >
              <Play size={12} className="text-[var(--theme-text-main)]" />
            </button>
          )}
        </div>
        <div className="flex-1" />

        <div className="flex items-center gap-0.5 border-r border-[var(--theme-border)] pr-1.5 mr-1.5">
          <button
            onClick={() => handleMenuAction("find")}
            className="p-1 hover:bg-[var(--theme-hover)] rounded text-[var(--theme-text-secondary)]"
            title="Find (Ctrl+F)"
          >
            <Search size={16} />
          </button>
          <button
            onClick={() => handleMenuAction("replace")}
            className="p-1 hover:bg-[var(--theme-hover)] rounded text-[var(--theme-text-secondary)]"
            title="Replace (Ctrl+H)"
          >
            <Replace size={16} />
          </button>
        </div>

        <button
          onClick={() => setIsAIOpen(!isAIOpen)}
          className="p-1 hover:bg-[var(--theme-hover)] hover:text-[var(--theme-text-accent)] rounded flex items-center gap-1"
          title="AI Assistant"
        >
          <Bug size={14} className="text-[var(--theme-text-accent)]" />
          <span className="text-[11px] font-medium text-[var(--theme-text-accent)]">
            Copilot Context
          </span>
        </button>
        <button
          onClick={handleOpenSettings}
          className="p-1 hover:bg-[var(--theme-hover)] rounded"
          title="Settings"
        >
          <SettingsIcon size={16} />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex min-h-0 bg-[var(--theme-surface-alt)]">
        <PanelGroup orientation="horizontal" className="flex-1 min-w-0">
          {/* Left Side: Editor + Bottom Pane */}
          <Panel minSize={30} className="flex flex-col">
            <div className="flex-1 flex flex-col min-h-0 relative bg-[var(--theme-panel)] shadow-inner">
              <PanelGroup orientation="vertical">
                <Panel
                  defaultSize={70}
                  minSize={20}
                  className="flex flex-col min-h-0 relative bg-[var(--theme-surface)]"
                >
                  {/* Tab Bar */}
                  {openFilePaths.length > 0 && (
                    <div className="flex bg-[var(--theme-surface-alt)] overflow-x-auto select-none shrink-0 border-b border-[var(--theme-border)] hide-scrollbar shadow-sm pt-1 px-1 gap-0.5">
                      {openFilePaths.map((path) => {
                        const name =
                          path === "__settings__"
                            ? "Settings"
                            : path.split("/").pop() || path;
                        const isActive = activeFilePath === path;
                        const isDirty = dirtyFiles.has(path);
                        return (
                          <div
                            key={path}
                            onClick={() => {
                              if (path === "__settings__") {
                                setActiveFilePath("__settings__");
                              } else {
                                handleSelectFile(path);
                              }
                            }}
                            className={`flex items-center gap-2 px-3 py-1.5 text-xs border border-b-0 rounded-t cursor-default max-w-[200px] min-w-[120px] group transition-colors ${
                              isActive
                                ? "bg-[var(--theme-surface)] text-[var(--theme-text-main)] border-[var(--theme-border)] border-t-[var(--theme-text-accent)] border-t-[3px]"
                                : "bg-[var(--theme-surface-alt)] text-[var(--theme-text-secondary)] border-transparent hover:bg-[var(--theme-hover)] hover:text-[var(--theme-text-main)]"
                            }`}
                          >
                            <span className="truncate flex-1 font-normal">
                              {isDirty ? `● ${name}` : name}
                            </span>
                            <button
                              onClick={(e) => handleCloseTab(path, e)}
                              className={`p-0.5 rounded-sm hover:bg-[var(--theme-active)] hover:text-[var(--theme-danger)] transition-colors ${isActive ? "opacity-100 text-[var(--theme-text-secondary)]" : "opacity-0 group-hover:opacity-100 text-[var(--theme-text-muted)]"}`}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex-1 overflow-hidden">
                    {isSettingsOpen ? (
                      <Settings />
                    ) : activeFilePath ? (
                      <CodeEditor
                        code={activeFileContent}
                        onChange={handleCodeChange}
                        onRun={handleRun}
                        onSave={handleSave}
                        breakpoints={breakpoints
                          .filter(
                            (b) => b.fileId === activeFilePath && b.enabled,
                          )
                          .map((b) => b.line)}
                        onBreakpointsChange={(bps) => {
                          setBreakpoints((prev) => {
                            const otherFilesBps = prev.filter(
                              (b) => b.fileId !== activeFilePath,
                            );
                            const newBps = bps.map((line) => ({
                              fileId: activeFilePath,
                              line,
                              enabled: true,
                            }));
                            return [...otherFilesBps, ...newBps];
                          });
                        }}
                        executionLine={executionLine}
                      />
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-[var(--theme-text-muted)] bg-[var(--theme-surface)]">
                        <Layout
                          size={48}
                          className="text-[var(--theme-border)] mb-4"
                        />
                        <span className="text-xl font-light">PyStudio IDE</span>
                        <span className="text-sm mt-2 opacity-60">
                          Select a file to start editing
                        </span>
                      </div>
                    )}
                  </div>
                </Panel>

                <PanelResizeHandle className="h-1.5 bg-[var(--theme-surface-alt)] hover:bg-[var(--theme-text-accent)] transition-colors cursor-row-resize z-20 flex items-center justify-center border-y border-[var(--theme-border)] shadow-sm">
                  <div className="w-8 h-[2px] bg-[var(--theme-border-focus)] rounded-full"></div>
                </PanelResizeHandle>

                <Panel
                  defaultSize={30}
                  minSize={10}
                  collapsible={true}
                  className="flex flex-col min-h-0 bg-[var(--theme-panel)] shadow-inner"
                >
                  {/* Bottom Pane */}
                  <div className="flex items-center h-7 bg-[var(--theme-surface-alt)] border-b border-[var(--theme-border)] shrink-0 px-2 font-medium">
                    <div className="flex h-full text-xs text-[var(--theme-text-secondary)]">
                      <button
                        onClick={() => setBottomPaneTab("error-list")}
                        className={`px-3 flex items-center transition-colors h-full border-t-[3px] ${bottomPaneTab === "error-list" ? "bg-[var(--theme-panel)] text-[var(--theme-text-accent)] border-t-[var(--theme-text-accent)]" : "hover:bg-[var(--theme-surface)] hover:text-[var(--theme-text-main)] border-t-transparent"}`}
                      >
                        Error List
                      </button>
                      <button
                        onClick={() => setBottomPaneTab("output")}
                        className={`px-3 flex items-center transition-colors h-full border-t-[3px] ${bottomPaneTab === "output" ? "bg-[var(--theme-panel)] text-[var(--theme-text-accent)] border-t-[var(--theme-text-accent)]" : "hover:bg-[var(--theme-surface)] hover:text-[var(--theme-text-main)] border-t-transparent"}`}
                      >
                        Output
                      </button>
                      <button
                        onClick={() => setBottomPaneTab("terminal")}
                        className={`px-3 flex items-center transition-colors h-full border-t-[3px] ${bottomPaneTab === "terminal" ? "bg-[var(--theme-panel)] text-[var(--theme-text-accent)] border-t-[var(--theme-text-accent)]" : "hover:bg-[var(--theme-surface)] hover:text-[var(--theme-text-main)] border-t-transparent"}`}
                      >
                        Terminal
                      </button>
                    </div>
                    <div className="flex-1" />
                    {bottomPaneTab === "output" && (
                      <button
                        onClick={clearConsole}
                        className="p-1 hover:bg-[var(--theme-hover)] hover:text-[var(--theme-text-main)] rounded text-[var(--theme-text-muted)] transition-colors h-full items-center flex"
                        title="Clear All"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>

                  <div className="flex-1 w-full min-h-0 relative bg-[var(--theme-panel)]">
                    {bottomPaneTab === "output" ? (
                      <Console
                        lines={consoleLines}
                        onClear={clearConsole}
                        showHeader={false}
                      />
                    ) : bottomPaneTab === "error-list" ? (
                      <div className="p-4 text-xs text-[var(--theme-text-muted)] selectable-text">
                        No errors found.
                      </div>
                    ) : (
                      <SimulatedTerminal projectPath={projectPath} />
                    )}
                  </div>
                </Panel>
              </PanelGroup>
            </div>
          </Panel>

          <PanelResizeHandle className="w-1.5 bg-[var(--theme-surface-alt)] hover:bg-[var(--theme-text-accent)] transition-colors cursor-col-resize z-20 flex flex-col items-center justify-center border-x border-[var(--theme-border)] shadow-sm">
            <div className="h-8 w-[2px] bg-[var(--theme-border-focus)] rounded-full"></div>
          </PanelResizeHandle>

          {/* Right Side: Sidebar */}
          <Panel
            defaultSize={20}
            minSize={15}
            collapsible={true}
            className="flex flex-col bg-[var(--theme-surface)] relative"
          >
            <div className="flex flex-col h-full bg-[var(--theme-panel)] overflow-hidden shadow-inner w-full border-b border-[var(--theme-border)]">
              <div className="h-7 flex items-center bg-[var(--theme-surface-alt)] border-b border-[var(--theme-border)] shrink-0 px-2 select-none shadow-sm z-10 w-full justify-between">
                <div className="font-medium text-[13px] text-[var(--theme-text-main)] truncate w-full flex justify-between items-center pr-1 gap-2">
                  {activeSidebar === "files"
                    ? "Solution Explorer"
                    : activeSidebar === "packages"
                      ? "Package Manager"
                      : activeSidebar === "source-control"
                        ? "Source Control"
                        : "Debugger"}
                  <div className="flex gap-0.5">
                    <button
                      title="Solution Explorer"
                      onClick={() => setActiveSidebar("files")}
                      className={`p-1 flex items-center justify-center rounded transition-colors ${activeSidebar === "files" ? "bg-[var(--theme-active)] text-[var(--theme-text-accent)]" : "hover:bg-[var(--theme-hover)] text-[var(--theme-text-secondary)]"}`}
                    >
                      <FileCode2 size={14} />
                    </button>
                    <button
                      title="Debug Window"
                      onClick={() => setActiveSidebar("debug")}
                      className={`p-1 flex items-center justify-center rounded transition-colors ${activeSidebar === "debug" ? "bg-[var(--theme-active)] text-[var(--theme-text-accent)]" : "hover:bg-[var(--theme-hover)] text-[var(--theme-text-secondary)]"}`}
                    >
                      <Bug size={14} />
                    </button>
                    <button
                      title="Package Manager"
                      onClick={() => setActiveSidebar("packages")}
                      className={`p-1 flex items-center justify-center rounded transition-colors ${activeSidebar === "packages" ? "bg-[var(--theme-active)] text-[var(--theme-text-accent)]" : "hover:bg-[var(--theme-hover)] text-[var(--theme-text-secondary)]"}`}
                    >
                      <Package size={14} />
                    </button>
                    <button
                      title="Source Control"
                      onClick={() => setActiveSidebar("source-control")}
                      className={`p-1 flex items-center justify-center rounded transition-colors ${activeSidebar === "source-control" ? "bg-[var(--theme-active)] text-[var(--theme-text-accent)]" : "hover:bg-[var(--theme-hover)] text-[var(--theme-text-secondary)]"}`}
                    >
                      <GitBranch size={14} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-hidden hide-scrollbar bg-[var(--theme-surface)] w-full block">
                {activeSidebar === "files" && (
                  <FileExplorer
                    tree={fileTree}
                    projectPath={projectPath}
                    activeFilePath={activeFilePath}
                    expandedPaths={expandedPaths}
                    onSelectFile={handleSelectFile}
                    onToggleFolder={handleToggleFolder}
                    onCreateFile={handleCreateFile}
                    onCreateFolder={handleCreateFolder}
                    onDelete={handleDeletePath}
                    onRename={handleRenamePath}
                    onRefresh={() => refreshFileTree(projectPath)}
                  />
                )}
                {activeSidebar === "debug" && (
                  <DebuggerSidebar
                    isDebugging={isDebugging}
                    isPaused={isPaused}
                    variables={debugVariables}
                    callStack={callStack}
                    breakpoints={breakpoints}
                    onStartDebug={handleStartDebug}
                    onStopDebug={handleStopDebug}
                    onPause={handlePause}
                    onResume={handleResume}
                    onStepOver={handleStepOver}
                    onStepInto={handleStepInto}
                    onStepOut={handleStepOut}
                    onRestart={handleRestart}
                    onBreakpointToggle={handleBreakpointToggle}
                    items={[]}
                  />
                )}
                {activeSidebar === "packages" && (
                  <PackagesSidebar
                    installedPackages={installedPackages}
                    onInstall={handleInstallPackage}
                    onUninstall={handleUninstallPackage}
                  />
                )}
                {activeSidebar === "source-control" && (
                  <SourceControlSidebar
                    isInitialized={gitState.isInitialized}
                    stagedIds={gitState.stagedIds}
                    changes={gitState.changes}
                    isPushing={gitState.isPushing}
                    isPulling={gitState.isPulling}
                    onInitialize={gitState.handleInitialize}
                    onStage={gitState.handleStage}
                    onUnstage={gitState.handleUnstage}
                    onCommit={gitState.handleCommit}
                    onPush={gitState.handlePush}
                    onPull={gitState.handlePull}
                  />
                )}
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>

      {/* Status Bar */}
      <div className="h-[22px] bg-[var(--theme-status)] text-[var(--theme-text-status)] flex items-center justify-between px-2 text-[11px] font-medium z-10 shrink-0 select-none">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 h-full">
            <span className="opacity-90">
              {isInitializing
                ? "Detecting Python..."
                : isRunning
                  ? "Running..."
                  : "Ready"}
            </span>
          </div>
          <span
            className="opacity-70 truncate max-w-[300px] cursor-pointer hover:opacity-100"
            title={projectPath}
          >
            {projectPath.split("/").pop()}
          </span>
        </div>
        <div className="flex items-center gap-4 opacity-90 h-full">
          {activeFilePath && activeFilePath !== "__settings__" && (
            <>
              <span className="px-1 hover:bg-white/20 rounded cursor-pointer transition-colors">
                Ln {executionLine || "1"}, Col 1
              </span>
              <span className="px-1 hover:bg-white/20 rounded cursor-pointer transition-colors">
                SPACES: 4
              </span>
              <span className="px-1 hover:bg-white/20 rounded cursor-pointer transition-colors">
                UTF-8
              </span>
              <span className="px-1 hover:bg-white/20 rounded cursor-pointer transition-colors">
                LF
              </span>
            </>
          )}
          {dirtyFiles.size > 0 && (
            <span className="px-1 text-yellow-300">
              {dirtyFiles.size} unsaved
            </span>
          )}
          {pythonInfo && (
            <span className="px-1 hover:bg-white/20 rounded cursor-pointer transition-colors">
              {pythonInfo}
            </span>
          )}
        </div>
      </div>

      {/* AI Assistant Drawer */}
      <AIChat
        currentCode={activeFileContent}
        isOpen={isAIOpen}
        onClose={() => setIsAIOpen(false)}
      />

      {/* File Search Modal (Ctrl+P) */}
      <FileSearch
        isOpen={isFileSearchOpen}
        projectPath={projectPath}
        onClose={() => setIsFileSearchOpen(false)}
        onSelect={handleSelectFile}
      />
    </div>
  );
}
