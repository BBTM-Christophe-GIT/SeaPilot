import { DetailedBasemapEngine } from './seaOperationDetailedBasemapEngine';
import type { DetailedBasemapReply, DetailedBasemapRequest } from './seaOperationDetailedBasemapModel';

const scope = self as unknown as { onmessage: ((event: MessageEvent<DetailedBasemapRequest | { cancel: number }>) => void) | null; postMessage: (message: DetailedBasemapReply) => void };
const engine = new DetailedBasemapEngine();
let current: { id: number; controller: AbortController } | null = null;
scope.onmessage = event => {
  const request = event.data;
  if ('cancel' in request) { if (current?.id === request.cancel) current.controller.abort(); return; }
  current?.controller.abort();
  const controller = new AbortController(); current = { id: request.id, controller };
  engine.render(request, controller.signal).then(result => {
    if (!controller.signal.aborted && current?.id === request.id) scope.postMessage(result);
  }).catch(() => {
    if (!controller.signal.aborted && current?.id === request.id) scope.postMessage({ ...request, tiles: [], failed: 1, error: true });
  });
};
