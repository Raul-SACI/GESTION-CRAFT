import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Factory, 
  Plus, 
  Save, 
  Loader2, 
  X, 
  Calendar, 
  TrendingUp,
  Package,
  ChevronDown,
  History,
  FileUp,
  Download,
  CheckCircle2,
  Trash2,
  AlertCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';
import { ProductionItem, ProductionLog } from '../types';

export default function ProductionCenterView({ isReadOnly = false }: { isReadOnly?: boolean } = {}) {
  const [items, setItems] = useState<ProductionItem[]>([]);
  const [logs, setLogs] = useState<ProductionLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [isLoggingDaily, setIsLoggingDaily] = useState(false);

  // Form States
  const [newItem, setNewItem] = useState({ name: '', unit: '', category: '' });
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [dailyInputs, setDailyInputs] = useState<Record<string, number>>({});
  
  // Import State
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);

  const categories = useMemo(() => Array.from(new Set(items.map(i => i.category))), [items]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: itemsData } = await supabase.from('production_items').select('*').order('name');
      if (itemsData) {
        setItems(itemsData.map(i => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          category: i.category
        })));
      }

      const { data: logsData } = await supabase
        .from('production_logs')
        .select('*')
        .order('date', { ascending: false });
      
      if (logsData) {
        setLogs(logsData.map(l => ({
          id: l.id,
          itemId: l.item_id,
          date: l.date,
          quantity: l.quantity,
          batchNumber: l.batch_number,
          notes: l.notes
        })));
      }
    } catch (err) {
      console.error('Error fetching production center data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddItem = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!newItem.name || !newItem.unit) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('production_items').insert([{
        name: newItem.name.toUpperCase(),
        unit: newItem.unit.toUpperCase(),
        category: newItem.category.toUpperCase() || 'GENERAL'
      }]);
      if (error) throw error;
      setIsAddingItem(false);
      setNewItem({ name: '', unit: '', category: '' });
      fetchData();
    } catch (err) {
      alert('Error al guardar el artículo');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDailyLog = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    setLoading(true);
    try {
      const entries = Object.entries(dailyInputs)
        .filter(([_, qty]) => {
          const val = qty as number;
          return val > 0;
        })
        .map(([itemId, qty]) => ({
          item_id: itemId,
          date: selectedDate,
          quantity: qty as number
        }));

      if (entries.length === 0) return;

      const { error } = await supabase.from('production_logs').upsert(entries, {
        onConflict: 'item_id,date'
      });
      
      if (error) throw error;
      setIsLoggingDaily(false);
      setDailyInputs({});
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Error al guardar la producción diaria');
    } finally {
      setLoading(false);
    }
  };

  const deleteItem = async (id: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!confirm('¿Seguro que desea eliminar este artículo? se perderán los registros asociados.')) return;
    try {
      await supabase.from('production_logs').delete().eq('item_id', id);
      await supabase.from('production_items').delete().eq('id', id);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const getProductionForMonth = (itemId: string, monthStr: string) => {
    return logs
      .filter(l => l.itemId === itemId && l.date.startsWith(monthStr))
      .reduce((sum, curr) => sum + curr.quantity, 0);
  };

  const currentMonthStr = new Date().toISOString().substring(0, 7); // YYYY-MM

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-brand-500/10 p-2 text-brand-500 border border-brand-500/20 rounded">
            <Factory size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-main uppercase tracking-tight">Centro de Producción</h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest italic">Producción del mes / Control diario</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => setIsAddingItem(true)}
            className="bg-bg-accent hover:bg-bg-card border border-border-dim text-text-dim px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
          >
            <Plus size={14} /> NUEVO ARTÍCULO
          </button>
          <button 
            onClick={() => setIsLoggingDaily(true)}
            className="bg-brand-500 hover:bg-brand-600 text-black px-5 py-2 rounded text-[9px] font-black uppercase tracking-widest shadow-xl transition-all flex items-center gap-2"
          >
            <TrendingUp size={14} /> CARGA DIARIA
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Summary sidebar */}
        <div className="lg:col-span-1 space-y-6">
           <div className="bg-bg-sidebar border border-border-dim p-6 rounded space-y-6">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[#8B949E] border-b border-border-dim pb-2">Métricas del Mes</h3>
              
              <div className="space-y-4">
                 <div className="bg-bg-accent p-4 rounded border border-border-dim">
                    <p className="text-[9px] font-bold text-text-dim uppercase mb-1">Total Artículos Producidos</p>
                    <p className="text-2xl font-mono font-black text-text-main">
                      {new Set(logs.filter(l => l.date.startsWith(currentMonthStr)).map(l => l.itemId)).size}
                    </p>
                 </div>

                 <div className="bg-brand-500/5 border border-brand-500/20 p-4 rounded text-brand-500">
                    <div className="flex items-center gap-2 mb-2">
                       <History size={16} />
                       <span className="text-[10px] font-black uppercase">Última Carga</span>
                    </div>
                    <p className="text-[9px] font-bold uppercase leading-relaxed text-text-main">
                      {logs[0] ? new Date(logs[0].date).toLocaleDateString() : 'Sin registros'}
                    </p>
                 </div>
              </div>
           </div>

           <div className="bg-bg-sidebar border border-border-dim p-6 rounded">
              <h4 className="text-[10px] font-black uppercase text-text-dim mb-3">Top Producción</h4>
              <div className="space-y-3">
                 {items.slice(0, 5).map((item) => {
                   const monthTotal = getProductionForMonth(item.id, currentMonthStr);
                   if (monthTotal === 0) return null;
                   return (
                     <div key={item.id} className="flex justify-between items-center text-[10px]">
                        <span className="text-text-dim uppercase font-bold truncate max-w-[120px]">{item.name}</span>
                        <span className="text-brand-500 font-mono font-black">{monthTotal} {item.unit}</span>
                     </div>
                   );
                 }).filter(Boolean)}
                 {!logs.some(l => l.date.startsWith(currentMonthStr)) && (
                   <p className="text-[9px] text-text-dim italic uppercase tracking-tighter">Sin datos este mes</p>
                 )}
              </div>
           </div>
        </div>

        {/* Main List Table */}
        <div className="lg:col-span-3 space-y-8">
           {categories.length === 0 ? (
             <div className="bg-bg-sidebar border border-border-dim p-20 rounded text-center flex flex-col items-center justify-center">
                <Package size={40} className="text-text-dim/20 mb-4" />
                <p className="text-[10px] font-bold text-text-dim uppercase tracking-widest">No hay artículos definidos en el centro de producción</p>
                <button 
                  onClick={() => setIsAddingItem(true)}
                  className="mt-4 text-brand-500 text-[10px] font-black uppercase hover:underline"
                >
                  Definir primer artículo ahora
                </button>
             </div>
           ) : (
             categories.map(cat => (
               <div key={cat} className="bg-bg-sidebar border border-border-dim rounded overflow-hidden shadow-sm">
                  <div className="bg-bg-accent px-6 py-4 border-b border-border-dim flex justify-between items-center">
                     <h3 className="text-[10px] font-black uppercase tracking-widest text-text-main flex items-center gap-2">
                        <ChevronDown size={14} className="text-brand-500" /> {cat}
                     </h3>
                     <span className="text-[9px] font-bold text-text-dim uppercase opacity-40">{items.filter(i => i.category === cat).length} ARTÍCULOS</span>
                  </div>
                  <div className="overflow-x-auto">
                     <table className="w-full text-[10px]">
                        <thead>
                           <tr className="text-left text-text-dim font-bold uppercase tracking-widest border-b border-border-dim bg-bg-sidebar">
                              <th className="px-6 py-4">Artículo</th>
                              <th className="px-6 py-4 text-center">Unidad</th>
                              <th className="px-6 py-4 text-center">Última Producción</th>
                              <th className="px-6 py-4 text-center">Fecha</th>
                              <th className="px-6 py-4 text-center">Total Mes ({currentMonthStr})</th>
                              <th className="px-6 py-4 text-right">Acciones</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-border-dim/30">
                           {items.filter(i => i.category === cat).map(item => {
                             const lastLog = logs.find(l => l.itemId === item.id);
                             const monthTotal = getProductionForMonth(item.id, currentMonthStr);

                             return (
                               <tr key={item.id} className="hover:bg-bg-accent/30 transition-colors">
                                  <td className="px-6 py-4 font-black text-text-main uppercase group relative">
                                    {item.name}
                                  </td>
                                  <td className="px-6 py-4 text-center font-mono text-text-dim uppercase">{item.unit}</td>
                                  <td className="px-6 py-4 text-center font-mono font-black text-brand-500">
                                     {lastLog ? lastLog.quantity : '--'}
                                  </td>
                                  <td className="px-6 py-4 text-center text-text-dim font-bold">
                                     {lastLog ? new Date(lastLog.date).toLocaleDateString() : '--'}
                                  </td>
                                  <td className="px-6 py-4 text-center">
                                     <span className="bg-brand-500/10 text-brand-500 px-3 py-1 rounded font-mono font-black text-sm">
                                        {monthTotal}
                                     </span>
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                     <button 
                                      onClick={() => deleteItem(item.id)}
                                      className="text-text-dim hover:text-red-500 transition-colors p-1"
                                     >
                                       <Trash2 size={14} />
                                     </button>
                                  </td>
                               </tr>
                             );
                           })}
                        </tbody>
                     </table>
                  </div>
               </div>
             ))
           )}
        </div>
      </div>

      {/* Modal: Agregar Artículo */}
      <AnimatePresence>
        {isAddingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
             <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="bg-bg-sidebar border border-border-dim rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
             >
                <div className="bg-bg-accent p-6 border-b border-border-dim flex justify-between items-center">
                   <h3 className="text-sm font-black text-text-main uppercase tracking-widest">Nuevo Artículo de Producción</h3>
                   <button onClick={() => setIsAddingItem(false)} className="text-text-dim hover:text-text-main"><X size={20} /></button>
                </div>
                <div className="p-8 space-y-6">
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-text-dim uppercase tracking-wider">Categoría / Familia</label>
                      <input 
                        type="text"
                        placeholder="EJ: PANADERÍA, PASTELERÍA..."
                        className="w-full bg-bg-main border border-border-dim rounded px-4 py-3 text-xs font-bold uppercase tracking-widest focus:border-brand-500 outline-none transition-all"
                        value={newItem.category}
                        onChange={(e) => setNewItem({...newItem, category: e.target.value})}
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-text-dim uppercase tracking-wider">Nombre del Producto</label>
                      <input 
                        type="text"
                        placeholder="EJ: PAN DE CAMPO"
                        className="w-full bg-bg-main border border-border-dim rounded px-4 py-3 text-xs font-bold uppercase tracking-widest focus:border-brand-500 outline-none transition-all"
                        value={newItem.name}
                        onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-text-dim uppercase tracking-wider">Unidad de Medida</label>
                      <input 
                        type="text"
                        placeholder="EJ: UN, KG, DOCENA..."
                        className="w-full bg-bg-main border border-border-dim rounded px-4 py-3 text-xs font-bold uppercase tracking-widest focus:border-brand-500 outline-none transition-all"
                        value={newItem.unit}
                        onChange={(e) => setNewItem({...newItem, unit: e.target.value})}
                      />
                   </div>
                   
                   <button 
                     onClick={handleAddItem}
                     disabled={loading}
                     className="w-full bg-brand-500 text-black py-4 rounded font-black text-[11px] uppercase tracking-widest shadow-xl shadow-brand-500/20 flex items-center justify-center gap-2"
                   >
                     {loading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                     GUARDAR PRODUCTO
                   </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Carga Diaria */}
      <AnimatePresence>
        {isLoggingDaily && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
             <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="bg-bg-sidebar border border-border-dim rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
             >
                <div className="bg-bg-accent p-6 border-b border-border-dim flex justify-between items-center">
                   <div>
                      <h3 className="text-sm font-black text-text-main uppercase tracking-widest">Carga de Producción Diaria</h3>
                      <p className="text-[10px] text-text-dim font-bold uppercase mt-1">Registrar lo producido el día de hoy</p>
                   </div>
                   <button onClick={() => setIsLoggingDaily(false)} className="text-text-dim hover:text-text-main"><X size={20} /></button>
                </div>

                <div className="p-6 bg-bg-main border-b border-border-dim flex items-center gap-6">
                   <div className="space-y-2">
                      <label className="text-[9px] font-black text-text-dim uppercase">Fecha de Producción</label>
                      <input 
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-bg-sidebar border border-border-dim rounded px-4 py-2 text-xs font-mono text-brand-500 outline-none"
                      />
                   </div>
                   <div className="p-3 bg-brand-500/5 rounded border border-brand-500/10">
                      <p className="text-[9px] font-bold text-brand-500 uppercase flex items-center gap-2">
                         <AlertCircle size={14} /> Ingrese las cantidades producidas para los artículos correspondientes
                      </p>
                   </div>
                </div>

                <div className="flex-1 overflow-y-auto p-0 custom-scrollbar">
                   <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 z-10 bg-bg-accent">
                         <tr className="text-[10px] font-black text-text-dim uppercase tracking-widest border-b border-border-dim">
                            <th className="px-8 py-4">Artículo</th>
                            <th className="px-8 py-4 text-center">Unidad</th>
                            <th className="px-8 py-4 text-center">Cantidad Producida</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-border-dim/20">
                         {items.map(item => (
                           <tr key={item.id} className="hover:bg-bg-accent/30 transition-colors">
                              <td className="px-8 py-4">
                                 <p className="text-[11px] font-black text-text-main uppercase">{item.name}</p>
                                 <p className="text-[9px] font-bold text-text-dim uppercase opacity-50">{item.category}</p>
                              </td>
                              <td className="px-8 py-4 text-center font-mono text-text-dim uppercase">{item.unit}</td>
                              <td className="px-8 py-4">
                                 <input 
                                   type="number"
                                   className="w-32 mx-auto bg-bg-main border border-border-dim rounded px-3 py-2 text-center text-sm font-mono focus:border-brand-500 outline-none text-brand-500 font-bold"
                                   value={dailyInputs[item.id] || ''}
                                   onChange={(e) => setDailyInputs({
                                     ...dailyInputs,
                                     [item.id]: parseFloat(e.target.value) || 0
                                   })}
                                   placeholder="0.00"
                                 />
                              </td>
                           </tr>
                         ))}
                      </tbody>
                   </table>
                </div>

                <div className="p-8 bg-bg-accent border-t border-border-dim">
                   <button 
                     onClick={handleSaveDailyLog}
                     disabled={loading || Object.keys(dailyInputs).length === 0}
                     className="w-full bg-brand-500 text-black py-4 rounded font-black text-[12px] uppercase tracking-widest shadow-xl shadow-brand-500/20 flex items-center justify-center gap-3 active:scale-95 transition-all"
                   >
                     {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                     CONFIRMAR Y GUARDAR PRODUCCIÓN DEL DÍA
                   </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
