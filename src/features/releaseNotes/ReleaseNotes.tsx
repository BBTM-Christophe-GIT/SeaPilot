import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Megaphone } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppDialog } from '../../components/AppDialog';
import { APP_BUILD_VERSION, APP_VERSION_LABEL } from '../../config/appVersion';
import { chronologicalNotes, RELEASE_NOTES, type ReleaseNote } from './releaseNotesCatalog';
import { createPreviewReleaseNoteStore, createReleaseNoteStore, type ReleaseNoteState, type ReleaseNoteStore } from './releaseNoteQueries';
import './releaseNotes.css';
import type { RoleKey } from '../permissions/roles';

const NO_ROLES: readonly RoleKey[] = [];

interface Props {
  client: SupabaseClient;
  userId?: string;
  previewMode?: boolean;
  notes?: readonly ReleaseNote[];
  roles?: readonly RoleKey[];
  storeOverride?: ReleaseNoteStore;
}

export function ReleaseNotes({ client, userId, previewMode = false, notes = RELEASE_NOTES, roles = NO_ROLES, storeOverride }: Props) {
  const store = useMemo(() => storeOverride || (previewMode ? createPreviewReleaseNoteStore() : userId ? createReleaseNoteStore(client, userId) : null), [client, userId, previewMode, storeOverride]);
  const [states, setStates] = useState<ReleaseNoteState[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openedNotes, setOpenedNotes] = useState<ReleaseNote[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const requestId = useRef(0);
  const ordered = useMemo(() => chronologicalNotes(notes.filter((note) => !note.roles || note.roles.some((role) => roles.includes(role)))), [notes, roles]);
  const visibleOpenedNotes = openedNotes?.filter((note) => ordered.some((visible) => visible.id === note.id));
  const unread = ordered.filter((note) => !states.some((state) => state.note_id === note.id && state.read_at));

  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    async function load() {
      if (pending.current) return;
      const request = ++requestId.current;
      try {
        const rows = await store!.load();
        if (cancelled || pending.current || request !== requestId.current) return;
        setStates(rows); setLoaded(true); setError('');
        if (ordered.some((note) => !rows.some((row) => row.note_id === note.id))) {
          setOpenedNotes((current) => current || ordered.filter((note) => !rows.some((row) => row.note_id === note.id && row.read_at)));
        }
      } catch {
        if (!cancelled && request === requestId.current) setError('Impossible de charger vos notes de mise à jour. Réessayez.');
      }
    }
    void load();
    window.addEventListener('focus', load);
    return () => { cancelled = true; window.removeEventListener('focus', load); };
  }, [store, ordered]);

  async function openNotes() {
    if (!store || pending.current) return;
    requestId.current += 1;
    pending.current = true; setBusy(true);
    try {
      const rows = await store.load();
      setStates(rows); setLoaded(true); setError('');
      const remaining = ordered.filter((note) => !rows.some((row) => row.note_id === note.id && row.read_at));
      setOpenedNotes(remaining.length ? remaining : ordered);
    } catch {
      setError('Impossible de charger vos notes de mise à jour. Réessayez.');
      setOpenedNotes([]);
    } finally { pending.current = false; setBusy(false); }
  }

  async function dismiss(read: boolean) {
    if (!store || !openedNotes || pending.current) return;
    if (error && !openedNotes.length) { setOpenedNotes(null); return; }
    requestId.current += 1;
    pending.current = true; setBusy(true); setError('');
    try {
      const ids = (visibleOpenedNotes || []).map((note) => note.id);
      await store.save(ids, read);
      setStates((current) => {
        const merged = new Map(current.map((row) => [row.note_id, row]));
        for (const note_id of ids) if (read || !merged.has(note_id)) merged.set(note_id, { note_id, read_at: read ? new Date().toISOString() : null });
        return [...merged.values()];
      });
      setOpenedNotes(null);
    } catch {
      setError('Votre choix n’a pas pu être enregistré. Réessayez.');
    } finally { pending.current = false; setBusy(false); }
  }

  const count = loaded ? unread.length : 0;
  return <>
    <button type="button" className="app-version release-notes-trigger" disabled={!store || busy} onClick={() => void openNotes()}
      aria-label={`Notes de mise à jour, ${APP_VERSION_LABEL}${count ? `, ${count} non lue${count > 1 ? 's' : ''}` : ''}`}
      title={`Notes de mise à jour · Build ${APP_BUILD_VERSION}`}>
      <span>Version</span><strong>{APP_VERSION_LABEL}</strong>
      {count > 0 && <span className="release-notes-badge" aria-label={`${count} mise${count > 1 ? 's' : ''} à jour non lue${count > 1 ? 's' : ''}`}>{count}</span>}
      {error && !openedNotes && <span className="release-notes-retry">Réessayer</span>}
    </button>
    {openedNotes && createPortal(<AppDialog title="Note de mise à jour" eyebrow="SeaPilot" icon={<Megaphone size={21} aria-hidden="true" />} size="lg" isBusy={busy} onClose={() => void dismiss(false)}
      description="Retrouvez les nouveautés de la plus récente à la plus ancienne."
      footer={<div className="app-dialog__actions">
        <button type="button" className="is-secondary" disabled={busy} onClick={() => void dismiss(false)}>Lire plus tard</button>
        {visibleOpenedNotes?.length ? <button type="button" className="is-primary" disabled={busy} onClick={() => void dismiss(true)}>{busy ? 'Enregistrement…' : 'Ok'}</button>
          : <button type="button" className="is-primary" disabled={busy} onClick={() => void openNotes()}>Réessayer</button>}
      </div>}>
      {error && <p role="alert" className="release-notes-error">{error}</p>}
      <div className="release-notes-list">{visibleOpenedNotes?.map((note) => <article className="release-note" key={note.id}>
        <div className="release-note-meta"><strong>v{note.version}</strong><time dateTime={note.publishedOn}>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${note.publishedOn}T12:00:00Z`))}</time></div>
        <h3>{note.title}</h3><ul>{note.changes.map((change) => <li key={change}>{change}</li>)}</ul>
      </article>)}</div>
    </AppDialog>, document.body)}
  </>;
}
