import React, { useState } from "react";
import { Package, Download, Trash2, Search, Loader2 } from "lucide-react";
import { isValidPackageName } from "../services/pyodide";

export interface InstalledPackage {
  name: string;
  version?: string;
}

interface PackagesSidebarProps {
  installedPackages: InstalledPackage[];
  onInstall: (packageName: string) => Promise<void>;
  onUninstall: (packageName: string) => void;
}

export const PackagesSidebar: React.FC<PackagesSidebarProps> = ({
  installedPackages,
  onInstall,
  onUninstall,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isInstalling, setIsInstalling] = useState(false);
  const [installError, setInstallError] = useState("");

  const handleInstall = async () => {
    const name = searchQuery.trim();
    if (!name) return;
    if (!isValidPackageName(name)) {
      setInstallError(
        `Invalid package name. Use PEP 508 syntax (e.g. "numpy", "requests==2.31.0").`,
      );
      return;
    }

    setIsInstalling(true);
    setInstallError("");
    try {
      await onInstall(name);
      setSearchQuery("");
    } catch (err: any) {
      setInstallError(err?.message || "Failed to install package");
    } finally {
      setIsInstalling(false);
    }
  };

  const handleUninstallClick = (name: string) => {
    if (window.confirm(`Uninstall ${name}? It will be removed from the active session.`)) {
      onUninstall(name);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleInstall();
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--theme-surface)]">
      <div className="p-2 border-b border-[var(--theme-border)] bg-[var(--theme-panel)] flex gap-2 items-center">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search PyPI..."
            className="w-full bg-[var(--theme-surface-alt)] border border-[var(--theme-border)] rounded px-7 py-1 text-xs text-[var(--theme-text-main)] placeholder-[var(--theme-text-muted)] focus:outline-none focus:border-[var(--theme-text-accent)] transition-colors h-7"
            disabled={isInstalling}
          />
        </div>
        <button
          onClick={handleInstall}
          disabled={!searchQuery.trim() || isInstalling}
          className="flex items-center justify-center p-1.5 h-7 w-7 bg-[var(--theme-surface-alt)] border border-[var(--theme-border)] hover:bg-[var(--theme-hover)] hover:text-[var(--theme-text-accent)] disabled:opacity-50 disabled:cursor-not-allowed rounded text-[var(--theme-text-secondary)] transition-colors"
          title="Install Package"
        >
          {isInstalling ? (
            <Loader2
              size={14}
              className="animate-spin text-[var(--theme-text-accent)]"
            />
          ) : (
            <Download size={14} />
          )}
        </button>
      </div>

      {installError && (
        <div className="p-2 text-xs text-[var(--theme-danger)] bg-[var(--theme-danger-bg-hover)] border-b border-[var(--theme-border)] flex items-start justify-between gap-2">
          <span className="flex-1">{installError}</span>
          <button
            onClick={() => setInstallError("")}
            className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text-main)] shrink-0"
            title="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto w-full hide-scrollbar">
        <div className="px-3 py-1.5 bg-[var(--theme-panel)] text-[10px] font-semibold uppercase text-[var(--theme-text-secondary)] border-b border-[var(--theme-border)] flex items-center justify-between">
          <span>Installed Packages</span>
          <span className="bg-[var(--theme-surface-alt)] px-1.5 py-0.5 rounded-full text-[9px]">
            {installedPackages.length}
          </span>
        </div>
        <div className="text-sm text-[var(--theme-text-main)]">
          {installedPackages.length > 0 ? (
            installedPackages.map((pkg, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-1.5 px-3 hover:bg-[var(--theme-hover)] group border-b border-[var(--theme-border)] border-opacity-50"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <Package
                    size={14}
                    className="text-[var(--theme-text-accent)] shrink-0"
                  />
                  <span className="truncate text-xs font-medium">
                    {pkg.name}
                  </span>
                </div>
                <button
                  onClick={() => handleUninstallClick(pkg.name)}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--theme-active)] hover:text-[var(--theme-danger)] text-[var(--theme-text-muted)] transition-all shrink-0"
                  title="Uninstall"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-xs text-[var(--theme-text-muted)] flex flex-col items-center gap-2">
              <Package size={24} className="opacity-50" />
              <span>No packages installed</span>
              <span className="text-[10px] max-w-[150px]">
                Search PyPI above to add dependencies
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
