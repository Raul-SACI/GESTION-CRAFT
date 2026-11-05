/**
 * SPDX-License-Identifier: Apache-2.0
 * RRHH · Análisis de horas (gráficas).
 *  1) Comparativo mensual por sucursal: horas Reales (RRHH) vs Planificadas de todas las sucursales.
 *  2) Análisis de una sucursal: horas por mes (totales) y desglose por puesto.
 * Reales: hr_hour_logs.hours_rrhh. Planificadas: hour_budgets (aprobados), suma week1..week5.
 */
import { useState, useEffect, useMemo } from 'react';
import { Loader2, Building2, Briefcase } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { Branch } from '../types';
import { budgetNameToRoleId } from './HrHourControlView';

const ROLE_LABEL: Record<string, string> = {
  encargado: 'Encargado', jefe_cocina: 'Jefe de Cocina', segundo_cocina: 'Segundo de Cocina',
  cocinero: 'Cocinero', caja: 'Caja', barra: 'Barra', mozos: 'Mozos', runners: 'Runners', bacha: 'Bacha',
};
const C_PLAN = '#6366f1'; // indigo
const C_REAL = '#ef4444'; // rojo (brand)
const fmtH = (n: number) => `${Math.round(Number(n) || 0).toLocaleString('es-AR')} h`;
const mesLabel = (m: string) => { const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']; const [y, mm] = m.split('-'); return `${MES[(parseInt(mm, 10) || 1) - 1]} ${String(y).slice(2)}`; };

const axisTick = { fill: 'var(--text-dim)', fontSize: 10, fontWeight: 700 };
const tooltipStyle = { background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderRadius: 8, color: 'var(--text-main)', fontSize: 11 };

type Agg = { planned: number; real: number };

export default function HrHoursAnalyticsView({ branches }: { branches: Branch[] }) {
  const operative = useMemo(() => branches.filter(b => b.id !== 'all' && b.id !== 'virtual'), [branches]);
  const branchName = (id: string) => operative.find(b => b.id === id)?.name || id;

  const [loading, setLoading] = useState(false);
  // byBM[branchId][month] = Agg ; byBMR[branchId][month][roleId] = Agg
  const [byBM, setByBM] = useState<Record<string, Record<string, Agg>>>({});
  const [byBMR, setByBMR] = useState<Record<string, Record<string, Record<string, Agg>>>>({});
  const [months, setMonths] = useState<string[]>([]);

  const [selMonth, setSelMonth] = useState('');
  const [selBranch, setSelBranch] = useState('');

  useEffect(() => {
    const cargar = async () => {
      setLoading(true);
      try {
        const page = 1000;
        // Presupuestos (planificadas). Se toma el presupuesto cargado aunque todavía no
        // esté aprobado: hay un único juego de filas por sucursal+mes (al guardar se
        // reemplaza), así que no hay duplicación.
        const budgets: any[] = [];
        for (let from = 0; from < 200000; from += page) {
          const { data } = await supabase.from('hour_budgets')
            .select('branch_id, month, position_name, position_id, week1, week2, week3, week4, week5, planned_hours, total_hours, status')
            // Orden estable: sin esto la paginación con .range() saltea filas (>1000 por turno).
            .order('branch_id', { ascending: true }).order('month', { ascending: true })
            .order('position_name', { ascending: true }).order('position_id', { ascending: true })
            .range(from, from + page - 1);
          const rows = data || []; budgets.push(...rows);
          if (rows.length < page) break;
        }
        // Horas reales (RRHH)
        const logs: any[] = [];
        for (let from = 0; from < 500000; from += page) {
          const { data } = await supabase.from('hr_hour_logs')
            .select('branch_id, month, position_name, position_id, hours_rrhh, week_number')
            .order('branch_id', { ascending: true }).order('month', { ascending: true })
            .order('week_number', { ascending: true }).order('position_id', { ascending: true })
            .range(from, from + page - 1);
          const rows = data || []; logs.push(...rows);
          if (rows.length < page) break;
        }

        const bm: Record<string, Record<string, Agg>> = {};
        const bmr: Record<string, Record<string, Record<string, Agg>>> = {};
        const mset = new Set<string>();
        const touch = (bid: string, m: string, role: string) => {
          mset.add(m);
          const mm = (bm[bid] ||= {}); (mm[m] ||= { planned: 0, real: 0 });
          const rr = (bmr[bid] ||= {}); const rm = (rr[m] ||= {}); (rm[role] ||= { planned: 0, real: 0 });
          return { tot: mm[m], role: rm[role] };
        };
        budgets.forEach(b => {
          const bid = b.branch_id; const m = b.month; if (!bid || !m) return;
          const role = budgetNameToRoleId(b.position_name || '') || 'otros';
          let sum = 0; for (let w = 1; w <= 5; w++) sum += Number(b[`week${w}`]) || 0;
          if (sum === 0) sum = Number(b.planned_hours) || Number(b.total_hours) || 0;
          const t = touch(bid, m, role); t.tot.planned += sum; t.role.planned += sum;
        });
        logs.forEach(l => {
          const bid = l.branch_id; const m = l.month; if (!bid || !m) return;
          const role = budgetNameToRoleId(l.position_name || '') || budgetNameToRoleId(l.position_id || '') || 'otros';
          const h = Number(l.hours_rrhh) || 0;
          const t = touch(bid, m, role); t.tot.real += h; t.role.real += h;
        });

        const ms = Array.from(mset).sort();
        setByBM(bm); setByBMR(bmr); setMonths(ms);
        setSelMonth(ms[ms.length - 1] || '');
        setSelBranch(prev => prev || operative[0]?.id || '');
      } catch (e) { console.warn('Análisis horas error', e); }
      finally { setLoading(false); }
    };
    cargar();
    // eslint-disable-next-line
  }, [branches]);

  // Chart 1: todas las sucursales en el mes elegido
  const dataPorSucursal = useMemo(() => operative.map(b => {
    const a = byBM[b.id]?.[selMonth] || { planned: 0, real: 0 };
    return { name: branchName(b.id).replace(/^craft\s*/i, ''), Planificadas: Math.round(a.planned), Reales: Math.round(a.real) };
  }).filter(r => r.Planificadas || r.Reales), [operative, byBM, selMonth]);

  // Chart 2: una sucursal por mes (totales)
  const dataPorMes = useMemo(() => months.map(m => {
    const a = byBM[selBranch]?.[m] || { planned: 0, real: 0 };
    return { name: mesLabel(m), Planificadas: Math.round(a.planned), Reales: Math.round(a.real) };
  }).filter(r => r.Planificadas || r.Reales), [months, byBM, selBranch]);

  // Chart 3: una sucursal + un mes, por puesto
  const dataPorPuesto = useMemo(() => {
    const rm: Record<string, Agg> = byBMR[selBranch]?.[selMonth] || {};
    return Object.entries(rm).map(([role, a]) => ({
      name: ROLE_LABEL[role] || (role === 'otros' ? 'Otros' : role),
      Planificadas: Math.round(a.planned), Reales: Math.round(a.real),
    })).filter(r => r.Planificadas || r.Reales).sort((a, b) => b.Reales - a.Reales);
  }, [byBMR, selBranch, selMonth]);

  const totMesSuc = dataPorSucursal.reduce((s, r) => ({ p: s.p + r.Planificadas, r: s.r + r.Reales }), { p: 0, r: 0 });

  if (loading) return <div className="py-16 text-center"><Loader2 size={24} className="animate-spin text-brand-500 mx-auto" /><p className="text-[10px] font-black uppercase text-text-dim mt-2">Cargando análisis…</p></div>;

  const sel = 'bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main font-bold uppercase outline-none focus:border-brand-500';

  return (
    <div className="space-y-5">
      {/* Comparativo mensual por sucursal */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-brand-500" />
            <h3 className="text-[12px] font-black uppercase tracking-wider text-text-main">Horas por sucursal · {selMonth ? mesLabel(selMonth) : '—'}</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase text-text-dim">Mes</span>
            <select value={selMonth} onChange={e => setSelMonth(e.target.value)} className={sel}>
              {months.map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
            </select>
          </div>
        </div>
        {dataPorSucursal.length === 0 ? (
          <p className="text-center text-[11px] text-text-dim italic py-10">Sin horas cargadas para este mes.</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={dataPorSucursal} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                <XAxis dataKey="name" tick={axisTick} />
                <YAxis tick={axisTick} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => fmtH(v)} cursor={{ fill: 'var(--bg-accent)', opacity: 0.4 }} />
                <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                <Bar dataKey="Planificadas" fill={C_PLAN} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Reales" fill={C_REAL} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex justify-end gap-5 text-[11px] font-bold mt-2">
              <span className="text-text-dim">Total planificadas: <span className="font-mono" style={{ color: C_PLAN }}>{fmtH(totMesSuc.p)}</span></span>
              <span className="text-text-dim">Total reales: <span className="font-mono" style={{ color: C_REAL }}>{fmtH(totMesSuc.r)}</span></span>
              <span className="text-text-dim">Desvío: <span className={cn2(totMesSuc.r - totMesSuc.p)}>{totMesSuc.r - totMesSuc.p >= 0 ? '+' : ''}{fmtH(totMesSuc.r - totMesSuc.p)}</span></span>
            </div>
          </>
        )}
      </div>

      {/* Análisis de una sucursal */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Briefcase size={16} className="text-brand-500" />
            <h3 className="text-[12px] font-black uppercase tracking-wider text-text-main">Análisis por sucursal</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase text-text-dim">Sucursal</span>
            <select value={selBranch} onChange={e => setSelBranch(e.target.value)} className={sel}>
              {operative.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>

        {/* Totales por mes */}
        <p className="text-[9px] font-black uppercase tracking-widest text-text-dim mb-2">Horas totales por mes</p>
        {dataPorMes.length === 0 ? (
          <p className="text-center text-[11px] text-text-dim italic py-8">Sin datos para esta sucursal.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={dataPorMes} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis dataKey="name" tick={axisTick} />
              <YAxis tick={axisTick} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => fmtH(v)} />
              <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
              <Line type="monotone" dataKey="Planificadas" stroke={C_PLAN} strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Reales" stroke={C_REAL} strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {/* Por puesto en el mes elegido */}
        <div className="flex items-center justify-between flex-wrap gap-2 mt-6 mb-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-text-dim">Horas por puesto · {selMonth ? mesLabel(selMonth) : '—'}</p>
        </div>
        {dataPorPuesto.length === 0 ? (
          <p className="text-center text-[11px] text-text-dim italic py-8">Sin horas por puesto para esta sucursal en {selMonth ? mesLabel(selMonth) : 'el mes'}.</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={Math.max(220, dataPorPuesto.length * 46)}>
              <BarChart data={dataPorPuesto} layout="vertical" margin={{ top: 4, right: 12, left: 10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" horizontal={false} />
                <XAxis type="number" tick={axisTick} />
                <YAxis type="category" dataKey="name" tick={axisTick} width={110} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => fmtH(v)} cursor={{ fill: 'var(--bg-accent)', opacity: 0.4 }} />
                <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                <Bar dataKey="Planificadas" fill={C_PLAN} radius={[0, 3, 3, 0]} />
                <Bar dataKey="Reales" fill={C_REAL} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-[11px] border-collapse">
                <thead><tr className="text-text-dim">
                  <th className="p-2 text-left text-[9px] font-black uppercase tracking-widest">Puesto</th>
                  <th className="p-2 text-right text-[9px] font-black uppercase tracking-widest">Planificadas</th>
                  <th className="p-2 text-right text-[9px] font-black uppercase tracking-widest">Reales</th>
                  <th className="p-2 text-right text-[9px] font-black uppercase tracking-widest">Desvío</th>
                </tr></thead>
                <tbody>
                  {dataPorPuesto.map(r => (
                    <tr key={r.name} className="border-t border-border-dim/30">
                      <td className="p-2 font-bold text-text-main">{r.name}</td>
                      <td className="p-2 text-right font-mono text-text-dim">{fmtH(r.Planificadas)}</td>
                      <td className="p-2 text-right font-mono text-text-dim">{fmtH(r.Reales)}</td>
                      <td className={cn2(r.Reales - r.Planificadas) + ' p-2 text-right font-mono font-bold'}>{r.Reales - r.Planificadas >= 0 ? '+' : ''}{fmtH(r.Reales - r.Planificadas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function cn2(dev: number) { return dev > 0.5 ? 'text-red-500' : dev < -0.5 ? 'text-emerald-500' : 'text-text-dim'; }
