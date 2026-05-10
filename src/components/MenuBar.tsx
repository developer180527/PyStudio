import React, { useState, useRef, useEffect, useCallback } from "react";

export interface MenuItem {
  label?: string;
  action?: string | (() => void);
  shortcut?: string;
  divider?: boolean;
}

interface MenuDropdownProps {
  title: string;
  items: MenuItem[];
  isOpen: boolean;
  highlightIndex: number;
  onToggle: () => void;
  onHover: () => void;
  onAction: (action: string | (() => void)) => void;
  onHighlight: (index: number) => void;
  triggerRef?: React.Ref<HTMLDivElement>;
}

const MenuDropdown: React.FC<MenuDropdownProps> = ({
  title,
  items,
  isOpen,
  highlightIndex,
  onToggle,
  onHover,
  onAction,
  onHighlight,
  triggerRef,
}) => {
  return (
    <div className="relative h-full flex items-center">
      <div
        ref={triggerRef}
        role="menuitem"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={`flex items-center px-1.5 h-[80%] my-auto rounded cursor-default ${isOpen ? "bg-[var(--theme-hover)] text-[var(--theme-text-main)]" : "hover:bg-[var(--theme-hover)] hover:text-[var(--theme-text-main)]"}`}
        onPointerDown={(e) => {
          e.preventDefault();
          onToggle();
        }}
        onPointerEnter={onHover}
      >
        {title}
      </div>
      {isOpen && (
        <div
          role="menu"
          className="absolute top-full left-0 mt-[1px] min-w-[200px] bg-[var(--theme-surface-alt)] border border-[var(--theme-border)] shadow-lg rounded py-1 z-[100] text-[13px] text-[var(--theme-text-main)]"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {items.map((item, i) =>
            item.divider ? (
              <div
                key={i}
                className="h-px bg-[var(--theme-border)] my-1"
              />
            ) : (
              <div
                key={i}
                role="menuitem"
                aria-disabled={!item.action}
                onMouseEnter={() => onHighlight(i)}
                className={`px-4 py-1.5 cursor-pointer flex justify-between items-center ${highlightIndex === i ? "bg-[var(--theme-hover)] text-[var(--theme-text-accent)]" : ""} ${!item.action ? "opacity-50 pointer-events-none" : ""}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  if (item.action) {
                    onAction(item.action);
                  }
                }}
              >
                <span>{item.label}</span>
                {item.shortcut && (
                  <span className="text-[10px] text-[var(--theme-text-muted)] tracking-wider mt-0.5 whitespace-nowrap ml-6">
                    {item.shortcut}
                  </span>
                )}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
};

export interface MenuData {
  title: string;
  items: MenuItem[];
}

interface MenuBarProps {
  menus: MenuData[];
  onAction: (action: string | (() => void)) => void;
}

export function MenuBar({ menus, onAction }: MenuBarProps) {
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [highlightIndex, setHighlightIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpenMenuIndex(null);
      }
    }
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (openMenuIndex === null) {
      setHighlightIndex(-1);
    } else {
      setHighlightIndex(-1);
    }
  }, [openMenuIndex]);

  const handleAction = (action: string | (() => void)) => {
    setOpenMenuIndex(null);
    onAction(action);
  };

  const focusTrigger = (idx: number) => {
    triggerRefs.current[idx]?.focus();
  };

  const findNextEnabled = useCallback(
    (items: MenuItem[], from: number, dir: 1 | -1): number => {
      const n = items.length;
      if (n === 0) return -1;
      let i = from;
      for (let step = 0; step < n; step++) {
        i = (i + dir + n) % n;
        const it = items[i];
        if (it && !it.divider && it.action) return i;
      }
      return -1;
    },
    [],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (openMenuIndex === null) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const focused = triggerRefs.current.findIndex(
          (el) => el === document.activeElement,
        );
        if (focused >= 0) setOpenMenuIndex(focused);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const focused = triggerRefs.current.findIndex(
          (el) => el === document.activeElement,
        );
        const next = focused < 0 ? 0 : (focused + 1) % menus.length;
        focusTrigger(next);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const focused = triggerRefs.current.findIndex(
          (el) => el === document.activeElement,
        );
        const next =
          focused < 0
            ? menus.length - 1
            : (focused - 1 + menus.length) % menus.length;
        focusTrigger(next);
      }
      return;
    }

    const items = menus[openMenuIndex].items;

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setOpenMenuIndex(null);
        focusTrigger(openMenuIndex);
        break;
      case "ArrowDown":
        e.preventDefault();
        setHighlightIndex((prev) => findNextEnabled(items, prev, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIndex((prev) =>
          findNextEnabled(items, prev < 0 ? items.length : prev, -1),
        );
        break;
      case "ArrowRight": {
        e.preventDefault();
        const next = (openMenuIndex + 1) % menus.length;
        setOpenMenuIndex(next);
        focusTrigger(next);
        break;
      }
      case "ArrowLeft": {
        e.preventDefault();
        const next = (openMenuIndex - 1 + menus.length) % menus.length;
        setOpenMenuIndex(next);
        focusTrigger(next);
        break;
      }
      case "Enter":
      case " ": {
        e.preventDefault();
        if (highlightIndex >= 0) {
          const it = items[highlightIndex];
          if (it && it.action) handleAction(it.action);
        }
        break;
      }
    }
  };

  return (
    <div
      className="flex gap-1 bg-[var(--theme-surface-alt)] px-2 text-[13px] text-[var(--theme-text-secondary)] h-full w-full"
      ref={containerRef}
      onKeyDown={handleKeyDown}
      role="menubar"
    >
      {menus.map((menu, i) => (
        <MenuDropdown
          key={i}
          title={menu.title}
          items={menu.items}
          isOpen={openMenuIndex === i}
          highlightIndex={openMenuIndex === i ? highlightIndex : -1}
          onToggle={() => setOpenMenuIndex(openMenuIndex === i ? null : i)}
          onHover={() => {
            if (openMenuIndex !== null && openMenuIndex !== i) {
              setOpenMenuIndex(i);
            }
          }}
          onAction={handleAction}
          onHighlight={setHighlightIndex}
          triggerRef={(el) => (triggerRefs.current[i] = el)}
        />
      ))}
    </div>
  );
}
