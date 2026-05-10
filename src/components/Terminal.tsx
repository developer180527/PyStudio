import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useTheme } from '../theme';
import '@xterm/xterm/css/xterm.css';

import { readDirectory, readFileContent } from '../services/filesystem';
import { installPythonPackage } from '../services/pyodide';

function getCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function getXtermTheme(_theme: string) {
  return {
    background: getCssVar('--theme-panel', '#1E1E1E'),
    foreground: getCssVar('--theme-text-main', '#D4D4D4'),
    cursor: getCssVar('--theme-text-main', '#FFFFFF'),
  };
}

interface SimulatedTerminalProps {
  projectPath: string;
}

export const SimulatedTerminal: React.FC<SimulatedTerminalProps> = ({ projectPath }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { theme } = useTheme();

  const projectPathRef = useRef(projectPath);
  useEffect(() => {
    projectPathRef.current = projectPath;
  }, [projectPath]);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 14,
      theme: getXtermTheme(theme),
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln('Welcome to PyStudio Terminal.');
    term.writeln('Type "help" for a list of commands.');
    term.write('\r\n$ ');

    let currentInput = '';

    const handleData = term.onData(async e => {
        switch (e) {
            case '\r':
                term.writeln('');
                if (currentInput.trim().length > 0) {
                    await processCommand(currentInput.trim(), term);
                }
                currentInput = '';
                term.write('\r\n$ ');
                break;
            case '':
                if (currentInput.length > 0) {
                    currentInput = currentInput.substring(0, currentInput.length - 1);
                    term.write('\b \b');
                }
                break;
            default:
                if (e >= String.fromCharCode(0x20) && e <= String.fromCharCode(0x7E)) {
                    currentInput += e;
                    term.write(e);
                }
        }
    });

    const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
    });
    resizeObserver.observe(terminalRef.current);

    return () => {
        handleData.dispose();
        resizeObserver.disconnect();
        term.dispose();
    };
  }, []);

  useEffect(() => {
      if (xtermRef.current) {
          xtermRef.current.options.theme = getXtermTheme(theme);
      }
  }, [theme]);

  const processCommand = async (commandStr: string, term: Terminal) => {
      const args = commandStr.split(' ');
      const command = args[0].toLowerCase();

      switch(command) {
          case 'help':
              term.writeln('Available Commands:');
              term.writeln('  help    - show this help');
              term.writeln('  clear   - clear the terminal');
              term.writeln('  echo    - output text');
              term.writeln('  date    - print current date');
              term.writeln('  whoami  - print current user');
              term.writeln('  ls      - list files in project root');
              term.writeln('  cat     - display file content');
              term.writeln('  pwd     - print working directory');
              term.writeln('  pip     - install python packages (e.g. pip install numpy)');
              break;
          case 'pwd':
              term.writeln(projectPathRef.current);
              break;
          case 'ls': {
              try {
                  const entries = await readDirectory(projectPathRef.current);
                  const names = entries.map(e =>
                    e.is_dir ? `\x1b[1;34m${e.name}\x1b[0m` : e.name
                  );
                  term.writeln(names.join('  '));
              } catch (err: any) {
                  term.writeln(`ls: ${err?.message || err}`);
              }
              break;
          }
          case 'cat': {
              if (args.length < 2) {
                  term.writeln('cat: missing file operand');
                  break;
              }
              const targetName = args[1];
              const filePath = `${projectPathRef.current}/${targetName}`;
              try {
                  const content = await readFileContent(filePath);
                  term.writeln(content.replace(/\n/g, '\r\n'));
              } catch {
                  term.writeln(`cat: ${targetName}: No such file or directory`);
              }
              break;
          }
          case 'pip':
              if (args.length < 2) {
                  term.writeln('Usage: pip install <package>');
                  break;
              }
              if (args[1] === 'install') {
                  if (args.length < 3) {
                      term.writeln('Usage: pip install <package>');
                      break;
                  }
                  const pkg = args.slice(2).join(' ');
                  await installPythonPackage(
                      pkg,
                      (out) => term.write(out),
                      (err) => term.write('\x1b[31m' + err + '\x1b[0m')
                  );
              } else {
                  term.writeln(`pip: unknown command "${args[1]}"`);
              }
              break;
          case 'clear':
              term.reset();
              break;
          case 'echo':
              term.writeln(args.slice(1).join(' '));
              break;
          case 'date':
              term.writeln(new Date().toString());
              break;
          case 'whoami':
              term.writeln('guest');
              break;
          default:
              term.writeln(`bash: ${command}: command not found`);
      }
  };

  return (
    <div className="h-full w-full flex flex-col bg-[var(--theme-panel)] text-[var(--theme-text-main)] overflow-hidden">
        <div className="flex-1 w-full p-2 h-full relative selectable-text">
            <div ref={terminalRef} className="absolute inset-0 h-full w-full p-2" />
        </div>
    </div>
  );
};
