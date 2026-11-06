import { Euro } from 'lucide-react';
import { useRef, useState } from 'react';
import { AppDialog } from '../../components/AppDialog';
import { isProjectFuelPrice, PROJECT_FUEL_PRODUCT, projectFuelCurrentDate, type ProjectFuelPrice } from './projectFuelEstimate';

interface ProjectFuelPriceControlProps {
  price: ProjectFuelPrice | null;
  disabled?: boolean;
  onSave: (price: ProjectFuelPrice) => Promise<void>;
}

interface FuelPriceDraft {
  amount: string;
  effectiveOn: string;
  source: string;
}

const priceInputFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 4, useGrouping: false });

export function ProjectFuelPriceControl({ price, disabled = false, onSave }: ProjectFuelPriceControlProps) {
  const [draft, setDraft] = useState<FuelPriceDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);

  function open() {
    if (disabled || saving.current) return;
    setDraft({ amount: price ? priceInputFormat.format(price.eurosPerLiter) : '', effectiveOn: projectFuelCurrentDate(), source: '' });
    setError('');
  }

  function close() {
    if (!saving.current) setDraft(null);
  }

  async function submit() {
    if (!draft || disabled || saving.current) return;
    const amount = draft.amount.trim();
    const eurosPerLiter = Number(amount.replace(',', '.'));
    if (!/^\d{1,8}(?:[,.]\d{1,4})?$/.test(amount) || eurosPerLiter <= 0) {
      setError('Saisissez un prix positif avec au maximum quatre décimales, par exemple 1,2345.');
      return;
    }
    const source = draft.source.trim();
    if (!source || source.length > 160) {
      setError('Indiquez la référence du devis ou de la facture, sur 160 caractères au maximum.');
      return;
    }
    const next = { eurosPerLiter, effectiveOn: draft.effectiveOn, source };
    if (!isProjectFuelPrice(next)) {
      setError('Choisissez une date d’effet valide, aujourd’hui ou dans le passé.');
      return;
    }

    saving.current = true;
    setBusy(true);
    setError('');
    try {
      await onSave(next);
      setDraft(null);
    } catch (reason) {
      const message = reason && typeof reason === 'object' && 'message' in reason ? reason.message : null;
      setError(typeof message === 'string' && message.trim() ? message : 'Le prix n’a pas pu être enregistré. Réessayez.');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return <>
    <button type="button" className="sp-button sp-button--secondary" aria-haspopup="dialog" disabled={disabled || busy} onClick={open}>
      <Euro aria-hidden="true" size={16} />{price ? 'Actualiser le prix du fuel' : 'Renseigner le prix du fuel'}
    </button>
    {draft ? <AppDialog title="Prix du fuel" eyebrow="Projet · Estimation du trajet"
      description={`Saisissez le prix hors TVA du ${PROJECT_FUEL_PRODUCT} indiqué sur un devis ou une facture.`}
      icon={<Euro aria-hidden="true" size={20} />} size="sm" isBusy={busy} onClose={close}
      onSubmit={event => { event.preventDefault(); void submit(); }}
      footer={<div className="app-dialog__actions">
        <button type="button" className="sp-button sp-button--secondary" disabled={busy} onClick={close}>Annuler</button>
        <button type="submit" className="sp-button sp-button--primary" disabled={disabled || busy}>{busy ? 'Enregistrement…' : 'Enregistrer le prix'}</button>
      </div>}>
      <div className="project-catalog-form-grid">
        <label>Prix HT en €/L
          <input value={draft.amount} inputMode="decimal" placeholder="1,2345" required disabled={disabled || busy}
            onChange={event => setDraft({ ...draft, amount: event.target.value })} />
        </label>
        <label>Date d’effet
          <input type="date" value={draft.effectiveOn} max={projectFuelCurrentDate()} required disabled={disabled || busy}
            onChange={event => setDraft({ ...draft, effectiveOn: event.target.value })} />
        </label>
        <label className="is-wide">Référence du devis ou de la facture
          <input value={draft.source} required disabled={disabled || busy}
            onChange={event => setDraft({ ...draft, source: event.target.value })} />
        </label>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </AppDialog> : null}
  </>;
}
