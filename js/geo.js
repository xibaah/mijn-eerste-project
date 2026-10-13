// Pure geo-hulpfuncties: afstanden, hoogtemeters, GPX en Google Maps-links.
// Punten zijn objecten { lat, lng, ele? }.
(function (root) {
  'use strict';

  const EARTH_RADIUS = 6371008.8; // meter

  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  // Afstand in meter tussen twee punten (haversine).
  function distance(a, b) {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // Cumulatieve afstand (meter) voor elk punt van een lijn.
  function cumulativeDistances(points) {
    const out = new Array(points.length);
    let total = 0;
    for (let i = 0; i < points.length; i++) {
      if (i > 0) total += distance(points[i - 1], points[i]);
      out[i] = total;
    }
    return out;
  }

  // Stijgen/dalen met een drempel (hysterese) zodat ruis in de
  // hoogtedata niet als duizenden kleine klimmetjes meetelt.
  function elevationStats(points, threshold = 4) {
    let gain = 0;
    let loss = 0;
    let min = Infinity;
    let max = -Infinity;
    let ref = null;
    for (const p of points) {
      const e = p.ele;
      if (e == null || Number.isNaN(e)) continue;
      if (e < min) min = e;
      if (e > max) max = e;
      if (ref == null) {
        ref = e;
        continue;
      }
      const diff = e - ref;
      if (diff >= threshold) {
        gain += diff;
        ref = e;
      } else if (diff <= -threshold) {
        loss -= diff;
        ref = e;
      }
    }
    if (min === Infinity) return { gain: 0, loss: 0, min: null, max: null };
    return { gain, loss, min, max };
  }

  // Extra punten tussen a en b, ongeveer elke `step` meter (incl. a en b).
  function densify(a, b, step = 100) {
    const d = distance(a, b);
    const n = Math.max(1, Math.ceil(d / step));
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
    }
    return out;
  }

  function escapeXml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // GPX 1.1 met één track (de volledige route) en optioneel de aangeklikte punten als waypoints.
  function toGpx(name, track, waypoints = []) {
    const fmt = (n) => n.toFixed(6);
    const ele = (p) => (p.ele != null && !Number.isNaN(p.ele) ? `<ele>${p.ele.toFixed(1)}</ele>` : '');
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="Routeplanner" xmlns="http://www.topografix.com/GPX/1/1">',
      `  <metadata><name>${escapeXml(name)}</name><time>${new Date().toISOString()}</time></metadata>`,
    ];
    waypoints.forEach((w, i) => {
      lines.push(
        `  <wpt lat="${fmt(w.lat)}" lon="${fmt(w.lng)}"><name>${escapeXml(w.name || 'Punt ' + (i + 1))}</name></wpt>`
      );
    });
    lines.push('  <trk>', `    <name>${escapeXml(name)}</name>`, '    <trkseg>');
    for (const p of track) {
      lines.push(`      <trkpt lat="${fmt(p.lat)}" lon="${fmt(p.lng)}">${ele(p)}</trkpt>`);
    }
    lines.push('    </trkseg>', '  </trk>', '</gpx>', '');
    return lines.join('\n');
  }

  // Leest trackpunten (of routepunten) uit een GPX-bestand.
  function parseGpx(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Ongeldig GPX-bestand');
    let nodes = Array.from(doc.getElementsByTagName('trkpt'));
    if (!nodes.length) nodes = Array.from(doc.getElementsByTagName('rtept'));
    if (!nodes.length) nodes = Array.from(doc.getElementsByTagName('wpt'));
    return nodes.map((n) => {
      const eleNode = n.getElementsByTagName('ele')[0];
      return {
        lat: parseFloat(n.getAttribute('lat')),
        lng: parseFloat(n.getAttribute('lon')),
        ele: eleNode ? parseFloat(eleNode.textContent) : null,
      };
    });
  }

  // Kies `count` punten op gelijke afstand van elkaar langs een lijn (eerste en laatste blijven).
  function sampleByDistance(points, count) {
    if (points.length <= count) return points.slice();
    const dist = cumulativeDistances(points);
    const total = dist[dist.length - 1];
    const out = [points[0]];
    let j = 0;
    for (let i = 1; i < count - 1; i++) {
      const target = (i * total) / (count - 1);
      while (j < dist.length - 1 && dist[j] < target) j++;
      out.push(points[j]);
    }
    out.push(points[points.length - 1]);
    return out;
  }

  // Google Maps-routelink. Google laat max. 9 tussenpunten toe in een URL, dus we kiezen
  // 11 punten op gelijke afstand langs de berekende route zodat Google die zo goed mogelijk volgt.
  function googleMapsUrl(track, travelmode = 'bicycling') {
    if (track.length < 2) return null;
    const pts = sampleByDistance(track, 11);
    const c = (p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    const params = new URLSearchParams({
      api: '1',
      origin: c(pts[0]),
      destination: c(pts[pts.length - 1]),
      travelmode,
    });
    const mid = pts.slice(1, -1);
    if (mid.length) params.set('waypoints', mid.map(c).join('|'));
    return 'https://www.google.com/maps/dir/?' + params.toString();
  }

  const Geo = {
    distance,
    cumulativeDistances,
    elevationStats,
    densify,
    toGpx,
    parseGpx,
    sampleByDistance,
    googleMapsUrl,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Geo;
  else root.Geo = Geo;
})(typeof window !== 'undefined' ? window : globalThis);
