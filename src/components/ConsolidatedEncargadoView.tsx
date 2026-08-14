/**
 * SPDX-License-Identifier: Apache-2.0
 * Vista CONSOLIDADA del Dashboard de Encargado: una fila por sucursal con los 4
 * indicadores clave (Ventas Netas, CMV %, Desvío de Horas, Banderas), calculados
 * con las mismas fórmulas que el dashboard individual. Un 🏆 por indicador para la
 * sucursal con mejor número, y una columna con la sumatoria de trofeos.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { BarChart3, ChevronLeft, ChevronRight, Trophy, Loader2, Flag } from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { Branch } from '../types';

// Misma normalización de roles que el dashboard individual.
function normalizeRole(value: string): string {
  const n = (value || '').toLowerCase().trim();
  if (n.includes('encargado')) return 'encargado';
  if (n.includes('lider de cocina') || n.includes('líder de cocina') || n.includes('jefe de cocina') || n.includes('jefe cocina') || n.includes('jefe_cocina')) return 'jefe_cocina';
  if (n.includes('segundo')) return 'segundo_cocina';
  if (n.includes('cocinero') || n === 'cocina') return 'cocinero';
  if (n.includes('cajero') || n.includes('caja')) return 'caja';
  if (n.includes('barra') || n.includes('bartender')) return 'barra';
  if (n.includes('runner')) return 'runners';
  if (n.includes('bachero') || n.includes('bacha')) return 'bacha';
  if (n.includes('mozo')) return 'mozos';
  return n;
}

interface Row {
  branchId: string;
  branchName: string;
  netSales: number;
  hasSales: boolean;
  cmvPct: number | null;
  hoursDevPct: number | null;
  redFlags: number;
  blackFlags: number;
}

const monthLabel = (m: string) => {
  const [y, mo] = m.split('-');
  const names = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return `${names[Number(mo) - 1] || mo} ${y}`.toUpperCase();
};
const fmtMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');

export default function ConsolidatedEncargadoView({
  branches, month, onAdjustMonth, onSelectBranch,
}: {
  branches: Branch[];
  month: string;
  onAdjustMonth: (offset: number) => void;
  onSelectBranch: (id: string) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  // Sucursales a comparar: operativas (sin Almacén / virtuales / consolidado).
  const targetBranches = useMemo(
    () => branches.filter(b => b.id !== 'all' && b.id !== 'virtual' && !/almac/i.test(b.name)),
    [branches]
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [yy, mm] = month.split('-').map(Number);
        const lastDay = new Date(yy, mm, 0).getDate();
        const d1 = `${month}-01`;
        const d2 = `${month}-${String(lastDay).padStart(2, '0')}`;

        // ---- Ventas netas por sucursal (sales_tickets, paginado) ----
        const netByBranch: Record<string, number> = {};
        let page = 0;
        while (true) {
          const { data } = await supabase
            .from('sales_tickets')
            .select('branch_id, net_sales')
            .eq('month', month)
            .range(page * 1000, page * 1000 + 999);
          if (!data || data.length === 0) break;
          data.forEach((r: any) => { netByBranch[r.branch_id] = (netByBranch[r.branch_id] || 0) + (Number(r.net_sales) || 0); });
          if (data.length < 1000) break;
          page++; if (page > 60) break;
        }

        // ---- CMV: EI/EF (cmv_monthly) + compras/mov (cmv_details) ----
        const cmvEiEf: Record<string, { ei: number; ef: number }> = {};
        const { data: cmvMon } = await supabase.from('cmv_monthly').select('branch_id, initial_existence, final_existence').eq('month', month);
        (cmvMon || []).forEach((r: any) => { cmvEiEf[r.branch_id] = { ei: Number(r.initial_existence) || 0, ef: Number(r.final_existence) || 0 }; });
        const cmvComprasMov: Record<string, number> = {};
        const { data: cmvDet } = await supabase.from('cmv_details').select('branch_id, type, amount').eq('month', month);
        (cmvDet || []).forEach((r: any) => {
          if (r.type === 'purchase' || r.type === 'movement') cmvComprasMov[r.branch_id] = (cmvComprasMov[r.branch_id] || 0) + (Number(r.amount) || 0);
        });

        // ---- Horas: presupuesto + cargadas (encargado) + validadas (RRHH) ----
        const budgetByBranch: Record<string, any[]> = {};
        const { data: budgets } = await supabase.from('hour_budgets').select('*').eq('month', month);
        (budgets || []).forEach((r: any) => { (budgetByBranch[r.branch_id] ||= []).push(r); });
        const logsByBranch: Record<string, Record<string, any[]>> = {};
        const { data: hlogs } = await supabase.from('hour_logs').select('*').eq('month', month);
        (hlogs || []).forEach((r: any) => {
          const wk = `w${r.week_number}`;
          (logsByBranch[r.branch_id] ||= { w1: [], w2: [], w3: [], w4: [] });
          if (logsByBranch[r.branch_id][wk]) logsByBranch[r.branch_id][wk].push(r);
        });
        const { data: rrhh } = await supabase.from('hr_hour_logs').select('branch_id, week_number, position_id, position_name, hours_rrhh').eq('month', month);
        // Agrupar RRHH por sucursal+semana; si una semana tiene datos RRHH, reemplaza esa semana.
        const rrhhByBranchWeek: Record<string, Record<number, any[]>> = {};
        (rrhh || []).forEach((r: any) => {
          (rrhhByBranchWeek[r.branch_id] ||= {});
          (rrhhByBranchWeek[r.branch_id][Number(r.week_number)] ||= []).push(r);
        });
        Object.entries(rrhhByBranchWeek).forEach(([bid, byWeek]) => {
          logsByBranch[bid] ||= { w1: [], w2: [], w3: [], w4: [] };
          for (let w = 1; w <= 4; w++) {
            if (byWeek[w] && byWeek[w].length > 0) {
              logsByBranch[bid][`w${w}`] = byWeek[w].map((r: any) => ({
                week_number: w, position: r.position_name, position_id: r.position_id,
                hours_actual: Number(r.hours_rrhh) || 0,
              }));
            }
          }
        });

        // ---- Banderas rojas (supervision_responses) ----
        const redByBranch: Record<string, number> = {};
        const { data: sup } = await supabase.from('supervision_responses').select('branch_id, scores, annulled').gte('date', d1).lte('date', d2);
        (sup || []).forEach((r: any) => {
          if (r.annulled) return;
          redByBranch[r.branch_id] = (redByBranch[r.branch_id] || 0) + (Number(r.scores?.flags?.red) || 0);
        });

        // ---- Banderas negras (performance_reports + evaluacion_duenos_responses) ----
        const blackByBranch: Record<string, number> = {};
        const { data: perf } = await supabase.from('performance_reports').select('branch_id, black_flags').eq('month', month);
        (perf || []).forEach((r: any) => {
          const n = Array.isArray(r.black_flags) ? r.black_flags.length : 0;
          blackByBranch[r.branch_id] = (blackByBranch[r.branch_id] || 0) + n;
        });
        const { data: duenos } = await supabase.from('evaluacion_duenos_responses').select('branch_id, answers').gte('date', d1).lte('date', d2);
        (duenos || []).forEach((r: any) => {
          const ans = r.answers && typeof r.answers === 'object' ? r.answers : {};
          const nc = (Object.values(ans) as any[]).filter(a => a?.status === 'no_cumple').length;
          if (nc > 0) blackByBranch[r.branch_id] = (blackByBranch[r.branch_id] || 0) + nc;
        });

        // ---- Armar filas por sucursal ----
        const hoursDev = (bid: string): number | null => {
          const bRows = budgetByBranch[bid] || [];
          const wl = logsByBranch[bid] || { w1: [], w2: [], w3: [], w4: [] };
          if (bRows.length === 0) return null;
          const counted = new Set<string>();
          const porRol: Record<string, { budget: number; worked: number; name: string }> = {};
          bRows.forEach((row: any) => {
            const budget = (row.week1 || 0) + (row.week2 || 0) + (row.week3 || 0) + (row.week4 || 0) + (row.week5 || 0);
            const targetRole = normalizeRole(row.position_name || row.position_id || '');
            let worked = 0;
            if (!counted.has(targetRole)) {
              for (let w = 1; w <= 4; w++) {
                (wl[`w${w}`] || []).forEach((ent: any) => {
                  const entRole = normalizeRole(ent.position || ent.position_id || ent.position_name || ent.positionId || '');
                  if (entRole === targetRole) worked += Number(ent.hours_actual ?? ent.definitiveHours ?? ent.hours ?? 0);
                });
              }
              counted.add(targetRole);
            }
            const key = targetRole;
            if (!porRol[key]) porRol[key] = { budget: 0, worked: 0, name: row.position_name || '' };
            porRol[key].budget += budget;
            porRol[key].worked += worked;
          });
          let exceso = 0, base = 0;
          Object.values(porRol).forEach(r => {
            if (String(r.name || '').toUpperCase().includes('ENCARGADO')) return;
            if (r.budget <= 0) return;
            base += r.budget;
            const ex = r.worked - r.budget;
            if (ex > 0) exceso += ex;
          });
          if (base === 0) return null;
          return (exceso / base) * 100;
        };

        const built: Row[] = targetBranches.map(b => {
          const net = netByBranch[b.id] || 0;
          const eief = cmvEiEf[b.id] || { ei: 0, ef: 0 };
          const comprasMov = cmvComprasMov[b.id] || 0;
          const totalCmv = eief.ei + comprasMov - eief.ef;
          const cmvPct = net > 0 ? (totalCmv / net) * 100 : null;
          return {
            branchId: b.id,
            branchName: b.name,
            netSales: net,
            hasSales: net > 0,
            cmvPct,
            hoursDevPct: hoursDev(b.id),
            redFlags: redByBranch[b.id] || 0,
            blackFlags: blackByBranch[b.id] || 0,
          };
        });
        setRows(built);
      } catch (e) {
        console.error('Error consolidado encargado:', e);
        setRows([]);
      }
      setLoading(false);
    };
    load();
  }, [month, targetBranches]);

  // Ganadores por indicador (mejor número, entre las sucursales que tienen dato).
  const winners = useMemo(() => {
    const w = { ventas: new Set<string>(), cmv: new Set<string>(), horas: new Set<string>(), banderas: new Set<string>() };
    if (rows.length === 0) return w;
    // Ventas: máxima (solo con ventas cargadas)
    const conVentas = rows.filter(r => r.hasSales);
    if (conVentas.length) { const best = Math.max(...conVentas.map(r => r.netSales)); conVentas.forEach(r => { if (r.netSales === best) w.ventas.add(r.branchId); }); }
    // CMV %: mínima (mejor control), solo con valor
    const conCmv = rows.filter(r => r.cmvPct !== null);
    if (conCmv.length) { const best = Math.min(...conCmv.map(r => r.cmvPct as number)); conCmv.forEach(r => { if (r.cmvPct === best) w.cmv.add(r.branchId); }); }
    // Desvío horas: mínimo, solo con dato
    const conHoras = rows.filter(r => r.hoursDevPct !== null);
    if (conHoras.length) { const best = Math.min(...conHoras.map(r => r.hoursDevPct as number)); conHoras.forEach(r => { if (r.hoursDevPct === best) w.horas.add(r.branchId); }); }
    // Banderas: mínimo total (rojas + negras)
    const bestFlags = Math.min(...rows.map(r => r.redFlags + r.blackFlags));
    rows.forEach(r => { if (r.redFlags + r.blackFlags === bestFlags) w.banderas.add(r.branchId); });
    return w;
  }, [rows]);

  const trophyCount = (r: Row) =>
    (winners.ventas.has(r.branchId) ? 1 : 0) +
    (winners.cmv.has(r.branchId) ? 1 : 0) +
    (winners.horas.has(r.branchId) ? 1 : 0) +
    (winners.banderas.has(r.branchId) ? 1 : 0);

  const T = () => <Trophy size={12} className="inline text-amber-500 ml-1.5 -mt-0.5" />;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* Encabezado */}
      <div className="bg-bg-card border border-border-dim rounded-lg p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-brand-500/10 p-2.5 rounded-lg"><BarChart3 className="text-brand-500" size={20} /></div>
            <div>
              <h2 className="text-base font-black uppercase text-text-main tracking-wider">Dashboard de Encargado · Consolidado</h2>
              <p className="text-[9px] text-text-dim uppercase font-bold">Comparativa de indicadores por sucursal</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value="__CONSOLIDADO__"
              onChange={(e) => { if (e.target.value !== '__CONSOLIDADO__') onSelectBranch(e.target.value); }}
              className="bg-bg-accent border border-border-dim rounded-lg px-3 py-2 text-[10px] font-black uppercase text-text-main outline-none focus:border-brand-500 cursor-pointer"
            >
              <option value="__CONSOLIDADO__">Consolidado (todas)</option>
              {branches.filter(b => b.id !== 'all' && b.id !== 'virtual').map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <div className="flex items-center gap-1 bg-bg-accent border border-border-dim rounded-lg p-1">
              <button onClick={() => onAdjustMonth(-1)} className="p-1 text-text-dim hover:text-text-main"><ChevronLeft size={14} /></button>
              <span className="px-2 text-[10px] font-black text-text-main uppercase tracking-wider">{monthLabel(month)}</span>
              <button onClick={() => onAdjustMonth(1)} className="p-1 text-text-dim hover:text-text-main"><ChevronRight size={14} /></button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 size={26} className="animate-spin text-brand-500" /></div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center text-text-dim text-[10px] font-black uppercase tracking-widest opacity-60">Sin datos para este mes.</div>
      ) : (
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[720px]">
            <thead>
              <tr className="text-[9px] font-black uppercase text-text-dim tracking-widest border-b border-border-dim">
                <th className="px-3 py-3">Sucursal</th>
                <th className="px-3 py-3 text-right">Ventas Netas</th>
                <th className="px-3 py-3 text-right">CMV %</th>
                <th className="px-3 py-3 text-right">Desvío Horas</th>
                <th className="px-3 py-3 text-right">Banderas (R+N)</th>
                <th className="px-3 py-3 text-center">🏆 Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dim/40">
              {[...rows].sort((a, b) => trophyCount(b) - trophyCount(a)).map(r => {
                const total = trophyCount(r);
                return (
                  <tr key={r.branchId} className="text-[11px] hover:bg-bg-accent/30">
                    <td className="px-3 py-3 font-black uppercase text-text-main">{r.branchName}</td>
                    <td className={cn("px-3 py-3 text-right font-mono", winners.ventas.has(r.branchId) ? "text-amber-600 font-black" : "text-text-main")}>
                      {r.hasSales ? fmtMoney(r.netSales) : <span className="text-text-dim">—</span>}
                      {winners.ventas.has(r.branchId) && <T />}
                    </td>
                    <td className={cn("px-3 py-3 text-right font-mono", winners.cmv.has(r.branchId) ? "text-amber-600 font-black" : "text-text-main")}>
                      {r.cmvPct !== null ? `${r.cmvPct.toFixed(1)}%` : <span className="text-text-dim">—</span>}
                      {winners.cmv.has(r.branchId) && <T />}
                    </td>
                    <td className={cn("px-3 py-3 text-right font-mono", winners.horas.has(r.branchId) ? "text-amber-600 font-black" : "text-text-main")}>
                      {r.hoursDevPct !== null ? `${r.hoursDevPct.toFixed(1)}%` : <span className="text-text-dim">—</span>}
                      {winners.horas.has(r.branchId) && <T />}
                    </td>
                    <td className={cn("px-3 py-3 text-right font-mono", winners.banderas.has(r.branchId) ? "text-amber-600 font-black" : "text-text-main")}>
                      <span className="inline-flex items-center gap-1 justify-end">
                        <Flag size={10} className={r.redFlags > 0 ? "text-red-500" : "text-text-dim"} />
                        {r.redFlags + r.blackFlags}
                        <span className="text-[8px] text-text-dim">({r.redFlags}R·{r.blackFlags}N)</span>
                      </span>
                      {winners.banderas.has(r.branchId) && <T />}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {total > 0 ? (
                        <span className="inline-flex items-center gap-1 font-black text-amber-500">
                          <Trophy size={14} /> {total}
                        </span>
                      ) : <span className="text-text-dim font-mono">0</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[8px] text-text-dim font-bold uppercase mt-3 opacity-70 leading-relaxed">
            🏆 por indicador: mayor Ventas Netas · menor CMV % · menor Desvío de Horas · menos Banderas (rojas + negras).
            Los mismos criterios que el dashboard individual. R = rojas, N = negras.
          </p>
        </div>
      )}
    </motion.div>
  );
}
