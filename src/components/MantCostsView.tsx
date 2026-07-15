/**
 * SPDX-License-Identifier: Apache-2.0
 * Costos de Mantenimiento — gastos de reparaciones (solo lectura).
 */
import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Loader2, DollarSign, Plus } from 'lucide-react';
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

export default function MantCostsView({ currentUserRole, currentUserName, canEdit }: { currentUserRole?: string; currentUserName?: string; canEdit?: boolean }) {
  // Puede registrar gastos: el admin siempre, o cualquier usuario cuyo rol tenga "Costos" en modo EDITAR
  const puedeRegistrar = String(currentUserRole || '').toLowerCase() === 'administrador' || canEdit === true;
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fBranch, setFBranch] = useState('');
  const [fPayType, setFPayType] = useState('');
  const [fMonth, setFMonth] = useState('');

  // Formulario de nuevo gasto
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const emptyForm = { asset_id: '', branch: '', description: '', date: new Date().toISOString().split('T')[0], responsible: '', parts: '', labor_cost: '', parts_cost: '', pay_type: 'caja_chica' };
  const [form, setForm] = useState(emptyForm);

  const guardarGasto = async () => {
    if (!puedeRegistrar) { alert('No tenés permiso para registrar gastos. Pedile al administrador que habilite "Costos" en modo editar para tu rol.'); return; }
    if (!form.description.trim()) { alert('La descripción es obligatoria.'); return; }
    if (!form.branch) { alert('Elegí la sucursal.'); return; }
    const labor = parseFloat(form.labor_cost) || 0;
    const parts = parseFloat(form.parts_cost) || 0;
    const total = labor + parts;
    if (total <= 0) { alert('Cargá al menos un costo (mano de obra o repuestos).'); return; }
    setSaving(true);
    try {
      // Los ids de esta tabla son cadenas cortas tipo "jkkm0x3h" (no UUID). Generamos uno igual.
      const genId = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
      const payload = {
        id: genId(),
        asset_id: form.asset_id || null, // null = gasto general (no atado a un bien)
        branch: form.branch,
        description: form.description.trim(),
        date: form.date,
        responsible: form.responsible.trim() || (currentUserName || ''),
        parts: form.parts.trim(),
        labor_cost: String(labor),
        parts_cost: String(parts),
        total_cost: String(total),
        pay_type: form.pay_type,
      };
      const { error } = await supabaseMant.from('reparaciones').insert([payload]);
      if (error) throw error;
      setShowForm(false);
      setForm(emptyForm);
      await loadAll();
      alert('Gasto registrado correctamente.');
    } catch (e: any) {
      const msg = String(e.message || e);
      if (msg.toLowerCase().includes('row-level security')) {
        alert('No se pudo guardar por seguridad de la base (RLS).\n\nHay que desactivar RLS en la tabla "reparaciones" de la base de mantenimiento. Avisale al administrador del sistema.');
      } else {
        alert('Error al registrar el gasto: ' + msg);
      }
    } finally {
      setSaving(false);
    }
  };

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
      {/* Botón registrar gasto (solo administración) */}
      {puedeRegistrar && (
        <div className="flex justify-end">
          <button onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-black uppercase text-[10px] tracking-widest px-4 py-2.5 rounded-lg transition-colors">
            <Plus size={15} /> {showForm ? 'Cerrar' : 'Registrar gasto'}
          </button>
        </div>
      )}

      {/* Formulario de nuevo gasto */}
      {puedeRegistrar && showForm && (
        <div className="bg-bg-sidebar border border-brand-500/40 rounded-xl p-5 space-y-4">
          <h3 className="text-[11px] font-black uppercase text-brand-500 tracking-widest">Registrar gasto de mantenimiento</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Descripción *</label>
              <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Ej: Cambio de foco en el salón"
                className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-xs text-text-main outline-none focus:border-brand-500 uppercase" />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Fecha</label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-xs font-mono text-text-main outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Sucursal *</label>
              <select value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })}
                className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-xs text-text-main outline-none focus:border-brand-500 uppercase">
                <option value="">Elegí una sucursal</option>
                {branches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Bien (opcional)</label>
              <select value={form.asset_id} onChange={e => setForm({ ...form, asset_id: e.target.value })}
                className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-xs text-text-main outline-none focus:border-brand-500 uppercase">
                <option value="">Gasto general (sin bien)</option>
                {assets
                  .filter(a => !form.branch || a.branch === form.branch)
                  .map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Tipo de pago</label>
              <select value={form.pay_type} onChange={e => setForm({ ...form, pay_type: e.target.value })}
                className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-xs text-text-main outline-none focus:border-brand-500">
                {Object.entries(PAY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Responsable</label>
              <input type="text" value={form.responsible} onChange={e => setForm({ ...form, responsible: e.target.value })}
                placeholder={currentUserName || 'Quién realizó el gasto'}
                className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-xs text-text-main outline-none focus:border-brand-500 uppercase" />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Mano de obra ($)</label>
              <input type="number" value={form.labor_cost} onChange={e => setForm({ ...form, labor_cost: e.target.value })}
                placeholder="0"
                className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-xs font-mono text-text-main outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Repuestos ($)</label>
              <input type="number" value={form.parts_cost} onChange={e => setForm({ ...form, parts_cost: e.target.value })}
                placeholder="0"
                className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-xs font-mono text-text-main outline-none focus:border-brand-500" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Detalle de repuestos (opcional)</label>
              <input type="text" value={form.parts} onChange={e => setForm({ ...form, parts: e.target.value })}
                placeholder="Ej: 1 foco LED 12W"
                className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-xs text-text-main outline-none focus:border-brand-500 uppercase" />
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] font-mono font-black text-text-main">
              Total: ${fmt((parseFloat(form.labor_cost) || 0) + (parseFloat(form.parts_cost) || 0))}
            </span>
            <div className="flex gap-2">
              <button onClick={() => { setShowForm(false); setForm(emptyForm); }}
                className="text-[10px] font-black uppercase text-text-dim border border-border-dim rounded px-3 py-2 hover:bg-bg-accent/40">Cancelar</button>
              <button onClick={guardarGasto} disabled={saving}
                className="text-[10px] font-black uppercase bg-emerald-500 hover:bg-emerald-600 text-white rounded px-4 py-2 disabled:opacity-50">
                {saving ? 'Guardando…' : 'Guardar gasto'}
              </button>
            </div>
          </div>
        </div>
      )}

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
