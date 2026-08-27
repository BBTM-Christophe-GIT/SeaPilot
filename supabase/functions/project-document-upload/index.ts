import { createClient } from 'npm:@supabase/supabase-js@2.108.2';

const DEFAULT_APP_URL = 'https://sea-pilot-ten.vercel.app';
const ALLOWED_DOCUMENT_TYPES = new Set([
  'offer',
  'bimco_supplytime',
  'towage_contract',
  'bareboat_charter',
  'intellectual_service',
  'operation_attachment',
  'project_attachment',
]);
const MAX_FILE_BYTES = 18 * 1024 * 1024;

interface UploadRequest {
  projectId?: unknown;
  planningOccurrenceId?: unknown;
  documentType?: unknown;
  revision?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
  base64Content?: unknown;
  categoryKey?: unknown;
  expiresOn?: unknown;
  sha256?: unknown;
  subcategoryKey?: unknown;
}

interface GraphDriveItem {
  id: string;
  name: string;
  size?: number;
  webUrl: string;
}

function allowedOrigins(): Set<string> {
  const configured = (Deno.env.get('SEAPILOT_ALLOWED_ORIGINS') || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set([
    DEFAULT_APP_URL,
    'https://sea-pilot-bbtm-app.vercel.app',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    ...configured,
  ]);
}

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('origin') || '';
  const allowedOrigin = allowedOrigins().has(origin) ? origin : DEFAULT_APP_URL;
  return {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Origin',
  };
}

function json(request: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
}

function cleanFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function cleanFolderSegment(value: string): string {
  return cleanFileName(value).replace(/[.#]+$/g, '').slice(0, 80) || 'Projet';
}

function parsePositiveInteger(value: unknown, required: boolean): number | null {
  if (value === null || value === undefined || value === '') return required ? Number.NaN : null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : Number.NaN;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseInput(body: UploadRequest) {
  const projectId = parsePositiveInteger(body.projectId, true);
  const planningOccurrenceId = parsePositiveInteger(body.planningOccurrenceId, false);
  const revision = parsePositiveInteger(body.revision, true);
  const documentType = typeof body.documentType === 'string' ? body.documentType.trim() : '';
  const fileName = typeof body.fileName === 'string' ? cleanFileName(body.fileName) : '';
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim().toLowerCase() : '';
  const base64Content = typeof body.base64Content === 'string' ? body.base64Content : '';
  const categoryKey = typeof body.categoryKey === 'string' ? body.categoryKey.trim() : '';
  const subcategoryKey = typeof body.subcategoryKey === 'string' ? body.subcategoryKey.trim() : '';
  const expiresOn = typeof body.expiresOn === 'string' ? body.expiresOn.trim() : '';
  const sha256 = typeof body.sha256 === 'string' ? body.sha256.trim().toLowerCase() : '';

  if (
    !Number.isSafeInteger(projectId)
    || (planningOccurrenceId !== null && !Number.isSafeInteger(planningOccurrenceId))
    || !Number.isSafeInteger(revision)
    || !ALLOWED_DOCUMENT_TYPES.has(documentType)
    || !fileName
    || fileName.length > 180
    || !/^[\w.+-]+\/[\w.+-]+$/.test(mimeType)
    || !base64Content
    || (sha256 && !/^[a-f0-9]{64}$/.test(sha256))
  ) {
    throw new Error('INVALID_INPUT');
  }
  if (documentType === 'operation_attachment' && planningOccurrenceId === null) {
    throw new Error('INVALID_INPUT');
  }
  if (
    documentType === 'project_attachment'
    && (
      !/^[a-z0-9][a-z0-9_-]{2,63}$/.test(categoryKey)
      || (subcategoryKey && !/^[a-z0-9][a-z0-9_-]{2,63}$/.test(subcategoryKey))
      || (expiresOn && !isIsoDate(expiresOn))
    )
  ) {
    throw new Error('INVALID_INPUT');
  }

  const bytes = Uint8Array.from(atob(base64Content), (character) => character.charCodeAt(0));
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_FILE_BYTES) throw new Error('INVALID_INPUT');
  return {
    projectId: projectId as number,
    planningOccurrenceId,
    revision: revision as number,
    documentType,
    fileName,
    mimeType,
    bytes,
    sha256,
    categoryKey,
    subcategoryKey,
    expiresOn,
  };
}

async function graphRequest<T>(accessToken: string, url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body instanceof Uint8Array ? {} : { 'Content-Type': 'application/json' }),
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GRAPH_${response.status}:${detail.slice(0, 400)}`);
  }
  return await response.json() as T;
}

async function ensureFolder(accessToken: string, driveId: string, parentPath: string, name: string): Promise<void> {
  const parent = parentPath
    ? `root:/${parentPath.replace(/^\/+|\/+$/g, '')}:/children`
    : 'root/children';
  const response = await fetch(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/${parent}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
  });
  if (!response.ok && response.status !== 409) {
    throw new Error(`GRAPH_FOLDER_${response.status}:${(await response.text()).slice(0, 400)}`);
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Méthode non autorisée.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const tenantId = Deno.env.get('MICROSOFT_TENANT_ID');
  const clientId = Deno.env.get('MICROSOFT_CLIENT_ID');
  const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET');
  const driveId = Deno.env.get('SHAREPOINT_PROJECTS_DRIVE_ID');
  const authorization = request.headers.get('authorization');

  if (!supabaseUrl || !serviceRoleKey || !tenantId || !clientId || !clientSecret || !driveId) {
    console.error('project-document-upload: required secrets are unavailable');
    return json(request, 503, {
      code: 'SHAREPOINT_NOT_CONFIGURED',
      message: 'Le stockage SharePoint SeaPilot n’est pas encore configuré.',
    });
  }
  if (!authorization?.toLowerCase().startsWith('bearer ')) {
    return json(request, 401, { code: 'UNAUTHORIZED', message: 'Session requise.' });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const accessToken = authorization.slice(7).trim();
  const { data: authData, error: authError } = await serviceClient.auth.getUser(accessToken);
  if (authError || !authData.user) return json(request, 401, { code: 'UNAUTHORIZED', message: 'Session invalide ou expirée.' });

  let input: ReturnType<typeof parseInput>;
  try {
    input = parseInput(await request.json() as UploadRequest);
  } catch {
    return json(request, 400, { code: 'INVALID_INPUT', message: 'Le document est invalide, trop volumineux ou sans opération associée.' });
  }

  const { data: project } = await serviceClient
    .from('projects')
    .select('id, company_id, project_code, title, archived_at')
    .eq('id', input.projectId)
    .is('archived_at', null)
    .maybeSingle();
  if (!project) return json(request, 404, { code: 'PROJECT_NOT_FOUND', message: 'Projet introuvable ou archivé.' });

  const [{ data: membership }, { data: roleRows }] = await Promise.all([
    serviceClient.from('company_memberships').select('company_id').eq('company_id', project.company_id).eq('user_id', authData.user.id).eq('active', true).maybeSingle(),
    serviceClient.from('user_roles').select('role_key, company_id').eq('company_id', project.company_id).eq('user_id', authData.user.id),
  ]);
  if (!membership || !roleRows?.some((row) => row.role_key === 'admin' || row.role_key === 'direction')) {
    return json(request, 403, { code: 'FORBIDDEN', message: 'Seuls la direction et les administrateurs de cette société peuvent classer un document projet.' });
  }

  if (input.planningOccurrenceId) {
    const { data: occurrence } = await serviceClient
      .from('planning_projects')
      .select('id')
      .eq('id', input.planningOccurrenceId)
      .eq('company_id', project.company_id)
      .eq('catalog_project_id', project.id)
      .maybeSingle();
    if (!occurrence) return json(request, 400, { code: 'INVALID_OCCURRENCE', message: 'La mission sélectionnée ne correspond pas au projet.' });
  }

  let categoryLabel = '';
  let subcategoryLabel = '';
  if (input.documentType === 'project_attachment') {
    const requestedKeys = [input.categoryKey, input.subcategoryKey].filter(Boolean);
    const { data: categories, error: categoryError } = await serviceClient
      .from('project_document_categories')
      .select('category_key,parent_key,label,active')
      .eq('company_id', project.company_id)
      .in('category_key', requestedKeys);
    if (categoryError) {
      return json(request, 503, { code: 'DOCUMENT_CATEGORIES_UNAVAILABLE', message: 'Les catégories documentaires sont indisponibles.' });
    }
    const category = categories?.find((item) => item.category_key === input.categoryKey && !item.parent_key && item.active);
    const subcategory = input.subcategoryKey
      ? categories?.find((item) => item.category_key === input.subcategoryKey && item.parent_key === input.categoryKey && item.active)
      : null;
    if (!category || (input.subcategoryKey && !subcategory)) {
      return json(request, 400, { code: 'INVALID_DOCUMENT_CATEGORY', message: 'La catégorie documentaire sélectionnée est invalide.' });
    }
    categoryLabel = category.label;
    subcategoryLabel = subcategory?.label || '';
  }

  try {
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
    });
    if (!tokenResponse.ok) throw new Error(`TOKEN_${tokenResponse.status}`);
    const tokenPayload = await tokenResponse.json() as { access_token?: string };
    if (!tokenPayload.access_token) throw new Error('TOKEN_MISSING');

    const rootFolder = 'SeaPilot';
    const projectFolder = cleanFolderSegment([project.project_code, project.title].filter(Boolean).join(' - '));
    await ensureFolder(tokenPayload.access_token, driveId, '', rootFolder);
    await ensureFolder(tokenPayload.access_token, driveId, rootFolder, projectFolder);
    let folderPath = `${rootFolder}/${projectFolder}`;
    if (input.planningOccurrenceId) {
      await ensureFolder(tokenPayload.access_token, driveId, folderPath, 'Operations');
      const operationFolder = `OP-${input.planningOccurrenceId}`;
      await ensureFolder(tokenPayload.access_token, driveId, `${folderPath}/Operations`, operationFolder);
      folderPath = `${folderPath}/Operations/${operationFolder}`;
    } else if (input.documentType === 'project_attachment') {
      await ensureFolder(tokenPayload.access_token, driveId, folderPath, 'Documents');
      folderPath = `${folderPath}/Documents`;
      const categoryFolder = cleanFolderSegment(categoryLabel);
      await ensureFolder(tokenPayload.access_token, driveId, folderPath, categoryFolder);
      folderPath = `${folderPath}/${categoryFolder}`;
      if (subcategoryLabel) {
        const subcategoryFolder = cleanFolderSegment(subcategoryLabel);
        await ensureFolder(tokenPayload.access_token, driveId, folderPath, subcategoryFolder);
        folderPath = `${folderPath}/${subcategoryFolder}`;
      }
    }
    const uploadUrl = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root:/${folderPath.split('/').map(encodeURIComponent).join('/')}/${encodeURIComponent(input.fileName)}:/content`;
    const item = await graphRequest<GraphDriveItem>(tokenPayload.access_token, uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': input.mimeType },
      body: input.bytes,
    });

    const { data: stored, error: storeError } = await serviceClient.from('project_generated_documents').upsert({
      company_id: project.company_id,
      project_id: project.id,
      planning_occurrence_id: input.planningOccurrenceId,
      document_type: input.documentType,
      revision: input.revision,
      file_name: item.name || input.fileName,
      mime_type: input.mimeType,
      file_size_bytes: item.size || input.bytes.byteLength,
      sha256: input.sha256 || null,
      sharepoint_drive_id: driveId,
      sharepoint_drive_item_id: item.id,
      sharepoint_web_url: item.webUrl,
      sharepoint_folder_path: folderPath,
      category_key: input.categoryKey || null,
      subcategory_key: input.subcategoryKey || null,
      expires_on: input.expiresOn || null,
      created_by: authData.user.id,
    }, { onConflict: 'company_id,sharepoint_drive_id,sharepoint_drive_item_id' }).select('id').single();
    if (storeError) throw new Error(`METADATA:${storeError.code}`);

    return json(request, 201, { document: { id: stored.id, fileName: item.name, webUrl: item.webUrl, folderPath } });
  } catch (error) {
    console.error('project-document-upload: SharePoint upload failed', { message: error instanceof Error ? error.message : 'unknown', projectId: input.projectId });
    return json(request, 502, { code: 'SHAREPOINT_UPLOAD_FAILED', message: 'Le classement du document dans SharePoint a échoué.' });
  }
});
