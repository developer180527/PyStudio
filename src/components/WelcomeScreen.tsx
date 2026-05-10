import React, { useState, useEffect } from "react";
import {
  FolderOpen,
  FolderPlus,
  GitBranch,
  Loader2,
  AlertCircle,
  Clock,
  Trash2,
} from "lucide-react";
import {
  openFolderDialog,
  gitClone,
  getHomeDir,
  pathExists,
  getRecentProjects,
} from "../services/filesystem";

interface WelcomeScreenProps {
  onOpenProject: (path: string) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onOpenProject,
}) => {
  const [mode, setMode] = useState<"home" | "clone">("home");
  const [repoUrl, setRepoUrl] = useState("");
  const [cloneTarget, setCloneTarget] = useState("");
  const [cloneProgress, setCloneProgress] = useState<string[]>([]);
  const [isCloning, setIsCloning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const projects = await getRecentProjects();
        // Filter to existing paths
        const valid: string[] = [];
        for (const p of projects) {
          if (await pathExists(p)) valid.push(p);
        }
        setRecentProjects(valid);
        const home = await getHomeDir();
        setCloneTarget(home + "/Developer");
      } catch {
        // no saved data
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleOpenFolder = async () => {
    setError(null);
    const path = await openFolderDialog();
    if (path) {
      onOpenProject(path);
    }
  };

  const handleNewProject = async () => {
    setError(null);
    const path = await openFolderDialog();
    if (path) {
      onOpenProject(path);
    }
  };

  const handleRemoveRecent = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRecentProjects((prev) => prev.filter((p) => p !== path));
  };

  const handleClone = async () => {
    if (!repoUrl.trim()) {
      setError("Please enter a repository URL");
      return;
    }

    setError(null);
    setIsCloning(true);
    setCloneProgress([]);

    try {
      const repoName = repoUrl
        .split("/")
        .pop()
        ?.replace(/\.git$/, "");
      const targetPath = `${cloneTarget}/${repoName || "repo"}`;

      setCloneProgress((p) => [...p, `Cloning into '${targetPath}'...`]);

      await gitClone(repoUrl, targetPath, (line) => {
        setCloneProgress((p) => [...p, line]);
      });

      setCloneProgress((p) => [...p, "Clone completed successfully!"]);
      setTimeout(() => onOpenProject(targetPath), 500);
    } catch (err: any) {
      setError(err?.message || "Clone failed");
      setIsCloning(false);
    }
  };

  const handleBrowseCloneTarget = async () => {
    const path = await openFolderDialog();
    if (path) {
      setCloneTarget(path);
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[var(--theme-panel)]">
        <Loader2
          size={32}
          className="animate-spin text-[var(--theme-text-accent)]"
        />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--theme-panel)] text-[var(--theme-text-main)] select-none">
      {/* Header bar */}
      <div className="h-8 flex items-center px-4 bg-[var(--theme-surface-alt)] border-b border-[var(--theme-border)] text-sm font-medium shrink-0">
        PyStudio
      </div>

      <div className="flex-1 flex items-center justify-center overflow-y-auto py-8">
        <div className="w-full max-w-2xl px-8">
          {/* Logo / Title */}
          <div className="text-center mb-10">
            <h1 className="text-4xl font-light tracking-tight mb-2">
              PyStudio
            </h1>
            <p className="text-sm text-[var(--theme-text-muted)]">
              Python IDE powered by Pyodide
            </p>
          </div>

          {mode === "home" ? (
            <div className="space-y-3">
              {/* Recent projects */}
              {recentProjects.length > 0 && (
                <div className="mb-2">
                  <div className="text-xs font-medium text-[var(--theme-text-muted)] uppercase tracking-wider mb-2 px-1">
                    Recent Projects
                  </div>
                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                    {recentProjects.map((proj) => (
                      <button
                        key={proj}
                        onClick={() => onOpenProject(proj)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] hover:bg-[var(--theme-hover)] hover:border-[var(--theme-text-accent)] transition-all group text-left"
                      >
                        <Clock
                          size={16}
                          className="text-[var(--theme-text-accent)] shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {proj.split("/").pop()}
                          </div>
                          <div className="text-[11px] text-[var(--theme-text-muted)] truncate">
                            {proj}
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleRemoveRecent(proj, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--theme-active)] rounded transition-all text-[var(--theme-text-muted)] hover:text-[var(--theme-danger)]"
                          title="Remove from recent"
                        >
                          <Trash2 size={12} />
                        </button>
                      </button>
                    ))}
                  </div>
                  <div className="border-b border-[var(--theme-border)] my-4" />
                </div>
              )}

              {/* Open project */}
              <button
                onClick={handleOpenFolder}
                className="w-full flex items-center gap-4 p-4 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] hover:bg-[var(--theme-hover)] hover:border-[var(--theme-text-accent)] transition-all group text-left"
              >
                <div className="p-2.5 rounded-lg bg-[var(--theme-active)] text-[var(--theme-text-accent)] group-hover:scale-105 transition-transform">
                  <FolderOpen size={22} />
                </div>
                <div>
                  <div className="font-medium text-sm">Open Project</div>
                  <div className="text-xs text-[var(--theme-text-muted)] mt-0.5">
                    Open an existing folder as a project
                  </div>
                </div>
              </button>

              {/* New project */}
              <button
                onClick={handleNewProject}
                className="w-full flex items-center gap-4 p-4 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] hover:bg-[var(--theme-hover)] hover:border-[var(--theme-text-accent)] transition-all group text-left"
              >
                <div className="p-2.5 rounded-lg bg-[var(--theme-active)] text-[var(--theme-text-accent)] group-hover:scale-105 transition-transform">
                  <FolderPlus size={22} />
                </div>
                <div>
                  <div className="font-medium text-sm">
                    Create New Project
                  </div>
                  <div className="text-xs text-[var(--theme-text-muted)] mt-0.5">
                    Select or create an empty folder for a new project
                  </div>
                </div>
              </button>

              {/* Clone repo */}
              <button
                onClick={() => setMode("clone")}
                className="w-full flex items-center gap-4 p-4 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] hover:bg-[var(--theme-hover)] hover:border-[var(--theme-text-accent)] transition-all group text-left"
              >
                <div className="p-2.5 rounded-lg bg-[var(--theme-active)] text-[var(--theme-text-accent)] group-hover:scale-105 transition-transform">
                  <GitBranch size={22} />
                </div>
                <div>
                  <div className="font-medium text-sm">
                    Clone GitHub Repository
                  </div>
                  <div className="text-xs text-[var(--theme-text-muted)] mt-0.5">
                    Clone a Git repository to work on locally
                  </div>
                </div>
              </button>
            </div>
          ) : (
            /* Clone mode */
            <div className="space-y-4">
              <button
                onClick={() => {
                  setMode("home");
                  setError(null);
                  setCloneProgress([]);
                }}
                className="text-sm text-[var(--theme-text-accent)] hover:underline mb-2"
              >
                &larr; Back
              </button>

              <div>
                <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1.5">
                  Repository URL
                </label>
                <input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/user/repo.git"
                  className="w-full px-3 py-2.5 bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-lg text-sm text-[var(--theme-text-main)] outline-none focus:border-[var(--theme-text-accent)] transition-colors placeholder:text-[var(--theme-text-muted)]"
                  disabled={isCloning}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1.5">
                  Clone Into
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cloneTarget}
                    onChange={(e) => setCloneTarget(e.target.value)}
                    className="flex-1 px-3 py-2.5 bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-lg text-sm text-[var(--theme-text-main)] outline-none focus:border-[var(--theme-text-accent)] transition-colors"
                    disabled={isCloning}
                  />
                  <button
                    onClick={handleBrowseCloneTarget}
                    disabled={isCloning}
                    className="px-4 py-2.5 bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-lg text-sm hover:bg-[var(--theme-hover)] transition-colors disabled:opacity-50"
                  >
                    Browse
                  </button>
                </div>
              </div>

              <button
                onClick={handleClone}
                disabled={isCloning || !repoUrl.trim()}
                className="w-full py-2.5 bg-[var(--theme-text-accent)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isCloning ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Cloning...
                  </>
                ) : (
                  <>
                    <GitBranch size={14} />
                    Clone Repository
                  </>
                )}
              </button>

              {/* Clone progress */}
              {cloneProgress.length > 0 && (
                <div className="bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-xs text-[var(--theme-text-secondary)]">
                  {cloneProgress.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="mt-4 flex items-center gap-2 p-3 bg-[var(--theme-danger-bg-hover)] border border-[var(--theme-danger)] rounded-lg text-sm text-[var(--theme-danger)]">
              <AlertCircle size={16} />
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="h-6 flex items-center px-4 bg-[var(--theme-status)] text-[var(--theme-text-status)] text-[11px] shrink-0">
        <span className="opacity-80">
          v0.1.0
        </span>
      </div>
    </div>
  );
};
