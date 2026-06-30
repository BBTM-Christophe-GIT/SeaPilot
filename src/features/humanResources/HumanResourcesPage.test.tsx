import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HumanResourcesPage } from './HumanResourcesPage';

const activePerson = {
  id: 1,
  user_id: 'user-1',
  first_name: 'Jean',
  last_name: 'MARTIN',
  email: 'jean@example.test',
  function_label: 'Capitaine',
  grade_label: 'Capitaine 200',
  active: true,
};

const inactivePerson = {
  id: 2,
  user_id: null,
  first_name: 'Paul',
  last_name: 'DURAND',
  email: 'paul@example.test',
  function_label: 'Matelot Polyvalent',
  grade_label: 'Matelot',
  active: false,
};

function createPeopleSelect(data = [activePerson, inactivePerson]) {
  return {
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data, error: null }),
      }),
    }),
  };
}

describe('HumanResourcesPage', () => {
  it('renders active personnel records by default', async () => {
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'people') {
          return createPeopleSelect();
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    render(<HumanResourcesPage client={client as never} roles={['admin']} />);

    expect(await screen.findByRole('heading', { name: 'Personnel RH' })).toBeInTheDocument();
    expect(screen.getByText('Jean MARTIN')).toBeInTheDocument();
    expect(screen.getByText('Capitaine')).toBeInTheDocument();
    expect(screen.queryByText('Paul DURAND')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Personnel actif')).toHaveTextContent('1');
    expect(screen.getByLabelText('Personnel actif')).toHaveTextContent('actif');
  });

  it('shows inactive personnel when requested', async () => {
    const user = userEvent.setup();
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'people') {
          return createPeopleSelect();
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    render(<HumanResourcesPage client={client as never} roles={['admin']} />);

    await screen.findByText('Jean MARTIN');
    await user.click(screen.getByRole('checkbox', { name: 'Afficher les inactifs' }));

    expect(screen.getByText('Paul DURAND')).toBeInTheDocument();
  });

  it('creates a personnel record for office roles', async () => {
    const user = userEvent.setup();
    const createdPerson = {
      id: 3,
      user_id: null,
      first_name: 'Marie',
      last_name: 'LEGRAND',
      email: 'marie@example.test',
      function_label: 'Lieutenant',
      grade_label: 'Pont',
      active: true,
    };
    const single = vi.fn().mockResolvedValue({ data: createdPerson, error: null });
    const insertSelect = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'people') {
          return {
            ...createPeopleSelect([activePerson]),
            insert,
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    render(<HumanResourcesPage client={client as never} roles={['armement']} />);

    await screen.findByText('Jean MARTIN');
    await user.type(screen.getByLabelText('Prenom'), 'Marie');
    await user.type(screen.getByLabelText('Nom'), 'LEGRAND');
    await user.type(screen.getByLabelText('Email'), 'marie@example.test');
    await user.type(screen.getByLabelText('Fonction'), 'Lieutenant');
    await user.type(screen.getByLabelText('Grade'), 'Pont');
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));

    await waitFor(() =>
      expect(insert).toHaveBeenCalledWith({
        first_name: 'Marie',
        last_name: 'LEGRAND',
        email: 'marie@example.test',
        function_label: 'Lieutenant',
        grade_label: 'Pont',
      }),
    );
    expect(await screen.findByText('Marie LEGRAND')).toBeInTheDocument();
    expect(screen.getByText('Collaborateur ajoute.')).toBeInTheDocument();
  });

  it('keeps marins in read-only mode', async () => {
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'people') {
          return createPeopleSelect([activePerson]);
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    render(<HumanResourcesPage client={client as never} roles={['marin']} />);

    expect(await screen.findByText('Jean MARTIN')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter' })).not.toBeInTheDocument();
    expect(screen.getByText('Lecture seule')).toBeInTheDocument();
  });
});
