/**
 * SPDX-License-Identifier: Apache-2.0
 * Plan Preventivo de Mantenimiento (CRUD sobre la base de mantenimiento).
 */
import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Loader2, Plus, Trash2, Pencil, X, RefreshCw, CalendarClock } from 'lucide-react';
import { supabaseMant } from '../lib/supabase';
import { cn } from '../lib/utils';

interface Asset { id: string; name: string; branch: string; }
interface Maint {
  id: string; asset_id: string | null; branch: string; maint_type: string;
  description: string; next_date: string; interval_days: number; done: boolean;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

const emptyMaint = (branch: string): Partial<Maint> => ({
  asset_id: '', branch, maint_type: 'Limpieza profunda', description: '', next_date: todayISO(), interval_days: 30, done: false,
});

export default function MantPreventiveView() {
  const [maints, setMaints] = useState<Maint[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fBranch, setFBranch] = useState('');
  const [editing, setEditing] = useState<Partial<Maint> | null>(null);

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
      const [m, a] = await Promise.all([
        getAll('mantenimientos', '*'),
        getAll('activos', 'id, name, branch'),
      ]);
      setMaints(m as Maint[]);
      setAssets(a as Asset[]);
      const { data: cfg } = await supabaseMant.from('configuracion').select('*').eq('id', 'branches').maybeSingle();
      if (cfg && cfg.data) setBranches(cfg.data);
    } catch (e: any) {
      console.error('Error cargando plan preventivo:', e);
      setError(e.message || 'No se pudo cargar el plan preventivo.');
    }
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const assetById = useMemo(() => { const map: Record<string, Asset> = {}; assets.forEach(a => { map[a.id] = a; }); return map; }, [assets]);
  const filtered = useMemo(() => fBranch ? maints.filter(m => m.branch === fBranch) : maints, [maints, fBranch]);

  const saveMaint = async () => {
    if (!editing) return;
    if (!editing.maint_type || !editing.branch) { alert('Completá el tipo de mantenimiento y la sucursal.'); return; }
    setSaving(true);
    try {
      const payload = {
        id: editing.id || uid(),
        asset_id: editing.asset_id || null,
        branch: editing.branch || '',
        maint_type: editing.maint_type || '',
        description: editing.description || '',
        next_date: editing.next_date || todayISO(),
        interval_days: Number(editing.interval_days) || 30,
        done: editing.done || false,
      };
      const { error } = await supabaseMant.from('mantenimientos').upsert(payload);
      if (error) throw error;
      setEditing(null);
      await loadAll();
    } catch (e: any) { alert('Error al guardar: ' + (e.message || e)); }
    setSaving(false);
  };

  const renew = async (m: Maint) => {
    try {
      const { error } = await supabaseMant.from('mantenimientos').update({ next_date: addDays(m.interval_days), done: false }).eq('id', m.id);
      if (error) throw error;
      await loadAll();
    } catch (e: any) { alert('Error al renovar: ' + (e.message || e)); }
  };

  const deleteMaint = async (m: Maint) => {
    if (!window.confirm('¿Eliminar este plan preventivo? Esta acción no se puede deshacer.')) return;
    try {
      const { error } = await supabaseMant.from('mantenimientos').delete().eq('id', m.id);
      if (error) throw error;
      await loadAll();
    } catch (e: any) { alert('Error al eliminar: ' + (e.message || e)); }
  };

