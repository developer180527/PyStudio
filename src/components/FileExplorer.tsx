import React, { useState } from "react";
import {
  FileCode,
  Trash2,
  ChevronRight,
  Folder,
  FolderPlus,
  FilePlus,
  Edit2,
  RefreshCw,
} from "lucide-react";
import { cn } from "../lib/utils";
import type { FsEntry } from "../services/filesystem";

export interface ProjectItem {
  id: string;
  name: string;
  type: "file" | "folder";
  parentId: string | null;
  content?: string;
  isExpanded?: boolean;
}

interface FileExplorerProps {
  tree: FsEntry[];
  projectPath: string;
  activeFilePath: string | null;
  expandedPaths: Set<string>;
  onSelectFile: (path: string) => void;
  onToggleFolder: (path: string) => void;
  onCreateFile: (parentDir: string, name: string) => void;
  onCreateFolder: (parentDir: string, name: string) => void;
  onDelete: (path: string) => void;
  onRename: (oldPath: string, newName: string) => void;
  onRefresh: () => void;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  tree,
  projectPath,
  activeFilePath,
  expandedPaths,
  onSelectFile,
  onToggleFolder,
  onCreateFile,
  onCreateFolder,
  onDelete,
  onRename,
  onRefresh,
}) => {
  const [creatingIn, setCreatingIn] = useState<{
    parentPath: string;
    type: "file" | "folder";
  } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim() && creatingIn) {
      let finalName = newName.trim();
      if (
        creatingIn.type === "file" &&
        !finalName.includes(".")
      ) {
        finalName += ".py";
      }
      if (creatingIn.type === "file") {
        onCreateFile(creatingIn.parentPath, finalName);
      } else {
        onCreateFolder(creatingIn.parentPath, finalName);
      }
      setNewName("");
      setCreatingIn(null);
    }
  };

  const handleRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim() && renamingPath) {
      onRename(renamingPath, newName.trim());
      setNewName("");
      setRenamingPath(null);
    }
  };

  const startRenaming = (entry: FsEntry) => {
    setRenamingPath(entry.path);
    setNewName(entry.name);
    setCreatingIn(null);
  };

  const handleDragStart = (e: React.DragEvent, path: string) => {
    e.stopPropagation();
    setDraggedPath(path);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", path);
  };

  const handleDragOver = (e: React.DragEvent, path: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (path !== dragOverPath) {
      setDragOverPath(path);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPath(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPath(null);
    setDraggedPath(null);
  };

  const renderEntry = (entry: FsEntry, level: number = 0) => {
    const isActive = activeFilePath === entry.path;
    const isExpanded = expandedPaths.has(entry.path);

    return (
      <React.Fragment key={entry.path}>
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, entry.path)}
          onDragOver={(e) =>
            handleDragOver(e, entry.is_dir ? entry.path : null)
          }
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "group flex items-center justify-between px-2 py-1 cursor-pointer text-sm transition-colors",
            isActive
              ? "bg-[var(--theme-status)] text-[var(--theme-text-status)]"
              : "text-[var(--theme-text-main)] hover:bg-[var(--theme-hover)]",
            dragOverPath === entry.path
              ? "bg-[var(--theme-active)] border border-dashed border-[var(--theme-text-accent)]"
              : "border border-transparent",
            draggedPath === entry.path ? "opacity-50" : "opacity-100",
          )}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => {
            if (entry.is_dir) {
              onToggleFolder(entry.path);
            } else {
              onSelectFile(entry.path);
            }
          }}
        >
          <div className="flex-1 flex items-center gap-1.5 truncate">
            {entry.is_dir ? (
              <>
                <ChevronRight
                  size={14}
                  className={cn(
                    "transition-transform",
                    isExpanded && "rotate-90",
                    isActive
                      ? "text-[var(--theme-text-status)]"
                      : "text-[var(--theme-text-secondary)]",
                  )}
                />
                <Folder
                  size={16}
                  className={cn(
                    isActive
                      ? "text-[var(--theme-text-status)]"
                      : "text-[var(--theme-text-accent)]",
                  )}
                  fill={isExpanded ? "currentColor" : "none"}
                />
              </>
            ) : (
              <FileCode
                size={16}
                className={cn(
                  isActive
                    ? "text-[var(--theme-text-status)]"
                    : "text-[var(--theme-text-secondary)]",
                )}
              />
            )}

            {renamingPath === entry.path ? (
              <form
                onSubmit={handleRename}
                className="flex-1"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onBlur={() => setRenamingPath(null)}
                  className="w-full bg-[var(--theme-panel)] border border-[var(--theme-border-focus)] px-1 py-0 text-sm text-[var(--theme-text-main)] outline-none"
                />
              </form>
            ) : (
              <span className="truncate">{entry.name}</span>
            )}
          </div>

          {renamingPath !== entry.path && (
            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
              {entry.is_dir && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCreatingIn({
                        parentPath: entry.path,
                        type: "file",
                      });
                      if (!isExpanded) onToggleFolder(entry.path);
                    }}
                    className={cn(
                      "p-1",
                      isActive
                        ? "hover:text-[var(--theme-text-status)]"
                        : "hover:text-[var(--theme-text-accent)]",
                    )}
                    title="New File"
                  >
                    <FilePlus size={12} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCreatingIn({
                        parentPath: entry.path,
                        type: "folder",
                      });
                      if (!isExpanded) onToggleFolder(entry.path);
                    }}
                    className={cn(
                      "p-1",
                      isActive
                        ? "hover:text-[var(--theme-text-status)]"
                        : "hover:text-[var(--theme-text-accent)]",
                    )}
                    title="New Folder"
                  >
                    <FolderPlus size={12} />
                  </button>
                </>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  startRenaming(entry);
                }}
                className={cn(
                  "p-1",
                  isActive
                    ? "hover:text-[var(--theme-text-status)]"
                    : "hover:text-[var(--theme-text-accent)]",
                )}
                title="Rename"
              >
                <Edit2 size={12} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(entry.path);
                }}
                className={cn(
                  "p-1",
                  isActive
                    ? "hover:text-[var(--theme-danger-bg-hover)]"
                    : "hover:text-[var(--theme-danger)]",
                )}
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>

        {entry.is_dir && isExpanded && entry.children && (
          <>
            {entry.children.map((child) => renderEntry(child, level + 1))}
          </>
        )}

        {creatingIn?.parentPath === entry.path && (
          <form
            onSubmit={handleCreate}
            className="my-1"
            style={{ paddingLeft: `${(level + 1) * 12 + 8}px` }}
          >
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={() => setCreatingIn(null)}
              className="w-full bg-[var(--theme-panel)] border border-[var(--theme-border-focus)] px-2 py-0.5 text-sm text-[var(--theme-text-main)] outline-none"
              placeholder={
                creatingIn.type === "file" ? "file.py" : "Folder name"
              }
            />
          </form>
        )}
      </React.Fragment>
    );
  };

  const projectName = projectPath.split("/").pop() || projectPath;

  return (
    <div className="w-full bg-[var(--theme-panel)] h-full flex flex-col shrink-0 text-[var(--theme-text-main)]">
      <div className="p-3 flex items-center justify-between border-b border-[var(--theme-border)] bg-[var(--theme-surface-alt)]">
        <span
          className="text-xs font-bold uppercase text-[var(--theme-text-main)] tracking-wider truncate"
          title={projectPath}
        >
          {projectName}
        </span>
        <div className="flex gap-1">
          <button
            onClick={onRefresh}
            className="p-1 text-[var(--theme-text-secondary)] hover:bg-[var(--theme-active)] hover:text-[var(--theme-text-accent)] rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() =>
              setCreatingIn({ parentPath: projectPath, type: "file" })
            }
            className="p-1 text-[var(--theme-text-secondary)] hover:bg-[var(--theme-active)] hover:text-[var(--theme-text-accent)] rounded transition-colors"
            title="New File"
          >
            <FilePlus size={16} />
          </button>
          <button
            onClick={() =>
              setCreatingIn({ parentPath: projectPath, type: "folder" })
            }
            className="p-1 text-[var(--theme-text-secondary)] hover:bg-[var(--theme-active)] hover:text-[var(--theme-text-accent)] rounded transition-colors"
            title="New Folder"
          >
            <FolderPlus size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {tree.map((entry) => renderEntry(entry, 0))}

        {creatingIn?.parentPath === projectPath && (
          <form onSubmit={handleCreate} className="px-4 py-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={() => setCreatingIn(null)}
              className="w-full bg-[var(--theme-panel)] border border-[var(--theme-border-focus)] px-2 py-1 text-sm text-[var(--theme-text-main)] outline-none"
              placeholder={
                creatingIn.type === "file" ? "filename.py" : "folder name"
              }
            />
          </form>
        )}

        {tree.length === 0 && !creatingIn && (
          <div className="p-4 text-xs text-[var(--theme-text-muted)] text-center">
            Empty project. Create a file to get started.
          </div>
        )}
      </div>
    </div>
  );
};
