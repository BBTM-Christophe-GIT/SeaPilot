import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServiceNoteDocument } from './ServiceNoteDocument';
import type { ServiceNote, ServiceNoteSignature } from './serviceNoteQueries';

function signature(id: number, recipientId: number, signatureKind: ServiceNoteSignature['signatureKind'], signedAt: string): ServiceNoteSignature {
  return {
    id, noteId: 1, recipientId, userId: `user-${recipientId}`, personId: recipientId,
    identitySnapshot: {}, signatureSnapshot: null, signedAt, signatureKind,
  };
}

const note: ServiceNote = {
  id: 1, companyId: 1, chronologyCode: 'NS 09-26', subject: 'Test du registre', body: 'Contenu',
  vesselId: null, vesselName: '', scope: 'people', targetVessels: [], targetPersonIds: [1, 2, 3, 4],
  status: 'published', authorPersonId: null, authorIdentitySnapshot: {}, authorSignatureSnapshot: null,
  authoredOn: '2026-09-03', publishedAt: '2026-09-03T08:00:00Z', sourceKind: 'seapilot', sourceFileName: '',
  sourceWebUrl: '', sourceModifiedAt: '', createdBy: '', createdAt: '2026-09-03T08:00:00Z',
  updatedAt: '2026-09-03T08:00:00Z', lastRecalledChronologyCode: '', attachments: [],
  recipients: [
    { id: 1, noteId: 1, userId: 'user-1', personId: 1, firstName: 'Image', lastName: 'CAPTUREE', functionLabel: 'Marin' },
    { id: 2, noteId: 1, userId: 'user-2', personId: 2, firstName: 'Sans', lastName: 'IMAGE', functionLabel: 'Marin' },
    { id: 3, noteId: 1, userId: 'user-3', personId: 3, firstName: 'Archive', lastName: 'IMAGE', functionLabel: 'Marin' },
    { id: 4, noteId: 1, userId: 'user-4', personId: 4, firstName: 'Archive', lastName: 'SANS IMAGE', functionLabel: 'Marin' },
  ],
  signatures: [
    signature(11, 1, 'captured', '2026-09-03T08:30:00Z'),
    signature(12, 2, 'captured', '2026-09-02T08:30:00Z'),
    signature(13, 3, 'historical_assumed', ''),
    signature(14, 4, 'historical_assumed', ''),
  ],
};

describe('ServiceNoteDocument signature register', () => {
  it('shows signature images or a green signed marker and never invents historical dates', () => {
    const signatureUrls = new Map([[11, '/captured.png'], [13, '/historical.png']]);
    const { rerender } = render(<ServiceNoteDocument note={note} signatureUrls={signatureUrls} />);

    expect(screen.getByAltText('Signature de Image CAPTUREE')).toBeInTheDocument();
    expect(screen.getByAltText('Signature de Archive IMAGE')).toBeInTheDocument();
    expect(screen.getByText('Signé le : 03/09/2026')).toBeInTheDocument();
    expect(screen.getByText('Signé le : 02/09/2026')).toBeInTheDocument();
    expect(screen.getAllByText('Signé')).toHaveLength(2);
    expect(screen.queryByText(/Non renseignée/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Signature historique validée/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Archive réputée signée/)).not.toBeInTheDocument();

    rerender(<ServiceNoteDocument note={{ ...note, status: 'archived' }} signatureUrls={signatureUrls} />);
    expect(screen.queryByText(/Signé le :/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Signé')).toHaveLength(2);
  });

  it('renders safe rich text in the default Aptos-style document body', () => {
    const richNote = { ...note, body: '<h2>Consigne</h2><p style="text-align: center"><strong>Important</strong></p><ul><li>Premier point</li></ul><script>alert(1)</script>' };
    const { container } = render(<ServiceNoteDocument note={richNote} />);
    expect(screen.getByRole('heading', { name: 'Consigne' })).toBeInTheDocument();
    expect(screen.getByText('Important').closest('p')).toHaveStyle({ textAlign: 'center' });
    expect(screen.getByText('Premier point')).toBeInTheDocument();
    expect(container.querySelector('script')).not.toBeInTheDocument();
    expect(container.querySelector('.service-note-message-content')).toBeInTheDocument();
  });
});
