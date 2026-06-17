/**
 * SPDX-License-Identifier: Apache-2.0
 * Configuración del módulo Mantenimiento: sucursales, ubicaciones, categorías y bienes.
 */
import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Loader2, Plus, Trash2, Building2, MapPin, Tags, X } from 'lucide-react';
import { supabaseMant } from '../lib/supabase';
import { cn } from '../lib/utils';

type Tab = 'branches' | 'categories' | 'locations';

export default function MantConfigView() {
  const [branches, setBranches] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [categories, setCategories] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [tab, setTab] = useState<Tab>('branches');
  const [newBranch, setNewBranch] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newAsset, setNewAsset] = useState<Record<string, string>>({});

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: cfg } = await supabaseMant.from('configuracion').select('*');
      (cfg || []).forEach((c: any) => {
        if (c.id === 'branches') setBranches(c.data || []);
        if (c.id === 'locations') setLocations(c.data || []);
        if (c.id === 'categories') setCategories(c.data || {});
      });
    } catch (e: any) {
      console.error('Error cargando configuración:', e);
      setError(e.message || 'No se pudo cargar la configuración.');
    }
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  // Guarda una clave de configuración (branches/locations/categories)
  const updateConfig = async (id: string, data: any) => {
    setSaving(true);
    try {
      const { error } = await supabaseMant.from('configuracion').upsert({ id, data, updated_at: new Date().toISOString() });
      if (error) throw error;
    } catch (e: any) {
      alert('Error al guardar: ' + (e.message || e));
    }
    setSaving(false);
  };

  const addBranch = async () => {
    const v = newBranch.trim();
    if (!v) return;
    if (branches.includes(v)) { alert('Esa sucursal ya existe.'); return; }
    const next = [...branches, v];
    setBranches(next); setNewBranch('');
    await updateConfig('branches', next);
  };
  const removeBranch = async (b: string) => {
    if (!window.confirm(`¿Quitar la sucursal "${b}"? (No borra los activos, solo la saca de la lista)`)) return;
    const next = branches.filter(x => x !== b);
    setBranches(next);
    await updateConfig('branches', next);
  };

  const addLocation = async () => {
    const v = newLocation.trim();
    if (!v) return;
    if (locations.includes(v)) { alert('Esa ubicación ya existe.'); return; }
    const next = [...locations, v];
    setLocations(next); setNewLocation('');
    await updateConfig('locations', next);
  };
  const removeLocation = async (l: string) => {
    if (!window.confirm(`¿Quitar la ubicación "${l}"?`)) return;
    const next = locations.filter(x => x !== l);
    setLocations(next);
    await updateConfig('locations', next);
  };

  const addCategory = async () => {
    const v = newCatName.trim();
    if (!v) return;
    if (categories[v]) { alert('Esa categoría ya existe.'); return; }
    const next = { ...categories, [v]: [] };
    setCategories(next); setNewCatName('');
    await updateConfig('categories', next);
  };
  const removeCategory = async (cat: string) => {
    if (!window.confirm(`¿Quitar la categoría "${cat}" y todos sus bienes de la lista?`)) return;
    const next = { ...categories }; delete next[cat];
    setCategories(next);
    await updateConfig('categories', next);
  };
  const addAsset = async (cat: string) => {
    const v = (newAsset[cat] || '').trim();
    if (!v) return;
    const names = categories[cat] || [];
    if (names.includes(v)) { alert('Ese bien ya existe en la categoría.'); return; }
    const next = { ...categories, [cat]: [...names, v] };
    setCategories(next);
    setNewAsset({ ...newAsset, [cat]: '' });
    await updateConfig('categories', next);
  };
  const removeAsset = async (cat: string, name: string) => {
    const next = { ...categories, [cat]: (categories[cat] || []).filter(x => x !== name) };
    setCategories(next);
    await updateConfig('categories', next);
  };

  if (loading) return <div className="py-24 flex justify-center"><Loader2 size={28} className="animate-spin text-brand-500" /></div>;
  if (error) return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
      <p className="text-[11px] font-black text-red-500 uppercase tracking-widest mb-1">Error al cargar configuración</p>
      <p className="text-[10px] text-text-dim font-bold">{error}</p>
    </div>
  );

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'branches', label: 'Sucursales', icon: Building2 },
    { id: 'categories', label: 'Categorías y Bienes', icon: Tags },
    { id: 'locations', label: 'Ubicaciones', icon: MapPin },
  ];

  const inputCls = "flex-1 bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500";
  const addBtnCls = "bg-brand-500 text-white px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all flex items-center gap-1 disabled:opacity-60";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-bg-sidebar border border-border-dim rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
              tab === t.id ? "bg-brand-500 text-white" : "text-text-dim hover:text-text-main")}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* Sucursales */}
      {tab === 'branches' && (
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 space-y-4">
          <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest">Gestión de Sucursales</h3>
          <div className="flex gap-2">
            <input value={newBranch} onChange={e => setNewBranch(e.target.value)} onKeyDown={e => e.key === 'Enter' && addBranch()}
              placeholder="Nombre de la sucursal..." className={inputCls} />
            <button onClick={addBranch} disabled={saving} className={addBtnCls}><Plus size={13} /> Agregar</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {branches.map(b => (
              <span key={b} className="flex items-center gap-2 bg-bg-accent border border-border-dim rounded-full pl-3 pr-2 py-1.5 text-[11px] font-bold text-text-main">
                {b}
                <button onClick={() => removeBranch(b)} className="text-text-dim hover:text-red-500"><X size={13} /></button>
              </span>
            ))}
            {branches.length === 0 && <p className="text-[10px] text-text-dim font-bold uppercase">No hay sucursales cargadas</p>}
          </div>
        </div>
      )}

      {/* Ubicaciones */}
      {tab === 'locations' && (
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 space-y-4">
          <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest">Gestión de Ubicaciones</h3>
          <div className="flex gap-2">
            <input value={newLocation} onChange={e => setNewLocation(e.target.value)} onKeyDown={e => e.key === 'Enter' && addLocation()}
              placeholder="Nombre de la ubicación..." className={inputCls} />
            <button onClick={addLocation} disabled={saving} className={addBtnCls}><Plus size={13} /> Agregar</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {locations.map(l => (
              <span key={l} className="flex items-center gap-2 bg-bg-accent border border-border-dim rounded-full pl-3 pr-2 py-1.5 text-[11px] font-bold text-text-main">
                {l}
                <button onClick={() => removeLocation(l)} className="text-text-dim hover:text-red-500"><X size={13} /></button>
              </span>
            ))}
            {locations.length === 0 && <p className="text-[10px] text-text-dim font-bold uppercase">No hay ubicaciones cargadas</p>}
          </div>
        </div>
      )}

      {/* Categorías y bienes */}
      {tab === 'categories' && (
        <div className="space-y-4">
          <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 space-y-3">
            <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest">Nueva Categoría</h3>
            <div className="flex gap-2">
              <input value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCategory()}
                placeholder="Nombre de la categoría..." className={inputCls} />
              <button onClick={addCategory} disabled={saving} className={addBtnCls}><Plus size={13} /> Crear categoría</button>
            </div>
          </div>

          {Object.entries(categories).map(([cat, names]) => (
            <div key={cat} className="bg-bg-sidebar border border-border-dim rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-[11px] font-black uppercase text-brand-500 tracking-widest">{cat} <span className="text-text-dim">({(names as string[]).length})</span></h4>
                <button onClick={() => removeCategory(cat)} title="Quitar categoría" className="text-text-dim hover:text-red-500"><Trash2 size={14} /></button>
              </div>
              <div className="flex gap-2">
                <input value={newAsset[cat] || ''} onChange={e => setNewAsset({ ...newAsset, [cat]: e.target.value })} onKeyDown={e => e.key === 'Enter' && addAsset(cat)}
                  placeholder="Nombre del bien..." className={inputCls} />
                <button onClick={() => addAsset(cat)} disabled={saving} className={addBtnCls}><Plus size={13} /> Agregar bien</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(names as string[]).map(n => (
                  <span key={n} className="flex items-center gap-2 bg-bg-accent border border-border-dim rounded-full pl-3 pr-2 py-1 text-[10px] font-bold text-text-main">
                    {n}
                    <button onClick={() => removeAsset(cat, n)} className="text-text-dim hover:text-red-500"><X size={12} /></button>
                  </span>
                ))}
                {(names as string[]).length === 0 && <p className="text-[9px] text-text-dim font-bold uppercase">Sin bienes en esta categoría</p>}
              </div>
            </div>
          ))}
          {Object.keys(categories).length === 0 && (
            <div className="py-12 text-center text-[10px] font-black uppercase text-text-dim">No hay categorías cargadas</div>
          )}
        </div>
      )}
    </motion.div>
  );
}
