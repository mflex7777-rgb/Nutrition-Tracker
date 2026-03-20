export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { items } = req.body;

  if (!items || !items.length) {
    return res.status(400).json({ error: 'No items provided' });
  }

  const itemLines = items.map(i => `- ${i.name}: ${i.qtyG.toFixed(1)}g`).join('\n');
  const prompt = `You are a nutrition database. For the following foods and gram weights, return ONLY a JSON array with no markdown, code fences, or explanation. Each object must have exactly these keys: {"name": string, "calories": number, "protein_g": number, "fiber_g": number}. Use typical/average nutritional values per 100g scaled to the given weight. Foods:\n${itemLines}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: data.error?.message || 'API error' });
    }

    const text = data.content.map(b => b.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const results = JSON.parse(clean);

    return res.status(200).json({ results });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch nutrition data' });
  }
}
