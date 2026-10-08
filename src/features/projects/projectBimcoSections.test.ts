import { describe, expect, it } from 'vitest';
import { previewSupabaseClient } from '../preview/previewSupabaseClient';
import { BIMCO_P144_FIELDS, BIMCO_P144_BUSINESS_GROUPS } from './projectContractModels';
import { buildProjectBimcoSections } from './projectBimcoSections';
import { buildSupplytimePreview } from './projectReadModel';
import { fetchProjectsData } from './projectQueries';

describe('BIMCO business sections', () => {
  it('retains all 34 boxes, both signatures and the annex exactly once', () => {
    const keys = BIMCO_P144_BUSINESS_GROUPS.flatMap((group) => group.fields.map((field) => field.key));
    expect(keys).toHaveLength(37);
    expect(new Set(keys).size).toBe(37);
    expect([...keys].sort()).toEqual(BIMCO_P144_FIELDS.map((field) => field.key).sort());
  });

  it('preserves explicit P144 values, including zero and multiline conditions', async () => {
    const data = await fetchProjectsData(previewSupabaseClient);
    const project = data.projects.find((item) => item.projectCode === 'P144')!;
    const contract = data.projectContracts.find((item) => item.projectId === project.id)!;
    const saved = Object.fromEntries(BIMCO_P144_FIELDS.map((field) => [field.key, `${field.key}\nValeur contractuelle` ]));
    saved.p144_box12_mobilisation = '0';
    const fields = buildProjectBimcoSections(project, { ...contract, supplytimeData: saved }).flatMap((group) => group.fields);
    expect(fields).toHaveLength(37);
    for (const field of fields) expect(field.value).toBe(saved[field.key]);
  });

  it('keeps all legacy SUPPLYTIME fields accessible without renumbering their meaning', async () => {
    const data = await fetchProjectsData(previewSupabaseClient);
    const project = data.projects.find((item) => item.projectCode === 'P901')!;
    const contract = data.projectContracts.find((item) => item.projectId === project.id)!;
    const before = buildSupplytimePreview(project, contract).flatMap((group) => group.fields);
    const after = buildProjectBimcoSections(project, contract).flatMap((group) => group.fields);
    expect(after).toHaveLength(before.length);
    for (const field of before) expect(after.find((item) => item.key === field.key)?.value).toBe(field.value);
  });

  it('does not confuse historical delivery hours with P144 specialist operations', async () => {
    const data = await fetchProjectsData(previewSupabaseClient);
    const project = data.projects.find((item) => item.projectCode === 'P144')!;
    const contract = data.projectContracts.find((item) => item.projectId === project.id)!;
    const fields = buildProjectBimcoSections(project, { ...contract, supplytimeData: {
      ...contract.supplytimeData,
      box18_delivery_hour: '08:00',
      p144_box18_specialist_operations: 'ROV spécifique',
    } }).flatMap((group) => group.fields);
    expect(fields.find((field) => field.key === 'box18_delivery_hour')?.value).toBe('08:00');
    expect(fields.find((field) => field.key === 'p144_box18_specialist_operations')?.value).toBe('ROV spécifique');
  });
});
