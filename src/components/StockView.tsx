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
  const [viewMode, setViewMode] = useState<'semana' | 'mes'>('semana');
  const [loading, setLoading] = useState(true);
  const [closedWeeks, setClosedWeeks] = useState<Record<string, boolean>>({});

  const getWeekNumber = (dateStr: string) => {
    const day = parseInt(dateStr.split('-')[2]);
    if (day <= 7) return 1;
    if (day <= 14) return 2;
    if (day <= 21) return 3;
    return 4;
  };
  
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

      // Fetch week closures
      const { data: closures } = await supabase
        .from('inventory_week_closures')
        .select('week_number')
        .match({ branch_id: selectedBranchId, month: currentMonth });
      
      if (closures) {
        const closureMap: Record<string, boolean> = {};
        closures.forEach(c => {
          closureMap[`${selectedBranchId}-${currentMonth}-${c.week_number}`] = true;
        });
        setClosedWeeks(closureMap);
      }

      setLoading(false);
    };

    fetchData();
  }, [selectedBranchId, selectedDate, viewMode]);

  const updateItemData = async (id: string, field: string, value: number, targetDate: string = selectedDate) => {
    // Check if week is closed
    const currentWeekNum = getWeekNumber(targetDate);
    const closureKey = `${selectedBranchId}-${targetDate.substring(0, 7)}-${currentWeekNum}`;
    if (closedWeeks[closureKey]) {
      alert("Esta semana ya está cerrada y no puede ser modificada.");
      return;
    }

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
    const year = date.getFullYear();
    const month = date.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const selectedMonthStr = baseDate.substring(0, 7);

    if (mode === 'semana') {
      const dayOfMonth = date.getDate();
      let start = 1, end = 7;
      if (dayOfMonth >= 8 && dayOfMonth <= 14) { start = 8; end = 14; }
      else if (dayOfMonth >= 15 && dayOfMonth <= 21) { start = 15; end = 21; }
      else if (dayOfMonth >= 22) { start = 22; end = lastDay; }

      for (let i = start; i <= end; i++) {
        dates.push(`${selectedMonthStr}-${String(i).padStart(2, '0')}`);
      }
    } else {
      for (let i = 1; i <= lastDay; i++) {
        dates.push(`${selectedMonthStr}-${String(i).padStart(2, '0')}`);
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

  const isCurrentWeekClosed = () => {
    if (viewMode !== 'semana') return false;
    const currentWeekNum = getWeekNumber(selectedDate);
    const closureKey = `${selectedBranchId}-${selectedDate.substring(0, 7)}-${currentWeekNum}`;
    return closedWeeks[closureKey] || false;
  };

  const handleCloseWeek = async () => {
    if (!selectedBranchId) return;
    const currentMonth = selectedDate.substring(0, 7);
    const currentWeekNum = getWeekNumber(selectedDate);
    const closureKey = `${selectedBranchId}-${currentMonth}-${currentWeekNum}`;

    if (window.confirm(`¿Está seguro de que desea cerrar la SEMANA ${currentWeekNum} de ${currentMonth}? Una vez cerrada, los datos no podrán ser modificados.`)) {
      const { error } = await supabase
        .from('inventory_week_closures')
        .upsert({
          branch_id: selectedBranchId,
          month: currentMonth,
          week_number: currentWeekNum
        }, { onConflict: 'branch_id,month,week_number' });

      if (!error) {
        setClosedWeeks(prev => ({ ...prev, [closureKey]: true }));
        alert(`Semana ${currentWeekNum} cerrada exitosamente.`);
      } else {
        console.error('Error closing week:', error);
        alert('Error al cerrar la semana. Verifique su conexión y permisos.');
      }
    }
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
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-text-main uppercase tracking-tight">
                Control Stock {viewMode === 'semana' ? 'Semanal' : 'Mensual'} {activeBranch ? `• ${activeBranch.name}` : '(CONSOLIDADO)'}
              </h2>
              {isCurrentWeekClosed() && (
                <span className="px-2 py-0.5 bg-red-500/10 text-red-500 text-[8px] font-black uppercase tracking-widest border border-red-500/20 rounded">
                  CERRADO
                </span>
              )}
            </div>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest">
              {isAdmin ? "PANEL DE ADMINISTRACIÓN" : "PANEL DE ENCARGADO: CARGA OPERATIVA"}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex bg-bg-sidebar p-1 rounded border border-border-dim gap-1">
             <button 
              onClick={() => setViewMode('mes')}
              className={cn("px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded transition-all", viewMode === 'mes' ? "bg-brand-500 text-black" : "text-text-dim hover:text-text-main")}
             >Mes</button>
             {[1, 2, 3, 4].map(w => {
               const day = w === 1 ? '01' : w === 2 ? '08' : w === 3 ? '15' : '22';
               const dateStr = `${selectedDate.substring(0, 7)}-${day}`;
               const isActive = viewMode === 'semana' && getWeekNumber(selectedDate) === w;
               const closureKey = `${selectedBranchId}-${selectedDate.substring(0, 7)}-${w}`;
               const isClosed = closedWeeks[closureKey];
               
               return (
                 <button 
                  key={w}
                  onClick={() => {
                    setViewMode('semana');
                    setSelectedDate(dateStr);
                  }}
                  className={cn(
                    "px-4 py-1 text-[8px] font-black uppercase tracking-widest rounded transition-all relative", 
                    isActive ? "bg-brand-500 text-black shadow-lg shadow-brand-500/10" : "text-text-dim hover:text-text-main hover:bg-bg-accent"
                  )}
                 >
                   SEMANA {w}
                   {isClosed && (
                     <div className={cn("absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-red-500 border border-bg-sidebar")} />
                   )}
                 </button>
               );
             })}
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
                <th className="px-4 py-4 text-left font-black text-brand-500 tracking-widest border-l border-border-dim/20">DESVÍO</th>
                <th className="px-6 py-4 text-right sticky right-0 bg-bg-accent z-20 border-l border-border-dim/20 w-40">Cierre</th>
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
                const isSummary = viewMode === 'mes';
                const isItemLocked = isCurrentWeekClosed();

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
                      disabled={isSummary || isItemLocked} 
                      className="bg-brand-500/5 font-bold"
                    />

                    {/* Compras (Editable for all if in daily view) */}
                    <StockInputCell 
                      value={data.compras} 
                      onChange={val => updateItemData(item.id, 'compras', val)}
                      disabled={isSummary || isItemLocked} 
                      className="bg-emerald-500/5"
                    />

                    {/* Prestamos (Encargado) */}
                    <StockInputCell 
                      value={data.prestamos} 
                      onChange={val => updateItemData(item.id, 'prestamos', val)}
                      disabled={isSummary || isItemLocked}
                    />

                    {/* Consumo Pers. (Encargado) */}
                    <StockInputCell 
                      value={data.consumoPersonal} 
                      onChange={val => updateItemData(item.id, 'consumoPersonal', val)}
                      disabled={isSummary || isItemLocked}
                    />

                    {/* EF (Encargado) */}
                    <StockInputCell 
                      value={data.ef} 
                      onChange={val => updateItemData(item.id, 'ef', val)}
                      disabled={isSummary || isItemLocked}
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
                    <td className="px-4 py-4 text-left border-l border-border-dim/20">
                       <span className={cn(
                         "px-2 py-0.5 rounded font-mono font-black",
                         Math.abs(desvio) < 2 ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                       )}>
                         {desvio > 0 ? '+' : ''}{desvio.toFixed(1)}
                       </span>
                    </td>

                    {/* Week Closure Action */}
                    <td className="px-6 py-4 text-right sticky right-0 bg-bg-sidebar group-hover:bg-bg-accent/50 z-10 border-l border-border-dim/20">
                      {viewMode === 'semana' && (
                        isCurrentWeekClosed() ? (
                          <div className="flex flex-col items-end opacity-50">
                            <span className="text-[8px] font-black uppercase text-red-500">SEMANA</span>
                            <span className="text-[10px] font-black uppercase text-red-500">CERRADA</span>
                          </div>
                        ) : (
                          <button 
                            onClick={handleCloseWeek}
                            className="bg-brand-500 text-black px-3 py-1.5 rounded text-[8px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-lg shadow-brand-500/10 whitespace-nowrap"
                          >
                            Cerrar Semana
                          </button>
                        )
                      )}
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
            <p className="text-[9px] font-black text-brand-500 uppercase tracking-widest">
              {viewMode === 'semana' ? `Estado Cierre Semana ${getWeekNumber(selectedDate)}` : 'Estado del Cierre'}
            </p>
            <p className="text-xs font-bold text-text-main mt-1 uppercase">
              {isCurrentWeekClosed() ? "SEMANA CERRADA Y BLOQUEADA" : "PENDIENTE DE VALIDACIÓN Y CIERRE"}
            </p>
          </div>
          {isAdmin && viewMode === 'mes' && (
            <button className="bg-brand-500 text-black px-6 py-3 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-xl shadow-brand-500/10">
              Cerrar Mes y Validar
            </button>
          )}
        </div>
      </div>
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
