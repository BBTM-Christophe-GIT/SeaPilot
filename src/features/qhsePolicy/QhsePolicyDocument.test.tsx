import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PublishedProcedureRecord } from '../procedures/procedureQueries';
import { QhsePolicyDocument } from './QhsePolicyDocument';
import { policyDriveUrls, policyPublications } from './qhsePolicyDocumentModel';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), url: vi.fn(), save: vi.fn() }));
vi.mock('../procedures/procedureQueries', () => ({ fetchPublishedProcedures: mocks.fetch, getProcedureFileUrl: mocks.url }));
vi.mock('./qhsePolicyQueries', () => ({ saveQhsePolicySettings: mocks.save }));
vi.mock('./QhsePolicyPdfReader', () => ({ default: ({ url, title }: { url: string; title: string }) => <div role="img" aria-label={title} data-url={url} /> }));
const client = {} as SupabaseClient;
const publication = {
  id: 46, title: 'Politique Santé Sécurité Environnement', procedureCode: 'POL 01-B',
  ismChapter: "02 - Politique en Matière de Sécurité et de Protection de l'Environnement",
  status: 'published', mimeType: 'application/pdf', fileName: 'politique.pdf', publishedOn: '2026-01-01',
} as PublishedProcedureRecord;

beforeEach(() => { vi.clearAllMocks(); mocks.fetch.mockResolvedValue([publication]); mocks.url.mockResolvedValue('https://storage.example.invalid/signed/politique.pdf'); mocks.save.mockResolvedValue(undefined); });

describe('QHSE policy document', () => {
  it('keeps only published chapter 02 PDFs and chooses the latest publication', () => {
    expect(policyPublications([publication, { ...publication, id: 47, publishedOn: '2026-06-01' },
      { ...publication, id: 48, ismChapter: '03' }, { ...publication, id: 49, status: 'draft' },
      { ...publication, id: 50, mimeType: 'application/msword', fileName: 'source.doc' },
    ]).map((record) => record.id)).toEqual([47, 46]);
  });

  it('limits external document URLs to canonical HTTPS Google Drive files', () => {
    expect(policyDriveUrls('https://drive.google.com/file/d/AbCdEf123456/view?usp=sharing')).toEqual({
      open: 'https://drive.google.com/file/d/AbCdEf123456/view', preview: 'https://drive.google.com/file/d/AbCdEf123456/preview',
    });
    for (const value of ['javascript:alert(1)', 'https://evil.example/file/d/AbCdEf123456/view', 'https://drive.google.com@evil.example/file/d/AbCdEf123456/view', 'https://user@drive.google.com/file/d/AbCdEf123456/view', 'http://drive.google.com/file/d/AbCdEf123456/view']) expect(policyDriveUrls(value)).toBeNull();
  });

  it('opens a published PDF in the reader without exposing editing to readers', async () => {
    render(<MemoryRouter><QhsePolicyDocument client={client} canEdit={false} settings={null} onSaved={vi.fn()} /></MemoryRouter>);
    expect(await screen.findByText(/POL 01-B/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier la politique' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Lire la politique' }));
    expect(await screen.findByRole('dialog', { name: 'Politique QHSE' })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: publication.title })).toHaveAttribute('data-url', 'https://storage.example.invalid/signed/politique.pdf');
    expect(mocks.url).toHaveBeenCalledWith(client, publication, 'open');
  });

  it('does not silently replace a selected inaccessible version with another policy', async () => {
    render(<MemoryRouter><QhsePolicyDocument client={client} canEdit={false} settings={{ publicationId: 99, documentUrl: '', revision: 1, updatedAt: '2026-10-02T10:00:00Z' }} onSaved={vi.fn()} /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('La version sélectionnée');
    expect(screen.getByRole('button', { name: 'Lire la politique' })).toBeDisabled();
  });

  it('captures the settings revision when editing and refreshes after saving', async () => {
    const onSaved = vi.fn();
    render(<MemoryRouter><QhsePolicyDocument client={client} canEdit settings={null} onSaved={onSaved} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Modifier la politique' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Modifier la politique' }));
    await userEvent.selectOptions(screen.getByLabelText('Version à afficher'), '46');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(client, { publicationId: 46, documentUrl: '', expectedRevision: null }));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
