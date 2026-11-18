import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type Ref } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GripVertical, Ellipsis } from 'lucide-react';
import type { AppContextMenuPosition } from '../../components/AppContextMenu';
import { OrgPersonCardMenu, OrgTemporaryFunctionDialog } from './OrgPersonCardActions';
import type { OrgCardColor } from './organigrammeCardColors';
import type { OrgBounds, OrgBox, OrgCrewCard, OrgDiagram } from './organigrammeDiagram';
import { orgLocalDate, type OrgData } from './organigrammeModel';
import { saveOrgCardColor, saveOrgTemporaryFunction } from './organigrammeQueries';
import { moveOrgWatchMember, orgCanReceiveMember, orgDestinationLabel, orgTransferFleet, type OrgWatchDestination } from './organigrammeTransfers';
import { useOrgCanvasPan } from './useOrgCanvasPan';
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

type CardPerson = NonNullable<OrgBox['person']>;

function position(bounds: OrgBounds, diagram: OrgDiagram) {
  return {
    left: bounds.x / diagram.width * 100 + '%',
    top: bounds.y / diagram.height * 100 + '%',
    width: bounds.width / diagram.width * 100 + '%',
    height: bounds.height / diagram.height * 100 + '%',
  };
}

export function OrgDiagramCanvas({ canvasRef, diagram, imageSrc, imageAlt, zoom, client, data, disabled, onSaved }: Props) {
  const canvasPan = useOrgCanvasPan();
  const { destinations, byWatch, byVessel } = useMemo(() => {
    const fleet = orgTransferFleet(data);
    const allDestinations = fleet.flatMap((vessel) => vessel.destinations);
    return {
      destinations: allDestinations,
      byWatch: new Map(allDestinations.map((destination) => [destination.watchId, destination])),
      byVessel: new Map(fleet.map((vessel) => [vessel.id, vessel.destinations])),
    };
  }, [data]);
  const [dragging, setDragging] = useState<OrgCrewCard | null>(null);
  const [selection, setSelection] = useState<{ member: OrgCrewCard; vesselId?: number } | null>(null);
  const [destinationKey, setDestinationKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [savingColor, setSavingColor] = useState(false);
  const [cardMenu, setCardMenu] = useState<{ person: CardPerson; position: AppContextMenuPosition } | null>(null);
  const [temporaryEditor, setTemporaryEditor] = useState<CardPerson | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const sourceButton = useRef<HTMLButtonElement | null>(null);
  const cardActionTrigger = useRef<HTMLButtonElement | null>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const hoveredTarget = useRef<HTMLElement | null>(null);
  const focusResult = useRef(false);
  const current = data.asOf === orgLocalDate();
  const editable = current && destinations.length > 0;
  const locked = disabled || busy || savingColor;
  const cards = useMemo(() => current ? diagram.boxes.flatMap((box) => {
    const crew = box.crew;
    const member = crew && destinations.some((item) => orgCanReceiveMember(item, crew.personId, crew.watchId)) ? crew : undefined;
    return member || box.person ? [{ box, member }] : [];
  }) : [], [destinations, diagram.boxes, current]);
  const selectionOptions = useMemo(() => {
    if (!selection) return [];
    const choices = selection.vesselId === undefined ? destinations : byVessel.get(selection.vesselId) ?? [];
    return choices.filter((item) => orgCanReceiveMember(item, selection.member.personId, selection.member.watchId));
  }, [byVessel, destinations, selection]);
  useEffect(() => { if (selection) selectRef.current?.focus(); }, [selection]);
  useEffect(() => {
    if (status && focusResult.current) {
      focusResult.current = false;
      statusRef.current?.focus({ preventScroll: true });
    }
  }, [status]);

  const closeCardMenu = useCallback(() => {
    setCardMenu(null);
    cardActionTrigger.current?.focus({ preventScroll: true });
  }, []);

  function openCardMenu(person: CardPerson, trigger: HTMLButtonElement, position?: AppContextMenuPosition) {
    if (locked || dragging) return;
    cardActionTrigger.current = trigger;
    const bounds = trigger.getBoundingClientRect();
    setCardMenu({ person, position: position ?? { x: bounds.left, y: bounds.bottom } });
  }

  async function recolor(color: OrgCardColor | null) {
    if (!cardMenu || locked) return;
    const { person } = cardMenu;
    closeCardMenu();
    if ((data.cardColors?.[person.id] ?? null) === color) return;
    setSavingColor(true);
    setError('');
    setStatus('');
    try {
      await saveOrgCardColor(client, data.chartId, person.id, color);
      setStatus(color === null ? 'Couleur par défaut rétablie pour ' + person.name + '.' : 'Couleur enregistrée pour ' + person.name + '.');
      focusResult.current = true;
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.');
    } finally {
      setSavingColor(false);
    }
  }

  async function updateTemporaryFunction(label: string | null) {
    if (!temporaryEditor) return;
    await saveOrgTemporaryFunction(client, data.chartId, temporaryEditor.id, label);
    setTemporaryEditor(null);
    setStatus(label === null ? 'Fonction temporaire retirée pour ' + temporaryEditor.name + '.' : 'Fonction temporaire enregistrée pour ' + temporaryEditor.name + '.');
    focusResult.current = true;
    onSaved();
  }

  function highlightTarget(target: HTMLElement | null) {
    if (hoveredTarget.current === target) return;
    hoveredTarget.current?.removeAttribute('data-drop-active');
    if (target) target.dataset.dropActive = 'true';
    hoveredTarget.current = target;
  }

  function finishDrag() {
    highlightTarget(null);
    setDragging(null);
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

  function dropHandlers(choices: OrgWatchDestination[]) {
    const available = dragging ? choices.filter((item) => orgCanReceiveMember(item, dragging.personId, dragging.watchId)) : [];
    const ready = editable && !locked && available.length > 0;
    return {
      'data-drop-ready': ready,
      onDragOver(event: DragEvent<HTMLElement>) {
        if (!ready) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        highlightTarget(event.currentTarget);
      },
      onDragLeave(event: DragEvent<HTMLElement>) {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        if (hoveredTarget.current === event.currentTarget) highlightTarget(null);
      },
      onDrop(event: DragEvent<HTMLElement>) {
        if (!ready || !dragging) return;
        event.preventDefault();
        finishDrag();
        if (available.length === 1) void move(dragging, available[0]);
        else chooseDestination(dragging, available[0].vesselId);
      },
    };
  }

  return <div className="org-diagram-workspace">
    {!!cards.length && <p className="org-diagram-help">
      {cards.some(({ member }) => member) && 'Glissez une carte vers une autre bordée ou sélectionnez-la pour choisir sa destination. '}
      Un clic droit sur une carte permet de modifier sa couleur ou sa fonction temporaire.
    </p>}
    {error && <p role="alert" className="org-error org-diagram-message">{error}</p>}
    <p role="status" ref={statusRef} tabIndex={-1} className="org-diagram-message">{busy ? 'Déplacement en cours…' : savingColor ? 'Enregistrement de la couleur…' : status}</p>
    <div className="org-diagram-stage">
      <div className="org-canvas" ref={canvasRef} tabIndex={0} aria-label="Diagramme défilant" {...canvasPan}>
        <div className="org-diagram-scene" style={{ width: zoom === 0 ? '100%' : diagram.width * zoom / 100 }}>
          <img src={imageSrc} width={diagram.width} height={diagram.height} draggable={false} alt={imageAlt} />
          {cards.map(({ box, member }) => {
            const person = box.person;
            const selected = Boolean(member && selection?.member.personId === member.personId && selection.member.watchId === member.watchId);
            return <button
              key={box.x + ':' + box.y}
              type="button" className="org-diagram-card" style={position(box, diagram)}
              aria-label={member ? 'Déplacer ' + member.name : 'Couleur et fonction de ' + person?.name}
              aria-haspopup={member ? undefined : 'menu'}
              aria-expanded={member ? selected : cardMenu?.person.id === person?.id}
              draggable={Boolean(member) && !locked} disabled={locked}
              onClick={(event) => {
                if (!member) {
                  if (person) openCardMenu(person, event.currentTarget);
                  return;
                }
                sourceButton.current = event.currentTarget;
                if (selected) cancelSelection();
                else chooseDestination(member);
              }}
              onContextMenu={(event) => {
                if (!person || locked || dragging) return;
                event.preventDefault();
                openCardMenu(person, event.currentTarget, { x: event.clientX, y: event.clientY });
              }}
              onKeyDown={(event) => {
                if (!person || locked || (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10'))) return;
                event.preventDefault();
                openCardMenu(person, event.currentTarget);
              }}
              onDragStart={(event) => {
                if (!member || locked) { event.preventDefault(); return; }
                setCardMenu(null);
                sourceButton.current = event.currentTarget;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('application/x-seapilot-watch-member', String(member.personId));
                setSelection(null);
                setDragging(member);
              }}
              onDragEnd={finishDrag}
            >{member ? <GripVertical aria-hidden="true" size={14} /> : <Ellipsis aria-hidden="true" size={14} />}</button>;
          })}
          {editable && (diagram.watches ?? []).map((watch) => {
            const destination = byWatch.get(watch.watchId);
            return destination && <div key={watch.watchId} className="org-diagram-drop" style={position(watch, diagram)}
              data-org-watch-id={watch.watchId} aria-hidden="true" {...dropHandlers([destination])} />;
          })}
          {editable && diagram.boxes.map((box) => {
            if (box.vesselId === undefined) return null;
            const choices = byVessel.get(box.vesselId);
            return choices && <div key={box.vesselId} className="org-diagram-drop" style={position(box, diagram)}
              data-org-vessel-id={box.vesselId} aria-hidden="true" {...dropHandlers(choices)} />;
          })}
        </div>
      </div>
      {dragging && !locked && <div className="org-diagram-drop-dock" aria-hidden="true">
        {destinations.filter((item) => orgCanReceiveMember(item, dragging.personId, dragging.watchId)).map((destination) => (
          <span key={destination.key} data-org-destination={destination.key} {...dropHandlers([destination])}>
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
          <button type="button" className="sp-button sp-button--secondary" aria-haspopup="menu" disabled={locked}
            onClick={(event) => openCardMenu({ id: selection.member.personId, name: selection.member.name }, event.currentTarget)}
          >Couleur et fonction</button>
          <button type="button" className="sp-button sp-button--secondary" disabled={locked} onClick={cancelSelection}>Annuler</button>
        </div>
      </form>}
    </div>
    {cardMenu && <OrgPersonCardMenu
      name={cardMenu.person.name}
      color={data.cardColors?.[cardMenu.person.id] ?? null}
      position={cardMenu.position}
      onClose={closeCardMenu}
      onSelectColor={(color) => void recolor(color)}
      onEditFunction={() => { setTemporaryEditor(cardMenu.person); closeCardMenu(); }}
    />}
    {temporaryEditor && <OrgTemporaryFunctionDialog
      name={temporaryEditor.name}
      initialValue={data.temporaryFunctions?.[temporaryEditor.id] ?? ''}
      onSave={updateTemporaryFunction}
      onClose={() => { setTemporaryEditor(null); cardActionTrigger.current?.focus({ preventScroll: true }); }}
    />}
  </div>;
}
