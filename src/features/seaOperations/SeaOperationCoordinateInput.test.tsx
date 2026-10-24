import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SeaOperationCoordinateInput } from './SeaOperationCoordinateInput';

describe('SMCP position input', () => {
  it('does not round stored coordinates or emit changes on focus/blur alone', () => {
    const onChange = vi.fn();
    render(<SeaOperationCoordinateInput axis="latitude" value="50.07106666667" onChange={onChange} label="Latitude" />);
    const input = screen.getByRole('textbox', { name: 'Latitude' });
    expect(input).toHaveValue('50° 04.264′ N');
    fireEvent.focus(input); fireEvent.blur(input);
    expect(input).toHaveValue('50° 04.264′ N');
    expect(onChange).not.toHaveBeenCalled();
  });
  it('allows uninterrupted decimal input, formats at blur and reacts to an external map change', () => {
    const changed = vi.fn();
    function Fixture() {
      const [value, setValue] = useState('1.03066666667');
      return <><SeaOperationCoordinateInput axis="longitude" value={value} label="Longitude" onChange={(text) => { changed(text); setValue(text); }} />
        <button onClick={() => setValue('-4.5')}>Placer sur la carte</button><output>{value}</output></>;
    }
    render(<Fixture />);
    const input = screen.getByRole('textbox', { name: 'Longitude' });
    expect(input).toHaveValue('001° 01.840′ E');
    fireEvent.focus(input);
    for (const value of ['-', '-1', '-1.', '-1.234567']) {
      fireEvent.change(input, { target: { value } }); expect(input).toHaveValue(value);
    }
    expect(changed).toHaveBeenLastCalledWith('-1.234567');
    fireEvent.blur(input);
    expect(input).toHaveValue('001° 14.074′ W');
    expect(screen.getByRole('status')).toHaveTextContent('-1.234567');
    fireEvent.click(screen.getByRole('button', { name: 'Placer sur la carte' }));
    expect(input).toHaveValue('004° 30.000′ W');
  });
});
