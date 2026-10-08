import { Tags, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AppDialog } from '../../components/AppDialog';

interface ProcedureTagCatalogueDialogProps {
  names: string[];
  loading: boolean;
  loadError: string;
  onRetry: () => void;
  onCreate: (name: string) => Promise<string>;
  onRemove: (name: string) => Promise<void>;
  onClose: () => void;
}

export function ProcedureTagCatalogueDialog({ names, loading, loadError, onRetry, onCreate, onRemove, onClose }: ProcedureTagCatalogueDialogProps) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const operationFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (busy || !operationFocusRef.current) return;
    const previousFocus = operationFocusRef.current;
    operationFocusRef.current = null;
    const nextFocus = previousFocus.isConnected && previousFocus !== document.body && !previousFocus.matches(':disabled')
      ? previousFocus : nameInputRef.current;
    nextFocus?.focus();
  }, [busy]);

  function rememberFocus() {
    operationFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : nameInputRef.current;
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loading || !name.trim()) return;
    rememberFocus();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const created = await onCreate(name);
      setName('');
      setNotice(`Tag « ${created} » ajouté.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'L’ajout du tag a échoué.'); }
    finally { setBusy(false); }
  }

  async function handleRemove(tag: string) {
    if (busy || loading) return;
    rememberFocus();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await onRemove(tag);
      setNotice(`Tag « ${tag} » supprimé de la liste.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'La suppression du tag a échoué.'); }
    finally { setBusy(false); }
  }

  return <AppDialog title="Gérer les tags" description="Les tags supprimés de cette liste restent associés aux documents qui les utilisent." icon={<Tags aria-hidden="true" size={20} />} size="md" isBusy={busy} onClose={onClose} onSubmit={handleCreate}
    footer={<div className="app-dialog__actions"><button className="sp-button sp-button--secondary" disabled={busy} onClick={onClose} type="button">Terminer</button></div>}>
    <div className="procedure-tag-manager">
      <div className="procedure-tag-manager-create">
        <label htmlFor="procedure-new-catalogue-tag">Nouveau tag</label>
        <input id="procedure-new-catalogue-tag" ref={nameInputRef} disabled={busy} placeholder="Ex. Navigation" value={name} onChange={event => setName(event.target.value)} />
        <button className="sp-button sp-button--primary" disabled={busy || loading || !name.trim()} type="submit">{busy ? 'Enregistrement…' : 'Ajouter le tag'}</button>
      </div>
      {loading ? <p role="status">Chargement des tags pré-enregistrés…</p> : null}
      {loadError && !loading ? <div className="procedure-tag-catalogue-error"><p role="alert">{loadError}</p><button className="sp-button sp-button--secondary" disabled={busy} onClick={onRetry} type="button">Réessayer le chargement des tags</button></div> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {notice ? <p className="procedure-tag-manager-notice" role="status">{notice}</p> : null}
      {names.length ? <ul aria-label="Tags pré-enregistrés" className="procedure-tag-manager-list">{names.map(tag => <li key={tag}><span>{tag}</span><button aria-label={`Supprimer le tag ${tag}`} className="sp-button sp-button--secondary" disabled={busy || loading} onClick={() => void handleRemove(tag)} type="button"><Trash2 aria-hidden="true" size={16} />Supprimer</button></li>)}</ul> : !loading && !loadError ? <p>Aucun tag pré-enregistré pour le moment.</p> : null}
    </div>
  </AppDialog>;
}
