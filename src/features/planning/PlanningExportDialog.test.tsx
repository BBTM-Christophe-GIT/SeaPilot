import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanningExportDialog } from './PlanningExportDialog';
import { fetchPlanningP13Data } from './planningP13Queries';
import { generatePlanningExport } from './planningP13Exports';
import { EMPTY_PLANNING_OVERVIEW } from './usePlanningOverview';

vi.mock('./planningP13Queries', () => ({ fetchPlanningP13Data: vi.fn() }));
vi.mock('./planningP13Exports', () => ({ generatePlanningExport: vi.fn() }));

const client = {} as SupabaseClient;
const overview = {
  ...EMPTY_PLANNING_OVERVIEW,
  people: [
    { id: 10, firstName: 'Anne', lastName: 'MARTIN', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', active: true },
    { id: 11, firstName: 'Paul', lastName: 'DURAND', functionLabel: 'Matelot', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', active: true },
  ],
  vessels: [
    { id: 1, name: 'COTENTIN', acronym: 'CTN', active: true },
    { id: 2, name: 'GOURY', acronym: 'GY', active: true },
  ],
};

describe('Planning export dialog', () => {
  beforeEach(() => {
    vi.mocked(fetchPlanningP13Data).mockResolvedValue({ policies: [], notifications: [], dependencies: [], p12: { absences: [], conflictCases: [], conflictHistory: [], matrices: [] } });
    vi.mocked(generatePlanningExport).mockResolvedValue({ blob: new Blob(['test']), fileName: 'marins.pdf' });
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  it('selects a period, one or more sailors and vessels, content and format', async () => {
    const user = userEvent.setup();
    render(<PlanningExportDialog client={client} onClose={vi.fn()} overview={overview} range={{ start: '2026-07-01', end: '2026-07-31' }} />);

    expect(await screen.findByRole('dialog', { name: 'Exports métier' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Attestation/ })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Générer l’export' })).toBeEnabled());

    await user.click(screen.getByText('Tous les marins', { selector: 'summary' }));
    await user.click(screen.getByLabelText('Tous les marins'));
    await user.click(screen.getByLabelText('Anne MARTIN'));
    await user.click(screen.getByText('Tous les navires', { selector: 'summary' }));
    await user.click(screen.getByLabelText('Tous les navires'));
    await user.click(screen.getByLabelText('COTENTIN (CTN)'));
    await user.clear(screen.getByLabelText('Du'));
    await user.type(screen.getByLabelText('Du'), '2026-07-05');
    await user.clear(screen.getByLabelText('Au'));
    await user.type(screen.getByLabelText('Au'), '2026-07-20');
    await user.selectOptions(screen.getByLabelText('Contenu'), 'sailor');
    await user.selectOptions(screen.getByLabelText('Format'), 'pdf');
    await user.click(screen.getByRole('button', { name: 'Générer l’export' }));

    await waitFor(() => expect(generatePlanningExport).toHaveBeenCalledWith('sailor', 'pdf', expect.objectContaining({
      startsOn: '2026-07-05',
      endsOn: '2026-07-20',
      personIds: [10],
      vesselIds: [1],
    })));
  });

});
