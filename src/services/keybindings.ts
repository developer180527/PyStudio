// ── Keybinding customization service ──

export interface KeyBinding {
  id: string;
  label: string;
  defaultKey: string;
  key: string; // current (possibly user-customized)
}

const STORAGE_KEY = "pystudio_keybindings";

export const DEFAULT_KEYBINDINGS: Omit<KeyBinding, "key">[] = [
  { id: "save", label: "Save File", defaultKey: "Ctrl+S" },
  { id: "save_all", label: "Save All Files", defaultKey: "Ctrl+Shift+S" },
  { id: "run", label: "Run Script", defaultKey: "Ctrl+Enter" },
  { id: "go_to_file", label: "Go to File", defaultKey: "Ctrl+P" },
  { id: "find", label: "Find", defaultKey: "Ctrl+F" },
  { id: "replace", label: "Find and Replace", defaultKey: "Ctrl+H" },
  { id: "toggle_terminal", label: "Toggle Terminal", defaultKey: "Ctrl+`" },
  { id: "close_tab", label: "Close Tab", defaultKey: "Ctrl+W" },
  { id: "debug", label: "Start Debugging", defaultKey: "F5" },
  { id: "step_over", label: "Step Over", defaultKey: "F10" },
  { id: "step_into", label: "Step Into", defaultKey: "F11" },
  { id: "command_palette", label: "Command Palette", defaultKey: "Ctrl+Shift+P" },
  { id: "settings", label: "Open Settings", defaultKey: "Ctrl+," },
  { id: "split_editor", label: "Split Editor", defaultKey: "Ctrl+\\" },
];

function loadOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveOverrides(overrides: Record<string, string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export function loadKeybindings(): KeyBinding[] {
  const overrides = loadOverrides();
  return DEFAULT_KEYBINDINGS.map((kb) => ({
    ...kb,
    key: overrides[kb.id] || kb.defaultKey,
  }));
}

export function updateKeybinding(id: string, newKey: string): KeyBinding[] {
  const overrides = loadOverrides();
  const defaultEntry = DEFAULT_KEYBINDINGS.find((kb) => kb.id === id);
  if (defaultEntry && newKey === defaultEntry.defaultKey) {
    delete overrides[id]; // remove override if same as default
  } else {
    overrides[id] = newKey;
  }
  saveOverrides(overrides);
  return loadKeybindings();
}

export function resetKeybindings(): KeyBinding[] {
  localStorage.removeItem(STORAGE_KEY);
  return loadKeybindings();
}

/** Check if a keyboard event matches a keybinding string like "Ctrl+Shift+P" */
export function matchesKeybinding(e: KeyboardEvent, binding: string): boolean {
  const parts = binding.split("+").map((p) => p.trim().toLowerCase());
  const key = parts[parts.length - 1];
  const needCtrl = parts.includes("ctrl") || parts.includes("cmd");
  const needShift = parts.includes("shift");
  const needAlt = parts.includes("alt");

  const ctrlOk = needCtrl ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.metaKey;
  const shiftOk = needShift ? e.shiftKey : !e.shiftKey;
  const altOk = needAlt ? e.altKey : !e.altKey;

  // Normalize the event key
  let eventKey = e.key.toLowerCase();
  if (eventKey === " ") eventKey = "space";
  if (eventKey === "escape") eventKey = "esc";

  // Handle special key names
  const keyMap: Record<string, string> = {
    enter: "enter",
    backspace: "backspace",
    delete: "delete",
    tab: "tab",
    esc: "escape",
    escape: "escape",
    "`": "`",
    "\\": "\\",
    ",": ",",
    ".": ".",
    "/": "/",
  };

  const normalizedBinding = keyMap[key] || key;
  const normalizedEvent = keyMap[eventKey] || eventKey;

  // Handle function keys
  if (normalizedBinding.startsWith("f") && /^f\d+$/.test(normalizedBinding)) {
    return (
      normalizedEvent === normalizedBinding && ctrlOk && shiftOk && altOk
    );
  }

  return normalizedEvent === normalizedBinding && ctrlOk && shiftOk && altOk;
}

/** Get the keybinding string for an action id */
export function getBinding(bindings: KeyBinding[], id: string): string {
  return bindings.find((b) => b.id === id)?.key || "";
}
