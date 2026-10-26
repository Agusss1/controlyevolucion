import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { pointToCell } from '@cyo/shared';
import { UNIT_INFO } from '@cyo/simulation';
import type { UnitView, WorldView } from '@cyo/simulation';
import { useGame, type MapLayer } from '../store/game';
import { getGeometry, bordersBy, frontSegments, provinceCenter, type MapGeometry } from './mapData';
import { renderTerrain, renderOverlay, rgba, ramp, PX, getProvincePaths } from './render';
import { command } from '../net/connection';
import { loadPrefs } from '../net/api';

interface Camera { x: number; y: number; zoom: number }

const ORG_COLORS = ['#e2c27a', '#e5534b', '#58a6ff', '#3fb950', '#bc8cff', '#f778ba', '#ffa657', '#79c0ff', '#a5d6ff', '#7ee787'];

function provinceColorFn(layer: MapLayer, view: WorldView, geo: MapGeometry, me: string | null): (idx: number) => string | null {
  const countries = new Map(view.countries.map((c) => [c.id, c]));
  const provs = geo.map.provinces;
  switch (layer) {
    case 'political': case 'military': case 'fronts':
      return (i) => rgba(countries.get(view.owner[i])?.color ?? '#888888', layer === 'political' ? 0.62 : 0.4);
    case 'geographic': return () => null;
    case 'economic': {
      const vals = provs.map((p, i) => { const c = countries.get(view.owner[i]); return c ? c.gdpPerCapita : 0; });
      const mx = Math.log(Math.max(...vals, 1000));
      return (i) => ramp((Math.log(Math.max(300, vals[i])) - Math.log(300)) / (mx - Math.log(300)), 'green');
    }
    case 'population': {
      const dens = provs.map((p, i) => view.pop[i] / Math.max(1, p.cells));
      const mx = Math.max(...dens);
      return (i) => ramp(Math.sqrt(dens[i] / mx), 'heat');
    }
    case 'resources': return (i) => {
      const r = provs[i].resources;
      if (r.oil > 40) return 'rgba(30,30,30,0.7)';
      if (r.gas > 30) return 'rgba(80,140,220,0.65)';
      if (r.minerals > 60) return 'rgba(190,120,60,0.65)';
      if (r.coal > 50) return 'rgba(90,80,70,0.65)';
      if (r.fertile > 12) return 'rgba(120,200,80,0.55)';
      return null;
    };
    case 'infrastructure': return (i) => ramp(view.infra[i], 'blue');
    case 'stability': return (i) => ramp(1 - view.unrest[i], 'diverging');
    case 'technology': {
      const mx = Math.max(...view.countries.map((c) => c.techs));
      const mn = Math.min(...view.countries.map((c) => c.techs));
      return (i) => ramp(((countries.get(view.owner[i])?.techs ?? mn) - mn) / Math.max(1, mx - mn), 'blue');
    }
    case 'diplomacy': return (i) => {
      const o = view.owner[i];
      if (!me) return rgba(countries.get(o)?.color ?? '#888', 0.4);
      if (o === me) return 'rgba(226,194,122,0.75)';
      const r = view.relations[o];
      if (!r) return null;
      return ramp((r.opinion + 100) / 200, 'diverging', 0.7);
    };
    case 'alliances': {
      const military = view.organizations.filter((o) => o.mutualDefense);
      return (i) => {
        const o = view.owner[i];
        const k = military.findIndex((org) => org.members.includes(o));
        return k >= 0 ? rgba(ORG_COLORS[k % ORG_COLORS.length], 0.6) : 'rgba(120,120,120,0.25)';
      };
    }
    case 'trade': return (i) => rgba(countries.get(view.owner[i])?.color ?? '#888', 0.25);
    case 'culture': {
      const cul = new Map(geo.map.cultures.map((c) => [c.id, c.color]));
      return (i) => rgba(cul.get(provs[i].culture) ?? '#777', 0.6);
    }
  }
}

