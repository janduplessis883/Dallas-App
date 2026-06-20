import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Origin': '*',
};

const userStorageBuckets = [
  'avatars',
  'home-covers',
  'accountability-avatars',
  'prophetic-vision-covers',
  'prophetic-vision-audio',
];

const userTables = [
  'accountability_check_in_messages',
  'accountability_check_in_threads',
  'accountability_planned_check_ins',
  'accountability_check_ins',
  'push_tokens',
  'event_plans',
  'prophetic_visions',
  'accountability_partners',
  'recovery_plans',
];

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = request.headers.get('Authorization');
    const token = authorization?.replace(/^Bearer\s+/i, '');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Account deletion is not configured.' }, 500);
    }

    if (!token) {
      return jsonResponse({ error: 'Sign in before deleting your account.' }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: userData, error: userError } = await adminClient.auth.getUser(token);

    if (userError || !userData.user) {
      return jsonResponse({ error: userError?.message ?? 'Signed-in user was not found.' }, 401);
    }

    const userId = userData.user.id;

    for (const bucket of userStorageBuckets) {
      await removeStorageFolder(adminClient, bucket, userId);
    }

    for (const table of userTables) {
      const { error } = await adminClient.from(table).delete().eq('user_id', userId);

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }
    }

    const { error: profileError } = await adminClient.from('profiles').delete().eq('id', userId);

    if (profileError) {
      return jsonResponse({ error: profileError.message }, 500);
    }

    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);

    if (deleteUserError) {
      return jsonResponse({ error: deleteUserError.message }, 500);
    }

    return jsonResponse({ deleted: true });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Account deletion failed.' },
      500,
    );
  }
});

async function removeStorageFolder(
  adminClient: ReturnType<typeof createClient>,
  bucket: string,
  folderPath: string,
) {
  const { data, error } = await adminClient.storage.from(bucket).list(folderPath, {
    limit: 1000,
  });

  if (error || !data?.length) {
    return;
  }

  const filePaths: string[] = [];

  for (const item of data) {
    const itemPath = `${folderPath}/${item.name}`;

    if (item.id) {
      filePaths.push(itemPath);
    } else {
      await removeStorageFolder(adminClient, bucket, itemPath);
    }
  }

  if (filePaths.length) {
    await adminClient.storage.from(bucket).remove(filePaths);
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
    status,
  });
}
