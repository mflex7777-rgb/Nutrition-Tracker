const USDA_API_KEY = process.env.USDA_API_KEY || 'DEMO_KEY';
const BASE = 'https://api.nal.usda.gov/fdc/v1';

function getNutrient(foodNutrients, id, nameFragments) {
  if (!foodNutrients) return null;
  const n = foodNutrients.find(n => {
    if (n.nutrientId === id) return true;
    if (n.nutrientNumber === String(id)) return true;
    const name = (n.nutrientName || '').toLowerCase();
    return nameFragments.some(f => name.includes(f));
  });
  return n ? (n.value ?? null) : null;
}

function pickBestMatch(foods, query) {
  if (!foods.length) return null;
  const q = query.toLowerCase();
  const scored = foods.map(f => {
    let score = 0;
    if (f.dataType === 'Foundation') score += 3;
    else if (f.dataType === 'SR Legacy') score += 2;
    const desc = (f.description || '').toLowerCase();
    if (desc === q) score += 10;
    else if (desc.startsWith(q)) score += 5;
    else if (desc.includes(q)) score += 2;
    if (desc.includes('restaurant') || desc.includes('fast food') || desc.includes('brand')) score -= 2;
    return { food: f, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].food;
}

async function searchFood(query) {
  const url = `${BASE}/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(query)}&dataType=Foundation,SR%20Legacy&pageSize=8`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`USDA search failed: ${res.status}`);
  const data = await res.json();
  return data.foods || [];
}

async function getFoodDetail(fdcId) {
  const url = `${BASE}/food/${fdcId}?api_key=${USDA_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function resolveNutrients(match) {
  let nutrients = match.foodNutrients || [];
  const cal  = getNutrient(nutrients, 208, ['energy', 'calorie']);
  const prot = getNutrient(nutrients, 203, ['protein']);
  if (cal == null || prot == null) {
    const detail = await getFoodDetail(match.fdcId);
    if (detail) nutrients = detail.foodNutrients || [];
  }
  return {
    calories:  getNutrient(nutrients, 208, ['energy', 'calorie']),
    protein_g: getNutrient(nutrients, 203, ['protein']),
    fiber_g:   getNutrient(nutrients, 291, ['fiber', 'dietary fiber']),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { items } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'No items provided' });
  try {
    const results = await Promise.all(items.map(async (item) => {
      const foods = await searchFood(item.name);
      const match = pickBestMatch(foods, item.name);
      if (!match) return { name: item.name, error: 'not_found' };
      const factor = item.qtyG / 100;
      const { calories, protein_g, fiber_g } = await resolveNutrients(match);
      return {
        name: item.name,
        matchedName: match.description,
        dataType: match.dataType,
        calories:  calories  != null ? Math.round(calories  * factor) : null,
        protein_g: protein_g != null ? parseFloat((protein_g * factor).toFixed(1)) : null,
        fiber_g:   fiber_g   != null ? parseFloat((fiber_g   * factor).toFixed(1)) : null,
      };
    }));
    return res.status(200).json({ results });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to fetch nutrition data' });
  }
}
