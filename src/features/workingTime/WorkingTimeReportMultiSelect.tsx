import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface WorkingTimeReportMultiSelectOption {
  description?: string;
  id: string;
  label: string;
}

interface WorkingTimeReportMultiSelectProps {
  allIncludedWhenEmpty?: boolean;
  emptyLabel: string;
  isOpen: boolean;
  label: string;
  onChange: (ids: string[]) => void;
  onOpenChange: (open: boolean) => void;
  options: WorkingTimeReportMultiSelectOption[];
  searchPlaceholder: string;
  selectedIds: string[];
  selectedLabel: (count: number) => string;
}

const normalizeSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');

export function WorkingTimeReportMultiSelect({
  allIncludedWhenEmpty = false,
  emptyLabel,
  isOpen,
  label,
  onChange,
  onOpenChange,
  options,
  searchPlaceholder,
  selectedIds,
  selectedLabel,
}: WorkingTimeReportMultiSelectProps) {
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const listboxId = useId();
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedOptions = useMemo(() => options.filter((option) => selectedSet.has(option.id)), [options, selectedSet]);
  const filteredOptions = useMemo(() => {
    const query = normalizeSearch(search.trim());
    if (!query) return options;
    return options.filter((option) => normalizeSearch(`${option.label} ${option.description || ''}`).includes(query));
  }, [options, search]);

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  useEffect(() => {
    if (!isOpen) return undefined;
    setSearch('');
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChangeRef.current(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [isOpen]);

  const toggle = (id: string) => onChange(selectedSet.has(id)
    ? selectedIds.filter((selectedId) => selectedId !== id)
    : [...selectedIds, id]);

  const closeAndFocus = () => {
    onOpenChange(false);
    triggerRef.current?.focus();
  };

  return (
    <div
      className={`working-time-report-multiselect${isOpen ? ' is-open' : ''}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && isOpen) {
          event.preventDefault();
          event.stopPropagation();
          closeAndFocus();
        }
      }}
      ref={rootRef}
    >
      <span className="working-time-report-multiselect__label">{label}</span>
      <button
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="working-time-report-multiselect__trigger"
        onClick={() => onOpenChange(!isOpen)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !isOpen) {
            event.preventDefault();
            onOpenChange(true);
          }
        }}
        ref={triggerRef}
        type="button"
      >
        <span>{selectedIds.length ? selectedLabel(selectedIds.length) : emptyLabel}</span>
        <ChevronDown aria-hidden="true" size={17} />
      </button>

      {selectedOptions.length ? (
        <div aria-label={`${label} sélectionnés`} className="working-time-report-multiselect__chips">
          {selectedOptions.map((option) => (
            <span className="working-time-report-multiselect__chip" key={option.id}>
              {option.label}
              <button aria-label={`Retirer ${option.label}`} onClick={() => toggle(option.id)} type="button"><X aria-hidden="true" size={14} /></button>
            </span>
          ))}
        </div>
      ) : null}

      {allIncludedWhenEmpty && !selectedIds.length ? <small className="working-time-report-multiselect__empty-note">Aucun navire sélectionné : tous les navires sont inclus.</small> : null}

      {isOpen ? (
        <div className="working-time-report-multiselect__panel">
          <label className="working-time-report-multiselect__search">
            <Search aria-hidden="true" size={17} />
            <span className="sr-only">{searchPlaceholder}</span>
            <input autoFocus onChange={(event) => setSearch(event.target.value)} placeholder={searchPlaceholder} type="search" value={search} />
          </label>
          <div className="working-time-report-multiselect__actions">
            <button disabled={!options.length || selectedIds.length === options.length} onClick={() => onChange(options.map((option) => option.id))} type="button">Tout sélectionner</button>
            <button disabled={!selectedIds.length} onClick={() => onChange([])} type="button">Effacer</button>
          </div>
          <div
            aria-label={`Options ${label}`}
            aria-multiselectable="true"
            className="working-time-report-multiselect__list"
            id={listboxId}
            onKeyDown={(event) => {
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
              const inputs = Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
              if (!inputs.length) return;
              event.preventDefault();
              const currentIndex = inputs.indexOf(document.activeElement as HTMLInputElement);
              const nextIndex = event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? inputs.length - 1
                  : event.key === 'ArrowDown'
                    ? Math.min(currentIndex + 1, inputs.length - 1)
                    : Math.max(currentIndex - 1, 0);
              inputs[nextIndex]?.focus();
            }}
            role="listbox"
          >
            {filteredOptions.length ? filteredOptions.map((option) => {
              const checked = selectedSet.has(option.id);
              return (
                <label aria-selected={checked} className={checked ? 'is-selected' : undefined} key={option.id} role="option">
                  <input checked={checked} onChange={() => toggle(option.id)} type="checkbox" />
                  <span className="working-time-report-multiselect__check"><Check aria-hidden="true" size={14} /></span>
                  <span><strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : null}</span>
                </label>
              );
            }) : <p>Aucun résultat.</p>}
          </div>
        </div>
      ) : null}
    </div>
  );
}
