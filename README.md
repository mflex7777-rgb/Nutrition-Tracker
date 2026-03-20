# Nutrition Tracker v2

Nutrition lookup tool powered by the USDA FoodData Central database.

## Project Structure

```
nutrition-tracker/
├── public/
│   ├── index.html                  # Main frontend (uses /api/nutrition)
│   └── nutrition-tracker-test.html # Standalone test (uses USDA DEMO_KEY directly)
├── api/
│   └── nutrition.js                # Vercel serverless function
├── vercel.json
└── README.md
```

## Deploy to Vercel

### 1. Push to GitHub
Create a new repo and push this project folder.

### 2. Import to Vercel
- Go to vercel.com → Add New Project → Import your repo
- Leave all build settings as default → click Deploy

### 3. Add your USDA API Key (free)
The tool works with DEMO_KEY but it's rate-limited. Get a free dedicated key:
- Go to: https://fdc.nal.usda.gov/api-key-signup/
- Sign up with your email — the key is emailed to you instantly
- In Vercel: Settings → Environment Variables → Add:
  - Name:  `USDA_API_KEY`
  - Value: your key

### 4. Redeploy
Deployments → three dots → Redeploy

---

## Testing locally
Open `public/nutrition-tracker-test.html` directly in your browser — no server needed.
It calls the USDA API directly using DEMO_KEY (free, no signup required for testing).
