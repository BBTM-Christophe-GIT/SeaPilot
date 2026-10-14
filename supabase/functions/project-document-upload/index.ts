import { createProjectDocumentUploadClosedHandler } from './handler.ts';

Deno.serve(createProjectDocumentUploadClosedHandler(Deno.env.get('SEAPILOT_ALLOWED_ORIGINS') || ''));
