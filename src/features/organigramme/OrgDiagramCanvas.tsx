import { useEffect, useMemo, useRef, useState, type DragEvent, type Ref } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GripVertical } from 'lucide-react';
import type { OrgBounds, OrgCrewCard, OrgDiagram } from './organigrammeDiagram';
import { orgLocalDate, type OrgData } from './organigrammeModel';
import { moveOrgWatchMember, orgCanReceiveMember, orgDestinationLabel, orgTransferFleet, type OrgWatchDestination } from './organigrammeTransfers';
import './orgDiagramCanvas.css';

interface Props {
  canvasRef: Ref<HTMLDivElement>;
  diagram: OrgDiagram;
  imageSrc: string;
  imageAlt: string;
  zoom: number;
  client: SupabaseClient;
  data: OrgData;
  disabled: boolean;
  onSaved: () => void;
}

function position(bounds: OrgBounds, diagram: OrgDiagram) {
  return {
    left: bounds.x / diagram.width * 100 + '%',
    top: bounds.y / diagram.height * 100 + '%',
    width: bounds.width / diagram.width * 100 + '%',
    height: bounds.height / diagram.height * 100 + '%',
  };
}

export function OrgDiagramCanvas({ canvasRef, diagram, imageSrc, imageAlt, zoom, client, data, disabled, onSaved }: Props) {
  const fleet = useMemo(() => orgTransferFleet(data), [data]);
  const destinations = fleet.flatMap((vessel) => vessel.destinations);
  const [dragging, setDragging] = useState<OrgCrewCard | null>(null);
  const [hovered, setHovered] = useState('');
  const [selection, setSelection] = useState<{ member: OrgCrewCard; vesselId?: number } | null>(null);
  const [destinationKey, setDestinationKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const sourceButton = useRef<HTMLButtonElement | null>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const focusResult = useRef(false);
  const editable = data.asOf === orgLocalDate() && destinations.length > 1;
  const locked = disabled || busy;
  const cards = editable ? diagram.boxes.flatMap((box) => {
    const member = box.crew;
    return member && destinations.some((item) => orgCanReceiveMember(item, member.personId, member.watchId)) ? [{ box, member }] : [];
  }) : [];
  const selectionOptions = selection ? destinations.filter((item) => orgCanReceiveMember(item, selection.member.personId, selection.member.watchId) &&
    (selection.vesselId === undefined || item.vesselId === selection.vesselId)) : [];
  useEffect(() => { if (selection) selectRef.current?.focus(); }, [selection]);
  useEffect(() => {
    if (status && focusResult.current) {
      focusResult.current = false;
      statusRef.current?.focus({ preventScroll: true });
    }
  }, [status]);

  function finishDrag() {
    setDragging(null);
    setHovered('');
  }

  function chooseDestination(member: OrgCrewCard, vesselId?: number) {
    setSelection({ member, vesselId });
    setDestinationKey('');
    setError('');
  }

  function cancelSelection() {
    setSelection(null);
    sourceButton.current?.focus();
  }

  async function move(member: OrgCrewCard, destination: OrgWatchDestination) {
    if (locked || !editable || !orgCanReceiveMember(destination, member.personId, member.watchId)) return;
    setBusy(true);
    setStatus('');
    setError('');
    try {
      await moveOrgWatchMember(client, data.chartId, member.personId, member.watchId, destination.vesselId, destination.watchId);
      setStatus(member.name + ' rejoint ' + orgDestinationLabel(destination) + '.');
      focusResult.current = Boolean(selection);
      setSelection(null);
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Déplacement impossible.');
    } finally {
      setBusy(false);
    }
  }

  function dropHandlers(key: string, choices: OrgWatchDestination[]) {
    const available = dragging ? choices.filter((item) => orgCanReceiveMember(item, dragging.personId, dragging.watchId)) : [];
    const ready = editable && !locked && available.length > 0;
    return {
      'data-drop-ready': ready,
      'data-drop-active': ready && hovered === key,
      onDragOver(event: DragEvent) {
        if (!ready) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        if (hovered !== key) setHovered(key);
      },
      onDragLeave(event: DragEvent) {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        setHovered((previous) => previous === key ? '' : previous);
      },
      onDrop(event: DragEvent) {
        if (!ready || !dragging) return;
        event.preventDefault();
        finishDrag();
        if (available.length === 1) void move(dragging, available[0]);
        else chooseDestination(dragging, available[0].vesselId);
      },
    };
  }

  return <div className="org-diagram-workspace">
    {!!cards.length && <p className="org-diagram-help">Glissez une carte vers une autre bordée ou sélectionnez-la pour choisir sa destination.</p>}
    {error && <p role="alert" className="org-error org-diagram-message">{error}</p>}
    <p role="status" ref={statusRef} tabIndex={-1} className="org-diagram-message">{busy ? 'Déplacement en cours…' : status}</p>
    <div className="org-diagram-stage">
      <div className="org-canvas" ref={canvasRef} tabIndex={0} aria-label="Diagramme défilant">
        <div className="org-diagram-scene" style={{ width: zoom === 0 ? '100%' : diagram.width * zoom / 100 }}>
          <img src={imageSrc} width={diagram.width} height={diagram.height} draggable={false} alt={imageAlt} />
          {cards.map(({ box, member }) => {
            const selected = selection?.member.personId === member.personId && selection.member.watchId === member.watchId;
            return <button
              key={member.watchId + ':' + member.personId}
              type="button" className="org-diagram-card" style={position(box, diagram)}
              aria-label={'Déplacer ' + member.name} aria-expanded={selected}
              draggable={!locked} disabled={locked}
              onClick={(event) => {
                sourceButton.current = event.currentTarget;
                if (selected) cancelSelection();
                else chooseDestination(member);
              }}
              onDragStart={(event) => {
                if (locked) { event.preventDefault(); return; }
                sourceButton.current = event.currentTarget;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('application/x-seapilot-watch-member', String(member.personId));
                setSelection(null);
                setDragging(member);
              }}
              onDragEnd={finishDrag}
            ><GripVertical aria-hidden="true" size={14} /></button>;
          })}
          {editable && (diagram.watches ?? []).map((watch) => {
            const destination = destinations.find((item) => item.watchId === watch.watchId);
            return destination && <div key={watch.watchId} className="org-diagram-drop" style={position(watch, diagram)}
              data-org-watch-id={watch.watchId} aria-hidden="true" {...dropHandlers(destination.key, [destination])} />;
          })}
          {editable && diagram.boxes.map((box) => {
            if (box.vesselId === undefined) return null;
            const vessel = fleet.find((item) => item.id === box.vesselId);
            return vessel && <div key={vessel.id} className="org-diagram-drop" style={position(box, diagram)}
              data-org-vessel-id={vessel.id} aria-hidden="true" {...dropHandlers('heading:' + vessel.id, vessel.destinations)} />;
          })}
        </div>
      </div>
      {dragging && !locked && <div className="org-diagram-drop-dock" aria-hidden="true">
        {destinations.filter((item) => orgCanReceiveMember(item, dragging.personId, dragging.watchId)).map((destination) => (
          <span key={destination.key} data-org-destination={destination.key} {...dropHandlers('dock:' + destination.key, [destination])}>
            {orgDestinationLabel(destination)}{destination.watchId === null ? ' (à créer)' : ''}
          </span>
        ))}
      </div>}
      {selection && <form className="org-diagram-destination-form" onSubmit={(event) => {
        event.preventDefault();
        const destination = selectionOptions.find((item) => item.key === destinationKey);
        if (destination) void move(selection.member, destination);
      }} onKeyDown={(event) => {
        if (event.key === 'Escape' && !locked) { event.preventDefault(); cancelSelection(); }
      }}>
        <strong>{selection.member.name}</strong>
        <label>Bordée de destination
          <select ref={selectRef} value={destinationKey} disabled={locked} onChange={(event) => setDestinationKey(event.target.value)}>
            <option value="">Choisir une bordée</option>
            {selectionOptions.map((destination) => <option key={destination.key} value={destination.key}>
              {orgDestinationLabel(destination)}{destination.watchId === null ? ' (à créer)' : ''}
            </option>)}
          </select>
        </label>
        <div className="org-diagram-form-actions">
          <button type="submit" className="sp-button sp-button--primary" disabled={locked || !destinationKey}>Déplacer</button>
          <button type="button" className="sp-button sp-button--secondary" disabled={locked} onClick={cancelSelection}>Annuler</button>
        </div>
      </form>}
    </div>
  </div>;
}
