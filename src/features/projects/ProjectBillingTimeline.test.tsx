import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectBillingTimeline } from './ProjectBillingTimeline';
import type { ProjectBillingDocument, ProjectBillingPeriod } from './projectBilling';
import type { ProjectContractRecord, ProjectPlanningOccurrenceRecord, ProjectRecord } from './projectQueries';

const project = { id: 80, startsOn: '2026-06-01', endsOn: '2026-10-31' } as ProjectRecord;

function period(id: number, month: string, values: Partial<ProjectBillingPeriod> = {}): ProjectBillingPeriod {
  return {
    id, projectId: project.id, companyId: 1, periodMonth: `${month}-01`, clientReference: '',
    invoiceNumber: '', invoiceIssuedOn: '', invoiceSentOn: '', paymentDueOn: '', paidOn: '',
    amountHt: 0, comments: '', ...values,
  };
}

function attachment(periodId: number, documentKind: ProjectBillingDocument['documentKind']): ProjectBillingDocument {
  return {
    id: periodId, billingPeriodId: periodId, chargeableExpenseId: null, documentKind, bucketName: 'project-files',
    objectPath: 'billing/fixture.pdf', fileName: 'Facture.pdf', mimeType: 'application/pdf', fileSizeBytes: 100,
  };
}

function operation(id: number, startsOn: string, endsOn: string, values: Partial<ProjectPlanningOccurrenceRecord> = {}): ProjectPlanningOccurrenceRecord {
  return {
    id, projectId: project.id, startsOn, endsOn, primaryVesselId: 1, primaryVesselName: 'GOURY', charterHire: null,
    hireCurrency: 'EUR', hireUnit: 'jour', status: '', description: '', sourceLabel: '', createdAt: '', ...values,
  };
}

function entries() {
  return within(screen.getByRole('region', { name: 'Chronologie du projet' })).getAllByRole('listitem');
}

function entryDates() {
  return entries().map((entry) => entry.querySelector('time')?.dateTime);
}

describe('project billing timeline', () => {
  it('identifies billed months from invoice evidence and omits draft or export-only months', () => {
    render(<ProjectBillingTimeline project={project} operations={[]} periods={[
      period(6, '2026-10', { paidOn: '2026-11-02' }),
      period(3, '2026-07', { invoiceIssuedOn: '2026-08-03' }),
      period(1, '2026-05', { invoiceNumber: '  ', amountHt: 125, paymentDueOn: '2026-06-15' }),
      period(2, '2026-06', { invoiceNumber: 'FAC-06' }),
      period(4, '2026-08'),
      period(5, '2026-09'),
    ]} documents={[attachment(1, 'export'), attachment(4, 'client_invoice')]} />);
    expect(entryDates()).toEqual(['2026-06', '2026-07', '2026-08', '2026-10', '2026-10-31']);
    expect(screen.getAllByText('Mois facturé')).toHaveLength(4);
    expect(entries()[0]).toHaveTextContent('juin 2026');
    expect(entries()[0]).toHaveTextContent('FAC-06');
    expect(entries().at(-1)).toHaveTextContent('Fin du contrat');
  });

  it('shows effective hire boundaries, including temporary overrides and the return to contract terms', () => {
    const contract = {
      charterHire: 1000, hireCurrency: 'EUR', hireUnit: 'jour', hirePeriods: [
        { id: 111, projectId: project.id, contractId: 1, startsOn: '2026-07-01', endsOn: '',
          charterHire: 1200, standbyHire: 1200, weatherStandbyHire: 850, hireCurrency: 'EUR', hireUnit: 'jour' },
      ],
    } as ProjectContractRecord;
    render(<ProjectBillingTimeline project={project} contract={contract} operations={[
      operation(1, '2026-06-01', '2026-10-31', { charterHire: 700, charterHireOverride: false }),
      operation(2, '2026-07-08', '2026-07-10', { charterHire: 0, charterHireOverride: true }),
      operation(3, '2026-08-01', '2026-08-05', { charterHire: 975, charterHireOverride: false }),
      operation(4, '2026-11-01', '2026-11-30', { charterHire: 990, charterHireOverride: true }),
    ]} />);
    expect(entryDates()).toEqual(['2026-06-01', '2026-07-01', '2026-07-08', '2026-07-11', '2026-10-31']);
    expect(entries()[0]).toHaveTextContent('Loyer initial');
    expect(entries()[1]).toHaveTextContent(/Affrètement · 1\s200 € \/ jour/);
    expect(entries()[1]).toHaveTextContent('Stand-by météo · 850 € / jour');
    expect(entries()[2]).toHaveTextContent('0 € / jour');
    expect(entries()[3]).toHaveTextContent(/1\s200 € \/ jour/);
    expect(entries().at(-1)).toHaveTextContent('Fin du contrat');
  });

  it('shows simultaneous rates by vessel and uses the recorded Paris contract end date', () => {
    render(<ProjectBillingTimeline project={{
      ...project, redeliveryAt: '2026-10-31T23:30:00Z', charterEndsAt: '2026-10-30T18:00:00+01:00',
    }} operations={[
      operation(2, '2026-07-08', '2026-07-10', { charterHire: 500, charterHireOverride: true }),
      operation(3, '2026-07-08', '2026-07-10', { primaryVesselId: 2, primaryVesselName: 'SUROIT', charterHire: 700, charterHireOverride: true }),
    ]} />);
    expect(entryDates()).toEqual(['2026-07-08', '2026-07-11', '2026-11-01']);
    expect(entries()[0]).toHaveTextContent('GOURY500 € / jour');
    expect(entries()[0]).toHaveTextContent('SUROIT700 € / jour');
    expect(entries().at(-1)).toHaveTextContent('Fin du contrat');
  });
});
