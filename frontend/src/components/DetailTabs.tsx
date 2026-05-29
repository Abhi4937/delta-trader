import { useState, type ReactNode } from "react";
import clsx from "clsx";

export interface TabDef {
  key: string;
  label: string;
  /** data-testid for the tab button. */
  testid: string;
  render: () => ReactNode;
}

interface DetailTabsProps {
  tabs: TabDef[];
  initialKey?: string;
}

/**
 * Lightweight tab strip used by the position/strategy detail panels.
 * Tab panels are mounted lazily on first selection and then kept mounted, so
 * charts (Lightweight Charts / Recharts) are created at most once and don't
 * thrash on every tab switch.
 */
export default function DetailTabs({
  tabs,
  initialKey,
}: DetailTabsProps): JSX.Element {
  const [active, setActive] = useState(initialKey ?? tabs[0]?.key);
  const [mounted, setMounted] = useState<Set<string>>(
    () => new Set(initialKey ? [initialKey] : tabs[0] ? [tabs[0].key] : []),
  );

  const select = (key: string): void => {
    setActive(key);
    setMounted((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex flex-wrap gap-1 border-b border-[var(--color-border)]"
        role="tablist"
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={active === t.key}
            data-testid={t.testid}
            onClick={() => select(t.key)}
            className={clsx(
              "rounded-t px-3 py-1.5 text-xs font-medium transition-colors",
              active === t.key
                ? "border-b-2 border-[var(--color-accent,#10b981)] text-text"
                : "text-neutral hover:text-text",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) =>
        mounted.has(t.key) ? (
          <div key={t.key} hidden={active !== t.key} data-tabpanel={t.key}>
            {t.render()}
          </div>
        ) : null,
      )}
    </div>
  );
}
