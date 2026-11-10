import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SeaOperationConsumptionTank } from './SeaOperationConsumptionTank';

const reading = { departureLiters: 10_000, arrivalLiters: 7_500, consumedLiters: 2_500 };

describe('SeaOperationConsumptionTank', () => {
  it('changes the liquid level with the recorded arrival volume and caps the drawing when full', () => {
    const { rerender } = render(<SeaOperationConsumptionTank record={reading} capacityLiters={10_000} />);
    const graphic = screen.getByRole('img', { name: /75\s*% de la capacité totale/ });
    const liquidPath = () => graphic.querySelector('g[clip-path] path')?.getAttribute('d');
    const initialLevel = liquidPath();
    expect(initialLevel).toBeTruthy();
    expect(screen.getByText(/Capacité totale · 10\s000 L/)).toBeVisible();

    rerender(<SeaOperationConsumptionTank record={{ ...reading, arrivalLiters: 10_000 }} capacityLiters={10_000} />);
    const fullLevel = liquidPath();
    expect(fullLevel).toBeTruthy();
    expect(fullLevel).not.toBe(initialLevel);

    rerender(<SeaOperationConsumptionTank record={{ ...reading, arrivalLiters: 12_000 }} capacityLiters={10_000} />);
    expect(liquidPath()).toBe(fullLevel);
  });

  it('marks the illustration as indicative when the actual capacity is unavailable', () => {
    render(<SeaOperationConsumptionTank record={reading} capacityLiters={null} />);

    expect(screen.getByRole('img', { name: 'Représentation indicative des soutes à l’arrivée' })).toBeVisible();
    expect(screen.getByText('Illustration indicative · capacité totale indisponible.')).toBeVisible();
    expect(screen.getByText('Quantité consommée').parentElement).toHaveTextContent(/2\s500 L/);
  });

  it('distinguishes an empty tank from a missing volume', () => {
    const { rerender } = render(<SeaOperationConsumptionTank record={{ ...reading, arrivalLiters: 0 }} capacityLiters={10_000} />);
    expect(screen.getByRole('img', { name: /0\s*% de la capacité totale/ }).querySelector('g[clip-path]')).toBeNull();
    expect(screen.getByText('Quantité à l’arrivée').parentElement).toHaveTextContent('0 L');

    rerender(<SeaOperationConsumptionTank record={{ ...reading, arrivalLiters: null, consumedLiters: null }} capacityLiters={10_000} />);
    expect(screen.getByRole('img', { name: 'Volume des soutes à l’arrivée indisponible' })).toBeVisible();
    expect(screen.getByText('Volumes indisponibles pour cette conversion de jauge.')).toBeVisible();
    expect(screen.getByText('Quantité à l’arrivée').parentElement).toHaveTextContent('Indisponible');
  });

  it('uses the measured capacity of both tanks for paired Landemer readings', () => {
    const tankGauges = { departure: { port: 80, starboard: 80 }, arrival: { port: 50, starboard: 50 } };
    render(<SeaOperationConsumptionTank record={{ ...reading, arrivalLiters: 12_357, tankGauges }} capacityLiters={30_000} />);

    expect(screen.getByRole('img', { name: /50\s*% de la capacité totale/ })).toBeVisible();
    expect(screen.getByText(/Capacité totale · 24\s714 L/)).toBeVisible();
  });
});
