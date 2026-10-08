import { Camera, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { AppShellOutletContext } from '../shell/AppShell';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { HrDocumentRecord, PersonRecord } from './peopleQueries';
import { removePersonPhoto, savePersonPhoto } from './personPhotos';
import { blobDataUrl, preparePortrait, validatePortrait } from './portraitMedia';
import './personPhotos.css';

export type PersonPhotoChanged = (personId: number, photo: Pick<PersonRecord, 'photoPath' | 'photoDocumentId' | 'photoUrl'>, document?: HrDocumentRecord) => void;

export function PersonPhotoField({ client, person, onChanged }: { client: SupabaseClient; person: PersonRecord; onChanged: PersonPhotoChanged }) {
  const demoMode = useOutletContext<AppShellOutletContext | undefined>()?.previewMode === true;
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function save() {
    if (!file) return;
    setBusy(true); setError(''); setStatus('');
    try {
      if (demoMode) {
        onChanged(person.id, { photoPath: `preview/${person.id}`, photoUrl: await blobDataUrl(await preparePortrait(file)) });
        setFile(null); setStatus('Photo de démonstration : conservée uniquement dans cette préversion.'); return;
      }
      const result = await savePersonPhoto(client, person, file);
      onChanged(person.id, result, result.document); setFile(null);
      setStatus('Photo enregistrée dans le dossier RH du collaborateur.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.'); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError(''); setStatus('');
    try {
      if (!demoMode) await removePersonPhoto(client, person);
      onChanged(person.id, { photoPath: undefined, photoDocumentId: null, photoUrl: '' });
      setFile(null); setStatus('Photo retirée du profil. Le document original reste dans le dossier RH.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Suppression impossible.'); }
    finally { setBusy(false); }
  }
  return <section className="hr-photo-field" aria-label="Photo du collaborateur">
    <div className="hr-photo-heading"><Camera size={19} aria-hidden="true" /><div><h4>Photo du collaborateur</h4><p>JPEG ou PNG · 5 Mo maximum. L’original sera conservé dans Ressources Humaines, dans son dossier personnel.</p></div></div>
    <div className="hr-photo-actions">
      <label className="hr-photo-picker"><Upload size={15} aria-hidden="true" /><span>{person.photoPath ? 'Changer la photo' : 'Ajouter une photo'}</span><input aria-label="Choisir la photo du collaborateur" type="file" accept="image/jpeg,image/png" disabled={busy} onChange={(event) => {
        const selected = event.target.files?.[0]; event.target.value = ''; setError(''); setStatus('');
        if (selected) { try { validatePortrait(selected); setFile(selected); } catch (reason) { setError((reason as Error).message); } }
      }} /></label>
      {file && <><img className="hr-photo-preview" src={preview} alt="Aperçu de la photo sélectionnée" /><button className="hr-primary-button" type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Enregistrement…' : 'Enregistrer la photo'}</button><button type="button" className="hr-secondary-button" disabled={busy} onClick={() => setFile(null)}>Annuler la photo</button></>}
      {person.photoPath && !file && <button className="hr-secondary-button" type="button" disabled={busy} onClick={() => void remove()}>Retirer la photo du profil</button>}
    </div>
    {error && <p role="alert" className="hr-photo-error">{error}</p>}{status && <p role="status">{status}</p>}
  </section>;
}
