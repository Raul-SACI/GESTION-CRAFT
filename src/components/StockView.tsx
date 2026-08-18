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
    produccion: number;
    recupero: number;
    ventasPersonal: number;
  }>>>({});

  const [localControlledItemIds, setLocalControlledItemIds] = useState<string[]>(controlledItemIds);

  // Vinculación de ventas (nombres del ranking POS) con recetas del maestro
  const canManageAliases = userRole === 'administrador' || userRole === 'dueño';
  const [refreshKey, setRefreshKey] = useState(0);
  const [unmatchedSales, setUnmatchedSales] = useState<{ name: string; qty: number }[]>([]);
  // Desglose de venta teórica por insumo: qué productos vendidos suman y cuánto
  const [ventasDetalle, setVentasDetalle] = useState<Record<string, Array<{ product: string; sold: number; perUnit: number; aporte: number }>>>({});
  const [detalleItem, setDetalleItem] = useState<{ id: string; name: string } | null>(null);
  const [productsList, setProductsList] = useState<{ id: string; name: string }[]>([]);
  const [linkChoice, setLinkChoice] = useState<Record<string, string>>({});
  const [showUnmatched, setShowUnmatched] = useState(false);

  // Guarda un alias (nombre del ranking -> producto del maestro) o lo marca como "ignorar"
  // (venta que no consume ningún insumo controlado). Luego recalcula las ventas teóricas.
  const linkSale = async (name: string, productId: string | null, ignore: boolean) => {
    try {
      const { error } = await supabase.from('product_ranking_aliases').upsert(
        { alias_name: name, product_id: productId, ignore }, { onConflict: 'alias_name' }
      );
      if (error) throw error;
      setRefreshKey(k => k + 1);
    } catch (e: any) {
      alert('No se pudo guardar el vínculo. Verificá que exista la tabla product_ranking_aliases.\n\n' + (e?.message || ''));
    }
  };

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
            compras: log.compras,
            produccion: log.produccion || 0,
            recupero: log.recupero || 0,
            ventasPersonal: log.ventas_personal || 0,
            touched: (log.touched_fields || '').split(',').filter(Boolean)
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
              compras: 0,
              produccion: 0,
              recupero: 0,
              ventasPersonal: 0
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
                merged[date][itemId] = { ei: 0, prestamosEnviados: 0, prestamosRecibidos: 0, consumoPersonal: 0, ef: 0, ventasTeorico: 0, decomisos: rounded, compras: 0, produccion: 0, recupero: 0, ventasPersonal: 0 };
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
        setUnmatchedSales([]);
        setVentasDetalle({});
        const weekNum = getWeekNumber(selectedDate);
        // Traer el ranking de la sucursal para el mes/semana en curso
        const { data: rankingData } = await supabase
          .from('product_rankings')
          .select('product_code, product_name, quantity, week_number, month')
          .eq('branch_id', selectedBranchId)
          .eq('month', currentMonth)
          .eq('week_number', weekNum);

        if (rankingData && rankingData.length > 0) {
          // Traer productos (para mapear código/nombre -> id) y recetas
          const { data: productsData } = await supabase.from('products').select('id, name, code');
          const { data: recipesData2 } = await supabase.from('recipes').select('product_id, item_id, quantity');

          const norm = (s: string) => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
          const normCode = (c: any) => String(c ?? '').trim();
          const productIdByName: Record<string, string> = {};
          const productIdByCode: Record<string, string> = {};
          (productsData || []).forEach((p: any) => {
            if (p.name) productIdByName[norm(p.name)] = p.id;
            if (normCode(p.code) !== '') productIdByCode[normCode(p.code)] = p.id;
          });
          setProductsList(((productsData || []) as any[]).map(p => ({ id: p.id, name: p.name })).sort((a, b) => String(a.name).localeCompare(String(b.name))));

          // Alias de ventas: el nombre del producto en el ranking (POS) muchas veces NO coincide
          // exacto con el maestro (ej. "CHICKEN & CHEESE BLT" vs "SANDWICH CHICKEN & CHEESE BLT").
          // Estos alias resuelven ese caso; "ignore" marca ventas que no consumen ningún insumo.
          const ignoredSales = new Set<string>();
          try {
            const { data: aliasData } = await supabase.from('product_ranking_aliases').select('alias_name, product_id, ignore');
            (aliasData || []).forEach((a: any) => {
              if (!a.alias_name) return;
              if (a.ignore) { ignoredSales.add(norm(a.alias_name)); return; }
              if (a.product_id) productIdByName[norm(a.alias_name)] = a.product_id;
            });
          } catch (e) { /* la tabla de alias es opcional */ }

          const recipeByProd: Record<string, Array<{ itemId: string; quantity: number }>> = {};
          (recipesData2 || []).forEach((r: any) => {
            if (!r.product_id || !r.item_id) return;
            if (!recipeByProd[r.product_id]) recipeByProd[r.product_id] = [];
            recipeByProd[r.product_id].push({ itemId: r.item_id, quantity: Number(r.quantity || 0) });
          });

          // Acumular ventas teóricas por insumo + guardar el desglose (qué productos suman)
          // + detectar ventas sin vincular a una receta
          const theoreticalByItem: Record<string, number> = {};
          // Desglose agrupado por producto (el ranking del POS puede traer el mismo plato en
          // varias líneas —distinto código/botón de caja—; se suman en una sola fila).
          const detailByItem: Record<string, Record<string, { product: string; sold: number; perUnit: number; aporte: number }>> = {};
          const unmatchedMap: Record<string, { name: string; qty: number }> = {};
          rankingData.forEach((rk: any) => {
            const soldQty = Number(rk.quantity || 0);
            // Resolver el producto: PRIMERO por código (dato confiable del POS), luego por
            // nombre/alias. Esto evita confundir dos productos con el mismo nombre pero
            // distinto código (ej. "...BLT" vs "...BLT ME").
            const prodId = (normCode(rk.product_code) !== '' && productIdByCode[normCode(rk.product_code)]) || productIdByName[norm(rk.product_name)];
            const recipe = prodId ? recipeByProd[prodId] : null;
            if (!prodId) {
              // No resuelve a NINGÚN producto (ni por código ni por nombre/alias): se avisa
              // para poder vincularlo, salvo que esté marcado como "ignorar".
              if (!ignoredSales.has(norm(rk.product_name))) {
                const k = norm(rk.product_name);
                if (!unmatchedMap[k]) unmatchedMap[k] = { name: rk.product_name, qty: 0 };
                unmatchedMap[k].qty += soldQty;
              }
              return;
            }
            if (!recipe || recipe.length === 0) {
              // Resuelve a un producto SIN receta (no consume insumos controlados, ej. bebidas
              // o el "...BLT ME"): no suma y no se avisa.
              return;
            }
            recipe.forEach(ing => {
              const aporte = soldQty * ing.quantity;
              theoreticalByItem[ing.itemId] = (theoreticalByItem[ing.itemId] || 0) + aporte;
              if (aporte !== 0) {
                const bucket = (detailByItem[ing.itemId] = detailByItem[ing.itemId] || {});
                const pk = norm(rk.product_name);
                if (!bucket[pk]) bucket[pk] = { product: rk.product_name, sold: 0, perUnit: ing.quantity, aporte: 0 };
                bucket[pk].sold += soldQty;
                bucket[pk].aporte += aporte;
              }
            });
          });
          // Cada desglose: pasar a lista y ordenar de mayor a menor aporte
          const detailArr: Record<string, Array<{ product: string; sold: number; perUnit: number; aporte: number }>> = {};
          Object.keys(detailByItem).forEach(id => { detailArr[id] = Object.values(detailByItem[id]).sort((a, b) => b.aporte - a.aporte); });
          setVentasDetalle(detailArr);
          setUnmatchedSales(Object.values(unmatchedMap).filter(u => u.qty !== 0).sort((a, b) => b.qty - a.qty));

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
                merged[firstDay][itemId] = { ei: 0, prestamosEnviados: 0, prestamosRecibidos: 0, consumoPersonal: 0, ef: 0, ventasTeorico: vt, decomisos: 0, compras: 0, produccion: 0, recupero: 0, ventasPersonal: 0 };
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
  }, [selectedBranchId, selectedDate, viewMode, refreshKey]);

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
    let touchedForSave: string[] = [];
    let nextTouchedForSave: string[] = [];
    setDailyData(prev => {
      const existing = prev[targetDate]?.[id] || { ei: 0, prestamosEnviados: 0, prestamosRecibidos: 0, consumoPersonal: 0, ef: 0, ventasTeorico: 0, decomisos: 0, compras: 0, produccion: 0, recupero: 0, ventasPersonal: 0, touched: [] };
      const prevTouched: string[] = existing.touched || [];
      const newTouched = prevTouched.includes(field) ? prevTouched : [...prevTouched, field];
      touchedForSave = newTouched;
      const currentDayData = {
        ...existing,
        [field]: value,
        touched: newTouched
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
        const nextExisting = newState[nextDayStr]?.[id] || { ei: 0, prestamosEnviados: 0, prestamosRecibidos: 0, consumoPersonal: 0, ef: 0, ventasTeorico: 0, decomisos: 0, compras: 0, produccion: 0, recupero: 0, ventasPersonal: 0, touched: [] };
        const nextTouched: string[] = nextExisting.touched || [];
        const nextTouchedNew = nextTouched.includes('ei') ? nextTouched : [...nextTouched, 'ei'];
        nextTouchedForSave = nextTouchedNew;
        newState[nextDayStr] = {
          ...(newState[nextDayStr] || {}),
          [id]: {
            ...nextExisting,
            ei: value,
            touched: nextTouchedNew
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
      compras: 'compras',
      produccion: 'produccion',
      recupero: 'recupero',
      ventasPersonal: 'ventas_personal'
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
        [dbField]: value,
        touched_fields: touchedForSave.join(',')
      }, { onConflict: 'branch_id,item_id,date' });

    // If EF was updated, also update EI of next day in DB
    if (field === 'ef') {
       await supabase
         .from('inventory_logs')
         .upsert({
           branch_id: selectedBranchId,
           item_id: id,
           date: nextDayStr,
           ei: value,
           touched_fields: nextTouchedForSave.join(',')
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
      const data = dailyData[selectedDate]?.[itemId] || { ei: 0, prestamosEnviados: 0, prestamosRecibidos: 0, consumoPersonal: 0, ef: 0, ventasTeorico: 0, decomisos: 0, compras: 0, produccion: 0, recupero: 0, ventasPersonal: 0 };
      const extra = isAlmacen ? (data.produccion || 0) - (data.recupero || 0) - (data.ventasPersonal || 0) : 0;
      return data.ei + data.compras + data.prestamosRecibidos - data.prestamosEnviados - data.decomisos - data.consumoPersonal - data.ef + extra;
    } else if (viewMode === 'semana') {
      // Modelo semanal: todo el registro vive en el primer día de la semana
      const dates = getDatesInRange('semana', selectedDate);
      const wk = dailyData[dates[0]]?.[itemId] || { ei: 0, prestamosEnviados: 0, prestamosRecibidos: 0, consumoPersonal: 0, ef: 0, ventasTeorico: 0, decomisos: 0, compras: 0, produccion: 0, recupero: 0, ventasPersonal: 0 };
      // Decomisos del período (vienen de otros módulos, repartidos por día)
      const totals = getPeriodTotals(itemId, dates);
      const extra = isAlmacen ? (wk.produccion || 0) - (wk.recupero || 0) - (wk.ventasPersonal || 0) : 0;
      return wk.ei + wk.compras + wk.prestamosRecibidos - wk.prestamosEnviados - totals.decomisos - wk.consumoPersonal - wk.ef + extra;
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
          acc.produccion += data.produccion || 0;
          acc.recupero += data.recupero || 0;
          acc.ventasPersonal += data.ventasPersonal || 0;
        }
        return acc;
      }, { compras: 0, prestamosEnviados: 0, prestamosRecibidos: 0, consumoPersonal: 0, decomisos: 0, ventasTeorico: 0, produccion: 0, recupero: 0, ventasPersonal: 0 });

      const monthStr = selectedDate.substring(0, 7);
      const ei = dailyData[`${monthStr}-01`]?.[itemId]?.ei || 0;
      const weekStarts = ['01', '08', '15', '22'];
      let ef = 0;
      for (let i = weekStarts.length - 1; i >= 0; i--) {
        const v = dailyData[`${monthStr}-${weekStarts[i]}`]?.[itemId]?.ef;
        if (v) { ef = v; break; }
      }
      const extra = isAlmacen ? (totals.produccion || 0) - (totals.recupero || 0) - (totals.ventasPersonal || 0) : 0;
      return ei + totals.compras + totals.prestamosRecibidos - totals.prestamosEnviados - totals.decomisos - totals.consumoPersonal - ef + extra;
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
        acc.produccion += data.produccion || 0;
        acc.recupero += data.recupero || 0;
        acc.ventasPersonal += data.ventasPersonal || 0;
      }
      return acc;
    }, { compras: 0, prestamosEnviados: 0, prestamosRecibidos: 0, consumoPersonal: 0, decomisos: 0, ventasTeorico: 0, produccion: 0, recupero: 0, ventasPersonal: 0 });
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

      {/* Ventas del ranking que no se pudieron vincular a una receta (no suman venta teórica) */}
      {!isAlmacen && canManageAliases && unmatchedSales.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded overflow-hidden">
          <button onClick={() => setShowUnmatched(v => !v)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-amber-500/10 transition-all">
            <div className="flex items-center gap-2 text-amber-600">
              <Info size={15} />
              <span className="text-[11px] font-black uppercase tracking-widest">
                {unmatchedSales.length} venta(s) sin vincular a una receta
              </span>
              <span className="text-[9px] font-bold text-amber-600/70 normal-case tracking-normal hidden sm:inline">
                · no suman venta teórica hasta vincularlas
              </span>
            </div>
            <span className="text-[10px] font-black text-amber-600">{showUnmatched ? 'OCULTAR' : 'VER / VINCULAR'}</span>
          </button>
          {showUnmatched && (
            <div className="border-t border-amber-500/30 divide-y divide-amber-500/20 max-h-80 overflow-y-auto">
              {unmatchedSales.map(u => (
                <div key={u.name} className="px-4 py-2.5 flex flex-col md:flex-row md:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-bold text-text-main">{u.name}</span>
                    <span className="text-[9px] font-mono text-text-dim ml-2">({u.qty} u. vendidas)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={linkChoice[u.name] || ''}
                      onChange={(e) => setLinkChoice(prev => ({ ...prev, [u.name]: e.target.value }))}
                      className="bg-bg-accent border border-border-dim rounded px-2 py-1 text-[10px] text-text-main outline-none max-w-[220px]">
                      <option value="">— Vincular a producto… —</option>
                      {productsList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <button
                      disabled={!linkChoice[u.name]}
                      onClick={() => linkSale(u.name, linkChoice[u.name], false)}
                      className="bg-emerald-500 text-black px-3 py-1 rounded text-[9px] font-black uppercase disabled:opacity-40 hover:bg-emerald-600 transition-all">
                      Vincular
                    </button>
                    <button
                      onClick={() => linkSale(u.name, null, true)}
                      title="Esta venta no consume ningún insumo controlado (ej. bebidas). No volverá a avisar."
                      className="bg-bg-accent border border-border-dim text-text-dim px-3 py-1 rounded text-[9px] font-black uppercase hover:text-text-main transition-all">
                      Ignorar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
                {isAlmacen && <th className="px-4 py-4 text-center tracking-widest bg-emerald-500/5">Producción (IG O)</th>}
                <th className="px-4 py-4 text-center tracking-widest bg-brand-500/5">{isAlmacen ? 'Devolución Sucursales' : 'P. Recibidos'}</th>
                <th className="px-4 py-4 text-center tracking-widest bg-brand-500/5">{isAlmacen ? 'Envíos a Sucursal (EG)' : 'P. Enviados'}</th>
                <th className="px-4 py-4 text-center tracking-widest bg-orange-500/5">{isAlmacen ? 'Consumo (EG 9)' : 'Consumo Pers.'}</th>
                {isAlmacen && <th className="px-4 py-4 text-center tracking-widest bg-red-500/5">Recupero EGR</th>}
                {isAlmacen && <th className="px-4 py-4 text-center tracking-widest bg-red-500/5">Ventas Pers. (EG C)</th>}
                {isAlmacen && <th className="px-4 py-4 text-center tracking-widest bg-red-500/5">Decomisos (EG 8)</th>}
                <th className="px-4 py-4 text-center tracking-widest bg-brand-500/5">EF</th>
                {!isAlmacen && <th className="px-4 py-4 text-center tracking-widest bg-purple-500/5">Ventas Teo.</th>}
                {!isAlmacen && <th className="px-4 py-4 text-center tracking-widest bg-red-500/5">Decomisos</th>}
                {!isAlmacen && <th className="px-4 py-4 text-center font-black text-brand-500 bg-brand-500/5 tracking-widest">CMV REAL</th>}
                <th className="px-4 py-4 text-left font-black text-brand-500 tracking-widest border-l border-border-dim/20">DESVÍO</th>
                <th className="px-4 py-4 text-left font-black text-brand-500 tracking-widest">DESVÍO %</th>
                <th className="px-6 py-4 text-right sticky right-0 bg-bg-accent z-20 border-l border-border-dim/20 w-40">Cierre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dim">
              {controlledItems.map((item) => {
                let data;
                let weekTargetDate = selectedDate;
                if (viewMode === 'dia') {
                  data = dailyData[selectedDate]?.[item.id] || { ei: 0, prestamosEnviados: 0, prestamosRecibidos: 0, consumoPersonal: 0, ef: 0, ventasTeorico: 0, decomisos: 0, compras: 0, produccion: 0, recupero: 0, ventasPersonal: 0 };
                } else if (viewMode === 'semana') {
                  // Modelo semanal: toda la carga de la semana vive en el primer día de la semana
                  const dates = getDatesInRange('semana', selectedDate);
                  weekTargetDate = dates[0];
                  const wk = dailyData[weekTargetDate]?.[item.id] || { ei: 0, prestamosEnviados: 0, prestamosRecibidos: 0, consumoPersonal: 0, ef: 0, ventasTeorico: 0, decomisos: 0, compras: 0, produccion: 0, recupero: 0, ventasPersonal: 0 };
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
                    if (v !== undefined && v !== null) { efVal = v; break; }
                  }
                  data = { ei: eiVal, ef: efVal, ...totals };
                }
                
                const cmvReal = calculateCMVReal(item.id);
                // En Centro de Producción NO hay ventas: el desvío es directamente el resultado de la fórmula.
                // En sucursales, el desvío es CMV real menos ventas teóricas (como siempre).
                const desvio = isAlmacen ? cmvReal : cmvReal - data.ventasTeorico;
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
                      touched={data.touched?.includes('ei')}
                      disabled={isSummary || isItemLocked || !eiEditable} 
                      className="bg-brand-500/5 font-bold"
                    />

                    {/* Compras (Editable for all if in daily view) */}
                    <StockInputCell 
                      value={data.compras} 
                      onChange={val => updateItemData(item.id, 'compras', val, weekTargetDate)}
                      touched={data.touched?.includes('compras')}
                      disabled={isSummary || isItemLocked} 
                      className="bg-emerald-500/5"
                    />

                    {/* Producción (ingreso) - solo Centro de Producción */}
                    {isAlmacen && (
                      <StockInputCell 
                        value={data.produccion} 
                        onChange={val => updateItemData(item.id, 'produccion', val, weekTargetDate)}
                        touched={data.touched?.includes('produccion')}
                        disabled={isSummary || isItemLocked} 
                        className="bg-emerald-500/5"
                      />
                    )}

                    {/* Préstamos Recibidos */}
                    <StockInputCell 
                      value={data.prestamosRecibidos} 
                      onChange={val => updateItemData(item.id, 'prestamosRecibidos', val, weekTargetDate)}
                      touched={data.touched?.includes('prestamosRecibidos')}
                      disabled={isSummary || isItemLocked}
                      className="bg-brand-500/5"
                    />

                    {/* Préstamos Enviados */}
                    <StockInputCell 
                      value={data.prestamosEnviados} 
                      onChange={val => updateItemData(item.id, 'prestamosEnviados', val, weekTargetDate)}
                      touched={data.touched?.includes('prestamosEnviados')}
                      disabled={isSummary || isItemLocked}
                      className="bg-brand-500/5"
                    />

                    {/* Consumo Pers. (Encargado) */}
                    <StockInputCell 
                      value={data.consumoPersonal} 
                      onChange={val => updateItemData(item.id, 'consumoPersonal', val, weekTargetDate)}
                      touched={data.touched?.includes('consumoPersonal')}
                      disabled={isSummary || isItemLocked}
                    />

                    {/* Recupero (egreso) - solo Centro de Producción */}
                    {isAlmacen && (
                      <StockInputCell 
                        value={data.recupero} 
                        onChange={val => updateItemData(item.id, 'recupero', val, weekTargetDate)}
                        touched={data.touched?.includes('recupero')}
                        disabled={isSummary || isItemLocked}
                        className="bg-red-500/5"
                      />
                    )}

                    {/* Ventas al Personal (egreso) - solo Centro de Producción */}
                    {isAlmacen && (
                      <StockInputCell 
                        value={data.ventasPersonal} 
                        onChange={val => updateItemData(item.id, 'ventasPersonal', val, weekTargetDate)}
                        touched={data.touched?.includes('ventasPersonal')}
                        disabled={isSummary || isItemLocked}
                        className="bg-red-500/5"
                      />
                    )}

                    {/* Decomisos (Read-only) - en Almacén va ANTES de EF */}
                    {isAlmacen && (
                      <StockInputCell 
                        value={data.decomisos} 
                        onChange={val => updateItemData(item.id, 'decomisos', val)}
                        touched={data.touched?.includes('decomisos')}
                        disabled={true}
                        className="bg-red-500/5"
                      />
                    )}

                    {/* EF (Encargado) */}
                    <StockInputCell 
                      value={data.ef} 
                      onChange={val => updateItemData(item.id, 'ef', val, weekTargetDate)}
                      touched={data.touched?.includes('ef')}
                      disabled={isSummary || isItemLocked}
                    />

                    {/* Ventas Teo (Read-only in this view) - no aplica al almacén */}
                    {!isAlmacen && (
                      <StockInputCell
                        value={data.ventasTeorico}
                        onChange={val => updateItemData(item.id, 'ventasTeorico', val)}
                        touched={data.touched?.includes('ventasTeorico')}
                        disabled={true}
                        extra={viewMode === 'semana' && (ventasDetalle[item.id]?.length ? (
                          <button onClick={() => setDetalleItem({ id: item.id, name: item.name })}
                            title="Ver qué productos vendidos suman esta venta teórica"
                            className="mt-1 mx-auto flex items-center gap-1 text-[8px] font-black uppercase text-purple-500 hover:text-purple-400 transition-colors">
                            <Info size={9} /> Ver detalle
                          </button>
                        ) : null)}
                      />
                    )}

                    {/* Decomisos (Read-only) - en sucursales va DESPUÉS de EF */}
                    {!isAlmacen && (
                      <StockInputCell 
                        value={data.decomisos} 
                        onChange={val => updateItemData(item.id, 'decomisos', val)}
                        touched={data.touched?.includes('decomisos')}
                        disabled={true}
                      />
                    )}
                    
                    {/* CMV REAL Result - oculto en Centro de Producción (no vende) */}
                    {!isAlmacen && (
                      <td className="px-4 py-4 bg-brand-500/5 border-x border-brand-500/10 text-center font-mono font-black text-text-main">
                        {cmvReal.toFixed(1)}
                      </td>
                    )}

                    {/* DESVÍO Result */}
                    <td className="px-4 py-4 text-left border-l border-border-dim/20">
                       <span className={cn(
                         "px-2 py-0.5 rounded font-mono font-black",
                         Math.abs(desvio) < 2 ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                       )}>
                         {desvio > 0 ? '+' : ''}{desvio.toFixed(1)}
                       </span>
                    </td>

                    {/* DESVÍO %:
                         - Sucursal: desvío / EXISTENCIA FINAL TEÓRICA (lo que debería haber quedado).
                           EF teórica = EI + compras + prést.recib − prést.env − venta teórica − decomisos − consumo = EF real + desvío.
                           Ej: EI 3 + compras 2 + prést 2 − prést env 2 − venta teó 2 − decomiso 1 = EF teó 2; EF real 1 → desvío 1 → 1/2 = 50%.
                         - Almacén (sin ventas teóricas): desvío / EF real. */}
                    {(() => {
                      const efReal = data.ef || 0;
                      const efTeorica = efReal + desvio; // = EI + compras + prést − prést env − venta teórica − decomisos − consumo
                      const base = isAlmacen ? efReal : efTeorica;
                      const desvioPct = base !== 0 ? (desvio / base) * 100 : null;
                      return (
                        <td className="px-4 py-4 text-left">
                          {desvioPct === null ? (
                            <span className="text-text-dim font-mono font-black px-2 py-0.5">—</span>
                          ) : (
                            <span className={cn(
                              "px-2 py-0.5 rounded font-mono font-black",
                              Math.abs(desvioPct) < 5 ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                            )}>
                              {desvioPct > 0 ? '+' : ''}{desvioPct.toFixed(1)}%
                            </span>
                          )}
                        </td>
                      );
                    })()}

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
        {!isAlmacen && (
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
        )}

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

      {/* Modal: detalle de venta teórica (qué productos vendidos suman) */}
      <AnimatePresence>
        {detalleItem && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setDetalleItem(null)}>
            <motion.div
              initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-bg-sidebar border border-border-dim rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
              <div className="px-5 py-4 border-b border-border-dim flex items-start justify-between bg-purple-500/5">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-purple-500">Detalle de Venta Teórica</p>
                  <h3 className="text-sm font-black text-text-main uppercase">{detalleItem.name}</h3>
                  <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest mt-0.5">
                    {activeBranch?.name} · Semana {getWeekNumber(selectedDate)} · {selectedDate.substring(0, 7)}
                  </p>
                </div>
                <button onClick={() => setDetalleItem(null)} className="text-text-dim hover:text-text-main"><X size={18} /></button>
              </div>
              <div className="overflow-y-auto">
                {(() => {
                  const det = ventasDetalle[detalleItem.id] || [];
                  const total = det.reduce((s, d) => s + d.aporte, 0);
                  if (det.length === 0) return <div className="py-10 text-center text-text-dim text-[11px] font-black uppercase">Sin productos vendidos que usen este insumo esta semana.</div>;
                  return (
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-bg-accent">
                        <tr className="text-[8px] font-black uppercase text-text-dim tracking-widest">
                          <th className="px-4 py-2">Producto vendido</th>
                          <th className="px-3 py-2 text-right">Vendidas</th>
                          <th className="px-3 py-2 text-right">× receta</th>
                          <th className="px-4 py-2 text-right">Aporte</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-dim/30">
                        {det.map((d, i) => (
                          <tr key={i} className="text-[10px] hover:bg-bg-accent/20">
                            <td className="px-4 py-2 font-bold text-text-main">{d.product}</td>
                            <td className="px-3 py-2 text-right font-mono text-text-dim">{d.sold}</td>
                            <td className="px-3 py-2 text-right font-mono text-text-dim">{d.perUnit}</td>
                            <td className="px-4 py-2 text-right font-mono font-black text-text-main">{(Math.round(d.aporte * 1000) / 1000).toLocaleString('es-AR')}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-purple-500/10 border-t-2 border-purple-500/40 text-[11px]">
                          <td className="px-4 py-2.5 font-black uppercase text-purple-500" colSpan={3}>Total Venta Teórica</td>
                          <td className="px-4 py-2.5 text-right font-mono font-black text-purple-500">{(Math.round(total * 1000) / 1000).toLocaleString('es-AR')}</td>
                        </tr>
                      </tfoot>
                    </table>
                  );
                })()}
              </div>
              <div className="px-5 py-2.5 border-t border-border-dim bg-bg-accent/30">
                <p className="text-[8px] font-bold text-text-dim uppercase tracking-widest">
                  Aporte = Vendidas × cantidad del insumo por unidad (según la receta). El total es lo que ves en la columna Ventas Teo.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function StockInputCell({ value, onChange, disabled, className, touched, extra }: { value: number, onChange: (val: number) => void, disabled?: boolean, className?: string, touched?: boolean, extra?: any }) {
  // text guarda EXACTAMENTE lo que hay en el campo. '' = vacío (placeholder gris); '0' = cero cargado (negrita)
  // Si el campo fue "tocado" (guardado), un 0 se muestra como '0' en negrita aunque venga de la base.
  const [text, setText] = useState<string>(value === 0 ? (touched ? '0' : '') : String(value));
  const [focused, setFocused] = useState(false);
  const [zeroTyped, setZeroTyped] = useState(!!touched && value === 0);

  useEffect(() => {
    if (!focused) {
      if (value === 0) setText((zeroTyped || touched) ? '0' : '');
      else { setText(String(value)); setZeroTyped(false); }
    }
  }, [value, focused, zeroTyped, touched]);

  const hasValue = text !== '';

  return (
    <td className={cn("px-2 py-4", disabled ? "bg-bg-accent/30" : "bg-bg-sidebar", className)}>
      <input 
        type="number"
        step="0.001"
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); }}
        onChange={e => {
          const raw = e.target.value;
          setText(raw);
          const isZero = raw !== '' && parseFloat(raw.replace(',', '.')) === 0;
          setZeroTyped(isZero);
          const parsed = raw === '' ? 0 : parseFloat(raw);
          onChange(isNaN(parsed) ? 0 : parsed);
        }}
        placeholder="0.000"
        disabled={disabled}
        className={cn(
          "w-16 mx-auto block bg-transparent border border-border-dim/50 rounded py-1 px-1 text-center text-[10px] font-mono focus:border-brand-500 outline-none transition-colors",
          hasValue ? "text-text-main font-bold" : "text-text-dim",
          disabled && "opacity-70 cursor-not-allowed border-none font-bold"
        )}
      />
      {extra}
    </td>
  );
}
