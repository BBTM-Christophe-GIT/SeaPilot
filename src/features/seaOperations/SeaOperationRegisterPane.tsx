import type { SupabaseClient } from '@supabase/supabase-js';
import { FileText, Map } from 'lucide-react';
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import type { SeaOperationPayload } from './seaOperationModel';
import type { SeaOperationRecord } from './seaOperationQueries';
import { SeaOperationProjectDocuments } from './SeaOperationProjectDocuments';
import { SeaOperationRegisterMap } from './SeaOperationRegisterMap';
import './seaOperationDocumentLibrary.css';

interface Props {
  client: SupabaseClient;
  accessKey: string;
  operationId?: string;
  record: SeaOperationRecord | null;
  maxSpeedKnots?: number | null;
  disabled?: boolean;
  canManageDocuments?: boolean;
  onSave: (draft: SeaOperationPayload, record: SeaOperationRecord) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}

/** Both panels stay mounted: switching to documents must preserve unsaved map edits. */
export function SeaOperationRegisterPane({ client, accessKey, operationId, record, maxSpeedKnots, disabled = false, canManageDocuments = false, onSave, onDirtyChange }: Props) {
  const id = useId();
  const selectedId = operationId ?? record?.id ?? '';
  const context = useMemo(() => ({ client, accessKey, selectedId }), [client, accessKey, selectedId]);
  const [view, setView] = useState<{ context: typeof context; tab: 'map' | 'documents' } | null>(null);
  const [catalogCount, setCatalogCount] = useState<{ context: typeof context; count: number | null } | null>(null);
  const tab = view?.context === context ? view.tab : 'map';
  const count = catalogCount?.context === context ? catalogCount.count : record?.draft.planning?.projectId ? null : 0;
  const setCount = useCallback((count: number | null) => setCatalogCount({ context, count }), [context]);
  const mapTab = useRef<HTMLButtonElement>(null); const documentsTab = useRef<HTMLButtonElement>(null);
  function choose(next: 'map' | 'documents', focus = false) { setView({ context, tab: next }); if (focus) (next === 'map' ? mapTab : documentsTab).current?.focus(); }
  return <div className="so-register-detail">
    <div className="so-register-detail-tabs" role="tablist" aria-label="Vue de l’opération" onKeyDown={event => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); choose(event.key === 'Home' ? 'map' : event.key === 'End' ? 'documents' : tab === 'map' ? 'documents' : 'map', true); }
    }}>
      <button type="button" role="tab" id={`${id}-map-tab`} aria-controls={`${id}-map`} aria-selected={tab === 'map'} tabIndex={tab === 'map' ? 0 : -1} ref={mapTab} onClick={() => choose('map')}><Map aria-hidden="true" size={17} />Carte</button>
      <button type="button" role="tab" id={`${id}-documents-tab`} aria-controls={`${id}-documents`} aria-selected={tab === 'documents'} tabIndex={tab === 'documents' ? 0 : -1} ref={documentsTab} onClick={() => choose('documents')}><FileText aria-hidden="true" size={17} />Documents<span className="so-register-document-count" aria-label={count === null ? 'Nombre de documents non disponible' : `${count} document${count > 1 ? 's' : ''}`}>{count ?? '…'}</span></button>
    </div>
    <div role="tabpanel" id={`${id}-map`} aria-labelledby={`${id}-map-tab`} hidden={tab !== 'map'}>
      <SeaOperationRegisterMap record={record} disabled={disabled} maxSpeedKnots={maxSpeedKnots} onSave={onSave} onDirtyChange={onDirtyChange} />
    </div>
    <div role="tabpanel" id={`${id}-documents`} aria-labelledby={`${id}-documents-tab`} hidden={tab !== 'documents'}>
      <SeaOperationProjectDocuments client={client} projectId={record?.draft.planning?.projectId || ''} accessKey={accessKey} disabled={disabled} canManage={canManageDocuments} onCountChange={setCount} showWithoutProject />
    </div>
  </div>;
}
