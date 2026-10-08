import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CircleHelp,
  FolderOpen,
  Plus,
  Search,
  Ship,
  Users,
  Wrench,
} from "lucide-react";
import { Pie, PieChart } from "recharts";
import { type PreviewProject, periodLabel } from "./previewModel";
import {
  buildPortfolioMetrics,
  monthRange,
  PREVIEW_VESSELS,
  projectOperationType,
  projectPhase,
} from "./portfolioModel";
import { PreviewButton as Button } from "./PreviewControls";

export type CatalogSection = "Clients" | "Navires" | "Prestations";
export function PreviewPortfolio({
  projects,
  onOpen,
  onNew,
  onCatalog,
  onBilling,
}: {
  projects: PreviewProject[];
  onOpen: (id: string) => void;
  onNew: () => void;
  onCatalog: (section: CatalogSection) => void;
  onBilling: (id: string) => void;
}) {
  const [month, setMonth] = useState("2026-09");
  const [vessel, setVessel] = useState("");
  const [search, setSearch] = useState("");
  const [phase, setPhase] = useState("");
  const [archive, setArchive] = useState("all");
  const [type, setType] = useState("");
  const [scope, setScope] = useState("all");
  const { start, end } = monthRange(month);
  const metrics = buildPortfolioMetrics(projects, start, end, vessel);
  const filtered = projects.filter((project) => {
    const query =
      `${project.id} ${project.title} ${project.client} ${project.vessel}`.toLocaleLowerCase(
        "fr",
      );
    return (
      query.includes(search.toLocaleLowerCase("fr")) &&
      (!vessel ||
        project.operations.some((op) => op.vessel === vessel) ||
        project.vessel === vessel) &&
      (!phase || projectPhase(project) === phase) &&
      (archive === "all" ||
        (archive === "archived" ? project.archived : !project.archived)) &&
      (!type ||
        project.operations.some(
          (op) => (op.type || projectOperationType(project)) === type,
        )) &&
      (scope === "all" || (project.start <= end && project.end >= start))
    );
  });
  return (
    <div className="pp-portfolio pp-portfolio-v2">
      <header className="pp-portfolio-heading">
        <div>
          <span className="pp-eyebrow">ACTIVITÉ MARITIME</span>
          <h1>Projets</h1>
          <p>Une vue sur la flotte. Chaque mission, dans le détail.</p>
        </div>
        <Button primary icon={Plus} onClick={onNew}>
          Nouveau projet
        </Button>
      </header>
      <div className="pp-pilot-heading">
        <div>
          <h2>Pilotage de l’activité</h2>
          <span className="pp-muted">
            Données de démonstration · arrêtées au 27 septembre 2026
          </span>
        </div>
        <div className="pp-pilot-filters">
          <label>
            <CalendarDays size={16} />
            <span className="pp-sr-only">Mois des indicateurs</span>
            <input
              aria-label="Mois des indicateurs"
              type="month"
              value={month}
              onChange={(e) => {
                if (e.target.value) setMonth(e.target.value);
              }}
            />
          </label>
          <label>
            <Ship size={16} />
            <span className="pp-sr-only">Navire du portefeuille</span>
            <select
              aria-label="Navire du portefeuille"
              value={vessel}
              onChange={(e) => setVessel(e.target.value)}
            >
              <option value="">Tous les navires</option>
              {PREVIEW_VESSELS.map((item) => (
                <option key={item.name}>{item.name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="pp-pilot-grid">
        <section className="pp-panel pp-utilization">
          <div className="pp-chart-title">
            <h3>Utilisation des navires</h3>
            <div className="pp-chart-key">
              <span>
                <i className="pp-dot planned" />
                Prévu
              </span>
              <span>
                <i className="pp-dot actual" />
                Réalisé
              </span>
            </div>
          </div>
          <div className="pp-vessel-bars">
            {metrics.vessels.map((item) => (
              <div className="pp-vessel-bar" key={item.name}>
                <div className="pp-vessel-caption">
                  <Ship size={16} />
                  <strong>{item.short}</strong>
                  <span>{item.lengthOverall} m</span>
                </div>
                <div className="pp-dual-bars">
                  <div>
                    <span>Prévu</span>
                    <div
                      className="pp-bar-track"
                      role="img"
                      aria-label={`${item.name} : prévu ${item.rate} %, ${item.days} jours sur ${item.available}`}
                    >
                      <i style={{ width: `${item.rate}%` }} />
                    </div>
                    <b>
                      {item.rate}
                      <small>%</small>
                    </b>
                    <em>
                      {item.days}/{item.available} j
                    </em>
                  </div>
                  <div>
                    <span>Réalisé</span>
                    <div
                      className="pp-bar-track actual"
                      role="img"
                      aria-label={`${item.name} : réalisé ${item.realizedRate === null ? "à venir" : `${item.realizedRate} %, ${item.realizedDays} jours sur ${item.elapsedDays}`}`}
                    >
                      <i style={{ width: `${item.realizedRate || 0}%` }} />
                    </div>
                    <b>
                      {item.realizedRate === null ? (
                        "—"
                      ) : (
                        <>
                          {item.realizedRate}
                          <small>%</small>
                        </>
                      )}
                    </b>
                    <em>
                      {item.realizedDays}/{item.elapsedDays} j
                    </em>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <details className="pp-metric-method">
            <summary>
              <CircleHelp size={14} />
              Comprendre le calcul
            </summary>
            <p>
              Prévu : jours couverts par les opérations / jours calendaires du
              mois. Réalisé : jours couverts par un DPR / jours écoulés du mois,
              jusqu’au 27 septembre 2026. Un jour et un navire ne comptent
              qu’une fois, même si des missions se chevauchent. Un DPR manquant
              ne prouve pas une absence d’activité. Les archives sont incluses.
            </p>
          </details>
        </section>
        <section className="pp-panel pp-operation-mix">
          <div className="pp-chart-title">
            <h3>Répartition des opérations</h3>
            <span className="pp-muted">{metrics.operationCount} missions</span>
          </div>
          <div className="pp-mix-body">
            <div className="pp-donut" aria-hidden="true">
              <PieChart width={158} height={158}>
                <Pie
                  data={metrics.types.filter((item) => item.count)}
                  dataKey="count"
                  nameKey="name"
                  innerRadius={54}
                  outerRadius={73}
                  paddingAngle={3}
                  isAnimationActive={false}
                />
              </PieChart>
              <div>
                <strong>{metrics.operationCount}</strong>
                <span>missions</span>
              </div>
            </div>
            <div className="pp-mix-legend">
              {metrics.types.map((item) => (
                <button
                  key={item.name}
                  aria-pressed={type === item.name}
                  title={`Filtrer les projets : ${item.name}`}
                  onClick={() => {
                    setType(type === item.name ? "" : item.name);
                    setScope("month");
                  }}
                >
                  <i className="pp-dot" style={{ background: item.fill }} />
                  <span>{item.name}</span>
                  <b>{item.share}%</b>
                  <small>{item.count}</small>
                </button>
              ))}
            </div>
          </div>
          <p className="pp-chart-foot">
            Part des missions qui recoupent le mois sélectionné. Cliquez sur un
            type pour filtrer les projets.
          </p>
        </section>
      </div>
      <div className="pp-project-list-heading">
        <div>
          <h2>
            Les dossiers projets <span>{filtered.length}</span>
          </h2>
          <p>
            L’avancement suit les dates de mission. L’archivage sert uniquement
            à ranger un dossier.
          </p>
        </div>
        <div className="pp-catalog-shortcuts">
          <Button icon={Users} onClick={() => onCatalog("Clients")}>
            Clients
          </Button>
          <Button icon={Ship} onClick={() => onCatalog("Navires")}>
            Navires & remorqués
          </Button>
          <Button icon={Wrench} onClick={() => onCatalog("Prestations")}>
            Catalogue de prestations
          </Button>
        </div>
      </div>
      <section className="pp-panel pp-project-list">
        <div className="pp-portfolio-filters pp-list-filters">
          <label className="pp-search">
            <Search size={17} />
            <input
              aria-label="Rechercher un projet"
              placeholder="Rechercher un projet, un client…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="Avancement du projet"
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
          >
            <option value="">Tout avancement</option>
            <option>À venir</option>
            <option>En cours</option>
            <option>Terminé</option>
          </select>
          <select
            aria-label="Rangement des dossiers"
            value={archive}
            onChange={(e) => setArchive(e.target.value)}
          >
            <option value="all">Tous les dossiers</option>
            <option value="current">Non archivés</option>
            <option value="archived">Archives uniquement</option>
          </select>
          <select
            aria-label="Période de la liste"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="all">Toutes les périodes</option>
            <option value="month">Mois sélectionné</option>
          </select>
        </div>
        {type && (
          <div className="pp-active-filter">
            Type : {type}
            <button onClick={() => setType("")}>Retirer le filtre ×</button>
          </div>
        )}
        <div className="pp-table-scroll">
          <table className="pp-table pp-project-table">
            <thead>
              <tr>
                <th>Projet / client</th>
                <th>Type d’opération</th>
                <th>Navire / période</th>
                <th>Avancement</th>
                <th>Validation</th>
                <th>
                  <span className="pp-sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((project) => (
                <tr key={project.id}>
                  <td>
                    <button
                      className="pp-project-name"
                      onClick={() => onOpen(project.id)}
                    >
                      <small>{project.id}</small>
                      <strong>{project.title}</strong>
                    </button>
                    <span>{project.client}</span>
                  </td>
                  <td>{projectOperationType(project)}</td>
                  <td>
                    <strong>
                      {PREVIEW_VESSELS.find(
                        (item) => item.name === project.vessel,
                      )?.short || project.vessel}
                    </strong>
                    <span>{periodLabel(project.start, project.end)}</span>
                  </td>
                  <td>
                    <span
                      className={`pp-phase pp-phase-${projectPhase(project) === "En cours" ? "current" : projectPhase(project) === "Terminé" ? "done" : "next"}`}
                    >
                      {projectPhase(project)}
                    </span>
                    {project.archived && (
                      <small className="pp-archive-caption">
                        Dossier archivé
                      </small>
                    )}
                  </td>
                  <td>
                    <span
                      className={`pp-status ${project.status === "Validé" ? "is-valid" : project.status === "Facturé" ? "is-muted" : ""}`}
                    >
                      {project.status}
                    </span>
                  </td>
                  <td>
                    <div className="pp-row-actions">
                      <button
                        className="pp-text-button"
                        aria-label={`Facturation ${project.id}`}
                        onClick={() => onBilling(project.id)}
                      >
                        Facturation
                      </button>
                      <button
                        className="pp-icon-button"
                        aria-label={`Ouvrir ${project.id}`}
                        onClick={() => onOpen(project.id)}
                      >
                        <ArrowRight size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <div className="pp-empty">
            <FolderOpen size={30} />
            <p>Aucun projet ne correspond à ces filtres.</p>
            <Button
              onClick={() => {
                setSearch("");
                setPhase("");
                setArchive("all");
                setType("");
                setVessel("");
                setScope("all");
              }}
            >
              Réinitialiser les filtres
            </Button>
          </div>
        )}
        <footer className="pp-list-foot">
          <span>
            {filtered.length} dossiers · historique et documents conservés
          </span>
          <span>
            Les indicateurs suivent le mois et le navire ; les autres filtres
            concernent la liste.
          </span>
        </footer>
      </section>
    </div>
  );
}
