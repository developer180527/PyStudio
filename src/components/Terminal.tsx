import React, { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { useTheme } from "../theme";
import "@xterm/xterm/css/xterm.css";

import {
  ptySpawn,
  ptyWrite,
  ptyKill,
  onPtyData,
  onPtyExit,
} from "../services/filesystem";

function getCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

function getXtermTheme(_theme: string) {
  return {
    background: getCssVar("--theme-panel", "#1E1E1E"),
    foreground: getCssVar("--theme-text-main", "#D4D4D4"),
    cursor: getCssVar("--theme-text-main", "#FFFFFF"),
    cursorAccent: getCssVar("--theme-panel", "#1E1E1E"),
    selectionBackground: getCssVar("--theme-active", "#094771"),
  };
}

interface RealTerminalProps {
  projectPath: string;
}

let ptyCounter = 0;

export const SimulatedTerminal: React.FC<RealTerminalProps> = ({
  projectPath,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string>("");
  const isSpawnedRef = useRef(false);
  const { theme } = useTheme();

  const spawnPty = useCallback(
    async (term: Terminal, fitAddon: FitAddon) => {
      if (isSpawnedRef.current) return;
      isSpawnedRef.current = true;

      const id = `pty-${++ptyCounter}-${Date.now()}`;
      ptyIdRef.current = id;

      const dims = fitAddon.proposeDimensions();
      const rows = dims?.rows || 24;
      const cols = dims?.cols || 80;

      try {
        await ptySpawn(id, projectPath, rows, cols);
      } catch (err: any) {
        term.writeln(
          `\r\nFailed to start shell: ${err?.message || err}\r\n`,
        );
        term.writeln("Falling back to basic terminal.\r\n");
        isSpawnedRef.current = false;
      }
    },
    [projectPath],
  );

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 14,
      theme: getXtermTheme(theme),
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Forward user input to PTY
    const dataDisposable = term.onData((data) => {
      if (ptyIdRef.current && isSpawnedRef.current) {
        ptyWrite(ptyIdRef.current, data).catch(() => {});
      }
    });

    // Listen for PTY output
    let unlistenData: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;

    (async () => {
      unlistenData = await onPtyData((id, data) => {
        if (id === ptyIdRef.current) {
          term.write(data);
        }
      });

      unlistenExit = await onPtyExit((id) => {
        if (id === ptyIdRef.current) {
          term.writeln("\r\n[Process exited]");
          isSpawnedRef.current = false;
        }
      });

      // Spawn the PTY
      await spawnPty(term, fitAddon);
    })();

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(terminalRef.current);

    return () => {
      dataDisposable.dispose();
      resizeObserver.disconnect();
      if (unlistenData) unlistenData();
      if (unlistenExit) unlistenExit();
      // Kill the PTY session
      if (ptyIdRef.current) {
        ptyKill(ptyIdRef.current).catch(() => {});
      }
      term.dispose();
      isSpawnedRef.current = false;
    };
  }, []);

  // Update theme
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = getXtermTheme(theme);
    }
  }, [theme]);

  return (
    <div className="h-full w-full flex flex-col bg-[var(--theme-panel)] text-[var(--theme-text-main)] overflow-hidden">
      <div className="flex-1 w-full p-2 h-full relative selectable-text">
        <div
          ref={terminalRef}
          className="absolute inset-0 h-full w-full p-2"
        />
      </div>
    </div>
  );
};
