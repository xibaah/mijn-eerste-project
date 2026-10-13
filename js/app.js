// Hoofdlogica: kaart, punten, route, statistieken en export.
(function () {
  'use strict';

  const { PROFILES } = Routing;
  const STORAGE_KEY = 'routeplanner:v1';

  const state = {
    waypoints: [], // aangeklikte punten { lat, lng }
    profile: 'fiets',
    history: [], // eerdere versies van waypoints, voor "ongedaan maken"
  };

  // Berekende stukken route, per sleutel (profiel + begin + eind).
  // { status: 'pending' | 'ok' | 'fallback', coords: [...] }
  const segments = new Map();

  const $ = (id) => document.getElementById(id);
  // Op een touchscreen maken we de punten groter, zodat je ze makkelijk kunt verslepen.
  const TOUCH = window.matchMedia('(pointer: coarse)').matches;
  const MOBILE = () => window.matchMedia('(max-width: 760px)').matches;

  // ---------- Kaart ----------
  const baseLayers = {
    // CARTO werkt ook als je index.html rechtstreeks opent (file://);
    // de tegelserver van OpenStreetMap weigert dat.
    Kaart: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      subdomains: 'abcd',
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }),
    OpenStreetMap: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }),
    Fietskaart: L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
      maxZoom: 20,
      attribution: '<a href="https://www.cyclosm.org">CyclOSM</a> | &copy; OpenStreetMap',
    }),
    Terrein: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA) | &copy; OpenStreetMap',
    }),
    Satelliet: L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: 'Tiles &copy; Esri' }
    ),
  };

  const map = L.map('map', { zoomControl: false, layers: [baseLayers.Kaart] }).setView([51.0, 4.4], 9);

  // Laadt een kaartlaag niet (geblokkeerd, server plat), schakel dan over op de volgende.
  const layerOrder = Object.values(baseLayers);
  layerOrder.forEach((layer, i) => {
    let loaded = 0;
    let failed = 0;
    layer.on('tileload', () => loaded++);
    layer.on('tileerror', () => {
      failed++;
      if (loaded === 0 && failed === 4 && map.hasLayer(layer)) {
        const next = layerOrder[(i + 1) % layerOrder.length];
        map.removeLayer(layer);
        map.addLayer(next);
        setStatus('Deze kaartlaag laadt niet; er is overgeschakeld naar een andere kaart.', 'error');
      }
    });
  });
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.control.layers(baseLayers, null, { position: 'topright' }).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);

  const LocateControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const div = L.DomUtil.create('div', 'leaflet-bar');
      const a = L.DomUtil.create('a', '', div);
      a.href = '#';
      a.title = 'Mijn locatie';
      a.setAttribute('role', 'button');
      a.innerHTML = '◎';
      a.style.fontSize = '18px';
      L.DomEvent.on(a, 'click', (e) => {
        L.DomEvent.stop(e);
        map.locate({ setView: true, maxZoom: 14 });
      });
      return div;
    },
  });
  new LocateControl().addTo(map);
  map.on('locationerror', () => setStatus('Je locatie kon niet bepaald worden.', 'error'));

  const routeLayer = L.layerGroup().addTo(map);
  const markerLayer = L.layerGroup().addTo(map);
  const hoverMarker = L.marker([0, 0], {
    icon: L.divIcon({ className: '', html: '<div class="hover-marker"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }),
    interactive: false,
    keyboard: false,
  });

  const chart = new ElevationChart($('elevation'), (p) => {
    if (p) hoverMarker.setLatLng([p.lat, p.lng]).addTo(map);
    else hoverMarker.remove();
  });

  // ---------- Status ----------
  function setStatus(text, kind) {
    const s = $('status');
    s.textContent = text;
    s.className = 'status' + (kind ? ' ' + kind : '');
  }

  // ---------- Geschiedenis ----------
  function snapshot() {
    state.history.push(state.waypoints.map((w) => ({ ...w })));
    if (state.history.length > 100) state.history.shift();
  }

  function undo() {
    if (!state.history.length) return;
    state.waypoints = state.history.pop();
    changed();
  }

  // ---------- Segmenten ----------
  function key(a, b) {
    return `${state.profile}|${a.lat.toFixed(6)},${a.lng.toFixed(6)}|${b.lat.toFixed(6)},${b.lng.toFixed(6)}`;
  }

  function getSegment(a, b) {
    const k = key(a, b);
    let seg = segments.get(k);
    if (seg) return seg;

    seg = { status: 'pending', coords: [{ ...a }, { ...b }] };
    segments.set(k, seg);
    const profile = state.profile;
    Routing.segment(a, b, profile)
      .then((coords) => {
        seg.status = 'ok';
        seg.coords = coords;
      })
      .catch(async (err) => {
        console.warn('Route niet gevonden, rechte lijn gebruikt:', err.message);
        seg.status = 'fallback';
        seg.error = err.message;
        seg.coords = await Routing.straightSegment(a, b).catch(() => seg.coords);
      })
      .finally(renderRoute);
    return seg;
  }

  function currentSegments() {
    const list = [];
    for (let i = 0; i < state.waypoints.length - 1; i++) {
      list.push(getSegment(state.waypoints[i], state.waypoints[i + 1]));
    }
    return list;
  }

  function fullTrack(segs) {
    const out = [];
    segs.forEach((s) => out.push(...s.coords));
    return out;
  }

  // ---------- Tekenen ----------
  function markerIcon(i, n) {
    const isStart = i === 0;
    const isEnd = i === n - 1 && n > 1;
    const cls = isStart ? 'wp-start' : isEnd ? 'wp-end' : 'wp-mid';
    const size = (isStart || isEnd ? 22 : 16) + (TOUCH ? 8 : 0);
    const label = isStart ? 'A' : isEnd ? 'B' : '';
    return L.divIcon({
      className: '',
      html: `<div class="wp-marker ${cls}" style="width:${size}px;height:${size}px">${label}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  function renderMarkers() {
    markerLayer.clearLayers();
    const n = state.waypoints.length;
    state.waypoints.forEach((w, i) => {
      const m = L.marker([w.lat, w.lng], {
        icon: markerIcon(i, n),
        draggable: true,
        autoPan: true,
        title: 'Sleep om te verplaatsen, klik om te verwijderen',
        zIndexOffset: i === 0 || i === n - 1 ? 1000 : 0,
      });
      m.on('dragend', () => {
        snapshot();
        const ll = m.getLatLng();
        state.waypoints[i] = { lat: ll.lat, lng: ll.lng };
        changed();
      });
      m.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        snapshot();
        state.waypoints.splice(i, 1);
        changed();
      });
      markerLayer.addLayer(m);
    });
  }

  function renderRoute() {
    routeLayer.clearLayers();
    const segs = currentSegments();

    segs.forEach((seg, i) => {
      const latlngs = seg.coords.map((p) => [p.lat, p.lng]);
      const style =
        seg.status === 'ok'
          ? { color: '#fc4c02', weight: 5, opacity: 0.9 }
          : seg.status === 'fallback'
          ? { color: '#fc4c02', weight: 4, opacity: 0.8, dashArray: '8 8' }
          : { color: '#888', weight: 3, opacity: 0.7, dashArray: '4 8' };
      L.polyline(latlngs, { ...style, interactive: false }).addTo(routeLayer);

      // Bredere onzichtbare lijn om makkelijk op de route te kunnen klikken.
      const hit = L.polyline(latlngs, { color: '#000', opacity: 0, weight: 18 }).addTo(routeLayer);
      hit.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        snapshot();
        state.waypoints.splice(i + 1, 0, { lat: e.latlng.lat, lng: e.latlng.lng });
        changed();
      });
    });

    updateStats(segs);
  }

  // ---------- Statistieken ----------
  function formatDuration(hours) {
    const totalMin = Math.round(hours * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}:${String(m).padStart(2, '0')}`;
  }

  function updateStats(segs) {
    const track = fullTrack(segs);
    const dist = Geo.cumulativeDistances(track);
    const totalM = dist.length ? dist[dist.length - 1] : 0;
    const ele = Geo.elevationStats(track);
    const profile = PROFILES[state.profile];
    const km = totalM / 1000;

    // Eenvoudige schatting: vlakke snelheid + extra tijd voor klimmen
    // (wandelen/lopen: regel van Naismith, 1 uur per 600 m; fietsen: 1 uur per 1000 m).
    const climbRate = profile.google === 'walking' ? 600 : 1000;
    const hours = km / profile.speed + ele.gain / climbRate;

    const kmText = km.toFixed(km < 100 ? 1 : 0).replace('.', ',');
    $('stat-distance').textContent = kmText;
    $('stat-gain').textContent = Math.round(ele.gain);
    $('stat-loss').textContent = Math.round(ele.loss);
    $('stat-time').textContent = formatDuration(hours);
    $('header-summary').textContent = track.length ? `${kmText} km · ↑${Math.round(ele.gain)} m` : '';

    chart.setData(track, dist);
    map.invalidateSize();

    const pending = segs.filter((s) => s.status === 'pending').length;
    const failed = segs.filter((s) => s.status === 'fallback');
    const n = state.waypoints.length;
    if (pending) setStatus('Route berekenen…', 'busy');
    else if (failed.length)
      setStatus(
        `${failed.length} stuk(ken) konden niet over de weg berekend worden; daar staat een rechte lijn (stippellijn).`,
        'error'
      );
    else if (n === 0) setStatus('Klik op de kaart om je startpunt te kiezen.');
    else if (n === 1) setStatus('Klik op een volgend punt om de route te tekenen.');
    else setStatus(`${n} punten. Sleep punten om de route aan te passen.`);

    $('btn-undo').disabled = !state.history.length;
    const hasRoute = n > 1;
    ['btn-reverse', 'btn-loop', 'btn-gpx', 'btn-gmaps'].forEach((id) => ($(id).disabled = !hasRoute));
    $('btn-clear').disabled = n === 0;
  }

  // ---------- Opslaan ----------
  function save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ waypoints: state.waypoints, profile: state.profile, name: $('route-name').value })
      );
    } catch (e) {
      /* opslag niet beschikbaar (privévenster) */
    }
  }

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!data) return;
      if (Array.isArray(data.waypoints)) state.waypoints = data.waypoints.filter((w) => isFinite(w.lat) && isFinite(w.lng));
      if (PROFILES[data.profile]) state.profile = data.profile;
      if (data.name) $('route-name').value = data.name;
    } catch (e) {
      /* negeren */
    }
  }

  function changed() {
    renderMarkers();
    renderRoute();
    save();
  }

  // ---------- Sportkeuze ----------
  function renderProfiles() {
    const box = $('profiles');
    box.innerHTML = '';
    Object.entries(PROFILES).forEach(([k, p]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.textContent = p.label;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(k === state.profile));
      b.addEventListener('click', () => {
        state.profile = k;
        renderProfiles();
        changed();
      });
      box.appendChild(b);
    });
  }

  // ---------- Gebeurtenissen ----------
  map.on('click', (e) => {
    snapshot();
    state.waypoints.push({ lat: e.latlng.lat, lng: e.latlng.lng });
    changed();
  });

  $('btn-undo').addEventListener('click', undo);
  $('btn-clear').addEventListener('click', () => {
    if (!state.waypoints.length) return;
    snapshot();
    state.waypoints = [];
    changed();
  });
  $('btn-reverse').addEventListener('click', () => {
    snapshot();
    state.waypoints.reverse();
    changed();
  });
  $('btn-loop').addEventListener('click', () => {
    if (state.waypoints.length < 2) return;
    snapshot();
    state.waypoints.push({ ...state.waypoints[0] });
    changed();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA/.test(e.target.tagName)) {
      e.preventDefault();
      undo();
    }
  });

  $('route-name').addEventListener('input', save);

  // GPX downloaden
  $('btn-gpx').addEventListener('click', () => {
    const track = fullTrack(currentSegments());
    if (track.length < 2) return;
    const name = $('route-name').value.trim() || 'Mijn route';
    const gpx = Geo.toGpx(name, track);
    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name.replace(/[^\w\-]+/g, '_') + '.gpx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // Openen in Google Maps
  $('btn-gmaps').addEventListener('click', () => {
    const url = Geo.googleMapsUrl(state.waypoints, PROFILES[state.profile].google);
    if (url) window.open(url, '_blank', 'noopener');
  });

  // GPX importeren: de track wordt in stukken verdeeld zodat je hem daarna nog kunt bewerken.
  $('gpx-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const pts = Geo.parseGpx(await file.text()).filter((p) => isFinite(p.lat) && isFinite(p.lng));
      if (pts.length < 2) throw new Error('Geen route gevonden in dit bestand');

      const count = Math.min(pts.length, Math.max(2, Math.min(30, Math.round(pts.length / 50))));
      const idx = [];
      for (let i = 0; i < count; i++) idx.push(Math.round((i * (pts.length - 1)) / (count - 1)));

      snapshot();
      state.waypoints = idx.map((i) => ({ lat: pts[i].lat, lng: pts[i].lng }));
      for (let i = 0; i < idx.length - 1; i++) {
        const a = state.waypoints[i];
        const b = state.waypoints[i + 1];
        segments.set(key(a, b), { status: 'ok', coords: pts.slice(idx[i], idx[i + 1] + 1) });
      }
      const name = file.name.replace(/\.gpx$/i, '');
      $('route-name').value = name;
      changed();
      map.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])), { padding: [30, 30] });
    } catch (err) {
      setStatus('Importeren mislukt: ' + err.message, 'error');
    }
  });

  // Zoeken (Nominatim)
  $('search-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('search-input').value.trim();
    const list = $('search-results');
    if (!q) return;
    list.hidden = true;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=nl&q=${encodeURIComponent(q)}`
      );
      const results = await res.json();
      list.innerHTML = '';
      if (!results.length) {
        list.innerHTML = '<li>Niets gevonden</li>';
      }
      results.forEach((r) => {
        const li = document.createElement('li');
        li.textContent = r.display_name;
        li.addEventListener('click', () => {
          list.hidden = true;
          if (r.boundingbox) {
            const [s, n, w, ea] = r.boundingbox.map(Number);
            map.fitBounds([[s, w], [n, ea]], { maxZoom: 15 });
          } else {
            map.setView([+r.lat, +r.lon], 14);
          }
        });
        list.appendChild(li);
      });
      list.hidden = false;
    } catch (err) {
      setStatus('Zoeken mislukt: ' + err.message, 'error');
    }
  });

  // Paneel in-/uitklappen op mobiel
  function togglePanel() {
    $('panel').classList.toggle('collapsed');
    setTimeout(() => map.invalidateSize(), 50);
  }
  $('panel-header').addEventListener('click', () => {
    if (MOBILE()) togglePanel();
  });
  // Op de gsm start het menu ingeklapt, zodat de kaart zo groot mogelijk is.
  if (MOBILE()) $('panel').classList.add('collapsed');

  // ---------- Start ----------
  load();
  renderProfiles();
  changed();
  if (state.waypoints.length) {
    map.fitBounds(L.latLngBounds(state.waypoints.map((w) => [w.lat, w.lng])), { padding: [40, 40], maxZoom: 15 });
  }
})();
