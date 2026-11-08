import './seaOperationSpeedDial.css';

const knots = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });
const averageKnots = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const center = 52;
const tickPositions = [0, .25, .5, .75, 1];

function dialPoint(fraction: number, radius: number) {
  const angle = Math.PI * (1 - fraction);
  return { x: center + Math.cos(angle) * radius, y: center - Math.sin(angle) * radius };
}

export function SeaOperationSpeedDial({ label, speedKnots, maxSpeedKnots, scaleLimitKnots }: {
  label: string; speedKnots: number | null; maxSpeedKnots: number | null; scaleLimitKnots: number | null;
}) {
  const fraction = speedKnots !== null && scaleLimitKnots !== null ? speedKnots / scaleLimitKnots : null;
  const needle = fraction === null ? null : dialPoint(fraction, 33);

  return <div className="so-speed-dial" data-scale={scaleLimitKnots === null ? 'unknown' : 'known'}>
    <svg viewBox="0 0 104 59" aria-hidden="true" focusable="false">
      <path d="M 7 52 A 45 45 0 0 1 97 52" className="so-speed-dial-track" />
      {fraction !== null && fraction > 0 && <path d="M 7 52 A 45 45 0 0 1 97 52" pathLength="1"
        strokeDasharray={`${fraction} 1`} className="so-speed-dial-progress" />}
      {scaleLimitKnots !== null && tickPositions.map(position => {
        const outer = dialPoint(position, 38);
        const inner = dialPoint(position, position === .25 || position === .75 ? 35 : 32);
        return <line key={position} x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} className="so-speed-dial-tick" />;
      })}
      {needle && <>
        <line x1={center} y1={center} x2={needle.x} y2={needle.y} className="so-speed-dial-needle" />
        <circle cx={center} cy={center} r="3.5" className="so-speed-dial-hub" />
      </>}
    </svg>
    <dl className="so-speed-dial-values">
      <div><dt>{label}</dt><dd>{speedKnots === null ? 'Aucun relevé de vitesse' : <strong>{averageKnots.format(speedKnots)} nd</strong>}</dd></div>
      <div><dt>Vmax</dt><dd>{maxSpeedKnots === null ? 'non renseignée' : `${knots.format(maxSpeedKnots)} nd`}</dd></div>
      {scaleLimitKnots !== null && scaleLimitKnots !== maxSpeedKnots && <div><dt>Échelle</dt><dd>0–{knots.format(scaleLimitKnots)} nd</dd></div>}
    </dl>
  </div>;
}
