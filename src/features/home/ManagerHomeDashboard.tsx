import {
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileCheck2,
  Ship,
  ShoppingCart,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoleKey } from '../permissions/roles';
import {
  fetchManagerHomeDashboard,
  toLocalIsoDate,
  type ManagerHomeFilter,
  type ManagerHomeGroupKey,
  type ManagerHomeItem,
  type ManagerHomeTone,
  type ManagerHomeDashboardResult,
} from './managerHomeData';
import { itemMatchesVessel } from './managerHomeVessels';
import './managerHomeVessels.css';

interface ManagerHomeDashboardProps {
  client: SupabaseClient;
  firstName: string;
  personId: number | null;
  roles: RoleKey[];
}

interface CalendarCell {
  key: string;
  day: number;
  isCurrentMonth: boolean;
}

interface QueueGroupDefinition {
  key: ManagerHomeGroupKey;
  label: string;
  icon: LucideIcon;
}

const QUEUE_GROUPS: QueueGroupDefinition[] = [
  { key: 'purchases', label: 'Achats', icon: ShoppingCart },
  { key: 'workingTime', label: 'Temps de travail', icon: Clock3 },
  { key: 'procedures', label: 'Procédures QHSE', icon: BookOpenCheck },
  { key: 'fleetDocuments', label: 'Flotte & documents', icon: Ship },
  { key: 'humanResources', label: 'Ressources humaines', icon: Users },
];

const FILTERS: Array<{ key: ManagerHomeFilter; label: string }> = [
  { key: 'all', label: 'Tous' },
  { key: 'urgent', label: 'Urgents' },
  { key: 'week', label: 'Cette semaine' },
  { key: 'purchases', label: 'Achats' },
  { key: 'documents', label: 'Documents' },
  { key: 'procedures', label: 'Procédures QHSE' },
  { key: 'fleet', label: 'Documents flotte' },
  { key: 'workingTime', label: 'Temps de travail' },
  { key: 'humanResources', label: 'Ressources humaines' },
];

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const TONE_PRIORITY: ManagerHomeTone[] = ['danger', 'warning', 'success'];
const EMPTY_RESULT: ManagerHomeDashboardResult = { items: [], vessels: [], unavailableSources: [], scopeLabel: null };

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1, 12);
}

function monthLabel(date: Date): string {
  const label = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function queueDateLabel(dateKey: string): string {
  const label = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(parseIsoDate(dateKey));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function shortKeyDateLabel(dateKey: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(parseIsoDate(dateKey)).replace('.', '');
}

function calendarCells(month: Date): CalendarCell[] {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12);
  const leadingDays = (firstDay.getDay() + 6) % 7;
  const cells: CalendarCell[] = [];

  for (let index = 0; index < leadingDays; index += 1) {
    const date = new Date(month.getFullYear(), month.getMonth(), index - leadingDays + 1, 12);
    cells.push({ key: toLocalIsoDate(date), day: date.getDate(), isCurrentMonth: false });
  }
  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const date = new Date(month.getFullYear(), month.getMonth(), day, 12);
    cells.push({ key: toLocalIsoDate(date), day, isCurrentMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const date = new Date(month.getFullYear(), month.getMonth() + 1, cells.length - leadingDays - lastDay.getDate() + 1, 12);
    cells.push({ key: toLocalIsoDate(date), day: date.getDate(), isCurrentMonth: false });
  }
  return cells;
}

function markerTone(items: ManagerHomeItem[]): ManagerHomeTone | null {
  return TONE_PRIORITY.find((tone) => items.some((item) => item.tone === tone)) || null;
}

function itemMatchesFilter(item: ManagerHomeItem, filter: ManagerHomeFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'urgent') return item.urgent;
  if (filter === 'week') return item.thisWeek;
  return item.tags.includes(filter);
}

function filterCount(items: ManagerHomeItem[], filter: ManagerHomeFilter): number {
  return items.filter((item) => itemMatchesFilter(item, filter)).length;
}

function nearestKeyDates(items: ManagerHomeItem[], todayKey: string): ManagerHomeItem[] {
  const seen = new Set<string>();
  return [...items]
    .filter((item) => item.dueDate > todayKey)
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate) || TONE_PRIORITY.indexOf(left.tone) - TONE_PRIORITY.indexOf(right.tone))
    .filter((item) => {
      if (seen.has(item.dueDate)) return false;
      seen.add(item.dueDate);
      return true;
    })
    .slice(0, 2);
}

