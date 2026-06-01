import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Utensils, 
  AlertTriangle, 
  Plus, 
  Save, 
  Trash2, 
  ChevronRight, 
  Calendar,
  Layers,
  TrendingDown,
  ChevronDown,
  Loader2,
  X,
  FileUp,
  Download,
  CheckCircle2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';
import { Branch, TablewareItem, TablewareWeeklyCheck } from '../types';

interface TablewareViewProps {
  branches: Branch[];
  selectedBranchId: string;
}

export default function TablewareView({ branches, selectedBranchId }: TablewareViewProps) {
  const [items, setItems] = useState<TablewareItem[]>([]);
  const [checks, setChecks] = useState<TablewareWeeklyCheck[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [isInputtingWeek, setIsInputtingWeek] = useState(false);

  // Import State
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  
  // Form States
  const [newItem, setNewItem] = useState({
    category: '',
    name: '',
    idealStock: 0,
    criticalStock: 0
  });

  const [selectedWeek, setSelectedWeek] = useState(new Date().toISOString().split('T')[0]);
  const [weeklyInputs, setWeeklyInputs] = useState<Record<string, { initial: number, final: number }>>({});

  const categories = Array.from(new Set(items.map(i => i.category)));

  const fetchData = async () => {
    setLoading(true);
    try {
      let itemsQuery = supabase.from('tableware_items').select('*');
      if (selectedBranchId !== 'all') {
        itemsQuery = itemsQuery.eq('branch_id', selectedBranchId);
      }
      const { data: itemsData } = await itemsQuery;
      
      if (itemsData) {
        setItems(itemsData.map(i => ({
          id: i.id,
          branchId: i.branch_id,
          category: i.category,
          name: i.name,
          idealStock: i.ideal_stock,
          criticalStock: i.critical_stock
        })));
      }

      let checksQuery = supabase.from('tableware_inventory').select('*').order('date', { ascending: false });
      if (selectedBranchId !== 'all') {
        checksQuery = checksQuery.eq('branch_id', selectedBranchId);
      }
      const { data: checksData } = await checksQuery;

      if (checksData) {
        setChecks(checksData.map(c => ({
          id: c.id,
          branchId: c.branch_id,
          itemId: c.item_id,
          date: c.date,
          initialStock: c.initial_stock,
          finalStock: c.final_stock,
          breakages: c.breakages
        })));
      }
    } catch (err) {
      console.error('Error fetching tableware:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedBranchId]);

  const handleExportTemplate = () => {
    const template = [
      {
        Sucursal: branches[0]?.name || 'Nombre Sucursal',
        Rubro: 'PLATOS',
        Articulo: 'PLATO PLAYO 26CM',
        Cantidad: 120,
        'Stock Ideal': 120,
        'Stock Crítico': 60
      },
      {
        Sucursal: branches[0]?.name || 'Nombre Sucursal',
        Rubro: 'CUBIERTOS',
        Articulo: 'TENEDOR MESA',
        Cantidad: 200,
        'Stock Ideal': 200,
        'Stock Crítico': 100
      }
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo Vajilla");
    XLSX.writeFile(wb, "Modelo_Importacion_Vajilla.xlsx");
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws) as any[];

      // Map columns: Sucursal, Rubro, Articulo, Cantidad, Stock Ideal, Stock Crítico
      const mapped = data.map(row => {
        const branchName = (row.Sucursal || row.Branch || '').toString().trim().toLowerCase();
        // Try exact match first, then partial match (e.g. "Perón" matches "CRAFT Perón")
        const branch = branches.find(b => b.name.toLowerCase() === branchName) ||
                       branches.find(b => b.name.toLowerCase().includes(branchName)) ||
                       branches.find(b => branchName.includes(b.name.toLowerCase().replace('craft ', '').trim()));
        
        const quantity = Math.round(Number(row.Cantidad || row.Quantity || 0));
        const ideal = Math.round(Number(row['Stock Ideal'] || row.Ideal || quantity || 0));
        const critical = Math.round(Number(row['Stock Crítico'] || row.Critico || row.Critical || 0));

        return {
          branch_id: branch?.id || selectedBranchId,
          branch_name: branch?.name || 'Desconocida',
          category: (row.Rubro || row.Category || 'GENERAL').toString().toUpperCase(),
          name: (row.Articulo || row.Item || row.Nombre || '').toString().toUpperCase(),
          quantity: quantity,
          ideal_stock: ideal,
          critical_stock: critical || Math.floor(ideal * 0.5) // Fallback to 50% if not provided
        };
      }).filter(i => i.name && i.branch_id !== 'all');

      setImportPreview(mapped);
      setIsImporting(true);
    };
    reader.readAsBinaryString(file);
  };

  const confirmImport = async () => {
    setLoading(true);
    try {
      // 1. Insert items and get them back with IDs
      const { data: insertedItems, error: itemsError } = await supabase
        .from('tableware_items')
        .insert(importPreview.map(i => ({
          branch_id: i.branch_id,
          category: i.category,
          name: i.name,
          ideal_stock: Math.round(Number(i.ideal_stock) || 0),
          critical_stock: Math.round(Number(i.critical_stock) || 0)
        })))
        .select();

      if (itemsError) throw itemsError;

      // 2. Prepare and insert initial inventory records
      if (insertedItems && insertedItems.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        const inventoryRecords = insertedItems.map(item => {
          // Find original imported data to get the 'quantity' (Cantidad)
          const original = importPreview.find(p => 
            p.name === item.name && 
            p.branch_id === item.branch_id && 
            p.category === item.category
          );
          const qty = Math.round(Number(original?.quantity) || 0);

          return {
            branch_id: item.branch_id,
            item_id: item.id,
            date: today,
            initial_stock: qty,
            final_stock: qty,
            breakages: 0
          };
        });

        const { error: invError } = await supabase
          .from('tableware_inventory')
          .insert(inventoryRecords);
        
        if (invError) throw invError;
      }

      setIsImporting(false);
      setImportPreview([]);
      fetchData();
    } catch (err: any) {
      console.error('Import error:', err);
      alert('Error al realizar la importación: ' + (err?.message || 'error desconocido'));
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async () => {
    if (!newItem.name || !newItem.category || selectedBranchId === 'all') return;
    setLoading(true);
    try {
      const { error } = await supabase.from('tableware_items').insert([{
        branch_id: selectedBranchId,
        category: newItem.category.toUpperCase(),
        name: newItem.name.toUpperCase(),
        ideal_stock: newItem.idealStock,
        critical_stock: newItem.criticalStock
      }]);
      if (error) throw error;
      setIsAddingItem(false);
      setNewItem({ category: '', name: '', idealStock: 0, criticalStock: 0 });
      fetchData();
    } catch (err) {
      alert('Error al guardar el artículo');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveWeeklyCheck = async () => {
    if (selectedBranchId === 'all') return;
    setLoading(true);
    try {
      const entries = Object.entries(weeklyInputs).map(([itemId, values]) => {
        const v = values as { initial: number, final: number };
        return {
          branch_id: selectedBranchId,
          item_id: itemId,
          date: selectedWeek,
          initial_stock: v.initial,
          final_stock: v.final,
          breakages: v.initial - v.final
        };
      });

      const { error } = await supabase.from('tableware_inventory').upsert(entries, {
        onConflict: 'branch_id,item_id,date'
      });
      
      if (error) throw error;
      setIsInputtingWeek(false);
      setWeeklyInputs({});
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Error al guardar el inventario semanal');
    } finally {
      setLoading(false);
    }
  };

  const getLatestCheck = (itemId: string) => {
    return checks.find(c => c.itemId === itemId);
  };

  const canShowContent = selectedBranchId !== 'all';

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
            <Utensils size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-main uppercase tracking-tight">Gestión de Vajilla</h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest">Stock Ideal, Crítico y Control de Roturas</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={handleExportTemplate}
            className="bg-bg-accent hover:bg-bg-card border border-border-dim text-text-dim px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
          >
            <Download size={14} /> MODELO
          </button>
          
          <label className="bg-bg-accent hover:bg-bg-card border border-border-dim text-text-dim px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2">
            <FileUp size={14} /> IMPORTAR
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
          </label>

          {canShowContent && (
            <>
              <button 
                onClick={() => setIsAddingItem(true)}
                className="bg-bg-accent hover:bg-bg-card border border-border-dim text-text-dim px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
              >
                <Plus size={14} /> NUEVO ÍTEM
              </button>
              <button 
                onClick={() => setIsInputtingWeek(true)}
                className="bg-brand-500 hover:bg-brand-600 text-black px-5 py-2 rounded text-[9px] font-black uppercase tracking-widest shadow-xl transition-all flex items-center gap-2"
              >
                <Calendar size={14} /> CARGA SEMANAL
              </button>
            </>
          )}
        </div>
      </div>

      {!canShowContent && !isImporting ? (
         <div className="bg-bg-sidebar border border-border-dim border-dashed p-20 rounded text-center flex flex-col items-center justify-center">
            <Utensils size={40} className="text-text-dim/20 mb-4" />
            <h3 className="text-sm font-black text-text-main uppercase tracking-widest">Seleccione una Sucursal</h3>
            <p className="text-[10px] text-text-dim mt-2 uppercase tracking-widest max-w-xs">Para gestionar la vajilla o cargar inventarios semanales debe elegir una sucursal específica. <br/><br/>O use el botón <b>IMPORTAR</b> para carga inicial masiva.</p>
         </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Alerts / Stats Sidebar */}
          <div className="lg:col-span-1 space-y-6">
             <div className="bg-bg-sidebar border border-border-dim p-6 rounded space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-[#8B949E] border-b border-border-dim pb-2">Resumen Operativo</h3>
                
                <div className="space-y-4">
                   <div className="bg-bg-accent p-4 rounded border border-border-dim">
                      <p className="text-[9px] font-bold text-text-dim uppercase mb-1">Artículos en {branches.find(b => b.id === selectedBranchId)?.name || 'el Sistema'}</p>
                      <p className="text-2xl font-mono font-black text-text-main">{items.length}</p>
                   </div>
  
                   {items.some(i => (getLatestCheck(i.id)?.finalStock || 0) <= i.criticalStock) && (
                     <div className="bg-red-500/10 border border-red-500/30 p-4 rounded text-red-500">
                        <div className="flex items-center gap-2 mb-2">
                           <AlertTriangle size={16} />
                           <span className="text-[10px] font-black uppercase">ALERTA CRÍTICA</span>
                        </div>
                        <p className="text-[9px] font-bold uppercase leading-relaxed">
                          {items.filter(i => (getLatestCheck(i.id)?.finalStock || 0) <= i.criticalStock).length} artículos por debajo del stock crítico.
                        </p>
                     </div>
                   )}
                </div>
             </div>
  
             <div className="bg-brand-500/5 border border-brand-500/20 p-6 rounded">
                <h4 className="text-[10px] font-black uppercase text-brand-500 mb-3">Roturas Recientes</h4>
                <div className="space-y-3">
                   {checks.slice(0, 3).map((c, idx) => (
                     <div key={idx} className="flex justify-between items-center text-[10px]">
                        <span className="text-text-dim uppercase font-bold truncate max-w-[120px]">{items.find(i => i.id === c.itemId)?.name}</span>
                        <span className="text-red-400 font-mono font-black">-{c.breakages}</span>
                     </div>
                   ))}
                   {checks.length === 0 && <p className="text-[9px] text-text-dim italic uppercase tracking-tighter">Sin registros</p>}
                </div>
             </div>
          </div>
  
          {/* Categories and Items */}
          <div className="lg:col-span-3 space-y-8">
             {categories.length === 0 ? (
               <div className="bg-bg-sidebar border border-border-dim p-20 rounded text-center flex flex-col items-center justify-center">
                  <Layers size={40} className="text-text-dim/20 mb-4" />
                  <p className="text-[10px] font-bold text-text-dim uppercase tracking-widest">No hay artículos cargados en esta sucursal</p>
                  <button 
                    onClick={() => setIsAddingItem(true)}
                    className="mt-4 text-brand-500 text-[10px] font-black uppercase hover:underline"
                  >
                    Cargar primer artículo ahora
                  </button>
               </div>
             ) : (
               categories.map(cat => (
                 <div key={cat} className="bg-bg-sidebar border border-border-dim rounded overflow-hidden">
                    <div className="bg-bg-accent px-6 py-4 border-b border-border-dim flex justify-between items-center">
                       <h3 className="text-[10px] font-black uppercase tracking-widest text-text-main flex items-center gap-2">
                          <ChevronDown size={14} className="text-brand-500" /> {cat}
                       </h3>
                       <span className="text-[9px] font-bold text-text-dim uppercase opacity-40">{items.filter(i => i.category === cat).length} ÍTEMS</span>
                    </div>
                    <div className="overflow-x-auto">
                       <table className="w-full text-[10px]">
                          <thead>
                             <tr className="text-left text-text-dim font-bold uppercase tracking-widest border-b border-border-dim">
                                <th className="px-6 py-4">Artículo</th>
                                <th className="px-6 py-4 text-center">Stock Ideal</th>
                                <th className="px-6 py-4 text-center">Crítico</th>
                                <th className="px-6 py-4 text-center">Actual (EF)</th>
                                <th className="px-6 py-4 text-center">Roturas Sem.</th>
                                <th className="px-6 py-4 text-right">Estado</th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-border-dim/30">
                             {items.filter(i => i.category === cat).map(item => {
                               const lastCheck = getLatestCheck(item.id);
                               const currentStock = lastCheck?.finalStock || 0;
                               const isCritical = currentStock <= item.criticalStock;
                               const isLow = currentStock < item.idealStock;
  
                               return (
                                 <tr key={item.id} className="hover:bg-bg-accent/30 transition-colors">
                                    <td className="px-6 py-4 font-black text-text-main uppercase">{item.name}</td>
                                    <td className="px-6 py-4 text-center font-mono text-text-dim">{item.idealStock}</td>
                                    <td className="px-6 py-4 text-center font-mono text-red-500/70 font-bold">{item.criticalStock}</td>
                                    <td className="px-6 py-4 text-center font-mono font-black text-text-main text-sm">
                                       {lastCheck ? currentStock : '--'}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                       {lastCheck && lastCheck.breakages > 0 ? (
                                         <span className="text-red-400 font-mono font-bold">-{lastCheck.breakages}</span>
                                       ) : lastCheck ? (
                                         <span className="text-emerald-500 font-mono">0</span>
                                       ) : '--'}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                       <span className={cn(
                                         "px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest border",
                                         isCritical ? "bg-red-500/20 text-red-500 border-red-500/40" :
                                         isLow ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" :
                                         "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                       )}>
                                          {isCritical ? 'CRÍTICO' : isLow ? 'REPONER' : 'OK'}
                                       </span>
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
      )}

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
                   <h3 className="text-sm font-black text-text-main uppercase tracking-widest">Nuevo Artículo de Vajilla</h3>
                   <button onClick={() => setIsAddingItem(false)} className="text-text-dim hover:text-text-main"><X size={20} /></button>
                </div>
                <div className="p-8 space-y-6">
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-text-dim uppercase tracking-wider">Rubro / Categoría</label>
                      <input 
                        type="text"
                        placeholder="EJ: PLATOS, CUBIERTOS..."
                        className="w-full bg-bg-main border border-border-dim rounded px-4 py-3 text-xs font-bold uppercase tracking-widest focus:border-brand-500 outline-none transition-all"
                        value={newItem.category}
                        onChange={(e) => setNewItem({...newItem, category: e.target.value})}
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-text-dim uppercase tracking-wider">Nombre del Artículo</label>
                      <input 
                        type="text"
                        placeholder="EJ: PLATO PLAYO 26CM"
                        className="w-full bg-bg-main border border-border-dim rounded px-4 py-3 text-xs font-bold uppercase tracking-widest focus:border-brand-500 outline-none transition-all"
                        value={newItem.name}
                        onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                      />
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                         <label className="text-[10px] font-black text-text-dim uppercase tracking-wider">Stock Ideal</label>
                         <input 
                           type="number"
                           className="w-full bg-bg-main border border-border-dim rounded px-4 py-3 text-sm font-mono focus:border-brand-500 outline-none transition-all"
                           value={newItem.idealStock}
                           onChange={(e) => setNewItem({...newItem, idealStock: parseInt(e.target.value) || 0})}
                         />
                      </div>
                      <div className="space-y-2">
                         <label className="text-[10px] font-black text-text-dim uppercase tracking-wider">Stock Crítico</label>
                         <input 
                           type="number"
                           className="w-full bg-bg-main border border-border-dim rounded px-4 py-3 text-sm font-mono focus:border-brand-500 outline-none transition-all"
                           value={newItem.criticalStock}
                           onChange={(e) => setNewItem({...newItem, criticalStock: parseInt(e.target.value) || 0})}
                         />
                      </div>
                   </div>
                   
                   <button 
                     onClick={handleAddItem}
                     disabled={loading}
                     className="w-full bg-brand-500 text-black py-4 rounded font-black text-[11px] uppercase tracking-widest shadow-xl shadow-brand-500/20 flex items-center justify-center gap-2"
                   >
                     {loading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                     GUARDAR ARTÍCULO
                   </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Import Preview */}
      <AnimatePresence>
        {isImporting && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
             <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="bg-bg-sidebar border border-border-dim rounded-xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden"
             >
                <div className="bg-bg-accent p-6 border-b border-border-dim flex justify-between items-center">
                   <div>
                      <h3 className="text-sm font-black text-brand-500 uppercase tracking-widest flex items-center gap-2">
                         <CheckCircle2 size={18} /> Previsualización de Importación
                      </h3>
                      <p className="text-[10px] text-text-dim font-bold uppercase mt-1">Se cargarán {importPreview.length} artículos a sus respectivas sucursales</p>
                   </div>
                   <button onClick={() => setIsImporting(false)} className="text-text-dim hover:text-text-main"><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-0 custom-scrollbar">
                   <table className="w-full text-left border-collapse text-[10px]">
                      <thead className="sticky top-0 z-10 bg-bg-accent shadow-sm">
                         <tr className="font-black text-text-dim uppercase tracking-widest border-b border-border-dim">
                            <th className="px-8 py-4">Sucursal</th>
                            <th className="px-8 py-4">Rubro</th>
                            <th className="px-8 py-4">Artículo</th>
                            <th className="px-8 py-4 text-center">Cantidad Inicial</th>
                            <th className="px-8 py-4 text-center">Stock Ideal</th>
                            <th className="px-8 py-4 text-center">Stock Crítico</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-border-dim/20">
                         {importPreview.map((i, idx) => (
                           <tr key={idx} className="hover:bg-bg-accent/30 transition-colors">
                              <td className="px-8 py-4 font-bold text-brand-500 uppercase">{i.branch_name}</td>
                              <td className="px-8 py-4 uppercase text-text-dim font-bold">{i.category}</td>
                              <td className="px-8 py-4 font-black text-text-main uppercase">{i.name}</td>
                              <td className="px-8 py-4 text-center font-mono font-black text-brand-500 text-sm">{i.quantity}</td>
                              <td className="px-8 py-4 text-center font-mono text-text-main text-sm">{i.ideal_stock}</td>
                              <td className="px-8 py-4 text-center font-mono text-red-500/60 uppercase">{i.critical_stock}</td>
                           </tr>
                         ))}
                      </tbody>
                   </table>
                </div>

                <div className="p-8 bg-bg-accent border-t border-border-dim flex gap-4">
                   <button 
                     onClick={confirmImport}
                     disabled={loading}
                     className="flex-1 bg-brand-500 text-black py-4 rounded font-black text-[12px] uppercase tracking-widest shadow-xl shadow-brand-500/20 flex items-center justify-center gap-3"
                   >
                     {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                     CONFIRMAR Y CARGAR TODO
                   </button>
                   <button 
                     onClick={() => setIsImporting(false)}
                     className="px-10 py-4 rounded border border-border-dim text-text-dim text-[12px] font-black uppercase tracking-widest hover:bg-bg-sidebar transition-all"
                   >
                     CANCELAR
                   </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Carga Semanal */}
      <AnimatePresence>
        {isInputtingWeek && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
             <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="bg-bg-sidebar border border-border-dim rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
             >
                <div className="bg-bg-accent p-6 border-b border-border-dim flex justify-between items-center">
                   <div>
                      <h3 className="text-sm font-black text-text-main uppercase tracking-widest">Inventario Semanal Vajilla</h3>
                      <p className="text-[10px] text-text-dim font-bold uppercase mt-1">Carga de existencias iniciales y finales</p>
                   </div>
                   <button onClick={() => setIsInputtingWeek(false)} className="text-text-dim hover:text-text-main"><X size={20} /></button>
                </div>

                <div className="p-6 bg-bg-main border-b border-border-dim flex items-center gap-6">
                   <div className="space-y-2">
                      <label className="text-[9px] font-black text-text-dim uppercase">Semana de Control</label>
                      <input 
                        type="date"
                        value={selectedWeek}
                        onChange={(e) => setSelectedWeek(e.target.value)}
                        className="bg-bg-sidebar border border-border-dim rounded px-4 py-2 text-xs font-mono text-brand-500 outline-none"
                      />
                   </div>
                   <div className="p-3 bg-brand-500/5 rounded border border-brand-500/10">
                      <p className="text-[9px] font-bold text-brand-500 uppercase flex items-center gap-2">
                         <TrendingDown size={14} /> El sistema calculará las roturas automáticamente: EI - EF
                      </p>
                   </div>
                </div>

                <div className="flex-1 overflow-y-auto p-0 custom-scrollbar">
                   <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 z-10 bg-bg-accent">
                         <tr className="text-[10px] font-black text-text-dim uppercase tracking-widest border-b border-border-dim">
                            <th className="px-8 py-4">Artículo</th>
                            <th className="px-8 py-4 text-center">S. Ideal</th>
                            <th className="px-8 py-4 text-center">S. Inicial (EI)</th>
                            <th className="px-8 py-4 text-center">S. Final (EF)</th>
                            <th className="px-8 py-4 text-center">Roturas</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-border-dim/20">
                         {items.map(item => {
                           const currentInput = weeklyInputs[item.id] || { initial: 0, final: 0 };
                           return (
                             <tr key={item.id} className="hover:bg-bg-accent/30 transition-colors">
                                <td className="px-8 py-4">
                                   <p className="text-[11px] font-black text-text-main uppercase">{item.name}</p>
                                   <p className="text-[9px] font-bold text-text-dim uppercase opacity-50">{item.category}</p>
                                </td>
                                <td className="px-8 py-4 text-center font-mono text-text-dim opacity-50">{item.idealStock}</td>
                                <td className="px-8 py-4">
                                   <input 
                                     type="number"
                                     className="w-24 mx-auto bg-bg-main border border-border-dim rounded px-3 py-2 text-center text-sm font-mono focus:border-brand-500 outline-none"
                                     value={currentInput.initial}
                                     onChange={(e) => setWeeklyInputs({
                                       ...weeklyInputs,
                                       [item.id]: { ...currentInput, initial: parseInt(e.target.value) || 0 }
                                     })}
                                   />
                                </td>
                                <td className="px-8 py-4">
                                   <input 
                                     type="number"
                                     className="w-24 mx-auto bg-bg-main border border-border-dim rounded px-3 py-2 text-center text-sm font-mono focus:border-brand-500 outline-none text-brand-500 font-bold"
                                     value={currentInput.final}
                                     onChange={(e) => setWeeklyInputs({
                                       ...weeklyInputs,
                                       [item.id]: { ...currentInput, final: parseInt(e.target.value) || 0 }
                                     })}
                                   />
                                </td>
                                <td className="px-8 py-4 text-center">
                                   <span className={cn(
                                     "font-mono font-black",
                                     currentInput.initial - currentInput.final > 0 ? "text-red-400" : "text-emerald-500"
                                   )}>
                                      {currentInput.initial - currentInput.final}
                                   </span>
                                </td>
                             </tr>
                           );
                         })}
                      </tbody>
                   </table>
                </div>

                <div className="p-8 bg-bg-accent border-t border-border-dim">
                   <button 
                     onClick={handleSaveWeeklyCheck}
                     disabled={loading || Object.keys(weeklyInputs).length === 0}
                     className="w-full bg-brand-500 text-black py-4 rounded font-black text-[12px] uppercase tracking-widest shadow-xl shadow-brand-500/20 flex items-center justify-center gap-3 active:scale-95 transition-all"
                   >
                     {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                     CONFIRMAR Y GUARDAR INVENTARIO DE LA SEMANA
                   </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
