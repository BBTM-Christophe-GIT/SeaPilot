import { describe, expect, it } from 'vitest';
import {
  getSharePointImportOrder,
  getSharePointSourceByKey,
  getSharePointSourcesByModule,
  SHAREPOINT_MIGRATION_SOURCES,
  SHAREPOINT_RECONCILIATION_COLUMNS,
} from './sharePointInventory';

describe('SharePoint migration inventory', () => {
  it('registers the confirmed QHSE document libraries needed by SeaPilot imports', () => {
    expect(SHAREPOINT_MIGRATION_SOURCES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'library-brevets-visites-medicales',
          sourceType: 'library',
          moduleKey: 'humanResources',
          title: 'Brevets et Visites Medicales',
          targetTable: 'hr_documents',
          driveId: 'b!j0eX05ggd0iS7a1x5WccnspY9pQFKhPc9dkTkf_MxKjjFptv3QpsTtkjX4xBr',
        }),
        expect.objectContaining({
          key: 'library-certificats-flotte',
          sourceType: 'library',
          moduleKey: 'certificates',
          title: 'Certificats Flotte BBTM',
          targetTable: 'fleet_certificates',
        }),
        expect.objectContaining({
          key: 'library-qsms-pdf',
          sourceType: 'library',
          moduleKey: 'procedures',
          title: 'QSMS - PDF',
        }),
      ]),
    );
  });

  it('registers critical SharePoint lists with their target SeaPilot tables', () => {
    expect(getSharePointSourceByKey('list-rh-personnel-bbtm')).toEqual(
      expect.objectContaining({
        listId: '3b6f504c-908a-4d3e-8319-a595acb54efe',
        serverRelativeUrl: '/sites/QHSE/Lists/RH%20%20Personnel%20BBTM',
        targetTable: 'people',
      }),
    );
    expect(getSharePointSourceByKey('list-smtr-journees-planning')).toEqual(
      expect.objectContaining({
        listId: 'e711a664-6c52-4e4e-95cc-0843ac7c5253',
        targetTable: 'planning_days',
      }),
    );
    expect(getSharePointSourceByKey('list-bbtm-flotte')).toEqual(
      expect.objectContaining({
        listId: '543b9f00-aed2-489a-808a-7b64cc835a83',
        targetTable: 'vessels',
      }),
    );
    expect(getSharePointSourceByKey('list-smtr-planning-periodes')).toEqual(
      expect.objectContaining({
        listId: 'c03eb1f4-1d24-4d86-b91e-9afaaa45870b',
        targetTable: 'planning_periods',
      }),
    );
    expect(getSharePointSourceByKey('list-administration-prestataires-fournisseurs')).toEqual(
      expect.objectContaining({
        listId: '5e29f7db-a85e-4147-9c54-b00f0e588f7e',
        targetTable: 'service_providers',
      }),
    );
  });

  it('groups sources by module for migration work queues', () => {
    expect(getSharePointSourcesByModule('planning').map((source) => source.key)).toEqual([
      'list-bbtm-flotte',
      'list-administration-prestataires-fournisseurs',
      'list-rh-personnel-bbtm',
      'list-kpi-projets-planning',
      'list-smtr-journees-planning',
      'list-smtr-planning-periodes',
      'library-certificats-flotte',
      'list-bbtm-projets',
    ]);
  });

  it('keeps the recommended import order from the migration inventory', () => {
    expect(getSharePointImportOrder().map((step) => step.key)).toEqual([
      'catalogs',
      'personnel',
      'planning',
      'hr-documents-certificates',
      'procedures',
      'dpr',
      'operations',
      'kpi-definitions',
    ]);
  });

  it('defines reconciliation columns required on imported tables', () => {
    expect(SHAREPOINT_RECONCILIATION_COLUMNS).toEqual([
      'sharepoint_site_url',
      'sharepoint_list_id',
      'sharepoint_list_title',
      'sharepoint_item_id',
      'sharepoint_unique_id',
      'sharepoint_file_ref',
      'sharepoint_encoded_abs_url',
      'source_modified_at',
    ]);
  });
});
