import { CheckCircle2, Download, ExternalLink, FolderOpen, Monitor } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { connectLocalDrive, DRIVE_MODULES, LOCAL_DRIVE_DOWNLOAD_VERSION, localDriveRequest, supportsLocalDriveVersion, type LocalDriveStatus } from '../documents/localDriveLauncher';

export function AdminGoogleDriveSetup({ client, previewMode = false }: { client: SupabaseClient; previewMode?: boolean }) {
  const [busy, setBusy] = useState(!previewMode);
  const [status, setStatus] = useState<LocalDriveStatus | null>(null);
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [cancelled, setCancelled] = useState(false);
  const request = useRef(0);
  const configure = useCallback(async (action: 'status' | 'select-root', fresh = false) => {
    if (previewMode) return;
    const current = ++request.current;
    setBusy(true); setError(''); setStatus(null); setCancelled(false); setInstalledVersion(null);
    try {
      const connection = await connectLocalDrive({ fresh });
      if (current !== request.current) return;
      setInstalledVersion(connection.version || null);
      if (!supportsLocalDriveVersion(connection.version, '2.7.0')) throw new Error('Installez le lanceur Windows 2.7 ou ultérieur depuis l’archive ci-dessus, puis relancez le lanceur. Votre dossier existant sera conservé.');
      const result = await localDriveRequest<LocalDriveStatus>(client, connection, { action });
      if (current !== request.current) return;
      if (result.cancelled) { setCancelled(true); return; }
      // The picker prepares the folder; confirm its availability automatically afterwards.
      const verified = action === 'select-root' ? await localDriveRequest<LocalDriveStatus>(client, await connectLocalDrive(), { action: 'status' }) : result;
      if (current !== request.current) return;
      if (!supportsLocalDriveVersion(verified.version, '2.7.0') || typeof verified.exists !== 'boolean') throw new Error('Le lanceur n’a pas confirmé la disponibilité du dossier SeaPilot.');
      setStatus({ ...verified, collaborators: result.collaborators ?? verified.collaborators });
    } catch (e) { if (current === request.current) setError(e instanceof Error ? e.message : 'Configuration impossible.'); }
    finally { if (current === request.current) setBusy(false); }
  }, [client, previewMode]);
  useEffect(() => {
    void configure('status', true);
    return () => { request.current += 1; };
  }, [configure]);
  const configured = Boolean(status?.exists && status.root);
  return <section className="admin-panel admin-drive-setup" aria-labelledby="admin-drive-title">
    <div className="admin-header"><div><p className="module-family">Documents et Google Drive</p><h2 id="admin-drive-title">Un seul dossier SeaPilot pour ce PC</h2><p className="admin-section-description">Configurez une fois la racine synchronisée. Tous les modules utilisent ensuite le même lanceur Windows.</p></div><span className="admin-platform-badge"><Monitor aria-hidden="true" size={16} />Windows</span></div>
    <ol className="admin-setup-steps">
      <li><div><h3>Connecter Google Drive</h3>
        <p>Installez Google Drive pour ordinateur et connectez le compte Google auquel le dossier SeaPilot a été partagé. Le partage ne suffit pas toujours à faire apparaître le dossier sur votre PC : chaque utilisateur doit ajouter un raccourci dans son Mon Drive.</p>
        <ol className="admin-drive-shared-steps">
          <li>Ouvrez <a href="https://drive.google.com" target="_blank" rel="noreferrer">Google Drive dans le navigateur</a> avec <strong>le compte destinataire du partage</strong>.</li>
          <li>Dans le menu à gauche, cliquez sur <strong>Partagés avec moi</strong> et repérez le dossier <strong>SeaPilot</strong>.</li>
          <li>Faites un clic droit sur le dossier, puis choisissez <strong>Organiser → Ajouter un raccourci</strong>.</li>
          <li>Sélectionnez <strong>Mon Drive</strong>, puis cliquez sur <strong>Ajouter</strong>.</li>
          <li>Dans l’Explorateur de fichiers Windows, ouvrez <strong>Google Drive → Mon Drive</strong> et attendez la synchronisation : le dossier SeaPilot ou son raccourci doit apparaître.</li>
        </ol>
        <p>Le raccourci donne accès au dossier original et à ses mises à jour, sans créer de copie.</p>
        <p><strong>Si le dossier n’apparaît toujours pas :</strong> s’il est absent de Partagés avec moi sur le Web, vérifiez l’adresse Google utilisée pour le partage et ouvrez le lien direct fourni par le propriétaire. S’il apparaît sur le Web mais pas sur le PC, vérifiez que Google Drive pour ordinateur utilise le même compte, puis redémarrez l’application.</p>
        <div className="admin-root-actions"><a className="admin-secondary-button" href="https://support.google.com/drive/answer/10838124?hl=fr" target="_blank" rel="noreferrer"><ExternalLink size={16} />Installer Google Drive</a><a className="admin-secondary-button" href="https://support.google.com/drive/answer/2375057?hl=fr" target="_blank" rel="noreferrer"><ExternalLink size={16} />Ajouter le dossier partagé à Mon Drive</a></div>
      </div></li>
      <li><div><h3>Installer le lanceur unique</h3><p>Extrayez l’archive puis exécutez <strong>Installer.cmd</strong> sur chaque PC. La version 2.7 accepte le dossier SeaPilot et les raccourcis Google Drive Windows (.lnk). Elle conserve toutes les fonctions de classement, d’ouverture et d’export PDF. Une mise à jour conserve le dossier déjà configuré.</p>
        <p>Version proposée au téléchargement : <strong>{LOCAL_DRIVE_DOWNLOAD_VERSION}</strong></p>
        <p role="status">Version installée sur ce PC : <strong>{installedVersion || (previewMode ? 'indisponible en préversion' : busy ? 'détection en cours…' : 'non détectée')}</strong></p>
        <div className="admin-root-actions"><a className="admin-primary-button" href={`/connectors/seapilot-drive-windows.zip?v=${LOCAL_DRIVE_DOWNLOAD_VERSION}`} download><Download size={16} />Installer le lanceur Windows</a><button className="admin-secondary-button" disabled={busy || previewMode} onClick={() => void configure('status', true)}>Vérifier la version installée</button></div>
      </div></li>
      <li><div><h3>{configured ? 'Google Drive est bien configuré' : busy ? 'Vérification automatique de Google Drive…' : 'Sélectionner le dossier SeaPilot'}</h3>
        {configured ? <div role="status"><p><CheckCircle2 size={18} aria-hidden="true" /> Le dossier SeaPilot est accessible sur ce PC.</p><p className="admin-drive-path">{status?.root}</p>{status?.collaborators !== undefined ? <p>{status.collaborators} dossier(s) de collaborateurs en poste préparé(s).</p> : null}</div> : <>
          <p>SeaPilot recherche automatiquement <strong>G:\Mon Drive\SeaPilot</strong> ou votre dossier déjà configuré. S’il est introuvable, sélectionnez le dossier SeaPilot ou son raccourci <strong>SeaPilot.lnk</strong> dans la fenêtre Windows. La lettre du lecteur et le nom Mon Drive / My Drive peuvent varier selon le PC.</p>
          {status && !status.exists ? <p role="status">Le dossier SeaPilot est introuvable ou inaccessible sur ce PC.</p> : null}
          {cancelled ? <p role="status">Sélection annulée. Aucun réglage n’a été modifié.</p> : null}
          <div className="admin-root-actions">{error ? <button className="admin-secondary-button" disabled={busy || previewMode} onClick={() => void configure('status', true)}>Relancer le lanceur</button> : <button className="admin-primary-button" disabled={busy || previewMode} onClick={() => void configure('select-root')}><FolderOpen size={16} />Sélectionner le dossier dans Windows</button>}</div>
          <p>Le dossier choisi est enregistré et vérifié automatiquement.</p>
        </>}
        {!configured ? <p>À la première utilisation, autorisez l’ouverture du lanceur et la connexion locale demandée par le navigateur.</p> : null}
      </div></li>
    </ol>
    {previewMode ? <p className="admin-section-description">Préversion : la configuration du PC est désactivée.</p> : null}
    {busy ? <p role="status">Connexion au lanceur SeaPilot…</p> : null}
    {error ? <p role="alert" className="admin-root-error">{error}</p> : null}
    <div className="admin-drive-usage"><h3>Classement automatique</h3><ul>{Object.entries(DRIVE_MODULES).map(([key, folder]) => <li key={key}><strong>{folder}</strong> : {key === 'disciplinary' ? 'un dossier par collaborateur, puis un sous-dossier par date.' : key === 'chemicals' ? 'un dossier par navire et par produit pour les FDS et pièces jointes.' : key === 'procedurePdfs' ? 'les PDF publiés, accessibles en lecture seule aux Capitaines et Marins.' : key === 'humanResources' ? 'un dossier par collaborateur pour les pièces RH.' : key === 'projects' ? 'un dossier par numéro et nom de projet, puis par catégorie de documents.' : 'les fichiers de travail des procédures.'}</li>)}</ul><p>Ces dossiers sont créés automatiquement à l’installation ou à la configuration. Enregistrez dans Word ou Excel puis laissez Google Drive terminer sa synchronisation.</p><p>Réservez Procedures et Sanctions Disciplinaires aux profils Administration et Direction. Partagez Procedures PDF en lecture seule avec les profils de consultation. Les autorisations Google Drive s’appliquent également en dehors de SeaPilot.</p></div>
  </section>;
}
