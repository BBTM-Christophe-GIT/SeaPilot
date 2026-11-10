import { FileText } from 'lucide-react';
import { AppDialog } from '../../components/AppDialog';
import type { PharmacyPurchaseOrderLine } from './pharmacyPurchaseOrderLines';

export function PharmacyPurchaseOrderReview({ vesselName, lines, busy, error, onClose, onSubmit }: {
  vesselName: string;
  lines: readonly PharmacyPurchaseOrderLine[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (quantities: Map<number, number>) => void;
}) {
  return <AppDialog
    title="Vérifier les quantités du bon"
    eyebrow={`Bon de commande Pharmacie · ${vesselName}`}
    description="Le stock ou le conditionnement ne permet pas de calculer ces quantités. Renseignez la quantité à commander pour chaque article."
    icon={<FileText aria-hidden="true" size={20} />}
    isBusy={busy}
    onClose={onClose}
    onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const quantities = new Map<number, number>();
      lines.forEach((line, index) => {
        if (line.quantity === null) quantities.set(index, Number.parseFloat(String(form.get(`quantity-${index}`) ?? '')));
      });
      onSubmit(quantities);
    }}
    footer={<div className="app-dialog__actions">
      <button className="is-secondary" disabled={busy} onClick={onClose} type="button">Annuler</button>
      <button className="is-primary" disabled={busy} type="submit">{busy ? 'Émission…' : 'Émettre le PDF signé'}</button>
    </div>}
  >
    <div className="pharmacy-form-grid">
      {lines.map((line, index) => line.quantity === null ? <label key={index}>
        <strong>{line.designation}</strong>
        <small className="pharmacy-field-help">{[line.brand, line.requiredStrength, line.packaging, line.reason].filter(Boolean).join(' · ')}</small>
        <span>Quantité ({line.unit})</span><input disabled={busy} name={`quantity-${index}`}
          aria-label={`Quantité (${line.unit}) pour ${line.designation}`}
          type="number" min={line.canExclude ? 0 : line.unit === 'boîte' ? 1 : 0.001} max={1e12} step={line.unit === 'boîte' ? 1 : 0.001} required />
        {line.canExclude ? <small className="pharmacy-field-help">Saisissez 0 si le stock vérifié est suffisant.</small> : null}
      </label> : null)}
    </div>
    {error ? <p className="pharmacy-message is-error" role="alert">{error}</p> : null}
  </AppDialog>;
}
