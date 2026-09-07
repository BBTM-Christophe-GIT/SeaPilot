import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectRecord } from './projectQueries';
import { ProjectBillingPanel } from './ProjectBillingPanel';

const billingMocks = vi.hoisted(() => ({
  fetchProjectBillingData: vi.fn(),
  fetchProjectBillingDprs: vi.fn(),
  fetchProjectServiceCatalog: vi.fn(),
  generateBillingExportPackage: vi.fn(),
  saveProjectBillingPeriod: vi.fn(),
}));

const providerMocks = vi.hoisted(() => ({
  fetchServiceProviders: vi.fn(),
}));

vi.mock('./projectBilling', async (importOriginal) => ({
  ...await importOriginal<typeof import('./projectBilling')>(),
  ...billingMocks,
}));

vi.mock('../serviceProviders/serviceProviders', async (importOriginal) => ({
  ...await importOriginal<typeof import('../serviceProviders/serviceProviders')>(),
  ...providerMocks,
}));

const project = {
  id: 42,
  projectCode: 'P042',
  title: 'Projet de facturation',
  clientName: 'Client test',
  primaryVesselName: 'GOURY',
} as ProjectRecord;

describe('ProjectBillingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    billingMocks.fetchProjectBillingData.mockResolvedValue({ periods: [], expenses: [], documents: [], services: [] });
    billingMocks.fetchProjectBillingDprs.mockResolvedValue([]);
    billingMocks.fetchProjectServiceCatalog.mockResolvedValue([]);
    providerMocks.fetchServiceProviders.mockResolvedValue([]);
    billingMocks.saveProjectBillingPeriod.mockResolvedValue({
      id: 77,
      projectId: 42,
      companyId: 1,
      periodMonth: '2026-09-01',
      clientReference: 'P042',
      invoiceNumber: '',
      invoiceIssuedOn: '',
      invoiceSentOn: '',
      paymentDueOn: '',
      paidOn: '',
      amountHt: 0,
      comments: '',
      includeOperationsInPdf: true,
      includeExpensesInPdf: true,
      includeBbtmInPdf: true,
      excludedOperationKeys: [],
    });
    billingMocks.generateBillingExportPackage.mockResolvedValue({ blob: new Blob(['pdf']), extension: 'pdf' });
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:billing-preview'),
      revokeObjectURL: vi.fn(),
    }));
  });

  it('creates the monthly record automatically before generating the first preview', async () => {
    const user = userEvent.setup();
    render(
      <ProjectBillingPanel
        client={{} as never}
        initialMonth="2026-09"
        isManager
        operations={[]}
        project={project}
        visibleSections={{ services: false, bbtm: false, billingElements: true }}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Enregistrer les paramètres' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actualiser l’aperçu' }));

    await waitFor(() => expect(billingMocks.saveProjectBillingPeriod).toHaveBeenCalledOnce());
    expect(billingMocks.saveProjectBillingPeriod).toHaveBeenCalledWith({}, 42, expect.objectContaining({ periodMonth: '2026-09' }));
    await waitFor(() => expect(billingMocks.generateBillingExportPackage).toHaveBeenCalledOnce());
    expect(screen.queryByText('Enregistrez d’abord la fiche du mois.')).not.toBeInTheDocument();
    expect(await screen.findByTitle('Aperçu des éléments de facturation P042')).toHaveAttribute('src', 'blob:billing-preview');
  });
});
