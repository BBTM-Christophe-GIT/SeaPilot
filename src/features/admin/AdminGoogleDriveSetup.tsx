import { ArrowRight, Download, ExternalLink, FolderSync, Monitor } from 'lucide-react';
import { Link } from 'react-router-dom';

export function AdminGoogleDriveSetup() {
  return (
    <section className="admin-panel admin-drive-setup" aria-labelledby="admin-drive-title">
      <div className="admin-header">
        <div>
          <p className="module-family">Documents et Google Drive</p>
          <h2 id="admin-drive-title">Ouvrir les documents dans Word ou Excel</h2>
          <p className="admin-section-description">Configurez ce PC pour ouvrir les fichiers de travail depuis le module Procédures.</p>
        </div>
        <span className="admin-platform-badge"><Monitor aria-hidden="true" size={16} />Windows</span>
      </div>

      <ol className="admin-setup-steps">
        <li>
          <div>
            <h3>Connecter Google Drive</h3>
            <p>Installez Google Drive pour ordinateur et connectez le compte qui a accès au dossier des procédures. Vérifiez que ce dossier apparaît dans l’Explorateur de fichiers.</p>
            <a className="admin-secondary-button" href="https://support.google.com/drive/answer/10838124?hl=fr" target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden="true" size={16} />Installer Google Drive
            </a>
          </div>
        </li>
        <li>
          <div>
            <h3>Installer le lanceur SeaPilot</h3>
            <p>Téléchargez l’archive, extrayez tout son contenu, puis lancez <strong>Installer.cmd</strong>. Cette installation est à effectuer sur chaque PC utilisé pour modifier les documents.</p>
            <a className="admin-primary-button" href="/connectors/seapilot-drive-windows.zip" download>
              <Download aria-hidden="true" size={16} />Installer le lanceur Windows
            </a>
          </div>
        </li>
        <li>
          <div>
            <h3>Choisir le dossier synchronisé</h3>
            <p>Sélectionnez le dossier qui contient les fichiers des procédures. Son emplacement peut varier selon le poste.</p>
            <p className="admin-drive-path">Exemple : <code>G:\Mon Drive\SeaPilot\Procedures</code></p>
            <a className="admin-secondary-button" href="seapilot-drive://configure">
              <FolderSync aria-hidden="true" size={16} />Configurer le dossier sur ce PC
            </a>
          </div>
        </li>
      </ol>

      <div className="admin-drive-usage">
        <h3>Travailler sur un document</h3>
        <p>Dans Procédures, cliquez sur un document lié à Drive et acceptez « Ouvrir SeaPilot Drive » si le navigateur le demande. Enregistrez vos modifications dans Word ou Excel, puis attendez la fin de la synchronisation Drive avant d’éteindre le PC.</p>
        <p>Les PDF publiés restent des versions distinctes : une modification du fichier de travail ne les remplace pas automatiquement.</p>
        <Link to="/modules/procedures">Ouvrir le module Procédures<ArrowRight aria-hidden="true" size={16} /></Link>
      </div>
      <div className="admin-drive-usage">
        <h3>Sanctions Disciplinaires : dossier confidentiel</h3>
        <p>Utilisez un dossier distinct, partagé exclusivement avec les comptes Administration et Direction autorisés. Ce réglage est indépendant de celui des procédures.</p>
        <p className="admin-drive-path">Exemple : <code>G:\Mon Drive\SeaPilot\Sanctions Disciplinaires</code></p>
        <a className="admin-secondary-button" href="seapilot-drive://disciplinary/configure"><FolderSync aria-hidden="true" size={16} />Configurer le dossier disciplinaire sur ce PC</a>
        <p>Dans le module, choisissez ce même dossier pour enregistrer les courriers Word et les pièces jointes. Les droits Google Drive doivent être mis à jour séparément lors d’un changement de profil.</p>
        <Link to="/modules/disciplinary">Ouvrir les Sanctions Disciplinaires<ArrowRight aria-hidden="true" size={16} /></Link>
      </div>
    </section>
  );
}
