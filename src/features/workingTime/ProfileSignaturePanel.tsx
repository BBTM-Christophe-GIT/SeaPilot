import type { SupabaseClient } from '@supabase/supabase-js';
import { CheckCircle2, Eraser, FileSignature, PenLine, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { PersonRecord } from '../humanResources/peopleQueries';
import {
  createWorkingTimeSignatureUrl,
  fetchWorkingTimeProfileSignatures,
  uploadWorkingTimeProfileSignature,
  type WorkingTimeProfileSignature,
} from './workingTimeSignatureQueries';

interface ProfileSignaturePanelProps {
  canManage: boolean;
  client: SupabaseClient;
  person: PersonRecord;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function canvasPoint(canvas: HTMLCanvasElement, event: ReactPointerEvent<HTMLCanvasElement>) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
    y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
  };
}

function clearCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = 4;
  context.strokeStyle = '#102f46';
}

function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Impossible de produire le PNG de signature.')), 'image/png');
  });
}

export function ProfileSignaturePanel(props: ProfileSignaturePanelProps) {
  // A pending image/drawing belongs to one RH person and cannot follow selection.
  return <ProfileSignatureWorkspace key={`${props.person.id}:${props.canManage}`} {...props} />;
}

function ProfileSignatureWorkspace({ canManage, client, person }: ProfileSignaturePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [signatures, setSignatures] = useState<WorkingTimeProfileSignature[]>([]);
  const [loadedClient, setLoadedClient] = useState(client);
  const [activeUrl, setActiveUrl] = useState('');
  const [mode, setMode] = useState<'upload' | 'draw'>('upload');
  const [pendingPng, setPendingPng] = useState<Blob | null>(null);
  const [pendingUrl, setPendingUrl] = useState('');
  const [hasDrawing, setHasDrawing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const visibleSignatures = loadedClient === client ? signatures : [];
  const activeSignature = visibleSignatures.find((signature) => signature.validTo === null);
  const loadId = useRef(0);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  const activeClientRef = useRef(client);
  activeClientRef.current = client;
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => {
    savingRef.current = false; setIsSaving(false); setPendingPng(null); setPendingUrl('');
    setHasDrawing(false); setMessage(''); setErrorMessage('');
  }, [client]);

  const reload = useCallback(async () => {
    const currentLoad = ++loadId.current;
    setIsLoading(true);
    setErrorMessage('');
    try {
      const loaded = await fetchWorkingTimeProfileSignatures(client, person.id);
      if (loadId.current !== currentLoad) return;
      const current = loaded.find((signature) => signature.validTo === null);
      const url = current ? await createWorkingTimeSignatureUrl(client, current) : '';
      if (loadId.current !== currentLoad) return;
      setSignatures(loaded); setActiveUrl(url); setLoadedClient(client);
    } catch (error) {
      if (loadId.current === currentLoad) { setSignatures([]); setActiveUrl(''); setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger la signature.'); }
    } finally {
      if (loadId.current === currentLoad) setIsLoading(false);
    }
  }, [client, person.id]);

  useEffect(() => {
    void reload();
    return () => { loadId.current += 1; };
  }, [reload]);

  useEffect(() => {
    if (mode === 'draw') clearCanvas(canvasRef.current);
  }, [mode, person.id]);

  useEffect(() => () => {
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
  }, [pendingUrl]);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setErrorMessage('');
    setMessage('');
    if (!file) return;
    if (file.type !== 'image/png') {
      setPendingPng(null);
      setErrorMessage('Sélectionnez un fichier PNG.');
      return;
    }
    if (file.size > 1_048_576) {
      setPendingPng(null);
      setErrorMessage('La signature PNG doit peser moins de 1 Mo.');
      return;
    }
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    setPendingPng(file);
    setPendingUrl(URL.createObjectURL(file));
  }

  function beginDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    canvas.setPointerCapture(event.pointerId);
    const point = canvasPoint(canvas, event);
    context.beginPath();
    context.moveTo(point.x, point.y);
    drawingRef.current = true;
    setHasDrawing(true);
  }

  function continueDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !drawingRef.current) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const point = canvasPoint(canvas, event);
    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function stopDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId);
  }

  async function saveSignature() {
    if (savingRef.current || !canManage) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      const png = mode === 'upload' ? pendingPng : canvasRef.current && hasDrawing ? await canvasPng(canvasRef.current) : null;
      if (!mountedRef.current || activeClientRef.current !== client) return;
      if (!png) {
        setErrorMessage(mode === 'upload' ? 'Sélectionnez un fichier PNG.' : 'Dessinez la signature avant de l’enregistrer.');
        return;
      }
      setErrorMessage('');
      setMessage('');
      await uploadWorkingTimeProfileSignature(client, person.id, png);
      if (!mountedRef.current || activeClientRef.current !== client) return;
      setPendingPng(null);
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      setPendingUrl('');
      setHasDrawing(false);
      clearCanvas(canvasRef.current);
      await reload();
      if (!mountedRef.current || activeClientRef.current !== client) return;
      setMessage('Nouvelle version PNG enregistrée. Elle ne sera apposée que lors d’une action explicite de signature ou validation.');
    } catch (error) {
      if (!mountedRef.current || activeClientRef.current !== client) return;
      const message = error instanceof Error ? error.message : 'Impossible d’enregistrer la signature.';
      await reload();
      if (!mountedRef.current || activeClientRef.current !== client) return;
      setErrorMessage(message);
    } finally {
      if (mountedRef.current && activeClientRef.current === client) { savingRef.current = false; setIsSaving(false); }
    }
  }

  return (
    <section className="hr-signature-panel">
      <header>
        <div><span>Signature numérisée</span><h3>Signature du profil utilisateur</h3></div>
        {activeSignature ? <strong><CheckCircle2 aria-hidden="true" size={17} />Version {activeSignature.versionNumber} active</strong> : <em>Aucune signature active</em>}
      </header>

      {isLoading ? <p>Chargement de la signature…</p> : null}
      {!isLoading && activeSignature ? (
        <div className="hr-signature-current">
          {activeUrl ? <img alt={`Signature active de ${person.firstName} ${person.lastName}`} src={activeUrl} /> : null}
          <div>
            <strong>PNG privé · version {activeSignature.versionNumber}</strong>
            <span>Créée le {formatDateTime(activeSignature.createdAt)}</span>
            <code title={activeSignature.sha256}>SHA-256 {activeSignature.sha256.slice(0, 16)}…</code>
          </div>
        </div>
      ) : null}

      {canManage ? (
        <div className="hr-signature-editor">
          <div className="hr-signature-mode" role="group" aria-label="Mode de création de signature">
            <button className={mode === 'upload' ? 'is-active' : ''} onClick={() => setMode('upload')} type="button"><Upload aria-hidden="true" size={16} />Importer un PNG</button>
            <button className={mode === 'draw' ? 'is-active' : ''} onClick={() => setMode('draw')} type="button"><PenLine aria-hidden="true" size={16} />Dessiner</button>
          </div>
          {mode === 'upload' ? (
            <label className="hr-signature-file">
              Fichier PNG, 1 Mo maximum
              <input accept="image/png,.png" disabled={isSaving} onChange={handleFile} type="file" />
              {pendingUrl ? <img alt="Aperçu de la nouvelle signature" src={pendingUrl} /> : null}
            </label>
          ) : (
            <div className="hr-signature-drawing">
              <canvas
                aria-label="Zone de dessin de la signature"
                height={220}
                onPointerDown={beginDrawing}
                onPointerMove={continueDrawing}
                onPointerUp={stopDrawing}
                onPointerCancel={stopDrawing}
                ref={canvasRef}
                width={720}
              />
              <button onClick={() => { clearCanvas(canvasRef.current); setHasDrawing(false); }} type="button"><Eraser aria-hidden="true" size={16} />Effacer</button>
            </div>
          )}
          <button className="hr-primary-button" disabled={isSaving || (mode === 'upload' ? !pendingPng : !hasDrawing)} onClick={() => void saveSignature()} type="button">
            <FileSignature aria-hidden="true" size={17} />{isSaving ? 'Enregistrement…' : 'Enregistrer une nouvelle version'}
          </button>
          <p className="hr-signature-consent-note">Cette opération crée une version de profil. Elle ne signe aucun registre automatiquement.</p>
        </div>
      ) : <p className="hr-signature-consent-note">Vous pouvez consulter cette signature, mais votre profil ne permet pas de la remplacer.</p>}

      {message ? <p className="working-time-message is-success" role="status">{message}</p> : null}
      {errorMessage ? <p className="working-time-message is-error" role="alert">{errorMessage}</p> : null}

      {visibleSignatures.length > 1 ? (
        <details className="hr-signature-history">
          <summary>{visibleSignatures.length} versions conservées</summary>
          <ul>{visibleSignatures.map((signature) => <li key={signature.id}><strong>v{signature.versionNumber}</strong><span>{formatDateTime(signature.createdAt)}</span><code>{signature.sha256.slice(0, 12)}…</code><em>{signature.validTo ? 'Historique' : 'Active'}</em></li>)}</ul>
        </details>
      ) : null}
    </section>
  );
}
