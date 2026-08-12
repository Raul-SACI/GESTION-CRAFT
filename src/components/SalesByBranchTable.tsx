import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { cn } from '@/src/lib/utils';
import { ChevronDown, ChevronRight, Loader2, Calendar, TrendingUp } from 'lucide-react';

interface Branch { id: string; name: string; }
interface Props {
  branches: Branch[];
}

interface BranchSales {
  branchId: string;
  branchName: string;
  netCurrent: number; grossCurrent: number; ticketsCurrent: number;
  netPrev: number; grossPrev: number; ticketsPrev: number;
  projection: number; ticketsProjection: number;
  semanas: Record<number, { net: number; gross: number; tickets: number }>;
  semanasPrev: Record<number, { net: number; gross: number; tickets: number }>;
}

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');
const pct = (curr: number, prev: number): number | null => {
  if (!prev || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
};
const prevMonthOf = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function SalesByBranchTable({ branches }: Props) {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [data, setData] = useState<BranchSales[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // Sucursales operativas (excluye 'all' y el centro de producción)
  const operativeBranches = useMemo(
    () => branches.filter(b => b.id && b.id !== 'all' && b.id !== 'n4ncoary3'),
    [branches]
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const prevMonth = prevMonthOf(selectedMonth);
      const [cy, cm] = selectedMonth.split('-').map(Number);
      const monthStart = `${selectedMonth}-01`;
      const monthEnd = `${selectedMonth}-${String(new Date(cy, cm, 0).getDate()).padStart(2, '0')}`;
      const [py, pm] = prevMonth.split('-').map(Number);
      const pStart = `${prevMonth}-01`;
      const pEnd = `${prevMonth}-${String(new Date(py, pm, 0).getDate()).padStart(2, '0')}`;

      const fetchTickets = async (start: string, end: string) => {
        let all: any[] = [];
        let page = 0;
        const size = 1000;
        let more = true;
        while (more && page < 50) {
          const { data: rows, error } = await supabase
            .from('sales_tickets')
            .select('branch_id, date, gross_sales, net_sales, orders')
            .gte('date', start).lte('date', end)
            // Orden estable por la clave natural del ticket para que la paginación
            // con .range() no pise ni saltee filas (un mes completo supera las 1000).
            .order('date', { ascending: true })
            .order('branch_id', { ascending: true })
            .order('shift', { ascending: true })
            .order('hour', { ascending: true })
            .order('payment_method', { ascending: true })
            .order('comprobante', { ascending: true })
            .range(page * size, (page + 1) * size - 1);
          if (error || !rows || rows.length === 0) { more = false; break; }
          all = all.concat(rows);
          more = rows.length === size;
          page++;
        }
        return all;
      };

      const [currTickets, prevTickets] = await Promise.all([
        fetchTickets(monthStart, monthEnd),
        fetchTickets(pStart, pEnd)
      ]);

      const agg: Record<string, BranchSales> = {};
      operativeBranches.forEach(b => {
        agg[b.id] = {
          branchId: b.id, branchName: b.name,
          netCurrent: 0, grossCurrent: 0, ticketsCurrent: 0,
          netPrev: 0, grossPrev: 0, ticketsPrev: 0,
          projection: 0, ticketsProjection: 0,
          semanas: { 1: { net: 0, gross: 0, tickets: 0 }, 2: { net: 0, gross: 0, tickets: 0 }, 3: { net: 0, gross: 0, tickets: 0 }, 4: { net: 0, gross: 0, tickets: 0 } },
          semanasPrev: { 1: { net: 0, gross: 0, tickets: 0 }, 2: { net: 0, gross: 0, tickets: 0 }, 3: { net: 0, gross: 0, tickets: 0 }, 4: { net: 0, gross: 0, tickets: 0 } }
        };
      });

      const daysWithData: Record<string, Set<string>> = {};
      const dayNumsWithData: Record<string, Set<string>> = {};
      currTickets.forEach(t => {
        const a = agg[t.branch_id];
        if (!a) return;
        a.netCurrent += Number(t.net_sales) || 0;
        a.grossCurrent += Number(t.gross_sales) || 0;
        a.ticketsCurrent += Number(t.orders) || 0;
        const diaMes = parseInt(String(t.date).slice(8, 10));
        const wk = diaMes <= 7 ? 1 : diaMes <= 14 ? 2 : diaMes <= 21 ? 3 : 4;
        a.semanas[wk].net += Number(t.net_sales) || 0;
        a.semanas[wk].gross += Number(t.gross_sales) || 0;
        a.semanas[wk].tickets += Number(t.orders) || 0;
        if (!daysWithData[t.branch_id]) daysWithData[t.branch_id] = new Set();
        daysWithData[t.branch_id].add(t.date);
        if (!dayNumsWithData[t.branch_id]) dayNumsWithData[t.branch_id] = new Set();
        dayNumsWithData[t.branch_id].add(String(t.date).slice(8, 10));
      });

      // Mes anterior: solo los MISMOS días cargados en el mes actual (comparación justa)
      prevTickets.forEach(t => {
        const a = agg[t.branch_id];
        if (!a) return;
        const dayNum = String(t.date).slice(8, 10);
        const loadedDays = dayNumsWithData[t.branch_id];
        if (loadedDays && loadedDays.size > 0 && !loadedDays.has(dayNum)) return;
        a.netPrev += Number(t.net_sales) || 0;
        a.grossPrev += Number(t.gross_sales) || 0;
        a.ticketsPrev += Number(t.orders) || 0;
        const diaMesP = parseInt(dayNum);
        const wkP = diaMesP <= 7 ? 1 : diaMesP <= 14 ? 2 : diaMesP <= 21 ? 3 : 4;
        a.semanasPrev[wkP].net += Number(t.net_sales) || 0;
        a.semanasPrev[wkP].gross += Number(t.gross_sales) || 0;
        a.semanasPrev[wkP].tickets += Number(t.orders) || 0;
      });

      const daysInMonth = new Date(cy, cm, 0).getDate();
      Object.values(agg).forEach(a => {
        const ud = daysWithData[a.branchId]?.size || 0;
        a.projection = ud > 0 ? (a.netCurrent / ud) * daysInMonth : 0;
        a.ticketsProjection = ud > 0 ? (a.ticketsCurrent / ud) * daysInMonth : 0;
      });

      setData(Object.values(agg).sort((a, b) => b.netCurrent - a.netCurrent));
      setLoading(false);
    };
    load();
  }, [selectedMonth, operativeBranches]);

  const totals = useMemo(() => data.reduce((acc, d) => ({
    net: acc.net + d.netCurrent, gross: acc.gross + d.grossCurrent, tickets: acc.tickets + d.ticketsCurrent,
    proj: acc.proj + d.projection, projT: acc.projT + d.ticketsProjection
  }), { net: 0, gross: 0, tickets: 0, proj: 0, projT: 0 }), [data]);

  return (
    <div className="bg-bg-card border border-border-dim rounded-xl p-5 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-xs font-black uppercase text-brand-500 tracking-widest flex items-center gap-2">
          <TrendingUp size={15} /> Ventas por Sucursal · {selectedMonth}
        </h3>
        <div className="bg-bg-sidebar border border-border-dim rounded-lg px-3 py-1.5 flex items-center gap-2">
          <Calendar size={13} className="text-brand-500" />
          <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
            className="bg-transparent border-none text-[10px] font-extrabold uppercase text-text-main outline-none cursor-pointer" />
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center"><Loader2 size={20} className="animate-spin mx-auto text-brand-500" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[9px] font-black uppercase tracking-wider text-text-dim border-b border-border-dim">
                <th className="px-3 py-2">Sucursal</th>
                <th className="px-3 py-2 text-right">V. Netas</th>
                <th className="px-3 py-2 text-right">vs Ant. <span className="opacity-50 font-normal normal-case">(mes ant.)</span></th>
                <th className="px-3 py-2 text-right">V. Brutas</th>
                <th className="px-3 py-2 text-right">vs Ant. <span className="opacity-50 font-normal normal-case">(mes ant.)</span></th>
                <th className="px-3 py-2 text-right">Tickets</th>
                <th className="px-3 py-2 text-right">vs Ant. <span className="opacity-50 font-normal normal-case">(mes ant.)</span></th>
                <th className="px-3 py-2 text-right">Proy. Ventas</th>
                <th className="px-3 py-2 text-right">Proy. Tickets</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dim">
              {data.map(d => {
                const pn = pct(d.netCurrent, d.netPrev);
                const pg = pct(d.grossCurrent, d.grossPrev);
                const pt = pct(d.ticketsCurrent, d.ticketsPrev);
                const cell = (p: number | null, prevVal: number, isMoney = true) => (
                  <div className="flex flex-col items-end leading-tight">
                    {p === null
                      ? <span className="text-text-dim">—</span>
                      : <span className={p >= 0 ? 'text-emerald-500' : 'text-red-500'}>{p >= 0 ? '+' : ''}{p.toFixed(1)}%</span>}
                    <span className="text-[8px] font-normal text-text-dim opacity-70">
                      {isMoney ? fmt(prevVal) : Math.round(prevVal).toLocaleString('es-AR')}
                    </span>
                  </div>
                );
                return (
                  <React.Fragment key={d.branchId}>
                    <tr className="text-[11px] font-medium hover:bg-bg-accent/30 cursor-pointer"
                      onClick={() => setExpandedRows(p => ({ ...p, [d.branchId]: !p[d.branchId] }))}>
                      <td className="px-3 py-2.5 font-black uppercase text-text-main">
                        <span className="inline-flex items-center gap-1.5">
                          {expandedRows[d.branchId] ? <ChevronDown size={13} className="text-brand-500" /> : <ChevronRight size={13} className="text-text-dim" />}
                          {d.branchName}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-text-main">{fmt(d.netCurrent)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-[10px] font-bold">{cell(pn, d.netPrev)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-text-main">{fmt(d.grossCurrent)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-[10px] font-bold">{cell(pg, d.grossPrev)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-text-main">{d.ticketsCurrent.toLocaleString('es-AR')}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-[10px] font-bold">{cell(pt, d.ticketsPrev, false)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-500 font-bold">{fmt(d.projection)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-500 font-bold">{Math.round(d.ticketsProjection).toLocaleString('es-AR')}</td>
                    </tr>
                    {expandedRows[d.branchId] && [1, 2, 3, 4].map(wk => {
                      const s = d.semanas[wk];
                      const sp = d.semanasPrev[wk];
                      const rangos: Record<number, string> = { 1: '1-7', 2: '8-14', 3: '15-21', 4: '22-fin' };
                      const wn = pct(s.net, sp.net);
                      const wg = pct(s.gross, sp.gross);
                      const wt = pct(s.tickets, sp.tickets);
                      const wcell = (p: number | null, prevVal: number, isMoney = true) => (
                        <div className="flex flex-col items-end leading-tight">
                          {p === null
                            ? <span className="text-text-dim opacity-50">—</span>
                            : <span className={cn('font-bold', p >= 0 ? 'text-emerald-500' : 'text-red-500')}>{p >= 0 ? '+' : ''}{p.toFixed(1)}%</span>}
                          <span className="text-[8px] opacity-60">{isMoney ? fmt(prevVal) : Math.round(prevVal).toLocaleString('es-AR')}</span>
                        </div>
                      );
                      return (
                        <tr key={`${d.branchId}-w${wk}`} className="text-[10px] bg-bg-accent/20 text-text-dim">
                          <td className="pl-9 pr-3 py-1.5 font-bold uppercase">Semana {wk} <span className="opacity-50">({rangos[wk]})</span></td>
                          <td className="px-3 py-1.5 text-right font-mono">{fmt(s.net)}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-[9px]">{wcell(wn, sp.net)}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{fmt(s.gross)}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-[9px]">{wcell(wg, sp.gross)}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{s.tickets.toLocaleString('es-AR')}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-[9px]">{wcell(wt, sp.tickets, false)}</td>
                          <td className="px-3 py-1.5"></td>
                          <td className="px-3 py-1.5"></td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
              {data.length > 1 && (
                <tr className="text-[11px] font-black bg-bg-accent/40">
                  <td className="px-3 py-2.5 uppercase text-text-main">Total</td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-main">{fmt(totals.net)}</td>
                  <td className="px-3 py-2.5"></td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-main">{fmt(totals.gross)}</td>
                  <td className="px-3 py-2.5"></td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-main">{totals.tickets.toLocaleString('es-AR')}</td>
                  <td className="px-3 py-2.5"></td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-500">{fmt(totals.proj)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-500">{Math.round(totals.projT).toLocaleString('es-AR')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[8px] text-text-dim font-bold uppercase mt-3 opacity-70">
        Las comparativas con el mes anterior usan los mismos días del calendario ya cargados, para que sean comparables.
      </p>
    </div>
  );
}
