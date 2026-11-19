import { BadgeCheck, Cog, Compass, Droplets, Gauge, Ruler, UsersRound, Waves, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { FleetCapacitySectionDetails } from './FleetCapacitySections';
import { FleetFuelDetails } from './FleetFuelFields';
import { fleetMainFuelCapacityLiters } from './fleetFuel';
import type { FleetVessel } from './fleetQueries';

type FieldValue = string | number | null | undefined;
type DetailField = [label: string, value: FieldValue, wide?: boolean];

function hasValue(value: FieldValue): boolean {
  return typeof value === 'number' ? Number.isFinite(value) : Boolean(value?.trim() && value.trim() !== '—' && value.trim() !== '-');
}

function unit(value: FieldValue, suffix: string): string | null {
  return hasValue(value) ? `${value} ${suffix}` : null;
}

function DetailSection({ title, fields, compact, icon: Icon }: { title: string; fields: DetailField[]; compact: boolean; icon?: LucideIcon }) {
  const visible = compact ? fields.filter(([, value]) => hasValue(value)) : fields;
  if (!visible.length) return null;
  return <section className="fleet-detail-section">
    <h3>{compact && Icon ? <Icon aria-hidden="true" size={16} /> : null}{title}</h3>
    <dl className="fleet-detail-grid">
      {visible.map(([label, value, wide]) => <div className={wide ? 'is-wide' : undefined} key={label}>
        <dt>{label}</dt><dd>{hasValue(value) ? value : '—'}</dd>
      </div>)}
    </dl>
  </section>;
}

export function FleetVesselOverview({ vessel, compact = false, plans }: { vessel: FleetVessel; compact?: boolean; plans?: ReactNode }) {
  const isVessel = vessel.assetKind === 'vessel';
  const assetType = { vessel: 'Navire', office: 'Bureau', quay: 'Quai' }[vessel.assetKind];
  const sourceType = vessel.unitTypeLabel.trim();
  const displaySourceType = !compact || (vessel.typeLabel.trim() && sourceType.toLocaleLowerCase('fr') !== assetType.toLocaleLowerCase('fr')
    && sourceType.toLocaleLowerCase('fr') !== vessel.typeLabel.trim().toLocaleLowerCase('fr'));
  const highlights = [
    { label: compact ? 'Longueur hors tout' : 'Longueur', value: vessel.lengthOverall, Icon: Ruler },
    { label: 'Vitesse', value: unit(vessel.maxSpeedKnots, 'nd'), Icon: Waves },
    { label: 'Capacité', value: vessel.maxPeople, Icon: UsersRound },
    { label: 'Puissance', value: unit(vessel.mainEnginePowerKw, 'kW'), Icon: Gauge },
  ].filter(({ value }) => !compact || hasValue(value));
  const hasFuel = !compact || fleetMainFuelCapacityLiters(vessel) !== null || vessel.dailyFuelTankCapacityLiters != null;
  const capacitySections = (vessel.capacitySections ?? []).filter(section => !compact || section.tanks.length > 0);

  const dimensions: DetailField[] = [
    ['Largeur hors tout', unit(vessel.beamOverallM, 'm')], ['Tirant d’eau', unit(vessel.draftMeters, 'm')],
    ['Jauge brute', unit(vessel.grossTonnage, 'UMS')], ['Port en lourd', unit(vessel.deadweightTonnes, 't')],
    ['Année de construction', vessel.builtYear],
  ];
  const navigation: DetailField[] = [
    ['Classification', vessel.classificationLabel], ['Effectif minimal', vessel.safeManning ?? vessel.crewMembers],
    ['Navigation', vessel.navigationCategory, true], ['Dotation médicale', vessel.medicalDotation],
  ];
  const summary = isVessel && highlights.length ? <section aria-label="Caractéristiques principales" className="fleet-highlight-grid">
      {highlights.map(({ label, value, Icon }) => <div key={label}>
        <Icon aria-hidden="true" size={18} /><span><small>{label}</small><strong>{hasValue(value) ? value : '—'}</strong></span>
      </div>)}
    </section> : null;
  const sections = <>
    <DetailSection compact={compact} icon={BadgeCheck} title="Identification" fields={[
      ['Type d’actif', compact ? null : assetType], ['Type source', displaySourceType ? sourceType : null],
      ['Immatriculation', vessel.registrationNumber],
      ['Numéro IMO', vessel.imoNumber], ['Port', vessel.registrationPort], ['Indicatif', vessel.callSign],
      ['MMSI', vessel.mmsi], ['Pavillon', vessel.flagState],
    ]} />
    {isVessel ? <>
      {compact ? <>
        <DetailSection compact icon={Ruler} title="Dimensions et tonnage" fields={dimensions} />
        <DetailSection compact icon={Compass} title="Navigation et conformité" fields={navigation} />
      </> : <DetailSection compact={false} title="Caractéristiques" fields={[
        ['Année de construction', vessel.builtYear], ['Classification', vessel.classificationLabel],
        ['Navigation', vessel.navigationCategory], ['Jauge brute', unit(vessel.grossTonnage, 'UMS')],
        ['Largeur hors tout', unit(vessel.beamOverallM, 'm')], ['Tirant d’eau', unit(vessel.draftMeters, 'm')],
        ['Port en lourd', unit(vessel.deadweightTonnes, 't')], ['Effectif minimal', vessel.safeManning ?? vessel.crewMembers],
        ['Dotation médicale', vessel.medicalDotation],
      ]} />}
      <DetailSection compact={compact} icon={Cog} title="Propulsion & exploitation" fields={[
        ['Moteur principal', vessel.mainEngine], ['Groupes électrogènes', vessel.gensets],
        ['Traction', unit(vessel.bollardPullTonnes, 't')], ['Autonomie', vessel.rangeDescription, true],
        ['Équipements de pont', vessel.deckEquipment, true], ['Assureur RC (P&I)', vessel.liabilityInsurer, true],
        ['Navigation & communications', vessel.electronicsCommunications, true],
      ]} />
      {hasFuel || capacitySections.length || plans ? <section className={`fleet-detail-section${compact ? ' fleet-vessel-sheet__capacities' : ''}`} aria-label="Capacités">
        <h3>{compact ? <Droplets aria-hidden="true" size={16} /> : null}Capacités</h3>
        {hasFuel ? <FleetFuelDetails filledOnly={compact} vessel={vessel} /> : null}
        <FleetCapacitySectionDetails sections={capacitySections} />
        {plans}
      </section> : null}
    </> : null}
  </>;
  return <>{summary}{compact ? <div className="fleet-vessel-sheet__sections">{sections}</div> : sections}</>;
}