function CalendarPanel({
  displayedMonth,
  items,
  onChangeMonth,
  onSelectDate,
  selectedDate,
  todayKey,
}: {
  displayedMonth: Date;
  items: ManagerHomeItem[];
  onChangeMonth: (month: Date) => void;
  onSelectDate: (dateKey: string) => void;
  selectedDate: string;
  todayKey: string;
}) {
  const cells = useMemo(() => calendarCells(displayedMonth), [displayedMonth]);
  const itemsByDate = useMemo(() => {
    const result = new Map<string, ManagerHomeItem[]>();
    items.forEach((item) => item.visibleDates.forEach((dateKey) => {
      const existing = result.get(dateKey) || [];
      existing.push(item);
      result.set(dateKey, existing);
    }));
    return result;
  }, [items]);
  const keyDates = useMemo(() => nearestKeyDates(items, todayKey), [items, todayKey]);

  return (
    <aside className="manager-home-calendar" aria-label="Calendrier des échéances">
      <header className="manager-home-calendar-header">
        <div>
          <span>Calendrier</span>
          <h2>{monthLabel(displayedMonth)}</h2>
        </div>
        <div className="manager-home-month-controls">
          <button aria-label="Mois précédent" onClick={() => onChangeMonth(addMonths(displayedMonth, -1))} type="button">
            <ChevronLeft aria-hidden="true" size={17} />
          </button>
          <button aria-label="Mois suivant" onClick={() => onChangeMonth(addMonths(displayedMonth, 1))} type="button">
            <ChevronRight aria-hidden="true" size={17} />
          </button>
        </div>
      </header>

      <div className="manager-home-weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map((label) => <span key={label}>{label}</span>)}
      </div>
      <div className="manager-home-calendar-grid">
        {cells.map((cell) => {
          const dayItems = itemsByDate.get(cell.key) || [];
          const tone = markerTone(dayItems);
          const isSelected = cell.key === selectedDate;
          return (
            <button
              aria-label={`${cell.day} ${monthLabel(parseIsoDate(cell.key))}${dayItems.length ? `, ${dayItems.length} échéance${dayItems.length > 1 ? 's' : ''}` : ''}`}
              aria-pressed={isSelected}
              className={`${cell.isCurrentMonth ? '' : 'is-outside'} ${isSelected ? 'is-selected' : ''}`.trim()}
              key={cell.key}
              onClick={() => onSelectDate(cell.key)}
              type="button"
            >
              <span>{cell.day}</span>
              {tone ? <i className={`is-${tone}`} /> : null}
            </button>
          );
        })}
      </div>

      <div className="manager-home-calendar-legend" aria-label="Légende">
        <span><i className="is-danger" />Urgent</span>
        <span><i className="is-warning" />Échéance</span>
        <span><i className="is-success" />Visite ou contrat</span>
      </div>

      <section className="manager-home-key-dates" aria-labelledby="manager-home-key-dates-title">
        <h3 id="manager-home-key-dates-title">Prochaines dates clés</h3>
        {keyDates.length ? keyDates.map((item) => (
          <button key={`${item.dueDate}-${item.id}`} onClick={() => {
            onChangeMonth(parseIsoDate(item.dueDate));
            onSelectDate(item.dueDate);
          }} type="button">
            <strong>{shortKeyDateLabel(item.dueDate)}</strong>
            <span>{item.title}</span>
            <ChevronRight aria-hidden="true" size={15} />
          </button>
        )) : <p>Aucune échéance future dans les 90 prochains jours.</p>}
      </section>
    </aside>
  );
}

function QueueRow({ item }: { item: ManagerHomeItem }) {
  return (
    <Link className={`manager-home-queue-row is-${item.queueTone}`} to={item.to}>
      <span className="manager-home-queue-copy">
        <strong>{item.title}</strong>
        <small>{item.context}</small>
        {item.vessels.length && ['workingTime', 'humanResources'].includes(item.group)
          ? <small className="manager-home-row-vessels"><Ship aria-hidden="true" size={12} />{item.vessels.map((vessel) => vessel.name).join(' · ')}</small>
          : null}
      </span>
      <span className="manager-home-queue-deadline">
        <strong>{item.deadline}</strong>
        <small>{item.action}</small>
      </span>
      <ChevronRight aria-hidden="true" size={17} />
    </Link>
  );
}

