import { useState, type FormEvent } from "react";
import {
  ArrowDownToLine,
  Check,
  Download,
  Eye,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { AppDialog } from "../../components/AppDialog";
import {
  dateLabel,
  downloadPreviewBlob,
  PREVIEW_DATE,
  type PreviewDocument,
  type PreviewProject,
} from "./previewModel";
import { PREVIEW_VESSELS } from "./portfolioModel";
import {
  buildBillingSummary,
  currencyAmount,
  generatePreviewBillingExport,
  getBillingMonth,
  HIRE_LABELS,
  previewDprs,
  SERVICE_CATALOG,
  type PreviewBillingMonth,
  type PreviewExpense,
  type PreviewHireRow,
  type PreviewService,
} from "./previewBillingModel";
import {
  PreviewButton as Button,
  PreviewField as Field,
} from "./PreviewControls";

import { PreviewPdfDocument } from "./PreviewPdfDocument";

const BILLING_TABS = [
  "Loyers & DPR",
  "Frais refacturables",
  "Prestations BBTM",
  "Suivi & pièces",
] as const;
type BillingTab = (typeof BILLING_TABS)[number];
type Dialog =
  | { type: "expense"; value?: PreviewExpense }
  | { type: "service"; value?: PreviewService }
  | { type: "dpr"; value: PreviewHireRow }
  | { type: "delete-expense"; value: PreviewExpense }
  | null;

export function PreviewBillingWorkspace({
  project,
  onChange,
  onDocuments,
  onOpenDocument,
  onToast,
}: {
  project: PreviewProject;
  onChange: (period: PreviewBillingMonth, event?: string) => void;
  onDocuments: (documents: PreviewDocument[]) => void;
  onOpenDocument: (document: PreviewDocument) => void;
  onToast: (message: string) => void;
}) {
  const [month, setMonth] = useState("2026-09");
  const [tab, setTab] = useState<BillingTab>("Loyers & DPR");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [pdf, setPdf] = useState<{ blob: Blob; name: string } | null>(null);
  const period = getBillingMonth(project, month);
  const summary = buildBillingSummary(project, period);
  const readOnly = project.archived;
  function change(patch: Partial<PreviewBillingMonth>, event?: string) {
    onChange({ ...period, ...patch, saved: false }, event);
  }
  async function exportFile(
    format: "pdf" | "merged-pdf" | "zip",
    preview = false,
  ) {
    setBusy(true);
    try {
      const result = await generatePreviewBillingExport(
        project,
        period,
        format,
      );
      if (preview)
        setPdf({
          blob: result.blob,
          name: result.fileName,
        });
      else {
        downloadPreviewBlob(result.blob, result.fileName);
        onToast(
          "Export de démonstration téléchargé avec la sélection du mois.",
        );
      }
    } catch (error) {
      onToast(
        error instanceof Error
          ? error.message
          : "Impossible de générer le document.",
      );
    } finally {
      setBusy(false);
    }
  }
  const includedCount = summary.hireRows.filter((row) => row.included).length;
  return (
    <div className="pp-billing-v2">
      <div className="pp-section-heading">
        <div>
          <h2>Préparer la facturation</h2>
          <p>
            Un dossier mensuel, du DPR aux justificatifs, jusqu’au suivi de
            paiement.
          </p>
        </div>
        <span className={`pp-save-state ${period.saved ? "is-saved" : ""}`}>
          {period.saved ? <Check size={15} /> : <Pencil size={15} />}{" "}
          {period.saved
            ? "Paramètres enregistrés"
            : "Modifications à enregistrer"}
        </span>
      </div>
      <section className="pp-panel pp-billing-period">
        <div className="pp-period-fields">
          <Field label="Mois de facturation">
            <input
              type="month"
              value={month}
              onChange={(e) => {
                if (e.target.value) setMonth(e.target.value);
              }}
            />
          </Field>
          <Field label="Périmètre des loyers">
            <select
              disabled={readOnly}
              value={period.periodMode}
              onChange={(e) =>
                change({ periodMode: e.target.value as "month" | "custom" })
              }
            >
              <option value="month">Mois entier</option>
              <option value="custom">Dates personnalisées</option>
            </select>
          </Field>
          <Field label="Navire facturé">
            <select
              value={period.vessel}
              disabled={readOnly}
              onChange={(e) => change({ vessel: e.target.value })}
            >
              <option value="">Tous les navires du projet</option>
              {PREVIEW_VESSELS.filter((item) =>
                project.operations.some((op) => op.vessel === item.name),
              ).map((item) => (
                <option key={item.name}>{item.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Référence client">
            <input
              value={period.clientReference}
              disabled={readOnly}
              placeholder="N° de commande / référence"
              onChange={(e) => change({ clientReference: e.target.value })}
            />
          </Field>
        </div>
        {period.periodMode === "custom" && (
          <div className="pp-custom-period">
            <Field label="Début du relevé">
              <input
                type="date"
                disabled={readOnly}
                value={period.start}
                onChange={(e) => change({ start: e.target.value })}
              />
            </Field>
            <Field label="Fin du relevé">
              <input
                type="date"
                disabled={readOnly}
                value={period.end}
                onChange={(e) => change({ end: e.target.value })}
              />
            </Field>
            <p>
              Les dates et le navire filtrent les loyers. Frais et prestations
              restent rattachés au mois sélectionné.
            </p>
          </div>
        )}
        {!summary.valid && (
          <p role="alert" className="pp-error">
            La période doit comporter une date de début et une date de fin
            cohérentes.
          </p>
        )}
      </section>
      <div className="pp-billing-layout">
        <div className="pp-billing-main">
          <nav
            className="pp-billing-tabs"
            aria-label="Rubriques de facturation"
          >
            {BILLING_TABS.map((name, index) => (
              <button
                key={name}
                aria-current={tab === name ? "page" : undefined}
                onClick={() => setTab(name)}
              >
                {name}{" "}
                <span>
                  {index === 0
                    ? summary.hireRows.length
                    : index === 1
                      ? period.expenses.length
                      : index === 2
                        ? period.services.length
                        : summary.attachments.length}
                </span>
              </button>
            ))}
          </nav>
          {tab === "Loyers & DPR" && (
            <section className="pp-panel pp-billing-section">
              <div className="pp-billing-section-heading">
                <div>
                  <h3>Les journées à facturer</h3>
                  <p>
                    {includedCount} journées sélectionnées ·{" "}
                    {summary.hireRows.length} prévues dans la période
                  </p>
                </div>
                <label className="pp-check-label">
                  <input
                    disabled={readOnly}
                    type="checkbox"
                    checked={period.includeHire}
                    onChange={(e) => change({ includeHire: e.target.checked })}
                  />
                  Inclure les loyers
                </label>
              </div>
              <details className="pp-hire-rates">
                <summary>
                  Tarifs appliqués <span>Opération, stand-by et météo</span>
                </summary>
                <div className="pp-form-grid">
                  {(["operation", "standby", "weather"] as const).map(
                    (mode) => (
                      <Field key={mode} label={`${HIRE_LABELS[mode]} · €/jour`}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={period.rates[mode]}
                          disabled={readOnly}
                          onChange={(e) =>
                            change({
                              rates: {
                                ...period.rates,
                                [mode]: Math.max(0, Number(e.target.value)),
                              },
                            })
                          }
                        />
                      </Field>
                    ),
                  )}
                </div>
                <p>
                  Priorité : montant du DPR, puis tarif de l’opération, puis
                  tarif contractuel de son activité. Tarifs illustratifs
                  modifiables pour ce mois.
                </p>
              </details>
              {summary.missing.length > 0 && (
                <div className="pp-billing-alert">
                  <TriangleAlert size={18} />
                  <div>
                    <strong>
                      {summary.missing.length} journées sans DPR{" "}
                      {period.completeMissing
                        ? "complétées pour cet export"
                        : "exclues des loyers"}
                    </strong>
                    <p>
                      Dont {summary.missing.filter((row) => row.future).length}{" "}
                      à venir. Un complément utilise le tarif « 24/24 Operation
                      » sans créer de DPR.
                    </p>
                    <label className="pp-check-label">
                      <input
                        type="checkbox"
                        disabled={readOnly}
                        checked={period.completeMissing}
                        onChange={(e) =>
                          change({ completeMissing: e.target.checked })
                        }
                      />
                      Compléter les journées sans DPR dans le relevé
                    </label>
                  </div>
                </div>
              )}
              <div className="pp-table-scroll">
                <table className="pp-table pp-hire-table">
                  <thead>
                    <tr>
                      <th>Inclure</th>
                      <th>Journée / navire</th>
                      <th>Activité & source</th>
                      <th>Montant HT</th>
                      <th>DPR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.hireRows.map((row) => (
                      <tr
                        key={row.key}
                        className={!row.included ? "pp-excluded-row" : ""}
                      >
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Inclure le ${row.date} ${row.vessel}`}
                            checked={row.included}
                            disabled={
                              readOnly ||
                              (row.missing && !period.completeMissing)
                            }
                            onChange={(e) =>
                              change({
                                excludedDays: e.target.checked
                                  ? period.excludedDays.filter(
                                      (key) => key !== row.key,
                                    )
                                  : [...period.excludedDays, row.key],
                              })
                            }
                          />
                        </td>
                        <td>
                          <strong>{dateLabel(row.date)}</strong>
                          <small>{row.vessel}</small>
                        </td>
                        <td>
                          <strong>
                            {row.missing
                              ? row.future
                                ? "Journée à venir"
                                : "DPR manquant"
                              : HIRE_LABELS[row.mode]}
                          </strong>
                          <small>
                            {row.missing
                              ? period.completeMissing
                                ? "Complément explicite · sans DPR"
                                : "Non retenue dans le total"
                              : row.origin}
                          </small>
                        </td>
                        <td>
                          {row.included && period.includeHire
                            ? currencyAmount(row.amount)
                            : "—"}
                        </td>
                        <td>
                          {row.report ? (
                            <button
                              className="pp-text-button"
                              aria-label={`Voir le DPR du ${row.date}`}
                              onClick={() =>
                                setDialog({ type: "dpr", value: row })
                              }
                            >
                              <Eye size={16} />
                              Voir
                            </button>
                          ) : (
                            <span className="pp-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!summary.hireRows.length && (
                <p className="pp-empty">
                  Aucune opération sur cette période pour le navire sélectionné.
                </p>
              )}
              <p className="pp-chart-foot">
                Les opérations restent visibles dans le PDF lorsque les montants
                des loyers sont exclus.
              </p>
            </section>
          )}
          {tab === "Frais refacturables" && (
            <section className="pp-panel pp-billing-section">
              <div className="pp-billing-section-heading">
                <div>
                  <h3>Frais fournisseurs</h3>
                  <p>
                    Montants, devises et pièces justificatives réunis par
                    dépense.
                  </p>
                </div>
                <Button
                  primary
                  icon={Plus}
                  disabled={readOnly}
                  onClick={() => setDialog({ type: "expense" })}
                >
                  Ajouter un frais
                </Button>
              </div>
              <label className="pp-check-label pp-section-toggle">
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={period.includeExpenses}
                  onChange={(e) =>
                    change({ includeExpenses: e.target.checked })
                  }
                />
                Inclure les frais et leurs pièces dans l’export
              </label>
              <div className="pp-expense-list">
                {period.expenses.map((expense) => (
                  <article
                    className={`pp-expense ${!expense.included || !period.includeExpenses ? "pp-excluded-row" : ""}`}
                    key={expense.id}
                  >
                    <div className="pp-expense-top">
                      <input
                        aria-label={`Inclure le frais ${expense.invoiceNumber}`}
                        type="checkbox"
                        disabled={readOnly}
                        checked={expense.included}
                        onChange={(e) =>
                          change({
                            expenses: period.expenses.map((item) =>
                              item.id === expense.id
                                ? { ...item, included: e.target.checked }
                                : item,
                            ),
                          })
                        }
                      />
                      <div>
                        <strong>{expense.supplier}</strong>
                        <span>
                          {expense.specialties} ·{" "}
                          {dateLabel(expense.invoiceDate)} ·{" "}
                          {expense.invoiceNumber}
                        </span>
                      </div>
                      <div className="pp-expense-price">
                        <strong>
                          {currencyAmount(expense.amountHt, expense.currency)}{" "}
                          <small>HT</small>
                        </strong>
                        <span>
                          {expense.amountTtc == null
                            ? "TTC non renseigné"
                            : `${currencyAmount(expense.amountTtc, expense.currency)} TTC`}
                        </span>
                      </div>
                      <button
                        className="pp-icon-button"
                        aria-label={`Modifier le frais ${expense.invoiceNumber}`}
                        disabled={readOnly}
                        onClick={() =>
                          setDialog({ type: "expense", value: expense })
                        }
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="pp-icon-button"
                        aria-label={`Retirer le frais ${expense.invoiceNumber}`}
                        disabled={readOnly}
                        onClick={() =>
                          setDialog({ type: "delete-expense", value: expense })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="pp-expense-bottom">
                      <div>
                        {expense.quantity != null && (
                          <span>
                            {expense.quantity} {expense.unit}
                          </span>
                        )}
                        {expense.comments && <p>{expense.comments}</p>}
                      </div>
                      <div className="pp-attachment-chips">
                        {expense.attachments.length ? (
                          expense.attachments.map((document) => (
                            <button
                              key={document.id}
                              onClick={() => onOpenDocument(document)}
                            >
                              <Paperclip size={14} />
                              {document.name}
                            </button>
                          ))
                        ) : (
                          <span className="pp-missing-piece">
                            <TriangleAlert size={14} />
                            Justificatif à ajouter
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {!period.expenses.length && (
                <p className="pp-empty">
                  Aucun frais pour ce mois. Ajoute une facture fournisseur et
                  ses pièces.
                </p>
              )}
              <p className="pp-chart-foot">
                Chaque devise garde son propre total. Les montants HT saisis
                sont les totaux de facture ; la quantité est informative.
              </p>
            </section>
          )}
          {tab === "Prestations BBTM" && (
            <section className="pp-panel pp-billing-section">
              <div className="pp-billing-section-heading">
                <div>
                  <h3>Prestations complémentaires</h3>
                  <p>
                    Mobilisation, équipement et interventions selon le
                    catalogue.
                  </p>
                </div>
                <Button
                  primary
                  icon={Plus}
                  disabled={readOnly}
                  onClick={() => setDialog({ type: "service" })}
                >
                  Ajouter une prestation
                </Button>
              </div>
              <label className="pp-check-label pp-section-toggle">
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={period.includeServices}
                  onChange={(e) =>
                    change({ includeServices: e.target.checked })
                  }
                />
                Inclure les prestations BBTM
              </label>
              <div className="pp-service-list">
                {period.services.map((service) => (
                  <article className="pp-service" key={service.id}>
                    <input
                      aria-label={`Inclure ${service.category}`}
                      type="checkbox"
                      disabled={readOnly}
                      checked={service.included}
                      onChange={(e) =>
                        change({
                          services: period.services.map((line) =>
                            line.id === service.id
                              ? { ...line, included: e.target.checked }
                              : line,
                          ),
                        })
                      }
                    />
                    <div>
                      <strong>{service.category}</strong>
                      <p>{service.description}</p>
                      <span>
                        {service.quantity} × {currencyAmount(service.price)}
                      </span>
                    </div>
                    <strong>
                      {currencyAmount(service.price * service.quantity)}
                    </strong>
                    <button
                      className="pp-icon-button"
                      aria-label={`Modifier ${service.category}`}
                      disabled={readOnly}
                      onClick={() =>
                        setDialog({ type: "service", value: service })
                      }
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="pp-icon-button"
                      aria-label={`Retirer ${service.category}`}
                      disabled={readOnly}
                      onClick={() =>
                        change(
                          {
                            services: period.services.filter(
                              (line) => line.id !== service.id,
                            ),
                          },
                          "Prestation retirée",
                        )
                      }
                    >
                      <X size={16} />
                    </button>
                  </article>
                ))}
              </div>
              {!period.services.length && (
                <p className="pp-empty">Aucune prestation pour ce mois.</p>
              )}
              <p className="pp-chart-foot">
                La quantité peut être saisie librement ou reprise des DPR en «
                24/24 Operation ».
              </p>
            </section>
          )}
          {tab === "Suivi & pièces" && (
            <section className="pp-panel pp-billing-section">
              <div className="pp-billing-section-heading">
                <div>
                  <h3>Suivre le dossier de facturation</h3>
                  <p>
                    Ces informations sont propres à{" "}
                    {new Date(`${month}-01T12:00:00`).toLocaleDateString(
                      "fr-FR",
                      { month: "long", year: "numeric" },
                    )}
                    .
                  </p>
                </div>
                <span className="pp-status is-muted">
                  {period.paidOn
                    ? "Payé"
                    : period.invoiceSentOn
                      ? "Envoyé"
                      : period.invoiceNumber
                        ? "Émis"
                        : "À préparer"}
                </span>
              </div>
              <fieldset
                disabled={readOnly}
                className="pp-tracking-fields pp-form-grid"
              >
                <Field label="Numéro de facture">
                  <input
                    value={period.invoiceNumber}
                    onChange={(e) => change({ invoiceNumber: e.target.value })}
                  />
                </Field>
                {(
                  [
                    { key: "invoiceIssuedOn", label: "Date d’émission" },
                    { key: "invoiceSentOn", label: "Date d’envoi" },
                    { key: "paymentDueOn", label: "Échéance de paiement" },
                    { key: "paidOn", label: "Date de paiement" },
                  ] as const
                ).map(({ key, label }) => (
                  <Field key={key} label={label}>
                    <input
                      type="date"
                      value={period[key]}
                      onChange={(e) => change({ [key]: e.target.value })}
                    />
                  </Field>
                ))}
                <Field label="Commentaire du relevé" wide>
                  <textarea
                    rows={3}
                    value={period.comments}
                    onChange={(e) => change({ comments: e.target.value })}
                  />
                </Field>
              </fieldset>
              <div className="pp-included-pieces">
                <h4>
                  Pièces jointes sélectionnées pour l’export{" "}
                  <span>{summary.attachments.length}</span>
                </h4>
                {summary.attachments.map((document) => (
                  <button
                    key={document.id}
                    onClick={() => onOpenDocument(document)}
                  >
                    <FileText size={18} />
                    {document.name}
                    <Eye size={16} />
                  </button>
                ))}
                {!summary.attachments.length && (
                  <p>
                    Aucune pièce incluse. Ajoute les justificatifs depuis les
                    frais refacturables.
                  </p>
                )}
              </div>
              <p className="pp-chart-foot">
                Le suivi est renseigné manuellement dans cette maquette. Aucun
                envoi au client ni règlement bancaire n’est déclenché.
              </p>
            </section>
          )}
        </div>
        <aside className="pp-month-summary">
          <div className="pp-summary-header">
            <span className="pp-eyebrow">RELEVÉ DU MOIS</span>
            <h3>
              {new Date(`${month}-01T12:00:00`).toLocaleDateString("fr-FR", {
                month: "long",
                year: "numeric",
              })}
            </h3>
            <p>
              {dateLabel(summary.start)} — {dateLabel(summary.end)}
            </p>
          </div>
          <dl>
            <div>
              <dt>Loyers & DPR</dt>
              <dd>{currencyAmount(summary.hire)}</dd>
            </div>
            <div>
              <dt>Frais refacturables</dt>
              <dd>
                {Object.keys(summary.expensesByCurrency).length
                  ? Object.entries(summary.expensesByCurrency).map(
                      ([currency, value]) => (
                        <span key={currency}>
                          {currencyAmount(value, currency)}
                        </span>
                      ),
                    )
                  : currencyAmount(0)}
              </dd>
            </div>
            <div>
              <dt>Prestations BBTM</dt>
              <dd>{currencyAmount(summary.services)}</dd>
            </div>
          </dl>
          <div className="pp-summary-total">
            <span>Total sélectionné HT</span>
            {Object.entries(summary.currencies).map(([currency, value]) => (
              <strong key={currency}>{currencyAmount(value, currency)}</strong>
            ))}
            {Object.keys(summary.currencies).length > 1 && (
              <small>Totaux séparés, sans conversion de devises.</small>
            )}
          </div>
          {period.includeExpenses && summary.missingDocuments > 0 && (
            <div className="pp-summary-warning">
              <Paperclip size={16} />
              {summary.missingDocuments} frais sans justificatif
            </div>
          )}
          <div className="pp-export-actions">
            <Button
              primary
              icon={Save}
              disabled={readOnly || !summary.valid || period.saved}
              onClick={() => {
                onChange(
                  { ...period, saved: true },
                  "Facturation mensuelle enregistrée",
                );
                onToast(
                  `Paramètres de ${month} enregistrés dans cette session.`,
                );
              }}
            >
              Enregistrer le mois
            </Button>
            <Button
              icon={Eye}
              disabled={busy || !period.saved || !summary.valid}
              onClick={() => void exportFile("pdf", true)}
            >
              Prévisualiser le PDF
            </Button>
            <div className="pp-export-divider">TÉLÉCHARGER</div>
            <Button
              icon={Download}
              disabled={busy || !period.saved || !summary.valid}
              onClick={() => void exportFile("pdf")}
            >
              Relevé PDF
            </Button>
            <Button
              icon={FileText}
              disabled={busy || !period.saved || !summary.valid}
              onClick={() => void exportFile("merged-pdf")}
            >
              PDF avec annexes PDF
            </Button>
            <Button
              icon={ArrowDownToLine}
              disabled={busy || !period.saved || !summary.valid}
              onClick={() => void exportFile("zip")}
            >
              ZIP · relevé + toutes les pièces
            </Button>
            <p>
              {busy
                ? "Génération en cours…"
                : !period.saved
                  ? "Enregistre les modifications pour actualiser les exports."
                  : "Seuls les éléments cochés sont exportés. Le ZIP conserve aussi les images et autres formats."}
            </p>
          </div>
        </aside>
      </div>
      <p className="pp-footnote">
        Données et DPR fictifs · sauvegarde limitée à cette session · exports de
        démonstration sans valeur comptable.
      </p>
      {dialog?.type === "expense" && (
        <ExpenseDialog
          value={dialog.value}
          project={project}
          month={month}
          onClose={() => setDialog(null)}
          onSave={(expense, newDocuments) => {
            change(
              {
                expenses: dialog.value
                  ? period.expenses.map((item) =>
                      item.id === expense.id ? expense : item,
                    )
                  : [...period.expenses, expense],
              },
              dialog.value
                ? "Frais fournisseur modifié"
                : "Frais fournisseur ajouté",
            );
            if (newDocuments.length) onDocuments(newDocuments);
            setDialog(null);
          }}
        />
      )}
      {dialog?.type === "service" && (
        <ServiceDialog
          value={dialog.value}
          suggestedQuantity={
            summary.hireRows.filter((row) => row.report?.mode === "operation")
              .length
          }
          onClose={() => setDialog(null)}
          onSave={(service) => {
            change(
              {
                services: dialog.value
                  ? period.services.map((item) =>
                      item.id === service.id ? service : item,
                    )
                  : [...period.services, service],
              },
              dialog.value ? "Prestation modifiée" : "Prestation ajoutée",
            );
            setDialog(null);
          }}
        />
      )}
      {dialog?.type === "delete-expense" && (
        <AppDialog
          title="Retirer ce frais du relevé ?"
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button onClick={() => setDialog(null)}>Conserver</Button>
              <Button
                primary
                onClick={() => {
                  change(
                    {
                      expenses: period.expenses.filter(
                        (item) => item.id !== dialog.value.id,
                      ),
                    },
                    "Frais retiré du relevé",
                  );
                  setDialog(null);
                }}
              >
                Retirer le frais
              </Button>
            </>
          }
        >
          <p>
            {dialog.value.supplier} · {dialog.value.invoiceNumber}
          </p>
          <p>
            Les fichiers déjà ajoutés à la bibliothèque du projet et les
            événements de l’historique restent conservés.
          </p>
        </AppDialog>
      )}
      {dialog?.type === "dpr" && (
        <AppDialog
          title={`DPR du ${dateLabel(dialog.value.date)}`}
          eyebrow={dialog.value.vessel}
          onClose={() => setDialog(null)}
        >
          <dl className="pp-dpr-detail">
            <div>
              <dt>Activité</dt>
              <dd>{HIRE_LABELS[dialog.value.mode]}</dd>
            </div>
            <div>
              <dt>Arrivée / départ</dt>
              <dd>
                {dialog.value.report?.arrival} /{" "}
                {dialog.value.report?.departure}
              </dd>
            </div>
            <div>
              <dt>Consommation carburant</dt>
              <dd>{dialog.value.report?.fuelLiters} L</dd>
            </div>
            <div>
              <dt>Montant retenu</dt>
              <dd>{currencyAmount(dialog.value.amount)}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{dialog.value.origin}</dd>
            </div>
          </dl>
          <p className="pp-footnote">
            Compte rendu journalier de démonstration.
          </p>
        </AppDialog>
      )}
      {pdf && (
        <AppDialog
          title="Prévisualisation du relevé"
          size="xl"
          onClose={() => setPdf(null)}
          footer={
            <Button icon={Download} onClick={() => void exportFile("pdf")}>
              Télécharger le PDF
            </Button>
          }
        >
          <PreviewPdfDocument blob={pdf.blob} />
        </AppDialog>
      )}
    </div>
  );
}

function ExpenseDialog({
  value,
  project,
  month,
  onClose,
  onSave,
}: {
  value?: PreviewExpense;
  project: PreviewProject;
  month: string;
  onClose: () => void;
  onSave: (value: PreviewExpense, documents: PreviewDocument[]) => void;
}) {
  const [attachments, setAttachments] = useState(value?.attachments || []);
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) || "").trim();
    const amountHt = Number(text("amountHt"));
    const amountTtc = text("amountTtc") ? Number(text("amountTtc")) : null;
    if (
      !text("supplier") ||
      !text("invoiceNumber") ||
      !Number.isFinite(amountHt) ||
      amountHt < 0
    ) {
      setError(
        "Renseigne le fournisseur, le numéro et un montant HT positif ou nul.",
      );
      return;
    }
    const expense: PreviewExpense = {
      id: value?.id || Date.now(),
      supplier: text("supplier"),
      specialties: text("specialties"),
      invoiceDate: text("invoiceDate"),
      invoiceNumber: text("invoiceNumber"),
      amountHt,
      amountTtc,
      currency: text("currency"),
      quantity: text("quantity") ? Number(text("quantity")) : null,
      unit: text("unit"),
      comments: text("comments"),
      dprId: text("dprId"),
      included: value?.included ?? true,
      attachments,
    };
    onSave(
      expense,
      attachments.filter(
        (document) =>
          !value?.attachments.some((item) => item.id === document.id),
      ),
    );
  }
  return (
    <AppDialog
      title={
        value ? "Modifier le frais fournisseur" : "Ajouter un frais fournisseur"
      }
      eyebrow={`FACTURATION · ${month}`}
      size="lg"
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button primary type="submit">
            Enregistrer le frais
          </Button>
        </>
      }
    >
      <datalist id="pp-suppliers">
        <option>Avitaillement Atlantique Démo</option>
        <option>Port Démonstration</option>
      </datalist>
      <div className="pp-form-grid">
        <Field label="Fournisseur *">
          <input
            name="supplier"
            required
            list="pp-suppliers"
            defaultValue={value?.supplier}
            placeholder="Choisir ou saisir un nouveau fournisseur"
          />
        </Field>
        <Field label="Spécialité">
          <input
            name="specialties"
            defaultValue={value?.specialties}
            placeholder="Carburant, port, matériel…"
          />
        </Field>
        <Field label="Numéro de facture fournisseur *">
          <input
            name="invoiceNumber"
            required
            defaultValue={value?.invoiceNumber}
          />
        </Field>
        <Field label="Date de facture *">
          <input
            type="date"
            name="invoiceDate"
            required
            defaultValue={value?.invoiceDate || `${month}-01`}
          />
        </Field>
        <Field label="Total HT *">
          <input
            type="number"
            min="0"
            step="0.01"
            name="amountHt"
            required
            defaultValue={value?.amountHt}
          />
        </Field>
        <Field label="Total TTC">
          <input
            type="number"
            min="0"
            step="0.01"
            name="amountTtc"
            defaultValue={value?.amountTtc ?? ""}
          />
        </Field>
        <Field label="Devise">
          <select name="currency" defaultValue={value?.currency || "EUR"}>
            <option>EUR</option>
            <option>USD</option>
            <option>GBP</option>
          </select>
        </Field>
        <Field label="Quantité">
          <input
            type="number"
            min="0"
            step="0.01"
            name="quantity"
            defaultValue={value?.quantity ?? ""}
          />
        </Field>
        <Field label="Unité">
          <input
            name="unit"
            defaultValue={value?.unit}
            placeholder="L, unité, jour…"
          />
        </Field>
        <Field label="DPR associé">
          <select name="dprId" defaultValue={value?.dprId || ""}>
            <option value="">Aucun DPR lié</option>
            {previewDprs(project).map((dpr) => (
              <option key={dpr.id} value={dpr.id}>
                {dpr.date} · {dpr.vessel}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Commentaire" wide>
          <textarea name="comments" rows={2} defaultValue={value?.comments} />
        </Field>
      </div>
      <div className="pp-expense-upload">
        <label>
          <Paperclip size={17} />
          Ajouter des justificatifs
          <input
            aria-label="Justificatifs du frais"
            type="file"
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              setAttachments((items) => [
                ...items,
                ...files.map((file, index) => ({
                  id: Date.now() + index,
                  name: file.name,
                  file,
                  category: "Facturation",
                  date: PREVIEW_DATE,
                  origin: "Justificatif fournisseur · démo",
                })),
              ]);
              e.target.value = "";
            }}
          />
        </label>
        {attachments.map((document) => (
          <div key={document.id}>
            <FileText size={16} />
            <span>{document.name}</span>
            <button
              type="button"
              className="pp-icon-button"
              aria-label={`Détacher ${document.name}`}
              onClick={() =>
                setAttachments((items) =>
                  items.filter((item) => item.id !== document.id),
                )
              }
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
      <p className="pp-footnote">
        Un fournisseur librement saisi et les pièces ajoutées restent locaux à
        cette prévisualisation.
      </p>
      {error && (
        <p className="pp-error" role="alert">
          {error}
        </p>
      )}
    </AppDialog>
  );
}

function ServiceDialog({
  value,
  suggestedQuantity,
  onClose,
  onSave,
}: {
  value?: PreviewService;
  suggestedQuantity: number;
  onClose: () => void;
  onSave: (value: PreviewService) => void;
}) {
  const [category, setCategory] = useState(
    value?.category || SERVICE_CATALOG[0].category,
  );
  const [description, setDescription] = useState(
    value?.description || SERVICE_CATALOG[0].description,
  );
  const [price, setPrice] = useState(value?.price ?? SERVICE_CATALOG[0].price);
  const [quantity, setQuantity] = useState(value?.quantity ?? 1);
  return (
    <AppDialog
      title={value ? "Modifier la prestation" : "Ajouter une prestation BBTM"}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          id: value?.id || Date.now(),
          category: category.trim(),
          description,
          price,
          quantity,
          included: value?.included ?? true,
        });
      }}
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button primary type="submit">
            Enregistrer la prestation
          </Button>
        </>
      }
    >
      <div className="pp-form-grid">
        <Field label="Choisir dans le catalogue" wide>
          <select
            value={
              SERVICE_CATALOG.some((item) => item.category === category)
                ? category
                : ""
            }
            onChange={(e) => {
              const item = SERVICE_CATALOG.find(
                (item) => item.category === e.target.value,
              );
              setCategory(item?.category || "");
              setDescription(item?.description || "");
              setPrice(item?.price || 0);
            }}
          >
            <option value="">Prestation personnalisée</option>
            {SERVICE_CATALOG.map((item) => (
              <option key={item.category}>{item.category}</option>
            ))}
          </select>
        </Field>
        <Field label="Libellé de la prestation *" wide>
          <input
            required
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </Field>
        <Field label="Description" wide>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="Prix unitaire HT (€) *">
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
          />
        </Field>
        <Field label="Quantité *">
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </Field>
      </div>
      <Button onClick={() => setQuantity(suggestedQuantity)}>
        Reprendre les {suggestedQuantity} DPR en 24/24 Operation
      </Button>
      <p className="pp-service-total">
        Total HT <strong>{currencyAmount(price * quantity)}</strong>
      </p>
    </AppDialog>
  );
}
