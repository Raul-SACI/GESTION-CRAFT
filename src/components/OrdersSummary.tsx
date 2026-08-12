/**
 * SPDX-License-Identifier: Apache-2.0
 * Resumen compacto de Tickets/Órdenes para el dashboard, filtrable por sucursal.
 * Muestra el histórico de órdenes por año/mes (desde 2023), la variación
 * respecto al mismo mes del año anterior y el ticket promedio ajustado por inflación.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';
import { SUBTOTAL_COMPONENTS } from './plStructure';

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmtNum = (n: number) => Math.round(n).toLocaleString('es-AR');
const fmtMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');

interface BranchOpt { id: string; name: string; }

interface Props {
  scope: string;          // branchId o 'consolidated' (viene del filtro global del dashboard)
  branches?: BranchOpt[]; // si se pasa, se muestra un selector propio de sucursal en la sección
}

export default function OrdersSummary({ scope, branches }: Props) {
  // Selector propio de la sección: arranca en el scope global y puede cambiarse
  // sin afectar el resto del dashboard.
  const [localScope, setLocalScope] = useState<string>(scope);
  useEffect(() => { setLocalScope(scope); }, [scope]);
  const effScope = branches && branches.length > 0 ? localScope : scope;

  const [orders, setOrders] = useState<Record<string, number>>({});
  const [daysLoadedByMonth, setDaysLoadedByMonth] = useState<Record<string, number>>({});
  const [sales, setSales] = useState<Record<string, number>>({});
  const [inflationMap, setInflationMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Órdenes manuales/importadas
        const manual: Record<string, number> = {};
        const { data: ord } = await supabase.from('monthly_orders').select('*').eq('scope', effScope);
        (ord || []).forEach((r: any) => { manual[r.month] = Number(r.orders) || 0; });

        // Órdenes automáticas desde ventas (sales_tickets), agregadas por mes.
        // Preferimos el conteo en el servidor (RPC) para poder traer todo el
        // histórico desde 2023 sin volcar cientos de miles de filas al navegador.
        const auto: Record<string, number> = {};
        const dlm: Record<string, number> = {};
        const { data: rpcRows, error: rpcErr } = await supabase
          .rpc('sales_orders_monthly', { p_scope: effScope });

        if (!rpcErr && Array.isArray(rpcRows)) {
          (rpcRows as any[]).forEach((r) => {
            const m = String(r.month);
            auto[m] = Number(r.orders) || 0;
            dlm[m] = Number(r.days_loaded) || 0;
          });
        } else {
          // Fallback: conteo en el cliente (por si aún no se creó la función RPC).
          // Paginación determinística (orden estable) para no perder ni duplicar filas.
          let tkQuery = supabase
            .from('sales_tickets')
            .select('branch_id, date, orders, comprobante')
            .order('date').order('branch_id').order('comprobante');
          if (effScope !== 'consolidated') tkQuery = tkQuery.eq('branch_id', effScope);
          let page = 0; let allTk: any[] = [];
          while (true) {
            const { data: tk } = await tkQuery.range(page * 1000, page * 1000 + 999);
            if (!tk || tk.length === 0) break;
            allTk = [...allTk, ...tk];
            if (tk.length < 1000) break;
            page++; if (page > 800) break; // tope de seguridad (~800k filas)
          }
          const seen: Record<string, Set<string>> = {};
          const fb: Record<string, number> = {};
          const daysByMonth: Record<string, Set<string>> = {};
          allTk.forEach((t: any) => {
            if (!t.date) return;
            const m = String(t.date).slice(0, 7);
            if (!daysByMonth[m]) daysByMonth[m] = new Set();
            daysByMonth[m].add(String(t.date));
            const comp = (t.comprobante != null && String(t.comprobante).trim() !== '') ? String(t.comprobante).trim() : null;
            if (comp) { if (!seen[m]) seen[m] = new Set(); seen[m].add(`${t.branch_id}|${String(t.date)}|${comp}`); }
            else { fb[m] = (fb[m] || 0) + Number(t.orders || 0); }
          });
          Object.entries(daysByMonth).forEach(([m, set]) => { dlm[m] = set.size; });
          new Set([...Object.keys(seen), ...Object.keys(fb)]).forEach(m => { auto[m] = (seen[m]?.size || 0) + (fb[m] || 0); });
        }
        setDaysLoadedByMonth(dlm);
        const om: Record<string, number> = { ...manual };
        Object.entries(auto).forEach(([m, o]) => { if (o > 0) om[m] = o; });
        setOrders(om);

        const { data: eerr } = await supabase.from('income_statements').select('month, lines').eq('scope', effScope);
        const sm: Record<string, number> = {};
        (eerr || []).forEach((r: any) => {
          const arr = typeof r.lines === 'string' ? JSON.parse(r.lines) : r.lines;
          const m: Record<string, number> = {};
          (arr || []).forEach((l: any) => { m[l.key] = l.realPesos || 0; });
          sm[r.month] = SUBTOTAL_COMPONENTS.ventas_netas.reduce((s, k) => s + (m[k] || 0), 0);
        });
        setSales(sm);
        const { data: infl } = await supabase.from('monthly_inflation').select('*');
        const im: Record<string, number> = {};
        (infl || []).forEach((r: any) => { im[r.month] = Number(r.inflation_pct) || 0; });
        setInflationMap(im);
      } catch (e) { console.error('Error OrdersSummary:', e); }
      setLoading(false);
    };
    load();
  }, [effScope]);

  const years = useMemo(() => {
    const ys = new Set<string>();
    Object.keys(orders).forEach(k => ys.add(k.slice(0, 4)));
    return Array.from(ys).sort();
  }, [orders]);
  const refYear = years.length > 0 ? years[years.length - 1] : null;

  // Mes en curso (actual, sin cerrar) en formato YYYY-MM
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Devuelve { value, isProjected } para un mes dado.
  // Si es el mes en curso y tiene datos parciales, proyecta: ordenes / diasConDatos * diasDelMes.
  const getOrdersDisplay = (year: string, mm: string): { value: number | undefined; isProjected: boolean } => {
    const month = `${year}-${mm}`;
    const raw = orders[month];
    if (raw === undefined) return { value: undefined, isProjected: false };
    if (month === currentMonthKey) {
      const daysLoaded = daysLoadedByMonth[month] || 0;
      const daysInMonth = new Date(Number(year), Number(mm), 0).getDate();
      if (daysLoaded > 0 && daysLoaded < daysInMonth) {
        return { value: Math.round((raw / daysLoaded) * daysInMonth), isProjected: true };
      }
    }
    return { value: raw, isProjected: false };
  };

  const inflationFactor = (fromMonth: string, toMonth: string): number => {
    if (fromMonth >= toMonth) return 1;
    let factor = 1;
    let [y, m] = fromMonth.split('-').map(Number);
    const advance = () => { m++; if (m > 12) { m = 1; y++; } };
    advance();
    while (true) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      factor *= (1 + (inflationMap[key] || 0) / 100);
      if (key === toMonth) break;
      advance();
      if (y > 3000) break;
    }
    return factor;
  };
  const adjustedTicket = (year: string, mm: string): number | null => {
    const month = `${year}-${mm}`;
    const o = orders[month]; const s = sales[month];
    if (!o || !s) return null;
    const t = s / o;
    if (!refYear || year === refYear) return t;
    return t * inflationFactor(`${year}-${mm}`, `${refYear}-${mm}`);
  };

  const branchLabel = effScope === 'consolidated'
    ? 'Consolidado'
    : (branches?.find(b => b.id === effScope)?.name || 'Sucursal');

  return (
    <div className="space-y-5">
      {branches && branches.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-black uppercase text-text-dim tracking-widest">Sucursal</span>
          <select
            value={localScope}
            onChange={(e) => setLocalScope(e.target.value)}
            className="bg-bg-card border border-border-dim rounded-lg px-2.5 py-1 text-[10px] font-bold text-text-main focus:outline-none focus:border-brand-500"
          >
            <option value="consolidated">Consolidado (todas)</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}

      {loading ? (
        <div className="py-8 flex justify-center"><Loader2 size={20} className="animate-spin text-brand-500" /></div>
      ) : years.length === 0 ? (
        <div className="py-8 text-center text-text-dim text-[10px] font-black uppercase tracking-widest opacity-50">Sin datos de órdenes para {branchLabel}.</div>
      ) : (
        <>
          {/* Volumen de órdenes (histórico) */}
          <div>
            <p className="text-[9px] font-black uppercase text-text-dim tracking-widest mb-2">
              Cantidad de Órdenes por mes
              <span className="normal-case text-amber-500/70"> (el mes en curso se proyecta a fin de mes según los días cargados)</span>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[420px]">
                <thead>
                  <tr className="text-[8px] font-black uppercase text-text-dim tracking-wider border-b border-border-dim">
                    <th className="py-1.5">Mes</th>
                    {years.map((y, i) => (
                      <th key={y} className="py-1.5 text-right">
                        {y}
                        {i > 0 && <span className="normal-case font-normal opacity-50"> · vs {years[i - 1]}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MONTHS_ES.map((mname, idx) => {
                    const mm = String(idx + 1).padStart(2, '0');
                    const disp = years.map(y => getOrdersDisplay(y, mm));
                    if (disp.every(d => d.value === undefined)) return null;
                    return (
                      <tr key={mm} className="border-b border-border-dim/30 text-[10px]">
                        <td className="py-1.5 font-black uppercase text-text-main">{mname}</td>
                        {disp.map((d, i) => {
                          // Variación vs el mismo mes del año anterior (columna previa)
                          const prev = i > 0 ? disp[i - 1] : undefined;
                          const varV = (d.value && prev && prev.value) ? ((d.value - prev.value) / prev.value) * 100 : null;
                          return (
                            <td key={years[i]} className={cn("py-1.5 text-right font-mono align-top", d.isProjected ? "text-amber-500" : "text-text-main")}>
                              {d.value !== undefined
                                ? (
                                  <div className="flex flex-col items-end leading-tight">
                                    <span>{fmtNum(d.value)}{d.isProjected && <span className="text-[7px] font-black uppercase ml-1 opacity-80">proy.</span>}</span>
                                    {varV !== null && (
                                      <span className={cn("text-[8px] font-black inline-flex items-center gap-0.5", varV > 0 ? "text-emerald-500" : varV < 0 ? "text-red-500" : "text-text-dim")}>
                                        {varV > 0 ? <TrendingUp size={8} /> : varV < 0 ? <TrendingDown size={8} /> : null}
                                        {(varV > 0 ? '+' : '') + varV.toFixed(1) + '%'}
                                      </span>
                                    )}
                                  </div>
                                )
                                : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Ticket promedio ajustado */}
          <div>
            <p className="text-[9px] font-black uppercase text-text-dim tracking-widest mb-2">Ticket Promedio <span className="normal-case text-text-dim/70">(años previos ajustados por inflación a {refYear})</span></p>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[420px]">
                <thead>
                  <tr className="text-[8px] font-black uppercase text-text-dim tracking-wider border-b border-border-dim">
                    <th className="py-1.5">Mes</th>
                    {years.map(y => <th key={y} className="py-1.5 text-right">{y}{refYear && y !== refYear ? ' (aj.)' : ''}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {MONTHS_ES.map((mname, idx) => {
                    const mm = String(idx + 1).padStart(2, '0');
                    const cells = years.map(y => adjustedTicket(y, mm));
                    if (cells.every(c => c === null)) return null;
                    return (
                      <tr key={mm} className="border-b border-border-dim/30 text-[10px]">
                        <td className="py-1.5 font-black uppercase text-text-main">{mname}</td>
                        {cells.map((c, i) => <td key={i} className="py-1.5 text-right font-mono text-text-main">{c !== null ? fmtMoney(c) : '—'}</td>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
