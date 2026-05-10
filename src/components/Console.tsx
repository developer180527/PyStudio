import React, { useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, Trash2, XCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface ConsoleLine {
  text: string;
  type: 'output' | 'error' | 'system';
}

interface ConsoleProps {
  lines: ConsoleLine[];
  onClear: () => void;
  showHeader?: boolean;
}

export const Console: React.FC<ConsoleProps> = ({ lines, onClear, showHeader = true }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div className="h-full flex flex-col bg-[var(--theme-panel)] text-[var(--theme-text-main)]">
      {showHeader && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--theme-border)] bg-[var(--theme-surface-alt)]">
          <div className="flex items-center gap-2 text-xs font-medium text-[var(--theme-text-main)] uppercase tracking-wider">
            <TerminalIcon size={14} />
            <span>Output Console</span>
          </div>
          <button 
            onClick={onClear}
            className="p-1 hover:bg-[var(--theme-active)] hover:text-[var(--theme-text-accent)] rounded text-[var(--theme-text-secondary)] transition-colors"
            title="Clear Console"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
      <div 
        ref={scrollRef}
        className="flex-1 p-4 font-mono text-sm overflow-y-auto selectable-text"
      >
        {lines.length === 0 ? (
          <div className="text-[var(--theme-text-muted)] italic">No output yet. Run your code to see results.</div>
        ) : (
          lines.map((line, i) => (
            <div 
              key={i} 
              className={cn(
                "whitespace-pre-wrap mb-1",
                line.type === 'error' ? "text-[var(--theme-danger)]" :
                line.type === 'system' ? "text-[var(--theme-text-accent)]" : "text-[var(--theme-text-main)]"
              )}
            >
              {line.type === 'error' && <XCircle size={12} className="inline mr-2 mb-0.5" />}
              {line.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
