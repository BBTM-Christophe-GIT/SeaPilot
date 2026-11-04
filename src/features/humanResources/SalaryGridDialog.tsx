import { useEffect, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Plus, Trash2 } from 'lucide-react';
import { AppDialog } from '../../components/AppDialog';
import { loadHrSalaryGrid, saveHrSalaryGrid, type HrSalaryGrid } from './salaryGridQueries';
import { newSalaryGridDraftRow, parseSalaryGridAmount, SALARY_GRID_COLUMNS, salaryGridDraftRows,
  salaryGridMonthlyAmount, salaryGridRowsFromDraft, type SalaryGridDraftRow } from './salaryGridModel';
import './salaryGrid.css';

export function SalaryGridDialog({ client, onClose, onSaved }: {
  client: SupabaseClient; onClose: () => void; onSaved: (grid: HrSalaryGrid) => void;
}) {
  const [grid, setGrid] = useState<HrSalaryGrid | null>(null);
  const [rows, setRows] = useState<SalaryGridDraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setErrors([]);
    loadHrSalaryGrid(client).then(value => {
      if (active) { setGrid(value); setRows(salaryGridDraftRows(value.rows)); }
    }).catch(cause => { if (active) setErrors([cause instanceof Error ? cause.message : 'Impossible de charger la grille de salaires.']); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, attempt]);

  function update(id: string, key: keyof SalaryGridDraftRow, value: string | boolean) {
    setRows(current => current.map(row => row.id === id ? { ...row, [key]: value } : row));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); event.stopPropagation();
    if (!grid || loading || saving) return;
    const parsed = salaryGridRowsFromDraft(rows);
    if (parsed.errors.length) { setErrors(parsed.errors); return; }
    setSaving(true); setErrors([]);
    try {
      const saved = await saveHrSalaryGrid(client, parsed.rows, grid.revision);
      onSaved(saved); onClose();
    } catch (cause) { setErrors([cause instanceof Error ? cause.message : 'Impossible d’enregistrer la grille de salaires.']); }
    finally { setSaving(false); }
  }

  return <AppDialog title="Grille de salaires" eyebrow="Ressources humaines" size="xl" onClose={onClose}
    isBusy={saving} onSubmit={save}
    description="L’annuel brut de la grille sert de référence. L’ancienneté s’applique individuellement ; le mensuel est arrondi à l’euro supérieur. Les contrats déjà générés conservent leurs montants."
    footer={<div className="hr-salary-grid-actions">
      <button className="sp-button sp-button--secondary" type="button" disabled={saving} onClick={onClose}>Annuler</button>
      <button className="sp-button sp-button--primary" type="submit" disabled={loading || saving || !grid}>{saving ? 'Enregistrement…' : 'Enregistrer la grille'}</button>
    </div>}>
    {loading ? <p role="status">Chargement de la grille de salaires…</p> : grid ? <>
      <div className="hr-salary-grid-toolbar"><p>Montants annuels en euros. Le total annuel de base est saisi indépendamment des autres colonnes.</p>
        <button className="sp-button sp-button--secondary" type="button" disabled={saving || rows.length >= 100}
          onClick={() => setRows(current => [...current, newSalaryGridDraftRow()])}><Plus size={16} aria-hidden="true" /> Ajouter un poste</button></div>
      <div className="hr-salary-grid-scroll" tabIndex={0} role="region" aria-label="Grille de salaires modifiable">
        <table className="hr-salary-grid-table"><thead><tr>
          {SALARY_GRID_COLUMNS.map(column => <th key={column.key} scope="col">{column.label}</th>)}
          <th scope="col">Mensuel brut hors ancienneté</th><th scope="col">Actif</th><th scope="col">Actions</th>
        </tr></thead><tbody>{rows.map((row, index) => {
          const rowLabel = row.positionLabel || `Ligne ${index + 1}`;
          const monthly = salaryGridMonthlyAmount({ annualGross: parseSalaryGridAmount(row.annualGross) });
          return <tr key={row.id}>{SALARY_GRID_COLUMNS.map(column => <td key={column.key}>
            {column.key === 'positionLabel' ? <textarea aria-label={`${column.label} · ligne ${index + 1}`} rows={3} maxLength={500}
              value={row.positionLabel} disabled={saving} onChange={event => update(row.id, column.key, event.target.value)} />
              : <input aria-label={`${column.label} · ligne ${index + 1}`} inputMode={column.numeric ? 'decimal' : undefined}
                maxLength={column.numeric ? 24 : 120}
                value={row[column.key]} disabled={saving} onChange={event => update(row.id, column.key, event.target.value)} />}
          </td>)}<td><output aria-label={`Mensuel brut hors ancienneté · ligne ${index + 1}`}>{monthly ? `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(monthly))} €` : '—'}</output></td>
            <td><input type="checkbox" aria-label={`Poste actif · ligne ${index + 1}`} checked={row.active} disabled={saving} onChange={event => update(row.id, 'active', event.target.checked)} /></td>
            <td><button className="sp-button sp-button--secondary" type="button" disabled={saving} aria-label={`Retirer ${rowLabel}`}
              onClick={() => setRows(current => current.filter(item => item.id !== row.id))}><Trash2 size={16} aria-hidden="true" /></button></td>
          </tr>;
        })}</tbody></table>
      </div>
    </> : <button className="sp-button sp-button--secondary" type="button" onClick={() => setAttempt(value => value + 1)}>Réessayer</button>}
    {errors.length ? <div><div className="form-error" role="alert"><ul>{errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul></div>
      {grid ? <button className="sp-button sp-button--secondary" type="button" disabled={saving} onClick={() => setAttempt(value => value + 1)}>Recharger la grille</button> : null}
    </div> : null}
  </AppDialog>;
}
