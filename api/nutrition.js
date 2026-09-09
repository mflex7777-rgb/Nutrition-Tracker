// api/nutrition.js
//
// This function talks to Claude for you. The important part for you to know:
// it does NOT hardcode a model name like "claude-sonnet-4-20250514" (which is
// what broke your old app). Instead, every time it runs, it first ASKS
// Anthropic "what's the newest Sonnet model right now?" and uses whatever
// the answer is. So when Anthropic ships a new Claude model in the future,
// this app picks it up automatically the next time someone uses it - you
// should never have to touch this file again for that reason.
//
// As a safety net, if that lookup ever fails (e.g. a brief network hiccup),
// it falls back to trying a short list of recent model names below.

const FALLBACK_MODELS = ['claude-sonnet-5', 'claude-opus-5', 'claude-sonnet-4-5'];

const ANTHROPIC_VERSION = '2023-06-01';
const OUNCE_TO_GRAM = 28.3495;

// Remember the discovered model for a little while so we're not calling
// the models list API on every single request.
let cachedModel = null;
let cachedAt = 0;
const CACHE_MS = 60 * 60 * 1000; // 1 hour

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function discoverLatestSonnetModel(apiKey) {
  const now = Date.now();
  if (cachedModel && now - cachedAt < CACHE_MS) {
    return cachedModel;
  }

  const resp = await fetchWithTimeout(
    'https://api.anthropic.com/v1/models?limit=50',
    {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
    },
    10000
  );

  if (!resp.ok) {
    throw new Error(`Models list request failed with status ${resp.status}`);
  }

  const data = await resp.json();
  const models = Array.isArray(data.data) ? data.data : [];

  // The API lists newest models first. We specifically want the current
  // "Sonnet" model because it's the best balance of quality/cost for a
  // simple lookup task like this one. If no Sonnet is found for some
  // reason, just take the newest model available.
  const sonnet = models.find((m) => /sonnet/i.test(m.id));
  const chosen = sonnet ? sonnet.id : models[0] && models[0].id;

  if (!chosen) {
    throw new Error('No models returned by the API');
  }

  cachedModel = chosen;
  cachedAt = now;
  return chosen;
}

function extractJson(text) {
  // Claude is asked to return pure JSON, but just in case it wraps it in
  // ```json fences or adds a stray sentence, pull out the first {...} block.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error('No JSON object found in model response');
  }
  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
}

async function askClaudeForNutrition(apiKey, model, foods) {
  const systemPrompt = `You estimate nutrition facts for foods based on typical, well-known nutritional data (e.g. USDA-style averages). You will receive a JSON array of foods, each with a name and a quantity already converted to grams. For each food, estimate total calories, protein in grams, and fiber in grams for THAT quantity (not per 100g). Respond with ONLY a JSON object, no other text, no markdown fences, in exactly this shape:
{"results":[{"name":"<food name as given>","calories":<number>,"protein_g":<number>,"fiber_g":<number>}]}
Keep the "results" array in the same order as the input. Round calories to the nearest whole number and protein/fiber to one decimal place. If a food is unclear or unrecognizable, make a reasonable best guess rather than refusing.`;

  const resp = await fetchWithTimeout(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          { role: 'user', content: JSON.stringify(foods) },
        ],
      }),
    },
    20000
  );

  const body = await resp.json();

  if (!resp.ok) {
    const message = body && body.error && body.error.message ? body.error.message : `Request failed with status ${resp.status}`;
    const err = new Error(message);
    err.status = resp.status;
    throw err;
  }

  const textBlock = (body.content || []).find((b) => b.type === 'text');
  if (!textBlock) {
    throw new Error('Model response did not include any text');
  }

  return extractJson(textBlock.text);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST for this endpoint.' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'The server is missing an ANTHROPIC_API_KEY. Add it in your Vercel project settings under Environment Variables, then redeploy.',
    });
    return;
  }

  const items = req.body && req.body.items;
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Add at least one food item.' });
    return;
  }

  for (const item of items) {
    if (!item || typeof item.name !== 'string' || !item.name.trim()) {
      res.status(400).json({ error: 'Every food item needs a name.' });
      return;
    }
    if (typeof item.qty !== 'number' || !(item.qty > 0)) {
      res.status(400).json({ error: `"${item.name}" needs a quantity greater than 0.` });
      return;
    }
  }

  // Convert everything to grams so Claude only ever has to reason in one unit.
  const foodsInGrams = items.map((item) => ({
    name: item.name.trim(),
    grams: item.unit === 'oz' ? Math.round(item.qty * OUNCE_TO_GRAM * 10) / 10 : item.qty,
  }));

  // Build the list of models to try: the auto-discovered current Sonnet
  // model first, then the hardcoded fallbacks as a safety net.
  let modelsToTry = [...FALLBACK_MODELS];
  try {
    const discovered = await discoverLatestSonnetModel(apiKey);
    modelsToTry = [discovered, ...FALLBACK_MODELS.filter((m) => m !== discovered)];
  } catch (e) {
    // Couldn't look up the current model list - just use the fallbacks.
  }

  let lastError = null;
  for (const model of modelsToTry) {
    try {
      const parsed = await askClaudeForNutrition(apiKey, model, foodsInGrams);
      const results = (parsed.results || []).map((r, i) => ({
        name: items[i].name,
        qty: items[i].qty,
        unit: items[i].unit,
        calories: Number(r.calories) || 0,
        protein_g: Number(r.protein_g) || 0,
        fiber_g: Number(r.fiber_g) || 0,
      }));

      const totals = results.reduce(
        (acc, r) => ({
          calories: acc.calories + r.calories,
          protein_g: acc.protein_g + r.protein_g,
          fiber_g: acc.fiber_g + r.fiber_g,
        }),
        { calories: 0, protein_g: 0, fiber_g: 0 }
      );
      totals.protein_g = Math.round(totals.protein_g * 10) / 10;
      totals.fiber_g = Math.round(totals.fiber_g * 10) / 10;
      totals.calories = Math.round(totals.calories);

      res.status(200).json({ model, results, totals });
      return;
    } catch (e) {
      lastError = e;
      // If it was a "model not found / retired" style error, try the next
      // model in the list. For anything else (bad API key, etc.) there's
      // no point trying more models, so stop right away.
      const message = (e && e.message) || '';
      const looksLikeModelProblem = /model/i.test(message) && (e.status === 404 || e.status === 400);
      if (!looksLikeModelProblem) break;
    }
  }

  res.status(502).json({
    error: `Couldn't get nutrition data from Claude: ${lastError ? lastError.message : 'unknown error'}`,
  });
};
