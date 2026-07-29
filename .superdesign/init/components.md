# SeaPilot shared UI components

## Framework inventory

- React 19 + TypeScript + Vite.
- No external component library: the application uses semantic HTML, Lucide React icons, and CSS classes from `src/styles/index.css`.
- Shared navigation and shell live in `src/features/shell/AppShell.tsx`.
- The closest reusable command-bar primitives are the Planning ribbon components below. They are the visual and interaction reference for the requested Projects menu.

## PlanningRibbonButton

- Source: `src/features/planning/PlanningPage.tsx`
- Props: native button props plus `count`, `icon`, and `label`.
- Description: compact icon command with optional numeric badge and persistent text label.

```tsx
interface PlanningRibbonButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  count?: number;
  icon: ReactNode;
  label: string;
}

function PlanningRibbonButton({ className = '', count = 0, icon, label, ...buttonProps }: PlanningRibbonButtonProps) {
  return (
    <button
      aria-label={buttonProps['aria-label'] || `${label}${count ? ` (${Math.min(99, count)})` : ''}`}
      className={`planning-ribbon-command${className ? ` ${className}` : ''}`}
      type="button"
      {...buttonProps}
    >
      <span className="planning-ribbon-command-icon">
        {icon}
        {count ? <em>{Math.min(99, count)}</em> : null}
      </span>
      <span className="planning-ribbon-command-label">{label}</span>
    </button>
  );
}
```

## PlanningRibbonGroup

- Source: `src/features/planning/PlanningPage.tsx`
- Props: `children`, `className`, `label`.
- Description: labelled command group with separators, used to organize the Planning ribbon by business workflow.

```tsx
function PlanningRibbonGroup({ children, className = '', label }: { children?: ReactNode; className?: string; label: string }) {
  return (
    <div aria-label={label} className={`planning-ribbon-group${className ? ` ${className}` : ''}`} role="group">
      <div className="planning-ribbon-actions">{children}</div>
      <span className="planning-ribbon-group-label">{label}</span>
    </div>
  );
}
```

## ProjectDetailTabs

- Source: `src/features/projects/ProjectsPage.tsx`
- Props: `activeTab`, `onChange`.
- Description: accessible keyboard-operable tabs for the selected project's detailed sections.

```tsx
const PROJECT_DETAIL_TABS = [
  { id: 'contract', label: 'Contrat' },
  { id: 'operations', label: 'Opérations' },
  { id: 'documents', label: 'Génération documentaire' },
  { id: 'commercial', label: 'Offre commerciale' },
  { id: 'planning', label: 'Planning' },
  { id: 'identification', label: 'Identification' },
] as const;

type ProjectDetailTab = (typeof PROJECT_DETAIL_TABS)[number]['id'];

function ProjectDetailTabs({
  activeTab,
  onChange,
}: {
  activeTab: ProjectDetailTab;
  onChange: (tab: ProjectDetailTab) => void;
}) {
  function moveFocus(currentTab: ProjectDetailTab, direction: -1 | 1) {
    const currentIndex = PROJECT_DETAIL_TABS.findIndex((tab) => tab.id === currentTab);
    const nextIndex = (currentIndex + direction + PROJECT_DETAIL_TABS.length) % PROJECT_DETAIL_TABS.length;
    const nextTab = PROJECT_DETAIL_TABS[nextIndex];
    onChange(nextTab.id);
    window.requestAnimationFrame(() => document.getElementById(`project-tab-${nextTab.id}`)?.focus());
  }

  return (
    <div aria-label="Sections du projet" className="project-detail-tabs" role="tablist">
      {PROJECT_DETAIL_TABS.map((tab) => (
        <button
          aria-controls="project-detail-panel"
          aria-selected={activeTab === tab.id}
          id={`project-tab-${tab.id}`}
          key={tab.id}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              moveFocus(tab.id, 1);
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              moveFocus(tab.id, -1);
            } else if (event.key === 'Home' || event.key === 'End') {
              event.preventDefault();
              const target = event.key === 'Home' ? PROJECT_DETAIL_TABS[0] : PROJECT_DETAIL_TABS.at(-1)!;
              onChange(target.id);
              window.requestAnimationFrame(() => document.getElementById(`project-tab-${target.id}`)?.focus());
            }
          }}
          role="tab"
          tabIndex={activeTab === tab.id ? 0 : -1}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```
