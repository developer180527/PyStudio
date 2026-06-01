import React, { useRef, useEffect, useState } from "react";
import Editor, { OnMount, useMonaco } from "@monaco-editor/react";
import { useTheme } from "../theme";
import { lspClient, uriToPath } from "../services/lsp";
import type * as monacoType from "monaco-editor";
import type { LspDiagnostic } from "../services/lsp";

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

function normalizePrefs(value: Partial<EditorPrefs> | null | undefined): EditorPrefs {
  const lineNumbers = ["on", "off", "relative"].includes(
    String(value?.lineNumbers),
  )
    ? value!.lineNumbers!
    : DEFAULT_PREFS.lineNumbers;
  const autoSave = [
    "off",
    "afterDelay",
    "onFocusChange",
    "onWindowChange",
  ].includes(String(value?.autoSave))
    ? value!.autoSave!
    : DEFAULT_PREFS.autoSave;
  const fontSize =
    typeof value?.fontSize === "number" && Number.isFinite(value.fontSize)
      ? Math.min(24, Math.max(10, value.fontSize))
      : DEFAULT_PREFS.fontSize;
  const tabSize =
    typeof value?.tabSize === "number" && [2, 4, 6, 8].includes(value.tabSize)
      ? value.tabSize
      : DEFAULT_PREFS.tabSize;

  return {
    fontSize,
    tabSize,
    lineNumbers,
    autoSave,
  };
}

function loadPrefs(): EditorPrefs {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE);
    if (!raw) return DEFAULT_PREFS;
    return normalizePrefs(JSON.parse(raw));
  } catch {
    return DEFAULT_PREFS;
  }
}

// ── LSP ↔ Monaco type mapping helpers ──

function mapLspKindToMonaco(
  lspKind: number | undefined,
  m: typeof monacoType,
): monacoType.languages.CompletionItemKind {
  const K = m.languages.CompletionItemKind;
  const map: Record<number, monacoType.languages.CompletionItemKind> = {
    1: K.Text,
    2: K.Method,
    3: K.Function,
    4: K.Constructor,
    5: K.Field,
    6: K.Variable,
    7: K.Class,
    8: K.Interface,
    9: K.Module,
    10: K.Property,
    11: K.Unit,
    12: K.Value,
    13: K.Enum,
    14: K.Keyword,
    15: K.Snippet,
    16: K.Color,
    17: K.File,
    18: K.Reference,
    19: K.Folder,
    20: K.EnumMember,
    21: K.Constant,
    22: K.Struct,
    23: K.Event,
    24: K.Operator,
    25: K.TypeParameter,
  };
  return map[lspKind || 1] ?? K.Text;
}

function mapLspSeverityToMonaco(
  severity: number | undefined,
  m: typeof monacoType,
): monacoType.MarkerSeverity {
  switch (severity) {
    case 1:
      return m.MarkerSeverity.Error;
    case 2:
      return m.MarkerSeverity.Warning;
    case 3:
      return m.MarkerSeverity.Info;
    case 4:
      return m.MarkerSeverity.Hint;
    default:
      return m.MarkerSeverity.Info;
  }
}

function lspRangeToMonaco(
  range: { start: { line: number; character: number }; end: { line: number; character: number } },
  m: typeof monacoType,
): monacoType.IRange {
  return new m.Range(
    range.start.line + 1,
    range.start.character + 1,
    range.end.line + 1,
    range.end.character + 1,
  );
}

// Track whether providers are registered (once per Monaco instance)
let lspProvidersRegistered = false;

