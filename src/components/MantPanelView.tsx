/**
 * SPDX-License-Identifier: Apache-2.0
 * Panel de Control del módulo Mantenimiento (lee de la base de mantenimiento).
 */
import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Loader2, Package, DollarSign, ClipboardList } from 'lucide-react';
import { supabaseMant } from '../lib/supabase';
import { cn } from '../lib/utils';

interface Asset { id: string; name: string; branch: string; inactive: boolean; acquisition_cost: string; acquisition_cost_usd: string; }
interface Task { id: string; branch: string; asset_id: string; status: string; }
interface Repair { id: string; branch: string; asset_id: string; total_cost: string; }

const fmt = (n: number) => Math.round(n).toLocaleString('es-AR');

export default function MantPanelView() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [valCurrency, setValCurrency] = useState<'ARS' | 'USD'>('ARS');

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
          getAll('reparaciones', 'id, branch, asset_id, total_cost'),
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
    </motion.div>
  );
}
