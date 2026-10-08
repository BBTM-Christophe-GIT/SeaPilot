import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { PLANNING_PERSONNEL_FUNCTIONS } from '../planning/planningModel';
import { fetchPlanningFleetOrder, normalizePlanningFleetFunctionOrder, savePlanningFleetOrder } from '../planning/planningFleetOrder';
import './adminFleetOrder.css';

export function AdminFleetOrder({ client }: { client: SupabaseClient }) {
  const [functions, setFunctions] = useState<string[]>([...PLANNING_PERSONNEL_FUNCTIONS]);
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newFunction, setNewFunction] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void fetchPlanningFleetOrder(client).then((order) => {
      if (!active) return;
      setFunctions(order.length ? order : [...PLANNING_PERSONNEL_FUNCTIONS]);
      setEnabled(order.length > 0);
      setLoaded(true);
    }).catch(() => {
      if (active) setError('Impossible de charger l’ordre des fonctions. Rouvrez cette section pour réessayer.');
    });
    return () => { active = false; };
  }, [client]);

  function changed() { setMessage(''); setError(''); }

  function move(index: number, direction: number) {
    setFunctions((current) => {
      const result = [...current];
      [result[index], result[index + direction]] = [result[index + direction], result[index]];
      return result;
    });
    changed();
  }

  function addFunction() {
    const value = newFunction.trim();
    if (!value) return;
    if (normalizePlanningFleetFunctionOrder([...functions, value]).length <= functions.length) {
      setError('Cette fonction est déjà présente dans la liste.');
      return;
    }
    setFunctions((current) => [...current, value]);
    setNewFunction('');
    changed();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (enabled && !functions.length) { setError('Ajoutez au moins une fonction pour activer ce tri.'); return; }
    setSaving(true);
    changed();
    try {
      const saved = await savePlanningFleetOrder(client, enabled ? functions : []);
      setEnabled(saved.length > 0);
      setFunctions(saved.length ? saved : [...PLANNING_PERSONNEL_FUNCTIONS]);
      setMessage(saved.length ? 'Ordre des fonctions enregistré pour la vue Flotte.' : 'Tri habituel rétabli dans la vue Flotte.');
    } catch {
      setError('Impossible d’enregistrer l’ordre des fonctions. Réessayez.');
    } finally { setSaving(false); }
  }

  return <form className="admin-panel admin-fleet-order" onSubmit={save} aria-labelledby="fleet-order-title">
    <header>
      <h2 id="fleet-order-title">Ordre des marins dans les bordées</h2>
      <p>Ce réglage s’applique à la vue Flotte du Planning pour tous les utilisateurs de votre société. La fonction temporaire en vigueur à la date sélectionnée est prioritaire sur la fonction habituelle.</p>
    </header>
    {!loaded && !error ? <p role="status">Chargement de l’ordre des fonctions…</p> : null}
    <fieldset disabled={!loaded || saving}>
      <label className="admin-fleet-order-toggle">
        <input type="checkbox" checked={enabled} onChange={(event) => { setEnabled(event.target.checked); changed(); }} />
        Trier par fonction dans la vue Flotte
      </label>
      {enabled ? <>
        <p id="fleet-order-help">Déplacez les fonctions de haut en bas dans l’ordre souhaité. Les fonctions absentes de la liste apparaissent ensuite. Les vues Équipages et Calendrier conservent leur tri.</p>
        <ol className="admin-fleet-order-list" aria-label="Ordre des fonctions" aria-describedby="fleet-order-help">
          {functions.map((label, index) => <li key={label}>
            <span className="admin-fleet-order-position" aria-hidden="true">{index + 1}</span>
            <strong>{label}</strong>
            <div className="admin-fleet-order-actions">
              <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Monter ${label}`}><ArrowUp size={16} aria-hidden="true" /></button>
              <button type="button" disabled={index === functions.length - 1} onClick={() => move(index, 1)} aria-label={`Descendre ${label}`}><ArrowDown size={16} aria-hidden="true" /></button>
              <button type="button" onClick={() => { setFunctions((current) => current.filter((entry) => entry !== label)); changed(); }} aria-label={`Retirer ${label}`}><Trash2 size={16} aria-hidden="true" /></button>
            </div>
          </li>)}
        </ol>
        <div className="admin-fleet-order-add">
          <label htmlFor="fleet-order-function">Ajouter une fonction, habituelle ou temporaire</label>
          <div>
            <input id="fleet-order-function" value={newFunction} maxLength={120} onChange={(event) => setNewFunction(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addFunction(); } }} />
            <button type="button" disabled={!newFunction.trim() || functions.length >= 100} onClick={addFunction}><Plus size={16} aria-hidden="true" />Ajouter</button>
          </div>
        </div>
      </> : <p>Le tri habituel des bordées est conservé.</p>}
      <button className="admin-primary-button" type="submit">{saving ? 'Enregistrement…' : 'Enregistrer l’ordre de la Flotte'}</button>
    </fieldset>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {message ? <p className="admin-success" role="status">{message}</p> : null}
  </form>;
}
