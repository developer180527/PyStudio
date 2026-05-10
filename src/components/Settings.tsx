import React, { useEffect, useState, useRef } from "react";
import { useTheme } from "../theme";
import {
  getGeminiApiKey,
  setGeminiApiKey,
  getGeminiModel,
  setGeminiModel,
} from "../services/gemini";
import {
  loadKeybindings,
  updateKeybinding,
  resetKeybindings,
  type KeyBinding,
} from "../services/keybindings";

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
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(p: EditorPrefs) {
  try {
    localStorage.setItem(PREFS_STORAGE, JSON.stringify(p));
  } catch (e) {
    console.error("Failed to persist editor prefs", e);
  }
}

// ── Keybinding capture component ──

const KeyCapture: React.FC<{
  binding: KeyBinding;
  onCapture: (id: string, key: string) => void;
}> = ({ binding, onCapture }) => {
  const [capturing, setCapturing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (capturing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [capturing]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Ignore lone modifier keys
    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;

    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
    if (e.shiftKey) parts.push("Shift");
    if (e.altKey) parts.push("Alt");

    let key = e.key;
    if (key === " ") key = "Space";
    else if (key.length === 1) key = key.toUpperCase();
    else if (key === "Escape") {
      setCapturing(false);
      return;
    }
    parts.push(key);

    const combo = parts.join("+");
    onCapture(binding.id, combo);
    setCapturing(false);
  };

  const isCustom = binding.key !== binding.defaultKey;

  return (
    <tr className="border-b border-[var(--theme-border)] hover:bg-[var(--theme-hover)] transition-colors">
      <td className="px-3 py-2 text-sm">{binding.label}</td>
      <td className="px-3 py-2">
        {capturing ? (
          <input
            ref={inputRef}
            type="text"
            readOnly
            onKeyDown={handleKeyDown}
            onBlur={() => setCapturing(false)}
            placeholder="Press keys..."
            className="w-full px-2 py-1 text-xs bg-[var(--theme-active)] border-2 border-[var(--theme-text-accent)] rounded outline-none text-[var(--theme-text-main)] animate-pulse"
          />
        ) : (
          <button
            onClick={() => setCapturing(true)}
            className={`px-2 py-1 text-xs font-mono rounded border transition-colors ${
              isCustom
                ? "bg-[var(--theme-active)] border-[var(--theme-text-accent)] text-[var(--theme-text-accent)]"
                : "bg-[var(--theme-surface-alt)] border-[var(--theme-border)] text-[var(--theme-text-secondary)]"
            } hover:bg-[var(--theme-hover)] cursor-pointer`}
            title="Click to change shortcut"
          >
            {binding.key}
          </button>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-[var(--theme-text-muted)]">
        {isCustom ? `Default: ${binding.defaultKey}` : ""}
      </td>
    </tr>
  );
};

// ── Settings component ──

export const Settings: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const [prefs, setPrefs] = useState<EditorPrefs>(loadPrefs);
  const [apiKey, setApiKeyState] = useState(getGeminiApiKey);
  const [showKey, setShowKey] = useState(false);
  const [model, setModelState] = useState(getGeminiModel);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [keybindings, setKeybindings] = useState<KeyBinding[]>(loadKeybindings);

  useEffect(() => {
    savePrefs(prefs);
    window.dispatchEvent(
      new CustomEvent("editor:prefs", { detail: prefs }),
    );
  }, [prefs]);

  const handleReset = () => {
    setTheme("light");
    setPrefs(DEFAULT_PREFS);
  };

  const handleSaveApiKey = () => {
    setGeminiApiKey(apiKey.trim());
    setGeminiModel(model.trim());
    setSavedFlash("Saved");
    setTimeout(() => setSavedFlash(null), 1500);
  };

  const handleKeybindingChange = (id: string, newKey: string) => {
    const updated = updateKeybinding(id, newKey);
    setKeybindings(updated);
    // Notify the app that keybindings changed
    window.dispatchEvent(new CustomEvent("keybindings:changed"));
  };

  const handleResetKeybindings = () => {
    const defaults = resetKeybindings();
    setKeybindings(defaults);
    window.dispatchEvent(new CustomEvent("keybindings:changed"));
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-8 bg-[var(--theme-panel)] text-[var(--theme-text-main)]">
      <div className="max-w-2xl flex items-center justify-between mb-8">
        <h1 className="text-3xl font-normal text-[var(--theme-text-main)]">
          Settings
        </h1>
        <button
          onClick={handleReset}
          className="px-4 py-2 border border-[var(--theme-border)] rounded bg-[var(--theme-surface-alt)] hover:bg-[var(--theme-hover)] text-sm font-medium transition-colors"
        >
          Reset to Defaults
        </button>
      </div>

      <div className="max-w-2xl">
        <section className="mb-10">
          <h2 className="text-xl font-medium mb-4 border-b border-[var(--theme-border)] pb-2 text-[var(--theme-text-accent)]">
            Appearance
          </h2>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Color Theme
              </label>
              <select
                value={theme}
                onChange={(e) =>
                  setTheme(e.target.value as "light" | "dark" | "metal")
                }
                className="w-full max-w-sm p-2 border border-[var(--theme-border)] bg-[var(--theme-panel)] text-[var(--theme-text-main)] focus:border-[var(--theme-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--theme-border-focus)] shadow-sm rounded"
              >
                <option value="light">Light (Classic)</option>
                <option value="dark">Dark</option>
                <option value="metal">Metal</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Font Size
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={10}
                  max={24}
                  value={prefs.fontSize}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      fontSize: Math.min(24, Math.max(10, Number(e.target.value))),
                    })
                  }
                  className="w-full max-w-[200px]"
                />
                <span className="text-sm border border-[var(--theme-border)] px-2 py-1 rounded w-12 text-center bg-[var(--theme-surface-alt)]">
                  {prefs.fontSize}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-medium mb-4 border-b border-[var(--theme-border)] pb-2 text-[var(--theme-text-accent)]">
            Editor
          </h2>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">Tab Size</label>
              <select
                value={prefs.tabSize}
                onChange={(e) =>
                  setPrefs({ ...prefs, tabSize: Number(e.target.value) })
                }
                className="w-full max-w-sm p-2 border border-[var(--theme-border)] bg-[var(--theme-panel)] text-[var(--theme-text-main)] focus:border-[var(--theme-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--theme-border-focus)] shadow-sm rounded"
              >
                <option value={2}>2 spaces</option>
                <option value={4}>4 spaces</option>
                <option value={6}>6 spaces</option>
                <option value={8}>8 spaces</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Line Numbers
              </label>
              <select
                value={prefs.lineNumbers}
                onChange={(e) =>
                  setPrefs({
                    ...prefs,
                    lineNumbers: e.target.value as EditorPrefs["lineNumbers"],
                  })
                }
                className="w-full max-w-sm p-2 border border-[var(--theme-border)] bg-[var(--theme-panel)] text-[var(--theme-text-main)] focus:border-[var(--theme-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--theme-border-focus)] shadow-sm rounded"
              >
                <option value="on">On</option>
                <option value="off">Off</option>
                <option value="relative">Relative</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Auto Save</label>
              <select
                value={prefs.autoSave}
                onChange={(e) =>
                  setPrefs({
                    ...prefs,
                    autoSave: e.target.value as EditorPrefs["autoSave"],
                  })
                }
                className="w-full max-w-sm p-2 border border-[var(--theme-border)] bg-[var(--theme-panel)] text-[var(--theme-text-main)] focus:border-[var(--theme-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--theme-border-focus)] shadow-sm rounded"
              >
                <option value="off">Off</option>
                <option value="afterDelay">After Delay</option>
                <option value="onFocusChange">On Focus Change</option>
                <option value="onWindowChange">On Window Change</option>
              </select>
            </div>
          </div>
        </section>

        {/* Keybinding customization */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4 border-b border-[var(--theme-border)] pb-2">
            <h2 className="text-xl font-medium text-[var(--theme-text-accent)]">
              Keyboard Shortcuts
            </h2>
            <button
              onClick={handleResetKeybindings}
              className="px-3 py-1.5 border border-[var(--theme-border)] rounded bg-[var(--theme-surface-alt)] hover:bg-[var(--theme-hover)] text-xs font-medium transition-colors"
            >
              Reset All
            </button>
          </div>

          <p className="text-xs text-[var(--theme-text-muted)] mb-3">
            Click a shortcut to change it. Press Escape to cancel.
          </p>

          <div className="border border-[var(--theme-border)] rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--theme-surface-alt)] border-b border-[var(--theme-border)]">
                  <th className="px-3 py-2 text-left font-medium text-[var(--theme-text-secondary)]">
                    Action
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--theme-text-secondary)] w-40">
                    Shortcut
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--theme-text-muted)] w-36">
                  </th>
                </tr>
              </thead>
              <tbody>
                {keybindings.map((kb) => (
                  <KeyCapture
                    key={kb.id}
                    binding={kb}
                    onCapture={handleKeybindingChange}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-medium mb-4 border-b border-[var(--theme-border)] pb-2 text-[var(--theme-text-accent)]">
            AI Assistant
          </h2>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Gemini API Key
              </label>
              <div className="flex gap-2 max-w-sm">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKeyState(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste your Gemini API key"
                  className="flex-1 p-2 border border-[var(--theme-border)] bg-[var(--theme-panel)] text-[var(--theme-text-main)] focus:border-[var(--theme-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--theme-border-focus)] shadow-sm rounded"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  className="px-3 border border-[var(--theme-border)] rounded bg-[var(--theme-surface-alt)] hover:bg-[var(--theme-hover)] text-xs"
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
              <p className="text-xs text-[var(--theme-text-muted)] mt-2">
                Stored only in your browser's localStorage. Never sent to a
                server other than Google's Gemini API.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Model</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModelState(e.target.value)}
                spellCheck={false}
                className="w-full max-w-sm p-2 border border-[var(--theme-border)] bg-[var(--theme-panel)] text-[var(--theme-text-main)] focus:border-[var(--theme-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--theme-border-focus)] shadow-sm rounded"
              />
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                onClick={handleSaveApiKey}
                className="px-4 py-2 bg-[var(--theme-status)] text-[var(--theme-text-status)] rounded font-medium shadow-sm hover:opacity-90"
              >
                Save AI Settings
              </button>
              {savedFlash && (
                <span className="text-xs text-[var(--theme-text-accent)]">
                  {savedFlash}
                </span>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
