import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Archive,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Download,
  Ellipsis,
  FileText,
  Files,
  FolderKanban,
  History,
  House,
  LayoutGrid,
  Menu,
  Pencil,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  Settings2,
  Ship,
  TriangleAlert,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { AppDialog } from "../../components/AppDialog";
import { compareFleetAssets } from "../fleet/fleetDisplay";
import {
  addPreviewEvent,
  buildPreviewPdf,
  createPreviewProjects,
  dateLabel,
  DOCUMENT_CATEGORIES,
  downloadPreviewBlob,
  missingContractFields,
  money,
  newPreviewProject,
  periodLabel,
  PREVIEW_CONTRACTS,
  PREVIEW_DATE,
  type PreviewDocument,
  type PreviewOperation,
  type PreviewProject,
  type PreviewStatus,
  type PreviewTab,
} from "./previewModel";

import { PreviewPortfolio, type CatalogSection } from "./PreviewPortfolio";
import { PreviewBillingWorkspace } from "./PreviewBillingWorkspace";
import {
  OPERATION_TYPES,
  projectOperationType,
  type OperationType,
} from "./portfolioModel";

const TABS: { id: PreviewTab; name: string; icon: LucideIcon }[] = [
  { id: "overview", name: "Vue d’ensemble", icon: ClipboardList },
  { id: "contract", name: "Offre & contrat", icon: FileText },
  { id: "operations", name: "Opérations", icon: Settings2 },
  { id: "billing", name: "Facturation", icon: ReceiptText },
  { id: "documents", name: "Documents", icon: Files },
  { id: "history", name: "Historique", icon: History },
];
const VESSELS = [
  { name: "M/V Démonstration", lengthOverall: 32 },
  { name: "Support Démonstration", lengthOverall: 19 },
  { name: "Remorqueur Démonstration", lengthOverall: 24 },
].sort(compareFleetAssets);
type Route = { id: string; tab: PreviewTab } | { id: "portfolio"; tab?: never };
type Modal =
  | { kind: "project"; project: PreviewProject; isNew?: boolean }
  | { kind: "operation"; operation?: PreviewOperation }
  | { kind: "document"; document: PreviewDocument }
  | { kind: "catalog"; section: CatalogSection }
  | { kind: "archive" | "help" | "notifications" }
  | null;

