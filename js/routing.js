// Routeberekening via BRouter (volgt wegen/paden, inclusief hoogte)
// en een "rechte lijn"-modus met hoogtes van Open-Meteo.
(function (root) {
  'use strict';

  const BROUTER_URL = 'https://brouter.de/brouter';
  const ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';

  // Vervoerswijzen: BRouter-profiel, snelheid voor tijdsinschatting en Google Maps-modus.
  const PROFILES = {
    fiets: { label: 'Fiets', brouter: 'trekking', speed: 18, google: 'bicycling' },
    racefiets: { label: 'Racefiets', brouter: 'fastbike', speed: 27, google: 'bicycling' },
    mtb: { label: 'MTB', brouter: 'mtb', speed: 14, google: 'bicycling' },
    wandelen: { label: 'Wandelen', brouter: 'hiking-mountain', speed: 4.5, google: 'walking' },
    lopen: { label: 'Hardlopen', brouter: 'hiking-mountain', speed: 10, google: 'walking' },
    rechtelijn: { label: 'Rechte lijn', brouter: null, speed: 18, google: 'bicycling' },
  };

  async function brouterSegment(a, b, profile, signal) {
    const lonlats = `${a.lng.toFixed(6)},${a.lat.toFixed(6)}|${b.lng.toFixed(6)},${b.lat.toFixed(6)}`;
    const url = `${BROUTER_URL}?lonlats=${lonlats}&profile=${encodeURIComponent(profile)}&alternativeidx=0&format=geojson`;
    const res = await fetch(url, { signal });
    const text = await res.text();
    if (!res.ok) throw new Error(text.trim() || `BRouter fout ${res.status}`);
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      // BRouter geeft bij fouten platte tekst terug, bv. "position not mapped in existing datafile".
      throw new Error(text.trim().slice(0, 200));
    }
    const coords = json.features && json.features[0] && json.features[0].geometry.coordinates;
    if (!coords || !coords.length) throw new Error('Geen route gevonden');
    return coords.map((c) => ({ lat: c[1], lng: c[0], ele: c[2] != null ? c[2] : null }));
  }

  // Hoogtes ophalen voor een lijst punten (max. 100 per request bij Open-Meteo).
  async function fetchElevations(points, signal) {
    const out = [];
    for (let i = 0; i < points.length; i += 100) {
      const chunk = points.slice(i, i + 100);
      const lat = chunk.map((p) => p.lat.toFixed(5)).join(',');
      const lng = chunk.map((p) => p.lng.toFixed(5)).join(',');
      const res = await fetch(`${ELEVATION_URL}?latitude=${lat}&longitude=${lng}`, { signal });
      if (!res.ok) throw new Error(`Hoogtedata fout ${res.status}`);
      const json = await res.json();
      out.push(...json.elevation);
    }
    return out;
  }

  async function straightSegment(a, b, signal) {
    const pts = root.Geo.densify(a, b, 100);
    try {
      const eles = await fetchElevations(pts, signal);
      pts.forEach((p, i) => (p.ele = eles[i]));
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      pts.forEach((p) => (p.ele = null));
    }
    return pts;
  }

  // Berekent één stuk route tussen twee aangeklikte punten.
  async function segment(a, b, profileKey, signal) {
    const profile = PROFILES[profileKey] || PROFILES.fiets;
    if (!profile.brouter) return straightSegment(a, b, signal);
    return brouterSegment(a, b, profile.brouter, signal);
  }

  root.Routing = { PROFILES, segment, straightSegment };
})(window);
