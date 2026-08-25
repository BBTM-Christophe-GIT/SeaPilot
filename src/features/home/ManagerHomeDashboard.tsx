import {
  AlertTriangle,
  BarChart3,
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
import {
  fetchManagerHomeDashboard,
  toLocalIsoDate,
  type ManagerHomeFilter,
  type ManagerHomeGroupKey,
  type ManagerHomeItem,
  type ManagerHomeTone,
} from './managerHomeData';

interface ManagerHomeDashboardProps {
  client: SupabaseClient;
  firstName: string;
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
  { key: 'fleetDocuments', label: 'Flotte & documents', icon: Ship },
  { key: 'humanResources', label: 'Ressources humaines', icon: Users },
];

const FILTERS: Array<{ key: ManagerHomeFilter; label: string }> = [
  { key: 'all', label: 'Tous' },
  { key: 'urgent', label: 'Urgents' },
  { key: 'week', label: 'Cette semaine' },
  { key: 'purchases', label: 'Achats' },
  { key: 'documents', label: 'Documents' },
  { key: 'fleet', label: 'Flotte' },
  { key: 'workingTime', label: 'Temps de travail' },
  { key: 'humanResources', label: 'Ressources humaines' },
];

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const TONE_PRIORITY: ManagerHomeTone[] = ['danger', 'warning', 'success'];

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
    <Link className={`manager-home-queue-row is-${item.tone}`} to={item.to}>
      <span className="manager-home-queue-copy">
        <strong>{item.title}</strong>
        <small>{item.context}</small>
      </span>
      <span className="manager-home-queue-deadline">
        <strong>{item.deadline}</strong>
        <small>{item.action}</small>
      </span>
      <ChevronRight aria-hidden="true" size={17} />
    </Link>
  );
}

export function ManagerHomeDashboard({ client, firstName }: ManagerHomeDashboardProps) {
  const now = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => toLocalIsoDate(now), [now]);
  const [items, setItems] = useState<ManagerHomeItem[]>([]);
  const [unavailableSources, setUnavailableSources] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [displayedMonth, setDisplayedMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1, 12));
  const [selectedFilter, setSelectedFilter] = useState<ManagerHomeFilter>('all');

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    void fetchManagerHomeDashboard(client, now).then((result) => {
      if (!active) return;
      setItems(result.items);
      setUnavailableSources(result.unavailableSources);
      setIsLoading(false);
    });
    return () => { active = false; };
  }, [client, now]);

  const visibleItems = useMemo(() => items.filter((item) =>
    item.visibleDates.includes(selectedDate) && itemMatchesFilter(item, selectedFilter),
  ), [items, selectedDate, selectedFilter]);
  const visibleGroups = useMemo(() => QUEUE_GROUPS.map((group) => ({
    ...group,
    items: visibleItems.filter((item) => item.group === group.key),
  })).filter((group) => group.items.length > 0), [visibleItems]);
  const urgentCount = useMemo(() => items.filter((item) => item.urgent).length, [items]);
  const weekCount = useMemo(() => items.filter((item) => item.thisWeek).length, [items]);

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
          </div>
          <dl className="manager-home-metrics">
            <div><dt>éléments à traiter</dt><dd>{items.length}</dd></div>
            <div><dt>urgents</dt><dd className="is-danger">{urgentCount}</dd></div>
            <div><dt>cette semaine</dt><dd className="is-warning">{weekCount}</dd></div>
          </dl>
          <Link className="manager-home-kpi-link" to="/modules/kpi">
            <BarChart3 aria-hidden="true" size={17} />
            Consulter les indicateurs
          </Link>
        </header>

        <div className="manager-home-main">
          <CalendarPanel
            displayedMonth={displayedMonth}
            items={items}
            onChangeMonth={(month) => setDisplayedMonth(new Date(month.getFullYear(), month.getMonth(), 1, 12))}
            onSelectDate={setSelectedDate}
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
                <small>{visibleItems.length} affiché{visibleItems.length > 1 ? 's' : ''} sur {items.length}</small>
              </div>
              <div className="manager-home-filters" role="group" aria-label="Filtres de la file">
                {FILTERS.map((filter) => {
                  const count = filterCount(items, filter.key);
                  return (
                    <button
                      aria-pressed={selectedFilter === filter.key}
                      className={`${selectedFilter === filter.key ? 'is-selected' : ''} ${filter.key === 'urgent' ? 'is-danger' : filter.key === 'week' ? 'is-warning' : ''}`.trim()}
                      key={filter.key}
                      onClick={() => setSelectedFilter(filter.key)}
                      type="button"
                    >
                      {filter.label}{['all', 'urgent', 'week'].includes(filter.key) ? ` ${count}` : ''}
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
                      <span>{group.items.length} élément{group.items.length > 1 ? 's' : ''}</span>
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
