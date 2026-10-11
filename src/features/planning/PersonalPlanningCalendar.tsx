import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarDays, Copy, Link2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AppDialog } from '../../components/AppDialog';
import {
  createPlanningCalendarSubscription,
  fetchPlanningCalendarSubscription,
  revokePlanningCalendarSubscription,
  type PlanningCalendarSubscription,
} from './personalCalendarQueries';
import './personalCalendar.css';

interface Props {
  client: SupabaseClient;
  isOpen: boolean;
  onClose: () => void;
  previewMode: boolean;
}

export function PersonalPlanningCalendar({ client, isOpen, onClose, previewMode }: Props) {
  const [subscription, setSubscription] = useState<PlanningCalendarSubscription | null>(null);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmation, setConfirmation] = useState<'replace' | 'revoke' | null>(null);
  const alive = useRef(true);
  const issuedAt = useRef<string | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    if (!isOpen || previewMode) return;
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      setLoading(true);
      setSubscription(null);
      setError('');
      setMessage('');
      setConfirmation(null);
      fetchPlanningCalendarSubscription(client)
        .then((state) => {
          if (!mounted) return;
          setSubscription(state);
          if (!state.active || (issuedAt.current && issuedAt.current !== state.created_at)) setUrl('');
        })
        .catch((cause: Error) => { if (mounted) setError(cause.message); })
        .finally(() => { if (mounted) setLoading(false); });
    });
    return () => { mounted = false; };
  }, [client, isOpen, previewMode]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try { await action(); }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'Une erreur est survenue. Réessayez.'); }
    finally { if (alive.current) setBusy(false); }
  }

  async function createLink() {
    const next = await createPlanningCalendarSubscription(client);
    if (!alive.current) return;
    issuedAt.current = next.createdAt;
    setUrl(next.url);
    setSubscription({ active: true, eligible: true, created_at: next.createdAt });
    setConfirmation(null);
    setMessage('Lien créé. Copiez-le dans votre application de calendrier avant de quitter SeaPilot.');
  }

  async function revokeLink() {
    await revokePlanningCalendarSubscription(client);
    if (!alive.current) return;
    setUrl('');
    issuedAt.current = null;
    setSubscription((state) => state ? { ...state, active: false } : state);
    setConfirmation(null);
    setMessage('Abonnement désactivé. L’ancien lien ne donne plus accès à votre planning.');
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      if (alive.current) setMessage('Lien copié. Ajoutez-le comme abonnement dans votre calendrier.');
    } catch {
      throw new Error('La copie automatique est indisponible. Sélectionnez et copiez le lien ci-dessous.');
    }
  }

  if (!isOpen) return null;
  const disabled = busy || loading || previewMode || !subscription?.eligible;
  return (
    <AppDialog
      description="À ajouter une seule fois dans votre calendrier, en lecture seule."
      icon={<CalendarDays aria-hidden="true" size={22} />}
      isBusy={busy}
      onClose={onClose}
      size="md"
      title="Mon planning (.ics)"
    >
      <div className="personal-calendar">
        {loading ? <p role="status">Chargement de votre calendrier…</p> : null}
        {previewMode ? <p className="personal-calendar-note">Le calendrier personnel est disponible avec votre compte connecté. La préversion utilise uniquement des données de démonstration.</p> : null}
        {!loading && subscription && !subscription.eligible ? <p className="personal-calendar-note">Ce compte doit être lié à une fiche du personnel avec un accès au planning. Contactez votre administrateur.</p> : null}
        <section>
          <h3>Suivre les nouvelles diffusions</h3>
          <p>Ajoutez ce lien une seule fois comme abonnement dans votre calendrier. À chaque diffusion, le même calendrier reçoit le nouveau planning en lecture seule. Le délai d’actualisation dépend de votre application.</p>
          {url ? <>
            <label htmlFor="personal-calendar-url">Lien personnel d’abonnement</label>
            <div className="personal-calendar-link">
              <input autoComplete="off" id="personal-calendar-url" onFocus={(event) => event.target.select()} readOnly type="text" value={url} />
              <button aria-label="Copier le lien d’abonnement" disabled={busy} onClick={() => void run(copyLink)} type="button"><Copy aria-hidden="true" size={17} /> Copier</button>
            </div>
            <p className="personal-calendar-note">Ce lien donne accès à votre planning. Gardez-le privé. Il est affiché uniquement pendant cette session.</p>
          </> : <>
            {subscription?.active ? <p>Un abonnement est déjà actif. Si vous l’avez ajouté à votre calendrier, vous n’avez rien à refaire. Remplacer le lien arrêtera la synchronisation de l’ancien abonnement.</p> : null}
            <button disabled={disabled} onClick={() => subscription?.active ? setConfirmation('replace') : void run(createLink)} type="button"><Link2 aria-hidden="true" size={17} /> {subscription?.active ? 'Remplacer le lien d’abonnement' : 'Créer mon lien d’abonnement'}</button>
          </>}
          <ul className="personal-calendar-help">
            <li><strong>Outlook :</strong> Ajouter un calendrier → S’abonner à partir du web.</li>
            <li><strong>Google Agenda :</strong> Autres agendas → À partir de l’URL.</li>
            <li><strong>Calendrier Apple :</strong> Fichier → Abonnement à un calendrier.</li>
          </ul>
          <p className="personal-calendar-note">Lors de l’ajout, choisissez un abonnement par URL. Votre calendrier récupérera ensuite les nouvelles diffusions sans nouveau téléchargement.</p>
          {subscription?.active ? <button className="is-secondary" disabled={busy || loading} onClick={() => setConfirmation('revoke')} type="button">Désactiver l’abonnement</button> : null}
          {confirmation ? <div className="personal-calendar-confirm" role="group" aria-label="Confirmer la modification de l’abonnement">
            <p>{confirmation === 'replace' ? 'L’ancien lien cessera de fonctionner. Ajoutez ensuite le nouveau lien dans votre calendrier.' : 'Votre calendrier ne recevra plus les nouvelles diffusions avec ce lien.'}</p>
            <div><button className="is-secondary" disabled={busy} onClick={() => setConfirmation(null)} type="button">Annuler</button><button className="is-danger" disabled={busy} onClick={() => void run(confirmation === 'replace' ? createLink : revokeLink)} type="button">{confirmation === 'replace' ? 'Confirmer le remplacement' : 'Confirmer la désactivation'}</button></div>
          </div> : null}
        </section>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {message ? <p className="personal-calendar-message" role="status">{message}</p> : null}
      </div>
    </AppDialog>
  );
}
