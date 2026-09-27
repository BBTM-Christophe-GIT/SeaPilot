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
import { billingTotal, createPreviewProjects, money } from "./previewModel";

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

  it("recalculates the billing selection and preserves cents", async () => {
    window.history.replaceState(
      null,
      "",
      "/previews/projects.html#P901/billing",
    );
    const user = userEvent.setup();
    render(<ProjectsWorkspacePreview />);
    expect(screen.getByText(/110\s*300\s*€/)).toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", { name: "Inclure Mobilisation du navire" }),
    );
    expect(screen.getByText(/95\s*300\s*€/)).toBeInTheDocument();
    expect(money(1.25)).toMatch(/1,25/);
    expect(billingTotal(createPreviewProjects()[0].billing)).toBe(110300);
  });
});
