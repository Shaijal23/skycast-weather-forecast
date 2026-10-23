import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search, MapPin, LocateFixed, Wind, Droplets, Eye, Gauge, Sunrise, Sunset,
  Thermometer, RefreshCw, CloudSun, AlertTriangle, Clock3, ArrowUpRight
} from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const iconUrl = (icon) => `https://openweathermap.org/img/wn/${icon || '01d'}@2x.png`;
const temp = (value, unit) => `${Math.round(value)}°${unit === 'imperial' ? 'F' : 'C'}`;
const time = (unix, timezone = 0) => new Date((unix + timezone) * 1000).toLocaleTimeString('en-US', {
  hour: 'numeric', minute: '2-digit', timeZone: 'UTC'
});
const weekday = (unix, timezone = 0) => new Date((unix + timezone) * 1000).toLocaleDateString('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC'
});

async function requestWeather(endpoint, location, units, signal) {
  const params = new URLSearchParams({ units });
  if (location.city) params.set('city', location.city);
  else { params.set('lat', location.lat); params.set('lon', location.lon); }
  const response = await fetch(`${API_BASE}/api/${endpoint}?${params}`, { signal });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Could not load weather right now.');
    error.code = payload.code;
    throw error;
  }
  return payload;
}

function Stat({ icon: Icon, label, value, note }) {
  return <div className="stat">
    <div className="stat-icon"><Icon size={18} /></div>
    <div><span className="stat-label">{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>
  </div>;
}

function App() {
  const [cityInput, setCityInput] = useState('London');
  const [location, setLocation] = useState({ city: 'London' });
  const [units, setUnits] = useState('metric');
  const [weather, setWeather] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [recent, setRecent] = useState(() => {
    try { return JSON.parse(localStorage.getItem('skycast-recent') || '["London","New York","Tokyo"]'); }
    catch { return ['London', 'New York', 'Tokyo']; }
  });

  const load = useCallback(async (nextLocation = location, nextUnits = units) => {
    setLoading(true); setError('');
    const controller = new AbortController();
    try {
      const [current, future] = await Promise.all([
        requestWeather('weather', nextLocation, nextUnits, controller.signal),
        requestWeather('forecast', nextLocation, nextUnits, controller.signal),
      ]);
      setWeather(current); setForecast(future); setLocation(nextLocation); setUpdatedAt(new Date());
      if (nextLocation.city) {
        const clean = nextLocation.city;
        setRecent(old => {
          const next = [clean, ...old.filter(x => x.toLowerCase() !== clean.toLowerCase())].slice(0, 5);
          try { localStorage.setItem('skycast-recent', JSON.stringify(next)); } catch {}
          return next;
        });
      }
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || 'Something went wrong. Please try again.');
    } finally { setLoading(false); }
  }, [location, units]);

  useEffect(() => { load({ city: 'London' }, 'metric'); }, []); // Initial example weather.
  const submit = (e) => {
    e.preventDefault();
    const value = cityInput.trim();
    if (!value) { setError('Please enter a city name.'); return; }
    const next = { city: value };
    setLocation(next); load(next, units);
  };
  const chooseRecent = (city) => { setCityInput(city); const next = { city }; setLocation(next); load(next, units); };
  const changeUnits = (value) => { setUnits(value); if (weather) load(location, value); };

  const useMyLocation = () => {
    if (!navigator.geolocation) { setError('Geolocation is not supported by this browser.'); return; }
    setLoading(true); setError('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const next = { lat: coords.latitude, lon: coords.longitude };
        setCityInput('My location'); setLocation(next); load(next, units);
      },
      (e) => { setLoading(false); setError(e.code === 1 ? 'Location permission was denied. You can search for a city instead.' : 'Could not determine your location. Please search for a city.'); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  const days = useMemo(() => {
    if (!forecast?.list) return [];
    const grouped = new Map();
    for (const item of forecast.list) {
      const date = new Date((item.dt + (forecast.city?.timezone || 0)) * 1000).toISOString().slice(0, 10);
      if (!grouped.has(date)) grouped.set(date, []);
      grouped.get(date).push(item);
    }
    return [...grouped.values()].slice(0, 5).map(items => {
      const midday = items.reduce((best, item) =>
        Math.abs(new Date((item.dt + (forecast.city?.timezone || 0)) * 1000).getUTCHours() - 12) <
        Math.abs(new Date((best.dt + (forecast.city?.timezone || 0)) * 1000).getUTCHours() - 12) ? item : best, items[0]);
      return { ...midday, min: Math.min(...items.map(x => x.main.temp_min)), max: Math.max(...items.map(x => x.main.temp_max)) };
    });
  }, [forecast]);

  const shownCity = weather ? `${weather.name}${weather.sys?.country ? `, ${weather.sys.country}` : ''}` : 'Your forecast';
  const timezone = weather?.timezone || 0;

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" aria-label="SkyCast home"><span className="brand-mark"><CloudSun size={23}/></span><span>skycast<span className="brand-dot">.</span></span></a>
      <div className="topbar-right"><span className="live-dot"/> Live weather <span className="top-divider"/> <span className="top-date">{new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</span></div>
    </header>

    <section className="hero">
      <div className="eyebrow"><span/> YOUR WEATHER, CLEARLY</div>
      <h1>Feel the forecast.</h1>
      <p className="hero-copy">A little more clarity for whatever the day brings.</p>
      <form className="searchbar" onSubmit={submit}>
        <Search size={20} className="search-icon"/>
        <input aria-label="Search city" value={cityInput} onChange={e => setCityInput(e.target.value)} placeholder="Search city or town..." />
        <button type="button" className="location-button" onClick={useMyLocation} title="Use my location" aria-label="Use my location"><LocateFixed size={18}/><span>My location</span></button>
        <button className="search-button" type="submit" disabled={loading}><span>Search</span><ArrowUpRight size={17}/></button>
      </form>
      <div className="recent-row"><span>RECENT</span>{recent.map(city => <button key={city} onClick={() => chooseRecent(city)}>{city}</button>)}</div>
    </section>

    {error && <div className="error-banner" role="alert"><AlertTriangle size={19}/><span>{error}</span><button onClick={() => load(location, units)} disabled={loading}>Try again</button></div>}

    {loading && !weather && <section className="loading-card"><div className="spinner"/><p>Gathering the latest conditions…</p></section>}

    {weather && <div className={`dashboard ${loading ? 'is-refreshing' : ''}`}>
      <section className="current-card">
        <div className="current-top"><div><div className="location-label"><MapPin size={15}/>{shownCity}</div><p className="today-label">CURRENT CONDITIONS</p></div>
          <div className="unit-toggle" aria-label="Temperature unit"><button className={units === 'metric' ? 'active' : ''} onClick={() => changeUnits('metric')}>°C</button><button className={units === 'imperial' ? 'active' : ''} onClick={() => changeUnits('imperial')}>°F</button></div>
        </div>
        <div className="weather-main">
          <div className="temperature">{temp(weather.main.temp, units)}</div>
          <div className="weather-description"><img src={iconUrl(weather.weather?.[0]?.icon)} alt="" /><div><strong>{weather.weather?.[0]?.main || 'Weather'}</strong><span>{weather.weather?.[0]?.description || 'Conditions unavailable'}</span></div></div>
        </div>
        <div className="feels-like"><Thermometer size={15}/> Feels like {temp(weather.main.feels_like, units)} <span className="bullet">•</span> H:{temp(weather.main.temp_max, units)} L:{temp(weather.main.temp_min, units)}</div>
        <div className="sun-times"><div><span className="sun-icon sunrise"><Sunrise size={18}/></span><div><small>SUNRISE</small><strong>{time(weather.sys.sunrise, timezone)}</strong></div></div><div><span className="sun-icon sunset"><Sunset size={18}/></span><div><small>SUNSET</small><strong>{time(weather.sys.sunset, timezone)}</strong></div></div></div>
        <div className="current-footer"><span><Clock3 size={13}/> {updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}` : 'Latest update'}</span><button onClick={() => load(location, units)} disabled={loading}><RefreshCw size={14} className={loading ? 'spin-icon' : ''}/> Refresh</button></div>
      </section>

      <section className="details-section">
        <div className="section-heading"><div><span className="section-kicker">AT A GLANCE</span><h2>Weather details</h2></div><span className="subtle-tag">RIGHT NOW</span></div>
        <div className="stats-grid">
          <Stat icon={Droplets} label="Humidity" value={`${weather.main.humidity}%`} note="Relative humidity"/>
          <Stat icon={Wind} label="Wind speed" value={`${Math.round(weather.wind.speed)} ${units === 'imperial' ? 'mph' : 'm/s'}`} note={weather.wind.deg != null ? `${weather.wind.deg}° direction` : 'Near surface'}/>
          <Stat icon={Eye} label="Visibility" value={weather.visibility != null ? `${(weather.visibility / 1000).toFixed(1)} km` : '—'} note="Horizontal range"/>
          <Stat icon={Gauge} label="Pressure" value={`${weather.main.pressure} hPa`} note="Sea-level pressure"/>
        </div>
      </section>

      <section className="forecast-section">
        <div className="section-heading"><div><span className="section-kicker">PLAN AHEAD</span><h2>5-day forecast</h2></div><span className="subtle-tag">3-HOUR DATA</span></div>
        <div className="forecast-grid">{days.map((day, i) => <article className={`forecast-card ${i === 0 ? 'forecast-today' : ''}`} key={day.dt}>
          <span className="forecast-day">{i === 0 ? 'TODAY' : weekday(day.dt, forecast.city?.timezone || 0).toUpperCase()}</span>
          <img src={iconUrl(day.weather?.[0]?.icon)} alt={day.weather?.[0]?.description || 'Weather'} />
          <strong className="forecast-condition">{day.weather?.[0]?.main || '—'}</strong>
          <div className="forecast-temps"><strong>{temp(day.main.temp, units)}</strong><span>{temp(day.min, units)} / {temp(day.max, units)}</span></div>
          <div className="forecast-rain"><Droplets size={13}/>{day.pop != null ? `${Math.round(day.pop * 100)}%` : '—'} <span>chance</span></div>
        </article>)}</div>
        <p className="forecast-note">Forecast based on OpenWeatherMap 5-day / 3-hour data. Daily values are representative snapshots, not guaranteed extremes.</p>
      </section>
    </div>}

    {!weather && !loading && !error && <section className="empty-card"><CloudSun size={40}/><h2>Your forecast starts here</h2><p>Search for a city to see current conditions and the five-day outlook.</p></section>}

    <footer className="footer"><div className="footer-brand"><CloudSun size={18}/> skycast<span>.</span></div><p>Weather data provided by <a href="https://openweathermap.org/" target="_blank" rel="noreferrer">OpenWeatherMap</a></p><p className="footer-credit">Made for curious skies <span>✦</span></p></footer>
  </main>;
}

export default App;
