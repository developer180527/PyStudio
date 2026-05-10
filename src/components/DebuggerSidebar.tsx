import React from "react";
import {
  Play,
  Pause,
  Square,
  ArrowDownToLine,
  ArrowUpFromLine,
  StepForward,
  RotateCcw,
} from "lucide-react";

export interface DebugVariable {
  name: string;
  value: string;
  type: string;
}

export interface CallStackFrame {
  id: string;
  name: string;
  file: string;
  line: number;
}

interface DebuggerSidebarProps {
  isDebugging: boolean;
  isPaused: boolean;
  variables: DebugVariable[];
  callStack: CallStackFrame[];
  breakpoints: { fileId: string; line: number; enabled: boolean }[];
  onStartDebug: () => void;
  onStopDebug: () => void;
  onPause: () => void;
  onResume: () => void;
  onStepOver: () => void;
  onStepInto: () => void;
  onStepOut: () => void;
  onRestart: () => void;
  onBreakpointToggle: (fileId: string, line: number) => void;
  items: { id: string; name: string }[];
}

export const DebuggerSidebar: React.FC<DebuggerSidebarProps> = ({
  isDebugging,
  isPaused,
  variables,
  callStack,
  breakpoints,
  onStartDebug,
  onStopDebug,
  onPause,
  onResume,
  onStepOver,
  onStepInto,
  onStepOut,
  onRestart,
  onBreakpointToggle,
  items,
}) => {
  const formatLine = (fileId: string, line: number) => {
    const file = items.find((i) => i.id === fileId);
    const name = file ? file.name : fileId.split("/").pop() || fileId;
    return `${name}:${line}`;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--theme-surface)]">
      <div className="p-3 border-b border-[var(--theme-border)] bg-[var(--theme-surface-alt)] font-medium text-xs tracking-wider uppercase flex items-center justify-between">
        <span>Debug</span>
      </div>

      <div className="p-2 border-b border-[var(--theme-border)]">
        <div className="flex items-center justify-between bg-[var(--theme-panel)] p-1 rounded border border-[var(--theme-border)]">
          {!isDebugging ? (
            <button
              onClick={onStartDebug}
              className="flex-1 flex items-center justify-center gap-1 p-1 hover:bg-[var(--theme-hover)] text-[var(--theme-text-accent)] rounded transition-colors"
              title="Start Debugging"
            >
              <Play size={16} />
            </button>
          ) : (
            <>
              {isPaused ? (
                <button
                  onClick={onResume}
                  className="p-1 hover:bg-[var(--theme-hover)] text-[var(--theme-text-accent)] rounded transition-colors"
                  title="Continue"
                >
                  <Play size={16} />
                </button>
              ) : (
                <button
                  onClick={onPause}
                  className="p-1 hover:bg-[var(--theme-hover)] text-[var(--theme-text-secondary)] rounded transition-colors"
                  title="Pause"
                >
                  <Pause size={16} />
                </button>
              )}

              <button
                disabled={!isPaused}
                onClick={onStepOver}
                className={`p-1 rounded transition-colors ${isPaused ? "hover:bg-[var(--theme-hover)] text-[var(--theme-text-accent)]" : "text-[var(--theme-text-muted)] cursor-not-allowed"}`}
                title="Step Over"
              >
                <StepForward size={16} />
              </button>
              <button
                disabled={!isPaused}
                onClick={onStepInto}
                className={`p-1 rounded transition-colors ${isPaused ? "hover:bg-[var(--theme-hover)] text-[var(--theme-text-accent)]" : "text-[var(--theme-text-muted)] cursor-not-allowed"}`}
                title="Step Into"
              >
                <ArrowDownToLine size={16} />
              </button>
              <button
                disabled={!isPaused}
                onClick={onStepOut}
                className={`p-1 rounded transition-colors ${isPaused ? "hover:bg-[var(--theme-hover)] text-[var(--theme-text-accent)]" : "text-[var(--theme-text-muted)] cursor-not-allowed"}`}
                title="Step Out"
              >
                <ArrowUpFromLine size={16} />
              </button>
              <button
                onClick={onRestart}
                className="p-1 hover:bg-[var(--theme-hover)] text-[var(--theme-text-accent)] rounded transition-colors"
                title="Restart"
              >
                <RotateCcw size={16} />
              </button>
              <button
                onClick={onStopDebug}
                className="p-1 hover:bg-[var(--theme-hover)] text-[var(--theme-danger)] rounded transition-colors"
                title="Stop"
              >
                <Square size={16} fill="currentColor" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mb-4">
          <div className="px-3 py-1 bg-[var(--theme-panel)] text-xs font-semibold uppercase text-[var(--theme-text-secondary)] border-b border-t border-[var(--theme-border)]">
            Variables
          </div>
          <div className="p-2 text-sm text-[var(--theme-text-main)]">
            {variables.length > 0 ? (
              variables.map((v, i) => (
                <div
                  key={i}
                  className="flex gap-2 mb-1 group hover:bg-[var(--theme-hover)] px-1 rounded"
                >
                  <span className="text-[var(--theme-text-accent)] w-1/3 truncate" title={v.name}>
                    {v.name}
                  </span>
                  <span
                    className="text-[var(--theme-text-muted)] w-1/6 truncate text-xs"
                    title={v.type}
                  >
                    {v.type}
                  </span>
                  <span
                    className="text-[var(--theme-text-main)] flex-1 truncate"
                    title={v.value}
                  >
                    {v.value}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-[var(--theme-text-muted)] text-xs italic px-1">
                No variables
              </div>
            )}
          </div>
        </div>

        <div className="mb-4">
          <div className="px-3 py-1 bg-[var(--theme-panel)] text-xs font-semibold uppercase text-[var(--theme-text-secondary)] border-b border-t border-[var(--theme-border)]">
            Call Stack
          </div>
          <div className="p-2 text-sm text-[var(--theme-text-main)]">
            {callStack.length > 0 ? (
              callStack.map((f, i) => (
                <div
                  key={f.id}
                  className={`py-1 px-2 rounded cursor-pointer ${i === 0 ? "bg-[var(--theme-active)]" : "hover:bg-[var(--theme-hover)]"}`}
                >
                  <div className="font-medium truncate">{f.name}</div>
                  <div className="text-xs text-[var(--theme-text-secondary)] truncate">
                    {f.file}:{f.line}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-[var(--theme-text-muted)] text-xs italic px-1">
                Not paused
              </div>
            )}
          </div>
        </div>

        <div className="mb-4">
          <div className="px-3 py-1 bg-[var(--theme-panel)] text-xs font-semibold uppercase text-[var(--theme-text-secondary)] border-b border-t border-[var(--theme-border)]">
            Breakpoints
          </div>
          <div className="p-2 text-sm text-[var(--theme-text-main)]">
            {breakpoints.length > 0 ? (
              breakpoints.map((b, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 py-1 px-1 hover:bg-[var(--theme-hover)] rounded"
                >
                  <input
                    type="checkbox"
                    checked={b.enabled}
                    onChange={() => onBreakpointToggle(b.fileId, b.line)}
                    className="accent-[var(--theme-danger)] cursor-pointer"
                  />
                  <span className="truncate">
                    {formatLine(b.fileId, b.line)}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-[var(--theme-text-muted)] text-xs italic px-1">
                No breakpoints
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
