import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectContractPreview } from './ProjectContractPreview';
import { EMPTY_PROJECT_WRITE_INPUT } from './projectMutations';
import { emptyProjectLocationPlan } from './projectLocation';
import { emptySeaOperationWaypoint } from '../seaOperations/seaOperationModel';
import { BAREBOAT_CONTRACT_TYPE, BIMCO_CONTRACT_TYPE, COMMERCIAL_OFFER_CONTRACT_TYPE, TOWAGE_CONTRACT_TYPE, TIME_CHARTER_CONTRACT_TYPE } from './projectContractOptions';

vi.mock('../seaOperations/SeaOperationRouteMap', () => ({ SeaOperationRouteMap: () => <div>Carte de localisation</div> }));

describe('Project optional location appendix preview', () => {
  it.each([COMMERCIAL_OFFER_CONTRACT_TYPE, BIMCO_CONTRACT_TYPE, TOWAGE_CONTRACT_TYPE, BAREBOAT_CONTRACT_TYPE, TIME_CHARTER_CONTRACT_TYPE])('keeps localization out of the contract unless requested (%s)', contractType => {
    const plan = emptyProjectLocationPlan(); plan.points = [{ ...emptySeaOperationWaypoint('p'), number: '1', descriptionVhf: 'Lieu de travail', latitude: '49.65', longitude: '-1.62' }];
    const props = { form: { ...EMPTY_PROJECT_WRITE_INPUT, title: 'Projet test', contractType, locationPlan: plan }, projectCode: 'P1', towedAsset: null };
    const view = render(<ProjectContractPreview {...props} />);
    const completion = screen.getByLabelText(/% complété/).getAttribute('aria-label');
    expect(screen.queryByLabelText('Annexe Localisation')).not.toBeInTheDocument();
    view.rerender(<ProjectContractPreview {...props} form={{ ...props.form, locationPlan: { ...plan, includeInPdf: true } }} />);
    const next = screen.getByRole('button', { name: 'Page suivante' });
    for (let index = 0; index < 32 && !next.hasAttribute('disabled'); index++) fireEvent.click(next);
    expect(screen.getByLabelText('Annexe Localisation')).toBeInTheDocument();
    expect(screen.getByText('Lieu de travail')).toBeInTheDocument();
    expect(screen.getByLabelText(/% complété/)).toHaveAttribute('aria-label', completion!);
    expect(plan.includeInPdf).toBe(false);
  });
});
