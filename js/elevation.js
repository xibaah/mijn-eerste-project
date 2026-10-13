// Hoogteprofiel als SVG-grafiek onderaan de kaart.
(function (root) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const PAD = { left: 44, right: 12, top: 12, bottom: 20 };

  function el(name, attrs, parent) {
    const node = document.createElementNS(SVG_NS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  // Een "mooie" stapgrootte voor de assen (1, 2, 5, 10, 20, 50, ...).
  function niceStep(range, targetTicks) {
    const raw = range / targetTicks;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / pow;
    return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * pow;
  }

  function formatKm(m) {
    const km = m / 1000;
    return (km < 10 ? km.toFixed(1) : Math.round(km).toString()).replace('.', ',');
  }

  function ElevationChart(container, onHover) {
    this.container = container;
    this.svg = container.querySelector('svg');
    this.tooltip = container.querySelector('.elevation-tooltip');
    this.onHover = onHover;
    this.points = [];
    this.dist = [];

    const move = (evt) => this._hover(evt);
    const leave = () => this._clearHover();
    this.svg.addEventListener('mousemove', move);
    this.svg.addEventListener('touchmove', move, { passive: true });
    this.svg.addEventListener('touchstart', move, { passive: true });
    this.svg.addEventListener('mouseleave', leave);
    this.svg.addEventListener('touchend', leave);
    window.addEventListener('resize', () => this.draw());
  }

  ElevationChart.prototype.setData = function (points, dist) {
    this.points = points;
    this.dist = dist;
    const hasEle = points.some((p) => p.ele != null);
    this.container.hidden = !(points.length > 1 && hasEle);
    this.draw();
  };

  ElevationChart.prototype.draw = function () {
    const svg = this.svg;
    svg.innerHTML = '';
    if (this.container.hidden) return;

    const w = svg.clientWidth;
    const h = svg.clientHeight;
    if (!w || !h) return;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const pts = this.points;
    const dist = this.dist;
    const total = dist[dist.length - 1] || 1;
    const eles = pts.map((p) => p.ele).filter((e) => e != null);
    let min = Math.min(...eles);
    let max = Math.max(...eles);
    if (max - min < 20) {
      const mid = (max + min) / 2;
      min = mid - 10;
      max = mid + 10;
    }
    const yStep = niceStep(max - min, 3);
    min = Math.floor(min / yStep) * yStep;
    max = Math.ceil(max / yStep) * yStep;

    const plotW = w - PAD.left - PAD.right;
    const plotH = h - PAD.top - PAD.bottom;
    const x = (d) => PAD.left + (d / total) * plotW;
    const y = (e) => PAD.top + plotH - ((e - min) / (max - min)) * plotH;
    this._scale = { x, total, plotW };

    // Rasterlijnen + labels
    for (let e = min; e <= max + 1e-6; e += yStep) {
      el('line', { class: 'grid', x1: PAD.left, x2: w - PAD.right, y1: y(e), y2: y(e) }, svg);
      el('text', { class: 'axis-label', x: PAD.left - 6, y: y(e) + 3, 'text-anchor': 'end' }, svg).textContent =
        `${Math.round(e)} m`;
    }
    const xStep = niceStep(total, Math.max(2, Math.floor(plotW / 90)));
    for (let d = 0; d <= total + 1e-6; d += xStep) {
      el('text', { class: 'axis-label', x: x(d), y: h - 5, 'text-anchor': 'middle' }, svg).textContent =
        `${formatKm(d)} km`;
    }

    // Profiel
    let line = '';
    let lastE = eles[0];
    pts.forEach((p, i) => {
      const e = p.ele != null ? p.ele : lastE;
      lastE = e;
      line += `${i ? 'L' : 'M'}${x(dist[i]).toFixed(1)},${y(e).toFixed(1)}`;
    });
    const base = y(min);
    el('path', { class: 'area', d: `${line}L${x(total)},${base}L${x(0)},${base}Z` }, svg);
    el('path', { class: 'line', d: line }, svg);

    this.cursor = el('line', { class: 'cursor', y1: PAD.top, y2: PAD.top + plotH, visibility: 'hidden' }, svg);
  };

  ElevationChart.prototype._hover = function (evt) {
    if (!this._scale || !this.points.length) return;
    const src = evt.touches ? evt.touches[0] : evt;
    const rect = this.svg.getBoundingClientRect();
    const px = src.clientX - rect.left;
    const { total, plotW } = this._scale;
    const d = Math.max(0, Math.min(total, ((px - PAD.left) / plotW) * total));

    // Binair zoeken naar het dichtstbijzijnde punt
    const dist = this.dist;
    let lo = 0;
    let hi = dist.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (dist[mid] < d) lo = mid;
      else hi = mid;
    }
    const i = d - dist[lo] < dist[hi] - d ? lo : hi;
    this.showIndex(i);
  };

  ElevationChart.prototype.showIndex = function (i) {
    const p = this.points[i];
    if (!p || !this.cursor) return;
    const cx = this._scale.x(this.dist[i]);
    this.cursor.setAttribute('x1', cx);
    this.cursor.setAttribute('x2', cx);
    this.cursor.setAttribute('visibility', 'visible');
    this.tooltip.hidden = false;
    this.tooltip.style.left = `${Math.max(60, Math.min(this.svg.clientWidth - 60, cx))}px`;
    const ele = p.ele != null ? `${Math.round(p.ele)} m` : '–';
    this.tooltip.textContent = `${formatKm(this.dist[i])} km · ${ele}`;
    if (this.onHover) this.onHover(p);
  };

  ElevationChart.prototype._clearHover = function () {
    if (this.cursor) this.cursor.setAttribute('visibility', 'hidden');
    this.tooltip.hidden = true;
    if (this.onHover) this.onHover(null);
  };

  root.ElevationChart = ElevationChart;
})(window);
