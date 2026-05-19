/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Package, 
  Search, 
  Filter, 
  ArrowUpDown, 
  Info, 
  MoreHorizontal, 
  Plus, 
  History, 
  Save, 
  X,
  ArrowRightLeft,
  ShoppingBag,
  CalendarDays,
  FileText,
  Loader2
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Branch, StockItem } from '../types';
import { supabase } from '../lib/supabase';

interface PartialEntry {
  id: string;
  date: string;
  type: 'compra' | 'movimiento';
  quantity: number;
  note: string;
}

export default function StockView({ 
  selectedBranchId, 
  branches, 
  userRole,
  controlledItemIds = [],
  items = []
}: { 
  selectedBranchId: string, 
  branches: Branch[],
  userRole?: string,
  controlledItemIds?: string[],
  items?: StockItem[]
}) {
  const activeBranch = branches.find(b => b.id === selectedBranchId);
  const isAdmin = userRole === 'dueño' || userRole === 'administrativo';
  const isEncargado = !isAdmin;

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState<'dia' | 'semana' | 'mes'>('dia');
  const [loading, setLoading] = useState(true);
  
  // Data state stored by Date and then by Item ID
  const [dailyData, setDailyData] = useState<Record<string, Record<string, {
    ei: number;
    prestamos: number;
    consumoPersonal: number;
    ef: number;
    ventasTeorico: number;
    decomisos: number;
    compras: number;
  }>>>({});

  // Partial entries management (for COMPRAS / MOV INTERNOS)
  const [showPartialModal, setShowPartialModal] = useState<string | null>(null); // item ID
  const [partialEntries, setPartialEntries] = useState<Record<string, PartialEntry[]>>({});

  const [newEntry, setNewEntry] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'compra' as const,
    quantity: 0,
    note: ''
  });

  const [localControlledItemIds, setLocalControlledItemIds] = useState<string[]>(controlledItemIds);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      if (!selectedBranchId) return;
      setLoading(true);

      const dates = getDatesInRange(viewMode, selectedDate);
      const startDate = dates[0];
      const endDate = dates[dates.length - 1];

      // Fetch monthly controlled items first
      const currentMonth = selectedDate.substring(0, 7);
      const { data: monthlyData } = await supabase
        .from('monthly_controlled_items')
        .select('item_ids')
        .match({ branch_id: selectedBranchId, month: currentMonth })
        .maybeSingle();

      if (monthlyData && monthlyData.item_ids) {
        setLocalControlledItemIds(monthlyData.item_ids);
      } else {
        setLocalControlledItemIds(controlledItemIds);
      }

      // Fetch logs
      const { data: logsData } = await supabase
        .from('inventory_logs')
        .select('*')
        .eq('branch_id', selectedBranchId)
        .gte('date', startDate)
        .lte('date', endDate);

      // Also fetch previous day EF to default EI if needed (only in daily view)
      let prevDayEFs: Record<string, number> = {};
      if (viewMode === 'dia') {
        const prevDate = new Date(selectedDate + 'T12:00:00');
        prevDate.setDate(prevDate.getDate() - 1);
        const prevDateStr = prevDate.toISOString().split('T')[0];
        
        const { data: prevLogs } = await supabase
          .from('inventory_logs')
          .select('item_id, ef')
          .match({ branch_id: selectedBranchId, date: prevDateStr });
        
        if (prevLogs) {
          prevLogs.forEach(log => {
            prevDayEFs[log.item_id] = log.ef;
          });
        }
      }

      if (logsData) {
        const formatted: Record<string, any> = {};
        logsData.forEach(log => {
          if (!formatted[log.date]) formatted[log.date] = {};
          formatted[log.date][log.item_id] = {
            ei: log.ei,
            prestamos: log.prestamos,
            consumoPersonal: log.consumo_personal,
            ef: log.ef,
            ventasTeorico: log.ventas_teorico,
            decomisos: log.decomisos,
            compras: log.compras
          };
        });

        // Apply defaults for current day if EI is 0
        if (viewMode === 'dia' && formatted[selectedDate]) {
          Object.keys(prevDayEFs).forEach(itemId => {
            if (formatted[selectedDate][itemId] && formatted[selectedDate][itemId].ei === 0) {
              formatted[selectedDate][itemId].ei = prevDayEFs[itemId];
            }
          });
        } else if (viewMode === 'dia' && !formatted[selectedDate]) {
          formatted[selectedDate] = {};
          Object.keys(prevDayEFs).forEach(itemId => {
            formatted[selectedDate][itemId] = {
              ei: prevDayEFs[itemId],
              prestamos: 0,
              consumoPersonal: 0,
              ef: 0,
              ventasTeorico: 0,
              decomisos: 0,
              compras: 0
            };
          });
        }

        setDailyData(formatted);
      }

      // Fetch purchases
      const { data: purchasesData } = await supabase
        .from('inventory_purchases')
        .select('*')
        .eq('branch_id', selectedBranchId)
        .gte('date', startDate)
        .lte('date', endDate);

      if (purchasesData) {
        const formattedPurchases: Record<string, PartialEntry[]> = {};
        purchasesData.forEach(p => {
          if (!formattedPurchases[p.item_id]) formattedPurchases[p.item_id] = [];
          formattedPurchases[p.item_id].push({
            id: p.id,
            date: p.date,
            type: p.type as any,
            quantity: p.quantity,
            note: p.note
          });
        });
        setPartialEntries(formattedPurchases);
      }

      setLoading(false);
    };

    fetchData();
  }, [selectedBranchId, selectedDate, viewMode]);

  const handleAddEntry = async (itemId: string) => {
    if (newEntry.quantity <= 0) return;
    
    const { data, error } = await supabase
      .from('inventory_purchases')
      .insert({
        branch_id: selectedBranchId,
        item_id: itemId,
        date: newEntry.date,
        type: newEntry.type,
        quantity: newEntry.quantity,
        note: newEntry.note
      })
      .select()
      .single();

    if (data) {
      const entry: PartialEntry = {
        id: data.id,
        date: data.date,
        type: data.type,
        quantity: data.quantity,
        note: data.note
      };
      setPartialEntries(prev => ({
        ...prev,
        [itemId]: [...(prev[itemId] || []), entry]
      }));

      // Update the sum in dailyData for that day if it's currently selected
      const dayEntries = [...(partialEntries[itemId] || []), entry]
        .filter(e => e.date === newEntry.date);
      const totalPurchases = dayEntries.reduce((sum, e) => sum + e.quantity, 0);

      await updateItemData(itemId, 'compras', totalPurchases, newEntry.date);
    }

    setNewEntry({
      date: new Date().toISOString().split('T')[0],
      type: 'compra',
      quantity: 0,
      note: ''
    });
  };

  const updateItemData = async (id: string, field: string, value: number, targetDate: string = selectedDate) => {
    // Determine the next day to update its EI
    const nextDay = new Date(targetDate + 'T12:00:00');
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().split('T')[0];

    // Optimistic update
    setDailyData(prev => {
      const currentDayData = {
        ...(prev[targetDate]?.[id] || { ei: 0, prestamos: 0, consumoPersonal: 0, ef: 0, ventasTeorico: 0, decomisos: 0, compras: 0 }),
        [field]: value
      };

      const newState = {
        ...prev,
        [targetDate]: {
          ...(prev[targetDate] || {}),
          [id]: currentDayData
        }
      };

      // If we updated EF, update EI of next day
      if (field === 'ef') {
        newState[nextDayStr] = {
          ...(newState[nextDayStr] || {}),
          [id]: {
            ...(newState[nextDayStr]?.[id] || { ei: 0, prestamos: 0, consumoPersonal: 0, ef: 0, ventasTeorico: 0, decomisos: 0, compras: 0 }),
            ei: value
          }
        };
      }

      return newState;
    });

    // Map frontend field to DB column
    const columnMap: Record<string, string> = {
      ei: 'ei',
      prestamos: 'prestamos',
      consumoPersonal: 'consumo_personal',
      ef: 'ef',
      ventasTeorico: 'ventas_teorico',
      decomisos: 'decomisos',
      compras: 'compras'
    };

    const dbField = columnMap[field];
    if (!dbField) return;

    // Save current field
    await supabase
      .from('inventory_logs')
      .upsert({
        branch_id: selectedBranchId,
        item_id: id,
        date: targetDate,
        [dbField]: value
      }, { onConflict: 'branch_id,item_id,date' });

    // If EF was updated, also update EI of next day in DB
    if (field === 'ef') {
       await supabase
         .from('inventory_logs')
         .upsert({
           branch_id: selectedBranchId,
           item_id: id,
           date: nextDayStr,
           ei: value
         }, { onConflict: 'branch_id,item_id,date' });
    }
  };

  // Helper to get dates for a week or month
  const getDatesInRange = (mode: 'semana' | 'mes', baseDate: string) => {
    const dates: string[] = [];
    const date = new Date(baseDate + 'T12:00:00');
    
    if (mode === 'semana') {
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
      const monday = new Date(date.setDate(diff));
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        dates.push(d.toISOString().split('T')[0]);
      }
    } else {
      const year = date.getFullYear();
      const month = date.getMonth();
      const lastDay = new Date(year, month + 1, 0).getDate();
      for (let i = 1; i <= lastDay; i++) {
        dates.push(new Date(year, month, i).toISOString().split('T')[0]);
      }
    }
    return dates;
  };

  const calculateCMVReal = (itemId: string) => {
    if (viewMode === 'dia') {
      const data = dailyData[selectedDate]?.[itemId] || { ei: 0, prestamos: 0, consumoPersonal: 0, ef: 0, ventasTeorico: 0, decomisos: 0, compras: 0 };
      return data.ei + data.compras + data.prestamos - data.decomisos - data.consumoPersonal - data.ef;
    } else {
      const dates = getDatesInRange(viewMode, selectedDate);
      const totals = dates.reduce((acc, d) => {
        const data = dailyData[d]?.[itemId];
        if (data) {
          acc.compras += data.compras;
          acc.prestamos += data.prestamos;
          acc.consumoPersonal += data.consumoPersonal;
          acc.decomisos += data.decomisos;
          acc.ventasTeorico += data.ventasTeorico;
        }
        return acc;
      }, { compras: 0, prestamos: 0, consumoPersonal: 0, decomisos: 0, ventasTeorico: 0 });

      // For Semana/Mes: EI is first day, EF is last day
      const ei = dailyData[dates[0]]?.[itemId]?.ei || 0;
      const ef = dailyData[dates[dates.length - 1]]?.[itemId]?.ef || 0;
      return ei + totals.compras + totals.prestamos - totals.decomisos - totals.consumoPersonal - ef;
    }
  };

  const controlledItems = items.filter(item => localControlledItemIds.includes(item.id));

  const getPurchasesSum = (itemId: string) => {
    return (partialEntries[itemId] || []).reduce((acc, curr) => acc + curr.quantity, 0);
  };

  // Helper to get totals for a specific period
  const getPeriodTotals = (itemId: string, dates: string[]) => {
    return dates.reduce((acc, date) => {
      const data = dailyData[date]?.[itemId];
      if (data) {
        acc.compras += data.compras;
        acc.prestamos += data.prestamos;
        acc.consumoPersonal += data.consumoPersonal;
        acc.decomisos += data.decomisos;
        acc.ventasTeorico += data.ventasTeorico;
      }
      return acc;
    }, { compras: 0, prestamos: 0, consumoPersonal: 0, decomisos: 0, ventasTeorico: 0 });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-brand-500/10 p-2 text-brand-500 border border-brand-500/20 rounded">
            <Package size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-main uppercase tracking-tight">
              Control Stock {viewMode === 'dia' ? 'Diario' : viewMode === 'semana' ? 'Semanal' : 'Mensual'} {activeBranch ? `• ${activeBranch.name}` : '(CONSOLIDADO)'}
            </h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest">
              {isAdmin ? "PANEL DE ADMINISTRACIÓN" : "PANEL DE ENCARGADO: CARGA OPERATIVA"}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex bg-bg-sidebar p-1 rounded border border-border-dim">
             <button 
              onClick={() => setViewMode('dia')}
              className={cn("px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded transition-all", viewMode === 'dia' ? "bg-brand-500 text-black" : "text-text-dim hover:text-text-main")}
             >Día</button>
             <button 
              onClick={() => setViewMode('semana')}
              className={cn("px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded transition-all", viewMode === 'semana' ? "bg-brand-500 text-black" : "text-text-dim hover:text-text-main")}
             >Semana</button>
             <button 
              onClick={() => setViewMode('mes')}
              className={cn("px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded transition-all", viewMode === 'mes' ? "bg-brand-500 text-black" : "text-text-dim hover:text-text-main")}
             >Mes</button>
          </div>
          <div className="flex items-center gap-2 bg-bg-sidebar border border-border-dim rounded px-3 py-1.5 shadow-inner">
            <CalendarDays size={14} className="text-brand-500" />
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-[10px] font-black text-text-main outline-none uppercase font-mono"
            />
          </div>
        </div>
      </div>

      <div className="bg-bg-sidebar border border-border-dim rounded overflow-hidden shadow-2xl relative">
        {loading && (
          <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px] z-50 flex items-center justify-center">
            <Loader2 className="text-brand-500 animate-spin" size={32} />
          </div>
        )}
        <div className="overflow-x-auto pb-4 custom-scrollbar">
          <table className="w-full border-collapse min-w-[1400px] text-[10px]">
            <thead>
              <tr className="bg-bg-accent border-b border-border-dim text-text-dim text-left uppercase font-bold">
                <th className="px-6 py-4 w-64 sticky left-0 bg-bg-accent z-10 tracking-widest uppercase">Insumo</th>
                <th className="px-4 py-4 text-center tracking-widest bg-brand-500/5">EI</th>
                <th className="px-4 py-4 text-center tracking-widest bg-emerald-500/5">Compras</th>
                <th className="px-4 py-4 text-center tracking-widest bg-brand-500/5">+/- Préstamos</th>
                <th className="px-4 py-4 text-center tracking-widest bg-orange-500/5">Consumo Pers.</th>
                <th className="px-4 py-4 text-center tracking-widest bg-brand-500/5">EF</th>
                <th className="px-4 py-4 text-center tracking-widest bg-purple-500/5">Ventas Teo.</th>
                <th className="px-4 py-4 text-center tracking-widest bg-red-500/5">Decomisos</th>
                <th className="px-4 py-4 text-center font-black text-brand-500 bg-brand-500/5 tracking-widest">CMV REAL</th>
                <th className="px-4 py-4 text-center font-black text-brand-500 tracking-widest">DESVÍO</th>
                <th className="px-6 py-4 text-right sticky right-0 bg-bg-accent z-10">Opc</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dim">
              {controlledItems.map((item) => {
                let data;
                if (viewMode === 'dia') {
                  data = dailyData[selectedDate]?.[item.id] || { ei: 0, prestamos: 0, consumoPersonal: 0, ef: 0, ventasTeorico: 0, decomisos: 0, compras: 0 };
                } else {
                  const dates = getDatesInRange(viewMode, selectedDate);
                  const totals = getPeriodTotals(item.id, dates);
                  data = {
                    ei: dailyData[dates[0]]?.[item.id]?.ei || 0,
                    ef: dailyData[dates[dates.length - 1]]?.[item.id]?.ef || 0,
                    ...totals
                  };
                }
                
                const cmvReal = calculateCMVReal(item.id);
                const desvio = cmvReal - data.ventasTeorico;
                const isSummary = viewMode !== 'dia';

                return (
                  <tr key={item.id} className="hover:bg-bg-accent/50 transition-colors group text-[11px]">
                    <td className="px-6 py-4 sticky left-0 bg-bg-sidebar group-hover:bg-bg-accent/50 z-10 border-r border-border-dim/20">
                      <div className="flex flex-col">
                        <span className="font-black text-text-main uppercase">{item.name}</span>
                        <span className="text-[9px] text-text-dim uppercase font-bold opacity-60">{item.unit}</span>
                      </div>
                    </td>
                    
                    {/* EI (Editable with default) */}
                    <StockInputCell 
                      value={data.ei} 
                      onChange={val => updateItemData(item.id, 'ei', val)}
                      disabled={isSummary} 
                      className="bg-brand-500/5 font-bold"
                    />

                    {/* Compras (Read-only in this view) */}
                    <StockInputCell 
                      value={data.compras} 
                      onChange={val => updateItemData(item.id, 'compras', val)}
                      disabled={true} 
                      className="bg-emerald-500/5"
                    />

                    {/* Prestamos (Encargado) */}
                    <StockInputCell 
                      value={data.prestamos} 
                      onChange={val => updateItemData(item.id, 'prestamos', val)}
                      disabled={isSummary}
                    />

                    {/* Consumo Pers. (Encargado) */}
                    <StockInputCell 
                      value={data.consumoPersonal} 
                      onChange={val => updateItemData(item.id, 'consumoPersonal', val)}
                      disabled={isSummary}
                    />

                    {/* EF (Encargado) */}
                    <StockInputCell 
                      value={data.ef} 
                      onChange={val => updateItemData(item.id, 'ef', val)}
                      disabled={isSummary}
                    />

                    {/* Ventas Teo (Read-only in this view) */}
                    <StockInputCell 
                      value={data.ventasTeorico} 
                      onChange={val => updateItemData(item.id, 'ventasTeorico', val)}
                      disabled={true}
                    />

                    {/* Decomisos (Read-only in this view) */}
                    <StockInputCell 
                      value={data.decomisos} 
                      onChange={val => updateItemData(item.id, 'decomisos', val)}
                      disabled={true}
                    />
                    
                    {/* CMV REAL Result */}
                    <td className="px-4 py-4 bg-brand-500/5 border-x border-brand-500/10 text-center font-mono font-black text-text-main">
                      {cmvReal.toFixed(1)}
                    </td>

                    {/* DESVÍO Result */}
                    <td className="px-4 py-4 text-center">
                       <span className={cn(
                         "px-2 py-0.5 rounded font-mono font-black",
                         Math.abs(desvio) < 2 ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                       )}>
                         {desvio > 0 ? '+' : ''}{desvio.toFixed(1)}
                       </span>
                    </td>

                    <td className="px-6 py-4 text-right sticky right-0 bg-bg-sidebar group-hover:bg-bg-accent/50 z-10 border-l border-border-dim/20">
                      <button className="text-text-dim/40 hover:text-text-main p-1">
                        <MoreHorizontal size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 bg-bg-accent border border-border-dim rounded shadow-lg">
          <div className="flex items-center gap-4 text-text-dim">
            <Info size={20} className="text-brand-500" />
            <div>
              <p className="text-[10px] uppercase font-black tracking-widest text-text-main">Fórmula CMV Mensual</p>
              <p className="text-[9px] uppercase font-bold tracking-tight italic opacity-70 mt-1">
                CMV = (EI + Compras + Mov) +/- Préstamos - Decomisos - Consumo Personal - EF
              </p>
            </div>
          </div>
        </div>

        <div className="bg-brand-500/5 border border-brand-500/20 p-6 rounded-lg flex items-center justify-between">
           <div>
              <p className="text-[9px] font-black text-brand-500 uppercase tracking-widest">Estado del Cierre</p>
              <p className="text-xs font-bold text-text-main mt-1">PENDIENTE DE VALIDACIÓN FINAL POR ADMINISTRACIÓN</p>
           </div>
           {isAdmin && (
             <button className="bg-brand-500 text-black px-6 py-3 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-xl shadow-brand-500/10">
               Cerrar Mes y Validar
             </button>
           )}
        </div>
      </div>

      {/* Partial Movements Modal */}
      <AnimatePresence>
        {showPartialModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPartialModal(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-bg-sidebar border border-border-dim rounded-lg shadow-2xl p-8 overflow-hidden"
            >
              <div className="flex justify-between items-start mb-8">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-lg">
                    <ArrowRightLeft size={24} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase text-text-main tracking-widest">
                      Carga de Compras: <span className="text-emerald-500">{items.find(i => i.id === showPartialModal)?.name}</span>
                    </h3>
                    <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mt-1">Ingreso de facturas y movimientos internos</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowPartialModal(null)}
                  className="p-2 hover:bg-bg-accent rounded text-text-dim hover:text-text-main transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 bg-bg-accent/50 p-6 rounded-lg border border-border-dim/50">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-text-dim uppercase">Fecha</label>
                  <input 
                    type="date"
                    value={newEntry.date}
                    onChange={e => setNewEntry({...newEntry, date: e.target.value})}
                    className="w-full bg-bg-sidebar border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-text-dim uppercase">Tipo</label>
                  <select 
                    value={newEntry.type}
                    onChange={e => setNewEntry({...newEntry, type: e.target.value as any})}
                    className="w-full bg-bg-sidebar border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-emerald-500 font-black uppercase"
                  >
                    <option value="compra">Compra / Factura</option>
                    <option value="movimiento">Mov. Interno</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-text-dim uppercase">Cantidad</label>
                  <input 
                    type="number"
                    value={newEntry.quantity || ''}
                    onChange={e => setNewEntry({...newEntry, quantity: parseFloat(e.target.value) || 0})}
                    placeholder="0.0"
                    className="w-full bg-bg-sidebar border border-border-dim rounded px-3 py-2 text-[11px] text-text-main font-mono outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="flex items-end">
                   <button 
                    onClick={() => handleAddEntry(showPartialModal)}
                    className="w-full bg-emerald-500 text-black py-2 rounded text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all flex items-center justify-center gap-2"
                   >
                     <Plus size={14} /> Cargar
                   </button>
                </div>
                <div className="col-span-1 md:col-span-4 space-y-2">
                  <label className="text-[9px] font-black text-text-dim uppercase">Referencia / Comprobante</label>
                  <input 
                    type="text"
                    value={newEntry.note}
                    onChange={e => setNewEntry({...newEntry, note: e.target.value})}
                    placeholder="EJ: FACTURA #1234, PEDIDO CENTRAL..."
                    className="w-full bg-bg-sidebar border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-emerald-500 uppercase font-bold"
                  />
                </div>
              </div>

              <div className="max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border-dim/50">
                      <th className="py-3 text-[9px] font-black text-text-dim uppercase">Fecha</th>
                      <th className="py-3 text-[9px] font-black text-text-dim uppercase">Tipo</th>
                      <th className="py-3 text-[9px] font-black text-text-dim uppercase">Ref</th>
                      <th className="py-3 text-right text-[9px] font-black text-text-dim uppercase text-emerald-500 tracking-widest">Cant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-dim/30">
                    {(partialEntries[showPartialModal] || []).map((entry, idx) => (
                      <tr key={idx} className="group hover:bg-bg-accent/30">
                        <td className="py-3 text-[10px] font-mono text-text-dim uppercase">{entry.date}</td>
                        <td className="py-3">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter",
                            entry.type === 'compra' ? "bg-emerald-500/10 text-emerald-500" : "bg-brand-500/10 text-brand-500"
                          )}>
                            {entry.type}
                          </span>
                        </td>
                        <td className="py-3 text-[10px] font-bold text-text-main uppercase">{entry.note}</td>
                        <td className="py-3 text-right font-mono font-black text-text-main text-xs">{entry.quantity.toFixed(1)}</td>
                      </tr>
                    ))}
                    {(!partialEntries[showPartialModal] || partialEntries[showPartialModal].length === 0) && (
                      <tr>
                        <td colSpan={4} className="py-10 text-center text-text-dim text-[10px] font-bold uppercase italic opacity-50">
                          Sin movimientos registrados aún
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-8 pt-6 border-t border-border-dim/50 flex justify-between items-center bg-bg-accent/20 p-4 -mx-8 -mb-8">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-text-dim" />
                  <span className="text-[10px] font-black text-text-dim uppercase">Total Acumulado en el mes:</span>
                </div>
                <span className="text-xl font-mono font-black text-emerald-500">{getPurchasesSum(showPartialModal).toFixed(1)}</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function StockInputCell({ value, onChange, disabled, className }: { value: number, onChange: (val: number) => void, disabled?: boolean, className?: string }) {
  return (
    <td className={cn("px-2 py-4", disabled ? "bg-bg-accent/30" : "bg-bg-sidebar", className)}>
      <input 
        type="number"
        value={value || ''}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        placeholder="0.0"
        disabled={disabled}
        className={cn(
          "w-16 mx-auto block bg-transparent border border-border-dim/50 rounded py-1 px-1 text-center text-[10px] text-text-main font-mono focus:border-brand-500 outline-none transition-colors",
          disabled && "opacity-70 cursor-not-allowed border-none font-bold"
        )}
      />
    </td>
  );
}
