import { useEffect, useState } from 'react';
import { CircleAlert, TriangleAlert } from 'lucide-react';
import { AppDialog } from '../../components/AppDialog';
import { annualExpiry, formatLiftingDate, liftingDeadline, todayLocal, type LiftingItem } from './liftingModel';

export function useLiftingToday() {
  const [today, setToday] = useState(todayLocal);
  useEffect(() => {
    const update = () => setToday(todayLocal());
    const timer = window.setInterval(update, 60000);
    window.addEventListener('focus', update);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); };
  }, []);
  return today;
}

export function LiftingDueBadge({ date, today }: { date?: string | null; today: string }) {
  const state = liftingDeadline(date, today);
  if (!date) return null;
  const Icon = state === 'expired' ? CircleAlert : TriangleAlert;
  return <span className={`lifting-due ${state}`}>
    {state && <Icon size={15} aria-hidden="true" />}
    {state === 'expired' ? 'Échu le' : state === 'soon' ? 'Échéance proche :' : 'Échéance :'} {formatLiftingDate(date)}
  </span>;
}

export function LiftingReplaceForm({ item, busy, error, onClose, onSave }: {
  item: LiftingItem; busy: boolean; error: string; onClose: () => void; onSave: (date: string) => void;
}) {
  const [date, setDate] = useState(todayLocal);
  return <AppDialog title={`Remplacer le matériel ${item.reference}`} isBusy={busy} onClose={onClose}
    onSubmit={(event) => { event.preventDefault(); onSave(date); }}
    footer={<><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Annuler</button><button className="primary-button" disabled={busy || !date}>Remplacer le matériel</button></>}>
    <p><strong>{item.description}</strong></p>
    <p>L’identifiant, les caractéristiques et les certificats sont conservés. L’échéance annuelle repart de la nouvelle mise en service.</p>
    <div className="lifting-form-grid"><label>Nouvelle date de mise en service<input type="date" required min={item.commissioned_on} max={todayLocal()} value={date} onChange={(event) => setDate(event.target.value)} /></label></div>
    <p>Prochaine visite : <strong>{formatLiftingDate(annualExpiry(date))}</strong></p>
    {error && <p className="lifting-error" role="alert">{error}</p>}
  </AppDialog>;
}
