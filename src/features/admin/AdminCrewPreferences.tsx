import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState, type FormEvent } from 'react';
import {
  CREW_FUNCTION_ORDER, CREW_SORT_OPTIONS, DEFAULT_CREW_PREFERENCES,
  fetchCrewDisplayPreferences, formatCrewName, saveCrewDisplayPreferences,
  type CrewDisplayPreferences, type CrewNameFormat, type CrewSortOrder,
} from '../planning/planningCrewPreferences';

export function AdminCrewPreferences({ client }: { client: SupabaseClient }) {
  const [preferences, setPreferences] = useState<CrewDisplayPreferences>(DEFAULT_CREW_PREFERENCES);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void fetchCrewDisplayPreferences(client).then((value) => {
      if (active) { setPreferences(value); setLoaded(true); }
    }).catch(() => { if (active) setError('Impossible de charger vos préférences. Rouvrez cette section pour réessayer.'); });
    return () => { active = false; };
  }, [client]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(''); setMessage('');
    try {
      setPreferences(await saveCrewDisplayPreferences(client, preferences));
      setMessage('Vos préférences Équipages sont enregistrées.');
    } catch {
      setError('Impossible d’enregistrer vos préférences. Réessayez.');
    } finally { setSaving(false); }
  }

  return <form className="admin-panel admin-crew-preferences" onSubmit={save} aria-labelledby="crew-preferences-title">
    <header>
      <h2 id="crew-preferences-title">Mes préférences Équipages</h2>
      <p>Ces réglages s’appliquent à votre compte dans Planning → Équipages, sur tous vos appareils. Seuls les administrateurs peuvent les enregistrer.</p>
    </header>
    {!loaded && !error ? <p role="status">Chargement de vos préférences…</p> : null}
    <fieldset disabled={!loaded || saving}>
      <label htmlFor="crew-name-format">Affichage des marins</label>
      <select id="crew-name-format" value={preferences.nameFormat} onChange={(event) => {
        setPreferences((current) => ({ ...current, nameFormat: event.target.value as CrewNameFormat })); setMessage('');
      }}>
        <option value="first_last">Prénom NOM</option>
        <option value="last_first">NOM Prénom</option>
      </select>
      <p className="admin-crew-example">Aperçu : <strong>{formatCrewName({ firstName: 'Jean', lastName: 'Dupont' }, preferences.nameFormat)}</strong></p>
      <label htmlFor="crew-sort-order">Tri préféré</label>
      <select id="crew-sort-order" value={preferences.sortOrder} onChange={(event) => {
        setPreferences((current) => ({ ...current, sortOrder: event.target.value as CrewSortOrder })); setMessage('');
      }}>
        {CREW_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <p>Ordre des fonctions : {CREW_FUNCTION_ORDER.join(' → ')}. À fonction identique, les marins sont triés par NOM puis prénom. Les autres fonctions viennent ensuite.</p>
      <button className="admin-primary-button" type="submit">{saving ? 'Enregistrement…' : 'Enregistrer mes préférences'}</button>
    </fieldset>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {message ? <p className="admin-success" role="status">{message}</p> : null}
  </form>;
}
