import { Plus, X } from 'lucide-react';
import { FleetSoutesCheckbox, FleetTankCapacityInput } from './FleetFuelFields';
import { formatFleetCapacityLiters, MAX_FLEET_FUEL_TANKS } from './fleetFuel';
import { MAX_FLEET_CAPACITY_SECTIONS, type FleetCapacitySection, type FleetCapacitySectionDraft } from './fleetCapacityModel';

export function FleetCapacitySectionFields({ sections, onChange, disabled, error }: {
  sections: FleetCapacitySectionDraft[];
  onChange: (sections: FleetCapacitySectionDraft[]) => void;
  disabled: boolean;
  error: string | null;
}) {
  function updateSection(section: FleetCapacitySectionDraft) {
    onChange(sections.map(current => current.id === section.id ? section : current));
  }

  return <>
    {sections.map(section => <fieldset className="fleet-capacity-section-fields" key={section.id}>
      <legend>{section.name.trim() || 'Nouvelle sous-section'}</legend>
      <div className="fleet-capacity-edit-row">
        <label>Nom de la sous-section
          <input required disabled={disabled} value={section.name} placeholder="Ex. Eau douce"
            onChange={event => updateSection({ ...section, name: event.target.value })} />
        </label>
        <button type="button" className="sp-button sp-button--danger" disabled={disabled}
          onClick={() => onChange(sections.filter(current => current.id !== section.id))}>
          <X aria-hidden="true" size={16} />Supprimer la sous-section
        </button>
      </div>
      {section.tanks.map(tank => {
        function updateTank(patch: Partial<Omit<typeof tank, 'id'>>) {
          updateSection({ ...section, tanks: section.tanks.map(current => current.id === tank.id ? { ...tank, ...patch } : current) });
        }

        return <div className="fleet-capacity-edit-row fleet-capacity-tank-row" key={tank.id}>
          <label>Nom de la cuve
            <input required disabled={disabled} value={tank.name}
              onChange={event => updateTank({ name: event.target.value })} />
          </label>
          <label>Capacité (L)
            <FleetTankCapacityInput value={tank.capacityLiters} disabled={disabled}
              onChange={capacityLiters => updateTank({ capacityLiters })} />
          </label>
          <button type="button" className="sp-button sp-button--danger"
            aria-label={tank.name ? `Supprimer la cuve ${tank.name}` : 'Supprimer la cuve'}
            disabled={disabled} onClick={() => updateSection({
              ...section, tanks: section.tanks.filter(current => current.id !== tank.id),
            })}>
            <X aria-hidden="true" size={16} />
          </button>
          <FleetSoutesCheckbox tankName={`${tank.name.trim() || 'Nouvelle cuve'} (${section.name.trim() || 'Nouvelle sous-section'})`}
            checked={tank.showInSoutes} disabled={disabled} onChange={showInSoutes => updateTank({ showInSoutes })} />
        </div>;
      })}
      <button type="button" className="sp-button sp-button--secondary"
        disabled={disabled || section.tanks.length >= MAX_FLEET_FUEL_TANKS}
        onClick={() => updateSection({
          ...section, tanks: [...section.tanks, { id: crypto.randomUUID(), name: '', capacityLiters: null, showInSoutes: false }],
        })}>
        <Plus aria-hidden="true" size={16} />Ajouter une cuve
      </button>
    </fieldset>)}
    <button type="button" className="sp-button sp-button--secondary"
      disabled={disabled || sections.length >= MAX_FLEET_CAPACITY_SECTIONS}
      onClick={() => onChange([...sections, { id: crypto.randomUUID(), name: '', tanks: [] }])}>
      <Plus aria-hidden="true" size={16} />Ajouter une sous-section
    </button>
    {error && <p className="fleet-fuel-names-error" role="status">{error}</p>}
  </>;
}

export function FleetCapacitySectionDetails({ sections }: { sections: FleetCapacitySection[] }) {
  return sections.map(section => <section className="fleet-capacity-subsection" aria-label={section.name} key={section.name}>
    <h4>{section.name}</h4>
    {section.tanks.length > 0
      ? <dl className="fleet-detail-grid">
        {section.tanks.map(tank => <div key={tank.id}>
          <dt>{tank.name}</dt><dd>{formatFleetCapacityLiters(tank.capacityLiters)}</dd>
        </div>)}
      </dl>
      : <p className="fleet-capacity-empty">Aucune cuve renseignée.</p>}
  </section>);
}
