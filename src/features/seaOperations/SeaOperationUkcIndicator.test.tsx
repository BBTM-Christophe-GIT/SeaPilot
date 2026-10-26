import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SeaOperationUkcIndicator } from './SeaOperationUkcIndicator';

describe('UKC pill', () => {
  it.each([['1', 'danger', true], ['2.5', 'warning', true], ['5', 'success', false]])('renders %s m in a %s pill with an accessible meaning', (value, level, triangle) => {
    const { container } = render(<SeaOperationUkcIndicator value={value} draftMeters={2} />);
    const pill = container.querySelector('.so-ukc-pill')!;
    expect(pill).toHaveClass(`is-${level}`);
    expect(pill).toHaveAttribute('aria-label', expect.stringContaining('UKC'));
    expect(Boolean(pill.querySelector('svg'))).toBe(triangle);
    expect(pill).toHaveAttribute('title', expect.stringContaining('tirant d’eau de référence : 2 m'));
  });
  it('leaves a legacy annotation unchanged and hides color when the draft is not retained', () => {
    const view = render(<SeaOperationUkcIndicator value="3 m minimum" draftMeters={2} />);
    expect(screen.getByText('3 m minimum')).toBeVisible();
    expect(view.container.querySelector('.so-ukc-pill')).toBeNull();
    view.rerender(<SeaOperationUkcIndicator value="3,5" />);
    expect(screen.getByText('3,5')).toBeVisible();
    expect(view.container.querySelector('.so-ukc-pill')).toBeNull();
  });
  it('marks a model estimate as approximate without changing the unrounded comparison or its exact tooltip', () => {
    const { container } = render(<SeaOperationUkcIndicator value="4.000001" draftMeters={2} approximate />);
    const pill = container.querySelector('.so-ukc-pill')!;
    expect(pill).toHaveClass('is-success');
    expect(pill).toHaveTextContent('≈ 4,00 m');
    expect(pill).toHaveAttribute('title', expect.stringContaining('4,000001 m'));
    expect(pill).toHaveAttribute('title', expect.stringContaining('incertitude totale non quantifiée'));
  });
});
