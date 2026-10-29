import { ChevronDown, Search } from 'lucide-react';
import { useDeferredValue, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { filterProjectPortGroups, formatProjectPort, type ProjectPort } from './projectPorts';

interface ProjectPortComboboxProps {
  disabled?: boolean;
  fitWithinScrollContainer?: boolean;
  id?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value?: string;
}

export function ProjectPortCombobox({
  disabled = false,
  fitWithinScrollContainer = false,
  id,
  onChange,
  placeholder = 'Rechercher un port français ou anglais, un département ou un LOCODE…',
  value = '',
}: ProjectPortComboboxProps) {
  const listboxId = useId();
  const controlRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ above: boolean; maxHeight: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [filterQuery, setFilterQuery] = useState('');
  const deferredQuery = useDeferredValue(filterQuery);
  const matchingGroups = useMemo(() => filterProjectPortGroups(deferredQuery), [deferredQuery]);
  const matchingPorts = useMemo(
    () => matchingGroups.flatMap((group) => group.ports),
    [matchingGroups],
  );
  const portIndexes = useMemo(
    () => new Map(matchingPorts.map((port, index) => [port, index])),
    [matchingPorts],
  );
  const activePort = matchingPorts[activeIndex];

  useLayoutEffect(() => {
    const control = controlRef.current;
    if (!fitWithinScrollContainer || !open || disabled || !control) return;
    let scrollContainer = control.parentElement;
    while (scrollContainer) {
      const style = getComputedStyle(scrollContainer);
      if (/(auto|scroll|hidden|clip)/.test(`${style.overflowY} ${style.overflow}`)) break;
      scrollContainer = scrollContainer.parentElement;
    }
    const position = () => {
      const bounds = control.getBoundingClientRect();
      const viewport = window.visualViewport;
      let top = viewport?.offsetTop ?? 0;
      let bottom = top + (viewport?.height ?? window.innerHeight);
      if (scrollContainer) {
        const pane = scrollContainer.getBoundingClientRect();
        const paneTop = pane.top + scrollContainer.clientTop;
        top = Math.max(top, paneTop);
        bottom = Math.min(bottom, scrollContainer.clientHeight ? paneTop + scrollContainer.clientHeight : pane.bottom);
      }
      const above = Math.max(0, bounds.top - top - 5);
      const below = Math.max(0, bottom - bounds.bottom - 5);
      const next = { above: above > below, maxHeight: Math.floor(Math.min(310, Math.max(above, below))) };
      setPlacement(current => current?.above === next.above && current.maxHeight === next.maxHeight ? current : next);
    };
    let frame: number | null = null;
    const schedule = (event?: Event) => {
      if (event?.target instanceof Node && resultsRef.current?.contains(event.target)) return;
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => { frame = null; position(); });
    };
    position();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => schedule());
    if (scrollContainer) observer?.observe(scrollContainer);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, [disabled, fitWithinScrollContainer, open]);

  useLayoutEffect(() => {
    const list = resultsRef.current;
    if (!fitWithinScrollContainer || !open || !activePort || !list) return;
    const option = document.getElementById(`${listboxId}-option-${activeIndex}`);
    if (!option) return;
    const bounds = list.getBoundingClientRect(), row = option.getBoundingClientRect();
    const top = bounds.top + (list.querySelector('header')?.getBoundingClientRect().height ?? 0)
      + (option.closest('section')?.querySelector('h3')?.getBoundingClientRect().height ?? 0);
    if (row.top < top) list.scrollTop -= top - row.top;
    else if (row.bottom > bounds.bottom) list.scrollTop += row.bottom - bounds.bottom;
  }, [activeIndex, activePort, fitWithinScrollContainer, listboxId, open]);

  function selectPort(port: ProjectPort) {
    onChange(port.port);
    setOpen(false);
    setActiveIndex(-1);
    setFilterQuery('');
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, Math.max(0, matchingPorts.length - 1)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (event.key === 'Enter' && open && activePort) {
      event.preventDefault();
      selectPort(activePort);
      return;
    }
    if (event.key === 'Escape') setOpen(false);
  }

  return <div className="project-port-combobox">
    <div className="project-port-combobox__control" ref={controlRef}>
      <Search aria-hidden="true" size={16} />
      <input
        id={id}
        aria-activedescendant={open && activePort ? `${listboxId}-option-${activeIndex}` : undefined}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open}
        autoComplete="off"
        disabled={disabled}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setFilterQuery(event.target.value);
          setActiveIndex(-1);
          setOpen(true);
        }}
        onFocus={() => {
          setFilterQuery('');
          setActiveIndex(-1);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="combobox"
        value={value}
      />
      <ChevronDown aria-hidden="true" size={16} />
    </div>
    {open && !disabled ? <div className="project-port-combobox__results" id={listboxId} ref={resultsRef} role="listbox"
      style={fitWithinScrollContainer && placement ? { maxHeight: placement.maxHeight, top: placement.above ? 'auto' : 'calc(100% + 5px)', bottom: placement.above ? 'calc(100% + 5px)' : 'auto' } : undefined}>
      <header><Search aria-hidden="true" size={14} /> Ports français et anglais · classés par département</header>
      {matchingGroups.map((group) => <section aria-label={group.department} key={group.department} role="group">
        <h3>{group.department}</h3>
        {group.ports.map((port) => {
          const optionIndex = portIndexes.get(port) ?? -1;
          return <div
            aria-selected={port.port === value}
            className={optionIndex === activeIndex ? 'is-active' : undefined}
            id={`${listboxId}-option-${optionIndex}`}
            key={`${port.department}-${port.port}-${port.locode}`}
            onClick={(event) => {
              event.preventDefault();
              selectPort(port);
            }}
            onMouseDown={(event) => event.preventDefault()}
            role="option"
          >
            <strong>{port.port}</strong>
            <small>{formatProjectPort(port).slice(port.port.length).replace(/^ – /, '')}</small>
          </div>;
        })}
      </section>)}
      {!matchingGroups.length ? <p>Aucun port ne correspond à cette recherche.</p> : null}
    </div> : null}
  </div>;
}
