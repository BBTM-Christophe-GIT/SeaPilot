import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClientContactDetails } from './ClientContactDetails';

describe('client postal block', () => {
  it('groups the postal address and keeps contact, phone and email independently readable without editing the source', () => {
    const contact = { representedBy: 'Benoit COEVOET', address: 'AGENCE LE HAVRE\nRoute du Môle Central – Port n°372', postalCode: '76600', city: 'Le Havre', country: 'France', phone: '+33 2 00 00 00 00', email: 'benoit@example.test' };
    const original = { ...contact }, { container } = render(<ClientContactDetails contact={contact} />);
    expect(screen.getByRole('region', { name: 'Coordonnées du client' })).toBeInTheDocument();
    expect(container.querySelector('address')?.textContent).toBe('AGENCE LE HAVRE\nRoute du Môle Central – Port n°372\n76600 Le Havre\nFrance');
    for (const value of ['Benoit COEVOET', '+33 2 00 00 00 00', 'benoit@example.test']) expect(screen.getByText(value)).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument(); expect(contact).toEqual(original);
  });
  it('omits empty fields and handles a client without coordinates', () => {
    const { rerender } = render(<ClientContactDetails contact={{ email: 'service@example.test' }} />);
    expect(screen.getByText('E-mail')).toBeVisible(); expect(screen.queryByText('Adresse')).not.toBeInTheDocument();
    rerender(<ClientContactDetails contact={{}} />);
    expect(screen.getByText('Coordonnées non renseignées.')).toBeVisible();
  });
});
