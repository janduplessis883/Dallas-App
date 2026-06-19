const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Origin': '*',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { longVersion, shortVersion } = await request.json();
    const apiKey = Deno.env.get('OPENAI_API_KEY');

    if (!apiKey) {
      return jsonResponse({ error: 'OPENAI_API_KEY is not configured.' }, 500);
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: [
          {
            content:
              'Rewrite this recovery-focused prophetic vision. Preserve the person’s intent, avoid shame language, keep it grounded and hopeful, and return strict JSON with shortVersion and longVersion strings.',
            role: 'system',
          },
          {
            content: JSON.stringify({
              longVersion: String(longVersion ?? ''),
              shortVersion: String(shortVersion ?? ''),
            }),
            role: 'user',
          },
        ],
        model: 'gpt-4.1-mini',
        text: {
          format: {
            name: 'prophetic_vision_rewrite',
            schema: {
              additionalProperties: false,
              properties: {
                longVersion: { type: 'string' },
                shortVersion: { type: 'string' },
              },
              required: ['shortVersion', 'longVersion'],
              type: 'object',
            },
            type: 'json_schema',
          },
        },
      }),
    });

    if (!response.ok) {
      return jsonResponse({ error: await response.text() }, response.status);
    }

    const data = await response.json();
    const outputText = data.output_text;

    if (typeof outputText !== 'string') {
      return jsonResponse({ error: 'OpenAI response did not include output_text.' }, 500);
    }

    return jsonResponse(JSON.parse(outputText));
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Rewrite failed.' },
      500,
    );
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
    status,
  });
}
