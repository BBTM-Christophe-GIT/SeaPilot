import { describe, expect, it, vi } from 'vitest';
import { createPerson, fetchPeople, mapPersonRows, updatePersonActive } from './peopleQueries';

const personRow = {
  id: 1,
  user_id: 'user-1',
  first_name: 'Jean',
  last_name: 'MARTIN',
  email: 'jean@example.test',
  function_label: 'Capitaine',
  grade_label: 'Capitaine 200',
  active: true,
};

describe('mapPersonRows', () => {
  it('maps Supabase people rows to personnel records', () => {
    expect(mapPersonRows([personRow])).toEqual([
      {
        id: 1,
        userId: 'user-1',
        firstName: 'Jean',
        lastName: 'MARTIN',
        email: 'jean@example.test',
        functionLabel: 'Capitaine',
        gradeLabel: 'Capitaine 200',
        active: true,
      },
    ]);
  });

  it('normalizes nullable labels to empty strings', () => {
    expect(
      mapPersonRows([
        {
          ...personRow,
          user_id: null,
          email: null,
          function_label: null,
          grade_label: null,
        },
      ]),
    ).toEqual([
      {
        id: 1,
        userId: null,
        firstName: 'Jean',
        lastName: 'MARTIN',
        email: '',
        functionLabel: '',
        gradeLabel: '',
        active: true,
      },
    ]);
  });
});

describe('fetchPeople', () => {
  it('loads ordered personnel records', async () => {
    const orderByFirstName = vi.fn().mockResolvedValue({ data: [personRow], error: null });
    const orderByLastName = vi.fn().mockReturnValue({ order: orderByFirstName });
    const select = vi.fn().mockReturnValue({ order: orderByLastName });
    const from = vi.fn().mockReturnValue({ select });

    await expect(fetchPeople({ from } as never)).resolves.toEqual([
      {
        id: 1,
        userId: 'user-1',
        firstName: 'Jean',
        lastName: 'MARTIN',
        email: 'jean@example.test',
        functionLabel: 'Capitaine',
        gradeLabel: 'Capitaine 200',
        active: true,
      },
    ]);
    expect(from).toHaveBeenCalledWith('people');
    expect(select).toHaveBeenCalledWith(
      'id, user_id, first_name, last_name, email, function_label, grade_label, active',
    );
    expect(orderByLastName).toHaveBeenCalledWith('last_name', { ascending: true });
    expect(orderByFirstName).toHaveBeenCalledWith('first_name', { ascending: true });
  });
});

describe('createPerson', () => {
  it('inserts a trimmed personnel record and returns the created row', async () => {
    const single = vi.fn().mockResolvedValue({ data: personRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });

    await expect(
      createPerson({ from } as never, {
        firstName: ' Jean ',
        lastName: ' Martin ',
        email: ' jean@example.test ',
        functionLabel: ' Capitaine ',
        gradeLabel: ' Capitaine 200 ',
      }),
    ).resolves.toEqual(mapPersonRows([personRow])[0]);
    expect(insert).toHaveBeenCalledWith({
      first_name: 'Jean',
      last_name: 'Martin',
      email: 'jean@example.test',
      function_label: 'Capitaine',
      grade_label: 'Capitaine 200',
    });
  });
});

describe('updatePersonActive', () => {
  it('updates active state and returns the updated row', async () => {
    const updatedRow = { ...personRow, active: false };
    const single = vi.fn().mockResolvedValue({ data: updatedRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });

    await expect(updatePersonActive({ from } as never, 1, false)).resolves.toEqual(mapPersonRows([updatedRow])[0]);
    expect(update).toHaveBeenCalledWith({ active: false });
    expect(eq).toHaveBeenCalledWith('id', 1);
  });
});
