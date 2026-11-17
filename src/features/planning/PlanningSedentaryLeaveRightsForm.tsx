import { useState, type FormEvent } from 'react';
import {
  DEFAULT_SEDENTARY_WORKING_WEEKDAYS,
  getPlanningLeaveRightsRange,
  type PlanningSedentaryLeavePeriod,
  type PlanningSedentaryLeavePeriodDraft,
} from './planningAbsenceBalance';
import { formatPlanningDate, isPlanningDate, todayPlanningDate } from './planningDates';

const NORMAL_FIELDS = [
  ['normalDays', 'Jours au taux plein'],
  ['normalWeeks', 'Semaines au taux plein'],
  ['normalMonths', 'Mois au taux plein'],
] as const;
const ILLNESS_FIELDS = [
  ['illnessDays', 'Jours à taux réduit'],
  ['illnessWeeks', 'Semaines à taux réduit'],
  ['illnessMonths', 'Mois à taux réduit'],
] as const;
const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
type AmountField = typeof NORMAL_FIELDS[number][0] | typeof ILLNESS_FIELDS[number][0] | 'openingBalance' | 'openingAccrued';
type FormValues = Record<AmountField, string> & {
  debitFrom: string;
  daysPerWeek: string;
  workingWeekdays: number[];
  workedHolidays: string;
};

function amountText(value: number | undefined | null, fallback = '') {
  return value == null ? fallback : String(value).replace('.', ',');
}

function parseAmount(value: string, label: string, signed = false) {
  const text = value.trim();
  if (!/^-?\d+(?:[.,]\d+)?$/.test(text) || (!signed && text.startsWith('-'))) {
    throw new Error(`Vérifiez la valeur du champ « ${label} ».`);
  }
  return Number(text.replace(',', '.'));
}

function payrollValues(startsOn: string, period?: PlanningSedentaryLeavePeriod): FormValues {
  return {
    debitFrom: period?.debitFrom ?? startsOn,
    openingBalance: amountText(period?.openingBalance),
    openingAccrued: amountText(period?.openingAccrued),
    daysPerWeek: String(period?.daysPerWeek ?? 5),
    workingWeekdays: [...(period?.workingWeekdays ?? DEFAULT_SEDENTARY_WORKING_WEEKDAYS)],
    normalDays: amountText(period?.normalDays, '0'),
    normalWeeks: amountText(period?.normalWeeks, '0'),
    normalMonths: amountText(period?.normalMonths, '0'),
    illnessDays: amountText(period?.illnessDays, '0'),
    illnessWeeks: amountText(period?.illnessWeeks, '0'),
    illnessMonths: amountText(period?.illnessMonths, '0'),
    workedHolidays: period?.workedHolidays?.join('\n') ?? '',
  };
}

function buildDraft(personId: number, startsOn: string, values: FormValues): PlanningSedentaryLeavePeriodDraft {
  if (!values.workingWeekdays.length) throw new Error('Sélectionnez au moins un jour habituellement travaillé.');
  return {
    personId,
    startsOn,
    debitFrom: values.debitFrom,
    openingBalance: parseAmount(values.openingBalance, 'Solde d’ouverture', true),
    openingAccrued: parseAmount(values.openingAccrued, 'Acquis à l’ouverture'),
    daysPerWeek: Number(values.daysPerWeek),
    workingWeekdays: values.workingWeekdays,
    normalDays: parseAmount(values.normalDays, 'Jours au taux plein'),
    normalWeeks: parseAmount(values.normalWeeks, 'Semaines au taux plein'),
    normalMonths: parseAmount(values.normalMonths, 'Mois au taux plein'),
    illnessDays: parseAmount(values.illnessDays, 'Jours à taux réduit'),
    illnessWeeks: parseAmount(values.illnessWeeks, 'Semaines à taux réduit'),
    illnessMonths: parseAmount(values.illnessMonths, 'Mois à taux réduit'),
    workedHolidays: values.workedHolidays.trim().split(/[\s,]+/).filter(Boolean),
  };
}

