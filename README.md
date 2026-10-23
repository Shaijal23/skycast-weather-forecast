# SkyCast — Weather Forecast Application

A full-stack weather app built with React, Vite, Node.js, Express, and OpenWeatherMap.

## Features
- Search current weather by city
- 5-day forecast (3-hour intervals, grouped into daily cards)
- Celsius/Fahrenheit switch
- Browser geolocation ("Use my location")
- Dynamic weather icons and background styling
- Loading, empty, API-error, and offline-friendly states
- Express backend proxy: API key never goes to the browser
- Environment-based configuration
- In-memory TTL cache and request timeout
- Basic API rate limiting and input validation
- Responsive layout for mobile and desktop

## Requirements
- Node.js 20+ recommended
- npm
- An OpenWeatherMap API key: https://openweathermap.org/appid

## 1. Configure the backend
```bash
cd server
cp .env.example .env
```
Open `server/.env` and set `OPENWEATHER_API_KEY=your_real_key`.
Do not put this key in the React `.env` file or commit `.env`.

## 2. Install dependencies
Open one terminal:
```bash
cd server
npm install
npm run dev
```
The API runs at http://localhost:5000.

Open a second terminal:
```bash
cd client
npm install
npm run dev
```
Vite prints the frontend URL, usually http://localhost:5173.

## API endpoints
- `GET /api/health` — server health
- `GET /api/weather?city=London&units=metric` — current conditions
- `GET /api/forecast?city=London&units=metric` — 5-day / 3-hour forecast
- `GET /api/weather?lat=...&lon=...&units=metric` — current conditions by coordinates
- `GET /api/forecast?lat=...&lon=...&units=metric` — forecast by coordinates

## Troubleshooting
- `OPENWEATHER_API_KEY is not configured`: set the key in `server/.env`, then restart the server.
- `401 Invalid API key`: verify the key and allow time for a newly created key to activate.
- `404 City not found`: check spelling or try `City,CountryCode`, e.g. `Paris,FR`.
- `429`: wait before retrying; both OpenWeatherMap plan limits and this app's rate limiter can apply.
- Browser geolocation requires permission and generally works on localhost or HTTPS.
- If port 5000 is busy, change `PORT` in `server/.env` and update `VITE_API_BASE_URL` in `client/.env`.

## Production notes
The in-memory cache is per-process and resets on restart. For multi-instance deployment use Redis. Restrict CORS to your deployed frontend origin, add observability, and keep secrets in your hosting provider's secret manager.
