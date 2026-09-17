/**
 * Marketing & Comercial · Informes.
 * Reúne información comercial (de Ventas y Pedidos Ya) para pensar acciones de marketing.
 * FASE 1 — Ventas semanal: ventas $ y órdenes, ticket promedio y % canal Pedidos Ya,
 * consolidado y por sucursal, comparado contra la semana anterior y el promedio de las
 * últimas 4 semanas. Semanas del negocio (1-7 / 8-14 / 15-21 / 22-fin).
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { TrendingUp, TrendingDown, Minus, RefreshCw, Store, DollarSign, Receipt, ShoppingBag, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { Branch } from '../types';

const fmt = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-AR');
const fmtNum = (n: number) => Math.round(n || 0).toLocaleString('es-AR');
const SEM_RANGO = ['1-7', '8-14', '15-21', '22-fin'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const monthLabel = (m: string) => { const [y, mm] = m.split('-'); return `${MESES[(parseInt(mm, 10) || 1) - 1]} ${y}`; };
const prevMonthOf = (m: string) => { const [y, mm] = m.split('-').map(Number); const d = new Date(y, mm - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const wkLabel = (key: string) => { const [m, w] = key.split('#'); return `${monthLabel(m)} · Sem ${w} (${SEM_RANGO[(parseInt(w, 10) || 1) - 1]})`; };

type Agg = { venta: number; ordenes: number; py: number };
const zero = (): Agg => ({ venta: 0, ordenes: 0, py: 0 });
const isPY = (pm: string) => /pedidos\s*ya|peya|ped\s*ya|pedidosya/i.test(pm || '');

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
  // weekMap[weekKey][branchId] = Agg
  const [weekMap, setWeekMap] = useState<Record<string, Record<string, Agg>>>({});

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
          {loading && <RefreshCw size={14} className="animate-spin text-brand-500" />}
          <span className="text-[10px] text-text-dim font-bold uppercase ml-auto">
            {baseline.n > 0 ? `Promedio sobre ${baseline.n} semana(s) previa(s)` : 'Sin semanas previas para promediar'}
          </span>
        </div>
      </div>

      {branchesConDatos.length === 0 ? (
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
      )}
    </div>
  );
}
