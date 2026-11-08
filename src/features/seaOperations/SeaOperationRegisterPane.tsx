import type { SupabaseClient } from '@supabase/supabase-js';
import { ClipboardList, FileText, Map } from 'lucide-react';
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import type { SeaOperationProjectDocument } from './seaOperationDocumentQueries';
import type { SeaOperationPdfSection } from './seaOperationPdfSections';
import { SeaOperationRegisterSheet } from './SeaOperationRegisterSheet';
import type { SeaOperationPayload } from './seaOperationModel';
import type { SeaOperationRecord } from './seaOperationQueries';
import { SeaOperationProjectDocuments } from './SeaOperationProjectDocuments';
import { SeaOperationRegisterMap } from './SeaOperationRegisterMap';
import { SeaOperationConsumptionSummary } from './SeaOperationConsumptionPanel';
import type { SeaOperationConsumption } from './seaOperationConsumption';
import { hasSeaOperationConsumption, useSeaOperationConsumptionContext } from './useSeaOperationConsumption';
import './seaOperationDocumentLibrary.css';

interface Props {
  client: SupabaseClient;
  accessKey: string;
  operationId?: string;
  record: SeaOperationRecord | null;
  maxSpeedKnots?: number | null;
  navigationSpeedKnots?: number | null;
  navigationSpeedPending?: boolean;
  navigationSpeedUnavailable?: boolean;
  consumptionRefresh?: number;
  savedConsumption?: SeaOperationConsumption;
  disabled?: boolean;
  canManageDocuments?: boolean;
  onSave: (draft: SeaOperationPayload, record: SeaOperationRecord) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  onOpen?: (record: SeaOperationRecord) => void;
  onModify?: (record: SeaOperationRecord) => void;
  onDownload?: (record: SeaOperationRecord, sections: readonly SeaOperationPdfSection[]) => void;
}

const tabs = ['map', 'sheet', 'documents'] as const;
type RegisterTab = typeof tabs[number];

/** The map stays mounted to preserve unsaved edits while reading the fiche or documents. */
export function SeaOperationRegisterPane({ client, accessKey, operationId, record, maxSpeedKnots, navigationSpeedKnots, navigationSpeedPending, navigationSpeedUnavailable, consumptionRefresh, savedConsumption, disabled = false, canManageDocuments = false, onSave, onDirtyChange, onOpen, onModify, onDownload }: Props) {
  const id = useId();
  const selectedId = operationId ?? record?.id ?? '';
  const projectId = record?.draft.planning?.projectId || '';
  const context = useMemo(() => ({ client, accessKey, selectedId }), [client, accessKey, selectedId]);
  const consumption = useSeaOperationConsumptionContext(client, record?.id, consumptionRefresh, `${accessKey}:${record?.version ?? ''}`, savedConsumption);
  const savedVersion = savedConsumption?.operationId === selectedId ? savedConsumption.record?.version : undefined;
  const [view, setView] = useState<{ context: typeof context; savedVersion?: number; tab: RegisterTab } | null>(null);
  const [catalog, setCatalog] = useState<{ context: typeof context; projectId: string; documents: readonly SeaOperationProjectDocument[] | null }>();
  const tab = view?.context === context && view.savedVersion === savedVersion ? view.tab : 'map';
  const documents = catalog?.context === context && catalog.projectId === projectId ? catalog.documents : null;
  const count = documents?.length ?? (projectId ? null : 0);
  const updateCatalog = useCallback((documents: readonly SeaOperationProjectDocument[] | null) => setCatalog({ context, projectId, documents }), [context, projectId]);
  const tabElements = useRef<Partial<Record<RegisterTab, HTMLButtonElement | null>>>({});
  function choose(next: RegisterTab, focus = false) {
    setView({ context, savedVersion, tab: next });
    if (focus) tabElements.current[next]?.focus();
  }
  return <div className="so-register-detail">
    <div className="so-register-detail-tabs" role="tablist" aria-label="Vue de l’opération" onKeyDown={event => {
      const index = tabs.indexOf(tab);
      const keys: Partial<Record<string, RegisterTab>> = { Home: tabs[0], End: tabs[tabs.length - 1],
        ArrowLeft: tabs[(index + tabs.length - 1) % tabs.length], ArrowRight: tabs[(index + 1) % tabs.length] };
      const next = keys[event.key];
      if (next) { event.preventDefault(); choose(next, true); }
    }}>
      <button type="button" role="tab" id={`${id}-map-tab`} aria-controls={`${id}-map`} aria-selected={tab === 'map'} tabIndex={tab === 'map' ? 0 : -1} ref={element => { tabElements.current.map = element; }} onClick={() => choose('map')}><Map aria-hidden="true" size={17} />Carte</button>
      <button type="button" role="tab" id={`${id}-sheet-tab`} aria-controls={`${id}-sheet`} aria-selected={tab === 'sheet'} tabIndex={tab === 'sheet' ? 0 : -1} ref={element => { tabElements.current.sheet = element; }} onClick={() => choose('sheet')}><ClipboardList aria-hidden="true" size={17} />Fiche</button>
      <button type="button" role="tab" id={`${id}-documents-tab`} aria-controls={`${id}-documents`} aria-selected={tab === 'documents'} tabIndex={tab === 'documents' ? 0 : -1} ref={element => { tabElements.current.documents = element; }} onClick={() => choose('documents')}><FileText aria-hidden="true" size={17} />Documents<span className="so-register-document-count" aria-label={count === null ? 'Nombre de documents non disponible' : `${count} document${count > 1 ? 's' : ''}`}>{count ?? '…'}</span></button>
    </div>
    <div role="tabpanel" id={`${id}-map`} aria-labelledby={`${id}-map-tab`} hidden={tab !== 'map'}>
      {record && hasSeaOperationConsumption(record) && <SeaOperationConsumptionSummary {...consumption} />}
      <SeaOperationRegisterMap record={record} disabled={disabled} maxSpeedKnots={maxSpeedKnots} navigationSpeedKnots={navigationSpeedKnots}
        navigationSpeedPending={navigationSpeedPending} navigationSpeedUnavailable={navigationSpeedUnavailable}
        consumption={consumption.response?.data} onSave={onSave} onDirtyChange={onDirtyChange} />
    </div>
    <div role="tabpanel" id={`${id}-sheet`} aria-labelledby={`${id}-sheet-tab`} hidden={tab !== 'sheet'}>
      {tab === 'sheet' && (record ? <SeaOperationRegisterSheet key={record.id} record={record} documents={documents ?? undefined}
        disabled={disabled} onOpen={onOpen} onModify={onModify} onDownload={onDownload} />
        : <p className="sp-panel so-register-sheet-empty">Sélectionnez une opération pour afficher sa fiche.</p>)}
    </div>
    <div role="tabpanel" id={`${id}-documents`} aria-labelledby={`${id}-documents-tab`} hidden={tab !== 'documents'}>
      <SeaOperationProjectDocuments client={client} projectId={projectId} accessKey={accessKey} disabled={disabled} canManage={canManageDocuments} onCatalogChange={updateCatalog} showWithoutProject />
    </div>
  </div>;
}
