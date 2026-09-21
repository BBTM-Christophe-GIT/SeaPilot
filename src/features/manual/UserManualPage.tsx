import { ArrowUpRight, BookOpen, ChevronRight, Info, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useOutletContext, useParams } from 'react-router-dom';
import type { AppShellOutletContext } from '../shell/AppShell';
import { getManualModules, MANUAL_GUIDES, normalizeManualSearch } from './manualGuides';
import './userManual.css';

export function UserManualPage() {
  const { visibleModules = [] } = useOutletContext<AppShellOutletContext>();
  const { moduleKey } = useParams<{ moduleKey: string }>();
  const [search, setSearch] = useState('');
  const articleRef = useRef<HTMLElement>(null);
  const modules = getManualModules(visibleModules);
  const selectedModule = moduleKey ? modules.find((module) => module.key === moduleKey) : modules[0];
  const guide = selectedModule ? MANUAL_GUIDES[selectedModule.key] : undefined;
  const query = normalizeManualSearch(search);
  const matchingModules = modules.filter((module) => {
    const notice = MANUAL_GUIDES[module.key];
    return normalizeManualSearch([module.label, module.family, notice?.purpose, notice?.access,
      ...(notice?.steps.flatMap((step) => [step.title, step.detail]) || []), ...(notice?.reminders || [])].join(' ')).includes(query);
  });
  const families = [...new Set(matchingModules.map((module) => module.family))];

  useEffect(() => {
    if (moduleKey) articleRef.current?.focus({ preventScroll: true });
  }, [moduleKey]);

  return (
    <section className="user-manual" aria-labelledby="manual-title">
      <header className="manual-header">
        <span className="manual-header-icon"><BookOpen aria-hidden="true" size={26} /></span>
        <div><p className="manual-eyebrow">AIDE À L’UTILISATION</p><h1 id="manual-title">Manuel d’utilisation</h1>
          <p>Les notices des modules du Marin, pour vous guider pas à pas.</p></div>
      </header>
      <div className="manual-layout">
        <aside className="manual-sidebar" aria-label="Sommaire du manuel">
          <div className="manual-search"><Search aria-hidden="true" size={17} /><input aria-label="Rechercher dans le manuel" placeholder="Rechercher une notice…" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <p className="manual-count" role="status">{matchingModules.length} notice{matchingModules.length > 1 ? 's' : ''}{query ? ' trouvée' : ' disponible'}{matchingModules.length > 1 ? 's' : ''}</p>
          <nav aria-label="Modules du manuel">
            {families.map((family) => <div className="manual-family" key={family}>
              <h2>{family}</h2>
              {matchingModules.filter((module) => module.family === family).map((module) => (
                <NavLink key={module.key} to={`/manual/${module.key}`} aria-current={selectedModule?.key === module.key ? 'page' : undefined} className={selectedModule?.key === module.key ? 'is-selected' : ''}>
                  <span>{module.label}</span><ChevronRight aria-hidden="true" size={15} />
                </NavLink>
              ))}
            </div>)}
          </nav>
          {!matchingModules.length ? <div className="manual-no-results"><p>{query ? 'Aucune notice ne correspond à votre recherche.' : 'Aucune notice disponible pour vos accès actuels.'}</p>{query ? <button type="button" onClick={() => setSearch('')}>Effacer la recherche</button> : null}</div> : null}
        </aside>
        {selectedModule && guide ? <article className="manual-article" ref={articleRef} tabIndex={-1} aria-labelledby="manual-module-title">
          <header className="manual-article-header"><div><p className="manual-eyebrow">{selectedModule.family} · NOTICE MARIN</p><h2 id="manual-module-title">{selectedModule.label}</h2></div>
            <Link className="manual-open-module" to={selectedModule.key === 'home' ? '/' : `/modules/${selectedModule.key}`}>Ouvrir le module<ArrowUpRight aria-hidden="true" size={17} /></Link></header>
          <p className="manual-purpose">{guide.purpose}</p>
          <div className="manual-access"><Info aria-hidden="true" size={19} /><div><h3>Votre accès en tant que Marin</h3><p>{guide.access}</p></div></div>
          <h3 className="manual-section-title">Comment utiliser ce module</h3>
          <ol className="manual-steps">{guide.steps.map((step, index) => <li key={step.title}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><div><h4>{step.title}</h4><p>{step.detail}</p></div></li>)}</ol>
          <section className="manual-reminders" aria-label="À retenir"><h3>À retenir</h3><ul>{guide.reminders.map((reminder) => <li key={reminder}>{reminder}</li>)}</ul></section>
          <footer className="manual-footer">Les boutons et les données disponibles dépendent des droits de votre compte. Pour une aide complémentaire, contactez votre responsable.</footer>
        </article> : <article className="manual-article manual-empty"><BookOpen aria-hidden="true" size={32} /><h2>Notice indisponible</h2><p>Ce module ne dispose pas d’une notice accessible à votre compte. Choisissez un module dans le sommaire.</p></article>}
      </div>
    </section>
  );
}
