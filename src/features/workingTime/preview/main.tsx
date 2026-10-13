import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkingTimePreview } from './WorkingTimePreview';
import '../../../styles/index.css';
import '../../../styles/design-tokens.css';
import '../../../styles/module-ribbon.css';
import '../../../styles/module-design.css';
import './workingTimePreview.css';

createRoot(document.getElementById('root')!).render(<StrictMode><WorkingTimePreview /></StrictMode>);