export function MapView() {
  const map = useGame((s) => s.map);
  const view = useGame((s) => s.view);
  const layer = useGame((s) => s.layer);
  const me = useGame((s) => s.you?.countryId ?? null);
  const selectedProvince = useGame((s) => s.selectedProvince);
  const selectedUnits = useGame((s) => s.selectedUnits);
  const hostile = useGame((s) => s.priv?.hostile ?? []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cam = useRef<Camera>({ x: 0, y: 0, zoom: 4 });
  const dirty = useRef(true);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const prefs = useMemo(() => loadPrefs(), []);

  const geo = useMemo(() => (map ? getGeometry(map) : null), [map]);
  const terrain = useMemo(() => (geo ? renderTerrain(geo) : null), [geo]);
  const ownerKey = view ? view.owner.join(',') + '|' + view.controller.join(',') : '';
  const overlay = useMemo(() => {
    if (!geo || !view) return null;
    const colorOf = provinceColorFn(layer, view, geo, me);
    const countries = new Map(view.countries.map((c) => [c.id, c]));
    const hatch = layer === 'geographic' ? undefined : (i: number) => (view.controller[i] !== view.owner[i] ? rgba(countries.get(view.controller[i])?.color ?? '#000', 0.95) : null);
    return renderOverlay(geo, colorOf, hatch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, layer, ownerKey, view?.day, me]);
  const countryBorders = useMemo(() => (geo && view ? bordersBy(geo, (i) => view.owner[i]) : null), [geo, ownerKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const fronts = useMemo(() => {
    if (!geo || !view) return null;
    const warPairs = new Set<string>();
    for (const w of view.wars) {
      if (w.status !== 'active' && w.status !== 'frozen') continue;
      const att = w.participants.filter((p) => p.side === 'attacker').map((p) => p.country);
      const def = w.participants.filter((p) => p.side === 'defender').map((p) => p.country);
      for (const a of att) for (const d of def) { warPairs.add(`${a}|${d}`); warPairs.add(`${d}|${a}`); }
    }
    return warPairs.size ? frontSegments(geo, view.controller, (a, b) => warPairs.has(`${a}|${b}`)) : null;
  }, [geo, ownerKey, view?.wars]); // eslint-disable-line react-hooks/exhaustive-deps

  // centrar en el país propio al cargar
  useEffect(() => {
    if (!geo || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const fit = Math.min(r.width / geo.worldW, r.height / geo.worldH) * 0.98;
    cam.current = { zoom: fit, x: (r.width - geo.worldW * fit) / 2, y: (r.height - geo.worldH * fit) / 2 };
    const cap = me && view ? view.countries.find((c) => c.id === me)?.capital : null;
    if (cap) {
      const [cx, cy] = provinceCenter(geo, cap);
      const z = fit * 2.4;
      cam.current = { zoom: z, x: r.width / 2 - cx * z, y: r.height / 2 - cy * z };
    }
    dirty.current = true;
  }, [geo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { dirty.current = true; }, [overlay, countryBorders, fronts, view, selectedProvince, selectedUnits, layer]);

  // bucle de dibujo
  useEffect(() => {
    let raf = 0;
    let t0 = performance.now();
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const cv = canvasRef.current, wrap = wrapRef.current;
      if (!cv || !wrap || !geo || !terrain) return;
      const animated = !prefs.reduceMotion && (layer === 'trade' || !!fronts || (view?.units.some((u) => u.path.length) ?? false) || (view?.battles.some((b) => b.status === 'active') ?? false));
      if (!dirty.current && !(animated && now - t0 > 50)) return;
      t0 = now;
      dirty.current = false;
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = `${w}px`; cv.style.height = `${h}px`; }
      const ctx = cv.getContext('2d')!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0b1a2b';
      ctx.fillRect(0, 0, cv.width, cv.height);
      const { x, y, zoom } = cam.current;
      ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, x * dpr, y * dpr);
      ctx.imageSmoothingEnabled = zoom < PX;
      ctx.drawImage(terrain, 0, 0, geo.worldW, geo.worldH);
      if (overlay && layer !== 'geographic') ctx.drawImage(overlay, 0, 0, geo.worldW, geo.worldH);
      const px = 1 / zoom;
      // fronteras
      if (zoom > 6) { ctx.strokeStyle = 'rgba(10,15,25,0.35)'; ctx.lineWidth = px * 0.8; ctx.stroke(geo.provinceBorders); }
      if (countryBorders) {
        ctx.strokeStyle = 'rgba(8,10,16,0.85)'; ctx.lineWidth = Math.max(px * 2.2, 0.12); ctx.lineJoin = 'round'; ctx.stroke(countryBorders);
        ctx.strokeStyle = 'rgba(240,217,160,0.18)'; ctx.lineWidth = px * 0.8; ctx.stroke(countryBorders);
      }
      // frentes de guerra animados
      if (fronts && (layer === 'fronts' || layer === 'military' || layer === 'political')) {
        ctx.save();
        ctx.strokeStyle = '#ff4d3d'; ctx.lineWidth = Math.max(px * 3, 0.25); ctx.setLineDash([0.6, 0.4]); ctx.lineDashOffset = -(now / 600) % 1; ctx.stroke(fronts); ctx.restore();
      }
      // provincia seleccionada
      if (selectedProvince && geo.provIndex.has(selectedProvince)) {
        const p = getProvincePaths(geo)[geo.provIndex.get(selectedProvince)!];
        ctx.fillStyle = 'rgba(240,217,160,0.18)'; ctx.fill(p);
        ctx.strokeStyle = '#f0d9a0'; ctx.lineWidth = px * 2; ctx.stroke(p);
      }
      if (view) {
        drawTrade(ctx, geo, view, layer, now, px);
        drawLabels(ctx, geo, view, zoom, px, prefs.mapLabels);
        if (layer !== 'geographic') drawUnits(ctx, geo, view, zoom, px, me, selectedUnits, now);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [geo, terrain, overlay, countryBorders, fronts, view, layer, me, selectedProvince, selectedUnits, prefs]);

  // ------------------------------------------------------------------ interacción
  const toWorld = useCallback((sx: number, sy: number) => { const c = cam.current; return [(sx - c.x) / c.zoom, (sy - c.y) / c.zoom] as [number, number]; }, []);
  const pick = useCallback((sx: number, sy: number): { province: string | null; sea: string | null; units: UnitView[] } => {
    if (!geo || !view) return { province: null, sea: null, units: [] };
    const [wx, wy] = toWorld(sx, sy);
    // unidades primero (iconos)
    const groups = unitGroups(geo, view);
    for (const g of groups) {
      const [ux, uy] = g.pos;
      const s = Math.max(1.2, 14 / cam.current.zoom);
      if (Math.abs(wx - ux) < s * 1.1 && Math.abs(wy - uy) < s * 0.75) return { province: null, sea: null, units: g.units };
    }
    const cell = pointToCell(wx, wy, geo.width, geo.height);
    if (cell < 0) return { province: null, sea: null, units: [] };
    const p = geo.cellProv[cell];
    const s = geo.cellSea[cell];
    return { province: p > 0 ? geo.map.provinces[p - 1].id : null, sea: s > 0 ? geo.map.seaZones[s - 1].id : null, units: [] };
  }, [geo, view, toWorld]);

  const drag = useRef<{ sx: number; sy: number; cx: number; cy: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, cx: cam.current.x, cy: cam.current.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    if (drag.current) {
      const dx = e.clientX - drag.current.sx, dy = e.clientY - drag.current.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.current.moved = true;
      if (drag.current.moved) { cam.current.x = drag.current.cx + dx; cam.current.y = drag.current.cy + dy; dirty.current = true; setHover(null); return; }
    }
    if (!geo || !view) return;
    const res = pick(e.clientX - rect.left, e.clientY - rect.top);
    if (res.units.length) {
      const owner = view.countries.find((c) => c.id === res.units[0].owner);
      setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, text: `${owner?.name ?? ''}: ${res.units.length} unidad(es)${res.units[0].estimated ? ' (estimación)' : ''}` });
    } else if (res.province) {
      const idx = geo.provIndex.get(res.province)!;
      const ps = geo.map.provinces[idx];
      const owner = view.countries.find((c) => c.id === view.owner[idx]);
      const ctrl = view.controller[idx] !== view.owner[idx] ? view.countries.find((c) => c.id === view.controller[idx]) : null;
      setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, text: `${ps.name} · ${owner?.name ?? ''}${ctrl ? ` (ocupada por ${ctrl.name})` : ''}` });
    } else setHover(null);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || !view) return;
    const rect = wrapRef.current!.getBoundingClientRect();
    const res = pick(e.clientX - rect.left, e.clientY - rect.top);
    const st = useGame.getState();
    if (res.units.length) {
      const mine = res.units.filter((u) => u.owner === me);
      if (mine.length) st.setSelectedUnits(e.shiftKey ? [...new Set([...st.selectedUnits, ...mine.map((u) => u.id)])] : mine.map((u) => u.id));
      else st.selectCountry(res.units[0].owner);
      return;
    }
    if (res.province) {
      const idx = geo!.provIndex.get(res.province)!;
      st.selectProvince(res.province);
      st.selectCountry(view.owner[idx]);
      if (!e.shiftKey) st.setSelectedUnits([]);
    } else { st.selectProvince(null); st.setSelectedUnits([]); }
  };
  const onContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    const st = useGame.getState();
    if (!st.selectedUnits.length || !view) return;
    const rect = wrapRef.current!.getBoundingClientRect();
    const res = pick(e.clientX - rect.left, e.clientY - rect.top);
    const target = res.province ?? res.sea;
    if (!target) return;
    const units = st.selectedUnits.map((id) => view.units.find((u) => u.id === id)).filter((u): u is UnitView => !!u);
    const land = units.filter((u) => UNIT_INFO[u.type as keyof typeof UNIT_INFO]?.domain === 'land').map((u) => u.id);
    const sea = units.filter((u) => UNIT_INFO[u.type as keyof typeof UNIT_INFO]?.domain === 'sea').map((u) => u.id);
    const air = units.filter((u) => UNIT_INFO[u.type as keyof typeof UNIT_INFO]?.domain === 'air').map((u) => u.id);
    if (land.length && res.province) {
      const idx = geo!.provIndex.get(res.province)!;
      const enemy = hostile.includes(view.controller[idx]);
      const r = await command({ type: 'orderUnits', units: land, order: enemy ? 'attack' : 'move', target: res.province });
      if (r.ok) st.toast(enemy ? 'Orden de ataque emitida' : 'Orden de movimiento emitida', 'success');
    }
    if (sea.length) await command({ type: 'orderUnits', units: sea, order: 'move', target: res.sea ?? res.province });
    if (air.length && res.province) {
      const idx = geo!.provIndex.get(res.province)!;
      const enemy = hostile.includes(view.controller[idx]);
      await command({ type: 'orderUnits', units: air, order: enemy ? 'ground_support' : 'air_superiority', target: res.province });
    }
  };
  const onWheel = (e: React.WheelEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const c = cam.current;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const nz = Math.max(2, Math.min(60, c.zoom * factor));
    c.x = sx - (sx - c.x) * (nz / c.zoom);
    c.y = sy - (sy - c.y) * (nz / c.zoom);
    c.zoom = nz;
    dirty.current = true;
  };

  if (!map) return <div className="flex h-full items-center justify-center text-slate-400">Cargando mapa…</div>;
  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden" onWheel={onWheel}>
      <canvas ref={canvasRef} className="block cursor-grab active:cursor-grabbing" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={() => setHover(null)} onContextMenu={onContextMenu} />
      {hover && <div className="pointer-events-none absolute z-10 rounded border border-ink-500 bg-ink-900/95 px-2 py-1 text-xs text-slate-200 shadow-panel" style={{ left: hover.x + 14, top: hover.y + 12 }}>{hover.text}</div>}
      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-ink-900/70 px-2 py-0.5 text-[10px] text-slate-400">Arrastrar: mover · Rueda: zoom · Clic: seleccionar · Clic derecho con unidades: ordenar</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function drawLabels(ctx: CanvasRenderingContext2D, geo: MapGeometry, view: WorldView, zoom: number, px: number, enabled: boolean) {
  if (!enabled) return;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // nombres de países en el centro de su territorio
  if (zoom < 14) {
    const acc = new Map<string, { x: number; y: number; n: number }>();
    view.owner.forEach((o, i) => { const p = geo.map.provinces[i]; const a = acc.get(o) ?? { x: 0, y: 0, n: 0 }; a.x += p.cx * p.cells; a.y += p.cy * p.cells; a.n += p.cells; acc.set(o, a); });
    for (const c of view.countries) {
      const a = acc.get(c.id);
      if (!a || !c.alive) continue;
      const size = Math.min(26, Math.max(9, Math.sqrt(a.n) * 1.3 * zoom / 6)) * px;
      if (size / px < 8) continue;
      ctx.font = `600 ${size}px Cinzel, Georgia, serif`;
      ctx.lineWidth = size * 0.22;
      ctx.strokeStyle = 'rgba(5,8,14,0.75)';
      ctx.fillStyle = 'rgba(245,235,210,0.92)';
      const name = c.name.toUpperCase();
      ctx.strokeText(name, a.x / a.n, a.y / a.n);
      ctx.fillText(name, a.x / a.n, a.y / a.n);
    }
  }
  // ciudades y capitales
  if (zoom > 7) {
    const capitals = new Set(view.countries.filter((c) => c.alive).map((c) => c.capital));
    ctx.font = `500 ${11 * px}px Inter, sans-serif`;
    for (const p of geo.map.provinces) {
      const cap = capitals.has(p.id);
      if (!cap && zoom < 11) continue;
      ctx.fillStyle = cap ? '#f0d9a0' : '#e8e8e8';
      ctx.beginPath();
      if (cap) star(ctx, p.cx, p.cy - 0.6, 5 * px); else ctx.arc(p.cx, p.cy - 0.6, 2.4 * px, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 3 * px; ctx.strokeStyle = 'rgba(5,8,14,0.8)';
      ctx.strokeText(p.cityName, p.cx, p.cy + 0.4);
      ctx.fillStyle = 'rgba(240,240,240,0.95)';
      ctx.fillText(p.cityName, p.cx, p.cy + 0.4);
    }
  }
  // rasgos geográficos
  if (zoom > 4 && zoom < 16) {
    for (const f of geo.map.features) {
      if (f.kind === 'river' && zoom < 9) continue;
      if (f.kind !== 'ocean' && zoom < 6) continue;
      ctx.font = `italic ${(f.kind === 'ocean' ? 13 : 10) * px}px Georgia, serif`;
      ctx.fillStyle = f.kind === 'ocean' ? 'rgba(160,200,235,0.55)' : f.kind === 'river' ? 'rgba(150,200,240,0.8)' : 'rgba(30,25,15,0.65)';
      ctx.fillText(f.name, f.cx, f.cy);
    }
  }
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 ? r * 0.45 : r;
    if (i === 0) ctx.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); else ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
  }
  ctx.closePath();
}

