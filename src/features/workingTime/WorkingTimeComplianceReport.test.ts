import type { SupabaseClient } from '@supabase/supabase-js';
import { createElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchWorkingTimeComplianceOptions,
  fetchWorkingTimeComplianceReport,
  type WorkingTimeComplianceReportData,
} from './workingTimeComplianceReportModel';
import { WorkingTimeComplianceReport, workingTimeComplianceErrorMessage } from './WorkingTimeComplianceReport';

vi.mock('./workingTimeComplianceReportModel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./workingTimeComplianceReportModel')>();
  return {
    ...actual,
    fetchWorkingTimeComplianceOptions: vi.fn(),
    fetchWorkingTimeComplianceReport: vi.fn(),
  };
});

const client = {} as SupabaseClient;
const report: WorkingTimeComplianceReportData = {
  analysis: 'Analyse', assumptions: [], breakdownByPerson: [], breakdownByVessel: [], end: '2026-12-31', formulas: [],
  generatedAt: '2026-08-09T00:00:00Z', methodologyLabel: 'Méthode', metricKeys: ['imca', 'french', 'non_compliance'],
  nonCompliantDays: 0, peopleAffected: 0, periodLabel: '2026', rates: {}, rawKpis: { exposure_hours: 0 }, start: '2026-01-01', trend: [], workHours: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchWorkingTimeComplianceOptions).mockResolvedValue({
    methodology: null,
    people: [
      { active: true, departedOn: null, firstName: 'Pierre', functionLabel: 'Capitaine', gradeLabel: '', isSelf: false, lastName: 'AUGUIN', personId: 1 },
      { active: true, departedOn: null, firstName: 'Christophe', functionLabel: 'Second Capitaine', gradeLabel: '', isSelf: true, lastName: 'MINASSIAN', personId: 2 },
      { active: true, departedOn: null, firstName: 'Loïc', functionLabel: 'Lieutenant', gradeLabel: '', isSelf: false, lastName: 'ALIX', personId: 3 },
      { active: true, departedOn: null, firstName: 'Léo', functionLabel: 'Matelot', gradeLabel: '', isSelf: false, lastName: 'BERENGER', personId: 4 },
    ],
    vessels: [
      { acronym: '', flagState: 'France', id: 10, imoNumber: '', name: 'GOURY' },
      { acronym: '', flagState: 'France', id: 11, imoNumber: '', name: 'LE ROZEL' },
      { acronym: '', flagState: 'France', id: 12, imoNumber: '', name: 'SUROIT' },
    ],
    watchGroups: ['Bordée 1', 'Bordée 2'],
  });
  vi.mocked(fetchWorkingTimeComplianceReport).mockResolvedValue(report);
});

describe('WorkingTimeComplianceReport', () => {
  it('does not expose an import-specific timeout message in the compliance report', () => {
    expect(workingTimeComplianceErrorMessage(new Error('canceling statement due to statement timeout')))
      .toBe('La génération du rapport a dépassé le délai serveur. Réduisez le périmètre ou relancez la génération.');
  });

  it('makes the all-vessels empty state explicit', async () => {
    render(createElement(WorkingTimeComplianceReport, { client, initialYear: 2026 }));

    expect(await screen.findByRole('button', { name: 'Tous les navires' })).toBeInTheDocument();
    expect(screen.getByText('Aucun navire sélectionné : tous les navires sont inclus.')).toBeInTheDocument();
    expect(within(screen.getByRole('complementary')).getByText('Tous les navires')).toBeInTheDocument();
  });

  it('synchronizes chips, counters, search results and report filters', async () => {
    const user = userEvent.setup();
    render(createElement(WorkingTimeComplianceReport, { client, initialYear: 2026 }));
    await screen.findByRole('button', { name: 'Tous les navires' });

    await user.selectOptions(screen.getByLabelText('Population'), 'sailors');
    await user.click(screen.getByRole('button', { name: 'Aucun marin sélectionné' }));
    await user.click(screen.getByRole('checkbox', { name: /AUGUIN Pierre/ }));
    await user.click(screen.getByRole('checkbox', { name: /MINASSIAN Christophe/ }));

    expect(screen.getByRole('button', { name: '2 marins sélectionnés' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Retirer AUGUIN Pierre' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirer MINASSIAN Christophe' })).toBeInTheDocument();
    expect(within(screen.getByRole('complementary')).getByText('2 marins sélectionnés')).toBeInTheDocument();

    const sailorSearch = screen.getByPlaceholderText('Rechercher un marin…');
    await user.type(sailorSearch, 'Alix');
    expect(screen.getByRole('checkbox', { name: /ALIX Loïc/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /AUGUIN Pierre/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tous les navires' }));
    expect(screen.queryByPlaceholderText('Rechercher un marin…')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Rechercher un navire…')).toBeInTheDocument();
    const gouryOption = screen.getByRole('checkbox', { name: 'GOURY' });
    const leRozelOption = screen.getByRole('checkbox', { name: 'LE ROZEL' });
    await user.click(gouryOption);
    await user.keyboard('{ArrowDown}');
    expect(leRozelOption).toHaveFocus();
    await user.click(leRozelOption);
    expect(screen.getByRole('button', { name: '2 navires sélectionnés' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByRole('complementary')).getByText('2 navires')).toBeInTheDocument();

    screen.getByRole('checkbox', { name: 'LE ROZEL' }).focus();
    await user.keyboard('{Escape}');
    expect(screen.queryByPlaceholderText('Rechercher un navire…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2 navires sélectionnés' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Générer le rapport' }));
    await waitFor(() => expect(fetchWorkingTimeComplianceReport).toHaveBeenCalledWith(client, expect.objectContaining({
      personIds: [1, 2],
      vesselIds: [10, 11],
    })));
  });

  it('supports select-all, clear and outside-click closing', async () => {
    const user = userEvent.setup();
    render(createElement(WorkingTimeComplianceReport, { client, initialYear: 2026 }));
    await screen.findByRole('button', { name: 'Tous les navires' });

    await user.click(screen.getByRole('button', { name: 'Tous les navires' }));
    await user.click(screen.getByRole('button', { name: 'Tout sélectionner' }));
    expect(screen.getByRole('button', { name: '3 navires sélectionnés' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Effacer' }));
    expect(screen.getByRole('button', { name: 'Tous les navires' })).toBeInTheDocument();

    await user.click(document.body);
    expect(screen.queryByPlaceholderText('Rechercher un navire…')).not.toBeInTheDocument();
  });
});
