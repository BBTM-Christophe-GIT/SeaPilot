import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlanningHandoverDialog } from './PlanningP03Panels';
import type { PlanningHandoverRecord, PlanningOverview } from './planningQueries';

const overview: PlanningOverview = {
  vessels: [{ id: 1, name: 'COTENTIN', acronym: 'CTN', active: true }],
  people: [
    { id: 10, firstName: 'Anne', lastName: 'MARTIN', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', active: true },
    { id: 11, firstName: 'Paul', lastName: 'DURAND', functionLabel: 'Matelot', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', active: true },
  ],
  assignments: [],
  days: [],
  periods: [],
  projects: [],
  certificates: [],
  hrDocuments: [],
  rules: [],
  publications: [],
  versions: [],
  history: [],
  handovers: [],
  derogations: [],
  derogationHistory: [],
};

const handover: PlanningHandoverRecord = {
  id: 77,
  vesselId: 1,
  handoverAt: '2026-07-15T10:00:00.000Z',
  location: 'Cherbourg',
  durationMinutes: 90,
  responsiblePersonId: 10,
  comments: 'Passation à quai',
  status: 'confirmed',
  createdBy: 'admin',
  updatedBy: 'admin',
  createdAt: '2026-07-13T20:00:00.000Z',
  updatedAt: '2026-07-13T20:00:00.000Z',
  positions: [{ id: 1, handoverId: 77, positionOrder: 0, functionLabel: 'Capitaine', outgoingPersonId: 10, incomingPersonId: 11, outgoingAssignmentId: null, incomingAssignmentId: null, comments: '' }],
};

describe('Planning P0.3 panels', () => {
  it('submits every required handover field and both crews', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<PlanningHandoverDialog editable handover={null} isSaving={false} onClose={vi.fn()} onSave={onSave} overview={overview} />);

    await user.selectOptions(screen.getByLabelText('Navire'), '1');
    fireEvent.change(screen.getByLabelText('Date et heure'), { target: { value: '2026-07-15T12:00' } });
    await user.type(screen.getByLabelText('Port ou lieu'), 'Cherbourg');
    await user.selectOptions(screen.getByLabelText('Responsable'), '10');
    fireEvent.change(screen.getByLabelText('Fonction'), { target: { value: 'Capitaine' } });
    await user.selectOptions(screen.getByLabelText('Sortant'), '10');
    await user.selectOptions(screen.getByLabelText('Entrant'), '11');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la relève' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      vesselId: '1',
      handoverAt: '2026-07-15T12:00',
      location: 'Cherbourg',
      responsiblePersonId: '10',
      positions: [expect.objectContaining({ functionLabel: 'Capitaine', outgoingPersonId: '10', incomingPersonId: '11' })],
    }));
  });

  it('keeps an existing handover read-only for a non-authorized profile', () => {
    render(<PlanningHandoverDialog editable={false} handover={handover} isSaving={false} onClose={vi.fn()} onSave={vi.fn()} overview={overview} />);

    expect(screen.queryByRole('button', { name: 'Enregistrer la relève' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Port ou lieu')).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Fermer' })).toHaveLength(2);
  });
});
