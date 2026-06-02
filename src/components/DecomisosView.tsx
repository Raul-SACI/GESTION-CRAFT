import React, { useState, useEffect, useMemo } from 'react';
import { 
  Trash2, 
  Trash,
  Plus, 
  X, 
  Search, 
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  BarChart3,
  PieChart as PieChartIcon,
  Package,
  UtensilsCrossed,
  Download,
  Upload,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Branch, StockItem, Product, DailyWastage } from '../types';
import { supabase } from '../lib/supabase';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';

export default function DecomisosView({ 
  branches, 
  selectedBranchId,
  items,
  products,
  onlyInsumos = false,
  isReadOnly
}: { 
  branches: Branch[], 
  selectedBranchId: string,
  items: StockItem[],
  products: Product[],
  onlyInsumos?: boolean,
  isReadOnly?: boolean
}) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [decomisos, setDecomisos] = useState<DailyWastage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form State
  const [type, setType] = useState<'insumo' | 'producto'>('insumo');
  const [referenceId, setReferenceId] = useState('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [selectedPresetReason, setSelectedPresetReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Metrics Month
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));

  useEffect(() => {
    fetchDecomisos();
  }, [selectedBranchId, selectedMonth]);

  const fetchDecomisos = async () => {
    if (!selectedBranchId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('daily_wastage')
        .select('*')
        .match(selectedBranchId === 'all' ? {} : { branch_id: selectedBranchId })
        .gte('date', `${selectedMonth}-01`)
        .lte('date', `${selectedMonth}-31`)
        .order('date', { ascending: false });

      if (error) {
        // Table might not exist yet
        console.error('Error fetching decomisos:', error);
      } else {
        setDecomisos(data.map(d => ({
          id: d.id,
          branchId: d.branch_id,
          date: d.date,
          type: d.type,
          referenceId: d.reference_id,
          quantity: d.quantity,
          reason: d.reason,
          cost: d.cost
        })));
      }
    } catch (err) {
      console.error('Catch fetching decomisos:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!selectedBranchId || selectedBranchId === 'all') {
      alert('Por favor, selecciona una sucursal específica para cargar un decomiso.');
      return;
    }
    if (!referenceId || !quantity || quantity <= 0) {
      alert('Por favor, completa todos los campos.');
      return;
    }

    if (!selectedPresetReason) {
      alert('Por favor, seleccione un motivo para el decomiso.');
      return;
    }

    const finalReason = selectedPresetReason === 'Otros' ? customReason : selectedPresetReason;
    if (selectedPresetReason === 'Otros' && !customReason.trim()) {
      alert('Por favor, especifique el motivo para la opción "Otros".');
      return;
    }

    setSaving(true);
    
    // Find cost if available
    let cost = 0;
    if (type === 'insumo') {
      cost = items.find(i => i.id === referenceId)?.cost || 0;
    }

    const { data, error } = await supabase
      .from('daily_wastage')
      .insert([{
        branch_id: selectedBranchId,
        date: selectedDate,
        type,
        reference_id: referenceId,
        quantity,
        reason: finalReason,
        cost: cost * Number(quantity)
      }])
      .select()
      .single();

    if (error) {
      console.error('Error adding decomiso:', error);
      alert(`Error al guardar: ${error.message}. Verifica si la tabla 'daily_wastage' existe.`);
    } else {
      setDecomisos(prev => [{
        id: data.id,
        branchId: data.branch_id,
        date: data.date,
        type: data.type,
        referenceId: data.reference_id,
        quantity: data.quantity,
        reason: data.reason,
        cost: data.cost
      }, ...prev]);
      
      // Reset form
      setReferenceId('');
      setQuantity('');
      setReason('');
      setCustomReason('');
      setSelectedPresetReason('');
      setSearchTerm('');
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!window.confirm('¿Eliminar este registro de decomiso?')) return;
    
    const { error } = await supabase
      .from('daily_wastage')
      .delete()
      .match({ id });

    if (error) {
      alert('Error al eliminar');
    } else {
      setDecomisos(prev => prev.filter(d => d.id !== id));
    }
  };

  // Analytics
  const topWasted = useMemo(() => {
    const counts: Record<string, { name: string, quantity: number, type: string, cost: number }> = {};
    decomisos.forEach(d => {
      const item = d.type === 'insumo' ? items.find(i => i.id === d.referenceId) : products.find(p => p.id === d.referenceId);
      if (!item) return;
      
      const key = `${d.type}-${d.referenceId}`;
      if (!counts[key]) {
        counts[key] = { name: item.name, quantity: 0, type: d.type, cost: 0 };
      }
      counts[key].quantity += d.quantity;
      counts[key].cost += d.cost || 0;
    });

    return Object.values(counts)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  }, [decomisos, items, products]);

  const trends = useMemo(() => {
    const days: Record<string, number> = {};
    decomisos.forEach(d => {
      days[d.date] = (days[d.date] || 0) + (d.cost || d.quantity); // Cost preferred for trend if available
    });
    
    return Object.entries(days)
      .map(([date, val]) => ({ date, value: val }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [decomisos]);

  const filteredSelection = (type === 'insumo' ? items : products).filter(x => 
    !searchTerm || x.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = useMemo(() => {
    const totalCost = decomisos.reduce((sum, d) => sum + (d.cost || 0), 0);
    const totalInsumos = decomisos.filter(d => d.type === 'insumo').length;
    const totalProductos = decomisos.filter(d => d.type === 'producto').length;
    
    return {
      totalCost,
      totalInsumos,
      totalProductos,
      count: decomisos.length
    };
  }, [decomisos]);

  const selectedItemUnit = useMemo(() => {
    if (!referenceId) return '-';
    if (type === 'insumo') {
      return items.find(i => i.id === referenceId)?.unit || '-';
    } else {
      const product = products.find(p => p.id === referenceId);
      return product ? 'UN' : '-';
    }
  }, [referenceId, type, items, products]);

  return (
    <div className="space-y-6">
      {/* Header & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-bg-sidebar border border-border-dim p-4 rounded-lg shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-brand-500/10 rounded-lg text-brand-500">
              <Trash size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-text-dim uppercase tracking-widest leading-none">Total Decomisos</p>
              <p className="text-xl font-black text-text-main mt-1 leading-none">{stats.count}</p>
            </div>
          </div>
          <p className="text-[9px] text-text-dim font-bold uppercase mt-1">Registros en el mes</p>
        </div>

        <div className="bg-bg-sidebar border border-border-dim p-4 rounded-lg shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-500/10 rounded-lg text-red-500">
              <TrendingDown size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-text-dim uppercase tracking-widest leading-none">Costo Estimado</p>
              <p className="text-xl font-black text-text-main mt-1 leading-none">${stats.totalCost.toLocaleString()}</p>
            </div>
          </div>
          <p className="text-[9px] text-text-dim font-bold uppercase mt-1">Pérdida por decomisos</p>
        </div>

        <div className="bg-bg-sidebar border border-border-dim p-4 rounded-lg shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-brand-500/10 rounded-lg text-brand-500">
              <Package size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-text-dim uppercase tracking-widest leading-none">Insumos</p>
              <p className="text-xl font-black text-text-main mt-1 leading-none">{stats.totalInsumos}</p>
            </div>
          </div>
          <p className="text-[9px] text-text-dim font-bold uppercase mt-1">Materia prima desperdiciada</p>
        </div>

        <div className="bg-bg-sidebar border border-border-dim p-4 rounded-lg shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-brand-500/10 rounded-lg text-brand-500">
              <UtensilsCrossed size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-text-dim uppercase tracking-widest leading-none">Productos</p>
              <p className="text-xl font-black text-text-main mt-1 leading-none">{stats.totalProductos}</p>
            </div>
          </div>
          <p className="text-[9px] text-text-dim font-bold uppercase mt-1">Platos/Productos desperdiciados</p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Entry Form & List */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          <div className="glass-card p-6 border-t-4 border-brand-500">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-black uppercase text-text-main tracking-widest flex items-center gap-2">
                <Plus size={18} className="text-brand-500" />
                Cargar Nuevo Decomiso
              </h3>
              <div className="flex items-center gap-3">
                <CalendarIcon size={16} className="text-text-dim" />
                <input 
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-bg-accent border border-border-dim rounded px-3 py-1.5 text-[11px] font-black uppercase text-text-main outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-text-dim uppercase ml-1">Tipo</label>
                <div className="flex bg-bg-accent border border-border-dim rounded p-1">
                  <button 
                    onClick={() => { setType('insumo'); setReferenceId(''); setSearchTerm(''); }}
                    className={cn(
                      "flex-1 py-1.5 rounded text-[10px] font-black uppercase transition-all",
                      type === 'insumo' ? "bg-brand-500 text-black shadow-sm" : "text-text-dim hover:text-text-main"
                    )}
                  >Insumo</button>
                  {!onlyInsumos && (
                    <button 
                      onClick={() => { setType('producto'); setReferenceId(''); setSearchTerm(''); }}
                      className={cn(
                        "flex-1 py-1.5 rounded text-[10px] font-black uppercase transition-all",
                        type === 'producto' ? "bg-brand-500 text-black shadow-sm" : "text-text-dim hover:text-text-main"
                      )}
                    >Producto</button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-text-dim uppercase ml-1">Seleccionar {type}</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
                  <input 
                    type="text"
                    placeholder="BUSCAR..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-bg-accent border border-border-dim rounded text-[10px] font-black uppercase outline-none focus:border-brand-500"
                  />
                  {searchTerm && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-bg-sidebar border border-border-dim rounded shadow-xl z-50 max-h-48 overflow-y-auto custom-scrollbar">
                      {filteredSelection.map(x => (
                        <button 
                          key={x.id}
                          onClick={() => {
                            setReferenceId(x.id);
                            setSearchTerm(x.name);
                          }}
                          className="w-full text-left p-2.5 hover:bg-bg-accent border-b border-border-dim/30 last:border-0 transition-colors"
                        >
                          <div className="text-[10px] font-black uppercase text-text-main">{x.name}</div>
                          {type === 'insumo' && <div className="text-[8px] text-text-dim font-bold uppercase">Unidad: {(x as StockItem).unit}</div>}
                          {type === 'producto' && <div className="text-[8px] text-text-dim font-bold uppercase">{(x as Product).category}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-text-dim uppercase ml-1">Cantidad</label>
                <input 
                  type="number"
                  placeholder="0.00"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full px-4 py-2 bg-bg-accent border border-border-dim rounded text-[12px] font-black text-brand-500 outline-none focus:border-brand-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-text-dim uppercase ml-1">Unidad</label>
                <div className="w-full px-4 py-2 bg-bg-accent/40 border border-border-dim/50 rounded text-[11px] font-black text-text-dim uppercase flex items-center justify-center min-h-[38px]">
                  {selectedItemUnit}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-text-dim uppercase ml-1">&nbsp;</label>
                <button 
                  onClick={handleAdd}
                  disabled={saving}
                  className="w-full py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-black font-black uppercase text-[11px] rounded transition-all shadow-lg shadow-brand-500/20"
                >
                  {saving ? 'Guardando...' : 'Agregar Registro'}
                </button>
              </div>
            </div>
            
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-text-dim uppercase ml-1">
                  Motivo <span className="text-red-500 font-black">*</span>
                </label>
                <select
                  value={selectedPresetReason}
                  onChange={(e) => setSelectedPresetReason(e.target.value)}
                  className="w-full px-4 py-2 bg-bg-accent border border-[#30363D]/80 rounded text-[11px] font-black text-text-main uppercase outline-none focus:border-brand-500 h-[38px] cursor-pointer"
                >
                  <option value="" className="bg-bg-sidebar text-text-dim">-- SELECCIONE EL MOTIVO --</option>
                  <option value="Vencimiento" className="bg-bg-sidebar">Vencimiento</option>
                  <option value="Mal Estado" className="bg-bg-sidebar">Mal Estado</option>
                  <option value="Rotura" className="bg-bg-sidebar">Rotura</option>
                  <option value="Error Mozo/Caja" className="bg-bg-sidebar">Error Mozo/Caja</option>
                  <option value="Error Cocina" className="bg-bg-sidebar">Error Cocina</option>
                  <option value="Otros" className="bg-bg-sidebar">Otros (Especificar)</option>
                </select>
              </div>

              {selectedPresetReason === 'Otros' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-text-dim uppercase ml-1">Escriba el Motivo</label>
                  <input
                    type="text"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Especifique el motivo..."
                    className="w-full px-4 py-2 bg-bg-accent border border-border-dim rounded text-[11px] font-bold text-text-main uppercase outline-none focus:border-brand-500 h-[38px]"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="bg-bg-sidebar border border-border-dim rounded-lg shadow-sm overflow-hidden min-h-[400px]">
            <div className="p-4 border-b border-border-dim bg-bg-accent/20 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest">Historial de Decomisos</h3>
                <div className="flex items-center bg-bg-accent border border-border-dim rounded px-2 py-1">
                  <CalendarIcon size={12} className="text-text-dim mr-2" />
                  <input 
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="bg-transparent border-none text-[10px] font-black uppercase text-brand-500 outline-none"
                  />
                </div>
              </div>
              <div className="text-[10px] font-black text-text-dim uppercase bg-bg-accent px-2 py-1 rounded">
                Mostrando {decomisos.length} registros
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-bg-accent/10 border-b border-border-dim">
                    <th className="p-4 text-[9px] font-black uppercase text-text-dim tracking-widest">Fecha</th>
                    <th className="p-4 text-[9px] font-black uppercase text-text-dim tracking-widest">Tipo</th>
                    <th className="p-4 text-[9px] font-black uppercase text-text-dim tracking-widest">Nombre</th>
                    <th className="p-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">Cantidad</th>
                    <th className="p-4 text-[9px] font-black uppercase text-text-dim tracking-widest">Motivo</th>
                    <th className="p-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-right">Coste Est.</th>
                    <th className="p-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dim/30">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center">
                        <div className="flex items-center justify-center gap-2 text-brand-500">
                          <BarChart3 className="animate-pulse" />
                          <span className="text-[10px] font-black uppercase">Cargando datos...</span>
                        </div>
                      </td>
                    </tr>
                  ) : decomisos.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-text-dim">
                        <AlertTriangle className="mx-auto mb-2 opacity-50" size={32} />
                        <p className="text-[10px] font-black uppercase">No hay decomisos registrados en este periodo</p>
                      </td>
                    </tr>
                  ) : (
                    decomisos.map(d => {
                      const item = d.type === 'insumo' ? items.find(i => i.id === d.referenceId) : products.find(p => p.id === d.referenceId);
                      return (
                        <tr key={d.id} className="hover:bg-bg-accent/40 transition-colors group">
                          <td className="p-4 text-[10px] font-bold text-text-main">{d.date.split('-').reverse().join('/')}</td>
                          <td className="p-4">
                            <span className={cn(
                              "px-1.5 py-0.5 rounded-[4px] text-[8px] font-black uppercase",
                              d.type === 'insumo' ? "bg-blue-500/10 text-blue-500" : "bg-purple-500/10 text-purple-500"
                            )}>{d.type}</span>
                          </td>
                          <td className="p-4">
                            <p className="text-[10px] font-black uppercase text-text-main leading-tight">{item?.name || 'DESCONOCIDO'}</p>
                            {d.type === 'insumo' ? (
                              <p className="text-[8px] text-text-dim font-bold uppercase">Unidad: {(item as StockItem)?.unit}</p>
                            ) : (
                              <p className="text-[8px] text-text-dim font-bold uppercase">{(item as Product)?.category}</p>
                            )}
                          </td>
                          <td className="p-4 text-center font-mono text-[11px] font-black text-brand-500">{d.quantity}</td>
                          <td className="p-4 text-[9px] text-text-dim italic font-medium uppercase truncate max-w-[150px]">{d.reason || '-'}</td>
                          <td className="p-4 text-right font-mono text-[10px] font-black text-text-main">
                            {d.cost ? `$${d.cost.toLocaleString()}` : '-'}
                          </td>
                          <td className="p-4 text-right">
                            <button 
                              onClick={() => handleDelete(d.id)}
                              className="text-text-dim hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Indicators Sidebar */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="glass-card p-6 border-b-2 border-brand-500 shadow-xl">
            <h3 className="text-xs font-black uppercase text-brand-500 tracking-widest mb-6 flex items-center gap-2 border-l-2 border-brand-500 pl-3">
              <BarChart3 size={16} />
              Top Decomisados
            </h3>
            
            <div className="space-y-4">
              {topWasted.length > 0 ? topWasted.map((item, idx) => (
                <div key={idx} className="relative">
                  <div className="flex justify-between items-end mb-1.5">
                    <div className="flex-1 truncate pr-4">
                      <p className="text-[10px] font-black uppercase text-text-main truncate">{item.name}</p>
                      <p className="text-[8px] text-text-dim uppercase font-bold opacity-70">{item.type}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-black text-brand-500 leading-none">{item.quantity}</p>
                      <p className="text-[9px] font-bold text-text-dim mt-0.5">${item.cost.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="h-1.5 bg-bg-accent rounded-full overflow-hidden border border-border-dim/20">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(item.quantity / topWasted[0].quantity) * 100}%` }}
                      className={cn(
                        "h-full rounded-full",
                        item.type === 'insumo' ? "bg-brand-500" : "bg-purple-500"
                      )}
                    />
                  </div>
                </div>
              )) : (
                <div className="text-center py-8">
                  <PieChartIcon className="mx-auto mb-2 text-border-dim" size={40} />
                  <p className="text-[9px] font-black text-text-dim uppercase">Sin datos de este mes</p>
                </div>
              )}
            </div>
            
            <div className="mt-8 pt-6 border-t border-border-dim/30">
               <h4 className="text-[9px] font-black uppercase text-text-dim tracking-widest mb-4">Tendencia de Pérdidas ($)</h4>
               <div className="h-[200px] w-full">
                 <ResponsiveContainer width="100%" height="100%">
                   <AreaChart data={trends}>
                     <defs>
                       <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="5%" stopColor="#D4FF00" stopOpacity={0.3}/>
                         <stop offset="95%" stopColor="#D4FF00" stopOpacity={0}/>
                       </linearGradient>
                     </defs>
                     <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                     <XAxis 
                       dataKey="date" 
                       axisLine={false} 
                       tickLine={false} 
                       tick={{ fontSize: 8, fill: '#666' }}
                       tickFormatter={(val) => val.split('-')[2]}
                     />
                     <YAxis 
                       axisLine={false} 
                       tickLine={false} 
                       tick={{ fontSize: 8, fill: '#666' }} 
                       hide
                     />
                     <Tooltip 
                       contentStyle={{ backgroundColor: '#111', border: '1px solid #333', fontSize: '10px' }}
                       itemStyle={{ color: '#D4FF00' }}
                       labelFormatter={(val) => `Día: ${val.split('-').reverse().join('/')}`}
                     />
                     <Area type="monotone" dataKey="value" stroke="#D4FF00" fillOpacity={1} fill="url(#colorVal)" strokeWidth={3} />
                   </AreaChart>
                 </ResponsiveContainer>
               </div>
            </div>
          </div>

          <div className="glass-card p-6 border-l-4 border-amber-500 bg-amber-500/5">
            <h4 className="text-[10px] font-black uppercase text-amber-500 tracking-widest flex items-center gap-2 mb-3">
              <Info size={14} />
              Sql para Tablas
            </h4>
            <p className="text-[9px] text-text-dim font-bold uppercase leading-relaxed mb-4">
              Asegúrate de que la tabla de decomisos exista en tu base de datos Supabase:
            </p>
            <div className="bg-black/40 p-3 rounded font-mono text-[8px] text-amber-500/80 whitespace-pre border border-amber-500/20 overflow-x-auto">
{`CREATE TABLE daily_wastage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id TEXT NOT NULL,
  date DATE NOT NULL,
  type TEXT NOT NULL, -- 'insumo' | 'producto'
  reference_id TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  reason TEXT,
  cost NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE daily_wastage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access" ON daily_wastage FOR ALL USING (true);`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
