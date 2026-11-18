import { useState } from 'react';
import { AppDialog } from '../../components/AppDialog';

interface Props {
  initialName?: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}

export function OrgChartNameDialog({ initialName, onClose, onSave }: Props) {
  const [name, setName] = useState(initialName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const creating = initialName === undefined;
  const valid = name.trim() !== '' && name.trim() !== initialName;

  async function submitName() {
    if (!valid || saving) return;
    setSaving(true);
    setError('');
    try { await onSave(name); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Impossible d’enregistrer le nom.'); }
    finally { setSaving(false); }
  }

  return <AppDialog
    size="sm"
    title={creating ? 'Nouvel organigramme' : 'Renommer l’organigramme'}
    description={creating ? 'Les bordées de ce nouvel organigramme sont vides au départ.' : undefined}
    onClose={onClose}
    isBusy={saving}
    onSubmit={(event) => { event.preventDefault(); void submitName(); }}
    footer={<><button type="button" disabled={saving} onClick={onClose}>Annuler</button><button type="submit" className="org-primary" disabled={!valid || saving}>{creating ? 'Créer' : 'Enregistrer le nom'}</button></>}
  >
    <label className="org-chart-name-field">Nom de l’organigramme
      <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} disabled={saving} autoFocus />
    </label>
    {error && <p className="org-error" role="alert">{error}</p>}
  </AppDialog>;
}
