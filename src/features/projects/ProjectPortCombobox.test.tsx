import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectPortCombobox } from './ProjectPortCombobox';

vi.mock('./projectPorts', () => ({
  filterProjectPortGroups: () => [{ department: 'Finistère', ports: [
    { port: 'Port de Brest', department: 'Finistère', locode: 'FRBES' },
    { port: 'Port de Roscoff', department: 'Finistère', locode: 'FRROS' },
  ] }],
  formatProjectPort: (port: { port: string; locode: string }) => `${port.port} – Finistère · France · ${port.locode}`,
}));

const rect = (top: number, bottom: number) => ({ x: 0, y: top, left: 0, right: 300, top, bottom, width: 300, height: bottom - top, toJSON: () => ({}) });

function portInPane(fit = true) {
  const onChange = vi.fn();
  render(<div data-testid="scroll-pane" style={{ overflowY: 'auto' }}><label htmlFor="port">Port de départ</label><ProjectPortCombobox id="port" fitWithinScrollContainer={fit} value="Dieppe" onChange={onChange} /></div>);
  const pane = screen.getByTestId('scroll-pane');
  const input = screen.getByRole('combobox', { name: 'Port de départ' });
  const paneBounds = vi.spyOn(pane, 'getBoundingClientRect');
  const controlBounds = vi.spyOn(input.parentElement!, 'getBoundingClientRect');
  return { pane, input, paneBounds, controlBounds, onChange };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('Port list fitting within a scroll pane', () => {
  it('opens above a low control and stays inside the pane above the fixed footer', () => {
    const { input, paneBounds, controlBounds } = portInPane();
    paneBounds.mockReturnValue(rect(100, 400));
    controlBounds.mockReturnValue(rect(320, 360));
    fireEvent.focus(input);
    const list = screen.getByRole('listbox');
    expect(list).toHaveStyle({ top: 'auto', bottom: 'calc(100% + 5px)', maxHeight: '215px' });
    expect(screen.getByRole('option', { name: /Port de Brest/ })).toBeVisible();
  });

  it('constrains a downward list to the visible pane and keeps keyboard selection usable', () => {
    const { input, paneBounds, controlBounds, onChange } = portInPane();
    paneBounds.mockReturnValue(rect(100, 300));
    controlBounds.mockReturnValue(rect(110, 150));
    fireEvent.focus(input);
    expect(screen.getByRole('listbox')).toHaveStyle({ top: 'calc(100% + 5px)', bottom: 'auto', maxHeight: '145px' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const option = screen.getByRole('option', { name: /Port de Brest/ });
    expect(input).toHaveAttribute('aria-activedescendant', option.id);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('Port de Brest');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('repositions on pane scrolling without treating internal list scrolling as a layout change', () => {
    const { pane, input, paneBounds, controlBounds } = portInPane();
    paneBounds.mockReturnValue(rect(100, 400));
    controlBounds.mockReturnValue(rect(320, 360));
    let frame: FrameRequestCallback | undefined;
    const schedule = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 1; });
    fireEvent.focus(input);
    const list = screen.getByRole('listbox');
    expect(list).toHaveStyle({ maxHeight: '215px', top: 'auto' });
    controlBounds.mockReturnValue(rect(110, 150));
    fireEvent.scroll(pane);
    expect(schedule).toHaveBeenCalledTimes(1);
    act(() => frame!(0));
    expect(list).toHaveStyle({ maxHeight: '245px', bottom: 'auto' });
    schedule.mockClear();
    fireEvent.scroll(list);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('leaves the existing Project dropdown placement unchanged by default', () => {
    const { input, controlBounds } = portInPane(false);
    fireEvent.focus(input);
    expect(screen.getByRole('listbox')).not.toHaveAttribute('style');
    expect(controlBounds).not.toHaveBeenCalled();
  });
});
