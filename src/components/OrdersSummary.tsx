/**
 * SPDX-License-Identifier: Apache-2.0
 * Resumen compacto de Tickets/Órdenes para el dashboard, filtrado por sucursal.
 * Muestra volumen de órdenes por año y ticket promedio ajustado por inflación.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Ticket, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';
import { SUBTOTAL_COMPONENTS } from './plStructure';

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmtNum = (n: number) => Math.round(n).toLocaleString('es-AR');
const fmtMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');

interface Props {
  scope: string; // branchId o 'consolidated'
}

export default function OrdersSummary({ scope }: Props) {
  const [orders, setOrders] = useState<Record<string, number>>({});
  const [sales, setSales] = useState<Record<string, number>>({});
  const [inflationMap, setInflationMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Órdenes manuales/importadas
        const manual: Record<string, number> = {};
        const { data: ord } = await supabase.from('monthly_orders').select('*').eq('scope', scope);
        (ord || []).forEach((r: any) => { manual[r.month] = Number(r.orders) || 0; });
        // Órdenes automáticas desde ventas (sales_tickets) - comprobantes únicos
        const auto: Record<string, number> = {};
        let tkQuery = supabase.from('sales_tickets').select('branch_id, date, orders, comprobante');
        if (scope !== 'consolidated') tkQuery = tkQuery.eq('branch_id', scope);
        let page = 0; let allTk: any[] = [];
        while (true) {
          const { data: tk } = await tkQuery.range(page * 1000, page * 1000 + 999);
          if (!tk || tk.length === 0) break;
          allTk = [...allTk, ...tk];
          if (tk.length < 1000) break;
          page++; if (page > 50) break;
        }
        const seen: Record<string, Set<string>> = {};
        const fb: Record<string, number> = {};
        allTk.forEach((t: any) => {
          if (!t.date) return;
          const m = String(t.date).slice(0, 7);
          const comp = (t.comprobante != null && String(t.comprobante).trim() !== '') ? String(t.comprobante).trim() : null;
          // Un duplicado real es: misma sucursal + mismo comprobante + MISMO DÍA.
          // Si el comprobante se repite en días distintos, son ventas legítimas distintas
          // (la numeración de comprobantes se reinicia/reutiliza), así que NO se deduplican.
          if (comp) { if (!seen[m]) seen[m] = new Set(); seen[m].add(`${t.branch_id}|${String(t.date)}|${comp}`); }
          else { fb[m] = (fb[m] || 0) + Number(t.orders || 0); }
        });
        new Set([...Object.keys(seen), ...Object.keys(fb)]).forEach(m => { auto[m] = (seen[m]?.size || 0) + (fb[m] || 0); });
        const om: Record<string, number> = { ...manual };
        Object.entries(auto).forEach(([m, o]) => { if (o > 0) om[m] = o; });
        setOrders(om);
        const { data: eerr } = await supabase.from('income_statements').select('month, lines').eq('scope', scope);
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
  }, [scope]);

  const years = useMemo(() => {
    const ys = new Set<string>();
    Object.keys(orders).forEach(k => ys.add(k.slice(0, 4)));
    return Array.from(ys).sort();
  }, [orders]);
  const refYear = years.length > 0 ? years[years.length - 1] : null;

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

  if (loading) return <div className="py-8 flex justify-center"><Loader2 size={20} className="animate-spin text-brand-500" /></div>;
  if (years.length === 0) {
    return <div className="py-8 text-center text-text-dim text-[10px] font-black uppercase tracking-widest opacity-50">Sin datos de órdenes para esta sucursal.</div>;
  }

  return (
    <div className="space-y-5">
      {/* Volumen de órdenes */}
      <div>
        <p className="text-[9px] font-black uppercase text-text-dim tracking-widest mb-2">Cantidad de Órdenes por mes</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[420px]">
            <thead>
              <tr className="text-[8px] font-black uppercase text-text-dim tracking-wider border-b border-border-dim">
                <th className="py-1.5">Mes</th>
                {years.map(y => <th key={y} className="py-1.5 text-right">{y}</th>)}
                {years.length >= 2 && <th className="py-1.5 text-right">Var %</th>}
              </tr>
            </thead>
            <tbody>
              {MONTHS_ES.map((mname, idx) => {
                const mm = String(idx + 1).padStart(2, '0');
                const vals = years.map(y => orders[`${y}-${mm}`]);
                if (vals.every(v => v === undefined)) return null;
                const lastTwo = years.slice(-2);
                const newV = lastTwo[1] ? orders[`${lastTwo[1]}-${mm}`] : undefined;
                const oldV = lastTwo[0] ? orders[`${lastTwo[0]}-${mm}`] : undefined;
                const varV = (newV && oldV) ? ((newV - oldV) / oldV) * 100 : null;
                return (
                  <tr key={mm} className="border-b border-border-dim/30 text-[10px]">
                    <td className="py-1.5 font-black uppercase text-text-main">{mname}</td>
                    {years.map(y => <td key={y} className="py-1.5 text-right font-mono text-text-main">{orders[`${y}-${mm}`] !== undefined ? fmtNum(orders[`${y}-${mm}`]) : '—'}</td>)}
                    {years.length >= 2 && (
                      <td className={cn("py-1.5 text-right font-mono font-black inline-flex items-center justify-end gap-0.5 w-full", varV === null ? "text-text-dim" : varV > 0 ? "text-emerald-500" : "text-red-500")}>
                        {varV !== null ? <>{varV > 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}{(varV > 0 ? '+' : '') + varV.toFixed(1) + '%'}</> : '—'}
                      </td>
                    )}
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
    </div>
  );
}