export function ManagerHomeDashboard({ client, firstName, personId, roles }: ManagerHomeDashboardProps) {
  const now = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => toLocalIsoDate(now), [now]);
  const roleKey = [...roles].sort().join(',');
  const [loaded, setLoaded] = useState<{
    client: SupabaseClient; personId: number | null; roleKey: string; result: ManagerHomeDashboardResult;
  } | null>(null);
  const isLoading = !loaded || loaded.client !== client || loaded.personId !== personId || loaded.roleKey !== roleKey;
  const { items, vessels, unavailableSources, scopeLabel } = isLoading ? EMPTY_RESULT : loaded.result;
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [displayedMonth, setDisplayedMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1, 12));
  const [selectedFilter, setSelectedFilter] = useState<ManagerHomeFilter>('all');
  const [selectedVessel, setSelectedVessel] = useState('all');

  useEffect(() => {
    let active = true;
    void fetchManagerHomeDashboard(client, now, { personId, roles: roleKey.split(',').filter(Boolean) as RoleKey[] }).then((result) => {
      if (!active) return;
      setLoaded({ client, personId, roleKey, result });
    });
    return () => { active = false; };
  }, [client, now, personId, roleKey]);

  const dateItems = useMemo(() => items.filter((item) => item.queueVisibleDates.includes(selectedDate)), [items, selectedDate]);
  const vesselCountItems = useMemo(() => dateItems.filter((item) => itemMatchesFilter(item, selectedFilter)), [dateItems, selectedFilter]);
  const vesselOptions = [
    { key: 'all', name: scopeLabel ? 'Flotte autorisée' : 'Toute la flotte' },
    ...vessels,
    { key: 'unassigned', name: 'Sans navire' },
  ].map((vessel) => ({
    ...vessel,
    count: vesselCountItems.filter((item) => itemMatchesVessel(item, vessel.key)).length,
  })).filter((vessel) => vessel.key === 'all' || vessel.count > 0);
  const activeVessel = vesselOptions.some((vessel) => vessel.key === selectedVessel) ? selectedVessel : 'all';
  const vesselItems = useMemo(() => items.filter((item) => itemMatchesVessel(item, activeVessel)), [items, activeVessel]);
  const categoryItems = useMemo(() => dateItems.filter((item) => itemMatchesVessel(item, activeVessel)), [dateItems, activeVessel]);
  const visibleItems = useMemo(() => categoryItems.filter((item) => itemMatchesFilter(item, selectedFilter)), [categoryItems, selectedFilter]);
  const calendarItems = useMemo(() => vesselItems.filter((item) => itemMatchesFilter(item, selectedFilter)), [vesselItems, selectedFilter]);
  function changeFilters(date: string, filter: ManagerHomeFilter) {
    setSelectedDate(date);
    setSelectedFilter(filter);
    if (!items.some((item) => item.queueVisibleDates.includes(date)
      && itemMatchesFilter(item, filter) && itemMatchesVessel(item, activeVessel))) {
      setSelectedVessel('all');
    } else {
      setSelectedVessel(activeVessel);
    }
  }
  const visibleGroups = useMemo(() => QUEUE_GROUPS.map((group) => ({
    ...group,
    items: visibleItems.filter((item) => item.group === group.key),
  })).filter((group) => group.items.length > 0), [visibleItems]);
  const urgentCount = useMemo(() => vesselItems.filter((item) => item.urgent).length, [vesselItems]);
  const weekCount = useMemo(() => vesselItems.filter((item) => item.thisWeek).length, [vesselItems]);

  return (
    <section className="manager-home-page" data-testid="manager-home-dashboard">
      <header className="manager-home-intro">
        <h1>{firstName ? `Bonjour ${firstName}` : 'Bonjour'}</h1>
        <p>Voici les échéances et décisions qui requièrent votre attention.</p>
      </header>

      <section className="manager-home-workspace" aria-labelledby="manager-home-title">
        <header className="manager-home-summary">
          <div className="manager-home-summary-title">
            <h2 id="manager-home-title">Priorités & échéances</h2>
            <p>Vue consolidée des décisions et échéances opérationnelles</p>
            {scopeLabel ? <small className="manager-home-scope">Périmètre : {scopeLabel}</small> : null}
          </div>
          <dl className="manager-home-metrics">
            <div><dt>éléments à traiter</dt><dd>{vesselItems.length}</dd></div>
            <div><dt>urgents</dt><dd className="is-danger">{urgentCount}</dd></div>
            <div><dt>cette semaine</dt><dd className="is-warning">{weekCount}</dd></div>
          </dl>
          <Link className="manager-home-kpi-link" to="/modules/kpi">
            <BarChart3 aria-hidden="true" size={17} />
            Consulter les indicateurs
          </Link>
        </header>

        <div className="manager-home-vessel-bar" aria-busy={isLoading}>
          <strong><Ship aria-hidden="true" size={16} />Navires</strong>
          <div className="manager-home-filters manager-home-vessel-filters" role="group" aria-label="Filtrer par navire">
            {vesselOptions.map((vessel) => (
              <button
                aria-pressed={activeVessel === vessel.key}
                className={activeVessel === vessel.key ? 'is-selected' : ''}
                disabled={isLoading}
                key={vessel.key}
                onClick={() => setSelectedVessel(vessel.key)}
                type="button"
              >
                {vessel.name}{' '}<span className="manager-home-count">{vessel.count}</span>
              </button>
            ))}
          </div>
          <small>Pastilles : éléments à traiter à la date et selon les filtres choisis.</small>
        </div>

        <div className="manager-home-main">
          <CalendarPanel
            displayedMonth={displayedMonth}
            items={calendarItems}
            onChangeMonth={(month) => setDisplayedMonth(new Date(month.getFullYear(), month.getMonth(), 1, 12))}
            onSelectDate={(date) => changeFilters(date, selectedFilter)}
            selectedDate={selectedDate}
            todayKey={todayKey}
          />

          <section className="manager-home-queue" aria-labelledby="manager-home-queue-title">
            <header className="manager-home-queue-header">
              <div className="manager-home-queue-title-row">
                <div>
                  <span>File consolidée</span>
                  <h2 id="manager-home-queue-title">{queueDateLabel(selectedDate)} — {visibleItems.length} élément{visibleItems.length > 1 ? 's' : ''}</h2>
                </div>
                <small>{visibleItems.length} affiché{visibleItems.length > 1 ? 's' : ''} sur {vesselItems.length}</small>
              </div>
              <div className="manager-home-filters" role="group" aria-label="Filtres de la file">
                {FILTERS.map((filter) => {
                  const count = filterCount(categoryItems, filter.key);
                  return (
                    <button
                      aria-pressed={selectedFilter === filter.key}
                      className={`${selectedFilter === filter.key ? 'is-selected' : ''} ${filter.key === 'urgent' ? 'is-danger' : filter.key === 'week' ? 'is-warning' : ''}`.trim()}
                      key={filter.key}
                      onClick={() => changeFilters(selectedDate, filter.key)}
                      type="button"
                    >
                      {filter.label}{' '}<span className="manager-home-count">{count}</span>
                    </button>
                  );
                })}
              </div>
            </header>

            {unavailableSources.length ? (
              <p className="manager-home-partial-warning" role="status">
                <AlertTriangle aria-hidden="true" size={15} />
                Données partielles : {unavailableSources.join(', ')} indisponible{unavailableSources.length > 1 ? 's' : ''}.
              </p>
            ) : null}

            <div className="manager-home-queue-list" aria-busy={isLoading}>
              {isLoading ? (
                <div className="manager-home-queue-state" role="status"><CalendarDays aria-hidden="true" size={20} />Chargement des échéances…</div>
              ) : visibleGroups.length ? visibleGroups.map((group) => {
                const Icon = group.icon;
                return (
                  <section className="manager-home-group" key={group.key} aria-labelledby={`manager-home-group-${group.key}`}>
                    <header>
                      <h3 id={`manager-home-group-${group.key}`}><Icon aria-hidden="true" size={15} />{group.label}</h3>
                      <span className="manager-home-count" aria-label={`${group.items.length} élément${group.items.length > 1 ? 's' : ''}`}>{group.items.length}</span>
                    </header>
                    {group.items.map((item) => <QueueRow item={item} key={item.id} />)}
                  </section>
                );
              }) : (
                <div className="manager-home-queue-state">
                  <FileCheck2 aria-hidden="true" size={21} />
                  Aucun élément ne correspond à cette date et à ce filtre.
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    </section>
  );
}
