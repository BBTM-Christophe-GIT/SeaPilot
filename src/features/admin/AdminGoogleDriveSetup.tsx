import { Download, ExternalLink, FolderSync, Monitor } from 'lucide-react';
import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { connectLocalDrive, DRIVE_MODULES, localDriveRequest, type LocalDriveStatus } from '../documents/localDriveLauncher';

export function AdminGoogleDriveSetup({ client, previewMode = false }: { client: SupabaseClient; previewMode?: boolean }) {
  const [root, setRoot] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<LocalDriveStatus | null>(null);
  const [error, setError] = useState('');
  async function configure(action: 'configure' | 'status') {
    if (previewMode) return;
    const connection = connectLocalDrive();
    setBusy(true); setError(''); setStatus(null);
    try {
      const result = await localDriveRequest<LocalDriveStatus>(client, await connection, { action, root: root.trim() });
      setStatus(result); setRoot(result.root || '');
    } catch (e) { setError(e instanceof Error ? e.message : 'Configuration impossible.'); }
    finally { setBusy(false); }
  }
  return <section className="admin-panel admin-drive-setup" aria-labelledby="admin-drive-title">
    <div className="admin-header"><div><p className="module-family">Documents et Google Drive</p><h2 id="admin-drive-title">Un seul dossier SeaPilot pour ce PC</h2><p className="admin-section-description">Configurez une fois la racine synchronisée. Tous les modules utilisent ensuite le même lanceur Windows.</p></div><span className="admin-platform-badge"><Monitor aria-hidden="true" size={16} />Windows</span></div>
    <ol className="admin-setup-steps">
      <li><div><h3>Connecter Google Drive</h3><p>Le dossier SeaPilot doit être disponible dans l’Explorateur de fichiers de ce PC.</p><a className="admin-secondary-button" href="https://support.google.com/drive/answer/10838124?hl=fr" target="_blank" rel="noreferrer"><ExternalLink size={16} />Installer Google Drive</a></div></li>
      <li><div><h3>Installer le lanceur unique</h3><p>Extrayez l’archive puis exécutez <strong>Installer.cmd</strong> sur chaque PC. La version 2.3 crée les dossiers des modules, ouvre les nouvelles procédures et convertit les documents Office en PDF. Une mise à jour conserve le dossier déjà configuré.</p><a className="admin-primary-button" href="/connectors/seapilot-drive-windows.zip?v=2.3.0" download><Download size={16} />Installer le lanceur Windows</a></div></li>
      <li><div><h3>Renseigner uniquement la racine SeaPilot</h3><p>Le chemin est mémorisé sur ce PC. Les sous-dossiers des modules et des collaborateurs sont déduits automatiquement.</p>
        <label className="admin-root-label">Chemin du dossier SeaPilot sur ce PC<input value={root} onChange={(e) => setRoot(e.target.value)} placeholder="G:\Mon Drive\SeaPilot" disabled={busy || previewMode} spellCheck={false} /></label>
        <div className="admin-root-actions"><button className="admin-primary-button" disabled={busy || previewMode || !root.trim()} onClick={() => void configure('configure')}><FolderSync size={16} />Enregistrer la racine SeaPilot</button><button className="admin-secondary-button" disabled={busy || previewMode} onClick={() => void configure('status')}>Vérifier ce PC</button></div>
        <p>À la première utilisation, autorisez l’ouverture du lanceur et la connexion locale demandée par le navigateur.</p>
      </div></li>
    </ol>
    {previewMode ? <p className="admin-section-description">Préversion : la configuration du PC est désactivée.</p> : null}
    {busy ? <p role="status">Connexion au lanceur SeaPilot…</p> : null}
    {error ? <p role="alert" className="admin-root-error">{error}</p> : null}
    {status ? <div role="status" className="admin-drive-usage"><h3>{status.root ? 'Ce PC est configuré' : 'Racine à renseigner'}</h3><p className="admin-drive-path">{status.root || 'Le lanceur est installé. Renseignez maintenant le chemin SeaPilot.'}</p>{status.collaborators !== undefined ? <p>{status.collaborators} dossier(s) de collaborateurs en poste préparé(s).</p> : null}</div> : null}
    <div className="admin-drive-usage"><h3>Classement automatique</h3><ul>{Object.entries(DRIVE_MODULES).map(([key, folder]) => <li key={key}><strong>{folder}</strong> : {key === 'disciplinary' ? 'un dossier par collaborateur, puis un sous-dossier par date.' : key === 'chemicals' ? 'un dossier par navire et par produit pour les FDS et pièces jointes.' : key === 'procedurePdfs' ? 'les PDF publiés, accessibles en lecture seule aux Capitaines et Marins.' : 'les fichiers de travail des procédures.'}</li>)}</ul><p>Ces dossiers sont créés automatiquement à l’installation ou à la configuration. Enregistrez dans Word ou Excel puis laissez Google Drive terminer sa synchronisation.</p><p>Réservez Procedures et Sanctions Disciplinaires aux profils Administration et Direction. Partagez Procedures PDF en lecture seule avec les profils de consultation. Les autorisations Google Drive s’appliquent également en dehors de SeaPilot.</p></div>
  </section>;
}
