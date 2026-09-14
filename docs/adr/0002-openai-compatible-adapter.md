# One OpenAI-compatible model adapter

All model calls go through a single OpenAI-compatible client (`baseURL`, `apiKey`, `model`). Dogfood uses OpenCode Zen free models; the public demo falls back to Gemini Flash so a hiring live URL is not owned by Zen promo quotas. A second vendor-specific SDK would double the surface without changing the product.
