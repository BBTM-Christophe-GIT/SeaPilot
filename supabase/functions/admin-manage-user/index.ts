import { createClient } from 'npm:@supabase/supabase-js@2.108.2';

const DEFAULT_APP_URL = 'https://sea-pilot-ten.vercel.app';
const ACTIONS = new Set(['resend_access', 'delete']);

interface UserActionRequest {
  action?: unknown;
  userId?: unknown;
}

interface PreparedTarget {
  userId: string;
  email: string;
  displayName: string;
  companyId: number;
  action: 'resend_access' | 'delete';
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

function parseInput(body: UserActionRequest): { action: 'resend_access' | 'delete'; userId: string } {
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';

  if (!ACTIONS.has(action) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    throw new Error('INVALID_INPUT');
  }

  return { action: action as 'resend_access' | 'delete', userId };
}

function actionError(error: { message?: string } | null) {
  const message = error?.message || '';

  if (message.includes('USER_ACCOUNT_ACTION_FORBIDDEN')) {
    return { status: 403, code: 'FORBIDDEN', message: 'Seul un administrateur actif peut gérer les utilisateurs.' };
  }
  if (message.includes('USER_ACCOUNT_NOT_FOUND')) {
    return { status: 404, code: 'USER_NOT_FOUND', message: 'Cet utilisateur est introuvable dans votre entreprise.' };
  }
  if (message.includes('USER_ACCOUNT_SELF_DELETE')) {
    return { status: 409, code: 'SELF_DELETE', message: 'Vous ne pouvez pas supprimer votre propre compte.' };
  }
  if (message.includes('USER_ACCOUNT_LAST_ADMIN')) {
    return { status: 409, code: 'LAST_ADMIN', message: 'Le dernier administrateur de l’entreprise ne peut pas être supprimé.' };
  }
  if (message.includes('USER_ACCOUNT_MULTI_COMPANY')) {
    return { status: 409, code: 'MULTI_COMPANY', message: 'Ce compte appartient à plusieurs entreprises et ne peut pas être supprimé ici.' };
  }
  if (message.includes('USER_ACCOUNT_INACTIVE')) {
    return { status: 409, code: 'INACTIVE_USER', message: 'Ce compte a déjà été supprimé ou désactivé.' };
  }

  return { status: 500, code: 'ACCOUNT_ACTION_FAILED', message: 'L’action sur le compte n’a pas pu être préparée.' };
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
    console.error('admin-manage-user: required Supabase secrets are unavailable');
    return json(request, 500, { code: 'SERVER_CONFIGURATION', message: 'Service indisponible.' });
  }

  if (!authorization?.toLowerCase().startsWith('bearer ')) {
    return json(request, 401, { code: 'UNAUTHORIZED', message: 'Session requise.' });
  }

  let input: ReturnType<typeof parseInput>;

  try {
    input = parseInput(await request.json() as UserActionRequest);
  } catch {
    return json(request, 400, { code: 'INVALID_INPUT', message: 'Action ou utilisateur invalide.' });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const accessToken = authorization.slice(7).trim();
  const { data: authData, error: authError } = await serviceClient.auth.getUser(accessToken);

  if (authError || !authData.user) {
    return json(request, 401, { code: 'UNAUTHORIZED', message: 'Session invalide ou expirée.' });
  }

  const { data: prepared, error: preparationError } = await serviceClient.rpc(
    'prepare_seapilot_user_account_action',
    {
      p_target_user_id: input.userId,
      p_requested_by: authData.user.id,
      p_action: input.action,
    },
  );

  if (preparationError || !prepared) {
    const mapped = actionError(preparationError);
    console.warn('admin-manage-user: action rejected', {
      action: input.action,
      code: preparationError?.code,
      requestedBy: authData.user.id,
      targetUserId: input.userId,
    });
    return json(request, mapped.status, { code: mapped.code, message: mapped.message });
  }

  const target = prepared as PreparedTarget;
  const { data: targetAuthData, error: targetAuthError } = await serviceClient.auth.admin.getUserById(input.userId);

  if (targetAuthError || !targetAuthData.user) {
    if (input.action === 'delete') {
      return json(request, 200, {
        action: input.action,
        message: 'Utilisateur supprimé. Sa fiche RH et son historique sont conservés.',
      });
    }

    return json(request, 404, { code: 'USER_NOT_FOUND', message: 'Le compte Auth de cet utilisateur est introuvable.' });
  }

  const appUrl = (Deno.env.get('SEAPILOT_APP_URL') || DEFAULT_APP_URL).replace(/\/$/, '');

  if (input.action === 'resend_access') {
    const activated = Boolean(targetAuthData.user.email_confirmed_at || targetAuthData.user.confirmed_at);
    const { error: emailError } = activated
      ? await serviceClient.auth.resetPasswordForEmail(target.email, {
          redirectTo: `${appUrl}/auth/update-password`,
        })
      : await serviceClient.auth.admin.inviteUserByEmail(target.email, {
          data: { display_name: target.displayName },
          redirectTo: `${appUrl}/auth/update-password`,
        });

    if (emailError) {
      const rateLimited = /rate|limit|seconds/i.test(emailError.message || '');
      console.warn('admin-manage-user: access email failed', {
        activated,
        code: emailError.code,
        requestedBy: authData.user.id,
        targetUserId: input.userId,
      });
      return json(request, rateLimited ? 429 : 502, {
        code: rateLimited ? 'EMAIL_RATE_LIMIT' : 'ACCESS_EMAIL_FAILED',
        message: rateLimited
          ? 'Un email a été envoyé récemment. Attendez quelques instants avant de réessayer.'
          : 'Le nouveau lien d’accès n’a pas pu être envoyé.',
      });
    }

    console.info('admin-manage-user: access link sent', {
      activated,
      requestedBy: authData.user.id,
      targetUserId: input.userId,
    });
    return json(request, 200, {
      action: input.action,
      linkType: activated ? 'recovery' : 'invite',
      message: activated
        ? 'Un lien de réinitialisation a été envoyé.'
        : 'Une nouvelle invitation a été envoyée.',
    });
  }

  const { error: deleteError } = await serviceClient.auth.admin.deleteUser(input.userId, true);

  if (deleteError) {
    console.error('admin-manage-user: Auth soft deletion failed after access revocation', {
      code: deleteError.code,
      requestedBy: authData.user.id,
      targetUserId: input.userId,
    });
    return json(request, 502, {
      code: 'AUTH_DELETE_FAILED',
      message: 'Les accès ont été retirés, mais la suppression du compte Auth doit être réessayée.',
    });
  }

  console.info('admin-manage-user: account soft deleted', {
    requestedBy: authData.user.id,
    targetUserId: input.userId,
  });
  return json(request, 200, {
    action: input.action,
    message: 'Utilisateur supprimé. Sa fiche RH et son historique sont conservés.',
  });
});