interface UnitGroup { pos: [number, number]; units: UnitView[]; owner: string; location: string }

function unitGroups(geo: MapGeometry, view: WorldView): UnitGroup[] {
  const groups = new Map<string, UnitGroup>();
  for (const u of view.units) {
    const key = `${u.location}|${u.owner}`;
    let g = groups.get(key);
    if (!g) {
      const [x, y] = provinceCenter(geo, u.location);
      g = { pos: [x, y], units: [], owner: u.owner, location: u.location };
      groups.set(key, g);
    }
    g.units.push(u);
  }
  // separar grupos de distintos dueños en la misma provincia
  const byLoc = new Map<string, UnitGroup[]>();
  for (const g of groups.values()) { const l = byLoc.get(g.location) ?? []; l.push(g); byLoc.set(g.location, l); }
  for (const l of byLoc.values()) l.forEach((g, i) => { g.pos = [g.pos[0] + (i - (l.length - 1) / 2) * 2.6, g.pos[1] + 1.4]; });
  return [...groups.values()];
}

function drawUnits(ctx: CanvasRenderingContext2D, geo: MapGeometry, view: WorldView, zoom: number, px: number, me: string | null, selected: string[], now: number) {
  if (zoom < 3) return;
  const colors = new Map(view.countries.map((c) => [c.id, c.color]));
  const sel = new Set(selected);
  // trayectorias de movimiento
  for (const u of view.units) {
    if (!u.path.length) continue;
    const pts = [provinceCenter(geo, u.location), ...u.path.map((p) => provinceCenter(geo, p))];
    ctx.save();
    ctx.strokeStyle = u.owner === me ? 'rgba(240,217,160,0.9)' : 'rgba(255,120,100,0.9)';
    ctx.lineWidth = 2 * px;
    ctx.setLineDash([6 * px, 4 * px]);
    ctx.lineDashOffset = -(now / 40) * px;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    const [ex, ey] = pts[pts.length - 1];
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(ex, ey, 3 * px, 0, Math.PI * 2); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
    ctx.restore();
  }
  // batallas
  for (const b of view.battles) {
    if (b.status !== 'active' && b.status !== 'frozen') continue;
    const [x, y] = provinceCenter(geo, b.province);
    const pulse = 1 + 0.25 * Math.sin(now / 200);
    ctx.save();
    ctx.translate(x, y - 2);
    ctx.scale(pulse, pulse);
    ctx.strokeStyle = b.status === 'frozen' ? '#8ab4f8' : '#ff5a4a';
    ctx.lineWidth = 2.5 * px;
    const s = 7 * px;
    ctx.beginPath(); ctx.moveTo(-s, -s); ctx.lineTo(s, s); ctx.moveTo(s, -s); ctx.lineTo(-s, s); ctx.stroke();
    ctx.restore();
  }
  // iconos de unidades (estilo OTAN simplificado)
  const w = Math.max(1.2, 14 * px), h = w * 0.66;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const g of unitGroups(geo, view)) {
    const [x, y] = g.pos;
    const isSel = g.units.some((u) => sel.has(u.id));
    const main = g.units.slice().sort((a, b) => b.strength - a.strength)[0];
    const info = UNIT_INFO[main.type as keyof typeof UNIT_INFO];
    ctx.fillStyle = colors.get(g.owner) ?? '#999';
    ctx.strokeStyle = isSel ? '#ffe9a8' : g.owner === me ? '#f0d9a0' : 'rgba(5,8,14,0.9)';
    ctx.lineWidth = (isSel ? 2.5 : 1.2) * px;
    ctx.beginPath();
    if (info?.domain === 'sea') { ctx.ellipse(x, y, w * 0.6, h * 0.55, 0, 0, Math.PI * 2); }
    else if (info?.domain === 'air') { ctx.moveTo(x - w / 2, y + h / 2); ctx.lineTo(x, y - h / 2); ctx.lineTo(x + w / 2, y + h / 2); ctx.closePath(); }
    else ctx.rect(x - w / 2, y - h / 2, w, h);
    ctx.fill();
    ctx.stroke();
    // símbolo de tipo
    ctx.strokeStyle = 'rgba(10,12,18,0.9)';
    ctx.lineWidth = 1 * px;
    if (main.type === 'infantry' || main.type === 'mechanized') { ctx.beginPath(); ctx.moveTo(x - w / 2, y - h / 2); ctx.lineTo(x + w / 2, y + h / 2); ctx.moveTo(x + w / 2, y - h / 2); ctx.lineTo(x - w / 2, y + h / 2); ctx.stroke(); }
    if (main.type === 'armored' || main.type === 'mechanized') { ctx.beginPath(); ctx.ellipse(x, y, w * 0.32, h * 0.25, 0, 0, Math.PI * 2); ctx.stroke(); }
    if (main.type === 'artillery') { ctx.beginPath(); ctx.arc(x, y, h * 0.15, 0, Math.PI * 2); ctx.fillStyle = 'rgba(10,12,18,0.9)'; ctx.fill(); }
    // contador
    if (zoom > 5) {
      ctx.font = `700 ${9 * px}px Inter, sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 2.5 * px;
      const label = `${g.units.length}`;
      ctx.strokeText(label, x + w * 0.62, y - h * 0.55);
      ctx.fillText(label, x + w * 0.62, y - h * 0.55);
      // barra de fuerza
      const avg = g.units.reduce((a, u) => a + u.strength, 0) / g.units.length;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - w / 2, y + h / 2 + 1.5 * px, w, 2.5 * px);
      ctx.fillStyle = avg > 0.66 ? '#3fb950' : avg > 0.33 ? '#d29922' : '#e5534b'; ctx.fillRect(x - w / 2, y + h / 2 + 1.5 * px, w * Math.min(1, avg), 2.5 * px);
    }
  }
}

function drawTrade(ctx: CanvasRenderingContext2D, geo: MapGeometry, view: WorldView, layer: MapLayer, now: number, px: number) {
  if (layer !== 'trade') return;
  const caps = new Map(view.countries.map((c) => [c.id, c.capital]));
  const max = Math.max(1, ...view.trade.map((t) => t.value));
  ctx.save();
  for (const t of view.trade.slice(0, 60)) {
    const a = caps.get(t.from), b = caps.get(t.to);
    if (!a || !b) continue;
    const [x1, y1] = provinceCenter(geo, a), [x2, y2] = provinceCenter(geo, b);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.18;
    ctx.strokeStyle = `rgba(240,200,90,${0.25 + 0.6 * t.value / max})`;
    ctx.lineWidth = (1 + 6 * t.value / max) * px;
    ctx.setLineDash([8 * px, 6 * px]);
    ctx.lineDashOffset = -(now / 30) * px;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2); ctx.stroke();
  }
  ctx.restore();
}
