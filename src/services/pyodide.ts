import { loadPyodide, type PyodideInterface } from "pyodide";

let pyodideInstance: PyodideInterface | null = null;
let initializing = false;

let initializationError: Error | null = null;

export async function getPyodide(): Promise<PyodideInterface> {
  if (pyodideInstance) return pyodideInstance;
  if (initializationError) throw initializationError;

  if (initializing) {
    while (!pyodideInstance && !initializationError) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (initializationError) throw initializationError;
    return pyodideInstance!;
  }

  initializing = true;
  initializationError = null;
  try {
    console.log("PyStudio: Initializing Pyodide from CDN...");
    // We use a CDN for the required assets as pyodide is large
    pyodideInstance = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/",
    });
    console.log("PyStudio: Pyodide loaded successfully.");
    return pyodideInstance;
  } catch (err: any) {
    console.error("PyStudio: Failed to load Pyodide:", err);
    initializationError = err;
    throw err;
  } finally {
    initializing = false;
  }
}

export interface TraceEvent {
  line: number;
  func: string;
  locals: { name: string; value: string; type: string }[];
  stack: { name: string; line: number; file: string }[];
}

export interface DebugResult {
  events: TraceEvent[];
  output: string;
  error?: string;
}

const TRACER_SOURCE = `
import sys
import io
import json

def __pystudio_debug__(user_code):
    events = []
    out_buf = io.StringIO()
    err_msg = None

    def repr_safe(v, max_len=200):
        try:
            r = repr(v)
        except Exception as e:
            r = f"<unrepresentable: {e}>"
        if len(r) > max_len:
            r = r[:max_len] + "..."
        return r

    def type_name(v):
        try:
            return type(v).__name__
        except Exception:
            return "?"

    SKIP_NAMES = {"__pystudio_debug__", "repr_safe", "type_name", "tracer", "<module>"}

    def collect_stack(frame):
        stack = []
        f = frame
        while f is not None:
            name = f.f_code.co_name
            if name == "__pystudio_debug__":
                break
            stack.append({
                "name": name,
                "line": f.f_lineno,
                "file": f.f_code.co_filename,
            })
            f = f.f_back
        return list(reversed(stack))

    def tracer(frame, event, arg):
        if event != "line":
            return tracer
        if frame.f_code.co_filename != "<pystudio>":
            return tracer
        local_items = []
        for k, v in list(frame.f_locals.items()):
            if k.startswith("__") and k.endswith("__"):
                continue
            if k in SKIP_NAMES:
                continue
            local_items.append({
                "name": k,
                "value": repr_safe(v),
                "type": type_name(v),
            })
        events.append({
            "line": frame.f_lineno,
            "func": frame.f_code.co_name,
            "locals": local_items,
            "stack": collect_stack(frame),
        })
        return tracer

    compiled = compile(user_code, "<pystudio>", "exec")
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    sys.stdout = out_buf
    sys.stderr = out_buf
    try:
        sys.settrace(tracer)
        try:
            exec(compiled, {"__name__": "__main__"})
        finally:
            sys.settrace(None)
    except Exception as e:
        import traceback
        err_msg = traceback.format_exc()
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr

    return json.dumps({
        "events": events,
        "output": out_buf.getvalue(),
        "error": err_msg,
    })
`;

export async function debugPython(code: string): Promise<DebugResult> {
  const pyodide = await getPyodide();
  await pyodide.runPythonAsync(TRACER_SOURCE);
  pyodide.globals.set("__pystudio_user_code__", code);
  const resultJson = await pyodide.runPythonAsync(
    "__pystudio_debug__(__pystudio_user_code__)",
  );
  pyodide.globals.delete("__pystudio_user_code__");
  return JSON.parse(String(resultJson));
}

export async function runPython(
  code: string,
  onOutput: (text: string) => void,
  onError: (text: string) => void,
) {
  try {
    const pyodide = await getPyodide();

    // Set up standard output and error
    pyodide.setStdout({
      batched: (text) => onOutput(text + "\n"),
    });
    pyodide.setStderr({
      batched: (text) => onError(text + "\n"),
    });

    const result = await pyodide.runPythonAsync(code);
    if (result !== undefined) {
      onOutput(String(result) + "\n");
    }
  } catch (err: any) {
    onError(err.message + "\n");
  }
}

// PEP 508 / PEP 503 normalized package name pattern, optionally with version spec or extras.
// Allows: name, name==1.0, name>=1.0, name[extra], package_name-1, etc.
const PACKAGE_NAME_RE =
  /^[A-Za-z0-9][A-Za-z0-9._-]*(\[[A-Za-z0-9._,\s-]+\])?\s*([<>=!~]=?\s*[A-Za-z0-9._*+!-]+(\s*,\s*[<>=!~]=?\s*[A-Za-z0-9._*+!-]+)*)?$/;

export function isValidPackageName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 200) return false;
  return PACKAGE_NAME_RE.test(trimmed);
}

export async function installPythonPackage(
  packageName: string,
  onOutput: (text: string) => void,
  onError: (text: string) => void,
) {
  if (!isValidPackageName(packageName)) {
    const msg = `Invalid package name: ${packageName}\r\n`;
    onError(msg);
    throw new Error(msg.trim());
  }
  try {
    const pyodide = await getPyodide();
    onOutput(`Loading micropip...\r\n`);
    await pyodide.loadPackage("micropip");
    const micropip = pyodide.pyimport("micropip");
    onOutput(`Installing ${packageName}...\r\n`);
    await micropip.install(packageName);
    onOutput(`Successfully installed ${packageName}\r\n`);
  } catch (err: any) {
    const msg = `Failed to install ${packageName}: ${err?.message || err}\r\n`;
    onError(msg);
    throw err instanceof Error ? err : new Error(String(err));
  }
}
