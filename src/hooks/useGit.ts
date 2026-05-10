import { useState, useCallback, useEffect, useMemo } from "react";
import { ProjectItem } from "../components/FileExplorer";
import { newId } from "../lib/id";

export interface Commit {
  id: string;
  message: string;
  timestamp: number;
  snapshot: ProjectItem[];
}

export type FileChangeType = "added" | "modified" | "deleted";

export interface FileChange {
  id: string;
  name: string;
  path: string;
  type: FileChangeType;
  item?: ProjectItem;
}

interface PersistedState {
  isInitialized: boolean;
  commits: Commit[];
  stagedIds: string[];
}

const STORAGE_KEY = "pystudio_git_v1";

function loadPersistedState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { isInitialized: false, commits: [], stagedIds: [] };
    const parsed = JSON.parse(raw);
    return {
      isInitialized: !!parsed.isInitialized,
      commits: Array.isArray(parsed.commits) ? parsed.commits : [],
      stagedIds: Array.isArray(parsed.stagedIds) ? parsed.stagedIds : [],
    };
  } catch {
    return { isInitialized: false, commits: [], stagedIds: [] };
  }
}

function buildPathMap(items: ProjectItem[]): Map<string, string> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const cache = new Map<string, string>();
  const resolve = (id: string): string => {
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    const item = byId.get(id);
    if (!item) {
      cache.set(id, "");
      return "";
    }
    const path = item.parentId ? `${resolve(item.parentId)}/${item.name}` : item.name;
    cache.set(id, path);
    return path;
  };
  items.forEach((i) => resolve(i.id));
  return cache;
}

export function useGit(items: ProjectItem[]) {
  const [persisted] = useState(loadPersistedState);
  const [isInitialized, setIsInitialized] = useState(persisted.isInitialized);
  const [commits, setCommits] = useState<Commit[]>(persisted.commits);
  const [stagedIds, setStagedIds] = useState<string[]>(persisted.stagedIds);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ isInitialized, commits, stagedIds }),
      );
    } catch (e) {
      console.error("Failed to persist git state", e);
    }
  }, [isInitialized, commits, stagedIds]);

  const handleInitialize = useCallback(() => {
    setIsInitialized(true);
    setCommits([
      {
        id: newId(),
        message: "Initial commit",
        timestamp: Date.now(),
        snapshot: items.map((item) => ({ ...item })),
      },
    ]);
    setStagedIds([]);
  }, [items]);

  const lastCommit = commits[commits.length - 1];

  const changes: FileChange[] = useMemo(() => {
    if (!isInitialized || !lastCommit) return [];
    const result: FileChange[] = [];
    const lastItems = lastCommit.snapshot;
    const lastMap = new Map<string, ProjectItem>(lastItems.map((i) => [i.id, i]));
    const currentMap = new Map<string, ProjectItem>(items.map((i) => [i.id, i]));
    const currentPaths = buildPathMap(items);
    const lastPaths = buildPathMap(lastItems);

    for (const item of items) {
      if (item.type === "folder") continue;
      const lastItem = lastMap.get(item.id);
      if (!lastItem) {
        result.push({
          id: item.id,
          name: item.name,
          path: currentPaths.get(item.id) || item.name,
          type: "added",
          item,
        });
      } else if (
        lastItem.content !== item.content ||
        lastItem.name !== item.name ||
        lastItem.parentId !== item.parentId
      ) {
        result.push({
          id: item.id,
          name: item.name,
          path: currentPaths.get(item.id) || item.name,
          type: "modified",
          item,
        });
      }
    }

    for (const lastItem of lastItems) {
      if (lastItem.type === "folder") continue;
      if (!currentMap.has(lastItem.id)) {
        result.push({
          id: lastItem.id,
          name: lastItem.name,
          path: lastPaths.get(lastItem.id) || lastItem.name,
          type: "deleted",
        });
      }
    }

    return result.sort((a, b) => a.path.localeCompare(b.path));
  }, [isInitialized, lastCommit, items]);

  const handleStage = useCallback((id: string) => {
    setStagedIds((prev) => Array.from(new Set([...prev, id])));
  }, []);

  const handleUnstage = useCallback((id: string) => {
    setStagedIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const handleCommit = useCallback(
    (message: string) => {
      if (!message.trim() || stagedIds.length === 0 || !lastCommit) return;
      const newSnapshot = [...lastCommit.snapshot];
      stagedIds.forEach((stagedId) => {
        const change = changes.find((c) => c.id === stagedId);
        if (!change) return;
        if (change.type === "deleted") {
          const idx = newSnapshot.findIndex((i) => i.id === stagedId);
          if (idx > -1) newSnapshot.splice(idx, 1);
        } else if (change.type === "added" && change.item) {
          newSnapshot.push({ ...change.item });
        } else if (change.type === "modified" && change.item) {
          const idx = newSnapshot.findIndex((i) => i.id === stagedId);
          if (idx > -1) newSnapshot[idx] = { ...change.item };
        }
      });
      setCommits((prev) => [
        ...prev,
        {
          id: newId(),
          message,
          timestamp: Date.now(),
          snapshot: newSnapshot,
        },
      ]);
      setStagedIds([]);
    },
    [stagedIds, changes, lastCommit],
  );

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const bundle = JSON.stringify({ version: 1, commits }, null, 2);
      const blob = new Blob([bundle], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pystudio-bundle-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }, [commits]);

  const handleImport = useCallback(async (file: File) => {
    setIsImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.commits)) {
        throw new Error("Invalid bundle format");
      }
      setCommits(parsed.commits);
      setIsInitialized(true);
      setStagedIds([]);
    } finally {
      setIsImporting(false);
    }
  }, []);

  return {
    isInitialized,
    commits,
    stagedIds,
    changes,
    isPushing: isExporting,
    isPulling: isImporting,
    handleInitialize,
    handleStage,
    handleUnstage,
    handleCommit,
    handlePush: handleExport,
    handlePull: handleImport,
  };
}
