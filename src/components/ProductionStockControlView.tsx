import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ClipboardCheck, 
  Plus, 
  Save, 
  Loader2, 
  X, 
  Calendar, 
  TrendingDown,
  Package,
  ChevronDown,
  History,
  Trash2,
  AlertCircle,
  FileText,
  Calculator
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';
import { ProductionSupply, ProductionStockControl } from '../types';

export default function ProductionStockControlView() {
  const [supplies, setSupplies] = useState<ProductionSupply[]>([]);
  const [records, setRecords] = useState<ProductionStockControl[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAddingSupply, setIsAddingSupply] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
  
  // Form State for new supply
  const [newSupply, setNewSupply] = useState({ name: '', unit: '' });

  const weekRanges = ['1 al 7', '8 al 14', '15 al 21', '22 al 31'] as const;

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: suppliesData } = await supabase.from('production_supplies').select('*').order('name');
      if (suppliesData) {
        setSupplies(suppliesData.map(s => ({
          id: s.id,
          name: s.name,
          unit: s.unit,
          isActive: s.is_active
        })));
      }

      const { data: recordsData } = await supabase
        .from('production_stock_control')
        .select('*')
        .eq('month', selectedMonth);
      
      if (recordsData) {
        setRecords(recordsData.map(r => ({
          id: r.id,
          supplyId: r.supply_id,
          weekRange: r.week_range,
          month: r.month,
          initialExistence: r.initial_existence,
          productionPurchases: r.production_purchases,
          internalMovements: r.internal_movements,
          wastage: r.wastage,
          personalConsumption: r.personal_consumption,
          recovery: r.recovery,
          staffPurchases: r.staff_purchases,
          finalExistence: r.final_existence
        })));
      }
    } catch (err) {
      console.error('Error fetching stock control data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedMonth]);

  const handleAddSupply = async () => {
    if (!newSupply.name || !newSupply.unit) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('production_supplies').insert([{
        name: newSupply.name.toUpperCase(),
        unit: newSupply.unit.toUpperCase(),
        is_active: true
      }]);
      if (error) throw error;
      setIsAddingSupply(false);
      setNewSupply({ name: '', unit: '' });
      fetchData();
    } catch (err) {
      alert('Error al guardar el insumo');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRecord = async (supplyId: string, weekRange: string, field: keyof ProductionStockControl, value: number) => {
    const existing = records.find(r => r.supplyId === supplyId && r.weekRange === weekRange);
    
    const recordData = {
      supply_id: supplyId,
      week_range: weekRange,
      month: selectedMonth,
      initial_existence: existing?.initialExistence || 0,
      production_purchases: existing?.productionPurchases || 0,
      internal_movements: existing?.internalMovements || 0,
      wastage: existing?.wastage || 0,
      personal_consumption: existing?.personalConsumption || 0,
      recovery: existing?.recovery || 0,
      staff_purchases: existing?.staffPurchases || 0,
      final_existence: existing?.finalExistence || 0,
    };

    // Update the specific field
    const dbField = field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    (recordData as any)[dbField] = value;

    try {
      const { error } = await supabase
        .from('production_stock_control')
        .upsert(recordData, { onConflict: 'supply_id,week_range,month' });
      
      if (error) throw error;
      
      // Local update to avoid full refetch on every keystroke if needed, 
      // but for now let's just refetch or update state
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const getRecord = (supplyId: string, weekRange: string) => {
    return records.find(r => r.supplyId === supplyId && r.weekRange === weekRange) || {
      initialExistence: 0,
      productionPurchases: 0,
      internalMovements: 0,
      wastage: 0,
      personalConsumption: 0,
      recovery: 0,
      staffPurchases: 0,
      finalExistence: 0
    };
  };

  const calculateTheory = (r: any) => {
    return r.initialExistence + r.productionPurchases - r.internalMovements - r.wastage - r.personalConsumption - r.recovery - r.staffPurchases;
  };

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
            <ClipboardCheck size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-main uppercase tracking-tight">Control de Stock Depósito Central</h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest italic">Seguimiento semanal de insumos y desvíos</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2 bg-bg-accent px-4 py-2 rounded border border-border-dim">
            <Calendar size={14} className="text-brand-500" />
            <input 
              type="month" 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent border-none text-[10px] font-black uppercase text-text-main outline-none cursor-pointer"
            />
          </div>
          <button 
            onClick={() => setIsAddingSupply(true)}
            className="bg-brand-500 hover:bg-brand-600 text-black px-5 py-2 rounded text-[9px] font-black uppercase tracking-widest shadow-xl transition-all flex items-center gap-2"
          >
            <Plus size={14} /> ADMINISTRAR INSUMOS
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-bg-sidebar border border-border-dim rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[9px] border-collapse">
            <thead>
              <tr className="bg-bg-accent text-text-dim border-b border-border-dim">
                <th className="px-4 py-3 text-left w-48 sticky left-0 z-20 bg-bg-accent">INSUMO</th>
                <th className="px-4 py-3 text-center border-l border-border-dim">DÍAS</th>
                <th className="px-2 py-3 text-center border-l border-border-dim">EI</th>
                <th className="px-2 py-3 text-center border-l border-border-dim">PROD / COMPRAS</th>
                <th className="px-2 py-3 text-center border-l border-border-dim">ENVÍOS SUC.</th>
                <th className="px-2 py-3 text-center border-l border-border-dim">DECOMISOS</th>
                <th className="px-2 py-3 text-center border-l border-border-dim">PERSONAL</th>
                <th className="px-2 py-3 text-center border-l border-border-dim">EGR (RECUPERO)</th>
                <th className="px-2 py-3 text-center border-l border-border-dim">EGC (COMPRAS PERS)</th>
                <th className="px-2 py-3 text-center border-l border-border-dim bg-brand-500/5">EF TEÓRICO</th>
                <th className="px-2 py-3 text-center border-l border-border-dim">EF REAL</th>
                <th className="px-4 py-3 text-right border-l border-border-dim">DESVÍO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dim">
              {supplies.map((supply) => (
                <React.Fragment key={supply.id}>
                  {weekRanges.map((range, idx) => {
                    const r = getRecord(supply.id, range);
                    const theory = calculateTheory(r);
                    const deviation = theory - r.finalExistence;

                    return (
                      <tr key={`${supply.id}-${range}`} className="hover:bg-bg-accent/30 transition-colors">
                        {idx === 0 && (
                          <td rowSpan={weekRanges.length + 1} className="px-4 py-4 font-black text-text-main uppercase border-r border-border-dim sticky left-0 z-10 bg-bg-sidebar align-top">
                            {supply.name}
                            <p className="text-[8px] text-text-dim font-bold mt-1 opacity-50">UNIDAD: {supply.unit}</p>
                          </td>
                        )}
                        <td className="px-4 py-3 text-center font-bold text-text-dim border-l border-border-dim uppercase">{range}</td>
                        <td className="px-1 py-1 border-l border-border-dim">
                          <input 
                            type="number"
                            className="w-16 bg-transparent border-none text-center font-mono text-text-main focus:bg-brand-500/10 outline-none"
                            value={r.initialExistence || ''}
                            placeholder="0"
                            onChange={(e) => handleUpdateRecord(supply.id, range, 'initialExistence', parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="px-1 py-1 border-l border-border-dim">
                          <input 
                            type="number"
                            className="w-16 bg-transparent border-none text-center font-mono text-text-main focus:bg-brand-500/10 outline-none"
                            value={r.productionPurchases || ''}
                            placeholder="0"
                            onChange={(e) => handleUpdateRecord(supply.id, range, 'productionPurchases', parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="px-1 py-1 border-l border-border-dim">
                          <input 
                            type="number"
                            className="w-16 bg-transparent border-none text-center font-mono text-text-main focus:bg-brand-500/10 outline-none"
                            value={r.internalMovements || ''}
                            placeholder="0"
                            onChange={(e) => handleUpdateRecord(supply.id, range, 'internalMovements', parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="px-1 py-1 border-l border-border-dim">
                          <input 
                            type="number"
                            className="w-16 bg-transparent border-none text-center font-mono text-text-main focus:bg-brand-500/10 outline-none"
                            value={r.wastage || ''}
                            placeholder="0"
                            onChange={(e) => handleUpdateRecord(supply.id, range, 'wastage', parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="px-1 py-1 border-l border-border-dim">
                          <input 
                            type="number"
                            className="w-16 bg-transparent border-none text-center font-mono text-text-main focus:bg-brand-500/10 outline-none"
                            value={r.personalConsumption || ''}
                            placeholder="0"
                            onChange={(e) => handleUpdateRecord(supply.id, range, 'personalConsumption', parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="px-1 py-1 border-l border-border-dim">
                          <input 
                            type="number"
                            className="w-16 bg-transparent border-none text-center font-mono text-text-main focus:bg-brand-500/10 outline-none"
                            value={r.recovery || ''}
                            placeholder="0"
                            onChange={(e) => handleUpdateRecord(supply.id, range, 'recovery', parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="px-1 py-1 border-l border-border-dim">
                          <input 
                            type="number"
                            className="w-16 bg-transparent border-none text-center font-mono text-text-main focus:bg-brand-500/10 outline-none"
                            value={r.staffPurchases || ''}
                            placeholder="0"
                            onChange={(e) => handleUpdateRecord(supply.id, range, 'staffPurchases', parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="px-2 py-3 text-center border-l border-border-dim bg-brand-500/10 font-mono font-black text-brand-500">
                          {theory.toFixed(2)}
                        </td>
                        <td className="px-1 py-1 border-l border-border-dim">
                          <input 
                            type="number"
                            className="w-16 bg-transparent border-none text-center font-mono font-black text-text-main focus:bg-brand-500/10 outline-none"
                            value={r.finalExistence || ''}
                            placeholder="0"
                            onChange={(e) => handleUpdateRecord(supply.id, range, 'finalExistence', parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className={cn(
                          "px-4 py-3 text-right border-l border-border-dim font-mono font-black",
                          Math.abs(deviation) > 0.01 ? (deviation > 0 ? "text-red-400" : "text-emerald-400") : "text-text-dim"
                        )}>
                          {deviation !== 0 ? deviation.toFixed(2) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Totals Row */}
                  <tr className="bg-bg-accent/40 font-black">
                    <td className="px-4 py-3 text-center border-l border-border-dim text-brand-500">TOTAL</td>
                    <td className="px-2 py-3 text-center border-l border-border-dim">-</td>
                    <td className="px-2 py-3 text-center border-l border-border-dim">
                      {records.filter(r => r.supplyId === supply.id).reduce((sum, r) => sum + r.productionPurchases, 0).toFixed(2)}
                    </td>
                    <td className="px-2 py-3 text-center border-l border-border-dim">
                      {records.filter(r => r.supplyId === supply.id).reduce((sum, r) => sum + r.internalMovements, 0).toFixed(2)}
                    </td>
                    <td className="px-2 py-3 text-center border-l border-border-dim">
                      {records.filter(r => r.supplyId === supply.id).reduce((sum, r) => sum + r.wastage, 0).toFixed(2)}
                    </td>
                    <td className="px-2 py-3 text-center border-l border-border-dim">
                      {records.filter(r => r.supplyId === supply.id).reduce((sum, r) => sum + r.personalConsumption, 0).toFixed(2)}
                    </td>
                    <td className="px-2 py-3 text-center border-l border-border-dim">
                      {records.filter(r => r.supplyId === supply.id).reduce((sum, r) => sum + r.recovery, 0).toFixed(2)}
                    </td>
                    <td className="px-2 py-3 text-center border-l border-border-dim">
                      {records.filter(r => r.supplyId === supply.id).reduce((sum, r) => sum + r.staffPurchases, 0).toFixed(2)}
                    </td>
                    <td className="px-2 py-3 text-center border-l border-border-dim bg-brand-500/10 text-brand-500">
                      -
                    </td>
                    <td className="px-2 py-3 text-center border-l border-border-dim">
                      -
                    </td>
                    <td className="px-4 py-3 text-right border-l border-border-dim">
                      -
                    </td>
                  </tr>
                </React.Fragment>
              ))}
              {supplies.length === 0 && (
                <tr>
                  <td colSpan={12} className="py-20 text-center opacity-30">
                    <History size={48} className="mx-auto mb-4" />
                    <p className="font-black uppercase tracking-widest">No hay insumos configurados</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Administrar Insumos */}
      <AnimatePresence>
        {isAddingSupply && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
             <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="bg-bg-sidebar border border-border-dim rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden"
             >
                <div className="bg-bg-accent p-6 border-b border-border-dim flex justify-between items-center">
                   <h3 className="text-sm font-black text-text-main uppercase tracking-widest">Administrar Insumos Depósito</h3>
                   <button onClick={() => setIsAddingSupply(false)} className="text-text-dim hover:text-text-main"><X size={20} /></button>
                </div>
                
                <div className="p-8 space-y-8">
                   {/* Create form */}
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 bg-bg-main border border-border-dim rounded">
                      <div className="md:col-span-1 space-y-2">
                        <label className="text-[10px] font-black text-text-dim uppercase tracking-wider">Nombre</label>
                        <input 
                          type="text"
                          placeholder="EJ: ASADO PORCIONADO"
                          className="w-full bg-bg-sidebar border border-border-dim rounded px-4 py-3 text-xs font-bold uppercase focus:border-brand-500 outline-none transition-all"
                          value={newSupply.name}
                          onChange={(e) => setNewSupply({...newSupply, name: e.target.value})}
                        />
                      </div>
                      <div className="md:col-span-1 space-y-2">
                        <label className="text-[10px] font-black text-text-dim uppercase tracking-wider">Unidad</label>
                        <input 
                          type="text"
                          placeholder="EJ: UN, KG..."
                          className="w-full bg-bg-sidebar border border-border-dim rounded px-4 py-3 text-xs font-bold uppercase focus:border-brand-500 outline-none transition-all"
                          value={newSupply.unit}
                          onChange={(e) => setNewSupply({...newSupply, unit: e.target.value})}
                        />
                      </div>
                      <div className="flex items-end">
                        <button 
                          onClick={handleAddSupply}
                          className="w-full bg-brand-500 text-black py-3 rounded font-black text-[11px] uppercase tracking-widest shadow-xl flex items-center justify-center gap-2"
                        >
                          <Plus size={16} /> AGREGAR Insumo
                        </button>
                      </div>
                   </div>

                   {/* List */}
                   <div className="space-y-4">
                      <h4 className="text-[10px] font-black uppercase text-text-dim border-b border-border-dim pb-2">Insumos Actuales</h4>
                      <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-2">
                         {supplies.map(s => (
                           <div key={s.id} className="flex justify-between items-center bg-bg-accent px-4 py-3 rounded border border-border-dim">
                              <span className="text-xs font-black text-text-main uppercase">{s.name} ({s.unit})</span>
                              <button 
                                onClick={async () => {
                                  if(confirm('¿Eliminar insumo?')) {
                                    await supabase.from('production_stock_control').delete().eq('supply_id', s.id);
                                    await supabase.from('production_supplies').delete().eq('id', s.id);
                                    fetchData();
                                  }
                                }}
                                className="text-text-dim hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                           </div>
                         ))}
                         {supplies.length === 0 && <p className="text-center py-4 text-text-dim italic text-xs uppercase">No hay insumos cargados</p>}
                      </div>
                   </div>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