export function PlanningSedentaryLeaveRightsForm({ periods, personId, anchor, saving, disabled, onChanged, onSave }: {
  periods: PlanningSedentaryLeavePeriod[];
  personId: number;
  anchor: string;
  saving: boolean;
  disabled: boolean;
  onChanged: () => void;
  onSave: (draft: () => PlanningSedentaryLeavePeriodDraft) => void;
}) {
  const validAnchor = isPlanningDate(anchor) && anchor >= '1900-06-01' && anchor <= '2100-05-31' ? anchor : todayPlanningDate();
  const currentStart = getPlanningLeaveRightsRange(validAnchor).start;
  const [selection, setSelection] = useState(currentStart);
  const [year, setYear] = useState(currentStart.slice(0, 4));
  const [edited, setEdited] = useState<{ startsOn: string; values: FormValues } | null>(null);
  const startsOn = selection === 'new' ? `${year}-06-01` : selection;
  const endsOn = `${Number(startsOn.slice(0, 4)) + 1}-05-31`;
  const starts = [...new Set([currentStart, ...periods.map((period) => period.startsOn)])].sort().reverse();
  const period = periods.find((item) => item.startsOn === startsOn);
  const values = edited?.startsOn === startsOn ? edited.values : payrollValues(startsOn, period);

  function changeValue<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setEdited({ startsOn, values: { ...values, [key]: value } });
    onChanged();
  }

  function resetPeriod() {
    setEdited(null);
    onChanged();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    onSave(() => buildDraft(personId, startsOn, values));
  }

  return <form className="planning-leave-rights__form" onSubmit={submit}>
    <fieldset disabled={disabled}>
      <label className="is-wide">Période de droits<select value={selection} onChange={(event) => { setSelection(event.target.value); resetPeriod(); }}>
        {starts.map((start) => <option key={start} value={start}>Du {formatPlanningDate(start)} au {formatPlanningDate(getPlanningLeaveRightsRange(start).end)}</option>)}
        <option value="new">Nouvelle période annuelle</option>
      </select></label>
      {selection === 'new' ? <label className="is-wide">Année de début<input type="number" min="1900" max="2099" required value={year} onChange={(event) => { setYear(event.target.value); resetPeriod(); }} /></label> : null}
      <label>Début de période<input type="date" readOnly value={startsOn} /></label>
      <label>Fin de période<input type="date" readOnly value={endsOn} /></label>
      <p className="is-wide">Reprenez le solde de paie validé, en jours ouvrables, juste avant la première journée à décompter dans SeaPilot. Indiquez les droits déjà acquis sur cette période à la même date.</p>
      <label className="is-wide">Première journée à décompter<input type="date" required min={startsOn} max={endsOn} value={values.debitFrom} onChange={(event) => changeValue('debitFrom', event.target.value)} /></label>
      <label>Solde d’ouverture<input inputMode="decimal" required value={values.openingBalance} onChange={(event) => changeValue('openingBalance', event.target.value)} /></label>
      <label>Acquis à l’ouverture<input inputMode="decimal" required value={values.openingAccrued} onChange={(event) => changeValue('openingAccrued', event.target.value)} /></label>
      <div className="planning-leave-rights__schedule is-wide" role="group" aria-label="Jours habituellement travaillés">
        <p>Jours habituellement travaillés</p>
        <div className="planning-leave-rights__weekdays">{WEEKDAYS.map((label, index) => {
          const day = index + 1;
          return <label key={day}><input type="checkbox" aria-label={label} checked={values.workingWeekdays.includes(day)} onChange={(event) => changeValue('workingWeekdays', event.target.checked
            ? [...values.workingWeekdays, day].sort((first, second) => first - second)
            : values.workingWeekdays.filter((value) => value !== day))} />{label.slice(0, 3)}.</label>;
        })}</div>
      </div>
      <label className="is-wide">Base hebdomadaire d’équivalence<select value={values.daysPerWeek} onChange={(event) => changeValue('daysPerWeek', event.target.value)}>
        <option value="5">5 jours</option><option value="5.5">5,5 jours</option><option value="6">6 jours</option>
      </select></label>
      <p className="is-wide">Saisissez les cumuls de paie depuis le 1er juin pour les trois méthodes de calcul. Incluez les périodes assimilées et le premier mois cumulé d’arrêt maladie dans le taux plein. Indiquez le reliquat de maladie non professionnelle au taux réduit.</p>
      <div className="planning-leave-rights__amounts is-wide">{[...NORMAL_FIELDS, ...ILLNESS_FIELDS].map(([key, label]) => <label key={key}>{label}<input inputMode="decimal" required value={values[key]} onChange={(event) => changeValue(key, event.target.value)} /></label>)}</div>
      <label className="is-wide">Jours fériés habituellement travaillés<textarea rows={2} value={values.workedHolidays} onChange={(event) => changeValue('workedHolidays', event.target.value)} placeholder="Une date par ligne, au format AAAA-MM-JJ" /></label>
      <div className="planning-leave-rights__actions is-wide"><button className="sp-button sp-button--primary" type="submit">{saving ? 'Enregistrement…' : 'Enregistrer les droits Congés'}</button></div>
    </fieldset>
  </form>;
}
