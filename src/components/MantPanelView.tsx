/**
 * SPDX-License-Identifier: Apache-2.0
 * Panel de Control del módulo Mantenimiento (lee de la base de mantenimiento).
 */
import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Loader2, Package, DollarSign, ClipboardList, Wrench } from 'lucide-react';
import { supabaseMant } from '../lib/supabase';
import { cn } from '../lib/utils';

interface Asset { id: string; name: string; branch: string; inactive: boolean; acquisition_cost: string; acquisition_cost_usd: string; }
interface Task { id: string; branch: string; asset_id: string; status: string; }
interface Repair { id: string; branch: string; asset_id: string; total_cost: string; date?: string; description?: string; labor_cost?: string; parts_cost?: string; responsible?: string; }

const fmt = (n: number) => Math.round(n).toLocaleString('es-AR');

export default function MantPanelView() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [valCurrency, setValCurrency] = useState<'ARS' | 'USD'>('ARS');
  // Filtros de la tabla de reparaciones
  const [repMonth, setRepMonth] = useState<string>('all');
  const [repFrom, setRepFrom] = useState<string>('');
  const [repTo, setRepTo] = useState<string>('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Trae TODOS los registros de una tabla paginando de a 1000 (límite de Supabase)
        const getAll = async (table: string, cols: string) => {
          let all: any[] = [];
          let from = 0;
          const step = 1000;
          while (true) {
            const { data, error } = await supabaseMant.from(table).select(cols).range(from, from + step - 1);
            if (error) throw error;
            if (data && data.length > 0) {
              all = all.concat(data);
              if (data.length < step) break;
              from += step;
            } else break;
          }
          return all;
        };
        const [a, t, r] = await Promise.all([
          getAll('activos', 'id, name, branch, inactive, acquisition_cost, acquisition_cost_usd'),
          getAll('tareas', 'id, branch, asset_id, status'),
          getAll('reparaciones', 'id, branch, asset_id, total_cost, date, description, labor_cost, parts_cost, responsible'),
        ]);
        setAssets(a as Asset[]);
        setTasks(t as Task[]);
        setRepairs(r as Repair[]);
      } catch (e: any) {
        console.error('Error cargando datos de mantenimiento:', e);
        setError(e.message || 'No se pudieron cargar los datos de mantenimiento.');
      }
      setLoading(false);
    })();
  }, []);

  const activeAssets = useMemo(() => assets.filter(a => !a.inactive), [assets]);
  const inactiveCount = assets.length - activeAssets.length;

  const totalValue = useMemo(() => {
    return activeAssets.reduce((s, a) => {
      const ars = parseFloat(a.acquisition_cost) || 0;
      const usd = parseFloat(a.acquisition_cost_usd || '0') || 0;
      return s + (valCurrency === 'ARS' ? ars : usd);
    }, 0);
  }, [activeAssets, valCurrency]);

  const pendingTasks = useMemo(() => tasks.filter(t => t.status === 'pendiente' || t.status === 'sin_asignar'), [tasks]);

  // Sucursales con su resumen
  const branchRows = useMemo(() => {
    const branchNames = Array.from(new Set(assets.map(a => a.branch).filter(Boolean))).sort();
    const assetBranchById: Record<string, string> = {};
    assets.forEach(a => { assetBranchById[a.id] = a.branch; });
    return branchNames.map(b => {
      const bAssets = activeAssets.filter(a => a.branch === b);
      const bTasks = pendingTasks.filter(t => (t.branch || assetBranchById[t.asset_id]) === b);
      const bRepairs = repairs.filter(r => (r.branch || assetBranchById[r.asset_id]) === b);
      const value = bAssets.reduce((s, a) => s + (parseFloat(a.acquisition_cost) || 0), 0);
      const repairCost = bRepairs.reduce((s, r) => s + (parseFloat(r.total_cost) || 0), 0);
      return { branch: b, assets: bAssets.length, value, tasks: bTasks.length, repairCost };
    });
  }, [assets, activeAssets, pendingTasks, repairs]);

  // Mapa de activos por id (para mostrar el nombre del bien)
  const assetById = useMemo(() => {
    const m: Record<string, Asset> = {};
    assets.forEach(a => { m[a.id] = a; });
    return m;
  }, [assets]);

  // Meses disponibles según las reparaciones cargadas
  const repMonths = useMemo(() => {
    const ms = Array.from(new Set(repairs.map(r => String(r.date || '').substring(0, 7)).filter(Boolean)));
    return ms.sort().reverse();
  }, [repairs]);

  const mesLabel = (m: string) => {
    if (m === 'all') return 'Todos los meses';
    const [y, mo] = m.split('-');
    const names = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${names[Number(mo) - 1] || mo} ${y}`;
  };

  // Reparaciones filtradas por mes y/o rango de fechas
  const filteredRepairs = useMemo(() => {
    return repairs
      .filter(r => {
        const d = String(r.date || '');
        if (repMonth !== 'all' && d.substring(0, 7) !== repMonth) return false;
        if (repFrom && d < repFrom) return false;
        if (repTo && d > repTo) return false;
        return true;
      })
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }, [repairs, repMonth, repFrom, repTo]);

  const filteredRepairsTotal = useMemo(
    () => filteredRepairs.reduce((s, r) => s + (parseFloat(r.total_cost) || 0), 0),
    [filteredRepairs]
  );

  if (loading) {
    return <div className="py-24 flex justify-center"><Loader2 size={28} className="animate-spin text-brand-500" /></div>;
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
        <p className="text-[11px] font-black text-red-500 uppercase tracking-widest mb-1">Error al cargar mantenimiento</p>
        <p className="text-[10px] text-text-dim font-bold">{error}</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Package size={16} className="text-brand-500" />
            <p className="text-[10px] font-black uppercase text-text-dim tracking-widest">Total Activos</p>
          </div>
          <p className="text-3xl font-black text-text-main">{activeAssets.length}</p>
          <p className="text-[9px] text-text-dim font-bold uppercase mt-1">{inactiveCount} bienes inactivos</p>
        </div>

        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <DollarSign size={16} className="text-emerald-500" />
              <p className="text-[10px] font-black uppercase text-text-dim tracking-widest">Valor de Bienes</p>
            </div>
            <button onClick={() => setValCurrency(c => c === 'ARS' ? 'USD' : 'ARS')}
              className="text-[8px] bg-brand-500/10 text-brand-500 px-2 py-0.5 rounded font-black uppercase hover:bg-brand-500/20 transition-colors">
              Modo {valCurrency === 'ARS' ? 'USD' : 'ARS'}
            </button>
          </div>
          <p className="text-3xl font-black text-text-main">{valCurrency === 'USD' ? 'U$D ' : '$'}{fmt(totalValue)}</p>
          <p className="text-[9px] text-text-dim font-bold uppercase mt-1">Activos en uso</p>
        </div>

        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardList size={16} className="text-amber-500" />
            <p className="text-[10px] font-black uppercase text-text-dim tracking-widest">Tareas Pendientes</p>
          </div>
          <p className="text-3xl font-black text-amber-500">{pendingTasks.length}</p>
          <p className="text-[9px] text-text-dim font-bold uppercase mt-1">Pendientes de revisión</p>
        </div>
      </div>

      {/* Desempeño por sucursal */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border-dim">
          <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest">Desempeño por Sucursal</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-bg-accent/40 border-b border-border-dim">
                <th className="px-5 py-3 text-[10px] font-black uppercase text-text-dim tracking-widest">Sucursal</th>
                <th className="px-5 py-3 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Activos</th>
                <th className="px-5 py-3 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Valor Activos (ARS)</th>
                <th className="px-5 py-3 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Tareas Pend.</th>
                <th className="px-5 py-3 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Gasto Reparaciones</th>
              </tr>
            </thead>
            <tbody>
              {branchRows.map(r => (
                <tr key={r.branch} className="border-b border-border-dim/30 hover:bg-bg-accent/20 transition-colors">
                  <td className="px-5 py-3 text-[11px] font-black text-text-main uppercase">{r.branch}</td>
                  <td className="px-5 py-3 text-center font-mono text-[11px] text-text-dim">{r.assets}</td>
                  <td className="px-5 py-3 text-right font-mono text-[11px] text-emerald-500">${fmt(r.value)}</td>
                  <td className="px-5 py-3 text-center">
                    <span className={cn("inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black",
                      r.tasks > 0 ? "bg-amber-500/15 text-amber-500" : "bg-bg-accent text-text-dim")}>
                      {r.tasks}
                    </span>
                  </td>
                  <td className={cn("px-5 py-3 text-right font-mono text-[11px]", r.repairCost > 0 ? "text-red-400" : "text-text-dim")}>
                    ${fmt(r.repairCost)}
                  </td>
                </tr>
              ))}
              {branchRows.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-[10px] font-black uppercase text-text-dim">Sin activos cargados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reparaciones realizadas y sus costos */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border-dim flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest flex items-center gap-2">
            <Wrench size={14} className="text-brand-500" /> Reparaciones realizadas
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={repMonth} onChange={e => setRepMonth(e.target.value)}
              className="bg-bg-card border border-border-dim rounded px-3 py-1.5 text-[9px] font-black uppercase text-text-main outline-none focus:border-brand-500 cursor-pointer">
              <option value="all">Todos los meses</option>
              {repMonths.map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <span className="text-[8px] font-black uppercase text-text-dim">Desde</span>
              <input type="date" value={repFrom} onChange={e => setRepFrom(e.target.value)}
                className="bg-bg-card border border-border-dim rounded px-2 py-1 text-[9px] font-mono text-text-main outline-none focus:border-brand-500" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[8px] font-black uppercase text-text-dim">Hasta</span>
              <input type="date" value={repTo} onChange={e => setRepTo(e.target.value)}
                className="bg-bg-card border border-border-dim rounded px-2 py-1 text-[9px] font-mono text-text-main outline-none focus:border-brand-500" />
            </div>
            {(repMonth !== 'all' || repFrom || repTo) && (
              <button onClick={() => { setRepMonth('all'); setRepFrom(''); setRepTo(''); }}
                className="text-[8px] font-black uppercase text-brand-500 hover:text-brand-600 px-2 py-1">Limpiar</button>
            )}
          </div>
        </div>
        <div className="px-5 py-2 bg-bg-accent/30 flex items-center justify-between">
          <span className="text-[9px] font-black uppercase text-text-dim">{filteredRepairs.length} reparación(es)</span>
          <span className="text-[11px] font-mono font-black text-red-400">Total: ${fmt(filteredRepairsTotal)}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-bg-accent/40 border-b border-border-dim text-[10px] font-black uppercase text-text-dim tracking-widest">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Bien / Descripción</th>
                <th className="px-4 py-3">Sede</th>
                <th className="px-4 py-3 text-right">M. Obra</th>
                <th className="px-4 py-3 text-right">Repuestos</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredRepairs.map(r => {
                const a = r.asset_id ? assetById[r.asset_id] : null;
                const rBranch = r.branch || (a && a.branch) || '-';
                return (
                  <tr key={r.id} className="border-b border-border-dim/30 hover:bg-bg-accent/20 transition-colors text-[11px]">
                    <td className="px-4 py-2.5 font-mono text-text-dim">{r.date || '—'}</td>
                    <td className="px-4 py-2.5">
                      <p className="font-black text-text-main uppercase">{a?.name || 'Bien'}{r.description ? ` — ${r.description}` : ''}</p>
                      {r.responsible && <p className="text-[9px] text-text-dim">Resp: {r.responsible}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-text-dim uppercase">{rBranch}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-text-dim">${fmt(parseFloat(r.labor_cost || '0') || 0)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-text-dim">${fmt(parseFloat(r.parts_cost || '0') || 0)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-black text-text-main">${fmt(parseFloat(r.total_cost) || 0)}</td>
                  </tr>
                );
              })}
              {filteredRepairs.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-[10px] font-black uppercase text-text-dim">
                  {repairs.length === 0 ? 'No hay reparaciones registradas' : 'No hay reparaciones para el filtro seleccionado'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
