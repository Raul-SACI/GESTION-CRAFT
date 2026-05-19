import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Settings2, 
  Table2, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle,
  Plus,
  X,
  Search,
  BookOpen,
  Info,
  Trash2,
  Edit2,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Branch, StockItem, Product } from '../types';
import { supabase } from '../lib/supabase';

export default function DeviationControlView({ 
  branches, 
  selectedBranchId,
  controlledItemIds: initialControlledItemIds,
  setControlledItemIds: setInitialControlledItemIds,
  items,
  setItems,
  products,
  setProducts
}: { 
  branches: Branch[], 
  selectedBranchId: string,
  controlledItemIds: string[],
  setControlledItemIds: React.Dispatch<React.SetStateAction<string[]>>,
  items: StockItem[],
  setItems: React.Dispatch<React.SetStateAction<StockItem[]>>,
  products: Product[],
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>
}) {
  const [activeTab, setActiveTab] = useState<'selector' | 'recetas' | 'comparativo' | 'gestion' | 'planilla'>('comparativo');
  
  // Persistence State
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [controlledIds, setControlledIds] = useState<string[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Daily Logs State
  const [dailyLogs, setDailyLogs] = useState<any[]>([]);
  const [isSavingDaily, setIsSavingDaily] = useState(false);

  // Fetch Daily Logs
  useEffect(() => {
    const fetchDailyLogs = async () => {
      const { data, error } = await supabase
        .from('inventory_logs')
        .select('*')
        .match({ branch_id: selectedBranchId })
        .gte('date', `${selectedMonth}-01`)
        .lte('date', `${selectedMonth}-31`);

      if (data) {
        setDailyLogs(data.map(d => ({
          ...d,
          itemId: d.item_id,
          purchases: d.compras,
          waste: d.decomisos,
          theoretical_sales: d.ventas_teorico,
          staff_consumption: d.consumo_personal,
          loans: d.prestamos
        })));
      }
    };
    if (selectedBranchId && selectedMonth) {
      fetchDailyLogs();
    }
  }, [selectedBranchId, selectedMonth]);

  const updateDailyLog = async (date: string, itemId: string, field: string, value: number) => {
    // Map field to DB column
    const columnMap: Record<string, string> = {
      purchases: 'compras',
      waste: 'decomisos',
      theoretical_sales: 'ventas_teorico'
    };

    const dbField = columnMap[field];
    if (!dbField) return;

    const { data, error } = await supabase
      .from('inventory_logs')
      .upsert({
        branch_id: selectedBranchId,
        item_id: itemId,
        date,
        [dbField]: value
      }, { onConflict: 'branch_id,item_id,date' })
      .select()
      .single();

    if (data) {
      setDailyLogs(prev => {
        const otherLogs = prev.filter(l => !(l.date === date && l.item_id === itemId));
        return [...otherLogs, {
          ...data,
          itemId: data.item_id,
          purchases: data.compras,
          waste: data.decomisos,
          theoretical_sales: data.ventas_teorico,
          staff_consumption: data.consumo_personal,
          loans: data.prestamos
        }];
      });
    }
  };

  const daysInMonth = () => {
    const year = parseInt(selectedMonth.split('-')[0]);
    const month = parseInt(selectedMonth.split('-')[1]);
    return new Date(year, month, 0).getDate();
  };

  // New CRUD state
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [itemForm, setItemForm] = useState({ name: '', unit: '', cost: 0 });
  const [productForm, setProductForm] = useState({ name: '', category: '' });

  // 2. Recipes State
  const [recipes, setRecipes] = useState<Record<string, { productId: string, itemId: string, quantity: number }[]>>({});
  const [recipeDisplayUnits, setRecipeDisplayUnits] = useState<Record<string, string>>({}); // key: productId-itemId

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [recipeSearch, setRecipeSearch] = useState('');

  // Fetch Controlled Items for Month/Branch
  useEffect(() => {
    const fetchMonthlyControls = async () => {
      setIsLoadingHistory(true);
      const { data, error } = await supabase
        .from('monthly_controlled_items')
        .select('item_ids')
        .match({ branch_id: selectedBranchId, month: selectedMonth })
        .maybeSingle();

      if (data) {
        setControlledIds(data.item_ids || []);
      } else {
        // If no specific month found, default to the current active selection
        setControlledIds(initialControlledItemIds || []);
      }
      setIsLoadingHistory(false);
    };

    if (selectedBranchId && selectedMonth) {
      fetchMonthlyControls();
    }
  }, [selectedMonth, selectedBranchId, initialControlledItemIds]);

  const saveMonthlyControl = async () => {
    const { error } = await supabase
      .from('monthly_controlled_items')
      .upsert({
        branch_id: selectedBranchId,
        month: selectedMonth,
        item_ids: controlledIds
      }, { onConflict: 'branch_id,month' });

    if (!error) {
      alert(`Control de desvíos para ${selectedMonth} confirmado exitosamente. Ahora puede cargar la planilla diaria.`);
    } else {
      console.error('Error saving monthly control:', error);
      alert('Error al guardar el control mensual.');
    }
  };

  const getSubUnit = (unit: string) => {
    if (unit?.toLowerCase() === 'kg') return 'gr';
    if (unit?.toLowerCase() === 'l') return 'ml';
    return null;
  };

  const getDisplayQuantity = (itemId: string, quantity: number, productId: string) => {
    const item = items.find(i => i.id === itemId);
    const unit = recipeDisplayUnits[`${productId}-${itemId}`] || item?.unit || '';
    if (unit === 'gr' || unit === 'ml') return quantity * 1000;
    return quantity;
  };

  // Fetch Recipes
  React.useEffect(() => {
    const fetchRecipes = async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('*');
      
      if (data) {
        const grouped: Record<string, any[]> = {};
        data.forEach(r => {
          if (!grouped[r.product_id]) grouped[r.product_id] = [];
          grouped[r.product_id].push({
            productId: r.product_id,
            itemId: r.item_id,
            quantity: r.quantity
          });
        });
        setRecipes(grouped);
      }
    };

    fetchRecipes();
    
    // Default selection
    if (!selectedProductId && products.length > 0) {
      setSelectedProductId(products[0].id);
    }
  }, [products]);

  const addIngredientToRecipe = async (productId: string, itemId: string) => {
    const currentRecipe = recipes[productId] || [];
    if (currentRecipe.some(r => r.itemId === itemId)) return;

    const { error } = await supabase
      .from('recipes')
      .insert({ product_id: productId, item_id: itemId, quantity: 1 });

    if (!error) {
       setRecipes(prev => ({
         ...prev,
         [productId]: [...currentRecipe, { productId, itemId, quantity: 1 }]
       }));
    }
  };

  const updateIngredientQuantity = async (productId: string, itemId: string, displayVal: number) => {
    const item = items.find(i => i.id === itemId);
    const unit = recipeDisplayUnits[`${productId}-${itemId}`] || item?.unit || '';
    const quantity = (unit === 'gr' || unit === 'ml') ? displayVal / 1000 : displayVal;

    const { error } = await supabase
      .from('recipes')
      .update({ quantity })
      .match({ product_id: productId, item_id: itemId });

    if (!error) {
      setRecipes(prev => ({
        ...prev,
        [productId]: (prev[productId] || []).map(r => r.itemId === itemId ? { ...r, quantity } : r)
      }));
    }
  };

  const removeIngredientFromRecipe = async (productId: string, itemId: string) => {
    const { error } = await supabase
      .from('recipes')
      .delete()
      .match({ product_id: productId, item_id: itemId });

    if (!error) {
      setRecipes(prev => ({
        ...prev,
        [productId]: (prev[productId] || []).filter(r => r.itemId !== itemId)
      }));
    }
  };

  const validControlledIds = controlledIds.filter(id => items.some(item => item.id === id));

  // 3. Comparison State (Aggregated data from dailyLogs)
  const deviations = validControlledIds.map(id => {
    const itemLogs = dailyLogs.filter(l => l.itemId === id);
    
    // EI is the first available EI of the month
    const sortedLogs = [...itemLogs].sort((a, b) => a.date.localeCompare(b.date));
    const ei = sortedLogs[0]?.ei || 0;
    const ef = sortedLogs[sortedLogs.length - 1]?.ef || 0;
    
    const totals = itemLogs.reduce((acc, log) => ({
      purchases: acc.purchases + (log.purchases || 0),
      loans: acc.loans + (log.loans || 0),
      waste: acc.waste + (log.waste || 0),
      staff_consumption: acc.staff_consumption + (log.staff_consumption || 0),
      theoretical_sales: acc.theoretical_sales + (log.theoretical_sales || 0)
    }), { purchases: 0, loans: 0, waste: 0, staff_consumption: 0, theoretical_sales: 0 });

    const realConsumption = ei + totals.purchases + totals.loans - totals.waste - totals.staff_consumption - ef;
    
    return { 
      itemId: id, 
      real: realConsumption, 
      theo: totals.theoretical_sales 
    };
  });

  const getSemaphoreColor = (diffPercent: number) => {
    if (diffPercent < 3) return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
    if (diffPercent <= 5) return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
    return 'text-red-500 bg-red-500/10 border-red-500/20';
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-border-dim gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-brand-500/10 p-3 text-brand-500 border border-brand-500/20 rounded-lg shadow-inner">
            <ShieldAlert size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-text-main uppercase tracking-tight">Control de Desvíos</h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest italic opacity-70">Consola de Control de Administración</p>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-bg-sidebar border border-border-dim rounded px-3 py-1.5 shadow-sm">
           <CalendarIcon size={14} className="text-brand-500" />
           <input 
             type="month" 
             value={selectedMonth}
             onChange={(e) => setSelectedMonth(e.target.value)}
             className="bg-transparent text-[11px] font-black uppercase text-text-main outline-none cursor-pointer"
           />
        </div>
        
        <div className="flex bg-bg-sidebar p-1 rounded border border-border-dim shadow-sm self-start md:self-center">
          <TabButton active={activeTab === 'comparativo'} onClick={() => setActiveTab('comparativo')} icon={<BarChart3 size={14} />} label="Resultados" />
          <TabButton active={activeTab === 'planilla'} onClick={() => setActiveTab('planilla')} icon={<Table2 size={14} />} label="Planilla Diaria" />
          <TabButton active={activeTab === 'selector'} onClick={() => setActiveTab('selector')} icon={<Settings2 size={14} />} label="Selector de Insumos" />
          <TabButton active={activeTab === 'recetas'} onClick={() => setActiveTab('recetas')} icon={<BookOpen size={14} />} label="Recetas" />
          <TabButton active={activeTab === 'gestion'} onClick={() => setActiveTab('gestion')} icon={<Settings2 size={14} />} label="Maestros" />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'comparativo' && (
          <motion.div key="comp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SummaryCard 
                  label="Desvíos Críticos (>5%)" 
                  value={deviations.filter(d => d.theo > 0 && Math.abs((d.real - d.theo) / d.theo) > 0.05).length.toString()} 
                  color="text-red-500" 
                  icon={<AlertTriangle size={18} />} 
                />
                <SummaryCard 
                  label="Bajo Control" 
                  value={`${validControlledIds.length}`} 
                  color="text-brand-500" 
                  icon={<CheckCircle2 size={18} />} 
                />
                <SummaryCard 
                  label="Gap Real vs Teo" 
                  value={`${(() => {
                    const totalReal = deviations.reduce((acc, d) => acc + d.real, 0);
                    const totalTheo = deviations.reduce((acc, d) => acc + d.theo, 0);
                    if (totalTheo === 0) return "0%";
                    return ((Math.abs(totalReal - totalTheo) / totalTheo) * 100).toFixed(1) + "%";
                  })()}`} 
                  color="text-orange-500" icon={<BarChart3 size={18} />} 
                />
              </div>

            <div className="bg-bg-sidebar border border-border-dim rounded-lg overflow-hidden shadow-xl">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-bg-accent border-b border-border-dim text-text-dim uppercase font-black text-left">
                    <th className="px-6 py-4 tracking-widest">Insumo</th>
                    <th className="px-4 py-4 text-center tracking-widest">Consumo Real</th>
                    <th className="px-4 py-4 text-center tracking-widest">Consumo Teórico</th>
                    <th className="px-4 py-4 text-center tracking-widest">Diferencia</th>
                    <th className="px-4 py-4 text-center tracking-widest">Semáforo de Fuga</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dim">
                  {deviations.map(dev => {
                    const item = items.find(i => i.id === dev.itemId);
                    const diffUnits = dev.real - dev.theo;
                    const diffPercent = (diffUnits / dev.theo) * 100;
                    const statusClass = getSemaphoreColor(diffPercent);

                    return (
                      <tr key={dev.itemId} className="hover:bg-bg-accent/50 transition-colors group">
                        <td className="px-6 py-4 font-bold text-text-main uppercase tracking-tighter">
                          {item?.name} <span className="text-[9px] text-text-dim opacity-50 ml-2">({item?.unit})</span>
                        </td>
                        <td className="px-4 py-4 text-center font-mono">{dev.real.toLocaleString()}</td>
                        <td className="px-4 py-4 text-center font-mono opacity-60 italic">{dev.theo.toLocaleString()}</td>
                        <td className="px-4 py-4 text-center font-mono font-bold text-text-dim">
                          {diffUnits > 0 ? '+' : ''}{diffUnits.toLocaleString()}
                        </td>
                        <td className="px-4 py-4">
                          <div className={cn("mx-auto w-40 py-1.5 rounded-full border text-center font-black uppercase tracking-widest text-[9px] flex items-center justify-center gap-2", statusClass)}>
                             <span className={cn("w-2 h-2 rounded-full", diffPercent > 5 ? "bg-red-500" : diffPercent > 3 ? "bg-orange-500" : "bg-emerald-500")}></span>
                             {diffPercent.toFixed(1)}% {diffPercent > 5 ? 'FUGA CRÍTICA' : diffPercent > 3 ? 'ESTADO ALERTA' : 'NORMAL'}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-brand-500/5 border border-brand-500/20 rounded flex items-center gap-4">
               <Info className="text-brand-500" size={24} />
               <p className="text-[10px] uppercase font-bold text-text-main leading-relaxed">
                 <span className="text-brand-500">Semáforo de Desvíos:</span> Verde (Bajo 3%), Amarillo (3-5%), Rojo (Sobre 5%). El desvío indica mercadería no justificada por ventas ni decomisos.
               </p>
            </div>
          </motion.div>
        )}

        {activeTab === 'planilla' && (
          <motion.div key="planilla" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
             <div className="bg-bg-sidebar border border-border-dim rounded-lg overflow-hidden shadow-2xl">
               <div className="p-4 bg-bg-accent border-b border-border-dim flex justify-between items-center whitespace-nowrap">
                  <div>
                    <h3 className="text-xs font-black uppercase text-brand-500 tracking-widest italic">Planilla de Carga Administrativa - {selectedMonth}</h3>
                    <p className="text-[9px] text-text-dim font-bold uppercase mt-1">Compras, Decomisos y Ventas Teóricas (Admin) | EF, Préstamos y Consumo (Sucursal)</p>
                  </div>
                  <div className="flex gap-4 items-center">
                    <div className="flex items-center gap-2">
                       <span className="w-3 h-3 bg-brand-500/20 border border-brand-500 rounded"></span>
                       <span className="text-[9px] font-black text-text-dim uppercase">Admin (Editable)</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <span className="w-3 h-3 bg-bg-accent/50 border border-border-dim rounded"></span>
                       <span className="text-[9px] font-black text-text-dim uppercase">Sucursal (Lectura)</span>
                    </div>
                  </div>
               </div>
               
               <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
                 <table className="w-full border-collapse">
                   <thead className="sticky top-0 z-20 bg-bg-sidebar">
                     <tr className="bg-bg-sidebar border-b border-border-dim text-[9px] font-black uppercase text-text-dim">
                       <th className="px-4 py-3 text-left sticky left-0 bg-bg-sidebar z-30 border-r border-border-dim w-32 min-w-[120px]">Fecha</th>
                       {validControlledIds.map(id => {
                         const item = items.find(i => i.id === id);
                         return (
                           <th key={id} colSpan={6} className="px-4 py-3 text-center border-r border-border-dim bg-bg-accent/30 min-w-[450px]">
                             {item?.name}
                           </th>
                         );
                       })}
                     </tr>
                     <tr className="bg-bg-sidebar border-b border-border-dim text-[8px] font-black uppercase text-text-dim">
                        <th className="px-4 py-2 sticky left-0 bg-bg-sidebar z-30 border-r border-border-dim"></th>
                        {validControlledIds.map(id => (
                          <React.Fragment key={id}>
                            <th className="px-2 py-2 text-center bg-brand-500/5 text-brand-500">Comp.</th>
                            <th className="px-2 py-2 text-center bg-brand-500/5 text-brand-500">Deco.</th>
                            <th className="px-2 py-2 text-center bg-brand-500/5 text-brand-500">V.Teo</th>
                            <th className="px-2 py-2 text-center opacity-60">EF</th>
                            <th className="px-2 py-2 text-center opacity-60">Prést.</th>
                            <th className="px-2 py-2 text-center border-r border-border-dim opacity-60">C.Per</th>
                          </React.Fragment>
                        ))}
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-border-dim">
                     {Array.from({ length: daysInMonth() }).map((_, i) => {
                       const dayNum = i + 1;
                       const dateStr = `${selectedMonth}-${String(dayNum).padStart(2, '0')}`;
                       return (
                         <tr key={dateStr} className="hover:bg-bg-accent/30 transition-colors text-[10px]">
                           <td className="px-4 py-2 font-mono font-bold text-text-dim sticky left-0 bg-bg-sidebar z-10 border-r border-border-dim">
                             {String(dayNum).padStart(2, '0')} / {selectedMonth.split('-')[1]}
                           </td>
                           {validControlledIds.map(id => {
                             const log = dailyLogs.find(l => l.date === dateStr && l.itemId === id) || { 
                               purchases: 0, waste: 0, theoretical_sales: 0, ef: 0, loans: 0, staff_consumption: 0 
                             };
                             return (
                               <React.Fragment key={id}>
                                 <td className="p-0 border-r border-border-dim/30 bg-brand-500/5">
                                   <input 
                                     type="number"
                                     value={log.purchases || ''}
                                     placeholder="0"
                                     onChange={(e) => updateDailyLog(dateStr, id, 'purchases', parseFloat(e.target.value) || 0)}
                                     className="w-full min-w-[70px] h-full p-2 bg-transparent text-center font-mono focus:bg-brand-500/20 outline-none text-brand-500"
                                   />
                                 </td>
                                 <td className="p-0 border-r border-border-dim/30 bg-brand-500/5">
                                   <input 
                                     type="number"
                                     value={log.waste || ''}
                                     placeholder="0"
                                     onChange={(e) => updateDailyLog(dateStr, id, 'waste', parseFloat(e.target.value) || 0)}
                                     className="w-full min-w-[70px] h-full p-2 bg-transparent text-center font-mono focus:bg-brand-500/20 outline-none text-brand-500"
                                   />
                                 </td>
                                 <td className="p-0 border-r border-border-dim/30 bg-brand-500/5">
                                   <input 
                                     type="number"
                                     value={log.theoretical_sales || ''}
                                     placeholder="0"
                                     onChange={(e) => updateDailyLog(dateStr, id, 'theoretical_sales', parseFloat(e.target.value) || 0)}
                                     className="w-full min-w-[70px] h-full p-2 bg-transparent text-center font-mono focus:bg-brand-500/20 outline-none text-brand-500"
                                   />
                                 </td>
                                 <td className="p-0 border-r border-border-dim/30 bg-bg-accent/20">
                                   <div className="w-full min-w-[70px] p-2 text-center font-mono text-text-dim opacity-60">
                                      {log.ef || 0}
                                   </div>
                                 </td>
                                 <td className="p-0 border-r border-border-dim/30 bg-bg-accent/20">
                                   <div className="w-full min-w-[70px] p-2 text-center font-mono text-text-dim opacity-60">
                                      {log.loans || 0}
                                   </div>
                                 </td>
                                 <td className="p-0 border-r border-border-dim bg-bg-accent/20">
                                   <div className="w-full min-w-[70px] p-2 text-center font-mono text-text-dim opacity-60">
                                      {log.staff_consumption || 0}
                                   </div>
                                 </td>
                               </React.Fragment>
                             );
                           })}
                         </tr>
                       );
                     })}
                   </tbody>
                 </table>
               </div>

               {validControlledIds.length === 0 && (
                 <div className="p-12 text-center">
                    <Table2 size={48} className="mx-auto text-text-dim/20 mb-4" />
                    <p className="text-sm font-bold text-text-dim uppercase">No hay insumos seleccionados para este mes</p>
                    <button 
                      onClick={() => setActiveTab('selector')}
                      className="mt-4 text-brand-500 text-[10px] font-black uppercase hover:underline"
                    >
                      Ir al Selector de Insumos
                    </button>
                 </div>
               )}
             </div>
          </motion.div>
        )}

        {activeTab === 'selector' && (
          <motion.div key="selector" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="bg-bg-sidebar border border-border-dim p-8 rounded-lg max-w-2xl mx-auto shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-base font-black uppercase text-brand-500 tracking-widest italic">Selector de Insumos</h3>
                  <p className="text-[10px] text-text-dim font-bold uppercase mt-1">Defina los insumos para el control del mes</p>
                </div>
                <div className="px-4 py-1.5 bg-bg-accent border border-border-dim rounded text-brand-500 font-mono font-black text-xs">
                  {validControlledIds.length} SELECCIONADOS
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map(item => (
                  <button
                    key={item.id}
                    onClick={() => {
                        if (controlledIds.includes(item.id)) {
                          setControlledIds(prev => prev.filter(id => id !== item.id));
                        } else {
                          setControlledIds(prev => [...prev, item.id]);
                        }
                    }}
                    className={cn(
                      "flex items-center justify-between p-4 rounded border transition-all text-left uppercase tracking-widest text-[10px] font-black group",
                      controlledIds.includes(item.id) 
                        ? "bg-brand-500/10 border-brand-500 text-brand-500 shadow-lg shadow-brand-500/5" 
                        : "bg-bg-accent border-border-dim text-text-dim hover:border-brand-500/50"
                    )}
                  >
                    <span>{item.name}</span>
                    <div className={cn(
                      "w-4 h-4 rounded flex items-center justify-center border",
                      controlledIds.includes(item.id) ? "bg-brand-500 border-brand-500" : "border-border-dim"
                    )}>
                       {controlledIds.includes(item.id) && <X size={10} className="text-black rotate-45" />}
                    </div>
                  </button>
                ))}
              </div>

              <button 
                onClick={saveMonthlyControl}
                className="w-full mt-8 bg-brand-500 text-black py-4 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-xl shadow-brand-500/10 font-bold"
              >
                CONFIRMAR CONTROL MENSUAL PARA {selectedMonth}
              </button>
            </div>
          </motion.div>
        )}

        {activeTab === 'recetas' && (
          <motion.div key="recetas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-12 lg:col-span-4 bg-bg-sidebar border border-border-dim rounded-lg p-6 space-y-4 shadow-xl">
                 <h3 className="text-xs font-black uppercase text-brand-500 tracking-widest border-l-2 border-brand-500 pl-3">Productos Vendidos</h3>
                 <div className="relative">
                   <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
                   <input 
                    className="w-full pl-9 pr-4 py-2.5 bg-bg-accent border border-border-dim rounded text-[10px] font-black uppercase tracking-widest outline-none focus:border-brand-500" 
                    placeholder="BUSCAR PRODUCTO..." 
                    onChange={(e) => setRecipeSearch(e.target.value)}
                   />
                 </div>
                 <div className="space-y-1 max-h-[450px] overflow-y-auto custom-scrollbar">
                   {products.filter(p => !recipeSearch || p.name.toLowerCase().includes(recipeSearch.toLowerCase())).map(p => (
                     <button 
                      key={p.id} 
                      onClick={() => setSelectedProductId(p.id)}
                      className={cn(
                        "w-full text-left p-3 rounded transition-colors border-l-2 group",
                        selectedProductId === p.id 
                          ? "bg-brand-500/10 border-brand-500" 
                          : "hover:bg-bg-accent border-transparent hover:border-brand-500/50"
                      )}
                     >
                        <p className={cn(
                          "text-[10px] font-black transition-colors uppercase tracking-tight",
                          selectedProductId === p.id ? "text-brand-500" : "text-text-main group-hover:text-brand-500"
                        )}>{p.name}</p>
                        <p className="text-[8px] text-text-dim uppercase font-bold opacity-60">{p.category}</p>
                     </button>
                   ))}
                 </div>
              </div>

              <div className="col-span-12 lg:col-span-8 bg-bg-sidebar border border-border-dim rounded-lg p-8 space-y-6 shadow-xl border-t-4 border-t-brand-500">
                {selectedProductId ? (
                  <>
                    <div className="flex justify-between items-start">
                       <div>
                         <h3 className="text-xl font-black uppercase text-text-main tracking-tight italic">
                           {products.find(p => p.id === selectedProductId)?.name}
                         </h3>
                         <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mt-1">Configuración de Insumos por Unidad Vendida</p>
                       </div>
                       <button className="p-2.5 bg-bg-accent border border-border-dim rounded text-text-dim hover:text-brand-500 hover:border-brand-500 transition-all">
                          <Settings2 size={16} />
                       </button>
                    </div>

                    <div className="space-y-3">
                       <div className="flex items-center justify-between text-[10px] font-black uppercase text-text-dim tracking-widest pb-3 border-b border-border-dim/50">
                          <span>Insumo Componente</span>
                          <span>Gramos / Unidades</span>
                       </div>
                       {(recipes[selectedProductId] || []).map(line => {
                         const item = items.find(i => i.id === line.itemId);
                         return (
                           <div key={line.itemId} className="flex items-center justify-between bg-bg-accent/40 p-4 rounded border border-border-dim group hover:border-brand-500/30 transition-all">
                              <div className="flex items-center gap-3">
                                 <div className="w-10 h-10 rounded bg-bg-sidebar flex items-center justify-center border border-border-dim text-brand-500 shadow-inner">
                                    <Table2 size={18} />
                                 </div>
                                 <span className="text-[11px] font-black text-text-main uppercase tracking-tight">{item?.name}</span>
                              </div>
                              <div className="flex items-center gap-4">
                                 <div className="flex items-center bg-bg-sidebar border border-border-dim rounded overflow-hidden">
                                    <input 
                                      type="number" 
                                      value={getDisplayQuantity(line.itemId, line.quantity, selectedProductId)} 
                                      onChange={(e) => updateIngredientQuantity(selectedProductId, line.itemId, parseFloat(e.target.value) || 0)}
                                      className="w-24 py-2 px-3 text-center text-[12px] font-mono font-black text-brand-500 bg-transparent outline-none" 
                                    />
                                    <button 
                                       onClick={() => {
                                         const sub = getSubUnit(item?.unit || '');
                                         if (sub) {
                                           setRecipeDisplayUnits(prev => ({
                                             ...prev,
                                             [`${selectedProductId}-${line.itemId}`]: (recipeDisplayUnits[`${selectedProductId}-${line.itemId}`] || item?.unit) === sub ? (item?.unit || '') : sub
                                           }));
                                         }
                                       }}
                                       className={cn(
                                         "bg-bg-accent px-3 py-2 border-l border-border-dim text-[10px] font-bold transition-colors",
                                         getSubUnit(item?.unit || '') ? "cursor-pointer hover:bg-brand-500 hover:text-black" : "cursor-default text-text-dim"
                                       )}
                                    >
                                       {recipeDisplayUnits[`${selectedProductId}-${line.itemId}`] || item?.unit}
                                    </button>
                                 </div>
                                 <button 
                                  onClick={() => removeIngredientFromRecipe(selectedProductId, line.itemId)}
                                  className="text-text-dim hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-2"
                                 >
                                    <X size={16} />
                                 </button>
                              </div>
                           </div>
                         );
                       })}
                       
                       <div className="pt-4 space-y-4">
                          <div className="relative">
                            <Plus size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-500" />
                            <select 
                              onChange={(e) => {
                                if (e.target.value) {
                                  addIngredientToRecipe(selectedProductId, e.target.value);
                                  e.target.value = '';
                                }
                              }}
                              className="w-full pl-9 pr-4 py-3 bg-bg-accent border-2 border-dashed border-border-dim rounded-lg text-[10px] font-black uppercase tracking-widest text-text-dim hover:border-brand-500 hover:text-brand-500 outline-none transition-all appearance-none cursor-pointer"
                            >
                               <option value="">VINCULAR NUEVO INSUMO A ESTE PRODUCTO...</option>
                               {items.filter(i => !(recipes[selectedProductId] || []).some(r => r.itemId === i.id)).map(i => (
                                 <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                               ))}
                            </select>
                          </div>
                       </div>
                    </div>
                  </>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-12">
                     <BookOpen size={48} className="text-border-dim mb-4" />
                     <h3 className="text-lg font-black uppercase text-text-dim tracking-widest">Seleccione un producto</h3>
                     <p className="text-[10px] text-text-dim/60 font-bold uppercase mt-2">Para ver y editar su receta</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'gestion' && (
          <motion.div key="gestion" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Insumos Management */}
              <div className="bg-bg-sidebar border border-border-dim rounded-lg p-6 shadow-xl space-y-6">
                <div className="flex items-center justify-between border-b border-border-dim pb-4">
                  <h3 className="text-sm font-black uppercase text-brand-500 tracking-widest">Maestro de Insumos</h3>
                </div>
                
                {/* Item Form */}
                <div className="bg-bg-accent/40 p-4 rounded border border-brand-500/20 space-y-3">
                   <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-text-dim uppercase">Nombre</label>
                        <input 
                          value={itemForm.name}
                          onChange={e => setItemForm({...itemForm, name: e.target.value})}
                          className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none focus:border-brand-500 uppercase font-black"
                          placeholder="CARNE..."
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-text-dim uppercase">Unidad</label>
                        <select 
                          value={itemForm.unit}
                          onChange={e => setItemForm({...itemForm, unit: e.target.value})}
                          className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none focus:border-brand-500 font-black uppercase"
                        >
                          <option value="">Selección...</option>
                          <option value="u">UNIDADES (U)</option>
                          <option value="kg">KILOS (KG)</option>
                          <option value="l">LITROS (L)</option>
                          <option value="bolsa">BOLSAS</option>
                          <option value="pack">PACKS</option>
                        </select>
                      </div>
                   </div>
                   <button 
                    onClick={async () => {
                        if (editingItem) {
                          await supabase.from('stock_items').update(itemForm).eq('id', editingItem.id);
                          setEditingItem(null);
                        } else {
                          await supabase.from('stock_items').insert(itemForm);
                        }
                        setItemForm({ name: '', unit: '', cost: 0 });
                    }}
                    className="w-full bg-brand-500 text-black py-2 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all font-bold"
                   >
                     {editingItem ? 'Guardar Cambios' : 'Agregar Insumo'}
                   </button>
                   {editingItem && (
                     <button onClick={() => { setEditingItem(null); setItemForm({ name: '', unit: '', cost: 0 }); }} className="w-full text-[9px] font-bold text-text-dim uppercase underline">Cancelar Edición</button>
                   )}
                </div>

                <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                  {items.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-4 bg-bg-accent/40 rounded border border-border-dim group hover:border-brand-500/30 transition-all">
                      <div>
                        <p className="text-[11px] font-black text-text-main uppercase">{item.name}</p>
                        <p className="text-[9px] text-text-dim font-bold uppercase mt-1">Unidad: {item.unit}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            setEditingItem(item);
                            setItemForm({ name: item.name, unit: item.unit, cost: item.cost || 0 });
                          }}
                          className="p-2 text-text-dim hover:text-brand-500 transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={async () => {
                            if (window.confirm('¿Está seguro de eliminar este insumo? Se eliminará de todas las recetas y del control de desvíos.')) {
                              const { error } = await supabase.from('stock_items').delete().eq('id', item.id);
                              if (!error) {
                                setControlledIds(prev => prev.filter(id => id !== item.id));
                              }
                            }
                          }}
                          className="p-2 text-text-dim hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Productos Management */}
              <div className="bg-bg-sidebar border border-border-dim rounded-lg p-6 shadow-xl space-y-6">
                <div className="flex items-center justify-between border-b border-border-dim pb-4">
                  <h3 className="text-sm font-black uppercase text-teal-500 tracking-widest">Maestro de Productos</h3>
                </div>

                {/* Product Form */}
                <div className="bg-teal-500/5 p-4 rounded border border-teal-500/20 space-y-3">
                   <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-text-dim uppercase">Nombre del Plato</label>
                        <input 
                          value={productForm.name}
                          onChange={e => setProductForm({...productForm, name: e.target.value})}
                          className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none focus:border-teal-500 uppercase font-black"
                          placeholder="CLASSIC..."
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-text-dim uppercase">Categoría</label>
                        <input 
                          value={productForm.category}
                          onChange={e => setProductForm({...productForm, category: e.target.value})}
                          className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none focus:border-teal-500 font-black uppercase"
                          placeholder="HAMBURGUESAS..."
                        />
                      </div>
                   </div>
                   <button 
                    onClick={async () => {
                        if (editingProduct) {
                          await supabase.from('products').update(productForm).eq('id', editingProduct.id);
                          setEditingProduct(null);
                        } else {
                          await supabase.from('products').insert(productForm);
                        }
                        setProductForm({ name: '', category: '' });
                    }}
                    className="w-full bg-teal-500 text-black py-2 rounded text-[10px] font-black uppercase tracking-widest hover:bg-teal-600 transition-all font-bold"
                   >
                     {editingProduct ? 'Guardar Cambios' : 'Agregar Producto'}
                   </button>
                   {editingProduct && (
                     <button onClick={() => { setEditingProduct(null); setProductForm({ name: '', category: '' }); }} className="w-full text-[9px] font-bold text-text-dim uppercase underline">Cancelar Edición</button>
                   )}
                </div>

                <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                  {products.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-4 bg-bg-accent/40 rounded border border-border-dim group hover:border-teal-500/30 transition-all">
                      <div>
                        <p className="text-[11px] font-black text-text-main uppercase">{p.name}</p>
                        <p className="text-[9px] text-text-dim font-bold uppercase mt-1">Categoría: {p.category}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            setEditingProduct(p);
                            setProductForm({ name: p.name, category: p.category });
                          }}
                          className="p-2 text-text-dim hover:text-teal-500 transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={async () => {
                            if (window.confirm('¿Está seguro de eliminar este producto?')) {
                              const { error } = await supabase.from('products').delete().eq('id', p.id);
                              if (!error && selectedProductId === p.id) {
                                setSelectedProductId(null);
                              }
                            }
                          }}
                          className="p-2 text-text-dim hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-8 py-3 rounded text-[10px] font-black uppercase tracking-widest transition-all",
        active 
          ? "bg-bg-accent text-brand-500 shadow-md border border-border-dim/50" 
          : "text-text-dim hover:text-text-main"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function SummaryCard({ label, value, color, icon }: { label: string, value: string, color: string, icon: React.ReactNode }) {
  return (
    <div className="bg-bg-sidebar border border-border-dim p-4 rounded-lg flex items-center justify-between shadow-xl">
      <div>
        <p className="text-[10px] font-black text-text-dim uppercase tracking-widest mb-1">{label}</p>
        <p className={cn("text-2xl font-mono font-black", color)}>{value}</p>
      </div>
      <div className={cn("p-3.5 rounded-full bg-bg-accent border border-border-dim/30 shadow-inner", color)}>
        {icon}
      </div>
    </div>
  );
}
