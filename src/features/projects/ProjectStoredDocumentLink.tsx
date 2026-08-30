import type { SupabaseClient } from '@supabase/supabase-js';
import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
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
}

export function ProjectStoredDocumentLink({
  client,
  document,
  includeIcon = false,
}: ProjectStoredDocumentLinkProps) {
  const isSupabaseDocument = Boolean(document.storageBucket && document.storagePath);
  const [accessUrl, setAccessUrl] = useState(isSupabaseDocument ? '' : document.sharePointWebUrl || '');
  const [accessError, setAccessError] = useState('');

  useEffect(() => {
    let active = true;
    setAccessError('');
    setAccessUrl(isSupabaseDocument ? '' : document.sharePointWebUrl || '');
    if (!isSupabaseDocument) return () => { active = false; };

    void createProjectDocumentAccessUrl(client, document)
      .then((url) => {
        if (active) setAccessUrl(url);
      })
      .catch((error: unknown) => {
        if (active) {
          setAccessError(error instanceof Error ? error.message : 'Document temporairement indisponible.');
        }
      });
    return () => { active = false; };
  }, [client, document.sharePointWebUrl, document.storageBucket, document.storagePath, isSupabaseDocument]);

  if (accessError) {
    return <span className="project-missing-link" title={accessError}>Document indisponible</span>;
  }
  if (!accessUrl) {
    return <span className="project-document-link-loading">Préparation du lien…</span>;
  }
  return (
    <a href={accessUrl} rel="noreferrer" target="_blank">
      {includeIcon ? <ExternalLink aria-hidden="true" size={14} /> : null}
      {isSupabaseDocument ? 'Ouvrir le document' : 'Ouvrir dans SharePoint'}
      <span className="sr-only"> : {document.fileName}</span>
    </a>
  );
}
