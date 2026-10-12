import type { SupabaseClient } from '@supabase/supabase-js';
import { Clock3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  fetchWorkingTimeEditSettings,
  saveWorkingTimeEditSettings,
  type WorkingTimeEditSettings,
} from '../workingTime/workingTimeSettings';

export function AdminWorkingTimeSettings({ client }: { client: SupabaseClient }) {
  const [settings, setSettings] = useState<WorkingTimeEditSettings>({ unrestrictedEditingEnabled: false, canUseUnrestrictedEditing: false });
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setIsReady(false);
    setSettings({ unrestrictedEditingEnabled: false, canUseUnrestrictedEditing: false });
    setErrorMessage(null);
    setStatusMessage(null);
    fetchWorkingTimeEditSettings(client)
      .then((loadedSettings) => {
        if (!isMounted) return;
        setSettings(loadedSettings);
        setIsReady(true);
      })
      .catch(() => {
        if (isMounted) setErrorMessage('Le réglage du suivi du temps de travail est indisponible.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => { isMounted = false; };
  }, [client, reloadKey]);

  async function handleChange(unrestrictedEditingEnabled: boolean) {
    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const saved = await saveWorkingTimeEditSettings(client, { unrestrictedEditingEnabled });
      setSettings(saved);
      setStatusMessage(saved.unrestrictedEditingEnabled
        ? 'La modification libre est activée uniquement pour Christophe MINASSIAN.'
        : 'Les règles habituelles de modification sont rétablies.');
    } catch {
      setErrorMessage('Impossible d’enregistrer le réglage du suivi du temps de travail.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="admin-panel admin-working-time-settings" aria-label="Réglages du suivi du temps de travail">
      <div className="admin-header admin-section-header">
        <div>
          <p className="module-family">Temps de travail</p>
          <h2>Modification des tableaux</h2>
          <p className="admin-section-description" id="working-time-free-edit-description">
            Autorise uniquement Christophe MINASSIAN à modifier toutes les journées, y compris les journées validées
            et les registres clôturés, sans limite de saisie ni justification obligatoire.
          </p>
        </div>
        <div className="admin-summary" aria-hidden="true"><Clock3 size={18} /></div>
      </div>
      <label className="admin-setting-card">
        <span>
          <strong>Modification libre du suivi du temps de travail</strong>
          <small>Commentaires et motifs de correction facultatifs. Les modifications restent dans l’historique.</small>
        </span>
        <input
          aria-label="Modification libre du suivi du temps de travail"
          aria-describedby="working-time-free-edit-description working-time-free-edit-validation"
          checked={settings.unrestrictedEditingEnabled}
          disabled={isLoading || !isReady || isSaving}
          onChange={(event) => void handleChange(event.target.checked)}
          role="switch"
          type="checkbox"
        />
        <i aria-hidden="true" />
      </label>
      <p className="admin-section-description" id="working-time-free-edit-validation">
        Une correction d’heures retire la validation actuelle de la journée. Les anciennes validations
        et signatures restent conservées dans l’historique.
      </p>
      <div aria-live="polite">
        {isLoading ? <p className="admin-state" role="status">Chargement du réglage du temps de travail…</p> : null}
        {isSaving ? <p className="admin-state" role="status">Enregistrement du réglage…</p> : null}
        {statusMessage ? <p className="admin-success" role="status">{statusMessage}</p> : null}
        {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}
      </div>
      {!isLoading && !isReady ? (
        <button className="sp-button sp-button--secondary" onClick={() => setReloadKey((key) => key + 1)} type="button">
          Réessayer le chargement
        </button>
      ) : null}
    </section>
  );
}
