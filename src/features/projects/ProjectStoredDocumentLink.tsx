import type { SupabaseClient } from '@supabase/supabase-js';
import { ExternalLink } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { createProjectDocumentAccessUrl } from './projectDocumentStorage';

interface ProjectStoredDocumentLinkProps {
  client: SupabaseClient;
  document: {
    fileName: string;
    sharePointWebUrl?: string;
    storageBucket?: string;
    storagePath?: string;
  };
  includeIcon?: boolean;
  children?: ReactNode;
  className?: string;
  title?: string;
}

export function ProjectStoredDocumentLink({
  client,
  document,
  includeIcon = false,
  children,
  className,
  title,
}: ProjectStoredDocumentLinkProps) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  async function open() {
    setOpening(true); setError('');
    const viewer = window.open('', '_blank');
    if (viewer) viewer.opener = null;
    try {
      const url = await createProjectDocumentAccessUrl(client, document);
      if (viewer) viewer.location.href = url;
      else { const link = window.document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.click(); }
    } catch (caught) {
      viewer?.close();
      setError(caught instanceof Error ? caught.message : 'Document indisponible.');
    } finally { setOpening(false); }
  }
  return <span className="project-stored-document-link"><button aria-label={`Ouvrir le document : ${document.fileName}`} aria-busy={opening} className={className || 'sp-button sp-button--secondary'} title={title} type="button" disabled={opening} onClick={() => void open()}>{children || <>{includeIcon ? <ExternalLink aria-hidden="true" size={14} /> : null}{opening ? 'Ouverture…' : 'Ouvrir'}</>}</button>{error ? <small role="alert">{error}</small> : null}</span>;
}
