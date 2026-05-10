import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, FileCode, X } from "lucide-react";
import { searchFiles, type SearchResult } from "../services/filesystem";

interface FileSearchProps {
  isOpen: boolean;
  projectPath: string;
  onClose: () => void;
  onSelect: (path: string) => void;
}

export const FileSearch: React.FC<FileSearchProps> = ({
  isOpen,
  projectPath,
  onClose,
  onSelect,
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Debounced search
  const doSearch = useCallback(
    (q: string) => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      if (!q.trim()) {
        setResults([]);
        setSelectedIndex(0);
        return;
      }
      setIsSearching(true);
      searchTimer.current = setTimeout(async () => {
        try {
          const res = await searchFiles(projectPath, q, 20);
          setResults(res);
          setSelectedIndex(0);
        } catch {
          setResults([]);
        } finally {
          setIsSearching(false);
        }
      }, 100);
    },
    [projectPath],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    doSearch(val);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (results[selectedIndex]) {
          onSelect(results[selectedIndex].path);
          onClose();
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  };

  const handleSelect = (result: SearchResult) => {
    onSelect(result.path);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15%]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-xl mx-4 bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-lg shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center px-3 py-2 border-b border-[var(--theme-border)] bg-[var(--theme-surface-alt)]">
          <Search
            size={16}
            className="text-[var(--theme-text-muted)] mr-2 shrink-0"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search files by name..."
            className="flex-1 bg-transparent text-sm text-[var(--theme-text-main)] outline-none placeholder:text-[var(--theme-text-muted)]"
          />
          <button
            onClick={onClose}
            className="p-1 hover:bg-[var(--theme-hover)] rounded text-[var(--theme-text-muted)]"
          >
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[300px] overflow-y-auto">
          {results.length === 0 && query.trim() && !isSearching && (
            <div className="px-4 py-6 text-center text-sm text-[var(--theme-text-muted)]">
              No files found
            </div>
          )}
          {results.length === 0 && !query.trim() && (
            <div className="px-4 py-6 text-center text-sm text-[var(--theme-text-muted)]">
              Type to search files in your project
            </div>
          )}
          {results.map((result, index) => (
            <div
              key={result.path}
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`flex items-center gap-3 px-3 py-2 cursor-pointer text-sm transition-colors ${
                index === selectedIndex
                  ? "bg-[var(--theme-active)] text-[var(--theme-text-main)]"
                  : "text-[var(--theme-text-secondary)] hover:bg-[var(--theme-hover)]"
              }`}
            >
              <FileCode
                size={16}
                className={
                  index === selectedIndex
                    ? "text-[var(--theme-text-accent)]"
                    : "text-[var(--theme-text-muted)]"
                }
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{result.name}</div>
                <div className="text-xs text-[var(--theme-text-muted)] truncate">
                  {result.relative_path}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-3 py-1.5 border-t border-[var(--theme-border)] bg-[var(--theme-surface-alt)] flex items-center gap-4 text-[10px] text-[var(--theme-text-muted)]">
          <span>
            <kbd className="px-1 py-0.5 bg-[var(--theme-panel)] border border-[var(--theme-border)] rounded text-[9px]">
              ↑↓
            </kbd>{" "}
            navigate
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-[var(--theme-panel)] border border-[var(--theme-border)] rounded text-[9px]">
              ↵
            </kbd>{" "}
            open
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-[var(--theme-panel)] border border-[var(--theme-border)] rounded text-[9px]">
              esc
            </kbd>{" "}
            close
          </span>
        </div>
      </div>
    </div>
  );
};
