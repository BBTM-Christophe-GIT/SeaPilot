import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PersonRecord } from './peopleQueries';
import { PersonPhotoField } from './PersonPhotoField';
import { PersonAvatar } from './PersonAvatar';
import { savePersonPhoto } from './personPhotos';
vi.mock('./personPhotos', () => ({ savePersonPhoto: vi.fn(), removePersonPhoto: vi.fn() }));
const person = { id: 1, firstName: 'Alex', lastName: 'MARTIN' } as PersonRecord;
afterEach(() => vi.clearAllMocks());
describe('RH photo field', () => {
  it('previews a selection and reports saved photo to both the profile and roster', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview'); vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const changed = vi.fn(); const result = { photoPath: '1/new.jpg', photoUrl: 'data:image/jpeg;base64,eA==', document: { id: 5 } };
    vi.mocked(savePersonPhoto).mockResolvedValue(result as never);
    render(<PersonPhotoField client={{} as never} person={person} onChanged={changed} />);
    const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Choisir la photo du collaborateur'), { target: { files: [file] } });
    expect(screen.getByAltText('Aperçu de la photo sélectionnée')).toHaveAttribute('src', 'blob:preview');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la photo' }));
    await waitFor(() => expect(changed).toHaveBeenCalledWith(1, result, result.document));
    expect(screen.getByRole('status')).toHaveTextContent('dossier RH');
  });
  it('keeps a failed upload selectable for retry and never reports success', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview'); vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.mocked(savePersonPhoto).mockRejectedValue(new Error('Drive indisponible'));
    const changed = vi.fn(); render(<PersonPhotoField client={{} as never} person={person} onChanged={changed} />);
    fireEvent.change(screen.getByLabelText('Choisir la photo du collaborateur'), { target: { files: [new File(['p'], 'p.png', { type: 'image/png' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la photo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Drive indisponible');
    expect(changed).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Enregistrer la photo' })).toBeEnabled();
  });
  it('uses the portrait instead of initials, with a fallback for a broken image', () => {
    const { rerender } = render(<PersonAvatar person={person} className="hr-profile-avatar" />);
    expect(screen.getByText('AM')).toBeInTheDocument();
    rerender(<PersonAvatar person={{ ...person, photoUrl: 'blob:photo' }} className="hr-profile-avatar" />);
    expect(screen.queryByText('AM')).not.toBeInTheDocument();
    fireEvent.error(screen.getByRole('img')); expect(screen.getByText('AM')).toBeInTheDocument();
  });
});
