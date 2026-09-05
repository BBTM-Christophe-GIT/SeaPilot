import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
export function KpiDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} className="kpi-dialog" aria-label={title} onCancel={onClose} onClose={onClose}>
    <header><h2>{title}</h2><button className="kpi-button is-icon" aria-label="Fermer la fenêtre" onClick={onClose}><X size={20} /></button></header>
    <div className="kpi-dialog-body">{children}</div><footer><button className="kpi-button" onClick={onClose}>Fermer</button></footer>
  </dialog>;
}
export function KpiDefinitions() {
  const formulas = [['TF / LTIFR', '(FAT + LWDC) × 1 000 000 ÷ heures travaillées'], ['TG', 'Jours perdus × 1 000 ÷ heures travaillées'],
    ['TRIR', '(FAT + LWDC + RWC + MTC) × 1 000 000 ÷ heures travaillées'], ['FAR', 'FAT × 100 000 000 ÷ heures travaillées'], ['SOFR', 'Observations sécurité × 200 000 ÷ heures travaillées']];
  return <><h3>Référentiel HSE</h3><p>FAT : décès lié au travail. LWDC : accident avec journée perdue. LTI = FAT + LWDC. RWC : travail adapté ou restreint. MTC : traitement médical. FAC : premiers soins. Near miss : presqu’accident sans blessure.</p>
    <dl>{formulas.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
    <p>Les taux sont calculés sur l’exposition du périmètre. Pour plusieurs années, les numérateurs et les heures sont additionnés avant calcul : les taux annuels ne sont jamais moyennés. Les historiques officiels entreprise ne sont pas affectés arbitrairement aux navires ou projets.</p>
    <p>Le tableau de bord montre le cumul annuel ; les graphiques PDF TF/TG montrent les taux de chaque mois. Les périodes sans ventilation fiable restent vides. Les données enregistrées ne sont pas certifiées exhaustives.</p>
    <h3>Tendance et prévision</h3><p>La tendance décrit la hausse ou la baisse sur les mois observés suffisamment renseignés. La prévision estime les mois futurs en pointillés, sans modifier les totaux réels. Les échéances RH sont des dates connues, pas une prévision statistique.</p></>;
}
