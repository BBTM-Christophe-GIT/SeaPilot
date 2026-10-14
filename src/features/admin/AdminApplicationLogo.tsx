import type { SupabaseClient } from '@supabase/supabase-js';
import { RotateCcw, Save } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  applicationLogoUrl,
  DEFAULT_APPLICATION_LOGO,
  fetchApplicationBranding,
  MAX_APPLICATION_LOGO_BYTES,
  prepareApplicationLogoFile,
  resetApplicationLogo,
  saveApplicationLogo,
  type ApplicationBranding,
} from '../branding/applicationLogo';
import { useApplicationLogo } from '../branding/ApplicationLogoProvider';
import './adminApplicationLogo.css';

interface AdminApplicationLogoProps {
  client: SupabaseClient;
  previewMode?: boolean;
}

interface LogoPreview {
  file: File;
  url: string;
}

type LogoOperation = 'save' | 'reset';
type LogoErrorKind = 'load' | 'file' | LogoOperation;

const PREVIEW_BRANDING: ApplicationBranding = {
  logoPath: null, revision: 0, canManage: true, updatedAt: null,
};

export function AdminApplicationLogo({ client, previewMode = false }: AdminApplicationLogoProps) {
  const { logoUrl, isCustom, applyBranding, setPreviewLogo } = useApplicationLogo();
  const [branding, setBranding] = useState<ApplicationBranding | null>(previewMode ? PREVIEW_BRANDING : null);
  const [candidate, setCandidate] = useState<LogoPreview | null>(null);
  const [savedPreview, setSavedPreview] = useState<LogoPreview | null>(null);
  const [loading, setLoading] = useState(!previewMode);
  const [validating, setValidating] = useState(false);
  const [operation, setOperation] = useState<LogoOperation | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<{ kind: LogoErrorKind; message: string } | null>(null);
  const [message, setMessage] = useState('');
  const mounted = useRef(false);
  const session = useRef(0);
  const validationSequence = useRef(0);
  const mutationInProgress = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mounted.current = true;
    session.current += 1;
    return () => {
      mounted.current = false;
      session.current += 1;
      validationSequence.current += 1;
    };
  }, [client, previewMode]);

  useEffect(() => {
    let active = true;
    setError(null);
    setMessage('');
    if (previewMode) {
      setBranding(PREVIEW_BRANDING);
      setLoading(false);
      return;
    }

    setLoading(true);
    void fetchApplicationBranding(client).then((loaded) => {
      if (!active) return;
      setBranding(loaded);
      applyBranding(loaded);
    }).catch((cause: unknown) => {
      if (!active) return;
      setBranding(null);
      setError({ kind: 'load', message: cause instanceof Error ? cause.message : 'Impossible de charger le logo de l’application. Réessayez.' });
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [client, previewMode, reloadKey, applyBranding]);

  useEffect(() => {
    const url = candidate?.url;
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [candidate?.url]);

  useEffect(() => {
    const url = savedPreview?.url;
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [savedPreview?.url]);

  const canManage = branding?.canManage === true;
  const currentUrl = previewMode
    ? savedPreview?.url ?? logoUrl
    : branding ? applicationLogoUrl(client, branding) : DEFAULT_APPLICATION_LOGO;
  const customLogo = previewMode ? savedPreview !== null || isCustom : branding?.logoPath != null;
  const disabled = loading || !canManage || operation !== null;

  function operationIsCurrent(startedSession: number) {
    return mounted.current && session.current === startedSession;
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || disabled || mutationInProgress.current) return;

    const sequence = ++validationSequence.current;
    const startedSession = session.current;
    setValidating(true);
    setError(null);
    setMessage('');
    try {
      const prepared = await prepareApplicationLogoFile(file);
      if (!operationIsCurrent(startedSession) || sequence !== validationSequence.current) return;
      setCandidate({ file: prepared, url: URL.createObjectURL(prepared) });
    } catch (cause) {
      if (!operationIsCurrent(startedSession) || sequence !== validationSequence.current) return;
      setError({ kind: 'file', message: cause instanceof Error ? cause.message : 'Ce fichier ne peut pas être utilisé comme logo.' });
    } finally {
      if (operationIsCurrent(startedSession) && sequence === validationSequence.current) setValidating(false);
    }
  }

  function cancelCandidate() {
    if (mutationInProgress.current) return;
    validationSequence.current += 1;
    setValidating(false);
    setCandidate(null);
    setError(null);
    setMessage('');
    if (fileInput.current) fileInput.current.value = '';
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!candidate || !branding || disabled || validating || mutationInProgress.current) return;
    const startedSession = session.current;
    mutationInProgress.current = true;
    setOperation('save');
    setError(null);
    setMessage('');
    try {
      if (previewMode) {
        setPreviewLogo(candidate.file);
        setSavedPreview({ file: candidate.file, url: URL.createObjectURL(candidate.file) });
      } else {
        const saved = await saveApplicationLogo(client, candidate.file, branding.revision);
        if (!operationIsCurrent(startedSession)) return;
        setBranding(saved);
        applyBranding(saved);
      }
      if (!operationIsCurrent(startedSession)) return;
      setCandidate(null);
      setMessage(previewMode ? 'Logo appliqué à cette démonstration uniquement.' : 'Logo enregistré. Il est maintenant affiché dans l’application.');
    } catch (cause) {
      if (operationIsCurrent(startedSession)) setError({ kind: 'save', message: cause instanceof Error ? cause.message : 'Impossible d’enregistrer le logo. Votre fichier est conservé pour réessayer.' });
    } finally {
      if (operationIsCurrent(startedSession)) {
        mutationInProgress.current = false;
        setOperation(null);
      }
    }
  }

  async function restoreDefault() {
    if (!branding || !customLogo || disabled || validating || mutationInProgress.current) return;
    const startedSession = session.current;
    mutationInProgress.current = true;
    setOperation('reset');
    setError(null);
    setMessage('');
    try {
      if (previewMode) {
        setPreviewLogo(null);
        setSavedPreview(null);
      } else {
        const saved = await resetApplicationLogo(client, branding.revision);
        if (!operationIsCurrent(startedSession)) return;
        setBranding(saved);
        applyBranding(saved);
      }
      if (!operationIsCurrent(startedSession)) return;
      setCandidate(null);
      setMessage(previewMode ? 'Logo par défaut rétabli dans cette démonstration uniquement.' : 'Logo SeaPilot par défaut rétabli.');
    } catch (cause) {
      if (operationIsCurrent(startedSession)) setError({ kind: 'reset', message: cause instanceof Error ? cause.message : 'Impossible de rétablir le logo par défaut. Réessayez.' });
    } finally {
      if (operationIsCurrent(startedSession)) {
        mutationInProgress.current = false;
        setOperation(null);
      }
    }
  }

  return (
    <form className="admin-panel sp-panel admin-application-logo" onSubmit={save} aria-labelledby="application-logo-title" aria-busy={loading || validating || operation !== null}>
      <header>
        <h2 id="application-logo-title">Logo de l’application</h2>
        <p>Choisissez le logo affiché dans SeaPilot pour tous les utilisateurs. Un format horizontal est recommandé.</p>
      </header>
      {previewMode ? <p className="admin-application-logo-demo">Mode démonstration : les changements restent dans cette prévisualisation et ne sont pas publiés.</p> : null}
      {loading ? <p role="status">Chargement du logo…</p> : null}
      {!loading && branding && !canManage ? <p>La modification du logo est réservée aux administrateurs autorisés.</p> : null}

      <div className="admin-application-logo-previews">
        <figure>
          <figcaption>Logo actuel{customLogo ? ' personnalisé' : ' par défaut'}</figcaption>
          <div className="admin-application-logo-image"><img src={currentUrl} alt="Logo actuel de l’application" /></div>
        </figure>
        {candidate ? <figure>
          <figcaption>Nouveau logo, avant enregistrement</figcaption>
          <div className="admin-application-logo-image"><img src={candidate.url} alt="Aperçu du nouveau logo" /></div>
          <p className="admin-application-logo-filename">{candidate.file.name}</p>
        </figure> : null}
      </div>

      <fieldset disabled={disabled}>
        <div className="admin-application-logo-file">
          <label htmlFor="application-logo-file">Choisir un nouveau logo</label>
          <input ref={fileInput} id="application-logo-file" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="application-logo-help" onChange={(event) => void selectFile(event)} />
          <p id="application-logo-help">PNG, JPEG ou WebP, {MAX_APPLICATION_LOGO_BYTES / (1024 * 1024)} Mo maximum. Vérifiez l’aperçu puis enregistrez pour appliquer le logo.</p>
        </div>
        {validating ? <p role="status">Vérification du fichier…</p> : null}
        <div className="admin-application-logo-actions">
          <button className="sp-button sp-button--primary" type="submit" disabled={!candidate || validating}>
            <Save aria-hidden="true" size={18} />{operation === 'save' ? 'Enregistrement…' : 'Enregistrer le logo'}
          </button>
          {candidate || validating ? <button className="sp-button sp-button--secondary" type="button" onClick={cancelCandidate}>Annuler la sélection</button> : null}
          <button className="sp-button sp-button--secondary" type="button" disabled={!customLogo || validating} onClick={() => void restoreDefault()}>
            <RotateCcw aria-hidden="true" size={18} />{operation === 'reset' ? 'Restauration…' : 'Rétablir le logo par défaut'}
          </button>
        </div>
      </fieldset>

      {error ? <div className="admin-application-logo-feedback">
        <p className="form-error" role="alert">{error.message}</p>
        {error.kind === 'save' ? <p>Le fichier sélectionné est conservé. Vous pouvez réessayer de l’enregistrer.</p> : null}
        {!previewMode && error.kind !== 'file' ? <button className="sp-button sp-button--secondary" type="button" disabled={operation !== null || validating} onClick={() => setReloadKey((key) => key + 1)}>{error.kind === 'load' ? 'Réessayer le chargement' : 'Actualiser les paramètres'}</button> : null}
      </div> : null}
      {message ? <p className="admin-success" role="status">{message}</p> : null}
    </form>
  );
}
