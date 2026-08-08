type Tab<T extends string> = { id: T; label: string };

export function SubTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly Tab<T>[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tab-pill-bar" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          className={`tab-pill-btn${active === t.id ? " active" : ""}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
