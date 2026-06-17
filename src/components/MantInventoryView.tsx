/**
 * SPDX-License-Identifier: Apache-2.0
 * Inventario de activos del módulo Mantenimiento (CRUD sobre la base de mantenimiento).
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { Loader2, Plus, Search, Trash2, Pencil, QrCode, X, Package } from 'lucide-react';
import QRCode from 'qrcode';
import { supabaseMant } from '../lib/supabase';
import { cn } from '../lib/utils';

interface Asset {
  id: string; name: string; category: string; branch: string; location: string;
  asset_brand: string; asset_model: string; asset_serial: string;
  acquisition_cost: string; acquisition_cost_usd: string; added_date: string;
  notes: string; inactive: boolean; inactive_date: string | null; qr_code: string; image_url: string;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = (n: number | string) => (parseFloat(n as string) || 0).toLocaleString('es-AR');
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

const emptyForm = (branch: string): Partial<Asset> => ({
  name: '', category: '', branch, location: '', asset_brand: '', asset_model: '',
  asset_serial: '', acquisition_cost: '', acquisition_cost_usd: '', added_date: todayISO(),
  notes: '', image_url: '',
});

// QR como imagen (canvas)
function QRImg({ value, size = 180 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) {
      QRCode.toCanvas(ref.current, value, { width: size, margin: 2, color: { dark: '#1a1a1a', light: '#ffffff' } }, (e) => { if (e) console.error(e); });
    }
  }, [value, size]);
  return <canvas ref={ref} className="rounded-lg border border-border-dim block" />;
}

export default function MantInventoryView() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [categories, setCategories] = useState<Record<string, string[]>>({});
  const [locations, setLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Filtros
  const [search, setSearch] = useState('');
  const [fBranch, setFBranch] = useState('');
  const [fLocation, setFLocation] = useState('');
  const [fStatus, setFStatus] = useState('todos');

  // Modales
  const [editing, setEditing] = useState<Partial<Asset> | null>(null);
  const [qrAsset, setQrAsset] = useState<Asset | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      // Activos paginados (Supabase corta en 1000)
      let all: any[] = []; let from = 0; const step = 1000;
      while (true) {
        const { data, error } = await supabaseMant.from('activos').select('*').range(from, from + step - 1);
        if (error) throw error;
        if (data && data.length > 0) { all = all.concat(data); if (data.length < step) break; from += step; } else break;
      }
      setAssets(all as Asset[]);
      // Configuración (branches, categories, locations)
      const { data: cfg } = await supabaseMant.from('configuracion').select('*');
      (cfg || []).forEach((c: any) => {
        if (c.id === 'branches') setBranches(c.data || []);
        if (c.id === 'categories') setCategories(c.data || {});
        if (c.id === 'locations') setLocations(c.data || []);
      });
    } catch (e: any) {
      console.error('Error cargando inventario:', e);
      setError(e.message || 'No se pudo cargar el inventario.');
    }
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return assets.filter(a => {
      if (fBranch && a.branch !== fBranch) return false;
      if (fLocation && a.location !== fLocation) return false;
      if (fStatus === 'activo' && a.inactive) return false;
      if (fStatus === 'inactivo' && !a.inactive) return false;
      if (q) {
        const hay = `${a.name} ${a.notes} ${a.category} ${a.asset_serial} ${a.asset_brand} ${a.asset_model}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [assets, search, fBranch, fLocation, fStatus]);

  // Lista plana de categorías (de todos los grupos)
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    Object.values(categories).forEach((arr: string[]) => (arr || []).forEach(c => set.add(c)));
    return Array.from(set).sort();
  }, [categories]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editing) {
      const reader = new FileReader();
      reader.onload = (ev) => setEditing({ ...editing, image_url: ev.target?.result as string });
      reader.readAsDataURL(file);
    }
  };

  const saveAsset = async () => {
    if (!editing) return;
    if (!editing.category || !editing.name || !editing.branch) {
      alert('Completá los campos obligatorios: Categoría, Nombre y Sucursal.');
      return;
    }
    setSaving(true);
    try {
      const isNew = !editing.id;
      const payload = {
        id: editing.id || uid(),
        name: editing.name || '',
        category: editing.category || 'General',
        branch: editing.branch || '',
        location: editing.location || '',
        asset_brand: editing.asset_brand || '',
        asset_model: editing.asset_model || '',
        asset_serial: editing.asset_serial || '',
        acquisition_cost: editing.acquisition_cost || '0',
        acquisition_cost_usd: editing.acquisition_cost_usd || '0',
        added_date: editing.added_date || todayISO(),
        notes: editing.notes || '',
        inactive: editing.inactive || false,
        inactive_date: editing.inactive_date || null,
        qr_code: editing.qr_code || `MN-${uid().toUpperCase()}`,
        image_url: editing.image_url || '',
      };
      const { error } = await supabaseMant.from('activos').upsert(payload);
      if (error) throw error;
      setEditing(null);
      await loadAll();
    } catch (e: any) {
      alert('Error al guardar: ' + (e.message || e));
    }
    setSaving(false);
  };

  const deleteAsset = async (a: Asset) => {
    if (!window.confirm(`¿Eliminar el activo "${a.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      const { error } = await supabaseMant.from('activos').delete().eq('id', a.id);
      if (error) throw error;
      await loadAll();
    } catch (e: any) {
      alert('Error al eliminar: ' + (e.message || e));
    }
  };

  if (loading) return <div className="py-24 flex justify-center"><Loader2 size={28} className="animate-spin text-brand-500" /></div>;
  if (error) return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
      <p className="text-[11px] font-black text-red-500 uppercase tracking-widest mb-1">Error al cargar inventario</p>
      <p className="text-[10px] text-text-dim font-bold">{error}</p>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Filtros */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-[2] min-w-[220px]">
          <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Buscar bien</label>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={14} />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre, notas, categoría, serie..."
              className="w-full bg-bg-accent border border-border-dim rounded-full pl-9 pr-4 py-2 text-[11px] text-text-main outline-none focus:border-brand-500" />
          </div>
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Sede</label>
          <select value={fBranch} onChange={e => setFBranch(e.target.value)}
            className="w-full mt-1 bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none">
            <option value="">Todas las sedes</option>
            {branches.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Ubicación</label>
          <select value={fLocation} onChange={e => setFLocation(e.target.value)}
            className="w-full mt-1 bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none">
            <option value="">Todas</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="min-w-[120px]">
          <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Estado</label>
          <select value={fStatus} onChange={e => setFStatus(e.target.value)}
            className="w-full mt-1 bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none">
            <option value="todos">Todos</option>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
          </select>
        </div>
        <button onClick={() => setEditing(emptyForm(branches[0] || ''))}
          className="bg-brand-500 text-white px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all flex items-center gap-2">
          <Plus size={14} /> Nuevo activo
        </button>
      </div>

      <p className="text-[10px] font-black text-text-dim uppercase tracking-widest px-1">{filtered.length} activos encontrados</p>

      {/* Tabla compacta */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-bg-accent/40 border-b border-border-dim text-[10px] font-black uppercase text-text-dim tracking-widest">
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Sucursal</th>
                <th className="px-4 py-3">Ubicación</th>
                <th className="px-4 py-3">Marca / Modelo</th>
                <th className="px-4 py-3 text-right">Costo (ARS)</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id} className={cn("border-b border-border-dim/30 hover:bg-bg-accent/20 transition-colors text-[11px]", a.inactive && "opacity-50")}>
                  <td className="px-4 py-2.5 font-black text-text-main uppercase">{a.name}</td>
                  <td className="px-4 py-2.5 text-text-dim uppercase">{a.category}</td>
                  <td className="px-4 py-2.5 text-text-dim uppercase">{a.branch}</td>
                  <td className="px-4 py-2.5 text-text-dim uppercase">{a.location || '-'}</td>
                  <td className="px-4 py-2.5 text-text-dim">{[a.asset_brand, a.asset_model].filter(Boolean).join(' / ') || '-'}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-text-main">${fmt(a.acquisition_cost)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={cn("text-[8px] font-black uppercase px-2 py-0.5 rounded", a.inactive ? "bg-text-dim/10 text-text-dim" : "bg-emerald-500/10 text-emerald-500")}>
                      {a.inactive ? 'Inactivo' : 'Activo'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setQrAsset(a)} title="Ver QR" className="p-1.5 text-text-dim hover:text-brand-500 transition-colors"><QrCode size={14} /></button>
                      <button onClick={() => setEditing({ ...a })} title="Editar" className="p-1.5 text-text-dim hover:text-brand-500 transition-colors"><Pencil size={14} /></button>
                      <button onClick={() => deleteAsset(a)} title="Eliminar" className="p-1.5 text-text-dim hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-[10px] font-black uppercase text-text-dim">No se encontraron activos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal alta/edición */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !saving && setEditing(null)}>
          <div className="bg-bg-card border border-border-dim rounded-xl max-w-2xl w-full max-h-[88vh] overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border-dim">
              <h3 className="text-sm font-black uppercase text-text-main tracking-wide flex items-center gap-2">
                <Package size={16} className="text-brand-500" /> {editing.id ? 'Editar activo' : 'Nuevo activo'}
              </h3>
              <button onClick={() => setEditing(null)} className="p-1.5 text-text-dim hover:text-text-main"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3">
              {/* Foto */}
              <div className="flex items-center gap-3">
                {editing.image_url ? (
                  <div className="relative">
                    <img src={editing.image_url} className="w-20 h-20 object-cover rounded-lg border border-border-dim" alt="" />
                    <button onClick={() => setEditing({ ...editing, image_url: '' })} className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full text-white text-[10px] flex items-center justify-center">✕</button>
                  </div>
                ) : (
                  <div onClick={() => fileRef.current?.click()} className="w-20 h-20 rounded-lg bg-bg-accent border border-dashed border-border-dim flex items-center justify-center cursor-pointer text-text-dim text-[9px] font-black uppercase text-center">Foto</div>
                )}
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombre *"><input value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500" /></Field>
                <Field label="Categoría *">
                  <input list="mant-cats" value={editing.category || ''} onChange={e => setEditing({ ...editing, category: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500" />
                  <datalist id="mant-cats">{allCategories.map(c => <option key={c} value={c} />)}</datalist>
                </Field>
                <Field label="Sucursal *">
                  <select value={editing.branch || ''} onChange={e => setEditing({ ...editing, branch: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500">
                    <option value="">Seleccionar...</option>
                    {branches.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </Field>
                <Field label="Ubicación">
                  <input list="mant-locs" value={editing.location || ''} onChange={e => setEditing({ ...editing, location: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500" />
                  <datalist id="mant-locs">{locations.map(l => <option key={l} value={l} />)}</datalist>
                </Field>
                <Field label="Marca"><input value={editing.asset_brand || ''} onChange={e => setEditing({ ...editing, asset_brand: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500" /></Field>
                <Field label="Modelo"><input value={editing.asset_model || ''} onChange={e => setEditing({ ...editing, asset_model: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500" /></Field>
                <Field label="N° de serie"><input value={editing.asset_serial || ''} onChange={e => setEditing({ ...editing, asset_serial: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500" /></Field>
                <Field label="Fecha de alta"><input type="date" value={editing.added_date || ''} onChange={e => setEditing({ ...editing, added_date: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500" /></Field>
                <Field label="Costo (ARS)"><input type="number" value={editing.acquisition_cost || ''} onChange={e => setEditing({ ...editing, acquisition_cost: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500" /></Field>
                <Field label="Costo (USD)"><input type="number" value={editing.acquisition_cost_usd || ''} onChange={e => setEditing({ ...editing, acquisition_cost_usd: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500" /></Field>
              </div>
              <Field label="Notas"><textarea value={editing.notes || ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500 min-h-[60px]" /></Field>
              {editing.id && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editing.inactive || false} onChange={e => setEditing({ ...editing, inactive: e.target.checked, inactive_date: e.target.checked ? todayISO() : null })} className="w-4 h-4 accent-brand-500" />
                  <span className="text-[10px] font-black uppercase text-text-dim">Marcar como inactivo (baja)</span>
                </label>
              )}
            </div>
            <div className="p-4 border-t border-border-dim flex gap-2 justify-end">
              <button onClick={() => setEditing(null)} disabled={saving} className="px-4 py-2 bg-bg-accent text-text-dim rounded-lg text-[10px] font-black uppercase tracking-widest hover:text-text-main">Cancelar</button>
              <button onClick={saveAsset} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 disabled:opacity-60">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal QR */}
      {qrAsset && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setQrAsset(null)}>
          <div className="bg-bg-card border border-border-dim rounded-xl max-w-sm w-full p-6 flex flex-col items-center shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-black uppercase text-text-main tracking-wide mb-1">{qrAsset.name}</h3>
            <p className="text-[9px] font-bold text-text-dim uppercase mb-4">{qrAsset.qr_code || 'Sin código QR'}</p>
            {qrAsset.qr_code ? <QRImg value={qrAsset.qr_code} size={200} /> : <p className="text-[10px] text-text-dim">Este activo no tiene código QR asignado.</p>}
            <button onClick={() => setQrAsset(null)} className="mt-5 px-4 py-2 bg-bg-accent text-text-dim rounded-lg text-[10px] font-black uppercase tracking-widest hover:text-text-main">Cerrar</button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// Helpers de UI
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">{label}</label>
      {children}
    </div>
  );
}