function currentRoute(): Route {
  const [id, tab] = window.location.hash.slice(1).split("/");
  return !id || id === "portfolio"
    ? { id: "portfolio" }
    : {
        id: /^P\d+$/.test(id || "") ? id : "P901",
        tab: TABS.some((item) => item.id === tab)
          ? (tab as PreviewTab)
          : "overview",
      };
}
function Button({
  children,
  icon: Icon,
  primary,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={`pp-button ${primary ? "pp-primary" : ""} ${className}`}
      {...props}
    >
      {Icon ? <Icon size={18} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
function Status({ status }: { status: string }) {
  return (
    <span
      className={`pp-status ${status === "Validé" ? "is-valid" : status === "Archivé" || status === "Facturé" ? "is-muted" : ""}`}
    >
      {status}
    </span>
  );
}
function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`pp-field${wide ? " is-wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="pp-empty">
      <Files size={28} aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

export function ProjectsWorkspacePreview() {
  const [projects, setProjects] = useState(createPreviewProjects);
  const [route, setRoute] = useState<Route>(currentRoute);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const project = projects.find((item) => item.id === route.id) || projects[0];
  const portfolio = route.id === "portfolio";
  const activeTab = route.tab || "overview";
  useEffect(() => {
    const listener = () => setRoute(currentRoute());
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 5500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  function navigate(id: string, tab: PreviewTab = "overview") {
    setRoute(id === "portfolio" ? { id } : { id, tab });
    window.location.hash = id === "portfolio" ? id : `${id}/${tab}`;
    setSidebarOpen(false);
    setMenuOpen(false);
  }
  function update(
    id: string,
    change: (value: PreviewProject) => PreviewProject,
    label: string,
    detail: string,
  ) {
    setProjects((items) =>
      items.map((item) =>
        item.id === id ? addPreviewEvent(change(item), label, detail) : item,
      ),
    );
  }
  async function emitDocument(kind: "contract" | "offer", language: string) {
    setBusy(true);
    try {
      const name =
        kind === "offer"
          ? `Offre commerciale ${language}.pdf`
          : `Contrat ${project.id}.pdf`;
      const blob = await buildPreviewPdf(
        project,
        kind === "offer"
          ? language === "EN"
            ? "Commercial offer"
            : "Offre commerciale"
          : project.contract,
        [
          `Période : ${periodLabel(project.start, project.end)}`,
          `Armateur : ${project.owner || "À compléter"}`,
          `Livraison : ${project.port || "À compléter"}`,
          `Loyer journalier : ${money(project.dailyRate)}`,
          "",
          project.description,
        ],
      );
      downloadPreviewBlob(blob, `DEMO-${project.id}-${name}`);
      update(
        project.id,
        (item) => ({
          ...item,
          documents: [
            {
              id: Date.now(),
              name,
              date: PREVIEW_DATE,
              category: kind === "offer" ? "Offre commerciale" : "Contrat",
              origin: "Émis dans cette démo",
              file: new File([blob], name, { type: "application/pdf" }),
            },
            ...item.documents,
          ],
        }),
        "Document émis",
        name,
      );
      setToast("PDF de démonstration téléchargé et ajouté aux documents.");
    } catch {
      setToast("Le document n’a pas pu être généré. Réessaie.");
    } finally {
      setBusy(false);
    }
  }
  async function downloadDocument(document: PreviewDocument) {
    setBusy(true);
    try {
      downloadPreviewBlob(
        document.file ||
          (await buildPreviewPdf(
            project,
            document.name.replace(/\.pdf$/i, ""),
            [
              "Exemplaire illustratif de la bibliothèque Projet.",
              "Les documents et événements de cette prévisualisation sont fictifs.",
            ],
          )),
        document.file ? document.name : `DEMO-${document.name}`,
      );
    } catch {
      setToast("Le téléchargement a échoué. Réessaie.");
    } finally {
      setBusy(false);
    }
  }
  const recentEvents = project.events.slice(0, 3);
  return (
    <div className="pp-app">
      <a
        className="pp-skip"
        href="#pp-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("pp-content")?.focus();
        }}
      >
        Aller au contenu
      </a>
      {sidebarOpen ? (
        <button
          className="pp-sidebar-scrim"
          aria-label="Fermer la navigation"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <aside
        className={`pp-sidebar ${sidebarOpen ? "is-open" : ""}`}
        aria-label="Navigation principale"
      >
        <a
          className="pp-brand"
          href="#portfolio"
          onClick={() => navigate("portfolio")}
        >
          <img src="/seapilot-logo.png" alt="SeaPilot by BBTM" />
        </a>
        <nav>
          <button onClick={() => navigate("portfolio")}>
            <House />
            Accueil
          </button>
          <button
            className="is-active"
            aria-current="page"
            onClick={() => navigate("portfolio")}
          >
            <FolderKanban />
            Projets
          </button>
          <button onClick={() => navigate(project.id, "operations")}>
            <CalendarDays />
            Planning
          </button>
          <button
            onClick={() => setModal({ kind: "catalog", section: "Navires" })}
          >
            <Ship />
            Navires
          </button>
          <button onClick={() => navigate(project.id, "documents")}>
            <Files />
            Documents
          </button>
          <div className="pp-sidebar-divider" />
          <button onClick={() => setModal({ kind: "help" })}>
            <LayoutGrid />
            Tous les modules
            <ChevronDown size={14} />
          </button>
        </nav>
        <footer>
          <span>Prévisualisation interactive</span>
          <small>Données fictives · session temporaire</small>
          <button
            onClick={() => {
              setProjects(createPreviewProjects());
              navigate("P901");
              setToast("La démonstration a été réinitialisée.");
            }}
          >
            <RotateCcw size={14} />
            Réinitialiser la démo
          </button>
        </footer>
      </aside>
      <div className="pp-main-shell">
        <header className="pp-topbar">
          <button
            className="pp-mobile-menu pp-icon-button"
            aria-label="Ouvrir la navigation"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu />
          </button>
          <span className="pp-demo-pill">Prévisualisation · Projet</span>
          <div className="pp-topbar-right">
            <button
              className="pp-icon-button pp-bell"
              aria-label="Afficher les points à traiter"
              onClick={() => setModal({ kind: "notifications" })}
            >
              <Bell />
              <span>2</span>
            </button>
            <div className="pp-user">
              <span className="pp-avatar">AD</span>
              <div>
                <strong>Arthur DEMO</strong>
                <small>Administration</small>
              </div>
            </div>
            <button
              className="pp-icon-button"
              aria-label="À propos de cette prévisualisation"
              onClick={() => setModal({ kind: "help" })}
            >
              <ChevronDown size={18} />
            </button>
          </div>
        </header>
        <main id="pp-content" tabIndex={-1}>
          <div className="pp-breadcrumb">
            <button onClick={() => navigate("portfolio")}>Projets</button>
            <span>/</span>
            <strong>{portfolio ? "Portefeuille" : project.id}</strong>
          </div>
          {portfolio ? (
            <PreviewPortfolio
              projects={projects}
              onOpen={(id) => navigate(id)}
              onNew={() =>
                setModal({
                  kind: "project",
                  project: newPreviewProject(projects),
                  isNew: true,
                })
              }
              onCatalog={(section) => setModal({ kind: "catalog", section })}
              onBilling={(id) => navigate(id, "billing")}
            />
          ) : (
            <article className="pp-dossier">
              <div className="pp-project-toolbar">
                <button
                  className="pp-text-button"
                  onClick={() => navigate("portfolio")}
                >
                  <ArrowLeft size={17} />
                  Retour au portefeuille
                </button>
                <label className="pp-project-switcher">
                  Projet
                  <select
                    value={project.id}
                    onChange={(event) => navigate(event.target.value)}
                  >
                    {projects.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.id} – {item.title}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="pp-demo-caption">
                  Maquette · données illustratives
                  <br />
                  27 septembre 2026
                </span>
              </div>
              <header className="pp-project-heading">
                <div>
                  <span className="pp-code">{project.id}</span>
                  <h1>{project.title}</h1>
                  <p>
                    {project.client} <span>·</span> {project.vessel}
                  </p>
                  <div className="pp-project-meta">
                    <CalendarDays size={18} />
                    <span>{periodLabel(project.start, project.end)}</span>
                    <i />
                    <Status
                      status={project.archived ? "Archivé" : project.status}
                    />
                  </div>
                </div>
                <div className="pp-project-actions">
                  <Button
                    icon={Pencil}
                    disabled={project.archived}
                    onClick={() => setModal({ kind: "project", project })}
                  >
                    Modifier
                  </Button>
                  <div className="pp-menu-anchor">
                    <Button
                      aria-label="Autres actions du projet"
                      aria-expanded={menuOpen}
                      icon={Ellipsis}
                      onClick={() => setMenuOpen(!menuOpen)}
                    />
                    <div
                      className={`pp-dropdown ${menuOpen ? "is-open" : ""}`}
                      hidden={!menuOpen}
                    >
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          if (project.archived) {
                            update(
                              project.id,
                              (item) => ({ ...item, archived: false }),
                              "Projet restauré",
                              "Retour dans le portefeuille actif",
                            );
                            setToast("Projet restauré dans cette démo.");
                          } else setModal({ kind: "archive" });
                        }}
                      >
                        <Archive size={16} />
                        {project.archived
                          ? "Restaurer le projet"
                          : "Archiver le projet"}
                      </button>
                      <button onClick={() => navigate(project.id, "history")}>
                        <History size={16} />
                        Voir l’historique
                      </button>
                    </div>
                  </div>
                </div>
              </header>
              <nav className="pp-tabs" aria-label="Rubriques du projet">
                {TABS.map(({ id, name, icon: Icon }) => (
                  <button
                    key={id}
                    aria-current={activeTab === id ? "page" : undefined}
                    onClick={() => navigate(project.id, id)}
                  >
                    <Icon size={21} />
                    <span>{name}</span>
                  </button>
                ))}
              </nav>
              <label className="pp-mobile-tabs">
                Rubrique
                <select
                  value={activeTab}
                  onChange={(event) =>
                    navigate(project.id, event.target.value as PreviewTab)
                  }
                >
                  {TABS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <div
                className="pp-tab-content"
                key={`${project.id}-${activeTab}`}
              >
                {activeTab === "overview" ? (
                  <>
                    <h2 className="pp-section-title">
                      À traiter sur ce projet
                    </h2>
                    {project.archived ? (
                      <div className="pp-notice">
                        <Archive />
                        <div>
                          <strong>Ce projet est archivé</strong>
                          <p>
                            Ses opérations, ses documents et son historique
                            restent consultables.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`pp-attention ${missingContractFields(project).length ? "" : "is-complete"}`}
                      >
                        <span className="pp-attention-icon">
                          {missingContractFields(project).length ? (
                            <TriangleAlert />
                          ) : (
                            <CheckCircle2 />
                          )}
                        </span>
                        <div>
                          <strong>
                            {missingContractFields(project).length
                              ? "Contrat à compléter"
                              : "Dossier prêt pour la prochaine étape"}
                          </strong>
                          <p>
                            {missingContractFields(project).length
                              ? `${missingContractFields(project).length} informations manquantes avant émission.`
                              : "Les informations contractuelles essentielles sont renseignées."}
                          </p>
                        </div>
                        <Button
                          primary
                          icon={FileText}
                          onClick={() => navigate(project.id, "contract")}
                        >
                          {missingContractFields(project).length
                            ? "Compléter le contrat"
                            : "Voir le contrat"}
                        </Button>
                      </div>
                    )}
                    <div className="pp-overview-grid">
                      <section className="pp-panel pp-operations-summary">
                        <div className="pp-panel-title">
                          <h2>Opérations</h2>
                          <button
                            className="pp-text-button"
                            onClick={() => navigate(project.id, "operations")}
                          >
                            Voir les opérations
                            <ArrowRight size={17} />
                          </button>
                        </div>
                        <OperationsTable project={project} compact />
                      </section>
                      <section className="pp-panel">
                        <div className="pp-panel-title">
                          <h2>Dernière activité</h2>
                          <button
                            className="pp-text-button"
                            onClick={() => navigate(project.id, "history")}
                          >
                            Tout l’historique
                            <ArrowRight size={17} />
                          </button>
                        </div>
                        <Activity events={recentEvents} />
                      </section>
                    </div>
                    <div className="pp-overview-bottom">
                      <button onClick={() => navigate(project.id, "contract")}>
                        <FileText />
                        <span>
                          <small>Contrat</small>
                          <strong>{project.contract}</strong>
                        </span>
                        <ArrowRight size={16} />
                      </button>
                      <button onClick={() => navigate(project.id, "documents")}>
                        <Files />
                        <span>
                          <small>Documents</small>
                          <strong>{project.documents.length} fichiers</strong>
                        </span>
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </>
                ) : null}
                {activeTab === "contract" ? (
                  <Contract
                    project={project}
                    busy={busy}
                    onSave={(values) => {
                      update(
                        project.id,
                        (item) => ({ ...item, ...values }),
                        "Contrat modifié",
                        "Informations contractuelles enregistrées dans la démo",
                      );
                      setToast(
                        "Les informations du contrat ont été enregistrées dans cette démo.",
                      );
                    }}
                    onEmit={emitDocument}
                  />
                ) : null}
                {activeTab === "operations" ? (
                  <>
                    <div className="pp-section-heading">
                      <div>
                        <h2>Les opérations du projet</h2>
                        <p>
                          Chaque mission garde ses dates, ses navires et ses
                          documents.
                        </p>
                      </div>
                      <Button
                        icon={Plus}
                        primary
                        disabled={project.archived}
                        onClick={() => setModal({ kind: "operation" })}
                      >
                        Nouvelle opération
                      </Button>
                    </div>
                    <section className="pp-panel">
                      <OperationsTable
                        project={project}
                        onEdit={(operation) =>
                          setModal({ kind: "operation", operation })
                        }
                      />
                    </section>
                    <div className="pp-notice">
                      <CalendarDays />
                      <div>
                        <strong>Lecture du planning</strong>
                        <p>
                          Les modifications sont répercutées dans les opérations
                          de cette prévisualisation.
                        </p>
                      </div>
                    </div>
                  </>
                ) : null}
                {activeTab === "billing" ? (
                  <PreviewBillingWorkspace
                    key={project.id}
                    project={project}
                    onChange={(period, event) =>
                      setProjects((items) =>
                        items.map((item) => {
                          if (item.id !== project.id) return item;
                          const updated = {
                            ...item,
                            billingMonths: {
                              ...item.billingMonths,
                              [period.month]: period,
                            },
                          };
                          return event
                            ? addPreviewEvent(updated, event, period.month)
                            : updated;
                        }),
                      )
                    }
                    onDocuments={(documents) =>
                      update(
                        project.id,
                        (item) => ({
                          ...item,
                          documents: [...documents, ...item.documents],
                        }),
                        "Justificatif ajouté",
                        documents.map((item) => item.name).join(", "),
                      )
                    }
                    onOpenDocument={(document) =>
                      setModal({ kind: "document", document })
                    }
                    onToast={setToast}
                  />
                ) : null}
                {activeTab === "documents" ? (
                  <Documents
                    project={project}
                    onOpen={(document) =>
                      setModal({ kind: "document", document })
                    }
                    onDownload={downloadDocument}
                    onUpload={(files) => {
                      update(
                        project.id,
                        (item) => ({
                          ...item,
                          documents: [
                            ...files.map((file, index) => ({
                              id: Date.now() + index,
                              name: file.name,
                              file,
                              category: "Autre",
                              origin: "Ajouté dans cette démo",
                              date: PREVIEW_DATE,
                            })),
                            ...item.documents,
                          ],
                        }),
                        "Document ajouté",
                        files.map((file) => file.name).join(", "),
                      );
                      setToast(
                        "Fichier ajouté à cette session de démonstration.",
                      );
                    }}
                  />
                ) : null}
                {activeTab === "history" ? (
                  <>
                    <div className="pp-section-heading">
                      <div>
                        <h2>L’histoire du projet</h2>
                        <p>
                          Modifications, opérations et documents réunis au même
                          endroit.
                        </p>
                      </div>
                      <span className="pp-muted">
                        {project.events.length} événements
                      </span>
                    </div>
                    <section className="pp-panel pp-history-panel">
                      <Activity events={project.events} detailed />
                    </section>
                    <p className="pp-footnote">
                      Les événements présentés sont fictifs. Dans l’interface
                      finale, seules les traces effectivement enregistrées
                      seront affichées.
                    </p>
                  </>
                ) : null}
              </div>
            </article>
          )}
          <p className="pp-bottom-note">
            Prévisualisation interactive · Les modifications et fichiers ajoutés
            restent dans cette session et disparaissent au rechargement.
          </p>
        </main>
      </div>
      {toast ? (
        <div className="pp-toast" role="status">
          <CheckCircle2 size={19} />
          <span>{toast}</span>
          <button aria-label="Fermer le message" onClick={() => setToast("")}>
            <X size={17} />
          </button>
        </div>
      ) : null}
      {modal?.kind === "project" ? (
        <ProjectForm
          project={modal.project}
          isNew={modal.isNew}
          onClose={() => setModal(null)}
          onSave={(value) => {
            if (modal.isNew) {
              setProjects((items) => [
                addPreviewEvent(
                  value,
                  "Projet créé",
                  `${value.id} — ${value.title}`,
                ),
                ...items,
              ]);
              navigate(value.id);
            } else
              update(
                value.id,
                () => value,
                "Projet modifié",
                "Identité et période mises à jour",
              );
            setModal(null);
            setToast("Projet enregistré dans cette démonstration.");
          }}
        />
      ) : null}
      {modal?.kind === "operation" ? (
        <OperationForm
          project={project}
          operation={modal.operation}
          onClose={() => setModal(null)}
          onSave={(value) => {
            update(
              project.id,
              (item) => ({
                ...item,
                operations: item.operations.some(
                  (operation) => operation.id === value.id,
                )
                  ? item.operations.map((operation) =>
                      operation.id === value.id ? value : operation,
                    )
                  : [...item.operations, value],
              }),
              modal.operation ? "Opération modifiée" : "Opération créée",
              value.name,
            );
            setModal(null);
            setToast("Opération enregistrée dans cette démonstration.");
          }}
        />
      ) : null}
      {modal?.kind === "archive" ? (
        <AppDialog
          title="Archiver ce projet ?"
          eyebrow={project.id}
          onClose={() => setModal(null)}
          footer={
            <>
              <Button onClick={() => setModal(null)}>Annuler</Button>
              <Button
                primary
                icon={Archive}
                onClick={() => {
                  update(
                    project.id,
                    (item) => ({ ...item, archived: true }),
                    "Projet archivé",
                    "Documents et opérations conservés",
                  );
                  setModal(null);
                  setToast(
                    "Projet archivé. Il reste accessible dans le portefeuille.",
                  );
                }}
              >
                Archiver le projet
              </Button>
            </>
          }
        >
          <p>
            Le dossier sera marqué « archivé » et restera visible dans « Tous
            les dossiers ». Ses documents, ses opérations et son historique
            seront conservés. L’archivage ne change pas les indicateurs
            historiques.
          </p>
        </AppDialog>
      ) : null}
      {modal?.kind === "document" ? (
        <DocumentDialog
          document={modal.document}
          project={project}
          onClose={() => setModal(null)}
          onDownload={() => downloadDocument(modal.document)}
          busy={busy}
        />
      ) : null}
      {modal?.kind === "catalog" ? (
        <Catalog
          initialSection={modal.section}
          projects={projects}
          onClose={() => setModal(null)}
        />
      ) : null}
      {modal?.kind === "help" ? (
        <AppDialog
          title="Découvrir le nouveau dossier projet"
          eyebrow="PRÉVISUALISATION"
          onClose={() => setModal(null)}
        >
          <p>
            Cette proposition explore le module Projet de SeaPilot. Les autres
            modules restent hors de cette démonstration.
          </p>
          <div className="pp-help-list">
            {TABS.map(({ name, icon: Icon }) => (
              <button
                key={name}
                onClick={() => {
                  navigate(
                    project.id,
                    TABS.find((tab) => tab.name === name)!.id,
                  );
                  setModal(null);
                }}
              >
                <Icon size={20} />
                {name}
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
          <p className="pp-footnote">
            Toutes les données sont fictives. Les sauvegardes sont temporaires ;
            les PDF téléchargés portent la mention Démonstration.
          </p>
        </AppDialog>
      ) : null}
      {modal?.kind === "notifications" ? (
        <AppDialog title="Points à traiter" onClose={() => setModal(null)}>
          <div className="pp-help-list">
            <button
              onClick={() => {
                navigate("P901", "contract");
                setModal(null);
              }}
            >
              <FileText />
              <span>
                Campagne Atlantique
                <br />
                <small>Vérifier les informations du contrat</small>
              </span>
              <ArrowRight />
            </button>
            <button
              onClick={() => {
                navigate("P901", "operations");
                setModal(null);
              }}
            >
              <CalendarDays />
              <span>
                Rotation 02
                <br />
                <small>Vérifier les dates et la validation</small>
              </span>
              <ArrowRight />
            </button>
          </div>
        </AppDialog>
      ) : null}
    </div>
  );
}

function Activity({
  events,
  detailed,
}: {
  events: PreviewProject["events"];
  detailed?: boolean;
}) {
  if (!events.length)
    return <Empty>L’historique commence avec la première modification.</Empty>;
  return (
    <ol className={`pp-activity ${detailed ? "is-detailed" : ""}`}>
      {events.map((event) => (
        <li key={event.id}>
          <span className="pp-activity-icon">
            {event.label.includes("Document") ? (
              <FileText size={17} />
            ) : event.label.includes("Opération") ? (
              <Settings2 size={17} />
            ) : (
              <Plus size={17} />
            )}
          </span>
          <div>
            <strong>
              {dateLabel(event.date)} 2026 <span>·</span> {event.label}
            </strong>
            <small>Équipe Démonstration</small>
            <p>{event.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function OperationsTable({
  project,
  compact,
  onEdit,
}: {
  project: PreviewProject;
  compact?: boolean;
  onEdit?: (operation: PreviewOperation) => void;
}) {
  if (!project.operations.length)
    return (
      <Empty>
        Aucune opération pour le moment. Crée la première mission depuis «
        Opérations ».
      </Empty>
    );
  return (
    <div className="pp-table-wrap">
      <table className={`pp-table ${compact ? "is-compact" : ""}`}>
        <thead>
          <tr>
            <th>Opération</th>
            <th>Navire</th>
            <th>Période</th>
            <th>Statut</th>
            {!compact ? (
              <>
                <th>Livraison</th>
                <th>
                  <span className="pp-sr-only">Actions</span>
                </th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {project.operations.map((operation) => (
            <tr key={operation.id}>
              <td>
                <strong>{operation.name}</strong>
              </td>
              <td>{operation.vessel}</td>
              <td>{periodLabel(operation.start, operation.end)}</td>
              <td>
                <Status status={operation.status} />
              </td>
              {!compact ? (
                <>
                  <td>{operation.port}</td>
                  <td>
                    <button
                      className="pp-icon-button"
                      disabled={project.archived}
                      aria-label={`Modifier ${operation.name}`}
                      onClick={() => onEdit?.(operation)}
                    >
                      <Pencil size={16} />
                    </button>
                  </td>
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Contract({
  project,
  onSave,
  onEmit,
  busy,
}: {
  project: PreviewProject;
  onSave: (
    values: Pick<PreviewProject, "contract" | "owner" | "port" | "dailyRate">,
  ) => void;
  onEmit: (kind: "contract" | "offer", language: string) => void;
  busy: boolean;
}) {
  const [kind, setKind] = useState<"contract" | "offer">("contract");
  const [language, setLanguage] = useState("FR");
  const [preview, setPreview] = useState(true);
  const [draft, setDraft] = useState({
    contract: project.contract,
    owner: project.owner,
    port: project.port,
    dailyRate: project.dailyRate,
  });
  const dirty = Object.entries(draft).some(
    ([key, value]) => project[key as keyof typeof draft] !== value,
  );
  return (
    <>
      <div className="pp-section-heading">
        <div>
          <h2>De l’offre au contrat</h2>
          <p>Une offre facultative, un contrat adapté à votre mission.</p>
        </div>
        <Button icon={FileText} onClick={() => setPreview(!preview)}>
          {preview ? "Masquer l’aperçu" : "Afficher l’aperçu"}
        </Button>
      </div>
      <div className="pp-contract-toolbar">
        <div className="pp-segmented">
          <button
            aria-pressed={kind === "contract"}
            onClick={() => setKind("contract")}
          >
            Contrat
          </button>
          <button
            aria-pressed={kind === "offer"}
            onClick={() => setKind("offer")}
          >
            Offre commerciale <small>Facultative</small>
          </button>
        </div>
        <span className={`pp-save-state ${dirty ? "is-dirty" : ""}`}>
          {dirty ? (
            "Modifications non enregistrées"
          ) : (
            <>
              <Check size={14} />
              Informations enregistrées
            </>
          )}
        </span>
      </div>
      <div className={`pp-contract-layout ${preview ? "" : "without-preview"}`}>
        <form
          className="pp-contract-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(draft);
          }}
        >
          <div className="pp-panel-title">
            <h3>
              {kind === "contract"
                ? "Informations contractuelles"
                : "Préparer l’offre"}
            </h3>
            <span className="pp-step-label">01 / Données essentielles</span>
          </div>
          <div className="pp-form-grid">
            <Field label="Famille de contrat" wide>
              <select
                disabled={project.archived}
                value={draft.contract}
                onChange={(event) =>
                  setDraft({ ...draft, contract: event.target.value })
                }
              >
                {PREVIEW_CONTRACTS.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
            <Field label="Armateur *" wide>
              <input
                required
                disabled={project.archived}
                value={draft.owner}
                placeholder="Nom de l’armateur"
                onChange={(event) =>
                  setDraft({ ...draft, owner: event.target.value })
                }
              />
            </Field>
            <Field label="Port de livraison *">
              <input
                required
                disabled={project.archived}
                value={draft.port}
                placeholder="Ex. Brest"
                onChange={(event) =>
                  setDraft({ ...draft, port: event.target.value })
                }
              />
            </Field>
            <Field label="Loyer journalier HT (€)">
              <input
                type="number"
                min="0"
                step="0.01"
                required
                disabled={project.archived}
                value={draft.dailyRate}
                onChange={(event) =>
                  setDraft({ ...draft, dailyRate: Number(event.target.value) })
                }
              />
            </Field>
            {kind === "offer" ? (
              <Field label="Langue du document">
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                >
                  <option>FR</option>
                  <option>EN</option>
                </select>
              </Field>
            ) : null}
          </div>
          <div className="pp-contract-context">
            <h4>Périmètre de la mission</h4>
            <p>{project.description}</p>
            <dl>
              <div>
                <dt>Navire</dt>
                <dd>{project.vessel}</dd>
              </div>
              <div>
                <dt>Période</dt>
                <dd>{periodLabel(project.start, project.end)}</dd>
              </div>
            </dl>
          </div>
          <details className="pp-contract-details">
            <summary>Clauses, annexes et conditions spécifiques</summary>
            <p>
              Dans la refonte finale, cet espace reprend toutes les rubriques du
              contrat : parties, itinéraire, tarifs, assurance, signatures et
              cases BIMCO. Cette prévisualisation permet d’essayer les
              informations essentielles et l’émission d’un PDF illustratif.
            </p>
          </details>
          <div className="pp-form-actions">
            <Button
              type="submit"
              icon={Check}
              disabled={!dirty || project.archived}
            >
              Enregistrer
            </Button>
            <Button
              primary
              icon={ArrowDownToLine}
              disabled={
                busy ||
                project.archived ||
                dirty ||
                (kind === "contract" &&
                  missingContractFields(project).length > 0)
              }
              onClick={() => onEmit(kind, language)}
            >
              {busy
                ? "Préparation…"
                : kind === "offer"
                  ? "Émettre l’offre"
                  : "Émettre le contrat"}
            </Button>
          </div>
          <p className="pp-footnote">
            Le PDF produit est un document de démonstration, sans valeur
            contractuelle.
          </p>
        </form>
        {preview ? (
          <section className="pp-document-stage" aria-label="Aperçu du contrat">
            <div className="pp-paper">
              <div className="pp-paper-brand">
                SeaPilot <small>DOCUMENT DE DÉMONSTRATION</small>
              </div>
              <h2>
                {kind === "offer"
                  ? language === "EN"
                    ? "COMMERCIAL OFFER"
                    : "OFFRE COMMERCIALE"
                  : draft.contract.toUpperCase()}
              </h2>
              <span className="pp-paper-ref">{project.id} · 27/09/2026</span>
              <hr />
              <h3>{project.title}</h3>
              <p>{project.description}</p>
              <dl>
                <div>
                  <dt>Client / affréteur</dt>
                  <dd>{project.client}</dd>
                </div>
                <div>
                  <dt>Armateur</dt>
                  <dd>{draft.owner || "À compléter"}</dd>
                </div>
                <div>
                  <dt>Livraison</dt>
                  <dd>{draft.port || "À compléter"}</dd>
                </div>
                <div>
                  <dt>Période</dt>
                  <dd>{periodLabel(project.start, project.end)}</dd>
                </div>
              </dl>
              <h4>Conditions commerciales</h4>
              <div className="pp-paper-rate">
                <span>Loyer journalier HT</span>
                <strong>{money(draft.dailyRate)}</strong>
              </div>
              <p className="pp-paper-disclaimer">
                Aperçu simplifié. Le modèle définitif conservera l’ensemble des
                clauses et annexes existantes.
              </p>
              <div className="pp-paper-signatures">
                <span>Armateur</span>
                <span>Client / affréteur</span>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}

function Documents({
  project,
  onOpen,
  onDownload,
  onUpload,
}: {
  project: PreviewProject;
  onOpen: (document: PreviewDocument) => void;
  onDownload: (document: PreviewDocument) => void;
  onUpload: (files: File[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const documents = project.documents.filter(
    (document) =>
      (!category || document.category === category) &&
      document.name
        .toLocaleLowerCase("fr")
        .includes(search.toLocaleLowerCase("fr")),
  );
  return (
    <>
      <div className="pp-section-heading">
        <div>
          <h2>Tous les documents du projet</h2>
          <p>
            Les pièces actuelles et historiques, dans une seule bibliothèque.
          </p>
        </div>
        <Button
          icon={Upload}
          primary
          disabled={project.archived}
          onClick={() => inputRef.current?.click()}
        >
          Ajouter un document
        </Button>
        <input
          className="pp-sr-only"
          ref={inputRef}
          aria-label="Fichiers à ajouter"
          type="file"
          multiple
          tabIndex={-1}
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            if (files.length) onUpload(files);
            event.target.value = "";
          }}
        />
      </div>
      <div className="pp-filters">
        <label className="pp-search">
          <Search size={18} />
          <input
            aria-label="Rechercher un document"
            placeholder="Rechercher un document…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          aria-label="Catégorie de documents"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="">Toutes les catégories</option>
          {DOCUMENT_CATEGORIES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>
      <section className="pp-panel">
        <div className="pp-table-wrap">
          <table className="pp-table pp-documents-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Catégorie</th>
                <th>Ajouté le</th>
                <th>Provenance</th>
                <th>
                  <span className="pp-sr-only">Télécharger</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id}>
                  <td>
                    <button
                      className="pp-document-link"
                      onClick={() => onOpen(document)}
                    >
                      <span>
                        <FileText size={23} />
                      </span>
                      <strong>{document.name}</strong>
                    </button>
                  </td>
                  <td>
                    <span className="pp-category">{document.category}</span>
                  </td>
                  <td>{dateLabel(document.date)} 2026</td>
                  <td className="pp-muted">{document.origin}</td>
                  <td>
                    <button
                      className="pp-icon-button"
                      aria-label={`Télécharger ${document.name}`}
                      onClick={() => onDownload(document)}
                    >
                      <Download size={19} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!documents.length ? (
          <Empty>Aucun document ne correspond à cette recherche.</Empty>
        ) : null}
      </section>
    </>
  );
}

function ProjectForm({
  project,
  isNew,
  onClose,
  onSave,
}: {
  project: PreviewProject;
  isNew?: boolean;
  onClose: () => void;
  onSave: (project: PreviewProject) => void;
}) {
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values = {
      ...project,
      title: String(data.get("title")).trim(),
      operationType: String(data.get("operationType")) as OperationType,
      client: String(data.get("client")).trim(),
      vessel: String(data.get("vessel")),
      start: String(data.get("start")),
      end: String(data.get("end")),
      description: String(data.get("description")),
      status: String(data.get("status")) as PreviewStatus,
    };
    if (!values.title || !values.client) {
      setError("Renseigne le projet et le client.");
      return;
    }
    if (values.end < values.start) {
      setError("La fin doit suivre le début du projet.");
      return;
    }
    onSave(values);
  }
  return (
    <AppDialog
      title={isNew ? "Nouveau projet" : "Modifier le projet"}
      eyebrow={`${project.id} · DÉMONSTRATION`}
      onClose={onClose}
      onSubmit={submit}
      variant="drawer"
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button primary type="submit" icon={Check}>
            Enregistrer le projet
          </Button>
        </>
      }
    >
      <div className="pp-form-grid">
        <Field label="Nom du projet *" wide>
          <input name="title" required defaultValue={project.title} />
        </Field>
        <Field label="Type d’opération" wide>
          <select
            name="operationType"
            defaultValue={projectOperationType(project)}
          >
            {OPERATION_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </Field>
        <Field label="Client / affréteur *" wide>
          <input name="client" required defaultValue={project.client} />
        </Field>
        <Field label="Navire" wide>
          <select name="vessel" defaultValue={project.vessel}>
            {VESSELS.map((item) => (
              <option key={item.name}>{item.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Début *">
          <input
            name="start"
            type="date"
            required
            defaultValue={project.start}
          />
        </Field>
        <Field label="Fin *">
          <input name="end" type="date" required defaultValue={project.end} />
        </Field>
        <Field label="Statut" wide>
          <select name="status" defaultValue={project.status}>
            {["Non validé", "Validé", "Facturé"].map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </Field>
        <Field label="Description" wide>
          <textarea
            name="description"
            rows={4}
            defaultValue={project.description}
          />
        </Field>
      </div>
      {error ? (
        <p role="alert" className="pp-error">
          {error}
        </p>
      ) : null}
      <p className="pp-footnote">
        Les modifications sont conservées uniquement pendant cette session de
        démonstration.
      </p>
    </AppDialog>
  );
}

function OperationForm({
  project,
  operation,
  onSave,
  onClose,
}: {
  project: PreviewProject;
  operation?: PreviewOperation;
  onSave: (operation: PreviewOperation) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value: PreviewOperation = {
      id: operation?.id || Date.now(),
      name: String(data.get("name")).trim(),
      type: String(data.get("operationType")) as OperationType,
      dailyRateOverride: data.get("dailyRateOverride")
        ? Number(data.get("dailyRateOverride"))
        : undefined,
      vessel: String(data.get("vessel")),
      start: String(data.get("start")),
      end: String(data.get("end")),
      port: String(data.get("port")).trim(),
      status: String(data.get("status")) as PreviewStatus,
    };
    if (!value.name) {
      setError("Indique le nom de la mission.");
      return;
    }
    if (value.end < value.start) {
      setError("La fin doit suivre le début de l’opération.");
      return;
    }
    onSave(value);
  }
  return (
    <AppDialog
      title={operation ? `Modifier ${operation.name}` : "Nouvelle opération"}
      eyebrow={project.id}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button primary type="submit">
            Enregistrer l’opération
          </Button>
        </>
      }
    >
      <div className="pp-form-grid">
        <Field label="Mission / opération *" wide>
          <input
            required
            name="name"
            defaultValue={operation?.name}
            placeholder="Ex. Rotation 03"
          />
        </Field>
        <Field label="Type d’opération" wide>
          <select
            name="operationType"
            defaultValue={operation?.type || projectOperationType(project)}
          >
            {OPERATION_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </Field>
        <Field label="Tarif spécifique de l’opération (€/jour)">
          <input
            name="dailyRateOverride"
            type="number"
            min="0"
            step="0.01"
            defaultValue={operation?.dailyRateOverride}
            placeholder="Tarif du contrat par défaut"
          />
        </Field>
        <Field label="Navire" wide>
          <select
            name="vessel"
            defaultValue={operation?.vessel || project.vessel}
          >
            {VESSELS.map((item) => (
              <option key={item.name}>{item.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Début *">
          <input
            name="start"
            type="date"
            required
            defaultValue={operation?.start || project.start}
          />
        </Field>
        <Field label="Fin *">
          <input
            name="end"
            type="date"
            required
            defaultValue={operation?.end || project.end}
          />
        </Field>
        <Field label="Port de livraison">
          <input name="port" defaultValue={operation?.port || project.port} />
        </Field>
        <Field label="Statut de l’opération">
          <select
            name="status"
            defaultValue={operation?.status || "Non validé"}
          >
            <option>Non validé</option>
            <option>Validé</option>
          </select>
        </Field>
      </div>
      {error ? (
        <p role="alert" className="pp-error">
          {error}
        </p>
      ) : null}
    </AppDialog>
  );
}

function DocumentDialog({
  document,
  project,
  onClose,
  onDownload,
  busy,
}: {
  document: PreviewDocument;
  project: PreviewProject;
  onClose: () => void;
  onDownload: () => void;
  busy: boolean;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!document.file) return;
    const value = URL.createObjectURL(document.file);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [document]);
  return (
    <AppDialog
      title={document.name}
      eyebrow={`${project.id} · ${document.category}`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Fermer</Button>
          <Button primary icon={Download} disabled={busy} onClick={onDownload}>
            Télécharger
          </Button>
        </>
      }
    >
      {url && document.file?.type.startsWith("image/") ? (
        <img className="pp-upload-preview" src={url} alt={document.name} />
      ) : url && document.file?.type === "application/pdf" ? (
        <iframe
          title={`Aperçu de ${document.name}`}
          src={url}
          className="pp-pdf-frame"
        />
      ) : (
        <div className="pp-document-sample">
          <FileText size={40} />
          <h3>{document.name}</h3>
          <p>
            {document.file
              ? "Ce format est disponible au téléchargement."
              : "Document illustratif de la bibliothèque. Le téléchargement produit un PDF de démonstration."}
          </p>
          <dl>
            <div>
              <dt>Projet</dt>
              <dd>
                {project.id} · {project.title}
              </dd>
            </div>
            <div>
              <dt>Provenance</dt>
              <dd>{document.origin}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{dateLabel(document.date)} 2026</dd>
            </div>
          </dl>
        </div>
      )}
    </AppDialog>
  );
}

function Catalog({
  initialSection,
  projects,
  onClose,
}: {
  initialSection: CatalogSection;
  projects: PreviewProject[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<string>(initialSection);
  const [search, setSearch] = useState("");
  const items =
    tab === "Clients"
      ? Array.from(new Set(projects.map((item) => item.client)))
      : tab === "Navires"
        ? VESSELS.map((item) => `${item.name} · ${item.lengthOverall} m`)
        : tab === "Remorqués"
          ? ["Barge Démonstration · 42 m", "Ponton Démonstration · 18 m"]
          : [
              "Mobilisation",
              "Démobilisation",
              "Assistance technique",
              "Spread antipollution",
            ];
  return (
    <AppDialog
      title={
        initialSection === "Clients"
          ? "Clients & affréteurs"
          : initialSection === "Navires"
            ? "Navires & remorqués"
            : "Catalogue de prestations"
      }
      onClose={onClose}
      size="lg"
    >
      <div className="pp-segmented">
        {["Clients", "Navires", "Remorqués", "Prestations"].map((name) => (
          <button
            key={name}
            aria-pressed={tab === name}
            onClick={() => {
              setTab(name);
              setSearch("");
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <label className="pp-search pp-catalog-search">
        <Search size={18} />
        <input
          aria-label="Rechercher dans le catalogue"
          value={search}
          placeholder={`Rechercher · ${tab.toLowerCase()}`}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <ul className="pp-catalog-list">
        {items
          .filter((item) =>
            item
              .toLocaleLowerCase("fr")
              .includes(search.toLocaleLowerCase("fr")),
          )
          .map((item) => (
            <li key={item}>
              <span>{item}</span>
              <span className="pp-category">Démonstration</span>
            </li>
          ))}
      </ul>
      <p className="pp-footnote">
        Les référentiels de cette prévisualisation sont proposés en
        consultation.
      </p>
    </AppDialog>
  );
}