function registerLspProviders(m: typeof monacoType): void {
  if (lspProvidersRegistered) return;
  lspProvidersRegistered = true;

  // ── Completion ──
  m.languages.registerCompletionItemProvider("python", {
    triggerCharacters: [".", "(", ",", "[", " ", "@"],
    provideCompletionItems: async (model, position) => {
      if (!lspClient.isStarted || !lspClient.activeFilePath) {
        return { suggestions: [] };
      }
      try {
        const result = await lspClient.completion(
          lspClient.activeFilePath,
          position.lineNumber - 1,
          position.column - 1,
        );
        const items = result?.items || result || [];
        const word = model.getWordUntilPosition(position);
        const range: monacoType.IRange = {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn,
        };

        const suggestions: monacoType.languages.CompletionItem[] = items.map(
          (item: any) => ({
            label: item.label,
            kind: mapLspKindToMonaco(item.kind, m),
            detail: item.detail || "",
            documentation:
              item.documentation != null
                ? typeof item.documentation === "string"
                  ? item.documentation
                  : { value: item.documentation?.value || "" }
                : undefined,
            insertText: item.insertText || item.label,
            sortText: item.sortText || item.label,
            filterText: item.filterText || item.label,
            range,
          }),
        );
        return { suggestions };
      } catch {
        return { suggestions: [] };
      }
    },
  });

  // ── Hover ──
  m.languages.registerHoverProvider("python", {
    provideHover: async (_model, position) => {
      if (!lspClient.isStarted || !lspClient.activeFilePath) return null;
      try {
        const result = await lspClient.hover(
          lspClient.activeFilePath,
          position.lineNumber - 1,
          position.column - 1,
        );
        if (!result?.contents) return null;

        const contents: monacoType.IMarkdownString[] = [];
        const c = result.contents;
        if (typeof c === "string") {
          contents.push({ value: c });
        } else if (Array.isArray(c)) {
          for (const item of c) {
            contents.push({
              value: typeof item === "string" ? item : item?.value || "",
            });
          }
        } else if (c.kind) {
          // MarkupContent
          contents.push({ value: c.value || "" });
        } else if (c.value) {
          contents.push({ value: c.value });
        }

        return {
          contents,
          range: result.range ? lspRangeToMonaco(result.range, m) : undefined,
        };
      } catch {
        return null;
      }
    },
  });

  // ── Go to Definition ──
  m.languages.registerDefinitionProvider("python", {
    provideDefinition: async (model, position) => {
      if (!lspClient.isStarted || !lspClient.activeFilePath) return null;
      try {
        const result = await lspClient.definition(
          lspClient.activeFilePath,
          position.lineNumber - 1,
          position.column - 1,
        );
        if (!result) return null;

        const locations = Array.isArray(result) ? result : [result];
        const monacoLocations: monacoType.languages.Location[] = [];

        for (const loc of locations) {
          if (!loc.uri || !loc.range) continue;
          const filePath = uriToPath(loc.uri);
          if (filePath === lspClient.activeFilePath) {
            // Same file — Monaco handles navigation
            monacoLocations.push({
              uri: model.uri,
              range: lspRangeToMonaco(loc.range, m),
            });
          } else {
            // Cross-file — emit event for App to handle
            window.dispatchEvent(
              new CustomEvent("lsp:goto", {
                detail: {
                  path: filePath,
                  line: loc.range.start.line + 1,
                  column: loc.range.start.character + 1,
                },
              }),
            );
          }
        }
        return monacoLocations.length > 0 ? monacoLocations : null;
      } catch {
        return null;
      }
    },
  });
}

// ── Props ──

interface CodeEditorProps {
  code: string;
  onChange: (value: string | undefined) => void;
  onRun: () => void;
  onSave?: () => void;
  breakpoints?: number[];
  onBreakpointsChange?: (breakpoints: number[]) => void;
  executionLine?: number;
  diagnostics?: LspDiagnostic[];
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  code,
  onChange,
  onRun,
  onSave,
  breakpoints = [],
  onBreakpointsChange,
  executionLine,
  diagnostics,
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
      if (detail) setPrefs(normalizePrefs(detail));
    };
    window.addEventListener("editor:prefs", handler);
    return () => window.removeEventListener("editor:prefs", handler);
  }, []);

  // Register LSP providers once Monaco is ready
  useEffect(() => {
    if (monaco) {
      registerLspProviders(monaco as unknown as typeof monacoType);
    }
  }, [monaco]);

  // Apply LSP diagnostics as Monaco markers
  useEffect(() => {
    if (!monaco || !editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;

    const m = monaco as unknown as typeof monacoType;
    const markers: monacoType.editor.IMarkerData[] = (diagnostics || []).map(
      (d) => ({
        severity: mapLspSeverityToMonaco(d.severity, m),
        message: d.message,
        startLineNumber: d.range.start.line + 1,
        startColumn: d.range.start.character + 1,
        endLineNumber: d.range.end.line + 1,
        endColumn: d.range.end.character + 1,
        source: d.source || "python",
        code: d.code != null ? String(d.code) : undefined,
      }),
    );

    m.editor.setModelMarkers(model, "lsp", markers);
  }, [diagnostics, monaco]);

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

  // Listen for external commands (find/replace from menu/toolbar)
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

  // Listen for LSP go-to-definition reveal-line requests
  useEffect(() => {
    const handleRevealLine = (e: Event) => {
      const { line, column } = (e as CustomEvent).detail;
      if (editorRef.current && line) {
        editorRef.current.revealLineInCenter(line);
        editorRef.current.setPosition({ lineNumber: line, column: column || 1 });
        editorRef.current.focus();
      }
    };
    window.addEventListener("editor:revealLine", handleRevealLine);
    return () =>
      window.removeEventListener("editor:revealLine", handleRevealLine);
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

  useEffect(() => {
    if (!editorRef.current) return;
    const frame = requestAnimationFrame(() => editorRef.current?.layout());
    return () => cancelAnimationFrame(frame);
  }, [prefs.fontSize, prefs.tabSize, prefs.lineNumbers]);

  const handleEditorDidMount: OnMount = (editor, monacoInstance) => {
    editorRef.current = editor;

    // Force layout recalculation after first paint and after web fonts settle.
    requestAnimationFrame(() => {
      editor.layout();
      setTimeout(() => editor.layout(), 300);
    });
    document.fonts?.ready.then(() => editor.layout()).catch(() => {});

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
          lineHeight: Math.round(prefs.fontSize * 1.6),
          renderLineHighlight: "all",
          tabSize: prefs.tabSize,
          insertSpaces: true,
          lineNumbers: prefs.lineNumbers,
          lineNumbersMinChars: 3,
          lineDecorationsWidth: 12,
          glyphMargin: true,
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
          fontLigatures: false,
          fixedOverflowWidgets: true,
          smoothScrolling: false,
          disableLayerHinting: true,
        }}
      />
    </div>
  );
};
