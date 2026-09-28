import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectsWorkspacePreview } from "./ProjectsWorkspacePreview";
import { money } from "./previewModel";

beforeEach(() => {
  window.history.replaceState(
    null,
    "",
    "/previews/projects.html#P901/overview",
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("project workspace preview", () => {
  it("completes a contract locally and keeps the previous activity and documents", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(<ProjectsWorkspacePreview />);
    await user.click(
      screen.getByRole("button", { name: "Compléter le contrat" }),
    );
    expect(
      screen.getByRole("button", { name: "Émettre le contrat" }),
    ).toBeDisabled();
    await user.type(screen.getByLabelText("Armateur *"), "Armateur Test");
    await user.type(screen.getByLabelText("Port de livraison *"), "Brest");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(
      screen.getByRole("button", { name: "Émettre le contrat" }),
    ).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Historique" }));
    expect(screen.getByText(/Contrat modifié/)).toBeInTheDocument();
    expect(screen.getByText("Plan de campagne v2.pdf")).toBeInTheDocument();
    await user.click(
      within(
        screen.getByRole("navigation", { name: "Rubriques du projet" }),
      ).getByRole("button", { name: "Documents" }),
    );
    expect(
      screen.getByRole("button", { name: "Certificat du navire.pdf" }),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("adds an operation and retrieves it after archiving and restoring the project", async () => {
    const user = userEvent.setup();
    render(<ProjectsWorkspacePreview />);
    await user.click(
      screen.getByRole("button", { name: "Voir les opérations" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Nouvelle opération" }),
    );
    await user.type(
      screen.getByLabelText("Mission / opération *"),
      "Rotation 03",
    );
    await user.click(
      screen.getByRole("button", { name: "Enregistrer l’opération" }),
    );
    expect(
      screen.getByText("Rotation 03", { selector: "strong" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Autres actions du projet" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Archiver le projet" }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Archiver le projet",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Nouvelle opération" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Rotation 03", { selector: "strong" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Autres actions du projet" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Restaurer le projet" }),
    );
    expect(
      screen.getByRole("button", { name: "Nouvelle opération" }),
    ).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Historique" }));
    expect(screen.getByText(/Projet archivé/)).toBeInTheDocument();
    expect(
      screen.getByText(/Projet restauré/, { selector: "strong" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Projet créé/)).toBeInTheDocument();
  });

  it("keeps an added file and supports document filtering without uploading it", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    window.history.replaceState(
      null,
      "",
      "/previews/projects.html#P901/documents",
    );
    const user = userEvent.setup();
    render(<ProjectsWorkspacePreview />);
    const file = new File(["example"], "Compte-rendu.txt", {
      type: "text/plain",
    });
    fireEvent.change(screen.getByLabelText("Fichiers à ajouter"), {
      target: { files: [file] },
    });
    expect(
      screen.getByRole("button", { name: "Compte-rendu.txt" }),
    ).toBeInTheDocument();
    await user.type(
      screen.getByLabelText("Rechercher un document"),
      "inexistant",
    );
    expect(
      screen.getByText("Aucun document ne correspond à cette recherche."),
    ).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Rechercher un document"));
    await user.selectOptions(
      screen.getByLabelText("Catégorie de documents"),
      "Autre",
    );
    expect(
      screen.getByRole("button", { name: "Compte-rendu.txt" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Certificat du navire.pdf" }),
    ).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("saves monthly billing selections and restores the September draft after switching months", async () => {
    window.history.replaceState(
      null,
      "",
      "/previews/projects.html#P901/billing",
    );
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(<ProjectsWorkspacePreview />);
    expect(screen.getByText(/79\s*250\s*€/)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /Prestations BBTM 2/ }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Inclure Mobilisation du navire" }),
    );
    expect(screen.getByText(/64\s*250\s*€/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Relevé PDF" })).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Enregistrer le mois" }),
    );
    expect(screen.getByRole("button", { name: "Relevé PDF" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Mois de facturation"), {
      target: { value: "2026-10" },
    });
    expect(
      screen.getByText("Aucune prestation pour ce mois."),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Mois de facturation"), {
      target: { value: "2026-09" },
    });
    expect(
      screen.getByRole("checkbox", { name: "Inclure Mobilisation du navire" }),
    ).not.toBeChecked();
    expect(money(1.25)).toMatch(/1,25/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("adds an expense with a local attachment, edits it and preserves its document after removing the expense", async () => {
    window.history.replaceState(
      null,
      "",
      "/previews/projects.html#P901/billing",
    );
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(<ProjectsWorkspacePreview />);
    await user.click(
      screen.getByRole("button", { name: /Frais refacturables 2/ }),
    );
    await user.click(screen.getByRole("button", { name: "Ajouter un frais" }));
    await user.type(screen.getByLabelText("Fournisseur *"), "Fournisseur test");
    await user.type(
      screen.getByLabelText("Numéro de facture fournisseur *"),
      "TEST-001",
    );
    await user.type(screen.getByLabelText("Total HT *"), "123.45");
    fireEvent.change(screen.getByLabelText("Justificatifs du frais"), {
      target: {
        files: [
          new File(["annexe"], "justificatif.txt", { type: "text/plain" }),
        ],
      },
    });
    await user.click(
      screen.getByRole("button", { name: "Enregistrer le frais" }),
    );
    expect(screen.getByText("Fournisseur test")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Modifier le frais TEST-001" }),
    );
    await user.clear(screen.getByLabelText("Total HT *"));
    await user.type(screen.getByLabelText("Total HT *"), "150.55");
    await user.click(
      screen.getByRole("button", { name: "Enregistrer le frais" }),
    );
    expect(screen.getAllByText(/150,55/).length).toBeGreaterThan(0);
    await user.click(
      screen.getByRole("button", { name: "Retirer le frais TEST-001" }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Retirer le frais",
      }),
    );
    expect(screen.queryByText("Fournisseur test")).not.toBeInTheDocument();
    await user.click(
      within(
        screen.getByRole("navigation", { name: "Rubriques du projet" }),
      ).getByRole("button", { name: "Documents" }),
    );
    expect(
      screen.getByRole("button", { name: "justificatif.txt" }),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows both utilization metrics and treats archives as a storage filter", async () => {
    window.history.replaceState(null, "", "/previews/projects.html");
    const user = userEvent.setup();
    render(<ProjectsWorkspacePreview />);
    expect(
      screen.getByRole("img", { name: /M\/V Démonstration : prévu 77/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /M\/V Démonstration : réalisé 59/ }),
    ).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Rangement des dossiers"),
      "archived",
    );
    expect(
      screen.getByRole("button", { name: "Ouvrir P898" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ouvrir P901" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /M\/V Démonstration : prévu 77/ }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Catalogue de prestations" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Catalogue de prestations" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Mobilisation")).toBeInTheDocument();
  });
});
