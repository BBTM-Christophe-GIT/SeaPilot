import { ChevronDown, Plus, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  filterServiceProviders,
  groupServiceProvidersBySpecialty,
  serviceProviderSpecialtyNames,
  type ServiceProviderCatalogEntry,
} from './serviceProviders';

interface ServiceProviderPickerProps<T extends ServiceProviderCatalogEntry> {
  addLabel?: string;
  disabled?: boolean;
  label: string;
  onAdd?: () => void;
  onChange: (provider: T) => void;
  placeholder?: string;
  providers: T[];
  required?: boolean;
  value: string;
}

export function ServiceProviderPicker<T extends ServiceProviderCatalogEntry>({
  addLabel = 'Ajouter',
  disabled = false,
  label,
  onAdd,
  onChange,
  placeholder = 'Rechercher une société ou une spécialité…',
  providers,
  required = false,
  value,
}: ServiceProviderPickerProps<T>) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(value);

  useEffect(() => {
    if (!isOpen) setQuery(value);
  }, [isOpen, value]);

  const filteredProviders = useMemo(() => filterServiceProviders(providers, query === value ? '' : query), [providers, query, value]);
  const groups = useMemo(() => groupServiceProvidersBySpecialty(filteredProviders), [filteredProviders]);

  function choose(provider: T) {
    onChange(provider);
    setQuery(provider.name);
    setIsOpen(false);
  }

  return (
    <div className="service-provider-picker" ref={containerRef}>
      <div className="service-provider-picker__label">
        <span>{label}{required ? ' *' : ''}</span>
        {onAdd ? <button className="service-provider-picker__add" disabled={disabled} onClick={onAdd} type="button"><Plus aria-hidden="true" size={13} /> {addLabel}</button> : null}
      </div>
      <div className="service-provider-picker__control">
        <Search aria-hidden="true" size={16} />
        <input
          aria-label={label}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          autoComplete="off"
          disabled={disabled}
          onBlur={() => window.setTimeout(() => {
            if (!containerRef.current?.contains(document.activeElement)) {
              setIsOpen(false);
              setQuery(value);
            }
          }, 0)}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={(event) => {
            setIsOpen(true);
            event.currentTarget.select();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setIsOpen(false);
              setQuery(value);
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              setIsOpen(true);
            } else if (event.key === 'Enter' && isOpen && filteredProviders[0]) {
              event.preventDefault();
              choose(filteredProviders[0]);
            }
          }}
          placeholder={placeholder}
          required={required && !value}
          role="combobox"
          value={query}
        />
        <ChevronDown aria-hidden="true" size={16} />
      </div>
      {isOpen ? (
        <div className="service-provider-picker__menu" id={listboxId} role="listbox">
          {groups.map((group) => (
            <section aria-label={group.specialty} key={group.specialty} role="group">
              <header><span>{group.specialty}</span><small>{group.providers.length}</small></header>
              {group.providers.map((provider) => (
                <button
                  aria-selected={provider.name === value}
                  key={`${group.specialty}-${provider.id}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(provider)}
                  role="option"
                  type="button"
                >
                  <strong>{provider.name}</strong>
                  <small>{serviceProviderSpecialtyNames(provider).join(' · ') || 'Sans spécialité'}{provider.city ? ` · ${provider.city}` : ''}</small>
                </button>
              ))}
            </section>
          ))}
          {!filteredProviders.length ? <p>Aucune société ne correspond à la recherche.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
