import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FleetCertificateRecord } from './fleetCertificateQueries';
import {
  buildFleetCertificateLibraryTree,
  FleetCertificateLibraryTree,
} from './FleetCertificateLibraryTree';

const certificate = {
  id: 42,
  vesselId: 7,
  vesselName: 'SUROIT',
  categoryKey: '07-1-radeaux-hru',
  categoryLabel: '07.1 - Radeaux / HRU',
  documentTitle: 'Radeau de survie bâbord',
  expiresOn: '2027-08-19',
} as FleetCertificateRecord;

describe('fleet certificate library tree', () => {
  it('places an LSA subcategory beneath its parent category', () => {
    const tree = buildFleetCertificateLibraryTree([certificate], new Map([[42, 2]]));

    expect(tree).toHaveLength(1);
    expect(tree[0].categories).toHaveLength(1);
    expect(tree[0].categories[0]).toMatchObject({
      categoryKey: '07-lsa',
      label: '07 - LSA',
      certificates: [],
      actionCount: 2,
    });
    expect(tree[0].categories[0].subcategories[0]).toMatchObject({
      categoryKey: '07-1-radeaux-hru',
      label: '07.1 - Radeaux / HRU',
      certificates: [expect.objectContaining({ id: 42 })],
      actionCount: 2,
    });
  });

  it('renders the subcategory and its document inside the parent category', () => {
    const onSelectCategory = vi.fn();
    render(<FleetCertificateLibraryTree
      certificates={[certificate]}
      findingCountByCertificate={new Map()}
      formatDate={(value) => value}
      onDownload={vi.fn()}
      onSelect={vi.fn()}
      onSelectCategory={onSelectCategory}
      revealMatches
    />);

    const parent = screen.getByRole('treeitem', { name: 'Catégorie 07 - LSA' });
    const subcategory = within(parent).getByRole('treeitem', { name: 'Sous-catégorie 07.1 - Radeaux / HRU' });
    expect(within(subcategory).getByRole('treeitem', { name: 'Document Radeau de survie bâbord' })).toBeInTheDocument();

    fireEvent.click(within(parent).getByRole('button', { name: /07 - LSA/ }));
    expect(onSelectCategory).toHaveBeenCalledWith('SUROIT', '07-lsa', '07 - LSA');
  });
});
