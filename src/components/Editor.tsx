import React, { useRef, useEffect, useState } from "react";
import Editor, { OnMount, useMonaco } from "@monaco-editor/react";
import { useTheme } from "../theme";
import type * as monacoType from "monaco-editor";

interface EditorPrefs {
  fontSize: number;
  tabSize: number;
  lineNumbers: "on" | "off" | "relative";
  autoSave: "off" | "afterDelay" | "onFocusChange" | "onWindowChange";
}

const PREFS_STORAGE = "pystudio_editor_prefs";
const DEFAULT_PREFS: EditorPrefs = {
  fontSize: 14,
  tabSize: 4,
  lineNumbers: "on",
  autoSave: "off",
};

function loadPrefs(): EditorPrefs {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

interface CodeEditorProps {
  code: string;
  onChange: (value: string | undefined) => void;
  onRun: () => void;
  onSave?: () => void;
  breakpoints?: number[];
  onBreakpointsChange?: (breakpoints: number[]) => void;
  executionLine?: number;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  code,
  onChange,
  onRun,
  onSave,
  breakpoints = [],
  onBreakpointsChange,
  executionLine,
}) => {
  const { theme } = useTheme();
  const editorRef = useRef<monacoType.editor.IStandaloneCodeEditor | null>(
    null,
  );
  const monaco = useMonaco();
  const decorationsRef = useRef<string[]>([]);
  const executionDecorationRef = useRef<string[]>([]);
  const [prefs, setPrefs] = useState<EditorPrefs>(loadPrefs);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<EditorPrefs>).detail;
      if (detail) setPrefs(detail);
    };
    window.addEventListener("editor:prefs", handler);
    return () => window.removeEventListener("editor:prefs", handler);
  }, []);

  // Update breakpoint decorations
  useEffect(() => {
    if (!editorRef.current || !monaco) return;

    const newDecorations: monacoType.editor.IModelDeltaDecoration[] =
      breakpoints.map((line) => ({
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: false,
          marginClassName: "editor-breakpoint-margin",
          glyphMarginClassName: "editor-breakpoint",
        },
      }));

    decorationsRef.current = editorRef.current.deltaDecorations(
      decorationsRef.current,
      newDecorations,
    );
  }, [breakpoints, monaco]);

  // Update execution line decoration
  useEffect(() => {
    if (!editorRef.current || !monaco) return;

    if (executionLine && executionLine > 0) {
      const execDecoration: monacoType.editor.IModelDeltaDecoration[] = [
        {
          range: new monaco.Range(executionLine, 1, executionLine, 1),
          options: {
            isWholeLine: true,
            className: "editor-execution-line",
            glyphMarginClassName: "editor-execution-glyph",
          },
        },
      ];
      executionDecorationRef.current = editorRef.current.deltaDecorations(
        executionDecorationRef.current,
        execDecoration,
      );
      editorRef.current.revealLineInCenter(executionLine);
    } else {
      executionDecorationRef.current = editorRef.current.deltaDecorations(
        executionDecorationRef.current,
        [],
      );
    }
  }, [executionLine, monaco]);

  // Listen for external commands (like find/replace from menu/toolbar)
  useEffect(() => {
    const handleEditorCommand = (e: CustomEvent) => {
      if (!editorRef.current) return;

      switch (e.detail) {
        case "find":
          editorRef.current.getAction("actions.find")?.run();
          break;
        case "replace":
          editorRef.current
            .getAction("editor.action.startFindReplaceAction")
            ?.run();
          break;
        case "format_doc":
          editorRef.current.getAction("editor.action.formatDocument")?.run();
          break;
        case "format_selection":
          editorRef.current.getAction("editor.action.formatSelection")?.run();
          break;
      }
    };

    window.addEventListener(
      "editor:command",
      handleEditorCommand as EventListener,
    );
    return () =>
      window.removeEventListener(
        "editor:command",
        handleEditorCommand as EventListener,
      );
  }, []);

  const handleEditorChange = (value: string | undefined) => {
    onChange(value);
  };

  const breakpointsRef = useRef<number[]>(breakpoints);
  useEffect(() => {
    breakpointsRef.current = breakpoints;
  }, [breakpoints]);

  const onBreakpointsChangeRef = useRef(onBreakpointsChange);
  useEffect(() => {
    onBreakpointsChangeRef.current = onBreakpointsChange;
  }, [onBreakpointsChange]);

  const onRunRef = useRef(onRun);
  useEffect(() => {
    onRunRef.current = onRun;
  }, [onRun]);

  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const handleEditorDidMount: OnMount = (editor, monacoInstance) => {
    editorRef.current = editor;

    // Listen for clicks on the glyph margin to toggle breakpoints
    editor.onMouseDown((e) => {
      if (
        e.target.type ===
          monacoInstance.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
        e.target.type ===
          monacoInstance.editor.MouseTargetType.GUTTER_LINE_NUMBERS
      ) {
        const lineNumber = e.target.position?.lineNumber;
        const currentBreakpoints = breakpointsRef.current;
        const changeHandler = onBreakpointsChangeRef.current;
        if (lineNumber && changeHandler) {
          changeHandler(
            currentBreakpoints.includes(lineNumber)
              ? currentBreakpoints.filter((b) => b !== lineNumber)
              : [...currentBreakpoints, lineNumber],
          );
        }
      }
    });

    // Add custom keyboard shortcut for running code (Cmd+Enter / Ctrl+Enter)
    editor.addCommand(
      monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter,
      () => {
        onRunRef.current();
      },
    );

    // Add custom keyboard shortcut for saving (Cmd+S / Ctrl+S)
    editor.addCommand(
      monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS,
      () => {
        editor.getAction("editor.action.formatDocument")?.run(); // optional
        if (onSaveRef.current) onSaveRef.current();
      },
    );
  };

  return (
    <div className="flex-1 h-full overflow-hidden relative">
      <Editor
        height="100%"
        defaultLanguage="python"
        theme={theme === "dark" ? "vs-dark" : "vs"}
        value={code}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        options={{
          fontSize: prefs.fontSize,
          fontFamily: '"JetBrains Mono", monospace',
          minimap: { enabled: true },
          automaticLayout: true,
          scrollBeyondLastLine: true,
          padding: { top: 16 },
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          lineHeight: Math.round(prefs.fontSize * 1.55),
          renderLineHighlight: "all",
          tabSize: prefs.tabSize,
          insertSpaces: true,
          lineNumbers: prefs.lineNumbers,
          glyphMargin: true,
        }}
      />
    </div>
  );
};
