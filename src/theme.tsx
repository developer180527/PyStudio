import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "metal";

const THEME_STORAGE = "pystudio_theme";

export const themeData = {
  light: {
    surface: "#F0F0F0",
    "surface-alt": "#ECE9D8",
    panel: "#FFFFFF",
    hover: "#E4E8F0",
    "hover-text": "#005499",
    active: "#DDE5FF",
    status: "#005499",
    "text-main": "#000000",
    "text-secondary": "#404040",
    "text-muted": "#808080",
    "text-accent": "#005499",
    "text-status": "#FFFFFF",
    "text-status-muted": "#DDE5FF",
    border: "#A0A0A0",
    "border-focus": "#005499",
    "border-alt": "#CCCCCC",
    "scrollbar-track": "#F0F0F0",
    "scrollbar-thumb": "#C0C0C0",
    "scrollbar-hover": "#A0A0A0",
    danger: "#CC0000",
    "danger-hover": "#FF0000",
    "danger-bg-hover": "#FFE5E5",
    "ai-bubble": "#FFFFFF",
    "ai-user-bubble": "#DDE5FF",
    "ai-user-icon": "#005499",
    "ai-bot-icon": "#808080",
  },
  dark: {
    surface: "#252526",
    "surface-alt": "#141414",
    panel: "#1E1E1E",
    hover: "#2A2D2E",
    "hover-text": "#FFFFFF",
    active: "#094771",
    status: "#007ACC",
    "text-main": "#D4D4D4",
    "text-secondary": "#CCCCCC",
    "text-muted": "#808080",
    "text-accent": "#4DAAFB",
    "text-status": "#FFFFFF",
    "text-status-muted": "#CCCCCC",
    border: "#3F3F46",
    "border-focus": "#4DAAFB",
    "border-alt": "#555555",
    "scrollbar-track": "#1E1E1E",
    "scrollbar-thumb": "#424242",
    "scrollbar-hover": "#4F4F4F",
    danger: "#F14C4C",
    "danger-hover": "#FF5C5C",
    "danger-bg-hover": "#4D1D1D",
    "ai-bubble": "#252526",
    "ai-user-bubble": "#094771",
    "ai-user-icon": "#FFFFFF",
    "ai-bot-icon": "#CCCCCC",
  },
  metal: {
    surface: "#B0B5BB",
    "surface-alt": "#C2C8CF",
    panel: "#E4E8ED",
    hover: "#D1D7DC",
    "hover-text": "#181C20",
    active: "#AAB2BC",
    status: "#46505C",
    "text-main": "#181C20",
    "text-secondary": "#363D45",
    "text-muted": "#58606B",
    "text-accent": "#0E5A8A",
    "text-status": "#FFFFFF",
    "text-status-muted": "#D1D7DC",
    border: "#8D97A3",
    "border-focus": "#0E5A8A",
    "border-alt": "#AAB2BC",
    "scrollbar-track": "#C2C8CF",
    "scrollbar-thumb": "#8D97A3",
    "scrollbar-hover": "#58606B",
    danger: "#C0392B",
    "danger-hover": "#E74C3C",
    "danger-bg-hover": "#FADBD8",
    "ai-bubble": "#E4E8ED",
    "ai-user-bubble": "#C2C8CF",
    "ai-user-icon": "#0E5A8A",
    "ai-bot-icon": "#58606B",
  },
};

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  setTheme: () => {},
});

function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE);
    if (saved === "light" || saved === "dark" || saved === "metal") return saved;
  } catch {}
  return "light";
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [theme, setThemeState] = useState<Theme>(loadTheme);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(THEME_STORAGE, t);
    } catch (e) {
      console.error("Failed to persist theme", e);
    }
  };

  useEffect(() => {
    const colors = themeData[theme];
    const root = document.documentElement;
    Object.entries(colors).forEach(([key, value]) => {
      root.style.setProperty(`--theme-${key}`, value as string);
    });
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
