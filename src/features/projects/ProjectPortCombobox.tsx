import { ChevronDown, Search } from 'lucide-react';
import { useDeferredValue, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { filterProjectPortGroups, formatProjectPort, type ProjectPort } from './projectPorts';

interface ProjectPortComboboxProps {
  disabled?: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  value?: string;
}

export function ProjectPortCombobox({
  disabled = false,
  onChange,
  placeholder = 'Rechercher un port français ou anglais, un département ou un LOCODE…',
  value = '',
}: ProjectPortComboboxProps) {
  const listboxId = useId();
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
    <div className="project-port-combobox__control">
      <Search aria-hidden="true" size={16} />
      <input
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
    {open && !disabled ? <div className="project-port-combobox__results" id={listboxId} role="listbox">
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
