import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { savePlanningDisplaySettings, usePlanningDisplaySettings } from '../planning/planningDisplaySettings';

export function AdminPlanningSettings({ client }: { client: SupabaseClient }) {
  const { settings, setSettings, isLoading, error } = usePlanningDisplaySettings(client);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [message, setMessage] = useState('');

  async function changeActiveFilter(activeFilterEnabled: boolean) {
    setIsSaving(true);
    setSaveError('');
    setMessage('');
    try {
      setSettings(await savePlanningDisplaySettings(client, { activeFilterEnabled }));
      setMessage(activeFilterEnabled ? 'Filtre actif activé.' : 'Filtre actif désactivé.');
    } catch {
      setSaveError('Impossible d’enregistrer le filtre actif. Le réglage précédent est conservé.');
    } finally {
      setIsSaving(false);
    }
  }

  return <section className="admin-panel admin-action-plan-settings" aria-label="Réglages du Planning">
    <div className="admin-header admin-section-header">
      <div>
        <p className="module-family">Planning</p>
        <h2>Réglages d’affichage</h2>
        <p className="admin-section-description">Ce réglage s’applique au planning de votre société.</p>
      </div>
      <div className="admin-summary" aria-hidden="true"><CalendarDays size={18} /></div>
    </div>
    <label className="admin-setting-card">
      <span>
        <strong>Activer ou désactiver le filtre actif</strong>
        <small>Activé : masque les collaborateurs sans affectation entre aujourd’hui et la fin de la période affichée. Désactivé : conserve l’affichage habituel. Les périodes entièrement passées restent consultables.</small>
      </span>
      <input
        checked={settings.activeFilterEnabled}
        disabled={isLoading || isSaving || Boolean(error)}
        onChange={(event) => void changeActiveFilter(event.target.checked)}
        type="checkbox"
      />
      <i aria-hidden="true" />
    </label>
    {error || saveError ? <p role="alert">{error || saveError}</p> : null}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
