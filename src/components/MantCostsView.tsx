/**
 * SPDX-License-Identifier: Apache-2.0
 * Costos de Mantenimiento — gastos de reparaciones (solo lectura).
 */
import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Loader2, DollarSign } from 'lucide-react';
import { supabaseMant } from '../lib/supabase';
import { cn } from '../lib/utils';

interface Asset { id: string; name: string; branch: string; }
interface Repair {
  id: string; asset_id: string | null; branch: string; description: string; date: string;
  responsible: string; parts: string; labor_cost: string; parts_cost: string; total_cost: string; pay_type: string;
}

const fmt = (n: number) => Math.round(n).toLocaleString('es-AR');
const PAY_LABELS: Record<string, string> = {
  caja_chica: 'Caja Chica (Técnico interno)',
  sucursal: 'Cobro en Sucursal (Tercerizado)',
  tesoreria: 'Cobro en Tesorería (Administración)',
};
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function MantCostsView() {
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fBranch, setFBranch] = useState('');
  const [fPayType, setFPayType] = useState('');
  const [fMonth, setFMonth] = useState('');

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const getAll = async (table: string, cols: string) => {
        let all: any[] = []; let from = 0; const step = 1000;
        while (true) {
          const { data, error } = await supabaseMant.from(table).select(cols).range(from, from + step - 1);
          if (error) throw error;
          if (data && data.length > 0) { all = all.concat(data); if (data.length < step) break; from += step; } else break;
        }
        return all;
      };
      const [r, a] = await Promise.all([
        getAll('reparaciones', '*'),
        getAll('activos', 'id, name, branch'),
      ]);
      setRepairs(r as Repair[]);
      setAssets(a as Asset[]);
      const { data: cfg } = await supabaseMant.from('configuracion').select('*').eq('id', 'branches').maybeSingle();
      if (cfg && cfg.data) setBranches(cfg.data);
    } catch (e: any) {
      console.error('Error cargando costos:', e);
      setError(e.message || 'No se pudieron cargar los costos.');
    }
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const assetById = useMemo(() => { const m: Record<string, Asset> = {}; assets.forEach(a => { m[a.id] = a; }); return m; }, [assets]);

  const matches = (r: Repair) => {
    const rBranch = r.branch || (r.asset_id ? assetById[r.asset_id]?.branch : '') || '';
    if (fBranch && rBranch !== fBranch) return false;
    if (fPayType && r.pay_type !== fPayType) return false;
    if (fMonth !== '' && new Date(r.date).getMonth() !== parseInt(fMonth)) return false;
    return true;
  };

  const filtered = useMemo(() => repairs.filter(matches), [repairs, fBranch, fPayType, fMonth, assetById]);
  const total = useMemo(() => filtered.reduce((s, r) => s + (parseFloat(r.total_cost) || 0), 0), [filtered]);

  if (loading) return <div className="py-24 flex justify-center"><Loader2 size={28} className="animate-spin text-brand-500" /></div>;
  if (error) return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
      <p className="text-[11px] font-black text-red-500 uppercase tracking-widest mb-1">Error al cargar costos</p>
      <p className="text-[10px] text-text-dim font-bold">{error}</p>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Total */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-8 text-center">
        <DollarSign size={28} className="text-brand-500 mx-auto mb-2" />
        <p className="text-[10px] font-black uppercase text-text-dim tracking-widest mb-1">Gastos Totales de Mantenimiento</p>
        <p className="text-4xl font-black text-text-main">${fmt(total)}</p>
        <p className="text-[9px] text-text-dim font-bold uppercase mt-2">Según los filtros actuales · {filtered.length} reparación(es)</p>
      </div>

      {/* Filtros */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[150px]">
          <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Sede</label>
          <select value={fBranch} onChange={e => setFBranch(e.target.value)}
            className="w-full mt-1 bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none">
            <option value="">Todas las sedes</option>
            {branches.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Medio de pago</label>
          <select value={fPayType} onChange={e => setFPayType(e.target.value)}
            className="w-full mt-1 bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none">
            <option value="">Cualquier medio</option>
            {Object.entries(PAY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[130px]">
          <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Mes</label>
          <select value={fMonth} onChange={e => setFMonth(e.target.value)}
            className="w-full mt-1 bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none">
            <option value="">Cualquier mes</option>
            {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Historial de reparaciones */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border-dim">
          <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest">Historial de Reparaciones</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-bg-accent/40 border-b border-border-dim text-[10px] font-black uppercase text-text-dim tracking-widest">
                <th className="px-4 py-3">Activo / Descripción</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Sede</th>
                <th className="px-4 py-3">Pago</th>
                <th className="px-4 py-3 text-right">M. Obra</th>
                <th className="px-4 py-3 text-right">Repuestos</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice().reverse().map(r => {
                const a = r.asset_id ? assetById[r.asset_id] : null;
                const rBranch = r.branch || (a && a.branch) || '-';
                return (
                  <tr key={r.id} className="border-b border-border-dim/30 hover:bg-bg-accent/20 transition-colors text-[11px]">
                    <td className="px-4 py-2.5">
                      <p className="font-black text-text-main uppercase">{a?.name || 'Bien'} — {r.description}</p>
                      <p className="text-[9px] text-text-dim">Resp: {r.responsible || '-'} · {r.parts || 'Sin detalles'}</p>
                    </td>
                    <td className="px-4 py-2.5 text-text-dim font-mono">{r.date}</td>
                    <td className="px-4 py-2.5 text-text-dim uppercase">{rBranch}</td>
                    <td className="px-4 py-2.5 text-text-dim">{PAY_LABELS[r.pay_type]?.split(' (')[0] || r.pay_type || '-'}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-text-dim">${fmt(parseFloat(r.labor_cost) || 0)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-text-dim">${fmt(parseFloat(r.parts_cost) || 0)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-black text-text-main">${fmt(parseFloat(r.total_cost) || 0)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-[10px] font-black uppercase text-text-dim">No hay reparaciones registradas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
