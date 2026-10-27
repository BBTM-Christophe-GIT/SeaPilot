import { seaOperationIsolatedPointIcon, type SeaOperationIsolatedPointIconName } from './seaOperationIsolatedPointIcons';

/** Inherits the one shared green from its caller; no raster or external asset. */
export function SeaOperationIsolatedPointIcon({ icon, size = 24, ...props }: {
  icon: SeaOperationIsolatedPointIconName;
  size?: number;
  className?: string;
  x?: number;
  y?: number;
}) {
  const definition = seaOperationIsolatedPointIcon(icon);
  return <svg {...props} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {definition?.paths.map((path, index) => <path key={index} d={path.d} fill={path.fill ? 'currentColor' : 'none'} />)}
  </svg>;
}
