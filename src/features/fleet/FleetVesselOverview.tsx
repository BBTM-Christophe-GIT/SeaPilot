import { BadgeCheck, Cog, Compass, Droplets, Gauge, Ruler, UsersRound, Waves, Wrench, type LucideIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { FleetCapacitySectionDetails } from './FleetCapacitySections';
import { FleetFuelDetails } from './FleetFuelFields';
import { fleetMainFuelCapacityLiters } from './fleetFuel';
import type { FleetVessel } from './fleetQueries';

type FieldValue = string | number | null | undefined;
type DetailField = [label: string, value: FieldValue, wide?: boolean];

function hasValue(value: FieldValue): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  const text = value?.trim();
  return Boolean(text && text !== '—' && text !== '-');
}

function unit(value: FieldValue, suffix: string): string | null {
  return hasValue(value) ? `${value} ${suffix}` : null;
}

function DetailSection({ title, fields, filledOnly, icon: Icon }: {
  title: string;
  fields: DetailField[];
  filledOnly?: boolean;
  icon: LucideIcon;
}) {
  const headingId = useId();
  const visible = filledOnly ? fields.filter(([, value]) => hasValue(value)) : fields;
  if (!visible.length) return null;
  return <section aria-labelledby={headingId} className="fleet-detail-section">
    <h3 id={headingId}><Icon aria-hidden="true" size={16} />{title}</h3>
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
  const identification: DetailField[] = [
    ['Type d’actif', compact ? null : assetType],
    ['Type source', displaySourceType ? sourceType : null],
    ['Immatriculation', vessel.registrationNumber], ['Numéro IMO', vessel.imoNumber],
    [compact ? 'Port' : 'Port d’immatriculation', vessel.registrationPort],
    [compact ? 'Indicatif' : 'Indicatif d’appel', vessel.callSign],
    ['MMSI', vessel.mmsi], ['Pavillon', vessel.flagState],
  ];
  const dimensions: DetailField[] = [
    ['Largeur hors tout', unit(vessel.beamOverallM, 'm')], ['Tirant d’eau', unit(vessel.draftMeters, 'm')],
    ['Jauge brute', unit(vessel.grossTonnage, 'UMS')], ['Jauge nette', vessel.netTonnage],
    ['Hauteur du Franc Bord - Été', unit(vessel.summerFreeboardMm, 'mm')], ['Port en lourd', unit(vessel.deadweightTonnes, 't')],
    ['Année de construction', vessel.builtYear],
  ];
  const engine: DetailField = ['Moteur principal', vessel.mainEngine];
  const gensets: DetailField = ['Groupes électrogènes', vessel.gensets];
  const traction: DetailField = ['Traction', unit(vessel.bollardPullTonnes, 't')];
  const range: DetailField = ['Autonomie', vessel.rangeDescription, true];
  const classification: DetailField = ['Classification', vessel.classificationLabel];
  const navigation: DetailField = ['Navigation', vessel.navigationCategory, compact];
  const safeManning: DetailField = ['Effectif minimal', vessel.safeManning ?? vessel.crewMembers];
  const medicalDotation: DetailField = ['Dotation médicale', vessel.medicalDotation];
  const insurer: DetailField = ['Assureur RC (P&I)', vessel.liabilityInsurer, true];
  const equipment: DetailField[] = [
    ['Équipements de pont', vessel.deckEquipment, true],
    ['Navigation & communications', vessel.electronicsCommunications, true],
  ];
  const speed = unit(vessel.maxSpeedKnots, 'nd');
  const power = unit(vessel.mainEnginePowerKw, 'kW');
  const hasFuel = !compact || fleetMainFuelCapacityLiters(vessel) !== null || vessel.dailyFuelTankCapacityLiters != null;
  const capacitySections = (vessel.capacitySections ?? []).filter(section => !compact || section.tanks.length > 0);
  const capacityDetails = <>
    {hasFuel ? <FleetFuelDetails filledOnly={compact} vessel={vessel} /> : null}
    <FleetCapacitySectionDetails sections={capacitySections} />
  </>;
  const capacityHeading = <h3><Droplets aria-hidden="true" size={16} />Capacités</h3>;

  if (!compact) {
    return <div className="fleet-overview">
      <div className="fleet-overview-grid">
        <DetailSection title={isVessel ? 'Identification maritime' : 'Identification'} icon={BadgeCheck}
          fields={isVessel ? [...identification, ['Acronyme', vessel.acronym]] : identification} />
        {isVessel ? <>
          <DetailSection title="Dimensions et tonnage" icon={Ruler}
            fields={[[ 'Longueur hors tout', vessel.lengthOverall], ...dimensions]} />
          <DetailSection title="Propulsion et performances" icon={Cog} fields={[
            ['Puissance moteur', power], ['Propulseur d’étrave', unit(vessel.bowThrusterPowerKw, 'kW')],
            ['Vitesse maximale', speed], traction, engine, gensets, range,
          ]} />
          <DetailSection title="Navigation et conformité" icon={Compass} fields={[classification, navigation, insurer]} />
          <DetailSection title="Équipage et sécurité" icon={UsersRound}
            fields={[[ 'Capacité maximale', vessel.maxPeople], safeManning, medicalDotation]} />
          <DetailSection title="Équipements et aménagements" icon={Wrench}
            fields={[...equipment, ['Aménagements', vessel.accommodation, true]]} />
          <section aria-label="Capacités" className="fleet-detail-section fleet-overview-capacities">
            {capacityHeading}
            <div className="fleet-overview-tanks">{capacityDetails}</div>
            {plans}
          </section>
        </> : null}
      </div>
    </div>;
  }

  const highlights = [
    { label: 'Longueur hors tout', value: vessel.lengthOverall, Icon: Ruler },
    { label: 'Vitesse', value: speed, Icon: Waves },
    { label: 'Capacité', value: vessel.maxPeople, Icon: UsersRound },
    { label: 'Puissance', value: power, Icon: Gauge },
  ].filter(({ value }) => hasValue(value));

  return <>
    {isVessel && highlights.length ? <section aria-label="Caractéristiques principales" className="fleet-highlight-grid">
      {highlights.map(({ label, value, Icon }) => <div key={label}>
        <Icon aria-hidden="true" size={18} /><span><small>{label}</small><strong>{value}</strong></span>
      </div>)}
    </section> : null}
    <div className="fleet-vessel-sheet__sections">
      <DetailSection filledOnly icon={BadgeCheck} title="Identification" fields={identification} />
      {isVessel ? <>
        <DetailSection filledOnly icon={Ruler} title="Dimensions et tonnage" fields={dimensions} />
        <DetailSection filledOnly icon={Compass} title="Navigation et conformité" fields={[
          classification, safeManning, navigation, medicalDotation,
        ]} />
        <DetailSection filledOnly icon={Cog} title="Propulsion & exploitation" fields={[
          engine, gensets, traction, range, equipment[0], insurer, equipment[1],
        ]} />
        {hasFuel || capacitySections.length ? <section className="fleet-detail-section fleet-vessel-sheet__capacities" aria-label="Capacités">
          {capacityHeading}
          {capacityDetails}
        </section> : null}
      </> : null}
    </div>
  </>;
}
