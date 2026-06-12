/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Building2, Calendar, TrendingUp, TrendingDown, Star, DollarSign,
  ShoppingBag, Receipt, Target, Award, Loader2, Coffee, Utensils, Calculator, ListOrdered, Clock, BarChart3
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Branch } from '../types';
import { supabase } from '../lib/supabase';
import MonthlyRankingTop from './MonthlyRankingTop';
import ProfitLossKPIs from './ProfitLossKPIs';
import LiabilitiesConsolidatedSection from './LiabilitiesConsolidatedSection';
import OrdersSummary from './OrdersSummary';

interface SociosDashboardViewProps {
  branches: Branch[];
}

interface BranchSales {
  branchId: string;
  branchName: string;
  netCurrent: number;
  grossCurrent: number;
  ticketsCurrent: number;
  netPrev: number;
  grossPrev: number;
  ticketsPrev: number;
  projection: number;
  googleRating: number;
  googleVotes: number;
  pyResto: number | null;
  pyCafe: number | null;
  cmv: number | null;
  budgetHours: number;
  workedHours: number;
}

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');
const pct = (curr: number, prev: number): number | null => {
  if (!prev || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
};

const prevMonthOf = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function SociosDashboardView({ branches }: SociosDashboardViewProps) {
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BranchSales[]>([]);
  // Metadata de carga del mes actual: hasta qué día hay datos y cuántos días
  const [loadInfo, setLoadInfo] = useState<{ lastDate: string | null; daysLoaded: number; daysPrevMonth: number }>({ lastDate: null, daysLoaded: 0, daysPrevMonth: 30 });

  const operativeBranches = useMemo(
    () => branches.filter(b => !/almac/i.test(b.name)),
    [branches]
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const prevMonth = prevMonthOf(selectedMonth);
      const [cy, cm] = selectedMonth.split('-').map(Number);
      const monthStart = `${selectedMonth}-01`;
      const monthEnd = `${selectedMonth}-${String(new Date(cy, cm, 0).getDate()).padStart(2, '0')}`;
      const pStart = `${prevMonth}-01`;
      const [py, pm] = prevMonth.split('-').map(Number);
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
            .gte('date', start)
            .lte('date', end)
            .range(page * size, (page + 1) * size - 1);
          if (error || !rows || rows.length === 0) { more = false; break; }
          all = all.concat(rows);
          more = rows.length === size;
          page++;
        }
        return all;
      };

      const [currTickets, prevTickets, pyRows, cmvSummary, cmvDetails, budgetRows, hourLogRows] = await Promise.all([
        fetchTickets(monthStart, monthEnd),
        fetchTickets(pStart, pEnd),
        supabase.from('pedidos_ya_ratings').select('*').eq('month', selectedMonth),
        supabase.from('cmv_monthly').select('*').eq('month', selectedMonth),
        supabase.from('cmv_details').select('branch_id, type, amount').eq('month', selectedMonth),
        supabase.from('hour_budgets').select('branch_id, total_hours, status').eq('month', selectedMonth).eq('status', 'approved'),
        supabase.from('hour_logs').select('branch_id, hours_actual').eq('month', selectedMonth)
      ]);

      const agg: Record<string, BranchSales> = {};
      operativeBranches.forEach(b => {
        agg[b.id] = {
          branchId: b.id,
          branchName: b.name,
          netCurrent: 0, grossCurrent: 0, ticketsCurrent: 0,
          netPrev: 0, grossPrev: 0, ticketsPrev: 0,
          projection: 0,
          googleRating: (b as any).googleRating || 0,
          googleVotes: (b as any).googleRatingCount || 0,
          pyResto: null, pyCafe: null, cmv: null, budgetHours: 0, workedHours: 0
        };
      });

      const daysWithData: Record<string, Set<string>> = {};
      currTickets.forEach(t => {
        const a = agg[t.branch_id];
        if (!a) return;
        a.netCurrent += Number(t.net_sales) || 0;
        a.grossCurrent += Number(t.gross_sales) || 0;
        a.ticketsCurrent += Number(t.orders) || 0;
        if (!daysWithData[t.branch_id]) daysWithData[t.branch_id] = new Set();
        daysWithData[t.branch_id].add(t.date);
      });
      prevTickets.forEach(t => {
        const a = agg[t.branch_id];
        if (!a) return;
        a.netPrev += Number(t.net_sales) || 0;
        a.grossPrev += Number(t.gross_sales) || 0;
        a.ticketsPrev += Number(t.orders) || 0;
      });

      const daysInMonth = new Date(cy, cm, 0).getDate();
      Object.values(agg).forEach(a => {
        const ud = daysWithData[a.branchId]?.size || 0;
        a.projection = ud > 0 ? (a.netCurrent / ud) * daysInMonth : 0;
      });

      // Metadata de carga: hasta qué día (fecha máxima) y cuántos días distintos hay cargados
      // a nivel consolidado (union de fechas de todas las sucursales).
      const allCurrentDates = new Set<string>();
      currTickets.forEach(t => { if (t.date) allCurrentDates.add(t.date); });
      const sortedDates = Array.from(allCurrentDates).sort();
      const lastDate = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null;
      const daysLoaded = allCurrentDates.size;
      const daysPrevMonth = new Date(py, pm, 0).getDate();
      setLoadInfo({ lastDate, daysLoaded, daysPrevMonth });

      if (pyRows.data) {
        const acc: Record<string, { resto: number[]; cafe: number[] }> = {};
        pyRows.data.forEach((row: any) => {
          if (row.rating === null || row.rating === undefined) return;
          if (!acc[row.branch_id]) acc[row.branch_id] = { resto: [], cafe: [] };
          if (row.channel === 'resto') acc[row.branch_id].resto.push(Number(row.rating));
          if (row.channel === 'cafe') acc[row.branch_id].cafe.push(Number(row.rating));
        });
        Object.keys(acc).forEach(bid => {
          if (!agg[bid]) return;
          const r = acc[bid].resto, c = acc[bid].cafe;
          agg[bid].pyResto = r.length ? r.reduce((s, x) => s + x, 0) / r.length : null;
          agg[bid].pyCafe = c.length ? c.reduce((s, x) => s + x, 0) / c.length : null;
        });
      }

      // CMV por sucursal: existencia inicial + compras + movimientos - existencia final
      const cmvByBranch: Record<string, { initial: number; final: number; purchases: number; movements: number; has: boolean }> = {};
      (cmvSummary.data || []).forEach((row: any) => {
        if (!cmvByBranch[row.branch_id]) cmvByBranch[row.branch_id] = { initial: 0, final: 0, purchases: 0, movements: 0, has: false };
        cmvByBranch[row.branch_id].initial = Number(row.initial_existence) || 0;
        cmvByBranch[row.branch_id].final = Number(row.final_existence) || 0;
        cmvByBranch[row.branch_id].has = true;
      });
      (cmvDetails.data || []).forEach((row: any) => {
        if (!cmvByBranch[row.branch_id]) cmvByBranch[row.branch_id] = { initial: 0, final: 0, purchases: 0, movements: 0, has: false };
        if (row.type === 'purchase') cmvByBranch[row.branch_id].purchases += Number(row.amount) || 0;
        if (row.type === 'movement') cmvByBranch[row.branch_id].movements += Number(row.amount) || 0;
        cmvByBranch[row.branch_id].has = true;
      });
      Object.keys(cmvByBranch).forEach(bid => {
        if (!agg[bid]) return;
        const c = cmvByBranch[bid];
        agg[bid].cmv = c.has ? (c.initial + c.purchases + c.movements - c.final) : null;
      });

      // Presupuesto de horas (solo aprobados) y horas reales cargadas, por sucursal
      (budgetRows.data || []).forEach((r: any) => {
        if (agg[r.branch_id]) agg[r.branch_id].budgetHours += Number(r.total_hours) || 0;
      });
      (hourLogRows.data || []).forEach((r: any) => {
        if (agg[r.branch_id]) agg[r.branch_id].workedHours += Number(r.hours_actual) || 0;
      });

      setData(Object.values(agg));
      setLoading(false);
    };
    load();
  }, [selectedMonth, operativeBranches]);

  const shown = useMemo(
    () => selectedBranch === 'all' ? data : data.filter(d => d.branchId === selectedBranch),
    [data, selectedBranch]
  );

  const totals = useMemo(() => {
    return shown.reduce((acc, d) => ({
      netCurrent: acc.netCurrent + d.netCurrent,
      grossCurrent: acc.grossCurrent + d.grossCurrent,
      ticketsCurrent: acc.ticketsCurrent + d.ticketsCurrent,
      netPrev: acc.netPrev + d.netPrev,
      grossPrev: acc.grossPrev + d.grossPrev,
      ticketsPrev: acc.ticketsPrev + d.ticketsPrev,
      projection: acc.projection + d.projection,
      cmv: acc.cmv + (d.cmv || 0),
      budgetHours: acc.budgetHours + d.budgetHours,
      workedHours: acc.workedHours + d.workedHours
    }), { netCurrent: 0, grossCurrent: 0, ticketsCurrent: 0, netPrev: 0, grossPrev: 0, ticketsPrev: 0, projection: 0, cmv: 0, budgetHours: 0, workedHours: 0 });
  }, [shown]);

  const prevMonthLabel = prevMonthOf(selectedMonth);

  // Factor de prorrateo: comparamos el mes actual (parcial) contra la MISMA proporción
  // de días del mes anterior. Ej: 7 días cargados / 31 días de mayo = 0.2258
  // Si el mes está completo (o no hay datos aún), el factor es 1 (comparación normal).
  const prorateFactor = useMemo(() => {
    if (loadInfo.daysLoaded <= 0) return 1;
    if (loadInfo.daysLoaded >= loadInfo.daysPrevMonth) return 1;
    return loadInfo.daysLoaded / loadInfo.daysPrevMonth;
  }, [loadInfo]);

  const isPartial = prorateFactor < 1;

  // Etiqueta de fecha de carga (DD/MM/AAAA)
  const lastDateLabel = useMemo(() => {
    if (!loadInfo.lastDate) return null;
    const [y, m, d] = loadInfo.lastDate.split('-');
    return `${d}/${m}/${y}`;
  }, [loadInfo.lastDate]);

  const DeltaBadge = ({ curr, prev }: { curr: number; prev: number }) => {
    const adjustedPrev = prev * prorateFactor;
    const p = pct(curr, adjustedPrev);
    if (p === null) return <span className="text-text-dim text-[10px] font-bold">— sin datos previos</span>;
    const up = p >= 0;
    return (
      <div className={cn('flex items-center gap-1 text-[10px] font-bold', up ? 'text-emerald-500' : 'text-red-500')}>
        {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        <span>{up ? '+' : ''}{p.toFixed(1)}% vs {prevMonthLabel}{isPartial ? ' (prorrateado)' : ''}</span>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 pb-20 font-sans"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="bg-brand-500/15 p-3 text-brand-500 border border-brand-500/25 rounded-xl shadow-lg shadow-brand-500/5">
            <Award size={26} className="stroke-[2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-brand-500/10 text-brand-600 dark:text-brand-500 text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest border border-brand-500/20">Panel Socios</span>
              <span className="text-text-dim text-[10px] font-bold uppercase tracking-wider">• Acceso Reservado</span>
            </div>
            <h2 className="text-2xl font-black text-text-main uppercase tracking-tight mt-1">
              Dashboard de Socios {selectedBranch !== 'all' ? `• ${(branches.find(b => b.id === selectedBranch))?.name}` : '(Vista Consolidada)'}
            </h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest mt-0.5">Ventas, Reputación Online & Proyección</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-bg-sidebar border border-border-dim rounded-lg px-3 py-1.5 flex items-center gap-2">
            <Building2 size={14} className="text-brand-500" />
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="bg-transparent border-none text-[10.5px] font-extrabold text-text-main outline-none uppercase font-sans cursor-pointer focus:ring-0"
            >
              <option value="all">Todas las Sucursales</option>
              {operativeBranches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="bg-bg-sidebar border border-border-dim rounded-lg px-3 py-1.5 flex items-center gap-2 font-mono">
            <Calendar size={14} className="text-brand-500" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent border-none text-[10px] font-extrabold uppercase text-text-main outline-none cursor-pointer"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-32 flex flex-col items-center justify-center text-text-dim">
          <Loader2 size={36} className="animate-spin text-brand-500" />
          <p className="mt-4 text-[10px] font-black uppercase tracking-widest">Cargando datos consolidados…</p>
        </div>
      ) : (
        <>
          {lastDateLabel && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-start gap-3">
              <Clock size={16} className="text-amber-500 shrink-0 mt-0.5" />
              <div className="text-[10px] leading-relaxed">
                <span className="font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Información cargada hasta el día {lastDateLabel}
                </span>
                <span className="text-text-dim font-bold">
                  {' '}({loadInfo.daysLoaded} {loadInfo.daysLoaded === 1 ? 'día' : 'días'} del mes).
                </span>
                {isPartial && (
                  <span className="block text-text-dim font-medium normal-case mt-0.5">
                    Las comparativas con {prevMonthLabel} están prorrateadas a los mismos {loadInfo.daysLoaded} días para que sean comparables (no se compara contra el mes anterior completo).
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 relative overflow-hidden shadow-sm">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><DollarSign size={50} className="text-brand-500" /></div>
              <p className="text-[9px] text-[#8B949E] uppercase font-black tracking-widest">Ventas Netas del Mes</p>
              <p className="text-2xl font-mono font-black text-text-main tracking-tight mt-1.5">{fmt(totals.netCurrent)}</p>
              <div className="mt-2"><DeltaBadge curr={totals.netCurrent} prev={totals.netPrev} /></div>
            </div>

            <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 relative overflow-hidden shadow-sm">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><DollarSign size={50} className="text-brand-500" /></div>
              <p className="text-[9px] text-[#8B949E] uppercase font-black tracking-widest">Ventas Brutas del Mes</p>
              <p className="text-2xl font-mono font-black text-text-main tracking-tight mt-1.5">{fmt(totals.grossCurrent)}</p>
              <div className="mt-2"><DeltaBadge curr={totals.grossCurrent} prev={totals.grossPrev} /></div>
            </div>

            <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 relative overflow-hidden shadow-sm">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><Receipt size={50} className="text-brand-500" /></div>
              <p className="text-[9px] text-[#8B949E] uppercase font-black tracking-widest">Tickets del Mes</p>
              <p className="text-2xl font-mono font-black text-text-main tracking-tight mt-1.5">{totals.ticketsCurrent.toLocaleString('es-AR')}</p>
              <div className="mt-2"><DeltaBadge curr={totals.ticketsCurrent} prev={totals.ticketsPrev} /></div>
            </div>

            <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 relative overflow-hidden shadow-sm">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><Target size={50} className="text-emerald-500" /></div>
              <p className="text-[9px] text-[#8B949E] uppercase font-black tracking-widest">Proyección Neta del Mes</p>
              <p className="text-2xl font-mono font-black text-emerald-600 dark:text-emerald-500 tracking-tight mt-1.5">{fmt(totals.projection)}</p>
              <p className="text-[9px] text-text-dim font-bold uppercase mt-2">Estimado a fin de mes</p>
            </div>
          </div>

          <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm overflow-hidden">
            <h3 className="text-xs font-black uppercase text-brand-500 tracking-wider mb-4">Ventas por Sucursal · {selectedMonth}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] font-black uppercase tracking-wider text-text-dim border-b border-border-dim">
                    <th className="px-3 py-2">Sucursal</th>
                    <th className="px-3 py-2 text-right">V. Netas</th>
                    <th className="px-3 py-2 text-right">vs Ant.</th>
                    <th className="px-3 py-2 text-right">V. Brutas</th>
                    <th className="px-3 py-2 text-right">vs Ant.</th>
                    <th className="px-3 py-2 text-right">Tickets</th>
                    <th className="px-3 py-2 text-right">vs Ant.</th>
                    <th className="px-3 py-2 text-right">Proyección</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dim">
                  {shown.map(d => {
                    const pn = pct(d.netCurrent, d.netPrev * prorateFactor);
                    const pg = pct(d.grossCurrent, d.grossPrev * prorateFactor);
                    const pt = pct(d.ticketsCurrent, d.ticketsPrev * prorateFactor);
                    const cell = (p: number | null) => p === null
                      ? <span className="text-text-dim">—</span>
                      : <span className={p >= 0 ? 'text-emerald-500' : 'text-red-500'}>{p >= 0 ? '+' : ''}{p.toFixed(1)}%</span>;
                    return (
                      <tr key={d.branchId} className="text-[11px] font-medium hover:bg-bg-accent/30">
                        <td className="px-3 py-2.5 font-black uppercase text-text-main">{d.branchName}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-text-main">{fmt(d.netCurrent)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-[10px] font-bold">{cell(pn)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-text-main">{fmt(d.grossCurrent)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-[10px] font-bold">{cell(pg)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-text-main">{d.ticketsCurrent.toLocaleString('es-AR')}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-[10px] font-bold">{cell(pt)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-500 font-bold">{fmt(d.projection)}</td>
                      </tr>
                    );
                  })}
                  {shown.length > 1 && (
                    <tr className="text-[11px] font-black bg-bg-accent/40 border-t-2 border-border-dim">
                      <td className="px-3 py-2.5 uppercase text-text-main">Total</td>
                      <td className="px-3 py-2.5 text-right font-mono text-text-main">{fmt(totals.netCurrent)}</td>
                      <td className="px-3 py-2.5"></td>
                      <td className="px-3 py-2.5 text-right font-mono text-text-main">{fmt(totals.grossCurrent)}</td>
                      <td className="px-3 py-2.5"></td>
                      <td className="px-3 py-2.5 text-right font-mono text-text-main">{totals.ticketsCurrent.toLocaleString('es-AR')}</td>
                      <td className="px-3 py-2.5"></td>
                      <td className="px-3 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-500">{fmt(totals.projection)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Star size={16} className="text-yellow-500" />
                <h3 className="text-xs font-black uppercase text-text-main tracking-wider">Calificación Google Maps</h3>
              </div>
              <div className="space-y-2.5">
                {shown.map(d => (
                  <div key={d.branchId} className="flex items-center justify-between bg-bg-main/30 border border-border-dim/60 rounded-lg px-3 py-2.5">
                    <span className="text-[10px] font-black uppercase text-text-main truncate">{d.branchName}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-mono font-black text-text-main">{d.googleRating ? d.googleRating.toFixed(1) : '—'}</span>
                      <Star size={13} className="text-yellow-500" fill="currentColor" />
                      <span className="text-[9px] text-text-dim font-bold">({d.googleVotes.toLocaleString('es-AR')})</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <ShoppingBag size={16} className="text-[#ED1C24]" />
                <h3 className="text-xs font-black uppercase text-text-main tracking-wider">Calificación Pedidos Ya · {selectedMonth}</h3>
              </div>
              <div className="space-y-2.5">
                {shown.map(d => (
                  <div key={d.branchId} className="flex items-center justify-between bg-bg-main/30 border border-border-dim/60 rounded-lg px-3 py-2.5">
                    <span className="text-[10px] font-black uppercase text-text-main truncate">{d.branchName}</span>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="flex items-center gap-1" title="Resto">
                        <Utensils size={12} className="text-pink-500" />
                        <span className="text-[11px] font-mono font-black text-text-main">{d.pyResto !== null ? d.pyResto.toFixed(1) : '—'}</span>
                      </div>
                      <div className="flex items-center gap-1" title="Cafe">
                        <Coffee size={12} className="text-amber-600" />
                        <span className="text-[11px] font-mono font-black text-text-main">{d.pyCafe !== null ? d.pyCafe.toFixed(1) : '—'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[8px] text-text-dim font-bold uppercase mt-3 opacity-70">Promedio de las semanas cargadas en el modulo Pedidos Ya</p>
            </div>
          </div>

          <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <Calculator size={16} className="text-brand-500" />
              <h3 className="text-xs font-black uppercase text-text-main tracking-wider">CMV Mensual por Sucursal · {selectedMonth}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] font-black uppercase tracking-wider text-text-dim border-b border-border-dim">
                    <th className="px-3 py-2">Sucursal</th>
                    <th className="px-3 py-2 text-right">CMV</th>
                    <th className="px-3 py-2 text-right">Ventas Netas</th>
                    <th className="px-3 py-2 text-right">CMV %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dim">
                  {shown.map(d => {
                    const cmvPct = (d.cmv !== null && d.netCurrent > 0) ? (d.cmv / d.netCurrent) * 100 : null;
                    return (
                      <tr key={d.branchId} className="text-[11px] font-medium hover:bg-bg-accent/30">
                        <td className="px-3 py-2.5 font-black uppercase text-text-main">{d.branchName}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-text-main">{d.cmv !== null ? fmt(d.cmv) : <span className="text-text-dim">— sin carga</span>}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-text-dim">{fmt(d.netCurrent)}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold">
                          {cmvPct !== null
                            ? <span className={cmvPct > 35 ? 'text-red-500' : cmvPct > 30 ? 'text-amber-500' : 'text-emerald-500'}>{cmvPct.toFixed(1)}%</span>
                            : <span className="text-text-dim">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[8px] text-text-dim font-bold uppercase mt-3 opacity-70">Datos del modulo CMV Mensual Sucursal (Administracion)</p>
          </div>

          {/* KPIs financieros (Estado de Resultados consolidado) */}
          <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={16} className="text-brand-500" />
              <h3 className="text-xs font-black uppercase text-text-main tracking-wider">Resultados · Ventas y Ganancia</h3>
            </div>
            <ProfitLossKPIs scope="consolidated" compact />
          </div>

          {/* Presupuesto de Horas y % de consumo */}
          <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={16} className="text-brand-500" />
              <h3 className="text-xs font-black uppercase text-text-main tracking-wider">Presupuesto de Horas · {selectedMonth}</h3>
            </div>
            {/* KPI consolidado */}
            {(() => {
              const consumoPct = totals.budgetHours > 0 ? (totals.workedHours / totals.budgetHours) * 100 : null;
              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div className="bg-bg-main/30 border border-border-dim/50 rounded-lg p-3">
                    <p className="text-[8px] font-black uppercase text-text-dim tracking-widest">Presupuesto Total</p>
                    <p className="text-lg font-mono font-black text-text-main mt-1">{Math.round(totals.budgetHours).toLocaleString('es-AR')} hs</p>
                  </div>
                  <div className="bg-bg-main/30 border border-border-dim/50 rounded-lg p-3">
                    <p className="text-[8px] font-black uppercase text-text-dim tracking-widest">Consumido a la Fecha</p>
                    <p className="text-lg font-mono font-black text-text-main mt-1">{Math.round(totals.workedHours).toLocaleString('es-AR')} hs</p>
                  </div>
                  <div className={cn("border rounded-lg p-3",
                    consumoPct === null ? "bg-bg-main/30 border-border-dim/50" :
                    consumoPct > 100 ? "bg-red-500/10 border-red-500/30" :
                    consumoPct > 85 ? "bg-amber-500/10 border-amber-500/30" : "bg-emerald-500/10 border-emerald-500/30")}>
                    <p className="text-[8px] font-black uppercase text-text-dim tracking-widest">% Consumo</p>
                    <p className={cn("text-lg font-mono font-black mt-1",
                      consumoPct === null ? "text-text-dim" :
                      consumoPct > 100 ? "text-red-500" : consumoPct > 85 ? "text-amber-500" : "text-emerald-500")}>
                      {consumoPct === null ? '—' : consumoPct.toFixed(1) + '%'}
                    </p>
                  </div>
                </div>
              );
            })()}
            {/* Tabla por sucursal */}
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] font-black uppercase tracking-wider text-text-dim border-b border-border-dim">
                    <th className="px-3 py-2">Sucursal</th>
                    <th className="px-3 py-2 text-right">Presupuesto</th>
                    <th className="px-3 py-2 text-right">Consumido</th>
                    <th className="px-3 py-2 text-right">% Consumo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dim">
                  {shown.map(d => {
                    const pct = d.budgetHours > 0 ? (d.workedHours / d.budgetHours) * 100 : null;
                    return (
                      <tr key={d.branchId} className="text-[11px] font-medium hover:bg-bg-accent/30">
                        <td className="px-3 py-2.5 font-black uppercase text-text-main">{d.branchName}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-text-main">{d.budgetHours > 0 ? Math.round(d.budgetHours).toLocaleString('es-AR') + ' hs' : <span className="text-text-dim">— sin aprobar</span>}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-text-dim">{Math.round(d.workedHours).toLocaleString('es-AR')} hs</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold">
                          {pct === null ? <span className="text-text-dim">—</span> :
                            <span className={pct > 100 ? 'text-red-500' : pct > 85 ? 'text-amber-500' : 'text-emerald-500'}>{pct.toFixed(1)}%</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[8px] text-text-dim font-bold uppercase mt-3 opacity-70">Presupuesto aprobado (Presupuestador) vs horas cargadas (Control de Horas)</p>
          </div>

          <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <ListOrdered size={16} className="text-brand-500" />
              <h3 className="text-xs font-black uppercase text-text-main tracking-wider">Ranking de Articulos</h3>
            </div>
            <MonthlyRankingTop branches={branches} fixedBranchId={selectedBranch !== 'all' ? selectedBranch : undefined} />
          </div>

          {/* Tickets / Órdenes (misma tabla del Dashboard General) */}
          <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Receipt size={16} className="text-brand-500" />
              <h3 className="text-xs font-black uppercase text-text-main tracking-wider">Tickets / Órdenes</h3>
            </div>
            <OrdersSummary scope={selectedBranch === 'all' ? 'consolidated' : selectedBranch} />
          </div>

          {/* Pasivos consolidados por entidad (Bancarios / Fiscales / Legales) */}
          <LiabilitiesConsolidatedSection />

          <div className="bg-bg-sidebar border border-dashed border-border-dim rounded-xl p-6 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-text-dim">Estado de Resultados</p>
            <p className="text-[10px] text-text-dim mt-2 max-w-lg mx-auto leading-relaxed">
              El Estado de Resultados del mes anterior y el proyectado del mes actual se mostraran aca una vez que mejoremos ese modulo y comience a guardar sus datos en la base.
            </p>
          </div>
        </>
      )}
    </motion.div>
  );
}
