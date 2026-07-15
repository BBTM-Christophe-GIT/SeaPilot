import { createClient } from 'npm:@supabase/supabase-js@2.108.2';

const DEFAULT_APP_URL = 'https://sea-pilot-ten.vercel.app';
const ROLE_KEYS = new Set(['admin', 'direction', 'armement', 'capitaine', 'marin']);

interface InvitationRequest {
  email?: unknown;
  displayName?: unknown;
  roleKeys?: unknown;
  personId?: unknown;
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

function parseInput(body: InvitationRequest) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  const roleKeys = Array.isArray(body.roleKeys)
    ? Array.from(new Set(body.roleKeys.filter((role): role is string => typeof role === 'string')))
    : [];
  const personId = body.personId === null || body.personId === undefined || body.personId === ''
    ? null
    : Number(body.personId);

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || email.length > 254
    || displayName.length < 2
    || displayName.length > 120
    || roleKeys.length < 1
    || roleKeys.length > ROLE_KEYS.size
    || roleKeys.some((role) => !ROLE_KEYS.has(role))
    || (personId !== null && (!Number.isSafeInteger(personId) || personId < 1))
  ) {
    throw new Error('INVALID_INPUT');
  }

  return { email, displayName, roleKeys, personId };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (request.method !== 'POST') {
    return json(request, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Méthode non autorisée.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('authorization');

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('admin-invite-user: required Supabase secrets are unavailable');
    return json(request, 500, { code: 'SERVER_CONFIGURATION', message: 'Service indisponible.' });
  }

  if (!authorization?.toLowerCase().startsWith('bearer ')) {
    return json(request, 401, { code: 'UNAUTHORIZED', message: 'Session requise.' });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const accessToken = authorization.slice(7).trim();
  const { data: authData, error: authError } = await serviceClient.auth.getUser(accessToken);

  if (authError || !authData.user) {
    return json(request, 401, { code: 'UNAUTHORIZED', message: 'Session invalide ou expirée.' });
  }

  let input: ReturnType<typeof parseInput>;

  try {
    input = parseInput(await request.json() as InvitationRequest);
  } catch {
    return json(request, 400, {
      code: 'INVALID_INPUT',
      message: 'Vérifiez l’email, le nom, les rôles et le marin associé.',
    });
  }

  const appUrl = (Deno.env.get('SEAPILOT_APP_URL') || DEFAULT_APP_URL).replace(/\/$/, '');
  const { data: invitation, error: invitationError } = await serviceClient.auth.admin.inviteUserByEmail(
    input.email,
    {
      data: { display_name: input.displayName },
      redirectTo: `${appUrl}/auth/update-password`,
    },
  );

  if (invitationError || !invitation.user) {
    const isExistingUser = /already|registered|exists/i.test(invitationError?.message || '');
    console.warn('admin-invite-user: Auth invitation rejected', {
      code: invitationError?.code,
      existingUser: isExistingUser,
    });
    return json(request, isExistingUser ? 409 : 502, {
      code: isExistingUser ? 'USER_ALREADY_EXISTS' : 'INVITATION_EMAIL_FAILED',
      message: isExistingUser
        ? 'Un compte existe déjà pour cette adresse email.'
        : 'L’email d’invitation n’a pas pu être envoyé. Réessayez plus tard.',
    });
  }

  const { data: provisioned, error: provisionError } = await serviceClient.rpc(
    'provision_invited_seapilot_user',
    {
      p_user_id: invitation.user.id,
      p_email: input.email,
      p_display_name: input.displayName,
      p_role_keys: input.roleKeys,
      p_person_id: input.personId,
      p_invited_by: authData.user.id,
    },
  );

  if (provisionError) {
    await serviceClient.auth.admin.deleteUser(invitation.user.id);
    const forbidden = provisionError.message.includes('USER_INVITATION_FORBIDDEN');
    console.error('admin-invite-user: profile provisioning failed', {
      code: provisionError.code,
      forbidden,
    });
    return json(request, forbidden ? 403 : 500, {
      code: forbidden ? 'FORBIDDEN' : 'PROVISIONING_FAILED',
      message: forbidden
        ? 'Seul un administrateur actif peut inviter un utilisateur.'
        : 'Le compte n’a pas pu être configuré. Aucune donnée partielle n’a été conservée.',
    });
  }

  console.info('admin-invite-user: invitation sent', {
    invitationId: (provisioned as { invitationId?: unknown } | null)?.invitationId,
    invitedUserId: invitation.user.id,
    invitedBy: authData.user.id,
  });

  return json(request, 201, { invitation: provisioned });
});
