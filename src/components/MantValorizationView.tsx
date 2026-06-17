/**
 * SPDX-License-Identifier: Apache-2.0
 * Valorización de activos del módulo Mantenimiento (solo lectura).
 */
import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Loader2, Landmark } from 'lucide-react';
import { supabaseMant } from '../lib/supabase';

interface Asset {
  id: string; name: string; category: string; branch: string; inactive: boolean;
  acquisition_cost: string; acquisition_cost_usd: string;
}

const fmt = (n: number) => Math.round(n).toLocaleString('es-AR');

export default function MantValorizationView() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fBranch, setFBranch] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [exchangeRate, setExchangeRate] = useState(1000);
  const [valCurrency, setValCurrency] = useState<'ARS' | 'USD'>('ARS');

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      let all: any[] = []; let from = 0; const step = 1000;
      while (true) {
        const { data, error } = await supabaseMant.from('activos').select('id, name, category, branch, inactive, acquisition_cost, acquisition_cost_usd').range(from, from + step - 1);
        if (error) throw error;
        if (data && data.length > 0) { all = all.concat(data); if (data.length < step) break; from += step; } else break;
      }
      setAssets(all as Asset[]);
      const { data: cfg } = await supabaseMant.from('configuracion').select('*');
      (cfg || []).forEach((c: any) => {
        if (c.id === 'branches') setBranches(c.data || []);
        if (c.id === 'categories') setCategories(Object.keys(c.data || {}));
      });
    } catch (e: any) {
      console.error('Error cargando valorización:', e);
      setError(e.message || 'No se pudo cargar la valorización.');
    }
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  // Valor de un activo en la moneda elegida (con conversión si falta)
  const valueOf = (a: Asset) => {
    const ars = parseFloat(a.acquisition_cost) || 0;
    const usd = parseFloat(a.acquisition_cost_usd || '0') || 0;
    return valCurrency === 'ARS' ? (ars || usd * exchangeRate) : (usd || ars / exchangeRate);
  };

  const matchesFilter = (a: Asset) => {
    if (a.inactive) return false;
    if (fBranch && a.branch !== fBranch) return false;
    if (fCategory && a.category !== fCategory) return false;
    return true;
  };

  const totalSelected = useMemo(() => assets.filter(matchesFilter).reduce((s, a) => s + valueOf(a), 0), [assets, fBranch, fCategory, valCurrency, exchangeRate]);

  const byBranch = useMemo(() => {
    return branches.filter(b => !fBranch || b === fBranch).map(b => {
      const ba = assets.filter(a => !a.inactive && a.branch === b && (!fCategory || a.category === fCategory));
      const total = ba.reduce((s, a) => s + valueOf(a), 0);
      return { branch: b, assets: ba, total };
    }).filter(x => x.assets.length > 0);
  }, [assets, branches, fBranch, fCategory, valCurrency, exchangeRate]);

  const sym = valCurrency === 'USD' ? 'U$D ' : '$';

  if (loading) return <div className="py-24 flex justify-center"><Loader2 size={28} className="animate-spin text-brand-500" /></div>;
  if (error) return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
      <p className="text-[11px] font-black text-red-500 uppercase tracking-widest mb-1">Error al cargar valorización</p>
      <p className="text-[10px] text-text-dim font-bold">{error}</p>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Filtros */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[160px]">
          <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Sede</label>
          <select value={fBranch} onChange={e => setFBranch(e.target.value)}
            className="w-full mt-1 bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none">
            <option value="">Todas las sedes</option>
            {branches.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Categoría</label>
          <select value={fCategory} onChange={e => setFCategory(e.target.value)}
            className="w-full mt-1 bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none">
            <option value="">Todas las categorías</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="min-w-[120px]">
          <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Cotización USD</label>
          <input type="number" value={exchangeRate} onChange={e => setExchangeRate(parseFloat(e.target.value) || 1)}
            className="w-full mt-1 bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500" />
        </div>
        <button onClick={() => setValCurrency(c => c === 'ARS' ? 'USD' : 'ARS')}
          className="bg-bg-accent text-text-main px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-bg-accent/70 transition-all">
          Ver en {valCurrency === 'ARS' ? 'USD' : 'ARS'}
        </button>
      </div>

      {/* Valor total */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-8 text-center">
        <Landmark size={28} className="text-brand-500 mx-auto mb-2" />
        <p className="text-[10px] font-black uppercase text-text-dim tracking-widest mb-1">Valor Total Seleccionado</p>
        <p className="text-4xl font-black text-text-main">{sym}{fmt(totalSelected)}</p>
        <p className="text-[9px] text-text-dim font-bold uppercase mt-2">Basado en los filtros actuales</p>
      </div>

      {/* Desglose por sucursal */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {byBranch.map(({ branch, assets: ba, total }) => (
          <div key={branch} className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border-dim flex justify-between items-center bg-bg-accent/30">
              <span className="text-[11px] font-black uppercase text-text-main tracking-widest">{branch}</span>
              <span className="text-[12px] font-black text-emerald-500">{sym}{fmt(total)}</span>
            </div>
            <div className="max-h-[300px] overflow-auto divide-y divide-border-dim/30">
              {ba.map(a => (
                <div key={a.id} className="flex justify-between items-center px-5 py-2.5 text-[11px]">
                  <span className="text-text-main font-bold uppercase truncate pr-2">{a.name}</span>
                  <span className="font-mono text-text-dim shrink-0">{sym}{fmt(valueOf(a))}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {byBranch.length === 0 && (
          <div className="col-span-full py-16 text-center text-[10px] font-black uppercase text-text-dim">Sin activos para los filtros seleccionados</div>
        )}
      </div>
    </motion.div>
  );
}
