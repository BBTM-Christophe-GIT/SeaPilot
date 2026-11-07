import { ChevronDown, ChevronRight, Fuel, Ship, Trash2 } from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { compareFleetAssets, normalizeFleetName, type FleetDisplayAsset } from '../fleet/fleetDisplay';
import { seaOperationContextDate, seaOperationToday } from './seaOperationModel';
import type { SeaOperationRecord, SeaOperationVessel } from './seaOperationQueries';
import { hasSeaOperationConsumption } from './useSeaOperationConsumption';
import './seaOperationRegisterTree.css';

interface Props {
  records: readonly SeaOperationRecord[];
  vessels: readonly SeaOperationVessel[];
  selectedId?: string | null;
  disabled?: boolean;
  consumption?: ReadonlySet<string>;
  /** Change the key when the active search or filter changes to reveal matching branches. */
  filterKey?: string;
  onSelect: (record: SeaOperationRecord) => void;
  onConsumption: (record: SeaOperationRecord) => void;
  onDelete: (record: SeaOperationRecord) => void;
}

type Entry = { record: SeaOperationRecord; date: string };
type Year = { months: Map<string, Entry[]>; count: number };
type Vessel = { key: string; asset: FleetDisplayAsset; unknown: boolean; years: Map<string, Year>; count: number };

const shortDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeZone: 'Europe/Paris' });
const monthName = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'Europe/Paris' });

