import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ProjectsWorkspacePreview } from "./ProjectsWorkspacePreview";
import "./projectPreview.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ProjectsWorkspacePreview />
  </StrictMode>,
);