  if (loading) return <div className="py-24 flex justify-center"><Loader2 size={28} className="animate-spin text-brand-500" /></div>;
  if (error) return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
      <p className="text-[11px] font-black text-red-500 uppercase tracking-widest mb-1">Error al cargar plan preventivo</p>
      <p className="text-[10px] text-text-dim font-bold">{error}</p>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 flex flex-wrap gap-3 items-center">
        <select value={fBranch} onChange={e => setFBranch(e.target.value)}
          className="bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none">
          <option value="">Todas las sucursales</option>
          {branches.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <span className="text-[10px] font-black text-text-dim uppercase tracking-widest">{filtered.length} planes</span>
        <button onClick={() => setEditing(emptyMaint(branches[0] || ''))}
          className="ml-auto bg-brand-500 text-white px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all flex items-center gap-2">
          <Plus size={14} /> Nuevo plan preventivo
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(m => {
          const a = m.asset_id ? assetById[m.asset_id] : null;
          const isLate = !m.done && new Date(m.next_date) < new Date(todayISO());
          const borderColor = m.done ? '#10b981' : (isLate ? '#ef4444' : '#f59e0b');
          return (
            <div key={m.id} className={cn("bg-bg-sidebar border border-border-dim rounded-xl p-4", m.done && "opacity-60")}
              style={{ borderLeftWidth: '3px', borderLeftColor: borderColor }}>
              <div className="flex justify-between items-start mb-2">
                <span className="text-[8px] font-black uppercase text-text-dim tracking-widest">{m.branch}</span>
                <span className={cn("text-[8px] font-black uppercase", m.done ? "text-emerald-500" : isLate ? "text-red-500" : "text-amber-500")}>
                  {m.done ? 'Hecho' : isLate ? 'Vencido' : 'Pendiente'}
                </span>
              </div>
              <h4 className="text-[12px] font-black text-text-main uppercase mb-1">{m.maint_type}</h4>
              {m.description && <p className="text-[10px] text-text-dim mb-2 line-clamp-2">{m.description}</p>}
              {a && (
                <div className="bg-bg-accent/40 border border-border-dim rounded p-2 mb-3">
                  <p className="text-[8px] text-text-dim font-black uppercase">Bien afectado</p>
                  <p className="text-[10px] font-bold text-text-main truncate">{a.name}</p>
                </div>
              )}
              <div className="flex justify-between items-end mb-3">
                <div>
                  <p className="text-[8px] text-text-dim font-black uppercase tracking-widest">Próxima fecha</p>
                  <p className="text-[12px] font-mono font-black text-text-main">{m.next_date}</p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] text-text-dim font-black uppercase tracking-widest">Intervalo</p>
                  <p className="text-[11px] font-bold text-text-dim">{m.interval_days} días</p>
                </div>
              </div>
              <div className="flex gap-2 pt-3 border-t border-border-dim">
                <button onClick={() => renew(m)} title="Renovar (avanza la próxima fecha según el intervalo)"
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-bg-accent text-text-main rounded text-[9px] font-black uppercase hover:bg-bg-accent/70 transition-all">
                  <RefreshCw size={12} /> Renovar
                </button>
                <button onClick={() => setEditing({ ...m })} title="Editar" className="px-3 py-1.5 bg-bg-accent text-text-dim rounded hover:text-brand-500 transition-colors"><Pencil size={13} /></button>
                <button onClick={() => deleteMaint(m)} title="Eliminar" className="px-3 py-1.5 bg-bg-accent text-text-dim rounded hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full py-16 text-center text-[10px] font-black uppercase text-text-dim">No hay planes preventivos cargados</div>
        )}
      </div>

      {/* Modal alta/edición */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !saving && setEditing(null)}>
          <div className="bg-bg-card border border-border-dim rounded-xl max-w-xl w-full max-h-[88vh] overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border-dim">
              <h3 className="text-sm font-black uppercase text-text-main tracking-wide flex items-center gap-2">
                <CalendarClock size={16} className="text-brand-500" /> {editing.id ? 'Editar plan preventivo' : 'Nuevo plan preventivo'}
              </h3>
              <button onClick={() => setEditing(null)} className="p-1.5 text-text-dim hover:text-text-main"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sucursal *">
                  <select value={editing.branch || ''} onChange={e => setEditing({ ...editing, branch: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500">
                    <option value="">Seleccionar...</option>
                    {branches.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </Field>
                <Field label="Bien afectado (opcional)">
                  <select value={editing.asset_id || ''} onChange={e => setEditing({ ...editing, asset_id: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500">
                    <option value="">Ninguno (general)</option>
                    {assets.filter(a => !editing.branch || a.branch === editing.branch).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Tipo de mantenimiento *"><input value={editing.maint_type || ''} onChange={e => setEditing({ ...editing, maint_type: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500" /></Field>
              <Field label="Descripción"><textarea value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500 min-h-[60px]" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Próxima fecha"><input type="date" value={editing.next_date || ''} onChange={e => setEditing({ ...editing, next_date: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500" /></Field>
                <Field label="Intervalo (días)"><input type="number" value={editing.interval_days ?? 30} onChange={e => setEditing({ ...editing, interval_days: parseInt(e.target.value) || 0 })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500" /></Field>
              </div>
              {editing.id && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editing.done || false} onChange={e => setEditing({ ...editing, done: e.target.checked })} className="w-4 h-4 accent-brand-500" />
                  <span className="text-[10px] font-black uppercase text-text-dim">Marcar como hecho</span>
                </label>
              )}
            </div>
            <div className="p-4 border-t border-border-dim flex gap-2 justify-end">
              <button onClick={() => setEditing(null)} disabled={saving} className="px-4 py-2 bg-bg-accent text-text-dim rounded-lg text-[10px] font-black uppercase tracking-widest hover:text-text-main">Cancelar</button>
              <button onClick={saveMaint} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 disabled:opacity-60">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">{label}</label>
      {children}
    </div>
  );
}
