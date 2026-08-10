import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ModuleRibbonCommandProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  count?: number;
  icon: ReactNode;
  label: string;
}

interface ModuleRibbonGroupProps {
  children?: ReactNode;
  className?: string;
  label: string;
}

interface ModuleRibbonProps {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
}

export function ModuleRibbonCommand({ className = '', count = 0, icon, label, ...buttonProps }: ModuleRibbonCommandProps) {
  const visibleCount = Math.min(99, count);

  return (
    <button
      aria-label={buttonProps['aria-label'] || `${label}${count ? ` (${visibleCount})` : ''}`}
      className={`planning-ribbon-command${className ? ` ${className}` : ''}`}
      type="button"
      {...buttonProps}
    >
      <span className="planning-ribbon-command-icon">
        {icon}
        {count ? <em>{visibleCount}</em> : null}
      </span>
      <span className="planning-ribbon-command-label">{label}</span>
    </button>
  );
}

export function ModuleRibbonGroup({ children, className = '', label }: ModuleRibbonGroupProps) {
  return (
    <div aria-label={label} className={`planning-ribbon-group${className ? ` ${className}` : ''}`} role="group">
      <div className="planning-ribbon-actions">{children}</div>
      <span className="planning-ribbon-group-label">{label}</span>
    </div>
  );
}

export function ModuleRibbon({ ariaLabel, children, className = '' }: ModuleRibbonProps) {
  return (
    <nav aria-label={ariaLabel} className={`planning-module-toolbar${className ? ` ${className}` : ''}`}>
      <div className="planning-ribbon-scroll">{children}</div>
    </nav>
  );
}
