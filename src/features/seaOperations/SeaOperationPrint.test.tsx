import { render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { emptySeaOperation } from './seaOperationModel';
import type { SeaOperationRecord } from './seaOperationQueries';
import { SeaOperationPrint } from './SeaOperationPrint';

describe('Opération en Mer printable content', () => {
  it('shows the prepared RH image without claiming a decision signature, and uses only the recorded snapshot once signed', () => {
    const draft = emptySeaOperation();
    const record: SeaOperationRecord = {
      id: 'signature-fixture', companyId: 1, version: 1, status: 'draft', draft,
      createdBy: 'author', createdByName: 'Auteur', createdAt: '2026-10-16T08:00:00Z',
      updatedBy: 'author', updatedByName: 'Auteur', updatedAt: '2026-10-16T09:00:00Z',
      signedBy: null, signedByName: null, signedAt: null, captainName: null, canEdit: true, canSign: false,
    };
    const { container, rerender } = render(<SeaOperationPrint record={record} signatureImageUrl="https://private.test/prepared.png" />);
    const print = within(container.querySelector('article')!);
    expect(print.getByRole('img', { name: 'Aperçu de la signature RH du Capitaine sélectionné, non apposée' })).toHaveAttribute('src', 'https://private.test/prepared.png');
    expect(print.getByText('Signature RH préparée – décision non signée')).toBeInTheDocument();
    expect(print.queryByText('Identité du compte signataire')).not.toBeInTheDocument();
    rerender(<SeaOperationPrint record={{ ...record, status: 'signed', signatureUrl: 'https://private.test/immutable-snapshot.png' }} signatureImageUrl="https://private.test/other-captain.png" />);
    expect(print.getByRole('img', { name: 'Signature RH du Capitaine enregistrée avec cette décision' })).toHaveAttribute('src', 'https://private.test/immutable-snapshot.png');
    expect(container.querySelector('img[src="https://private.test/other-captain.png"]')).toBeNull();
  });

  it('retains long multiline fields as safe text with all recorded details outside form controls', () => {
    const draft = emptySeaOperation();
    const description = `<script>window.injected = true</script>\n${'Description opérationnelle détaillée. '.repeat(150)}`;
    const risks = `Risque identifié\n${'Mesure de sécurité à conserver intégralement. '.repeat(100)}`;
    const justification = `Justification complète\n${'Information à transmettre à l’Armement. '.repeat(80)}`;
    draft.project = 'Mission <inspection>';
    draft.description = description;
    draft.risks = risks;
    draft.checks.operationEquipment = 'no';
    draft.justifications.operationEquipment = justification;
    draft.specialPersonnel = [{ name: '<img src=x onerror=alert(1)>', phone: '+33 1 02 03 04 05' }];
    draft.waypoints = [{ id: 'waypoint-print-test', number: '1', descriptionVhf: 'Contact VHF\nCanal 16', latitude: '49 N', longitude: '001 W', ukc: '2 m', eta: '12:00', denseTraffic: true }];
    draft.decision = 'NO_GO';
    const record: SeaOperationRecord = {
      id: 'printed-draft', companyId: 1, version: 2, status: 'draft', draft,
      createdBy: 'author', createdByName: 'Auteur', createdAt: '2026-10-16T08:00:00Z',
      updatedBy: 'author', updatedByName: 'Auteur', updatedAt: '2026-10-16T09:00:00Z',
      signedBy: null, signedByName: null, signedAt: null, captainName: null, canEdit: true, canSign: false,
    };
    const { container } = render(<SeaOperationPrint record={record} />);
    const print = within(container.querySelector('article')!);
    expect(print.getByText('Description de l’opération', { selector: 'dt' }).nextElementSibling?.textContent).toBe(description);
    expect(print.getByText('Risques identifiés et informations à transmettre à l’Armement', { selector: 'dt' }).nextElementSibling?.textContent).toBe(risks);
    expect(print.getByText('Justification :').parentElement?.textContent).toBe(`Justification : ${justification}`);
    expect(print.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(print.getByRole('cell', { name: /Contact VHF\s+Canal 16/ }).textContent).toBe('Contact VHF\nCanal 16');
    expect(print.getByText('12:00')).toBeInTheDocument();
    expect(print.getByText('Brouillon – cette décision n’a pas été signée.')).toBeInTheDocument();
    expect(print.queryByText('Identité du compte signataire')).not.toBeInTheDocument();
    expect(container.querySelector('script, img[onerror], input, textarea, select')).toBeNull();
    expect(Array.from(container.querySelectorAll('img')).map((image) => image.getAttribute('src'))).toEqual(['/templates/sea-operation/word-header.png', '/templates/sea-operation/word-footer.png']);
  });
});
