import { BadgeCheck, Cog, Compass, Droplets, Ruler, UsersRound, Wrench, type LucideIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { FleetCapacitySectionDetails } from './FleetCapacitySections';
import { FleetFuelDetails } from './FleetFuelFields';
import { fleetMainFuelCapacityLiters } from './fleetFuel';
import { getFleetLayoutSections, hasFleetFieldValue, type FleetLayout, type FleetLayoutField } from './fleetLayout';
import type { FleetVessel } from './fleetQueries';

const icons: Record<string, LucideIcon> = {
  identity: BadgeCheck, dimensions: Ruler, propulsion: Cog, navigation: Compass,
  crew: UsersRound, equipment: Wrench, capacities: Droplets,
};

type DetailField = Pick<FleetLayoutField, 'id' | 'label' | 'value'> & { wide?: boolean };

function DetailSection({ title, fields, icon: Icon, extra, fullWidth }: {
  title: string;
  fields: (DetailField & { content?: ReactNode })[];
  icon: LucideIcon;
  extra?: ReactNode;
  fullWidth?: boolean;
}) {
  const headingId = useId();
  if (!fields.length && !extra) return null;
  return <section aria-labelledby={headingId} className={`fleet-detail-section${fullWidth ? ' fleet-overview-capacities' : ''}`}>
    <h3 id={headingId}><Icon aria-hidden="true" size={16} />{title}</h3>
    <div className={fullWidth ? 'fleet-overview-tanks' : undefined}>
      {fields.length ? <dl className="fleet-detail-grid">
        {fields.map(({ id, label, value, wide, content }) => <div className={wide ? 'is-wide' : undefined} key={id}>
          <dt>{label}</dt><dd>{content ?? (hasFleetFieldValue(value) ? value : '—')}</dd>
        </div>)}
      </dl> : null}
    </div>
    {extra}
  </section>;
}

function PlaceOverview({ vessel, compact }: { vessel: FleetVessel; compact: boolean }) {
  const identification: DetailField[] = [
    { id: 'assetType', label: 'Type d’actif', value: vessel.assetKind === 'office' ? 'Bureau' : 'Quai' },
    { id: 'unitTypeLabel', label: 'Type source', value: vessel.unitTypeLabel },
    { id: 'registrationNumber', label: 'Immatriculation', value: vessel.registrationNumber },
    { id: 'imoNumber', label: 'Numéro IMO', value: vessel.imoNumber },
    { id: 'registrationPort', label: 'Port d’immatriculation', value: vessel.registrationPort },
    { id: 'callSign', label: 'Indicatif d’appel', value: vessel.callSign },
    { id: 'mmsi', label: 'MMSI', value: vessel.mmsi },
    { id: 'flagState', label: 'Pavillon', value: vessel.flagState },
  ];
  return <DetailSection fields={compact ? identification.filter(field => hasFleetFieldValue(field.value)) : identification}
    icon={BadgeCheck} title="Identification" />;
}

export function FleetVesselOverview({ vessel, compact = false, plans, layout }: {
  vessel: FleetVessel;
  compact?: boolean;
  plans?: ReactNode;
  layout?: FleetLayout;
}) {
  if (vessel.assetKind !== 'vessel') return <div className={compact ? 'fleet-vessel-sheet__sections' : 'fleet-overview'}>
    <PlaceOverview compact={compact} vessel={vessel} />
  </div>;

  const sections = getFleetLayoutSections(vessel, layout);
  const capacitySections = (vessel.capacitySections ?? []).filter(section => !compact || section.tanks.length > 0);
  const hasFuel = !compact || fleetMainFuelCapacityLiters(vessel) !== null || vessel.dailyFuelTankCapacityLiters != null;
  const details = sections.map(section => {
    const fields = section.fields.flatMap(field => {
      if (field.id === 'fuelCapacity' && hasFuel) {
        return [{ ...field, content: <FleetFuelDetails filledOnly={compact} hideHeading vessel={vessel} /> }];
      }
      if (field.id === 'otherCapacities' && capacitySections.length) {
        return [{ ...field, content: <FleetCapacitySectionDetails sections={capacitySections} /> }];
      }
      return compact && !hasFleetFieldValue(field.value) ? [] : [field];
    });
    return <DetailSection key={section.id} extra={section.id === 'capacities' ? plans : null}
      fields={fields} fullWidth={section.id === 'capacities'} icon={icons[section.id] ?? BadgeCheck} title={section.label} />;
  });

  if (!compact) return <div className="fleet-overview"><div className="fleet-overview-grid">{details}</div></div>;
  return <div className="fleet-vessel-sheet__sections">{details}</div>;
}
