import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectPlanningEditor } from './ProjectEditors';

const project = {
  id: 145,
  projectCode: 'P145',
  title: 'OIL SPILL SAIPEM COU',
  description: 'Contrat antipollution',
  startsOn: '2026-08-10',
  endsOn: '2026-08-12',
};
const vessels = [
  { id: 1, name: 'LE ROZEL', acronym: 'LRZ', active: true, fleetExitOn: '', sharePointItemId: '' },
  { id: 2, name: 'SUROIT', acronym: 'SRT', active: true, fleetExitOn: '', sharePointItemId: '' },
];

function renderEditor(canViewCharterHire: boolean) {
  return render(
    <ProjectPlanningEditor
      canViewCharterHire={canViewCharterHire}
      client={{ rpc: vi.fn() } as never}
      initialVesselIds={[1]}
      onClose={vi.fn()}
      onSaved={vi.fn()}
      project={project}
      vessels={vessels}
    />,
  );
}

describe('ProjectPlanningEditor permissions', () => {
  it('never renders charter-hire controls for non Admin/Direction profiles', () => {
    renderEditor(false);
    expect(screen.queryByLabelText('Loyer d’affrètement')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Devise')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter un navire' })).toBeInTheDocument();
  });

  it('renders charter-hire controls for Admin/Direction profiles', () => {
    renderEditor(true);
    expect(screen.getByLabelText('Loyer d’affrètement')).toBeInTheDocument();
    expect(screen.getByLabelText('Devise')).toBeInTheDocument();
  });
});
