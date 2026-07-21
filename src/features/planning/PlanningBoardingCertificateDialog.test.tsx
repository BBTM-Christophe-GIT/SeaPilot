import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanningBoardingCertificateDialog } from './PlanningBoardingCertificateDialog';
import { generateBoardingCertificate } from './planningBoardingCertificate';
import { EMPTY_PLANNING_OVERVIEW } from './usePlanningOverview';

vi.mock('./planningBoardingCertificate', () => ({ generateBoardingCertificate: vi.fn() }));

const overview = {
  ...EMPTY_PLANNING_OVERVIEW,
  people: [
    { id: 10, firstName: 'Anne', lastName: 'MARTIN', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', active: true },
    { id: 11, firstName: 'Paul', lastName: 'DURAND', functionLabel: 'Matelot', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', active: false },
  ],
  vessels: [
    { id: 1, name: 'COTENTIN', acronym: 'CTN', active: true },
    { id: 2, name: 'GOURY', acronym: 'GY', active: false },
  ],
};

describe('Planning boarding certificate dialog', () => {
  beforeEach(() => {
    vi.mocked(generateBoardingCertificate).mockResolvedValue({ blob: new Blob(['test']), fileName: 'attestation.docx', data: {} as never });
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  it('uses all recorded En Mer periods, all vessels by default and PDF by default', async () => {
    const user = userEvent.setup();
    render(<PlanningBoardingCertificateDialog onClose={vi.fn()} overview={overview} />);

    expect(screen.getByRole('dialog', { name: "Attestation d'armement" })).toBeInTheDocument();
    expect(screen.getByText(/Toutes les périodes « En Mer »/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Du')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Au')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Format')).toHaveValue('pdf');
    expect(screen.getByText('Tous les navires', { selector: 'summary' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Marin'), '10');
    await user.click(screen.getByText('Tous les navires', { selector: 'summary' }));
    await user.click(screen.getByLabelText('GOURY (GY)'));
    await user.selectOptions(screen.getByLabelText('Format'), 'docx');
    await user.click(screen.getByRole('button', { name: "Générer l’attestation" }));

    await waitFor(() => expect(generateBoardingCertificate).toHaveBeenCalledWith('docx', overview, {
      personId: 10,
      vesselIds: [1],
    }));
  });
});
