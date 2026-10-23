import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

const app = express();
const PORT = Number(process.env.PORT || 5000);
const API_KEY = process.env.OPENWEATHER_API_KEY;
const CACHE_TTL_MS = Math.max(0, Number(process.env.CACHE_TTL_SECONDS || 600)) * 1000;
const REQUEST_TIMEOUT_MS = Math.max(1000, Number(process.env.REQUEST_TIMEOUT_MS || 8000));
const cache = new Map();

app.disable('x-powered-by');
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  methods: ['GET'],
}));
app.use(express.json({ limit: '10kb' }));
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a minute and try again.', code: 'RATE_LIMITED' },
}));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'skycast-api' }));

function parseLocation(query) {
  const city = typeof query.city === 'string' ? query.city.trim() : '';
  const latRaw = query.lat;
  const lonRaw = query.lon;
  const hasCoords = latRaw !== undefined || lonRaw !== undefined;

  if (hasCoords) {
    const lat = Number(latRaw);
    const lon = Number(lonRaw);
    if (latRaw === undefined || lonRaw === undefined ||
        !Number.isFinite(lat) || !Number.isFinite(lon) ||
        lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return { error: 'Provide valid latitude and longitude coordinates.', status: 400 };
    }
    return { params: { lat, lon } };
  }

  if (!city) return { error: 'Enter a city name or provide latitude and longitude.', status: 400 };
  if (city.length > 100) return { error: 'City name must be 100 characters or fewer.', status: 400 };
  return { params: { q: city } };
}

async function fetchOpenWeather(path, params) {
  if (!API_KEY || API_KEY === 'put_your_openweathermap_api_key_here') {
    const err = new Error('The weather service is not configured. Add OPENWEATHER_API_KEY to server/.env.');
    err.status = 503;
    err.code = 'API_KEY_MISSING';
    throw err;
  }

  const url = new URL(`https://api.openweathermap.org/data/2.5/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  url.searchParams.set('appid', API_KEY);

  const cacheKey = url.pathname + '?' + [...url.searchParams.entries()]
    .filter(([key]) => key !== 'appid')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`).join('&');
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { data: cached.data, cached: true };
  if (cached) cache.delete(cacheKey);

  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (cause) {
    const err = new Error(cause?.name === 'TimeoutError'
      ? 'Weather provider timed out. Please try again.'
      : 'Could not connect to the weather provider. Check your internet connection.');
    err.status = 504;
    err.code = 'UPSTREAM_UNAVAILABLE';
    throw err;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const status = response.status === 404 ? 404 : response.status === 401 ? 502 :
      response.status === 429 ? 503 : 502;
    const err = new Error(response.status === 404
      ? 'City not found. Check the spelling or try adding a country code.'
      : response.status === 401
      ? 'The weather provider rejected the API key. Check your server configuration.'
      : response.status === 429
      ? 'The weather service is busy or its API limit was reached. Try again shortly.'
      : 'The weather provider returned an error. Please try again.');
    err.status = status;
    err.code = response.status === 404 ? 'CITY_NOT_FOUND' :
      response.status === 401 ? 'UPSTREAM_AUTH_ERROR' :
      response.status === 429 ? 'UPSTREAM_RATE_LIMIT' : 'UPSTREAM_ERROR';
    throw err;
  }

  if (CACHE_TTL_MS > 0) {
    cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    // Keep the cache bounded.
    if (cache.size > 500) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) cache.delete(oldestKey);
    }
  }
  return { data, cached: false };
}

async function weatherHandler(path, req, res) {
  const location = parseLocation(req.query);
  if (location.error) return res.status(location.status).json({ error: location.error, code: 'INVALID_LOCATION' });

  const units = req.query.units === 'imperial' ? 'imperial' : 'metric';
  try {
    const result = await fetchOpenWeather(path, { ...location.params, units });
    res.set('Cache-Control', 'no-store');
    return res.json({ ...result.data, meta: { cached: result.cached } });
  } catch (err) {
    const status = Number.isInteger(err.status) ? err.status : 500;
    if (status >= 500) console.error(`[${path}] ${err.code || 'ERROR'}: ${err.message}`);
    return res.status(status).json({
      error: err.message || 'Unexpected server error.',
      code: err.code || 'INTERNAL_ERROR',
    });
  }
}

app.get('/api/weather', (req, res) => weatherHandler('weather', req, res));
app.get('/api/forecast', (req, res) => weatherHandler('forecast', req, res));

app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found.', code: 'NOT_FOUND' }));
app.listen(PORT, () => console.log(`SkyCast API running at http://localhost:${PORT}`));
