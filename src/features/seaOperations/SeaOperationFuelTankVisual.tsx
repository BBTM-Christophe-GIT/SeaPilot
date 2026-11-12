import { Fragment, type ReactNode } from 'react';
import { normalizeFleetName } from '../fleet/fleetDisplay';
import './seaOperationFuelTankVisual.css';

function tankSide(name: string) {
  const words = normalizeFleetName(name).match(/[A-Z]+/g) ?? [];
  const port = words.some(word => ['BABORD', 'P', 'PORT', 'PORTSIDE'].includes(word));
  const starboard = words.some(word => ['TRIBORD', 'S', 'STARBOARD', 'STARBORD', 'STARBOARDSIDE', 'STARBORDSIDE'].includes(word));
  return port === starboard ? 'center' : port ? 'port' : 'starboard';
}

export function SeaOperationFuelTankGauge({ liters, capacityLiters }: { liters: number | null; capacityLiters: number | null }) {
  const fill = liters !== null && capacityLiters !== null && capacityLiters > 0 ? Math.min(1, liters / capacityLiters) : null;
  return <div className="so-soutes-tank-visual" data-known={fill !== null} aria-hidden="true">
    {fill !== null && <span style={{ height: `${fill * 100}%` }} />}
  </div>;
}

function SeaOperationFuelTankLayout<T extends { key: string; name: string }>({ tanks, renderTank }: {
  tanks: readonly T[]; renderTank: (tank: T) => ReactNode;
}) {
  const sides: Record<ReturnType<typeof tankSide>, T[]> = { port: [], starboard: [], center: [] };
  let day: T | undefined;
  for (const tank of tanks) {
    if (tank.key === 'day') day = tank;
    else sides[tankSide(tank.name)].push(tank);
  }
  const { port, starboard, center } = sides;

  return <div className="so-soutes-tank-layout">
    {Array.from({ length: Math.max(port.length, starboard.length) }, (_, index) => <div key={index} className="so-soutes-sides">
      <div className="so-soutes-port">{port[index] && renderTank(port[index])}</div>
      <div className="so-soutes-starboard">{starboard[index] && renderTank(starboard[index])}</div>
    </div>)}
    {center.length > 0 && <div className="so-soutes-center">{center.map(tank => <Fragment key={tank.key}>{renderTank(tank)}</Fragment>)}</div>}
    {day && <div className="so-soutes-day">{renderTank(day)}</div>}
  </div>;
}

export function SeaOperationTankGroups<T extends { key: string; name: string; sectionName?: string }>({ tanks, renderTank, heading: Heading }: {
  tanks: readonly T[]; renderTank: (tank: T) => ReactNode; heading: 'h3' | 'h4' | 'h5';
}) {
  const groups = new Map<string, T[]>();
  for (const tank of tanks) {
    const name = tank.sectionName ?? 'Carburant';
    const group = groups.get(name);
    if (group) group.push(tank);
    else groups.set(name, [tank]);
  }
  return <div className="so-soutes-tank-groups">
    {Array.from(groups, ([name, group]) => <section key={name} className="so-soutes-tank-group" aria-label={name}>
      <Heading>{name}</Heading>
      <SeaOperationFuelTankLayout tanks={group} renderTank={renderTank} />
    </section>)}
  </div>;
}
