/**
 * Marketing & Comercial · Informes.
 * Reúne información comercial (de Ventas y Pedidos Ya) para pensar acciones de marketing.
 * FASE 1 — Ventas semanal: ventas $ y órdenes, ticket promedio y % canal Pedidos Ya,
 * consolidado y por sucursal, comparado contra la semana anterior y el promedio de las
 * últimas 4 semanas. Semanas del negocio (1-7 / 8-14 / 15-21 / 22-fin).
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { TrendingUp, TrendingDown, Minus, RefreshCw, Store, DollarSign, Receipt, ShoppingBag, ChevronLeft, ChevronRight, CalendarDays, Activity, Tag, MessageSquareWarning } from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { Branch } from '../types';

const fmt = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-AR');
const fmtNum = (n: number) => Math.round(n || 0).toLocaleString('es-AR');
const SEM_RANGO = ['1-7', '8-14', '15-21', '22-fin'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const monthLabel = (m: string) => { const [y, mm] = m.split('-'); return `${MESES[(parseInt(mm, 10) || 1) - 1]} ${y}`; };
const prevMonthOf = (m: string) => { const [y, mm] = m.split('-').map(Number); const d = new Date(y, mm - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const prevYearMonthOf = (m: string) => { const [y, mm] = m.split('-'); return `${parseInt(y, 10) - 1}-${mm}`; };
const wkLabel = (key: string) => { const [m, w] = key.split('#'); return `${monthLabel(m)} · Sem ${w} (${SEM_RANGO[(parseInt(w, 10) || 1) - 1]})`; };

type Agg = { venta: number; ordenes: number; py: number };
const zero = (): Agg => ({ venta: 0, ordenes: 0, py: 0 });
const isPY = (pm: string) => /pedidos\s*ya|peya|ped\s*ya|pedidosya/i.test(pm || '');
const normCat = (s: any) => String(s ?? '').trim().toUpperCase();

// Variación con color/ícono
function Delta({ cur, base, invert = false }: { cur: number; base: number | null; invert?: boolean }) {
  if (base == null || base === 0) return <span className="text-text-dim text-[10px]">—</span>;
  const pct = ((cur - base) / Math.abs(base)) * 100;
  const good = invert ? pct < 0 : pct > 0;
  const neutral = Math.abs(pct) < 0.05;
  return (
    <span className={cn('inline-flex items-center gap-0.5 font-mono font-bold text-[10px]', neutral ? 'text-text-dim' : good ? 'text-emerald-500' : 'text-red-500')}>
      {neutral ? <Minus size={10} /> : pct > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
}

export default function MktInformesView({ branches = [], isReadOnly = false }: { branches?: Branch[]; isReadOnly?: boolean }) {
  void isReadOnly;
  const [month, setMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const [selWeek, setSelWeek] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'semanal' | 'mensual' | 'pedidosya' | 'productos'>('semanal');
  // weekMap[weekKey][branchId] = Agg
  const [weekMap, setWeekMap] = useState<Record<string, Record<string, Agg>>>({});
  // monthMap[monthKey][branchId] = Agg
  const [monthMap, setMonthMap] = useState<Record<string, Record<string, Agg>>>({});
  const [loadingM, setLoadingM] = useState(false);
  type PyData = { venta: number; pedidos: number; ventaMarca: Record<string, { venta: number; pedidos: number }>; prep: number | null; rechazo: number | null; reclamosPct: number | null; listos: number | null; nReclamos: number; costoReclamos: number; reintegros: number };
  const [py, setPy] = useState<PyData | null>(null);
  const [pyPrev, setPyPrev] = useState<{ venta: number; pedidos: number } | null>(null);
  const [loadingPy, setLoadingPy] = useState(false);
  // Productos: prodMap[weekKey][branchId][categoriaNorm] = unidades
  const [prodMap, setProdMap] = useState<Record<string, Record<string, Record<string, number>>>>({});
  // itemMap[weekKey][branchId][categoriaNorm][productoNorm] = { name, qty } (para el detalle por producto)
  const [itemMap, setItemMap] = useState<Record<string, Record<string, Record<string, Record<string, { name: string; qty: number }>>>>>({});
  const [catDisplay, setCatDisplay] = useState<Record<string, string>>({});
  const [loadingP, setLoadingP] = useState(false);
  const [catAgreg, setCatAgreg] = useState<string[]>([]);
  const [catPostre, setCatPostre] = useState<string[]>([]);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [savingCfg, setSavingCfg] = useState(false);

  const operative = useMemo(() => branches.filter(b => b.id !== 'all' && b.id !== 'virtual' && !/almac/i.test(b.name)), [branches]);
  const branchName = (id: string) => branches.find(b => b.id === id)?.name || id;

  // Semanas posibles (prev + actual), en orden cronológico
  const allWeekKeys = useMemo(() => {
    const pm = prevMonthOf(month);
    const ks: string[] = [];
    [pm, month].forEach(m => [1, 2, 3, 4].forEach(w => ks.push(`${m}#${w}`)));
    return ks;
  }, [month]);

  const load = useCallback(async () => {
    if (operative.length === 0) return;
    setLoading(true);
    try {
      const opIds = operative.map(b => b.id);
      const pm = prevMonthOf(month);
      const map: Record<string, Record<string, Agg>> = {};
      for (const m of [pm, month]) {
        const start = `${m}-01`, end = `${m}-31`;
        let from = 0; const size = 1000;
        while (from < 200000) {
          const { data } = await supabase.from('sales_tickets')
            .select('branch_id, net_sales, orders, payment_method, week_number')
            .gte('date', start).lte('date', end).in('branch_id', opIds)
            .range(from, from + size - 1);
          const rows = (data as any[]) || [];
          rows.forEach(t => {
            const w = Number(t.week_number) || 0; if (w < 1 || w > 4) return;
            const key = `${m}#${w}`;
            const bm = (map[key] = map[key] || {});
            const a = (bm[t.branch_id] = bm[t.branch_id] || zero());
            const venta = Number(t.net_sales) || 0;
            a.venta += venta; a.ordenes += Number(t.orders) || 0;
            if (isPY(t.payment_method)) a.py += venta;
          });
          if (rows.length < size) break;
          from += size;
        }
      }
      setWeekMap(map);
      // semana por defecto: la última del mes actual con datos, si no la última con datos
      const conDatos = allWeekKeys.filter(k => map[k] && Object.keys(map[k]).length > 0);
      const delMes = conDatos.filter(k => k.startsWith(month + '#'));
      setSelWeek((delMes.length ? delMes[delMes.length - 1] : conDatos[conDatos.length - 1]) || `${month}#1`);
    } finally {
      setLoading(false);
    }
  }, [operative, month, allWeekKeys]);

  useEffect(() => { load(); }, [load]);

  // ── Carga MENSUAL: mes actual, mes anterior y mismo mes del año anterior ──
  const loadMonthly = useCallback(async () => {
    if (operative.length === 0) return;
    setLoadingM(true);
    try {
      const opIds = operative.map(b => b.id);
      const months = [prevYearMonthOf(month), prevMonthOf(month), month];
      const map: Record<string, Record<string, Agg>> = {};
      for (const m of months) {
        const start = `${m}-01`, end = `${m}-31`;
        let from = 0; const size = 1000;
        while (from < 200000) {
          const { data } = await supabase.from('sales_tickets')
            .select('branch_id, net_sales, orders, payment_method')
            .gte('date', start).lte('date', end).in('branch_id', opIds).range(from, from + size - 1);
          const rows = (data as any[]) || [];
          rows.forEach(t => {
            const bm = (map[m] = map[m] || {});
            const a = (bm[t.branch_id] = bm[t.branch_id] || zero());
            const v = Number(t.net_sales) || 0;
            a.venta += v; a.ordenes += Number(t.orders) || 0;
            if (isPY(t.payment_method)) a.py += v;
          });
          if (rows.length < size) break; from += size;
        }
      }
      setMonthMap(map);
    } finally { setLoadingM(false); }
  }, [operative, month]);

  // ── Carga DESEMPEÑO PEDIDOS YA (del módulo Pedidos Ya) ──
  const loadPY = useCallback(async () => {
    setLoadingPy(true);
    try {
      const [y, mm] = month.split('-').map(Number);
      const [py2, pmn] = prevMonthOf(month).split('-').map(Number);
      const start = `${month}-01`, end = `${month}-31`;
      const [com, ops, rec, comPrev] = await Promise.all([
        supabase.from('py_comercial_periodo').select('marca, pedidos, venta').eq('anio', y).eq('mes', mm),
        supabase.from('py_operativo_periodo').select('prep_seg, rechazo, reclamos, listos').eq('anio', y).eq('mes', mm),
        supabase.from('py_reclamos').select('tipo, monto').gte('fecha', start).lte('fecha', end),
        supabase.from('py_comercial_periodo').select('pedidos, venta').eq('anio', py2).eq('mes', pmn),
      ]);
      const N = (v: any) => Number(v) || 0;
      const comRows = (com.data as any[]) || [];
      let venta = 0, pedidos = 0; const ventaMarca: Record<string, { venta: number; pedidos: number }> = {};
      comRows.forEach(r => { venta += N(r.venta); pedidos += N(r.pedidos); const mk = r.marca || 'Craft'; const e = (ventaMarca[mk] = ventaMarca[mk] || { venta: 0, pedidos: 0 }); e.venta += N(r.venta); e.pedidos += N(r.pedidos); });
      const opsRows = (ops.data as any[]) || [];
      const avg = (f: (r: any) => number) => { const vals = opsRows.map(f).filter(x => !isNaN(x)); return vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null; };
      const recRows = (rec.data as any[]) || [];
      const reclamosArr = recRows.filter(r => r.tipo === 'reclamo');
      const reintArr = recRows.filter(r => r.tipo === 'reintegro');
      setPy({
        venta, pedidos, ventaMarca,
        prep: opsRows.length ? avg(r => N(r.prep_seg) / 60) : null,
        rechazo: opsRows.length ? avg(r => N(r.rechazo)) : null,
        reclamosPct: opsRows.length ? avg(r => N(r.reclamos)) : null,
        listos: opsRows.length ? avg(r => N(r.listos)) : null,
        nReclamos: reclamosArr.length,
        costoReclamos: reclamosArr.reduce((s, r) => s + Math.abs(N(r.monto)), 0),
        reintegros: reintArr.reduce((s, r) => s + Math.abs(N(r.monto)), 0),
      });
      const cp = (comPrev.data as any[]) || [];
      setPyPrev({ venta: cp.reduce((s, r) => s + N(r.venta), 0), pedidos: cp.reduce((s, r) => s + N(r.pedidos), 0) });
    } finally { setLoadingPy(false); }
  }, [month]);

  useEffect(() => { if (tab === 'mensual') loadMonthly(); if (tab === 'pedidosya') loadPY(); }, [tab, loadMonthly, loadPY]);

  // ── Config de categorías (Agregados / Postres) ──
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('mkt_config').select('value').eq('key', 'informes_categorias').maybeSingle();
      const v = (data?.value as any) || {};
      setCatAgreg(Array.isArray(v.agregados) ? v.agregados : []);
      setCatPostre(Array.isArray(v.postres) ? v.postres : []);
    })().catch(() => {});
  }, []);
  const saveConfig = async () => {
    setSavingCfg(true);
    try {
      const { error } = await supabase.from('mkt_config').upsert({ key: 'informes_categorias', value: { agregados: catAgreg, postres: catPostre }, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      setCfgOpen(false);
    } catch (e: any) { alert('No se pudo guardar la configuración: ' + (e.message || e)); }
    finally { setSavingCfg(false); }
  };

  // ── Carga PRODUCTOS (ranking POS) mes actual + anterior, por semana/sucursal/categoría ──
  const loadProductos = useCallback(async () => {
    if (operative.length === 0) return;
    setLoadingP(true);
    try {
      const opIds = operative.map(b => b.id);
      const map: Record<string, Record<string, Record<string, number>>> = {};
      const imap: Record<string, Record<string, Record<string, Record<string, { name: string; qty: number }>>>> = {};
      const disp: Record<string, string> = {};
      for (const m of [prevMonthOf(month), month]) {
        let from = 0; const size = 1000;
        while (from < 200000) {
          const { data } = await supabase.from('product_rankings')
            .select('branch_id, week_number, category, quantity, product_name')
            .eq('month', m).in('branch_id', opIds).range(from, from + size - 1);
          const rows = (data as any[]) || [];
          rows.forEach(r => {
            const w = Number(r.week_number) || 0; if (w < 1 || w > 4) return;
            const nc = normCat(r.category); if (!nc) return;
            disp[nc] = disp[nc] || String(r.category).trim();
            const key = `${m}#${w}`;
            const qty = Number(r.quantity) || 0;
            const bm = (map[key] = map[key] || {});
            const cm = (bm[r.branch_id] = bm[r.branch_id] || {});
            cm[nc] = (cm[nc] || 0) + qty;
            const pn = String(r.product_name || '').trim();
            const pk = normCat(pn);
            if (pk) {
              const im = (imap[key] = imap[key] || {});
              const bim = (im[r.branch_id] = im[r.branch_id] || {});
              const cim = (bim[nc] = bim[nc] || {});
              const e = (cim[pk] = cim[pk] || { name: pn, qty: 0 });
              e.qty += qty;
            }
          });
          if (rows.length < size) break; from += size;
        }
      }
      setProdMap(map); setItemMap(imap); setCatDisplay(disp);
    } finally { setLoadingP(false); }
  }, [operative, month]);
  useEffect(() => { if (tab === 'productos') loadProductos(); }, [tab, loadProductos]);

  const setAgregNorm = useMemo(() => new Set(catAgreg.map(normCat)), [catAgreg]);
  const setPostreNorm = useMemo(() => new Set(catPostre.map(normCat)), [catPostre]);
  const availableCats = useMemo(() => (Object.entries(catDisplay) as [string, string][]).map(([nc, d]) => ({ nc, d })).sort((a, b) => a.d.localeCompare(b.d)), [catDisplay]);

  // Unidades de un grupo de categorías en una semana (por sucursal + total)
  const prodWeek = (weekKey: string, cats: Set<string>) => {
    const byBranch: Record<string, number> = {};
    const bm = prodMap[weekKey] || {};
    Object.entries(bm).forEach(([bid, catMap]) => {
      let q = 0; Object.entries(catMap as Record<string, number>).forEach(([c, v]) => { if (cats.has(c)) q += v; });
      if (q > 0) byBranch[bid] = q;
    });
    const total = Object.values(byBranch).reduce((s, v) => s + v, 0);
    return { byBranch, total };
  };
  // Promedio de las hasta 4 semanas previas (con datos de ranking) para un grupo de categorías
  const prodBaseline = (cats: Set<string>) => {
    const idx = allWeekKeys.indexOf(selWeek);
    const prev4 = idx >= 0 ? allWeekKeys.slice(Math.max(0, idx - 4), idx) : [];
    const conDatos = prev4.filter(k => prodMap[k] && Object.keys(prodMap[k]).length > 0);
    const perBranch: Record<string, { q: number; n: number }> = {}; let tq = 0, n = 0;
    conDatos.forEach(k => {
      const { byBranch, total } = prodWeek(k, cats); tq += total; n++;
      Object.entries(byBranch).forEach(([bid, q]) => { const p = (perBranch[bid] = perBranch[bid] || { q: 0, n: 0 }); p.q += q; p.n++; });
    });
    return { n, prom: n ? tq / n : null, perBranch };
  };
  // Productos de un grupo de categorías en una semana → { prodKey: {name, qty} }.
  // branchId opcional: si se pasa, sólo esa sucursal; si no, consolidado.
  const prodItems = (weekKey: string, cats: Set<string>, branchId?: string): Record<string, { name: string; qty: number }> => {
    const acc: Record<string, { name: string; qty: number }> = {};
    const im = itemMap[weekKey] || {};
    const bids = branchId ? [branchId] : Object.keys(im);
    bids.forEach(bid => {
      const bim = im[bid] || {};
      Object.entries(bim).forEach(([nc, prods]) => {
        if (!cats.has(nc)) return;
        Object.entries(prods as Record<string, { name: string; qty: number }>).forEach(([pk, v]) => {
          const e = (acc[pk] = acc[pk] || { name: v.name, qty: 0 }); e.qty += v.qty;
        });
      });
    });
    return acc;
  };
  // Promedio por producto en las hasta 4 semanas previas (divide por la cant. de semanas con ranking)
  const prodItemsBaseline = (cats: Set<string>, branchId?: string) => {
    const idx = allWeekKeys.indexOf(selWeek);
    const prev4 = idx >= 0 ? allWeekKeys.slice(Math.max(0, idx - 4), idx) : [];
    const conDatos = prev4.filter(k => itemMap[k] && Object.keys(itemMap[k]).length > 0);
    const per: Record<string, number> = {};
    conDatos.forEach(k => { const items = prodItems(k, cats, branchId); Object.entries(items).forEach(([pk, v]) => { per[pk] = (per[pk] || 0) + v.qty; }); });
    const n = conDatos.length;
    return { n, promOf: (pk: string) => n ? (per[pk] || 0) / n : null };
  };

  const monthAgg = (m: string): { byBranch: Record<string, Agg>; total: Agg } => {
    const byBranch: Record<string, Agg> = monthMap[m] || {};
    const total = Object.values(byBranch).reduce<Agg>((a, v) => ({ venta: a.venta + v.venta, ordenes: a.ordenes + v.ordenes, py: a.py + v.py }), zero());
    return { byBranch, total };
  };

  // Agrega una semana (consolidado y por sucursal)
  const aggWeek = (key: string): { byBranch: Record<string, Agg>; total: Agg } => {
    const byBranch: Record<string, Agg> = weekMap[key] || {};
    const total = Object.values(byBranch).reduce<Agg>((a, v) => ({ venta: a.venta + v.venta, ordenes: a.ordenes + v.ordenes, py: a.py + v.py }), zero());
    return { byBranch, total };
  };

  // Baseline = promedio de las 4 semanas ANTERIORES a la seleccionada (las que tengan datos)
  const baseline = useMemo(() => {
    const idx = allWeekKeys.indexOf(selWeek);
    const prev4 = idx >= 0 ? allWeekKeys.slice(Math.max(0, idx - 4), idx) : [];
    const conDatos = prev4.filter(k => weekMap[k] && Object.keys(weekMap[k]).length > 0);
    const perBranch: Record<string, { venta: number; ordenes: number; n: number }> = {};
    let tVenta = 0, tOrd = 0, n = 0;
    conDatos.forEach(k => {
      const { byBranch, total } = aggWeek(k);
      tVenta += total.venta; tOrd += total.ordenes; n++;
      Object.entries(byBranch).forEach(([bid, v]) => {
        const p = (perBranch[bid] = perBranch[bid] || { venta: 0, ordenes: 0, n: 0 });
        p.venta += v.venta; p.ordenes += v.ordenes; p.n++;
      });
    });
    return { n, semanas: conDatos, ventaProm: n ? tVenta / n : null, ordProm: n ? tOrd / n : null, tVenta, tOrd, perBranch };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selWeek, weekMap, allWeekKeys]);

  const idxSel = allWeekKeys.indexOf(selWeek);
  const prevWeekKey = idxSel > 0 ? allWeekKeys[idxSel - 1] : null;
  const cur = aggWeek(selWeek);
  const prevW = prevWeekKey ? aggWeek(prevWeekKey) : null;

  const ticket = (a: Agg) => a.ordenes > 0 ? a.venta / a.ordenes : 0;
  const baseTicket = baseline.tOrd > 0 ? baseline.tVenta / baseline.tOrd : null;
  const pyPct = cur.total.venta > 0 ? (cur.total.py / cur.total.venta) * 100 : null;

  const branchesConDatos = useMemo(() => {
    const ids = new Set<string>();
    [selWeek, prevWeekKey || '', ...baseline.semanas].forEach(k => { if (weekMap[k]) Object.keys(weekMap[k]).forEach(id => ids.add(id)); });
    return operative.filter(b => ids.has(b.id));
  }, [operative, selWeek, prevWeekKey, baseline.semanas, weekMap]);

  const semanasDelMes = allWeekKeys.filter(k => k.startsWith(month + '#'));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <ShoppingBag size={18} className="text-brand-500" />
          <h2 className="text-lg font-black uppercase text-text-main tracking-tight">Informes Comerciales</h2>
        </div>
        <p className="text-[11px] text-text-dim font-bold uppercase tracking-widest mb-4">Ventas para decisiones de marketing · semana del negocio</p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-bg-accent/40 p-1 rounded-lg border border-border-dim/80">
            <button onClick={() => setMonth(prevMonthOf(month))} className="p-1.5 hover:bg-bg-sidebar rounded text-text-dim"><ChevronLeft size={15} /></button>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="bg-transparent text-text-main text-[11px] font-black uppercase outline-none w-[120px] text-center cursor-pointer" />
            <button onClick={() => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }} className="p-1.5 hover:bg-bg-sidebar rounded text-text-dim"><ChevronRight size={15} /></button>
          </div>
          {(tab === 'semanal' || tab === 'productos') && (
            <div className="flex items-center gap-1 flex-wrap bg-bg-accent/30 p-1 rounded-lg border border-border-dim/60">
              {semanasDelMes.map(k => {
                const w = k.split('#')[1];
                const hay = weekMap[k] && Object.keys(weekMap[k]).length > 0;
                return (
                  <button key={k} onClick={() => setSelWeek(k)} disabled={!hay}
                    className={cn('px-2.5 py-1.5 text-[10px] font-black uppercase rounded', selWeek === k ? 'bg-brand-500 text-white' : hay ? 'text-text-dim hover:text-text-main' : 'text-text-dim/40 cursor-not-allowed')}>
                    Sem {w}
                  </button>
                );
              })}
            </div>
          )}
          {(loading || loadingM || loadingPy) && <RefreshCw size={14} className="animate-spin text-brand-500" />}
          {tab === 'semanal' && (
            <span className="text-[10px] text-text-dim font-bold uppercase ml-auto">
              {baseline.n > 0 ? `Promedio sobre ${baseline.n} semana(s) previa(s)` : 'Sin semanas previas para promediar'}
            </span>
          )}
        </div>
      </div>

      {/* Pestañas */}
      <div className="flex flex-wrap gap-1 border-b border-border-dim/60">
        {([['semanal', 'Semanal', CalendarDays], ['mensual', 'Mensual', TrendingUp], ['pedidosya', 'Desempeño Pedidos Ya', Store], ['productos', 'Agregados y Postres', Tag]] as const).map(([k, l, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn('flex items-center gap-1.5 px-3.5 py-2.5 text-[11px] font-black uppercase tracking-wider rounded-t-lg transition-colors',
              tab === k ? 'text-brand-500 border-b-2 border-brand-500 bg-brand-500/5' : 'text-text-dim hover:text-text-main')}>
            <Icon size={13} /> {l}
          </button>
        ))}
      </div>

      {tab === 'semanal' && (branchesConDatos.length === 0 ? (
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-10 text-center">
          <p className="text-[12px] font-black uppercase text-text-dim">No hay ventas cargadas para {wkLabel(selWeek)}.</p>
          <p className="text-[10px] text-text-dim mt-1">Cargá los tickets en el módulo Ventas para ver el análisis.</p>
        </div>
      ) : (
        <>
          {/* KPIs consolidados */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-text-dim"><DollarSign size={12} className="text-brand-500" /> Venta neta</div>
              <div className="text-2xl font-black font-mono text-text-main mt-1">{fmt(cur.total.venta)}</div>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-[9px] text-text-dim uppercase">vs sem ant</span> <Delta cur={cur.total.venta} base={prevW ? prevW.total.venta : null} />
                <span className="text-[9px] text-text-dim uppercase">vs prom4</span> <Delta cur={cur.total.venta} base={baseline.ventaProm} />
              </div>
            </div>
            <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-text-dim"><Receipt size={12} className="text-brand-500" /> Órdenes</div>
              <div className="text-2xl font-black font-mono text-text-main mt-1">{fmtNum(cur.total.ordenes)}</div>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-[9px] text-text-dim uppercase">vs sem ant</span> <Delta cur={cur.total.ordenes} base={prevW ? prevW.total.ordenes : null} />
                <span className="text-[9px] text-text-dim uppercase">vs prom4</span> <Delta cur={cur.total.ordenes} base={baseline.ordProm} />
              </div>
            </div>
            <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-text-dim"><TrendingUp size={12} className="text-brand-500" /> Ticket promedio</div>
              <div className="text-2xl font-black font-mono text-text-main mt-1">{fmt(ticket(cur.total))}</div>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-[9px] text-text-dim uppercase">vs prom4</span> <Delta cur={ticket(cur.total)} base={baseTicket} />
              </div>
            </div>
            <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-text-dim"><Store size={12} className="text-amber-500" /> Canal Pedidos Ya</div>
              <div className="text-2xl font-black font-mono text-text-main mt-1">{pyPct != null ? pyPct.toFixed(1) + '%' : '—'}</div>
              <div className="text-[9px] text-text-dim uppercase mt-1.5">{fmt(cur.total.py)} de {fmt(cur.total.venta)} · resto presencial</div>
            </div>
          </div>

          {/* Tabla por sucursal */}
          <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-lg overflow-x-auto">
            <table className="w-full text-[12px] border-collapse min-w-[820px]">
              <thead>
                <tr className="bg-bg-accent/20 text-text-dim">
                  <th className="p-3 text-left text-[9px] font-black uppercase tracking-widest">Sucursal</th>
                  <th className="p-3 text-right text-[9px] font-black uppercase tracking-widest">Venta neta</th>
                  <th className="p-3 text-center text-[9px] font-black uppercase tracking-widest">vs sem ant</th>
                  <th className="p-3 text-center text-[9px] font-black uppercase tracking-widest">vs prom4</th>
                  <th className="p-3 text-right text-[9px] font-black uppercase tracking-widest">Órdenes</th>
                  <th className="p-3 text-center text-[9px] font-black uppercase tracking-widest">vs prom4</th>
                  <th className="p-3 text-right text-[9px] font-black uppercase tracking-widest">Ticket</th>
                  <th className="p-3 text-center text-[9px] font-black uppercase tracking-widest">vs prom4</th>
                  <th className="p-3 text-right text-[9px] font-black uppercase tracking-widest">% Ped.Ya</th>
                </tr>
              </thead>
              <tbody>
                {branchesConDatos.map(b => {
                  const a = cur.byBranch[b.id] || zero();
                  const pa = prevW?.byBranch[b.id] || null;
                  const bl = baseline.perBranch[b.id];
                  const blVenta = bl && bl.n ? bl.venta / bl.n : null;
                  const blOrd = bl && bl.n ? bl.ordenes / bl.n : null;
                  const blTicket = bl && bl.ordenes > 0 ? bl.venta / bl.ordenes : null;
                  const pyB = a.venta > 0 ? (a.py / a.venta) * 100 : null;
                  return (
                    <tr key={b.id} className="border-t border-border-dim/30 hover:bg-bg-accent/10">
                      <td className="p-3 text-left font-bold text-text-main whitespace-nowrap">{b.name}</td>
                      <td className="p-3 text-right font-mono text-text-main">{fmt(a.venta)}</td>
                      <td className="p-3 text-center"><Delta cur={a.venta} base={pa ? pa.venta : null} /></td>
                      <td className="p-3 text-center"><Delta cur={a.venta} base={blVenta} /></td>
                      <td className="p-3 text-right font-mono text-text-main">{fmtNum(a.ordenes)}</td>
                      <td className="p-3 text-center"><Delta cur={a.ordenes} base={blOrd} /></td>
                      <td className="p-3 text-right font-mono text-text-main">{fmt(ticket(a))}</td>
                      <td className="p-3 text-center"><Delta cur={ticket(a)} base={blTicket} /></td>
                      <td className="p-3 text-right font-mono text-text-dim">{pyB != null ? pyB.toFixed(1) + '%' : '—'}</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-border-dim bg-bg-accent/25 font-black">
                  <td className="p-3 text-left text-text-main uppercase">Total</td>
                  <td className="p-3 text-right font-mono text-text-main">{fmt(cur.total.venta)}</td>
                  <td className="p-3 text-center"><Delta cur={cur.total.venta} base={prevW ? prevW.total.venta : null} /></td>
                  <td className="p-3 text-center"><Delta cur={cur.total.venta} base={baseline.ventaProm} /></td>
                  <td className="p-3 text-right font-mono text-text-main">{fmtNum(cur.total.ordenes)}</td>
                  <td className="p-3 text-center"><Delta cur={cur.total.ordenes} base={baseline.ordProm} /></td>
                  <td className="p-3 text-right font-mono text-text-main">{fmt(ticket(cur.total))}</td>
                  <td className="p-3 text-center"><Delta cur={ticket(cur.total)} base={baseTicket} /></td>
                  <td className="p-3 text-right font-mono text-text-dim">{pyPct != null ? pyPct.toFixed(1) + '%' : '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-text-dim">
            Semana analizada: <b className="text-text-main">{wkLabel(selWeek)}</b>. "vs sem ant" compara con la semana inmediata anterior; "vs prom4" con el promedio de las hasta 4 semanas previas con datos. El % Pedidos Ya sale del medio de pago en Ventas.
          </p>
        </>
      ))}

      {/* ─────────── MENSUAL ─────────── */}
      {tab === 'mensual' && (() => {
        const curM = monthAgg(month);
        const prevM = monthAgg(prevMonthOf(month));
        const yoyM = monthAgg(prevYearMonthOf(month));
        const idsM = new Set<string>();
        [month, prevMonthOf(month), prevYearMonthOf(month)].forEach(m => { if (monthMap[m]) Object.keys(monthMap[m]).forEach(id => idsM.add(id)); });
        const brs = operative.filter(b => idsM.has(b.id));
        const pyPctM = curM.total.venta > 0 ? (curM.total.py / curM.total.venta) * 100 : null;
        if (brs.length === 0) return (
          <div className="bg-bg-sidebar border border-border-dim rounded-xl p-10 text-center">
            <p className="text-[12px] font-black uppercase text-text-dim">No hay ventas cargadas para {monthLabel(month)}.</p>
            <p className="text-[10px] text-text-dim mt-1">Cargá los tickets en el módulo Ventas para ver el análisis mensual.</p>
          </div>
        );
        return (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-text-dim"><DollarSign size={12} className="text-brand-500" /> Venta neta</div>
                <div className="text-2xl font-black font-mono text-text-main mt-1">{fmt(curM.total.venta)}</div>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-[9px] text-text-dim uppercase">vs mes ant</span> <Delta cur={curM.total.venta} base={prevM.total.venta || null} />
                  <span className="text-[9px] text-text-dim uppercase">vs año ant</span> <Delta cur={curM.total.venta} base={yoyM.total.venta || null} />
                </div>
              </div>
              <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-text-dim"><Receipt size={12} className="text-brand-500" /> Órdenes</div>
                <div className="text-2xl font-black font-mono text-text-main mt-1">{fmtNum(curM.total.ordenes)}</div>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-[9px] text-text-dim uppercase">vs mes ant</span> <Delta cur={curM.total.ordenes} base={prevM.total.ordenes || null} />
                  <span className="text-[9px] text-text-dim uppercase">vs año ant</span> <Delta cur={curM.total.ordenes} base={yoyM.total.ordenes || null} />
                </div>
              </div>
              <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-text-dim"><TrendingUp size={12} className="text-brand-500" /> Ticket promedio</div>
                <div className="text-2xl font-black font-mono text-text-main mt-1">{fmt(ticket(curM.total))}</div>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-[9px] text-text-dim uppercase">vs mes ant</span> <Delta cur={ticket(curM.total)} base={prevM.total.ordenes > 0 ? ticket(prevM.total) : null} />
                  <span className="text-[9px] text-text-dim uppercase">vs año ant</span> <Delta cur={ticket(curM.total)} base={yoyM.total.ordenes > 0 ? ticket(yoyM.total) : null} />
                </div>
              </div>
              <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-text-dim"><Store size={12} className="text-amber-500" /> Canal Pedidos Ya</div>
                <div className="text-2xl font-black font-mono text-text-main mt-1">{pyPctM != null ? pyPctM.toFixed(1) + '%' : '—'}</div>
                <div className="text-[9px] text-text-dim uppercase mt-1.5">{fmt(curM.total.py)} de {fmt(curM.total.venta)}</div>
              </div>
            </div>
            <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-lg overflow-x-auto">
              <table className="w-full text-[12px] border-collapse min-w-[760px]">
                <thead>
                  <tr className="bg-bg-accent/20 text-text-dim">
                    <th className="p-3 text-left text-[9px] font-black uppercase tracking-widest">Sucursal</th>
                    <th className="p-3 text-right text-[9px] font-black uppercase tracking-widest">Venta neta</th>
                    <th className="p-3 text-center text-[9px] font-black uppercase tracking-widest">vs mes ant</th>
                    <th className="p-3 text-center text-[9px] font-black uppercase tracking-widest">vs año ant</th>
                    <th className="p-3 text-right text-[9px] font-black uppercase tracking-widest">Órdenes</th>
                    <th className="p-3 text-center text-[9px] font-black uppercase tracking-widest">vs mes ant</th>
                    <th className="p-3 text-right text-[9px] font-black uppercase tracking-widest">Ticket</th>
                    <th className="p-3 text-right text-[9px] font-black uppercase tracking-widest">% Ped.Ya</th>
                  </tr>
                </thead>
                <tbody>
                  {brs.map(b => {
                    const a = curM.byBranch[b.id] || zero();
                    const pa = prevM.byBranch[b.id] || null;
                    const ya = yoyM.byBranch[b.id] || null;
                    const pyB = a.venta > 0 ? (a.py / a.venta) * 100 : null;
                    return (
                      <tr key={b.id} className="border-t border-border-dim/30 hover:bg-bg-accent/10">
                        <td className="p-3 text-left font-bold text-text-main whitespace-nowrap">{b.name}</td>
                        <td className="p-3 text-right font-mono text-text-main">{fmt(a.venta)}</td>
                        <td className="p-3 text-center"><Delta cur={a.venta} base={pa ? pa.venta : null} /></td>
                        <td className="p-3 text-center"><Delta cur={a.venta} base={ya ? ya.venta : null} /></td>
                        <td className="p-3 text-right font-mono text-text-main">{fmtNum(a.ordenes)}</td>
                        <td className="p-3 text-center"><Delta cur={a.ordenes} base={pa ? pa.ordenes : null} /></td>
                        <td className="p-3 text-right font-mono text-text-main">{fmt(ticket(a))}</td>
                        <td className="p-3 text-right font-mono text-text-dim">{pyB != null ? pyB.toFixed(1) + '%' : '—'}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-border-dim bg-bg-accent/25 font-black">
                    <td className="p-3 text-left text-text-main uppercase">Total</td>
                    <td className="p-3 text-right font-mono text-text-main">{fmt(curM.total.venta)}</td>
                    <td className="p-3 text-center"><Delta cur={curM.total.venta} base={prevM.total.venta || null} /></td>
                    <td className="p-3 text-center"><Delta cur={curM.total.venta} base={yoyM.total.venta || null} /></td>
                    <td className="p-3 text-right font-mono text-text-main">{fmtNum(curM.total.ordenes)}</td>
                    <td className="p-3 text-center"><Delta cur={curM.total.ordenes} base={prevM.total.ordenes || null} /></td>
                    <td className="p-3 text-right font-mono text-text-main">{fmt(ticket(curM.total))}</td>
                    <td className="p-3 text-right font-mono text-text-dim">{pyPctM != null ? pyPctM.toFixed(1) + '%' : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-text-dim">Mes analizado: <b className="text-text-main">{monthLabel(month)}</b>. "vs mes ant" compara con {monthLabel(prevMonthOf(month))}; "vs año ant" con {monthLabel(prevYearMonthOf(month))}. Si un mes no tiene tickets cargados, la variación aparece como "—".</p>
          </>
        );
      })()}

      {/* ─────────── DESEMPEÑO PEDIDOS YA ─────────── */}
      {tab === 'pedidosya' && (
        !py || (py.venta === 0 && py.pedidos === 0 && py.nReclamos === 0) ? (
          <div className="bg-bg-sidebar border border-border-dim rounded-xl p-10 text-center">
            <p className="text-[12px] font-black uppercase text-text-dim">No hay datos de Pedidos Ya para {monthLabel(month)}.</p>
            <p className="text-[10px] text-text-dim mt-1">Importá los reportes en Administración → Pedidos Ya (Comercial, Operativo y Estado de cuenta).</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-text-dim"><DollarSign size={12} className="text-amber-500" /> Venta Pedidos Ya</div>
                <div className="text-2xl font-black font-mono text-text-main mt-1">{fmt(py.venta)}</div>
                <div className="mt-1.5"><span className="text-[9px] text-text-dim uppercase mr-1">vs mes ant</span><Delta cur={py.venta} base={pyPrev && pyPrev.venta ? pyPrev.venta : null} /></div>
              </div>
              <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-text-dim"><Receipt size={12} className="text-amber-500" /> Pedidos</div>
                <div className="text-2xl font-black font-mono text-text-main mt-1">{fmtNum(py.pedidos)}</div>
                <div className="mt-1.5"><span className="text-[9px] text-text-dim uppercase mr-1">vs mes ant</span><Delta cur={py.pedidos} base={pyPrev && pyPrev.pedidos ? pyPrev.pedidos : null} /></div>
              </div>
              <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-text-dim"><TrendingUp size={12} className="text-amber-500" /> Ticket promedio</div>
                <div className="text-2xl font-black font-mono text-text-main mt-1">{py.pedidos > 0 ? fmt(py.venta / py.pedidos) : '—'}</div>
                <div className="text-[9px] text-text-dim uppercase mt-1.5">venta ÷ pedidos</div>
              </div>
              <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-text-dim"><MessageSquareWarning size={12} className="text-red-500" /> Reclamos</div>
                <div className="text-2xl font-black font-mono text-text-main mt-1">{py.pedidos > 0 ? ((py.nReclamos / py.pedidos) * 100).toFixed(1) + '%' : (py.nReclamos || '—')}</div>
                <div className="text-[9px] text-text-dim uppercase mt-1.5">{py.nReclamos} reclamos · {fmt(py.costoReclamos)} · reint. {fmt(py.reintegros)}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-text-main mb-3"><Activity size={13} className="text-brand-500" /> Operativo (promedio del mes)</div>
                <div className="grid grid-cols-2 gap-3">
                  <div><div className="text-[9px] font-black uppercase text-text-dim">Tiempo prep.</div><div className="text-lg font-mono font-black text-text-main">{py.prep != null ? py.prep.toFixed(1) + ' min' : '—'}</div></div>
                  <div><div className="text-[9px] font-black uppercase text-text-dim">Cancelaciones</div><div className="text-lg font-mono font-black text-text-main">{py.rechazo != null ? py.rechazo.toFixed(1) + '%' : '—'}</div></div>
                  <div><div className="text-[9px] font-black uppercase text-text-dim">% con reclamos</div><div className="text-lg font-mono font-black text-text-main">{py.reclamosPct != null ? py.reclamosPct.toFixed(1) + '%' : '—'}</div></div>
                  <div><div className="text-[9px] font-black uppercase text-text-dim">Marcados listos</div><div className="text-lg font-mono font-black text-text-main">{py.listos != null ? py.listos.toFixed(1) + '%' : '—'}</div></div>
                </div>
              </div>
              <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-text-main mb-3"><Tag size={13} className="text-brand-500" /> Venta por marca</div>
                <table className="w-full text-[12px]">
                  <thead><tr className="text-text-dim"><th className="p-1.5 text-left text-[9px] uppercase font-black">Marca</th><th className="p-1.5 text-right text-[9px] uppercase font-black">Venta</th><th className="p-1.5 text-right text-[9px] uppercase font-black">Pedidos</th><th className="p-1.5 text-right text-[9px] uppercase font-black">Ticket</th></tr></thead>
                  <tbody>
                    {(Object.entries(py.ventaMarca) as [string, { venta: number; pedidos: number }][]).sort((a, b) => b[1].venta - a[1].venta).map(([mk, v]) => (
                      <tr key={mk} className="border-t border-border-dim/25">
                        <td className="p-1.5 text-left text-text-main font-bold flex items-center gap-1.5"><span className={cn('inline-block w-1.5 h-1.5 rounded-full', /caf/i.test(mk) ? 'bg-amber-500' : 'bg-rose-500')} />{mk}</td>
                        <td className="p-1.5 text-right font-mono text-text-main">{fmt(v.venta)}</td>
                        <td className="p-1.5 text-right font-mono text-text-dim">{fmtNum(v.pedidos)}</td>
                        <td className="p-1.5 text-right font-mono text-text-dim">{v.pedidos > 0 ? fmt(v.venta / v.pedidos) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-[10px] text-text-dim">Datos del módulo <b className="text-text-main">Pedidos Ya</b> (Administración) para {monthLabel(month)}. La venta/pedidos salen del resumen comercial; el operativo (prep, cancelaciones, reclamos, listos) del resumen de operaciones; los reclamos del estado de cuenta.</p>
          </>
        )
      )}

      {/* ─────────── AGREGADOS Y POSTRES ─────────── */}
      {tab === 'productos' && (
        <>
          {/* Configuración de categorías */}
          <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-sm">
            <button onClick={() => setCfgOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-3">
              <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-text-main"><Tag size={14} className="text-brand-500" /> Categorías: Agregados y Postres</span>
              <span className="text-[10px] text-text-dim font-bold uppercase">{catAgreg.length} agregado(s) · {catPostre.length} postre(s) · {cfgOpen ? 'cerrar' : 'configurar'}</span>
            </button>
            {cfgOpen && (
              <div className="px-5 pb-5 border-t border-border-dim pt-4 space-y-2">
                {availableCats.length === 0 ? (
                  <p className="text-[11px] text-text-dim">No hay categorías cargadas todavía. Importá el ranking de "Ventas por producto" (con el Rubro de la Carta) en el módulo Ventas.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center text-[9px] font-black uppercase text-text-dim tracking-widest px-1">
                      <span>Categoría (Rubro de la Carta)</span><span>Agregado</span><span>Postre</span>
                    </div>
                    <div className="max-h-[280px] overflow-y-auto space-y-1 pr-1">
                      {availableCats.map(({ nc, d }) => {
                        const inA = setAgregNorm.has(nc); const inP = setPostreNorm.has(nc);
                        return (
                          <div key={nc} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center bg-bg-accent/30 rounded px-2 py-1.5">
                            <span className="text-[11px] font-bold text-text-main uppercase truncate">{d}</span>
                            <button onClick={() => setCatAgreg(prev => inA ? prev.filter(x => normCat(x) !== nc) : [...prev, d])}
                              className={cn('px-2.5 py-1 rounded text-[9px] font-black uppercase', inA ? 'bg-brand-500 text-white' : 'bg-bg-card border border-border-dim text-text-dim hover:text-text-main')}>{inA ? '✓' : '+'}</button>
                            <button onClick={() => setCatPostre(prev => inP ? prev.filter(x => normCat(x) !== nc) : [...prev, d])}
                              className={cn('px-2.5 py-1 rounded text-[9px] font-black uppercase', inP ? 'bg-amber-500 text-white' : 'bg-bg-card border border-border-dim text-text-dim hover:text-text-main')}>{inP ? '✓' : '+'}</button>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-end pt-1">
                      <button onClick={saveConfig} disabled={savingCfg} className="bg-brand-500 hover:bg-brand-600 text-white rounded px-4 py-1.5 text-[10px] font-black uppercase tracking-wider disabled:opacity-50">{savingCfg ? 'Guardando…' : 'Guardar categorías'}</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {loadingP ? (
            <div className="py-10 text-center"><RefreshCw size={22} className="animate-spin text-brand-500 mx-auto" /></div>
          ) : ([{ title: 'Agregados', cats: setAgregNorm, chosen: catAgreg, accent: 'text-brand-500' }, { title: 'Postres', cats: setPostreNorm, chosen: catPostre, accent: 'text-amber-500' }] as const).map(g => {
            if (g.chosen.length === 0) return (
              <div key={g.title} className="bg-bg-sidebar border border-border-dim rounded-xl p-6 text-center">
                <p className="text-[11px] font-black uppercase text-text-dim">{g.title}: elegí las categorías arriba para ver el análisis.</p>
              </div>
            );
            const curG = prodWeek(selWeek, g.cats);
            const prevG = prevWeekKey ? prodWeek(prevWeekKey, g.cats) : null;
            const blG = prodBaseline(g.cats);
            const brsG = operative.filter(b => curG.byBranch[b.id] || (prevG && prevG.byBranch[b.id]) || blG.perBranch[b.id]);
            return (
              <div key={g.title} className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className={cn('text-sm font-black uppercase tracking-wider', g.accent)}>{g.title}</h3>
                  <span className="text-[9px] text-text-dim font-bold uppercase">{g.chosen.join(' · ')}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 shadow-sm">
                    <div className="text-[9px] font-black uppercase tracking-widest text-text-dim">Unidades en la semana</div>
                    <div className="text-2xl font-black font-mono text-text-main mt-1">{fmtNum(curG.total)}</div>
                  </div>
                  <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 shadow-sm">
                    <div className="text-[9px] font-black uppercase tracking-widest text-text-dim">vs semana anterior</div>
                    <div className="text-xl font-black mt-2"><Delta cur={curG.total} base={prevG ? prevG.total : null} /></div>
                  </div>
                  <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 shadow-sm">
                    <div className="text-[9px] font-black uppercase tracking-widest text-text-dim">vs promedio 4 semanas</div>
                    <div className="text-xl font-black mt-2"><Delta cur={curG.total} base={blG.prom} /></div>
                  </div>
                </div>
                <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-lg overflow-x-auto">
                  <table className="w-full text-[12px] border-collapse min-w-[520px]">
                    <thead><tr className="bg-bg-accent/20 text-text-dim">
                      <th className="p-3 text-left text-[9px] font-black uppercase tracking-widest">Sucursal</th>
                      <th className="p-3 text-right text-[9px] font-black uppercase tracking-widest">Unidades</th>
                      <th className="p-3 text-center text-[9px] font-black uppercase tracking-widest">vs sem ant</th>
                      <th className="p-3 text-center text-[9px] font-black uppercase tracking-widest">vs prom4</th>
                    </tr></thead>
                    <tbody>
                      {brsG.length === 0 ? (
                        <tr><td colSpan={4} className="p-4 text-center text-text-dim text-[11px]">Sin unidades para {wkLabel(selWeek)}.</td></tr>
                      ) : brsG.map(b => {
                        const q = curG.byBranch[b.id] || 0;
                        const pq = prevG?.byBranch[b.id] ?? null;
                        const bl = blG.perBranch[b.id];
                        const blProm = bl && bl.n ? bl.q / bl.n : null;
                        return (
                          <tr key={b.id} className="border-t border-border-dim/30 hover:bg-bg-accent/10">
                            <td className="p-3 text-left font-bold text-text-main whitespace-nowrap">{b.name}</td>
                            <td className="p-3 text-right font-mono text-text-main">{fmtNum(q)}</td>
                            <td className="p-3 text-center"><Delta cur={q} base={pq} /></td>
                            <td className="p-3 text-center"><Delta cur={q} base={blProm} /></td>
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 border-border-dim bg-bg-accent/25 font-black">
                        <td className="p-3 text-left text-text-main uppercase">Total</td>
                        <td className="p-3 text-right font-mono text-text-main">{fmtNum(curG.total)}</td>
                        <td className="p-3 text-center"><Delta cur={curG.total} base={prevG ? prevG.total : null} /></td>
                        <td className="p-3 text-center"><Delta cur={curG.total} base={blG.prom} /></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {(() => {
                  // Matriz: filas = productos, columnas = sucursales. Última col = Total (+ vs prom4).
                  const bl = prodItemsBaseline(g.cats);
                  const perBranch: Record<string, Record<string, { name: string; qty: number }>> = {};
                  brsG.forEach(b => { perBranch[b.id] = prodItems(selWeek, g.cats, b.id); });
                  const nombres: Record<string, string> = {};
                  brsG.forEach(b => Object.entries(perBranch[b.id]).forEach(([pk, v]) => { nombres[pk] = v.name; }));
                  const rows = Object.keys(nombres).map(pk => {
                    const cells = brsG.map(b => perBranch[b.id][pk]?.qty || 0);
                    const total = cells.reduce((s, x) => s + x, 0);
                    return { pk, name: nombres[pk], cells, total, prom: bl.promOf(pk) };
                  }).sort((a, b) => b.total - a.total);
                  if (rows.length === 0) return (
                    <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 text-center text-[10px] text-text-dim">Sin productos de {g.title.toLowerCase()} en esta semana.</div>
                  );
                  const colTotals = brsG.map((_, i) => rows.reduce((s, r) => s + r.cells[i], 0));
                  const totGeneral = colTotals.reduce((s, x) => s + x, 0);
                  return (
                    <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-sm overflow-x-auto">
                      <div className="px-4 pt-3 text-[9px] font-black uppercase tracking-widest text-text-dim">Detalle por producto y sucursal · {wkLabel(selWeek)}</div>
                      <table className="w-full text-[12px] border-collapse" style={{ minWidth: `${360 + brsG.length * 90}px` }}>
                        <thead>
                          <tr className="text-text-dim">
                            <th className="p-2.5 text-left text-[9px] uppercase font-black sticky left-0 bg-bg-sidebar">Producto</th>
                            {brsG.map(b => <th key={b.id} className="p-2.5 text-right text-[9px] uppercase font-black whitespace-nowrap">{b.name.replace(/^craft\s*/i, '')}</th>)}
                            <th className="p-2.5 text-right text-[9px] uppercase font-black bg-bg-accent/30">Total</th>
                            <th className="p-2.5 text-center text-[9px] uppercase font-black">vs prom4</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(r => (
                            <tr key={r.pk} className="border-t border-border-dim/25 hover:bg-bg-accent/10">
                              <td className="p-2.5 text-left text-text-main font-bold uppercase whitespace-nowrap sticky left-0 bg-bg-sidebar">{r.name}</td>
                              {r.cells.map((c, i) => <td key={i} className={cn('p-2.5 text-right font-mono', c > 0 ? 'text-text-main' : 'text-text-dim/40')}>{c > 0 ? fmtNum(c) : '·'}</td>)}
                              <td className="p-2.5 text-right font-mono font-black text-text-main bg-bg-accent/20">{fmtNum(r.total)}</td>
                              <td className="p-2.5 text-center"><Delta cur={r.total} base={r.prom} /></td>
                            </tr>
                          ))}
                          <tr className="border-t-2 border-border-dim bg-bg-accent/25 font-black">
                            <td className="p-2.5 text-left text-text-main uppercase sticky left-0 bg-bg-accent/25">Total</td>
                            {colTotals.map((c, i) => <td key={i} className="p-2.5 text-right font-mono text-text-main">{fmtNum(c)}</td>)}
                            <td className="p-2.5 text-right font-mono text-text-main bg-bg-accent/30">{fmtNum(totGeneral)}</td>
                            <td className="p-2.5" />
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            );
          })}
          <p className="text-[10px] text-text-dim">Unidades del ranking de <b className="text-text-main">Ventas por producto</b> (módulo Ventas), semana <b className="text-text-main">{wkLabel(selWeek)}</b>. "vs prom4" usa el promedio de las hasta 4 semanas previas con ranking cargado.</p>
        </>
      )}
    </div>
  );
}
