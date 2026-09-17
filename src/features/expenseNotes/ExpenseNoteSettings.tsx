import { useState, type FormEvent } from 'react';
import { Plus, Settings, Trash2 } from 'lucide-react';
import { AppDialog } from '../../components/AppDialog';
import type { ExpenseSettings } from './expenseNoteQueries';

export function ExpenseNoteSettings({ initial, onSave, onClose }: { initial: ExpenseSettings; onSave: (settings: ExpenseSettings) => Promise<void>; onClose: () => void }) {
  const [methods, setMethods] = useState(initial.payment_methods);
  const [defaultIndex, setDefaultIndex] = useState(initial.payment_methods.indexOf(initial.default_payment_method));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const cleaned = methods.map((method) => method.trim());
    if (cleaned.some((method) => !method) || new Set(cleaned.map((m) => m.toLocaleLowerCase('fr'))).size !== cleaned.length) { setError('Chaque moyen de paiement doit avoir un nom différent et non vide.'); return; }
    setBusy(true);
    try { await onSave({ ...initial, payment_methods: cleaned, default_payment_method: cleaned[defaultIndex] || cleaned[0] }); onClose(); }
    catch (failure) { setError((failure as Error).message || 'Enregistrement impossible.'); }
    finally { setBusy(false); }
  }
  return <AppDialog title="Paramétrage des notes de frais" eyebrow="Administration" size="lg" icon={<Settings size={20} />} onClose={onClose} onSubmit={submit} isBusy={busy}
    footer={<><button className="expense-button" type="button" disabled={busy} onClick={onClose}>Annuler</button><button className="expense-button expense-button--primary" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer les paramètres'}</button></>}>
    <div className="expense-form"><p>Ajoutez, renommez ou retirez les moyens de paiement proposés. Choisissez la carte ou le moyen de paiement présélectionné à l’ouverture d’une nouvelle note.</p>
      {error ? <p className="expense-message expense-message--error" role="alert">{error}</p> : null}
      <fieldset className="expense-form__fields" disabled={busy}><legend>Moyens de paiement</legend>{methods.map((method, index) => <div className="expense-settings-row" key={index}>
        <input aria-label={`Nom du moyen de paiement ${index + 1}`} required maxLength={100} value={method} onChange={(event) => setMethods(methods.map((item, i) => i === index ? event.target.value : item))} />
        <label className="expense-default-choice"><input type="radio" name="defaultPayment" aria-label={`Par défaut : ${method || index + 1}`} checked={defaultIndex === index} onChange={() => setDefaultIndex(index)} />Par défaut</label>
        <button className="expense-button" type="button" disabled={methods.length === 1} aria-label={`Retirer le moyen de paiement ${index + 1}`} onClick={() => { setMethods(methods.filter((_, i) => i !== index)); setDefaultIndex(defaultIndex === index ? 0 : defaultIndex > index ? defaultIndex - 1 : defaultIndex); }}><Trash2 size={16} /></button>
      </div>)}<button className="expense-button" type="button" disabled={methods.length >= 50} onClick={() => setMethods([...methods, ''])}><Plus size={16} /> Ajouter un moyen de paiement</button></fieldset>
      <p className="expense-hint">Les navires proviennent du module Navires et les émetteurs du personnel SeaPilot. L’utilisateur connecté et son navire d’affectation sont proposés automatiquement ; ils restent modifiables. Les notes déjà émises conservent leurs libellés d’origine.</p>
    </div>
  </AppDialog>;
}
