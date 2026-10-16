import { useRef, useState, type CSSProperties } from 'react';
import { Check, CheckCircle2, ChevronRight, Circle, ClipboardCheck, FileText, RefreshCw } from 'lucide-react';
import { SeaOperationPrint } from './SeaOperationPrint';
import { getSeaOperationCompletion } from './seaOperationCompletion';
import type { SeaOperationPayload } from './seaOperationModel';
import type { SeaOperationRecord } from './seaOperationQueries';
import './seaOperationPreview.css';

export interface SeaOperationPreviewProps {
  draft: SeaOperationPayload;
  record: SeaOperationRecord | null;
  onChangeStep: (step: number) => void;
  hasUnsavedChanges?: boolean;
}

export function SeaOperationPreview({ draft, record, onChangeStep, hasUnsavedChanges = false }: SeaOperationPreviewProps) {
  const [zoom, setZoom] = useState(() => typeof window === 'undefined' ? 60 : window.innerWidth < 700 ? 40 : window.innerWidth >= 1600 ? 85 : 60);
  const [revision, setRevision] = useState(0);
  const [showAllMissing, setShowAllMissing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const completion = getSeaOperationCompletion(draft);
  const signed = record?.status === 'signed';
  const showRecordedAudit = Boolean(record && (signed || !hasUnsavedChanges));
  // An edited draft cannot inherit the audit of its previously saved version.
  const previewRecord: SeaOperationRecord = {
    id: '', companyId: 0, version: 0, status: 'draft',
    createdBy: '', createdByName: '', createdAt: '', updatedBy: '', updatedByName: '', updatedAt: '',
    signedBy: null, signedByName: null, signedAt: null, captainName: null, canEdit: true, canSign: false,
    ...(showRecordedAudit ? record : {}), draft: signed ? record.draft : draft,
  };
  const missing = showAllMissing ? completion.missing : completion.missing.slice(0, 5);

  function refresh() {
    setRevision((value) => value + 1);
    setRefreshNotice('Aperçu actualisé avec les informations de la fiche.');
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }

  return <div className="so-operation-preview">
    <section className="so-live-preview" aria-label="Aperçu de la fiche">
      <header className="so-preview-toolbar"><h2><FileText size={17} />Aperçu de la fiche</h2>
        <div className="so-preview-tools"><label className="so-preview-zoom"><span>Zoom</span><select aria-label="Zoom de l’aperçu" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
          {[40, 60, 75, 85, 100].map((value) => <option key={value} value={value}>{value}%</option>)}
        </select></label><button type="button" className="so-preview-refresh" onClick={refresh} title="Actualiser l’aperçu"><RefreshCw size={15} /><span>Actualiser</span></button></div>
      </header>
      <p className="so-preview-live-note">{hasUnsavedChanges && !signed ? 'Aperçu de la saisie · modifications non enregistrées.' : 'La fiche se met à jour au fil de votre saisie.'}</p>
      <span className="so-preview-sr-only" role="status">{refreshNotice}</span>
      <div className="so-preview-scroller" ref={scrollRef} tabIndex={0} aria-label="Document en aperçu, défilement vertical et horizontal">
        <div className={`so-document-preview${showRecordedAudit ? '' : ' is-unsaved'}`} style={{ zoom: zoom / 100 }} key={revision}>
          <SeaOperationPrint record={previewRecord} />
        </div>
      </div>
    </section>

    <aside className="so-completion" aria-label="Complétude de la fiche">
      <header><ClipboardCheck size={18} /><h2>Complétude</h2></header>
      <div className="so-completion-ring" role="progressbar" aria-label="Champs de préparation renseignés" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion.percentage}
        aria-valuetext={`${completion.completed} champs renseignés sur ${completion.total}`}
        style={{ '--so-completion-percent': `${completion.percentage}%` } as CSSProperties}>
        <span>{completion.percentage}<small>%</small></span>
      </div>
      <p className="so-completion-caption"><strong>{completion.completedSteps} / 4 étapes renseignées</strong><span>{completion.completed} / {completion.total} champs de préparation</span></p>
      <p className="so-completion-explainer">La complétude suit les champs de préparation. La décision reste celle du Capitaine.</p>
      <nav className="so-completion-steps" aria-label="Complétude par étape">{completion.steps.map((step) => <button type="button" key={step.index} onClick={() => onChangeStep(step.index)}>
        <span className={`so-completion-check${step.complete ? ' is-complete' : ''}`}>{step.complete ? <Check size={13} /> : step.index + 1}</span>
        <span>{step.title}<small>{step.completed} / {step.total} renseignés</small></span><ChevronRight size={14} />
      </button>)}</nav>
      {completion.blockingChecks.length > 0 && <div className="so-completion-blocking"><strong>{completion.blockingChecks.length} contrôle(s) imposent un NO GO</strong>
        {completion.blockingChecks.map((check) => <button key={check.id} type="button" onClick={() => onChangeStep(1)}>{check.label}<ChevronRight size={13} /></button>)}
      </div>}
      <details className="so-completion-sections"><summary>{completion.sections.filter((section) => section.complete).length} / 9 rubriques du contrôle renseignées</summary>
        {completion.sections.map((section) => <button type="button" key={section.id} onClick={() => onChangeStep(1)}>{section.complete ? <CheckCircle2 size={14} /> : <Circle size={14} />}<span>{section.title}</span></button>)}
      </details>
      {completion.missing.length > 0 ? <div className="so-completion-missing"><h3>À compléter <span>{completion.missing.length}</span></h3>
        <ul>{missing.map((field) => <li key={field.id}><button type="button" onClick={() => onChangeStep(field.step)}><span>{field.label}</span><ChevronRight size={13} /></button></li>)}</ul>
        {completion.missing.length > 5 && <button className="so-completion-more" type="button" onClick={() => setShowAllMissing((value) => !value)}>{showAllMissing ? 'Réduire la liste' : `Voir les ${completion.missing.length} champs à compléter`}</button>}
      </div> : <p className="so-completion-ready"><CheckCircle2 size={17} />Tous les champs de préparation sont renseignés.</p>}
      <p className="so-completion-signature">{record?.status === 'signed' ? `Décision ${draft.decision === 'NO_GO' ? 'NO GO' : 'GO'} signée par ${record.signedByName || record.captainName || 'le Capitaine'}.` : 'La signature du Capitaine est confirmée séparément, à la dernière étape.'}</p>
    </aside>
  </div>;
}
