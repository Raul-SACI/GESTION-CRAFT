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
  items = [],
  isReadOnly
}: { 
  selectedBranchId: string, 
  branches: Branch[],
  userRole?: string,
  controlledItemIds?: string[],
  items?: StockItem[],
  isReadOnly?: boolean
}) {
  const activeBranch = branches.find(b => b.id === selectedBranchId);
  // El Centro de Producción / Almacén no vende: no aplica "Ventas Teóricas" y todos los campos son editables
  const isAlmacen = selectedBranchId === 'n4ncoary3' || /almac/i.test(activeBranch?.name || '');
  const isAdmin = userRole === 'dueño' || userRole === 'administrativo';
  const isEncargado = !isAdmin;

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState<'semana' | 'mes'>('semana');
  const [loading, setLoading] = useState(true);
  const [closedWeeks, setClosedWeeks] = useState<Record<string, boolean>>({}); // key: branchId-month-weekNum-itemId

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
    prestamosEnviados: number;
    prestamosRecibidos: number;
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
          let pEnviados = log.prestamos_enviados || 0;
          let pRecibidos = log.prestamos_recibidos || 0;
          // Legacy check
          if (log.prestamos !== undefined && log.prestamos !== null && log.prestamos !== 0 && !pEnviados && !pRecibidos) {
            if (log.prestamos > 0) {
              pRecibidos = log.prestamos;
            } else {
              pEnviados = Math.abs(log.prestamos);
            }
          }
          formatted[log.date][log.item_id] = {
            ei: log.ei,
            prestamosEnviados: pEnviados,
            prestamosRecibidos: pRecibidos,
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
              prestamosEnviados: 0,
              prestamosRecibidos: 0,
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

      // Fetch daily_wastage (insumos Y productos) y recetas para descomponer productos en insumos
      const { data: wastageData } = await supabase
        .from('daily_wastage')
        .select('date, reference_id, quantity, type')
        .eq('branch_id', selectedBranchId)
        .gte('date', startDate)
        .lte('date', endDate);

      // Traer recetas (producto -> insumos con cantidad por unidad)
      const { data: recipesData } = await supabase
        .from('recipes')
        .select('product_id, item_id, quantity');
      const recipeByProduct: Record<string, Array<{ itemId: string; quantity: number }>> = {};
      (recipesData || []).forEach((r: any) => {
        if (!r.product_id || !r.item_id) return;
        if (!recipeByProduct[r.product_id]) recipeByProduct[r.product_id] = [];
        recipeByProduct[r.product_id].push({ itemId: r.item_id, quantity: Number(r.quantity || 0) });
      });

      if (wastageData && wastageData.length > 0) {
        // Sumar cantidades de decomiso por insumo + fecha.
        // - type 'insumo': suma directa.
        // - type 'producto': descompone vía receta (cantidad_producto × cantidad_receta por insumo).
        const wastageByDateItem: Record<string, Record<string, number>> = {};
        wastageData.forEach((w: any) => {
          if (!w.reference_id || !w.date) return;
          if (!wastageByDateItem[w.date]) wastageByDateItem[w.date] = {};
          const qty = Number(w.quantity || 0);
          if (w.type === 'producto') {
            // Descomponer producto en sus insumos según la receta
            const recipe = recipeByProduct[w.reference_id];
            if (recipe && recipe.length > 0) {
              recipe.forEach(ing => {
                wastageByDateItem[w.date][ing.itemId] =
                  (wastageByDateItem[w.date][ing.itemId] || 0) + (qty * ing.quantity);
              });
            }
            // Si el producto no tiene receta cargada, no se puede descomponer: se ignora
          } else {
            // Insumo decomisado directamente
            wastageByDateItem[w.date][w.reference_id] =
              (wastageByDateItem[w.date][w.reference_id] || 0) + qty;
          }
        });

        // Merge into dailyData: el decomiso calculado SOBREESCRIBE el valor (es el total correcto del día)
        const upsertPromises: any[] = [];
        setDailyData(prev => {
          const merged = { ...prev };
          Object.keys(wastageByDateItem).forEach(date => {
            if (!merged[date]) merged[date] = {};
            Object.keys(wastageByDateItem[date]).forEach(itemId => {
              const wastageQty = wastageByDateItem[date][itemId];
              const existing = merged[date][itemId];
              const rounded = Math.round(wastageQty * 1000) / 1000;
              if (!existing) {
                merged[date][itemId] = { ei: 0, prestamosEnviados: 0, prestamosRecibidos: 0, consumoPersonal: 0, ef: 0, ventasTeorico: 0, decomisos: rounded, compras: 0 };
                upsertPromises.push(
                  supabase.from('inventory_logs').upsert(
                    { branch_id: selectedBranchId, item_id: itemId, date, decomisos: rounded },
                    { onConflict: 'branch_id,item_id,date' }
                  )
                );
              } else if ((existing.decomisos || 0) !== rounded) {
                // El total de Decomisos Diarios es la fuente de verdad: actualizar
                merged[date][itemId] = { ...existing, decomisos: rounded };
                upsertPromises.push(
                  supabase.from('inventory_logs').upsert(
                    { branch_id: selectedBranchId, item_id: itemId, date, decomisos: rounded },
                    { onConflict: 'branch_id,item_id,date' }
                  )
                );
              }
            });
          });
          return merged;
        });
        if (upsertPromises.length > 0 && !isReadOnly) {
          Promise.all(upsertPromises).catch(e => console.warn('Auto-sync decomisos error:', e));
        }
      }

      // ===== VENTAS TEÓRICAS: descomponer el Ranking de Artículos (productos vendidos) en insumos vía receta =====
      try {
        const weekNum = getWeekNumber(selectedDate);
        // Traer el ranking de la sucursal para el mes/semana en curso
        const { data: rankingData } = await supabase
          .from('product_rankings')
          .select('product_name, quantity, week_number, month')
          .eq('branch_id', selectedBranchId)
          .eq('month', currentMonth)
          .eq('week_number', weekNum);

        if (rankingData && rankingData.length > 0) {
          // Traer productos (para mapear nombre -> id) y recetas
          const { data: productsData } = await supabase.from('products').select('id, name');
          const { data: recipesData2 } = await supabase.from('recipes').select('product_id, item_id, quantity');

          const norm = (s: string) => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
          const productIdByName: Record<string, string> = {};
          (productsData || []).forEach((p: any) => { if (p.name) productIdByName[norm(p.name)] = p.id; });

          const recipeByProd: Record<string, Array<{ itemId: string; quantity: number }>> = {};
          (recipesData2 || []).forEach((r: any) => {
            if (!r.product_id || !r.item_id) return;
            if (!recipeByProd[r.product_id]) recipeByProd[r.product_id] = [];
            recipeByProd[r.product_id].push({ itemId: r.item_id, quantity: Number(r.quantity || 0) });
          });

          // Acumular ventas teóricas por insumo
          const theoreticalByItem: Record<string, number> = {};
          rankingData.forEach((rk: any) => {
            const prodId = productIdByName[norm(rk.product_name)];
            if (!prodId) return; // producto sin match con recetas
            const recipe = recipeByProd[prodId];
            if (!recipe) return;
            const soldQty = Number(rk.quantity || 0);
            recipe.forEach(ing => {
              theoreticalByItem[ing.itemId] = (theoreticalByItem[ing.itemId] || 0) + (soldQty * ing.quantity);
            });
          });

          // Asignar el total de la semana al PRIMER día de la semana en el Control de Stock
          const weekDates = getDatesInRange('semana', selectedDate);
          const firstDay = weekDates[0];
          const vtUpserts: any[] = [];
          setDailyData(prev => {
            const merged = { ...prev };
            if (!merged[firstDay]) merged[firstDay] = {};
            Object.keys(theoreticalByItem).forEach(itemId => {
              const vt = Math.round(theoreticalByItem[itemId] * 1000) / 1000;
              const existing = merged[firstDay][itemId];
              if (!existing) {
                merged[firstDay][itemId] = { ei: 0, prestamosEnviados: 0, prestamosRecibidos: 0, consumoPersonal: 0, ef: 0, ventasTeorico: vt, decomisos: 0, compras: 0 };
              } else if ((existing.ventasTeorico || 0) !== vt) {
                merged[firstDay][itemId] = { ...existing, ventasTeorico: vt };
              } else {
                return;
              }
              if (!isReadOnly) {
                vtUpserts.push(
                  supabase.from('inventory_logs').upsert(
                    { branch_id: selectedBranchId, item_id: itemId, date: firstDay, ventas_teorico: vt },
                    { onConflict: 'branch_id,item_id,date' }
                  )
                );
              }
            });
            return merged;
          });
          if (vtUpserts.length > 0) Promise.all(vtUpserts).catch(e => console.warn('Auto-sync ventas teóricas error:', e));
        }
      } catch (e) { console.warn('Error calculando ventas teóricas:', e); }

      // Fetch week closures
      const { data: closures } = await supabase
        .from('inventory_week_closures')
        .select('week_number, item_id')
        .match({ branch_id: selectedBranchId, month: currentMonth });
      
      if (closures) {
        const closureMap: Record<string, boolean> = {};
        closures.forEach(c => {
          closureMap[`${selectedBranchId}-${currentMonth}-${c.week_number}-${c.item_id}`] = true;
        });
        setClosedWeeks(closureMap);
      }

      setLoading(false);
    };

    fetchData();
  }, [selectedBranchId, selectedDate, viewMode]);

  const updateItemData = async (id: string, field: string, value: number, targetDate: string = selectedDate) => {
    if (isReadOnly) return;
    // Check if week is closed
    const currentWeekNum = getWeekNumber(targetDate);
    const closureKey = `${selectedBranchId}-${targetDate.substring(0, 7)}-${currentWeekNum}-${id}`;
    if (closedWeeks[closureKey]) {
      alert("Este insumo ya está cerrado para esta semana y no puede ser modificado.");
      return;
    }

    // Determine the next period start to carry over EF -> EI
    let nextDayStr: string;
    if (viewMode === 'semana') {
      // El inicio de la próxima semana (8, 15, 22, o primer día del mes siguiente)
      const d = new Date(targetDate + 'T12:00:00');
      const dom = d.getDate();
      const monthStr = targetDate.substring(0, 7);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      if (dom === 1) nextDayStr = `${monthStr}-08`;
      else if (dom === 8) nextDayStr = `${monthStr}-15`;
      else if (dom === 15) nextDayStr = `${monthStr}-22`;
      else {
        // Última semana: la EF pasa al primer día del mes siguiente
        const nm = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        nextDayStr = `${nm.getFullYear()}-${String(nm.getMonth() + 1).padStart(2, '0')}-01`;
      }
      void lastDay;
    } else {
      const nextDay = new Date(targetDate + 'T12:00:00');
      nextDay.setDate(nextDay.getDate() + 1);
      nextDayStr = nextDay.toISOString().split('T')[0];
    }

    // Optimistic update
    setDailyData(prev => {
      const currentDayData = {
        ...(prev[targetDate]?.[id] || { ei: 0, prestamosEnviados: 0, prestamosRecibidos: 0, consumoPersonal: 0, ef: 0, ventasTeorico: 0, decomisos: 0, compras: 0 }),
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
            ...(newState[nextDayStr]?.[id] || { ei: 0, prestamosEnviados: 0, prestamosRecibidos: 0, consumoPersonal: 0, ef: 0, ventasTeorico: 0, decomisos: 0, compras: 0 }),
            ei: value
          }
        };
      }

      return newState;
    });

    // Map frontend field to DB column
    const columnMap: Record<string, string> = {
      ei: 'ei',
      prestamosEnviados: 'prestamos_enviados',
      prestamosRecibidos: 'prestamos_recibidos',
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
      const data = dailyData[selectedDate]?.[itemId] || { ei: 0, prestamosEnviados: 0, prestamosRecibidos: 0, consumoPersonal: 0, ef: 0, ventasTeorico: 0, decomisos: 0, compras: 0 };
      return data.ei + data.compras + data.prestamosRecibidos - data.prestamosEnviados - data.decomisos - data.consumoPersonal - data.ef;
    } else if (viewMode === 'semana') {
      // Modelo semanal: todo el registro vive en el primer día de la semana
      const dates = getDatesInRange('semana', selectedDate);
      const wk = dailyData[dates[0]]?.[itemId] || { ei: 0, prestamosEnviados: 0, prestamosRecibidos: 0, consumoPersonal: 0, ef: 0, ventasTeorico: 0, decomisos: 0, compras: 0 };
      // Decomisos del período (vienen de otros módulos, repartidos por día)
      const totals = getPeriodTotals(itemId, dates);
      return wk.ei + wk.compras + wk.prestamosRecibidos - wk.prestamosEnviados - totals.decomisos - wk.consumoPersonal - wk.ef;
    } else {
      const dates = getDatesInRange(viewMode, selectedDate);
      const totals = dates.reduce((acc, d) => {
        const data = dailyData[d]?.[itemId];
        if (data) {
          acc.compras += data.compras;
          acc.prestamosEnviados += data.prestamosEnviados || 0;
          acc.prestamosRecibidos += data.prestamosRecibidos || 0;
          acc.consumoPersonal += data.consumoPersonal;
          acc.decomisos += data.decomisos;
          acc.ventasTeorico += data.ventasTeorico;
        }
        return acc;
      }, { compras: 0, prestamosEnviados: 0, prestamosRecibidos: 0, consumoPersonal: 0, decomisos: 0, ventasTeorico: 0 });

      const monthStr = selectedDate.substring(0, 7);
      const ei = dailyData[`${monthStr}-01`]?.[itemId]?.ei || 0;
      const weekStarts = ['01', '08', '15', '22'];
      let ef = 0;
      for (let i = weekStarts.length - 1; i >= 0; i--) {
        const v = dailyData[`${monthStr}-${weekStarts[i]}`]?.[itemId]?.ef;
        if (v) { ef = v; break; }
      }
      return ei + totals.compras + totals.prestamosRecibidos - totals.prestamosEnviados - totals.decomisos - totals.consumoPersonal - ef;
    }
  };

  const controlledItems = items.filter(item => localControlledItemIds.includes(item.id));

  // Helper to get totals for a specific period
  const getPeriodTotals = (itemId: string, dates: string[]) => {
    return dates.reduce((acc, date) => {
      const data = dailyData[date]?.[itemId];
      if (data) {
        acc.compras += data.compras;
        acc.prestamosEnviados += data.prestamosEnviados || 0;
        acc.prestamosRecibidos += data.prestamosRecibidos || 0;
        acc.consumoPersonal += data.consumoPersonal;
        acc.decomisos += data.decomisos;
        acc.ventasTeorico += data.ventasTeorico;
      }
      return acc;
    }, { compras: 0, prestamosEnviados: 0, prestamosRecibidos: 0, consumoPersonal: 0, decomisos: 0, ventasTeorico: 0 });
  };

  const isCurrentWeekClosed = (itemId: string) => {
    if (viewMode !== 'semana') return false;
    const currentWeekNum = getWeekNumber(selectedDate);
    const closureKey = `${selectedBranchId}-${selectedDate.substring(0, 7)}-${currentWeekNum}-${itemId}`;
    return closedWeeks[closureKey] || false;
  };

  const handleCloseWeek = async (itemId: string, itemName: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!selectedBranchId) return;
    const currentMonth = selectedDate.substring(0, 7);
    const currentWeekNum = getWeekNumber(selectedDate);
    const closureKey = `${selectedBranchId}-${currentMonth}-${currentWeekNum}-${itemId}`;

    if (window.confirm(`¿Está seguro de que desea cerrar el stock de ${itemName} para la SEMANA ${currentWeekNum} de ${currentMonth}? Una vez cerrado, los datos no podrán ser modificados.`)) {
      const { error } = await supabase
        .from('inventory_week_closures')
        .upsert({
          branch_id: selectedBranchId,
          month: currentMonth,
          week_number: currentWeekNum,
          item_id: itemId
        }, { onConflict: 'branch_id,month,week_number,item_id' });

      if (!error) {
        setClosedWeeks(prev => ({ ...prev, [closureKey]: true }));
        alert(`Stock de ${itemName} cerrado exitosamente para la semana ${currentWeekNum}.`);
      } else {
        console.error('Error closing week:', error);
        alert(`Error al cerrar el insumo. Es posible que falte la columna 'item_id' en la tabla 'inventory_week_closures'. 
        
Para solucionar esto, ejecute:
ALTER TABLE inventory_week_closures ADD COLUMN item_id TEXT;
ALTER TABLE inventory_week_closures DROP CONSTRAINT IF EXISTS inventory_week_closures_branch_id_month_week_number_key;
ALTER TABLE inventory_week_closures ADD UNIQUE (branch_id, month, week_number, item_id);`);
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
              type="month" 
              value={selectedDate.substring(0, 7)}
              onChange={(e) => {
                const newMonth = e.target.value; // YYYY-MM
                if (!newMonth) return;
                // Mantener la semana activa: usar el día de inicio de la semana actual en el nuevo mes
                const currentDay = selectedDate.substring(8, 10);
                const weekDay = ['01', '08', '15', '22'].includes(currentDay) ? currentDay : '01';
                setSelectedDate(`${newMonth}-${weekDay}`);
              }}
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
                <th className="px-4 py-4 text-center tracking-widest bg-brand-500/5">P. Recibidos</th>
                <th className="px-4 py-4 text-center tracking-widest bg-brand-500/5">P. Enviados</th>
                <th className="px-4 py-4 text-center tracking-widest bg-orange-500/5">Consumo Pers.</th>
                <th className="px-4 py-4 text-center tracking-widest bg-brand-500/5">EF</th>
                {!isAlmacen && <th className="px-4 py-4 text-center tracking-widest bg-purple-500/5">Ventas Teo.</th>}
                <th className="px-4 py-4 text-center tracking-widest bg-red-500/5">Decomisos</th>
                <th className="px-4 py-4 text-center font-black text-brand-500 bg-brand-500/5 tracking-widest">CMV REAL</th>
                <th className="px-4 py-4 text-left font-black text-brand-500 tracking-widest border-l border-border-dim/20">DESVÍO</th>
                <th className="px-6 py-4 text-right sticky right-0 bg-bg-accent z-20 border-l border-border-dim/20 w-40">Cierre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dim">
              {controlledItems.map((item) => {
                let data;
                let weekTargetDate = selectedDate;
                if (viewMode === 'dia') {
                  data = dailyData[selectedDate]?.[item.id] || { ei: 0, prestamosEnviados: 0, prestamosRecibidos: 0, consumoPersonal: 0, ef: 0, ventasTeorico: 0, decomisos: 0, compras: 0 };
                } else if (viewMode === 'semana') {
                  // Modelo semanal: toda la carga de la semana vive en el primer día de la semana
                  const dates = getDatesInRange('semana', selectedDate);
                  weekTargetDate = dates[0];
                  const wk = dailyData[weekTargetDate]?.[item.id] || { ei: 0, prestamosEnviados: 0, prestamosRecibidos: 0, consumoPersonal: 0, ef: 0, ventasTeorico: 0, decomisos: 0, compras: 0 };
                  // Decomisos y ventas teóricas se acumulan de todo el período (vienen de otros módulos)
                  const totals = getPeriodTotals(item.id, dates);
                  data = { ...wk, decomisos: totals.decomisos, ventasTeorico: totals.ventasTeorico };
                } else {
                  // Vista mes: resumen (solo lectura), suma del período
                  const dates = getDatesInRange('mes', selectedDate);
                  const totals = getPeriodTotals(item.id, dates);
                  // En el mes, EI = primer día con datos, EF = último día con datos
                  const weekStarts = ['01', '08', '15', '22'];
                  const monthStr = selectedDate.substring(0, 7);
                  const eiVal = dailyData[`${monthStr}-01`]?.[item.id]?.ei || 0;
                  let efVal = 0;
                  for (let i = weekStarts.length - 1; i >= 0; i--) {
                    const v = dailyData[`${monthStr}-${weekStarts[i]}`]?.[item.id]?.ef;
                    if (v) { efVal = v; break; }
                  }
                  data = { ei: eiVal, ef: efVal, ...totals };
                }
                
                const cmvReal = calculateCMVReal(item.id);
                const desvio = cmvReal - data.ventasTeorico;
                const isSummary = viewMode === 'mes';
                const isItemLocked = isCurrentWeekClosed(item.id);
                // La EI solo es editable en la Semana 1 (o vista día). En semanas 2/3/4 viene del EF anterior.
                const eiEditable = isAlmacen || viewMode === 'dia' || (viewMode === 'semana' && getWeekNumber(selectedDate) === 1);

                return (
                  <tr key={item.id} className="hover:bg-bg-accent/50 transition-colors group text-[11px]">
                    <td className="px-6 py-4 sticky left-0 bg-bg-sidebar group-hover:bg-bg-accent/50 z-10 border-r border-border-dim/20">
                      <div className="flex flex-col">
                        <span className="font-black text-text-main uppercase">{item.name}</span>
                        <span className="text-[9px] text-text-dim uppercase font-bold opacity-60">{item.unit}</span>
                      </div>
                    </td>
                    
                    {/* EI: editable solo en Semana 1; en 2/3/4 viene del EF anterior */}
                    <StockInputCell 
                      value={data.ei} 
                      onChange={val => updateItemData(item.id, 'ei', val, weekTargetDate)}
                      disabled={isSummary || isItemLocked || !eiEditable} 
                      className="bg-brand-500/5 font-bold"
                    />

                    {/* Compras (Editable for all if in daily view) */}
                    <StockInputCell 
                      value={data.compras} 
                      onChange={val => updateItemData(item.id, 'compras', val, weekTargetDate)}
                      disabled={isSummary || isItemLocked} 
                      className="bg-emerald-500/5"
                    />

                    {/* Préstamos Recibidos */}
                    <StockInputCell 
                      value={data.prestamosRecibidos} 
                      onChange={val => updateItemData(item.id, 'prestamosRecibidos', val, weekTargetDate)}
                      disabled={isSummary || isItemLocked}
                      className="bg-brand-500/5"
                    />

                    {/* Préstamos Enviados */}
                    <StockInputCell 
                      value={data.prestamosEnviados} 
                      onChange={val => updateItemData(item.id, 'prestamosEnviados', val, weekTargetDate)}
                      disabled={isSummary || isItemLocked}
                      className="bg-brand-500/5"
                    />

                    {/* Consumo Pers. (Encargado) */}
                    <StockInputCell 
                      value={data.consumoPersonal} 
                      onChange={val => updateItemData(item.id, 'consumoPersonal', val, weekTargetDate)}
                      disabled={isSummary || isItemLocked}
                    />

                    {/* EF (Encargado) */}
                    <StockInputCell 
                      value={data.ef} 
                      onChange={val => updateItemData(item.id, 'ef', val, weekTargetDate)}
                      disabled={isSummary || isItemLocked}
                    />

                    {/* Ventas Teo (Read-only in this view) - no aplica al almacén */}
                    {!isAlmacen && (
                      <StockInputCell 
                        value={data.ventasTeorico} 
                        onChange={val => updateItemData(item.id, 'ventasTeorico', val)}
                        disabled={true}
                      />
                    )}

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
                    <td className="px-6 py-4 text-right sticky right-0 bg-bg-sidebar group-hover:bg-bg-accent/50 z-10 border-l border-border-dim/20 font-bold">
                      {viewMode === 'semana' && (
                        isCurrentWeekClosed(item.id) ? (
                          <div className="flex flex-col items-end opacity-50">
                            <span className="text-[8px] font-black uppercase text-red-500">INSUMO</span>
                            <span className="text-[10px] font-black uppercase text-red-500">CERRADO</span>
                          </div>
                        ) : (
                          <button 
                            onClick={() => handleCloseWeek(item.id, item.name)}
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
                CMV = EI + Compras + Préstamos Recibidos - Préstamos Enviados - Consumo Personal - Decomisos - EF
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
              {viewMode === 'semana' ? "CIERRES INDIVIDUALES POR INSUMO" : "ESTADO DEL CONTROL MENSUAL"}
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
        step="0.001"
        value={value || ''}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        placeholder="0.000"
        disabled={disabled}
        className={cn(
          "w-16 mx-auto block bg-transparent border border-border-dim/50 rounded py-1 px-1 text-center text-[10px] text-text-main font-mono focus:border-brand-500 outline-none transition-colors",
          disabled && "opacity-70 cursor-not-allowed border-none font-bold"
        )}
      />
    </td>
  );
}
