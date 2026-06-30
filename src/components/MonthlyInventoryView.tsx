import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { ClipboardCheck, Search, Calendar, Loader2, Check } from 'lucide-react';

interface Branch { id: string; name: string; }
interface MasterItem { id: string; name: string; unit: string; category: string | null; code: string | null; }
interface Props {
  branches: Branch[];
  selectedBranchId: string;
  userRole?: string;
  fixedBranchId?: string;      // si viene, la sucursal queda fija (ej. Centro de Producción)
  isReadOnly?: boolean;
}

export default function MonthlyInventoryView({ branches, selectedBranchId, userRole, fixedBranchId, isReadOnly = false }: Props) {
  const isAdmin = userRole === 'administrador' || userRole === 'dueño';
  const initialBranch = fixedBranchId || selectedBranchId;
  const [branchId, setBranchId] = useState(initialBranch);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [items, setItems] = useState<MasterItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Mantener branch fijo si corresponde
  useEffect(() => {
    if (fixedBranchId) setBranchId(fixedBranchId);
  }, [fixedBranchId]);

  // Cargar el Maestro de Insumos
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('stock_items').select('id, name, unit, category, code').order('name');
      if (data) setItems(data as MasterItem[]);
    })();
  }, []);

  // Cargar el inventario guardado de la sucursal+mes
  useEffect(() => {
    if (!branchId || !month) return;
    setLoading(true);
    setSavedIds(new Set());
    (async () => {
      const { data } = await supabase
        .from('monthly_inventory')
        .select('item_id, cantidad')
        .match({ branch_id: branchId, month });
      const q: Record<string, number> = {};
      (data || []).forEach((r: any) => { q[r.item_id] = r.cantidad; });
      setQuantities(q);
      setLoading(false);
    })();
  }, [branchId, month]);

  const saveItem = async (item: MasterItem, value: number) => {
    if (isReadOnly) return;
    setSavingId(item.id);
    const { error } = await supabase
      .from('monthly_inventory')
      .upsert({
        branch_id: branchId,
        month,
        item_id: item.id,
        item_name: item.name,
        unit: item.unit,
        cantidad: value,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'branch_id,month,item_id' });
    setSavingId(null);
    if (!error) {
      setSavedIds(prev => new Set(prev).add(item.id));
      setTimeout(() => setSavedIds(prev => { const n = new Set(prev); n.delete(item.id); return n; }), 1500);
    }
  };

  const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const filteredItems = useMemo(() => {
    const q = norm(search.trim());
    if (!q) return items;
    return items.filter(i => norm(i.name).includes(q) || norm(i.code || '').includes(q) || norm(i.category || '').includes(q));
  }, [items, search]);

  const branchName = branches.find(b => b.id === branchId)?.name || branchId;
  const cargados = Object.values(quantities).filter(v => v && v !== 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-brand-500/10 p-2.5 rounded-lg"><ClipboardCheck size={20} className="text-brand-500" /></div>
          <div>
            <h2 className="text-lg font-black uppercase text-text-main tracking-tight">Inventario Mensual</h2>
            <p className="text-[10px] font-bold uppercase text-text-dim tracking-widest">Conteo físico de fin de mes · {branchName}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Selector de sucursal: solo admin puede cambiarla y si no está fija */}
          {!fixedBranchId && isAdmin && (
            <select value={branchId} onChange={e => setBranchId(e.target.value)}
              className="bg-bg-sidebar border border-border-dim rounded-lg px-3 py-2 text-[10px] font-extrabold uppercase text-text-main outline-none cursor-pointer">
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <div className="bg-bg-sidebar border border-border-dim rounded-lg px-3 py-1.5 flex items-center gap-2 font-mono">
            <Calendar size={14} className="text-brand-500" />
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="bg-transparent border-none text-[10px] font-extrabold uppercase text-text-main outline-none cursor-pointer" />
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
          <p className="text-[9px] text-text-dim uppercase font-black tracking-widest">Insumos en el Maestro</p>
          <p className="text-2xl font-mono font-black text-text-main mt-1">{items.length}</p>
        </div>
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
          <p className="text-[9px] text-text-dim uppercase font-black tracking-widest">Insumos con cantidad cargada</p>
          <p className="text-2xl font-mono font-black text-emerald-500 mt-1">{cargados}</p>
        </div>
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar insumo por nombre, código o categoría..."
          className="w-full bg-bg-sidebar border border-border-dim rounded-lg pl-9 pr-3 py-2.5 text-[12px] text-text-main placeholder:text-text-dim outline-none focus:border-brand-500/50" />
      </div>

      {/* Lista de insumos */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-text-dim"><Loader2 size={20} className="animate-spin mx-auto" /></div>
        ) : filteredItems.length === 0 ? (
          <div className="p-10 text-center text-[11px] font-bold uppercase text-text-dim tracking-widest">No hay insumos que coincidan</div>
        ) : (
          <div className="divide-y divide-border-dim/40">
            {filteredItems.map(item => {
              const val = quantities[item.id] ?? '';
              const saving = savingId === item.id;
              const saved = savedIds.has(item.id);
              return (
                <div key={item.id} className="flex items-center gap-4 px-5 py-3 hover:bg-bg-accent/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-black text-text-main truncate">{item.name}</p>
                    <p className="text-[8px] text-text-dim uppercase font-bold tracking-widest truncate">
                      {item.code ? `${item.code} · ` : ''}{item.category || 'Sin categoría'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      value={val}
                      disabled={isReadOnly}
                      onChange={e => setQuantities(prev => ({ ...prev, [item.id]: parseFloat(e.target.value) || 0 }))}
                      onBlur={e => saveItem(item, parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="w-28 bg-bg-accent/40 border border-border-dim rounded px-3 py-2 text-[13px] font-mono font-black text-text-main text-right outline-none focus:border-brand-500"
                    />
                    <span className="w-12 text-[10px] font-black uppercase text-text-dim tracking-widest">{item.unit || '—'}</span>
                    <span className="w-5">
                      {saving ? <Loader2 size={14} className="animate-spin text-text-dim" /> : saved ? <Check size={14} className="text-emerald-500" /> : null}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
