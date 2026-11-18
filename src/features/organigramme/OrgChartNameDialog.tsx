import { useState } from 'react';
import { AppDialog } from '../../components/AppDialog';

export type OrgChartNameAction = 'create' | 'rename' | 'duplicate';

const ACTION_LABELS = {
  create: { title: 'Nouvel organigramme', submit: 'Créer' },
  rename: { title: 'Renommer l’organigramme', submit: 'Enregistrer le nom' },
  duplicate: { title: 'Dupliquer l’organigramme', submit: 'Dupliquer' },
};

interface Props {
  action: OrgChartNameAction;
  chartName: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}

export function OrgChartNameDialog({ action, chartName, onClose, onSave }: Props) {
  const [name, setName] = useState(action === 'rename' ? chartName : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { title, submit } = ACTION_LABELS[action];
  const valid = name.trim() !== '' && (action !== 'rename' || name.trim() !== chartName);
  const description = action === 'create' ? 'Les bordées de ce nouvel organigramme sont vides au départ.'
    : action === 'duplicate' ? `Les bordées, les collaborateurs et la structure de « ${chartName} » seront copiés.` : undefined;

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
    title={title}
    description={description}
    onClose={onClose}
    isBusy={saving}
    onSubmit={(event) => { event.preventDefault(); void submitName(); }}
    footer={<><button type="button" disabled={saving} onClick={onClose}>Annuler</button><button type="submit" className="org-primary" disabled={!valid || saving}>{submit}</button></>}
  >
    <label className="org-chart-name-field">Nom de l’organigramme
      <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} disabled={saving} autoFocus />
    </label>
    {error && <p className="org-error" role="alert">{error}</p>}
  </AppDialog>;
}
