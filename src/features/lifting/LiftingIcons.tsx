import { createLucideIcon } from 'lucide-react';
import type { LiftingKind } from './liftingModel';

export const LiftingOperationsIcon = createLucideIcon('LiftingOperations', [
  ['path', { d: 'M3 22h18M7 22V7h3v15M3 7h18L10 2 7 7M10 2v5M19 7v7m-2 0v2a2 2 0 0 0 4 0M7 11l3 4-3 4', key: 'crane' }],
]);

export function LiftingIcon({ kind }: { kind: LiftingKind | 'crane' }) {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'crane' ? <><path d="M8 40h32M15 40V15h6v25M9 15h31L21 6l-6 9M21 6v9M36 15v11m-3 0v4a3 3 0 0 0 6 0M15 23l6 6-6 6M10 10l5 5" /></>
      : kind === 'lifting' ? <><path d="M15 11h-4v31h27V11h-4M20 7h9v7h-9zM17 21h3m5 0h7M17 27h3m5 0h7M17 33h3m5 0h7"/><path d="M8 19H5V5h12v5" /></>
        : <><path d="m5 25 3 9h17l5-9H5Zm5 0v-9h10l5 9M13 16v-5h4v5M9 39c3-4 6 4 10 0s6 4 10 0M30 29h6c10 0 9-15 2-15-8 0-8 10-2 10h7M9 21h5m4 0h3" /></>}
  </svg>;
}