function dateFromCalendar(value: string | undefined): string {
  const day = value?.match(/^\d{4}-\d{2}-\d{2}(?=$|T)/)?.[0];
  if (!day) return '';
  const parsed = new Date(`${day}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : '';
}

function dateFromInstant(value: string | null): string {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? seaOperationToday(new Date(time)) : '';
}

function operationDate(record: SeaOperationRecord): string {
  const { etd } = record.draft.vessel;
  const departure = /(?:Z|[+-]\d{2}:\d{2})$/.test(etd) ? dateFromInstant(etd) : dateFromCalendar(etd);
  return dateFromCalendar(seaOperationContextDate(record.draft)) || departure
    || dateFromInstant(record.signedAt) || dateFromInstant(record.createdAt) || dateFromInstant(record.updatedAt);
}

function groupOperations(records: readonly SeaOperationRecord[], vessels: readonly SeaOperationVessel[]) {
  const catalog = new Map(vessels.map(vessel => [String(vessel.id), vessel]));
  const groups = new Map<string, Vessel>();
  const entries = records.map(record => ({ record, date: operationDate(record) })).sort((a, b) => b.date.localeCompare(a.date));

  for (const entry of entries) {
    const { id, name } = entry.record.draft.vessel;
    const asset = catalog.get(id) ?? { name: name.trim() || 'Navire à renseigner' };
    const vesselKey = id ? `id:${id}` : `name:${normalizeFleetName(name)}`;
    const vessel = groups.get(vesselKey) ?? { key: vesselKey, asset, unknown: !id && !name.trim(), years: new Map<string, Year>(), count: 0 };
    const yearKey = entry.date.slice(0, 4), monthKey = entry.date.slice(0, 7);
    const year = vessel.years.get(yearKey) ?? { months: new Map<string, Entry[]>(), count: 0 };
    const month = year.months.get(monthKey) ?? [];
    month.push(entry);
    year.count++;
    vessel.count++;
    year.months.set(monthKey, month);
    vessel.years.set(yearKey, year);
    groups.set(vesselKey, vessel);
  }

  return [...groups.values()].sort((a, b) => Number(a.unknown) - Number(b.unknown) || compareFleetAssets(a.asset, b.asset));
}

function RegisterBranch({ label, count, expanded, disabled, vessel, onToggle, children }: {
  label: string; count: number; expanded: boolean; disabled: boolean; vessel?: boolean; onToggle: () => void; children: ReactNode;
}) {
  const id = useId();
  return <li className={`so-tree-branch${vessel ? ' so-tree-vessel' : ''}`}>
    <button type="button" className="so-tree-disclosure" aria-label={label} aria-expanded={expanded} aria-controls={id} disabled={disabled} onClick={onToggle}>
      {expanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
      {vessel && <Ship size={16} aria-hidden="true" />}
      <span className="so-tree-branch-label">{label}</span><span className="so-tree-count" aria-hidden="true">{count}</span>
    </button>
    <ul id={id} hidden={!expanded}>{expanded ? children : null}</ul>
  </li>;
}

function OperationChip({ entry, selectedId, disabled, consumption, onSelect, onConsumption, onDelete }: Omit<Props, 'records' | 'vessels' | 'filterKey'> & { entry: Entry }) {
  const { record, date } = entry;
  const title = record.draft.project || 'Opération sans titre';
  const canOpenConsumption = hasSeaOperationConsumption(record);
  const hasReading = consumption?.has(record.id);
  const decision = record.status === 'draft' ? 'Brouillon' : record.draft.decision === 'NO_GO' ? 'NO GO' : 'GO';
  const consumptionStatus = !canOpenConsumption ? 'Conso non applicable'
    : hasReading ? 'Conso renseignée' : hasReading === false ? 'Conso non renseignée' : 'Conso à vérifier';
  return <li className="so-record-entry so-tree-chip" data-selected={selectedId === record.id}>
    <button type="button" className="so-record" aria-pressed={selectedId === record.id} aria-controls="sea-operation-register-map" disabled={disabled} onClick={() => onSelect(record)}>
      <span className="so-tree-chip-content">
        <strong>{title}</strong>
        <span className="so-tree-chip-details">
          {date && <time dateTime={date}>{shortDate.format(new Date(`${date}T12:00:00Z`))}</time>}
          {record.draft.client && <span>{record.draft.client}</span>}
          <span className={`so-badge${record.status === 'signed' ? decision === 'GO' ? ' is-go' : ' is-nogo' : ''}`}>{decision}</span>
          <span className={`so-badge${canOpenConsumption && hasReading ? ' so-tree-conso-recorded' : ''}`}>
            {consumptionStatus}
          </span>
        </span>
      </span>
    </button>
    {(canOpenConsumption || record.canDelete) && <div className="so-record-actions" role="group" aria-label={`Actions pour ${title}`}>
      {canOpenConsumption && <button type="button" className="sp-button sp-button--secondary so-secondary" disabled={disabled} onClick={() => onConsumption(record)}><Fuel size={16} aria-hidden="true" />Conso</button>}
      {record.canDelete && <button type="button" className="sp-button sp-button--secondary so-secondary so-delete-record" disabled={disabled} onClick={() => onDelete(record)}><Trash2 size={16} aria-hidden="true" />Supprimer</button>}
    </div>}
  </li>;
}

export function SeaOperationRegisterTree({ records, vessels, filterKey = '', selectedId, disabled = false, ...actions }: Props) {
  const currentMonth = seaOperationToday().slice(0, 7);
  const currentYear = currentMonth.slice(0, 4);
  const groups = useMemo(() => groupOperations(records, vessels), [records, vessels]);
  const [branches, setBranches] = useState<{ filterKey: string; overrides: Map<string, { open: boolean; selection: Props['selectedId'] }> }>();

  function branch(key: string, current: boolean, selected: boolean) {
    const override = branches?.filterKey === filterKey ? branches.overrides.get(key) : undefined;
    const expanded = override && (!selected || override.selection === selectedId) ? override.open : Boolean(filterKey || current || selected);
    return { expanded, disabled, onToggle: () => setBranches(previous => {
      const overrides = new Map(previous?.filterKey === filterKey ? previous.overrides : undefined);
      overrides.set(key, { open: !expanded, selection: selectedId });
      return { filterKey, overrides };
    }) };
  }

  return <ul className="so-records so-register-tree" aria-label="Opérations par navire, année et mois">
    {groups.map(vessel => {
      const years = [...vessel.years].map(([year, value]) => ({ year, ...value, selected: [...value.months.values()].some(month => month.some(({ record }) => record.id === selectedId)) }));
      return <RegisterBranch key={vessel.key} label={vessel.asset.name} count={vessel.count} vessel {...branch(vessel.key, vessel.years.has(currentYear), years.some(year => year.selected))}>
        {years.map(({ year, months, count, selected }) => <RegisterBranch key={year} label={year || 'Date non renseignée'} count={count} {...branch(`${vessel.key}/year:${year}`, year === currentYear, selected)}>
          {[...months].map(([month, entries]) => {
            const monthText = month ? monthName.format(new Date(`${month}-15T12:00:00Z`)) : '';
            return month ? <RegisterBranch key={month} label={monthText[0].toUpperCase() + monthText.slice(1)} count={entries.length}
              {...branch(`${vessel.key}/month:${month}`, month === currentMonth, entries.some(({ record }) => record.id === selectedId))}>
              {entries.map(entry => <OperationChip key={entry.record.id} entry={entry} selectedId={selectedId} disabled={disabled} {...actions} />)}
            </RegisterBranch> : entries.map(entry => <OperationChip key={entry.record.id} entry={entry} selectedId={selectedId} disabled={disabled} {...actions} />);
          })}
        </RegisterBranch>)}
      </RegisterBranch>;
    })}
  </ul>;
}
