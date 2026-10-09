import { useState } from 'react';
import { AppDialog } from '../../components/AppDialog';
import { annualExpiry, todayLocal } from '../lifting/liftingModel';
import type { LsaItem } from './lsaModel';

export function LsaExpiryForm({ item, busy, error, onClose, onSave }: {
  item: LsaItem; busy: boolean; error: string; onClose: () => void; onSave: (expiresOn: string) => void;
}) {
  const [expiresOn, setExpiresOn] = useState(() => annualExpiry(todayLocal()));
  return <AppDialog title="Mettre à jour l’échéance" description={item.document_title || item.title} size="sm" isBusy={busy} onClose={onClose}
    onSubmit={(event) => { event.preventDefault(); onSave(expiresOn); }}
    footer={<><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button></>}>
    <div className="lifting-form-grid"><label className="lifting-span">Date d’échéance<input type="date" required disabled={busy} value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} /></label></div>
    {error && <p className="lifting-error" role="alert">{error}</p>}
  </AppDialog>;
}
