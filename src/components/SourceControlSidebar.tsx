import React, { useState, useRef } from 'react';
import { GitBranch, GitCommit, Plus, Minus, Check, Download, Upload, Loader2 } from 'lucide-react';
import { FileChange } from '../hooks/useGit';

interface SourceControlSidebarProps {
  isInitialized: boolean;
  stagedIds: string[];
  changes: FileChange[];
  isPushing: boolean;
  isPulling: boolean;
  onInitialize: () => void;
  onStage: (id: string) => void;
  onUnstage: (id: string) => void;
  onCommit: (message: string) => void;
  onPush: () => void;
  onPull: (file: File) => void;
}

export const SourceControlSidebar: React.FC<SourceControlSidebarProps> = ({
  isInitialized,
  stagedIds,
  changes,
  isPushing,
  isPulling,
  onInitialize,
  onStage,
  onUnstage,
  onCommit,
  onPush,
  onPull,
}) => {
  const [commitMessage, setCommitMessage] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);

  if (!isInitialized) {
    return (
      <div className="w-full bg-[var(--theme-panel)] h-full flex flex-col items-center justify-center p-4 text-center">
        <GitBranch size={48} className="text-[var(--theme-text-muted)] mb-4" />
        <p className="text-sm text-[var(--theme-text-main)] mb-2">No Git repository initialized.</p>
        <p className="text-xs text-[var(--theme-text-muted)] mb-4">Initialize a repository to enable source control features.</p>
        <button
          onClick={onInitialize}
          className="bg-[var(--theme-surface-alt)] hover:bg-[var(--theme-hover)] text-[var(--theme-text-main)] px-4 py-2 rounded border border-[var(--theme-border)] text-xs font-semibold transition-colors"
        >
          Initialize Repository
        </button>
      </div>
    );
  }

  const handleCommitSubmit = () => {
    if (commitMessage.trim() && stagedIds.length > 0) {
      onCommit(commitMessage);
      setCommitMessage('');
    }
  };

  const stagedChanges = changes.filter(c => stagedIds.includes(c.id));
  const unstagedChanges = changes.filter(c => !stagedIds.includes(c.id));

  const renderFileChangeItem = (change: FileChange, isStaged: boolean) => {
    const isAdded = change.type === 'added';
    const isDeleted = change.type === 'deleted';
    const isModified = change.type === 'modified';

    let colorClass = 'text-[var(--theme-text-secondary)]';
    let letter = 'M';
    if (isAdded) {
      colorClass = 'text-[var(--theme-text-accent)]';
      letter = 'A';
    } else if (isDeleted) {
      colorClass = 'text-[var(--theme-danger)]';
      letter = 'D';
    } else if (isModified) {
      colorClass = 'text-[var(--theme-text-secondary)]';
    }

    return (
      <div key={change.id} className="flex items-center justify-between py-1 px-2 hover:bg-[var(--theme-hover)] group rounded text-xs cursor-default">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className={`font-mono text-[10px] font-bold ${colorClass} w-2`}>{letter}</span>
          <span className="truncate text-[var(--theme-text-main)]" title={change.path}>{change.path}</span>
        </div>
        <button
          onClick={() => isStaged ? onUnstage(change.id) : onStage(change.id)}
          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-[var(--theme-surface-alt)] rounded text-[var(--theme-text-main)] transition-opacity"
          title={isStaged ? "Unstage Changes" : "Stage Changes"}
        >
          {isStaged ? <Minus size={14} /> : <Plus size={14} />}
        </button>
      </div>
    );
  };

  return (
    <div className="w-full bg-[var(--theme-panel)] h-full flex flex-col shrink-0 text-[var(--theme-text-main)]">
      <div className="p-3 flex items-center justify-between border-b border-[var(--theme-border)] bg-[var(--theme-surface-alt)]">
        <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
           Source Control
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={isPulling}
            className="p-1 text-[var(--theme-text-secondary)] hover:bg-[var(--theme-active)] hover:text-[var(--theme-text-accent)] rounded transition-colors disabled:opacity-50"
            title="Import bundle (.json)"
          >
            {isPulling ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPull(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={onPush}
            disabled={isPushing}
            className="p-1 text-[var(--theme-text-secondary)] hover:bg-[var(--theme-active)] hover:text-[var(--theme-text-accent)] rounded transition-colors disabled:opacity-50"
            title="Export bundle (.json)"
          >
            {isPushing ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          </button>
        </div>
      </div>

      <div className="p-2 border-b border-[var(--theme-border)] flex flex-col gap-2">
        <textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Message (Cmd+Enter to commit)"
          className="w-full h-16 bg-[var(--theme-surface-alt)] border border-[var(--theme-border)] rounded px-2 py-1.5 text-xs text-[var(--theme-text-main)] placeholder-[var(--theme-text-muted)] focus:outline-none focus:border-[var(--theme-text-accent)] resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              handleCommitSubmit();
            }
          }}
        />
        <button
          onClick={handleCommitSubmit}
          disabled={!commitMessage.trim() || stagedIds.length === 0}
          className="flex items-center justify-center gap-2 w-full py-1.5 bg-[var(--theme-surface-alt)] border border-[var(--theme-border)] hover:bg-[var(--theme-hover)] disabled:hover:bg-[var(--theme-surface-alt)] disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs font-semibold transition-colors"
        >
          <Check size={14} />
          Commit
        </button>
      </div>

      <div className="flex-1 overflow-y-auto w-full hide-scrollbar px-2 py-2">
        {stagedChanges.length > 0 && (
          <div className="mb-4">
            <div className="text-[10px] font-semibold uppercase text-[var(--theme-text-secondary)] mb-1 px-1 flex justify-between">
              <span>Staged Changes</span>
              <span className="bg-[var(--theme-surface-alt)] px-1.5 py-0.5 rounded-full text-[9px]">{stagedChanges.length}</span>
            </div>
            {stagedChanges.map(change => renderFileChangeItem(change, true))}
          </div>
        )}

        {unstagedChanges.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold uppercase text-[var(--theme-text-secondary)] mb-1 px-1 flex justify-between">
              <span>Changes</span>
              <span className="bg-[var(--theme-surface-alt)] px-1.5 py-0.5 rounded-full text-[9px]">{unstagedChanges.length}</span>
            </div>
            {unstagedChanges.map(change => renderFileChangeItem(change, false))}
          </div>
        )}

        {changes.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-8 text-[var(--theme-text-muted)]">
            <GitCommit size={24} className="mb-2 opacity-50" />
            <span className="text-xs">No changes detected</span>
          </div>
        )}
      </div>
    </div>
  );
};
