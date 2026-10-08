import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ProjectPreview } from './ProjectPreview';
import '../../../styles/design-tokens.css';
import './projectPreview.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><ProjectPreview /></StrictMode>,
);
