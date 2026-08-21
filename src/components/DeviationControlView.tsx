import React, { useState, useEffect, useMemo, useRef } from 'react';
import RecipeMastersManager from './RecipeMastersManager';
import { 
  BarChart3, 
  Settings2, 
  Table2, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle,
  Plus,
  X,
  Check,
  Search,
  BookOpen,
  Info,
  Trash2,
  Edit2,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Upload,
  Download,
  FileSpreadsheet,
  LayoutDashboard,
  Eye,
  EyeOff,
  Calculator,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Branch, StockItem, Product } from '../types';
import { recalcularCostosRecetas } from '../lib/recalcRecipeCosts';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';

/**
 * Input de cantidad para recetas.
 * Mantiene un "borrador" de texto mientras el usuario escribe, para que pueda
 * tipear decimales como "0.02" sin que el campo se reformatee en cada tecla.
 * Recien convierte a numero y guarda al salir del campo (onBlur) o al apretar Enter.
 * Acepta tanto punto como coma como separador decimal.
 */
function QuantityInput({
  value,
  onCommit,
  className,
  disabled = false,
}: {
  value: number;
  onCommit: (val: number) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  // Lo que se muestra: si el usuario esta editando, su borrador; si no, el valor real.
  const shown = draft !== null ? draft : String(value);

  const commit = () => {
    if (draft === null) return;
    const normalized = draft.trim().replace(',', '.');
    const parsed = parseFloat(normalized);
    onCommit(isNaN(parsed) ? 0 : parsed);
    setDraft(null); // vuelve a mostrar el valor real (ya guardado)
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={shown}
      disabled={disabled}
      onChange={(e) => {
        // Solo permitimos digitos, un separador decimal (punto o coma) y vacio.
        const v = e.target.value;
        if (v === '' || /^[0-9]*[.,]?[0-9]*$/.test(v)) setDraft(v);
      }}
      onFocus={(e) => { setDraft(String(value)); e.target.select(); }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur(); }
        if (e.key === 'Escape') { setDraft(null); (e.target as HTMLInputElement).blur(); }
      }}
      className={className}
    />
  );
}

export default function DeviationControlView({ 
  branches, 
  selectedBranchId,
  onBranchChange,
  controlledItemIds: initialControlledItemIds,
  setControlledItemIds: setInitialControlledItemIds,
  items,
  setItems,
  products,
  setProducts,
  currentUserRole,
  forcedTab,
  isReadOnly = false
}: { 
  branches: Branch[], 
  selectedBranchId: string,
  onBranchChange?: (id: string) => void,
  controlledItemIds: string[],
  setControlledItemIds: React.Dispatch<React.SetStateAction<string[]>>,
  items: StockItem[],
  setItems: React.Dispatch<React.SetStateAction<StockItem[]>>,
  products: Product[],
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>,
  currentUserRole?: string,
  forcedTab?: 'gestion' | 'recetas',
  isReadOnly?: boolean
}) {
  const [activeTab, setActiveTab] = useState<'selector' | 'recetas' | 'comparativo' | 'gestion' | 'planilla' | 'diagnostico'>(forcedTab || 'comparativo');
  
  // Persistence State
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [controlledIds, setControlledIds] = useState<string[]>([]);
  // Artículos del "Maestro Recetas Producción" (recipe_masters, tipo=produccion).
  // Se suman al Maestro de Insumos para poder controlarlos también en los desvíos.
  const [produccionItems, setProduccionItems] = useState<StockItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recipeViewMode, setRecipeViewMode] = useState<'individual' | 'table'>('individual');
  const [recipeTableSearch, setRecipeTableSearch] = useState('');
  const [selectorSearch, setSelectorSearch] = useState('');
  const [showOnlySelected, setShowOnlySelected] = useState(false);

  // Daily Logs State
  const [dailyLogs, setDailyLogs] = useState<any[]>([]);
  const [isSavingDaily, setIsSavingDaily] = useState(false);
  // Cierres administrativos de semana (clave "branch-mes-semana")
  const [adminClosures, setAdminClosures] = useState<Record<string, boolean>>({});
  // Semana seleccionada en la Planilla Semanal (0 = ver todas; 1..4 = una sola, vista como el encargado)
  const [planillaWeek, setPlanillaWeek] = useState<number>(1);
  const isAdmin = currentUserRole === 'administrador' || currentUserRole === 'dueño';

  // Recargar maestros desde Supabase para reflejar cambios al instante en pantalla
  const reloadItems = async () => {
    const { data } = await supabase.from('stock_items').select('*').order('name');
    if (data) setItems(data.map((i: any) => ({ id: i.id, name: i.name, unit: i.unit, cost: i.cost, category: i.category, code: i.code, is_active: i.is_active })));
  };
  const reloadProducts = async () => {
    const { data } = await supabase.from('products').select('*').order('name');
    if (data) setProducts(data.map((p: any) => ({ id: p.id, name: p.name, category: p.category, is_active: p.is_active, code: p.code, cost: p.cost })) as any);
  };
  // Trae los artículos del Maestro Recetas Producción (recipe_masters, tipo=produccion).
  const reloadProduccionItems = async () => {
    const { data } = await supabase.from('recipe_masters').select('*').eq('tipo', 'produccion').order('name');
    if (data) setProduccionItems(data.map((r: any) => ({
      id: r.id, name: r.name, unit: r.unit || 'UN', code: r.code || '', category: 'Producción', cost: r.cost ?? 0, is_active: r.is_active
    })));
  };
  useEffect(() => { reloadProduccionItems(); }, []);

  // Catálogo del Selector de Insumos: Maestro de Insumos + Maestro Recetas Producción.
  // Se deduplica por id (por si un id coincidiera) para no ofrecer entradas repetidas.
  const catalogItems = useMemo(() => {
    const byId = new Map<string, StockItem>();
    [...items, ...produccionItems].forEach(i => { if (!byId.has(i.id)) byId.set(i.id, i); });
    return Array.from(byId.values());
  }, [items, produccionItems]);
  // Ids que provienen del Maestro Recetas Producción, para distinguirlos visualmente.
  const prodIdSet = useMemo(() => new Set(produccionItems.map(i => i.id)), [produccionItems]);
  // El Almacén / Centro de Producción no vende: usa el mismo esquema de columnas que su
  // Control de Stock (Producción, Devolución, Envíos, Recupero, Ventas Pers.) en vez del de sucursal.
  const isAlmacen = selectedBranchId === 'n4ncoary3'
    || /almac/i.test(branches.find(b => b.id === selectedBranchId)?.name || '');

  // Recalcula costos de recetas/platos a partir de los costos actuales de insumos.
  const [recalcCostos, setRecalcCostos] = useState(false);
  const handleRecalcCostos = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    if (!window.confirm('Se van a recalcular y GUARDAR los costos de todas las recetas y platos usando los costos actuales de insumos. ¿Continuar?')) return;
    setRecalcCostos(true);
    try {
      const res = await recalcularCostosRecetas();
      await reloadProducts();
      alert(`Costos recalculados: ${res.recetas} receta(s) y ${res.platos} plato(s) actualizados.${res.sinMatch ? ` (${res.sinMatch} sin coincidencia en los maestros)` : ''}`);
    } catch (e: any) {
      alert('Error al recalcular costos: ' + (e.message || e));
    } finally {
      setRecalcCostos(false);
    }
  };

  // --- Eliminación múltiple de INSUMOS ---
  const toggleItemSelected = (id: string) => {
    setSelectedItemIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  // Cuenta cuántas recetas usan estos insumos (se borrarían en cascada)
  const contarRecetasAfectadas = async (itemIds: string[]): Promise<number> => {
    try {
      const { count } = await supabase
        .from('recipes')
        .select('*', { count: 'exact', head: true })
        .in('item_id', itemIds);
      return count || 0;
    } catch { return 0; }
  };

  const deleteSelectedItems = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    if (selectedItemIds.size === 0) return;
    const ids: string[] = Array.from(selectedItemIds).map(x => String(x));
    const nRecetas = await contarRecetasAfectadas(ids);
    const aviso = nRecetas > 0
      ? `⚠ ATENCIÓN: ${nRecetas} línea(s) de RECETAS usan estos insumos y SE BORRARÁN TAMBIÉN.\n\n`
      : '';
    if (!window.confirm(`${aviso}¿Eliminar ${selectedItemIds.size} insumo(s) seleccionado(s)? Esta acción no se puede deshacer.`)) return;
    if (nRecetas > 0 && !window.confirm(`Confirmación final: se van a borrar ${nRecetas} línea(s) de recetas junto con los insumos. ¿Continuar?`)) return;
    const { error } = await supabase.from('stock_items').delete().in('id', ids);
    if (error) { alert('Error al eliminar: ' + error.message); return; }
    setSelectedItemIds(new Set());
    await reloadItems();
  };
  const deleteAllItems = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    if (items.length === 0) return;
    const nRecetas = await contarRecetasAfectadas((items as any[]).map((i: any) => String(i.id)));
    const aviso = nRecetas > 0
      ? `⚠ ATENCIÓN: al borrar los insumos, TODAS LAS RECETAS SE BORRAN TAMBIÉN.\n\nSe perderán ${nRecetas} línea(s) de recetas y NO se pueden recuperar.\n\nSi tu intención es reimportar el maestro: NO hace falta borrar. La importación ya actualiza los insumos existentes sin duplicarlos ni romper las recetas.\n\n`
      : '';
    if (!window.confirm(`${aviso}¿Eliminar TODOS los ${items.length} insumos del maestro? Esta acción no se puede deshacer.`)) return;
    if (!window.confirm(`Confirmación final: se borrará el maestro de insumos completo${nRecetas > 0 ? ` Y ${nRecetas} línea(s) de recetas` : ''}. ¿Continuar?`)) return;
    const { error } = await supabase.from('stock_items').delete().in('id', (items as any[]).map(i => i.id));
    if (error) { alert('Error al eliminar: ' + error.message); return; }
    setSelectedItemIds(new Set());
    await reloadItems();
  };

  // --- Eliminación múltiple de PRODUCTOS ---
  const toggleProductSelected = (id: string) => {
    setSelectedProductIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const deleteSelectedProducts = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    if (selectedProductIds.size === 0) return;
    if (!window.confirm(`¿Eliminar ${selectedProductIds.size} producto(s) seleccionado(s)? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from('products').delete().in('id', Array.from(selectedProductIds));
    if (error) { alert('Error al eliminar: ' + error.message); return; }
    setSelectedProductIds(new Set());
    await reloadProducts();
  };
  const deleteAllProducts = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    if (products.length === 0) return;
    if (!window.confirm(`¿Eliminar TODOS los ${products.length} productos del maestro? Esta acción no se puede deshacer.`)) return;
    if (!window.confirm('Confirmación final: se borrará el maestro de productos completo. ¿Continuar?')) return;
    const { error } = await supabase.from('products').delete().in('id', products.map(p => p.id));
    if (error) { alert('Error al eliminar: ' + error.message); return; }
    setSelectedProductIds(new Set());
    await reloadProducts();
  };

  // Fetch Daily Logs
  useEffect(() => {
    const fetchDailyLogs = async () => {
      const [dy, dm] = selectedMonth.split('-').map(Number);
      const lastDay = new Date(dy, dm, 0).getDate();
      const { data, error } = await supabase
        .from('inventory_logs')
        .select('*')
        .match({ branch_id: selectedBranchId })
        .gte('date', `${selectedMonth}-01`)
        .lte('date', `${selectedMonth}-${String(lastDay).padStart(2, '0')}`);

      if (data) {
        setDailyLogs(data.map(d => {
          let pEnviados = d.prestamos_enviados || 0;
          let pRecibidos = d.prestamos_recibidos || 0;
          if (d.prestamos !== undefined && d.prestamos !== null && d.prestamos !== 0 && !pEnviados && !pRecibidos) {
            if (d.prestamos > 0) {
              pRecibidos = d.prestamos;
            } else {
              pEnviados = Math.abs(d.prestamos);
            }
          }
          return {
            ...d,
            itemId: d.item_id,
            ei: d.ei,
            purchases: d.compras,
            waste: d.decomisos,
            theoretical_sales: d.ventas_teorico,
            staff_consumption: d.consumo_personal,
            loansReceived: pRecibidos,
            loansSent: pEnviados,
            produccion: d.produccion || 0,
            recupero: d.recupero || 0,
            ventasPersonal: d.ventas_personal || 0
          };
        }));
      }
    };
    if (selectedBranchId && selectedMonth) {
      fetchDailyLogs();
    }
  }, [selectedBranchId, selectedMonth]);

  // Autocompletar decomisos (descompuestos por receta) y ventas teóricas (ranking por receta) en la planilla
  useEffect(() => {
    const autoFillDeviations = async () => {
      if (!selectedBranchId || !selectedMonth || isReadOnly) return;
      try {
        const [dy, dm] = selectedMonth.split('-').map(Number);
        const lastDay = new Date(dy, dm, 0).getDate();
        const startDate = `${selectedMonth}-01`;
        const endDate = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
        const norm = (s: string) => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');

        // Recetas: product_id -> insumos
        const { data: recipesData } = await supabase.from('recipes').select('product_id, item_id, quantity');
        const recipeByProd: Record<string, Array<{ itemId: string; quantity: number }>> = {};
        (recipesData || []).forEach((r: any) => {
          if (!r.product_id || !r.item_id) return;
          if (!recipeByProd[r.product_id]) recipeByProd[r.product_id] = [];
          recipeByProd[r.product_id].push({ itemId: r.item_id, quantity: Number(r.quantity || 0) });
        });
        const { data: productsData } = await supabase.from('products').select('id, name, code');
        const normCode = (c: any) => String(c ?? '').trim();
        const prodIdByName: Record<string, string> = {};
        const prodIdByCode: Record<string, string> = {};
        (productsData || []).forEach((p: any) => {
          if (p.name) prodIdByName[norm(p.name)] = p.id;
          if (normCode(p.code) !== '') prodIdByCode[normCode(p.code)] = p.id;
        });
        // Alias de ventas: nombres del ranking (POS) que no coinciden con el maestro
        try {
          const { data: aliasData } = await supabase.from('product_ranking_aliases').select('alias_name, product_id, ignore');
          (aliasData || []).forEach((a: any) => { if (a.alias_name && !a.ignore && a.product_id) prodIdByName[norm(a.alias_name)] = a.product_id; });
        } catch (e) { /* tabla de alias opcional */ }

        const upserts: any[] = [];

        // ===== DECOMISOS del mes (insumo directo + producto vía receta) =====
        const { data: wastage } = await supabase
          .from('daily_wastage')
          .select('date, reference_id, quantity, type')
          .eq('branch_id', selectedBranchId)
          .gte('date', startDate).lte('date', endDate);
        const decByDateItem: Record<string, Record<string, number>> = {};
        (wastage || []).forEach((w: any) => {
          if (!w.reference_id || !w.date) return;
          if (!decByDateItem[w.date]) decByDateItem[w.date] = {};
          const qty = Number(w.quantity || 0);
          if (w.type === 'producto') {
            const recipe = recipeByProd[w.reference_id];
            if (recipe) recipe.forEach(ing => { decByDateItem[w.date][ing.itemId] = (decByDateItem[w.date][ing.itemId] || 0) + qty * ing.quantity; });
          } else {
            decByDateItem[w.date][w.reference_id] = (decByDateItem[w.date][w.reference_id] || 0) + qty;
          }
        });

        // ===== VENTAS TEÓRICAS por semana (ranking por receta), asignadas al primer día de cada semana =====
        const { data: ranking } = await supabase
          .from('product_rankings')
          .select('product_code, product_name, quantity, week_number, month')
          .eq('branch_id', selectedBranchId)
          .eq('month', selectedMonth);
        const weekFirstDay: Record<number, string> = { 1: `${selectedMonth}-01`, 2: `${selectedMonth}-08`, 3: `${selectedMonth}-15`, 4: `${selectedMonth}-22` };
        const vtByDateItem: Record<string, Record<string, number>> = {};
        (ranking || []).forEach((rk: any) => {
          // Resolver por CÓDIGO primero (dato confiable), luego por nombre/alias
          const prodId = (normCode(rk.product_code) !== '' && prodIdByCode[normCode(rk.product_code)]) || prodIdByName[norm(rk.product_name)];
          if (!prodId) return;
          const recipe = recipeByProd[prodId];
          if (!recipe) return;
          const wk = Number(rk.week_number) || 1;
          const day = weekFirstDay[wk] || weekFirstDay[1];
          if (!vtByDateItem[day]) vtByDateItem[day] = {};
          const sold = Number(rk.quantity || 0);
          recipe.forEach(ing => { vtByDateItem[day][ing.itemId] = (vtByDateItem[day][ing.itemId] || 0) + sold * ing.quantity; });
        });

        // Aplicar a estado y preparar upserts solo si cambia el valor
        setDailyLogs(prev => {
          const byKey: Record<string, any> = {};
          prev.forEach(l => { byKey[`${l.date}-${l.item_id}`] = { ...l }; });

          const applyVal = (date: string, itemId: string, field: 'waste' | 'theoretical_sales', col: string, val: number) => {
            const rounded = Math.round(val * 1000) / 1000;
            const key = `${date}-${itemId}`;
            const existing = byKey[key];
            if (existing) {
              if ((existing[field] || 0) !== rounded) {
                existing[field] = rounded;
                upserts.push(supabase.from('inventory_logs').upsert({ branch_id: selectedBranchId, item_id: itemId, date, [col]: rounded }, { onConflict: 'branch_id,item_id,date' }));
              }
            } else {
              byKey[key] = { date, item_id: itemId, itemId, ei: 0, purchases: 0, waste: field === 'waste' ? rounded : 0, theoretical_sales: field === 'theoretical_sales' ? rounded : 0, staff_consumption: 0, loansReceived: 0, loansSent: 0 };
              upserts.push(supabase.from('inventory_logs').upsert({ branch_id: selectedBranchId, item_id: itemId, date, [col]: rounded }, { onConflict: 'branch_id,item_id,date' }));
            }
          };

          Object.keys(decByDateItem).forEach(date => Object.keys(decByDateItem[date]).forEach(itemId => applyVal(date, itemId, 'waste', 'decomisos', decByDateItem[date][itemId])));
          Object.keys(vtByDateItem).forEach(date => Object.keys(vtByDateItem[date]).forEach(itemId => applyVal(date, itemId, 'theoretical_sales', 'ventas_teorico', vtByDateItem[date][itemId])));

          return Object.values(byKey);
        });

        if (upserts.length > 0) Promise.all(upserts).catch(e => console.warn('Auto-fill planilla desvíos error:', e));
      } catch (e) { console.warn('Error autocompletando planilla de desvíos:', e); }
    };
    autoFillDeviations();
  }, [selectedBranchId, selectedMonth, isReadOnly]);

  // Campo de la planilla -> columna de la tabla inventory_logs
  const DAILY_COLUMN_MAP: Record<string, string> = {
    purchases: 'compras',
    waste: 'decomisos',
    theoretical_sales: 'ventas_teorico',
    ei: 'ei',
    ef: 'ef',
    loansReceived: 'prestamos_recibidos',
    loansSent: 'prestamos_enviados',
    staff_consumption: 'consumo_personal',
    // Campos exclusivos del Almacén / Centro de Producción
    produccion: 'produccion',
    recupero: 'recupero',
    ventasPersonal: 'ventas_personal'
  };

  // Escritura a la base DEBOUNCED: se juntan las teclas de una misma celda y recién
  // 500ms después de dejar de tipear se manda un único upsert. Así el input no espera
  // a la red en cada tecla (era la causa de la lentitud al escribir).
  const writeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [saveWarning, setSaveWarning] = useState<string | null>(null);

  const flushDailyWrite = (date: string, itemId: string, dbField: string, value: number) => {
    const key = `${date}|${itemId}|${dbField}`;
    if (writeTimers.current[key]) clearTimeout(writeTimers.current[key]);
    writeTimers.current[key] = setTimeout(async () => {
      const { error } = await supabase
        .from('inventory_logs')
        .upsert({ branch_id: selectedBranchId, item_id: itemId, date, [dbField]: value }, { onConflict: 'branch_id,item_id,date' });
      if (error) {
        console.warn('inventory_logs upsert error:', error);
        // 23503 = violación de clave foránea (item_id no existe en stock_items):
        // pasa con artículos del Maestro Recetas Producción hasta correr la migración.
        if ((error as any).code === '23503') {
          setSaveWarning('Este artículo es del Maestro Recetas Producción. Para que se guarde hay que correr la migración de base de datos (inventory_logs_item_fk.sql).');
        }
      }
    }, 500);
  };

  // Actualiza el estado local al instante (sin esperar la red) para que el número
  // aparezca apenas se tipea y las columnas calculadas se refresquen en vivo.
  const applyLocalDailyLog = (date: string, itemId: string, field: string, value: number) => {
    const dbField = DAILY_COLUMN_MAP[field];
    setDailyLogs(prev => {
      const idx = prev.findIndex(l => l.date === date && (l.item_id === itemId || l.itemId === itemId));
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], [field]: value, ...(dbField ? { [dbField]: value } : {}) };
        return copy;
      }
      return [...prev, { branch_id: selectedBranchId, item_id: itemId, itemId, date, [field]: value, ...(dbField ? { [dbField]: value } : {}) }];
    });
  };

  const updateDailyLog = (date: string, itemId: string, field: string, value: number) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    const dbField = DAILY_COLUMN_MAP[field];
    if (!dbField) return;
    applyLocalDailyLog(date, itemId, field, value);   // instantáneo
    flushDailyWrite(date, itemId, dbField, value);     // debounced
  };

  // Edita un valor AGREGADO semanal (préstamos, consumo): concentra el valor en el
  // primer día de la semana y pone 0 en los demás, para que el total semanal sea el valor editado.
  const updateWeeklyAggregate = (weekDates: string[], itemId: string, field: string, value: number) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!weekDates.length) return;
    const dbField = DAILY_COLUMN_MAP[field];
    if (!dbField) return;
    // Primer día: el valor; resto: 0
    applyLocalDailyLog(weekDates[0], itemId, field, value);
    flushDailyWrite(weekDates[0], itemId, dbField, value);
    for (let i = 1; i < weekDates.length; i++) {
      const dayLog = dailyLogs.find(l => (l.itemId === itemId || l.item_id === itemId) && l.date === weekDates[i]);
      const current = field === 'loansReceived' ? (dayLog?.loansReceived || 0)
                    : field === 'loansSent' ? (dayLog?.loansSent || 0)
                    : (dayLog?.staff_consumption || 0);
      if (current !== 0) {
        applyLocalDailyLog(weekDates[i], itemId, field, 0);
        flushDailyWrite(weekDates[i], itemId, dbField, 0);
      }
    }
  };

  // Carga los cierres administrativos de la sucursal/mes seleccionados
  useEffect(() => {
    (async () => {
      if (!selectedBranchId) { setAdminClosures({}); return; }
      try {
        const { data } = await supabase.from('deviation_week_closures')
          .select('*').eq('branch_id', selectedBranchId).eq('month', selectedMonth);
        const map: Record<string, boolean> = {};
        (data || []).forEach((c: any) => { map[`${c.branch_id}-${c.month}-${c.week_number}`] = true; });
        setAdminClosures(map);
      } catch (e) { console.warn('Error cargando cierres admin:', e); }
    })();
  }, [selectedBranchId, selectedMonth]);

  const isWeekClosedAdmin = (weekNum: number) => !!adminClosures[`${selectedBranchId}-${selectedMonth}-${weekNum}`];

  const closeWeekAdmin = async (weekNum: number) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    if (!selectedBranchId || selectedBranchId === 'all') { alert('Seleccioná una sucursal concreta para cerrar la semana.'); return; }
    if (!window.confirm(`¿Cerrar la SEMANA ${weekNum} de ${selectedMonth} para esta sucursal?\n\nLos campos quedarán bloqueados y los desvíos impactarán en el dashboard del encargado.\nSolo un administrador podrá reabrirla.`)) return;
    try {
      const { error } = await supabase.from('deviation_week_closures').upsert({
        id: `${selectedBranchId}-${selectedMonth}-${weekNum}`,
        branch_id: selectedBranchId, month: selectedMonth, week_number: weekNum,
        closed_by: currentUserRole || 'admin', closed_at: new Date().toISOString(),
      }, { onConflict: 'branch_id,month,week_number' });
      if (error) throw error;
      setAdminClosures(prev => ({ ...prev, [`${selectedBranchId}-${selectedMonth}-${weekNum}`]: true }));
    } catch (e: any) { alert('Error al cerrar la semana: ' + (e.message || e)); }
  };

  const reopenWeekAdmin = async (weekNum: number) => {
    if (!isAdmin) { alert('Solo un administrador puede reabrir una semana cerrada.'); return; }
    if (!window.confirm(`¿Reabrir la SEMANA ${weekNum} de ${selectedMonth}? Volverá a quedar editable.`)) return;
    try {
      const { error } = await supabase.from('deviation_week_closures').delete()
        .eq('branch_id', selectedBranchId).eq('month', selectedMonth).eq('week_number', weekNum);
      if (error) throw error;
      setAdminClosures(prev => { const n = { ...prev }; delete n[`${selectedBranchId}-${selectedMonth}-${weekNum}`]; return n; });
    } catch (e: any) { alert('Error al reabrir: ' + (e.message || e)); }
  };

  const getWeeks = () => {
    const year = parseInt(selectedMonth.split('-')[0]);
    const month = parseInt(selectedMonth.split('-')[1]);
    const lastDay = new Date(year, month, 0).getDate();
    return [
      { id: 1, label: 'Semana 1', range: '(01-07)', date: `${selectedMonth}-01` },
      { id: 2, label: 'Semana 2', range: '(08-14)', date: `${selectedMonth}-08` },
      { id: 3, label: 'Semana 3', range: '(15-21)', date: `${selectedMonth}-15` },
      { id: 4, label: 'Semana 4', range: '(22-Fin)', date: `${selectedMonth}-22` },
    ];
  };

  const getDatesForWeek = (weekId: number) => {
    const year = parseInt(selectedMonth.split('-')[0]);
    const month = parseInt(selectedMonth.split('-')[1]);
    const lastDay = new Date(year, month, 0).getDate();
    
    let start = 1, end = 7;
    if (weekId === 2) { start = 8; end = 14; }
    else if (weekId === 3) { start = 15; end = 21; }
    else if (weekId === 4) { start = 22; end = lastDay; }

    const dates: string[] = [];
    for (let i = start; i <= end; i++) {
      dates.push(`${selectedMonth}-${String(i).padStart(2, '0')}`);
    }
    return dates;
  };

  // New CRUD state
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [itemMasterSearch, setItemMasterSearch] = useState('');
  const [productMasterSearch, setProductMasterSearch] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [itemForm, setItemForm] = useState({ name: '', unit: '', cost: 0, category: '', code: '' });
  const [productForm, setProductForm] = useState({ name: '', category: '', code: '', cost: '' });

  const downloadTemplate = (type: 'items' | 'products' | 'recipes') => {
    let data = [];
    let filename = '';

    if (type === 'items') {
      data = [{ 'Codigo': 'INS-001', 'Nombre': 'EJEMPLO INSUMO', 'Unidad': 'KG', 'Categoria': 'CARNES', 'Costo': 100 }];
      filename = 'modelo_insumos.xlsx';
    } else if (type === 'products') {
      data = [{ 'Codigo Producto': 'PROD-001', 'Nombre': 'EJEMPLO PRODUCTO', 'Categoria': 'HAMBURGUESAS', 'Costo': 0 }];
      filename = 'modelo_productos.xlsx';
    } else if (type === 'recipes') {
      data = [{ 
        'Nombre del Producto': 'CLASSIC BURGER', 
        'Nombre del insumo': 'CARNE', 
        'Unidad de medida del insumo': 'KG', 
        'Consumo por producto': 0.150 
      }];
      filename = 'modelo_recetas.xlsx';
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");
    XLSX.writeFile(wb, filename);
  };

  // Exportar a Excel los registros actuales del maestro.
  const exportItems = () => {
    const data = (items as any[]).map(i => ({
      Codigo: i.code || '', Nombre: i.name, Unidad: i.unit || '', Categoria: i.category || '',
      Costo: i.cost ?? '', Estado: i.is_active === false ? 'INHABILITADO' : 'ACTIVO',
    }));
    const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ Nombre: '' }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Insumos');
    XLSX.writeFile(wb, 'export_insumos.xlsx');
  };
  const exportProductsXlsx = () => {
    const data = (products as any[]).map(p => ({
      'Codigo Producto': p.code || '', Nombre: p.name, Categoria: p.category || '',
      Costo: p.cost ?? '', Estado: p.is_active === false ? 'INHABILITADO' : 'ACTIVO',
    }));
    const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ Nombre: '' }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Productos');
    XLSX.writeFile(wb, 'export_productos.xlsx');
  };

  // Devuelve el valor CRUDO de una columna (puede ser number o string), probando varios nombres
  const pickRaw = (row: any, ...candidates: string[]): any => {
    const norm = (s: string) => String(s).trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const keys = Object.keys(row);
    for (const cand of candidates) {
      const target = norm(cand);
      const hit = keys.find(k => norm(k) === target);
      if (hit !== undefined && row[hit] !== undefined && row[hit] !== null && String(row[hit]).trim() !== '') {
        return row[hit];
      }
    }
    return undefined;
  };

  // Convierte a número respetando el formato: si ya es number, se usa tal cual.
  // Si es texto, interpreta formato argentino ("1.931,40") o inglés ("1931.40").
  const parseCost = (raw: any): number => {
    if (raw === undefined || raw === null || raw === '') return 0;
    if (typeof raw === 'number') return raw; // Excel ya lo entregó como número: NO tocar
    let s = String(raw).trim().replace(/\$/g, '').replace(/\s/g, '');
    const tieneComa = s.includes(',');
    const tienePunto = s.includes('.');
    if (tieneComa && tienePunto) {
      // "1.931,40" -> el último separador es el decimal
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (tieneComa) {
      s = s.replace(',', '.'); // "1931,40"
    }
    // Si solo tiene punto, se asume decimal ("1931.40") y se deja como está
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };

  // Busca el valor de una columna probando varios nombres posibles (tolerante a mayúsculas/espacios/acentos)
  const pickCol = (row: any, ...candidates: string[]): string => {
    const v = pickRaw(row, ...candidates);
    return v === undefined ? '' : String(v).trim();
  };

  const handleImportItems = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        if (data.length === 0) {
          alert('El archivo está vacío o no tiene filas de datos.\n\nRevisá que la primera fila sean los títulos de las columnas (Nombre, Unidad, Categoria, Codigo, Costo).');
          setLoading(false);
          return;
        }

        const columnasDetectadas = Object.keys(data[0] || {}).join(', ');
        const descartadas: string[] = [];
        const newItems = data.map((row: any, idx: number) => {
          const name = pickCol(row, 'Nombre', 'name', 'insumo', 'descripcion', 'descripción', 'detalle').toUpperCase();
          const unit = pickCol(row, 'Unidad', 'unit', 'u.m.', 'um', 'medida').toLowerCase();
          const category = pickCol(row, 'Categoria', 'Categoría', 'category', 'rubro').toUpperCase();
          const code = pickCol(row, 'Codigo', 'Código', 'code', 'cod').toUpperCase();
          const cost = parseCost(pickRaw(row, 'Costo', 'cost', 'precio', 'costo unitario'));
          if (!name || !unit) descartadas.push(`Fila ${idx + 2}${name ? ` (${name})` : ''}: falta ${!name ? 'NOMBRE' : ''}${!name && !unit ? ' y ' : ''}${!unit ? 'UNIDAD' : ''}`);
          return { name, unit, category: category || null, code: code || null, cost };
        }).filter(i => i.name && i.unit);

        // Nada válido para importar: explicar POR QUÉ
        if (newItems.length === 0) {
          alert(
            `No se pudo importar ningún insumo.\n\n` +
            `Filas leídas: ${data.length}\n` +
            `Columnas encontradas en el archivo: ${columnasDetectadas || '(ninguna)'}\n\n` +
            `El archivo debe tener al menos las columnas NOMBRE y UNIDAD.\n` +
            `Descargá la "Planilla Modelo" para ver el formato correcto.`
          );
          setLoading(false);
          return;
        }

        // Confirmación antes de cargar
        // Separar en NUEVOS y EXISTENTES (matcheando por código, o por nombre si no tiene código)
        const norm = (s: any) => String(s || '').trim().toUpperCase();
        const porCodigo = new Map<string, any>();
        const porNombre = new Map<string, any>();
        (items as any[]).forEach(it => {
          if (it.code) porCodigo.set(norm(it.code), it);
          porNombre.set(norm(it.name), it);
        });

        const aCrear: any[] = [];
        const aActualizar: Array<{ id: string; data: any }> = [];
        newItems.forEach(ni => {
          const existente = (ni.code && porCodigo.get(norm(ni.code))) || porNombre.get(norm(ni.name));
          if (existente) {
            aActualizar.push({ id: existente.id, data: ni });
          } else {
            aCrear.push(ni);
          }
        });

        const resumen =
          `Se van a procesar ${newItems.length} insumos:\n\n` +
          `  • ${aCrear.length} NUEVOS (se crean)\n` +
          `  • ${aActualizar.length} EXISTENTES (se actualizan sus datos)\n\n` +
          `Filas leídas del archivo: ${data.length}\n` +
          (descartadas.length > 0 ? `Filas descartadas (sin nombre o unidad): ${descartadas.length}\n` : '') +
          `\nLos insumos existentes se ACTUALIZAN (no se duplican), así las recetas y el historial se mantienen.\n` +
          `\nEjemplos:\n` +
          newItems.slice(0, 3).map(i => `• ${i.name} (${i.unit})${i.cost ? ` - $${i.cost.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}`).join('\n') +
          (newItems.length > 3 ? `\n… y ${newItems.length - 3} más` : '') +
          `\n\n¿Confirmás la importación?`;

        if (!window.confirm(resumen)) {
          setLoading(false);
          return;
        }

        // Crear los nuevos
        if (aCrear.length > 0) {
          const { error } = await supabase.from('stock_items').insert(aCrear);
          if (error) throw error;
        }
        // Actualizar los existentes (mantiene el ID → no rompe recetas)
        let fallosUpdate = 0;
        for (const upd of aActualizar) {
          const { error } = await supabase.from('stock_items').update(upd.data).eq('id', upd.id);
          if (error) fallosUpdate++;
        }

        await reloadItems();
        alert(
          `✓ Importación completada.\n\n` +
          `  • ${aCrear.length} insumos creados\n` +
          `  • ${aActualizar.length - fallosUpdate} insumos actualizados\n` +
          (fallosUpdate > 0 ? `  • ${fallosUpdate} no se pudieron actualizar\n` : '') +
          (descartadas.length > 0 ? `\nSe descartaron ${descartadas.length} filas:\n${descartadas.slice(0, 5).join('\n')}${descartadas.length > 5 ? `\n… y ${descartadas.length - 5} más` : ''}` : '')
        );
      } catch (err: any) {
        alert('Error al importar insumos:\n\n' + (err.message || JSON.stringify(err)));
      } finally {
        setLoading(false);
        e.target.value = ''; // permitir reimportar el mismo archivo
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleImportProducts = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        const costParse = (v: any) => { const s = String(v ?? '').trim().replace(',', '.'); return s === '' ? null : (isNaN(Number(s)) ? null : Number(s)); };

        // Importación IDEMPOTENTE: si el producto ya existe (por nombre), se ACTUALIZA
        // (categoría, código, costo) en vez de crear un duplicado. Solo se insertan los nuevos.
        const { data: existing } = await supabase.from('products').select('id, name');
        const byName = new Map<string, string>();
        (existing || []).forEach((p: any) => byName.set(String(p.name || '').trim().toUpperCase(), p.id));

        const seen = new Set<string>();
        const toInsert: any[] = [];
        const toUpdate: { id: string; category: string; code: string | null; cost: number | null }[] = [];
        data.forEach((row: any) => {
          const name = String(row.Nombre || row.name || '').toUpperCase().trim();
          if (!name || seen.has(name)) return;
          seen.add(name);
          const category = String(row.Categoria || row.category || 'SIN CATEGORIA').toUpperCase().trim();
          // Código del PRODUCTO (acepta el encabezado explícito y los genéricos).
          const codeRaw = row['Codigo Producto'] ?? row['Código Producto'] ?? row['Codigo del Producto'] ?? row['Código del Producto'] ?? row.Codigo ?? row['Código'] ?? row.code;
          const code = (codeRaw === undefined || codeRaw === null) ? null : (String(codeRaw).trim() || null);
          const cost = costParse(row.Costo ?? row.costo ?? row.Precio ?? row.precio ?? row.cost ?? row.price);
          const id = byName.get(name);
          if (id) toUpdate.push({ id, category, code, cost });
          else toInsert.push({ name, category, code, cost });
        });

        if (toInsert.length > 0) {
          const { error } = await supabase.from('products').insert(toInsert);
          if (error) throw error;
        }
        for (let i = 0; i < toUpdate.length; i += 25) {
          await Promise.all(toUpdate.slice(i, i + 25).map(u =>
            supabase.from('products').update({ category: u.category, code: u.code, cost: u.cost }).eq('id', u.id)
          ));
        }
        await reloadProducts();
        alert(`Importación lista: ${toInsert.length} producto(s) nuevo(s), ${toUpdate.length} actualizado(s) (no se duplican).`);
      } catch (err: any) {
        alert('Error al importar productos: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

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

  // Fetch Recipes
  React.useEffect(() => {
    fetchRecipes();
    
    // Default selection
    if (!selectedProductId && products.length > 0) {
      setSelectedProductId(products[0].id);
    }
  }, [products]);

  const handleImportRecipes = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        const recipesMap = new Map<string, any>();
        const productsToClear = new Set<string>();

        data.forEach((row: any) => {
          const prodName = String(row['Nombre del Producto'] || row.Producto || row.product || '').trim().toUpperCase();
          const itemName = String(row['Nombre del insumo'] || row.Insumo || row.item || '').trim().toUpperCase();
          
          let quantityRaw = row['Consumo por producto'] || row.Cantidad || row.quantity || 0;
          let quantity = 0;
          if (typeof quantityRaw === 'number') {
            quantity = quantityRaw;
          } else if (typeof quantityRaw === 'string') {
            quantity = parseFloat(quantityRaw.replace(',', '.'));
          }

          const product = products.find(p => p.name.trim().toUpperCase() === prodName);
          const item = catalogItems.find(i => i.name.trim().toUpperCase() === itemName);

          if (product && item && quantity > 0) {
            const compositeKey = `${product.id}-${item.id}`;
            recipesMap.set(compositeKey, {
              product_id: product.id,
              item_id: item.id,
              quantity
            });
            productsToClear.add(product.id);
          }
        });

        const newRecipes = Array.from(recipesMap.values());

        if (newRecipes.length > 0) {
          // 1. Clear existing recipes for products present in the file to avoid duplicates
          const productIdsArray = Array.from(productsToClear);
          const { error: deleteError } = await supabase
            .from('recipes')
            .delete()
            .in('product_id', productIdsArray);
          
          if (deleteError) throw deleteError;

          // 2. Insert new ones
          const { error } = await supabase.from('recipes').insert(newRecipes);
          if (error) throw error;

          await fetchRecipes();
          alert(`Éxito: Se actualizaron las recetas de ${productsToClear.size} productos (${newRecipes.length} ingredientes en total).`);
        } else {
          alert('No se encontraron coincidencias para importar. Verifique que los nombres de productos e insumos coincidan exactamente con los maestros.');
        }
      } catch (err: any) {
        alert('Error al importar recetas: ' + err.message);
      } finally {
        setLoading(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const [recipes, setRecipes] = useState<Record<string, { productId: string, itemId: string, quantity: number }[]>>({});
  
  const flattenedRecipes = React.useMemo(() => {
    const list: { productId: string, itemId: string, quantity: number }[] = [];
    Object.entries(recipes).forEach(([_, lines]) => {
      (lines as any[]).forEach(line => {
        list.push(line);
      });
    });
    return list;
  }, [recipes]);
  const [recipeDisplayUnits, setRecipeDisplayUnits] = useState<Record<string, string>>({}); // key: productId-itemId

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [recipeSearch, setRecipeSearch] = useState('');

  // Diagnóstico: productos del Ranking de Ventas que NO tienen receta (no harían match)
  const [rankingNames, setRankingNames] = useState<string[]>([]);
  const [diagLoading, setDiagLoading] = useState(false);

  const loadRankingDiagnostic = async () => {
    setDiagLoading(true);
    try {
      // Traer todos los nombres distintos del ranking (paginado)
      const names = new Set<string>();
      let page = 0; const size = 1000; let more = true;
      while (more && page < 30) {
        const { data } = await supabase
          .from('product_rankings')
          .select('product_name')
          .range(page * size, (page + 1) * size - 1);
        if (data && data.length > 0) {
          data.forEach((r: any) => { if (r.product_name) names.add(String(r.product_name)); });
          more = data.length === size;
          page++;
        } else { more = false; }
      }
      setRankingNames(Array.from(names).sort());
    } catch (e) { console.error('Error cargando diagnóstico:', e); }
    setDiagLoading(false);
  };

  useEffect(() => { if (activeTab === 'diagnostico') loadRankingDiagnostic(); }, [activeTab]);

  // Calcular cuáles tienen receta y cuáles no (match por nombre normalizado)
  const normName = (s: string) => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const diagnostic = React.useMemo(() => {
    const productsWithRecipe = new Set(
      Object.keys(recipes).map(prodId => {
        const p = products.find(pr => pr.id === prodId);
        return p ? normName(p.name) : '';
      }).filter(Boolean)
    );
    const conReceta: string[] = [];
    const sinReceta: string[] = [];
    rankingNames.forEach(rn => {
      if (productsWithRecipe.has(normName(rn))) conReceta.push(rn);
      else sinReceta.push(rn);
    });
    return { conReceta, sinReceta, total: rankingNames.length };
  }, [rankingNames, recipes, products]);

  // Fetch Controlled Items for Month/Branch
  useEffect(() => {
    const fetchMonthlyControls = async () => {
      setIsLoadingHistory(true);
      const { data, error } = await supabase
        .from('monthly_controlled_items')
        .select('item_ids')
        .match({ branch_id: selectedBranchId, month: selectedMonth })
        .maybeSingle();

      if (error) {
        console.error('Error fetching monthly controls:', error);
      }
      
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
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!selectedBranchId || selectedBranchId === 'all') {
      alert('Por favor, seleccione una sucursal específica para confirmar el control mensual.');
      return;
    }

    const { error } = await supabase
      .from('monthly_controlled_items')
      .upsert({
        branch_id: selectedBranchId,
        month: selectedMonth,
        item_ids: controlledIds
      }, { onConflict: 'branch_id,month' });

    if (!error) {
      alert(`Control de desvíos para ${selectedMonth} confirmado exitosamente. Ahora puede cargar la planilla semanal.`);
    } else {
      console.error('Error saving monthly control:', error);
      alert(`Error de validación (RLS) en Supabase: ${error.message}. 
      
Para solucionar esto, copie y ejecute el siguiente comando en el SQL Editor de Supabase:
ALTER TABLE monthly_controlled_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access" ON monthly_controlled_items FOR ALL USING (true) WITH CHECK (true);`);
    }
  };

  const saveMonthlyControlForAllBranches = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (controlledIds.length === 0) {
      if (!confirm('⚠️ No has seleccionado ningún insumo. ¿Estás seguro de que deseas vaciar el control mensual para TODAS las sucursales?')) {
        return;
      }
    } else {
      if (!confirm(`⚠️ ¿Estás seguro de que deseas aplicar estos ${controlledIds.length} insumos seleccionados a TODAS las sucursales para el mes ${selectedMonth}?`)) {
        return;
      }
    }

    setLoading(true);
    try {
      const targetBranches = branches.filter(b => b.id !== 'all');
      if (targetBranches.length === 0) {
        alert('No se encontraron sucursales a las cuales aplicar la selección.');
        return;
      }

      const upsertPromises = targetBranches.map(async (branch) => {
        return supabase
          .from('monthly_controlled_items')
          .upsert({
            branch_id: branch.id,
            month: selectedMonth,
            item_ids: controlledIds
          }, { onConflict: 'branch_id,month' });
      });

      const results = await Promise.all(upsertPromises);
      const errors = results.filter(r => r.error);

      if (errors.length === 0) {
        alert(`¡Éxito! Selección de insumos copiada y confirmada para todas las sucursales (${targetBranches.length}) en el mes ${selectedMonth}.`);
      } else {
        console.error('Errors copying controls to all branches:', errors);
        alert(`Se guardó con algunos errores: ${errors[0].error?.message}`);
      }
    } catch (err: any) {
      console.error(err);
      alert('Error al guardar para todas las sucursales: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getSubUnit = (unit: string) => {
    if (unit?.toLowerCase() === 'kg') return 'gr';
    if (unit?.toLowerCase() === 'l') return 'ml';
    return null;
  };

  const getDisplayQuantity = (itemId: string, quantity: number, productId: string) => {
    const item = catalogItems.find(i => i.id === itemId);
    const unit = recipeDisplayUnits[`${productId}-${itemId}`] || item?.unit || '';
    if (unit === 'gr' || unit === 'ml') return quantity * 1000;
    return quantity;
  };

  const addIngredientToRecipe = async (productId: string, itemId: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
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
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    const item = catalogItems.find(i => i.id === itemId);
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
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
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

  const validControlledIds = controlledIds.filter(id => catalogItems.some(item => item.id === id));

  // 3. Comparison State (Aggregated data from dailyLogs)
  const deviations = validControlledIds.map(id => {
    const itemLogs = dailyLogs.filter(l => l.itemId === id);
    
    // EI is the first available EI of the month
    const sortedLogs = [...itemLogs].sort((a, b) => a.date.localeCompare(b.date));
    const ei = sortedLogs[0]?.ei || 0;
    const ef = sortedLogs[sortedLogs.length - 1]?.ef || 0;
    
    const totals = itemLogs.reduce((acc, log) => ({
      purchases: acc.purchases + (log.purchases || 0),
      loansReceived: acc.loansReceived + (log.loansReceived || 0),
      loansSent: acc.loansSent + (log.loansSent || 0),
      waste: acc.waste + (log.waste || 0),
      staff_consumption: acc.staff_consumption + (log.staff_consumption || 0),
      theoretical_sales: acc.theoretical_sales + (log.theoretical_sales || 0)
    }), { purchases: 0, loansReceived: 0, loansSent: 0, waste: 0, staff_consumption: 0, theoretical_sales: 0 });

    const realConsumption = ei + totals.purchases + totals.loansReceived - totals.loansSent - totals.waste - totals.staff_consumption - ef;
    
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
            <h2 className="text-xl font-black text-text-main uppercase tracking-tight">{forcedTab === 'gestion' ? 'Maestros' : forcedTab === 'recetas' ? 'Recetas' : 'Control de Desvíos'}</h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest italic opacity-70">{forcedTab === 'gestion' ? 'Maestro de Insumos y Productos' : forcedTab === 'recetas' ? 'Recetas de Productos' : 'Consola de Control de Administración'}</p>
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
        
        {!forcedTab && (
        <div className="flex bg-bg-sidebar p-1 rounded border border-border-dim shadow-sm self-start md:self-center">
          <TabButton active={activeTab === 'comparativo'} onClick={() => setActiveTab('comparativo')} icon={<BarChart3 size={14} />} label="Resultados" />
          <TabButton active={activeTab === 'planilla'} onClick={() => setActiveTab('planilla')} icon={<Table2 size={14} />} label="Planilla Semanal" />
          <TabButton active={activeTab === 'selector'} onClick={() => setActiveTab('selector')} icon={<Settings2 size={14} />} label="Selector de Insumos" />
          <TabButton active={activeTab === 'diagnostico'} onClick={() => setActiveTab('diagnostico')} icon={<AlertTriangle size={14} />} label="Diagnóstico Ventas" />
        </div>
        )}
      </div>

      {onBranchChange && (
        <div className="flex flex-wrap items-center gap-2 bg-bg-sidebar/50 p-4 rounded border border-border-dim/60">
          <span className="text-[9px] font-black uppercase text-text-dim tracking-widest mr-2">Filtrar Sucursal:</span>
          <button
            onClick={() => onBranchChange('all')}
            className={cn(
              "px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer",
              selectedBranchId === 'all'
                ? "bg-brand-500 text-black border-brand-500 font-extrabold shadow-md"
                : "bg-bg-accent text-text-dim border-border-dim hover:text-text-main hover:bg-bg-accent/80"
            )}
          >
            Consolidado (Todas)
          </button>
          {branches.map(b => (
            <button
              key={b.id}
              onClick={() => onBranchChange(b.id)}
              className={cn(
                "px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer",
                selectedBranchId === b.id
                  ? "bg-brand-500 text-black border-brand-500 font-extrabold shadow-md"
                  : "bg-bg-accent text-text-dim border-border-dim hover:text-text-main hover:bg-bg-accent/80"
              )}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

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
                    const item = catalogItems.find(i => i.id === dev.itemId);
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
             {/* Selector de semana (una a la vez, como el encargado) */}
             <div className="bg-bg-sidebar border border-border-dim rounded-lg p-3 flex flex-wrap items-center gap-2">
               <span className="text-[9px] font-black uppercase text-text-dim tracking-widest mr-1">Semana a controlar:</span>
               {[1, 2, 3, 4].map(w => {
                 const rangos: Record<number, string> = { 1: '1-7', 2: '8-14', 3: '15-21', 4: '22-fin' };
                 const cerrada = isWeekClosedAdmin(w);
                 return (
                   <button key={w} onClick={() => setPlanillaWeek(w)}
                     className={cn("px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5",
                       planillaWeek === w ? "bg-brand-500 text-white" : "bg-bg-accent text-text-dim hover:text-text-main")}>
                     Semana {w} <span className="opacity-60 text-[8px]">({rangos[w]})</span>
                     {cerrada && <span className="w-1.5 h-1.5 rounded-full bg-red-500" title="Cerrada"></span>}
                   </button>
                 );
               })}
             </div>

             {saveWarning && (
               <div className="mb-3 flex items-start gap-2 bg-amber-500/10 border border-amber-500/40 rounded-lg px-4 py-2.5">
                 <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
                 <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 leading-snug">{saveWarning}</span>
                 <button onClick={() => setSaveWarning(null)} className="ml-auto text-amber-600 hover:text-amber-800 shrink-0"><X size={13} /></button>
               </div>
             )}

             <div className="bg-bg-sidebar border border-border-dim rounded-lg overflow-hidden shadow-2xl">
               <div className="p-4 bg-bg-accent border-b border-border-dim flex justify-between items-center flex-wrap gap-3">
                  <div>
                    <h3 className="text-xs font-black uppercase text-brand-500 tracking-widest italic">Planilla Administrativa · Semana {planillaWeek} · {selectedMonth}</h3>
                    <p className="text-[9px] text-text-dim font-bold uppercase mt-1">Misma vista que el encargado · podés editar todos los campos</p>
                  </div>
                  <div className="flex gap-3 items-center">
                    {isWeekClosedAdmin(planillaWeek) ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black uppercase text-red-500 bg-red-500/10 border border-red-500/30 rounded px-3 py-1.5">Semana Cerrada</span>
                        {isAdmin && (
                          <button onClick={() => reopenWeekAdmin(planillaWeek)} className="text-[9px] font-black uppercase text-text-dim hover:text-amber-500 underline">Reabrir</button>
                        )}
                      </div>
                    ) : (
                      !isReadOnly && (
                        <button onClick={() => closeWeekAdmin(planillaWeek)}
                          className="text-[9px] font-black uppercase bg-brand-500 text-white rounded px-3 py-1.5 hover:bg-brand-600 transition-all">Cerrar semana</button>
                      )
                    )}
                  </div>
               </div>

               {/* Diferencias entre lo que cargó el ENCARGADO (Control de Stock) y lo que dejó
                   ADMINISTRACIÓN (valor que manda para los cálculos). */}
               {(() => {
                 const encFields: [string, string][] = [['ei', 'EI'], ['compras', 'Compras'], ['prestamos_recibidos', 'P. Recib.'], ['prestamos_enviados', 'P. Enviad.'], ['consumo_personal', 'Consumo Pers.'], ['ef', 'EF']];
                 const weekDates = getDatesForWeek(planillaWeek);
                 const diffs: Array<{ insumo: string; label: string; enc: number; admin: number; diff: number }> = [];
                 validControlledIds.forEach(id => {
                   const item = catalogItems.find(i => i.id === id);
                   const fdl = dailyLogs.find(l => l.itemId === id && l.date === weekDates[0]);
                   if (!fdl) return;
                   encFields.forEach(([col, label]) => {
                     const enc = fdl[`${col}_enc`];
                     if (enc === null || enc === undefined) return; // el encargado no cargó ese campo
                     const admin = fdl[col];
                     const diff = (Number(admin) || 0) - (Number(enc) || 0);
                     if (Math.abs(diff) > 0.001) diffs.push({ insumo: item?.name || '', label, enc: Number(enc) || 0, admin: Number(admin) || 0, diff });
                   });
                 });
                 if (diffs.length === 0) return null;
                 const fmt = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 3 });
                 return (
                   <div className="mb-3 bg-amber-500/10 border border-amber-500/40 rounded-lg overflow-hidden">
                     <div className="px-4 py-2 flex items-center gap-2 border-b border-amber-500/30">
                       <AlertTriangle size={14} className="text-amber-600" />
                       <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">{diffs.length} corrección(es) de Administración vs. carga del encargado</span>
                       <span className="text-[8px] font-bold text-amber-600/70 normal-case tracking-normal hidden sm:inline">· para los cálculos vale el valor de Admin</span>
                     </div>
                     <div className="max-h-40 overflow-y-auto divide-y divide-amber-500/20">
                       {diffs.map((d, i) => (
                         <div key={i} className="px-4 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[10px]">
                           <span className="font-black uppercase text-text-main min-w-[140px]">{d.insumo}</span>
                           <span className="font-bold uppercase text-text-dim w-20">{d.label}</span>
                           <span className="font-mono text-text-dim">Encargado: <span className="font-black text-text-main">{fmt(d.enc)}</span></span>
                           <span className="font-mono text-text-dim">Admin: <span className="font-black text-text-main">{fmt(d.admin)}</span></span>
                           <span className={cn("font-mono font-black", d.diff > 0 ? "text-emerald-600" : "text-red-500")}>Dif: {d.diff > 0 ? '+' : ''}{fmt(d.diff)}</span>
                         </div>
                       ))}
                     </div>
                   </div>
                 );
               })()}

               <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
                 <table className="w-full border-collapse">
                   <thead className="sticky top-0 z-20 bg-bg-sidebar">
                     <tr className="bg-bg-sidebar border-b border-border-dim text-[9px] font-black uppercase text-text-dim">
                       <th className="px-4 py-3 text-left sticky left-0 bg-bg-sidebar z-30 border-r border-border-dim min-w-[200px]">Insumo</th>
                       <th className="px-3 py-3 text-center bg-bg-accent/20">EI</th>
                       <th className="px-3 py-3 text-center bg-brand-500/5 text-brand-500">Compras</th>
                       {isAlmacen && <th className="px-3 py-3 text-center bg-emerald-500/5">Producción (IG O)</th>}
                       <th className="px-3 py-3 text-center bg-bg-accent/20">{isAlmacen ? 'Devolución Sucursales' : 'P. Recib.'}</th>
                       <th className="px-3 py-3 text-center bg-bg-accent/20">{isAlmacen ? 'Envíos a Sucursal (EG)' : 'P. Enviad.'}</th>
                       <th className="px-3 py-3 text-center bg-bg-accent/20">{isAlmacen ? 'Consumo (EG 9)' : 'Consumo Pers.'}</th>
                       {isAlmacen && <th className="px-3 py-3 text-center bg-red-500/5">Recupero EGR</th>}
                       {isAlmacen && <th className="px-3 py-3 text-center bg-red-500/5">Ventas Pers. (EG C)</th>}
                       {!isAlmacen && <th className="px-3 py-3 text-center bg-purple-500/5">Ventas Teo.</th>}
                       <th className="px-3 py-3 text-center bg-red-500/5">{isAlmacen ? 'Decomisos (EG 8)' : 'Decomisos'}</th>
                       <th className="px-3 py-3 text-center bg-bg-accent/20">EF Real</th>
                       <th className="px-3 py-3 text-center bg-teal-500/5 text-teal-600">EF Teó.</th>
                       {!isAlmacen && <th className="px-3 py-3 text-center bg-brand-500/5 text-brand-500">CMV Real</th>}
                       <th className="px-3 py-3 text-center bg-amber-500/5 text-amber-600 border-l border-border-dim">
                         Desvío
                         <span className="block text-[7px] font-bold text-text-dim/70 normal-case tracking-normal">EF Real − EF Teórica</span>
                       </th>
                       <th className="px-3 py-3 text-center bg-amber-500/5 text-amber-600">
                         Desvío %
                         <span className="block text-[7px] font-bold text-text-dim/70 normal-case tracking-normal">(EF Real − EF Teórica) / EF Teórica × 100</span>
                       </th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-border-dim">
                     {validControlledIds.map(id => {
                       const item = catalogItems.find(i => i.id === id);
                       const weekDates = getDatesForWeek(planillaWeek);
                       const weekClosed = isWeekClosedAdmin(planillaWeek);
                       const dateStr = weekDates[0];
                       const itemWeekLogs = dailyLogs.filter(l => l.itemId === id && weekDates.includes(l.date));
                       const sortedWeekLogs = [...itemWeekLogs].sort((a, b) => a.date.localeCompare(b.date));
                       const firstDayLog = itemWeekLogs.find(l => l.date === weekDates[0]);
                       const ei = firstDayLog ? (firstDayLog.ei || 0) : (sortedWeekLogs[0]?.ei || 0);
                       const lastDayLog = itemWeekLogs.find(l => l.date === weekDates[weekDates.length - 1]);
                       const ef = (firstDayLog && firstDayLog.ef) ? firstDayLog.ef
                                : (lastDayLog && lastDayLog.ef ? lastDayLog.ef : (sortedWeekLogs[sortedWeekLogs.length - 1]?.ef || 0));
                       const purchases = itemWeekLogs.reduce((sum, l) => sum + (l.purchases || 0), 0);
                       const waste = itemWeekLogs.reduce((sum, l) => sum + (l.waste || 0), 0);
                       const theoretical_sales = itemWeekLogs.reduce((sum, l) => sum + (l.theoretical_sales || 0), 0);
                       const loansReceived = itemWeekLogs.reduce((sum, l) => sum + (l.loansReceived || 0), 0);
                       const loansSent = itemWeekLogs.reduce((sum, l) => sum + (l.loansSent || 0), 0);
                       const staff_consumption = itemWeekLogs.reduce((sum, l) => sum + (l.staff_consumption || 0), 0);
                       const produccion = itemWeekLogs.reduce((sum, l) => sum + (l.produccion || 0), 0);
                       const recupero = itemWeekLogs.reduce((sum, l) => sum + (l.recupero || 0), 0);
                       const ventasPersonal = itemWeekLogs.reduce((sum, l) => sum + (l.ventasPersonal || 0), 0);
                       const inputCls = "w-full min-w-[80px] h-full p-2.5 bg-transparent text-center font-mono outline-none text-text-main focus:bg-brand-500/10 disabled:text-text-dim disabled:opacity-60";
                       const inputBrand = "w-full min-w-[80px] h-full p-2.5 bg-transparent text-center font-mono focus:bg-brand-500/20 outline-none text-brand-500 disabled:opacity-50";
                       // Desvío = EF Real − EF Teórica (igual que Control de Stock).
                       //  · Almacén (no vende): EF Teó = EI + compras + producción + devolución − envíos
                       //    − consumo − recupero − ventas pers. − decomisos.  (sin ventas teóricas)
                       //  · Sucursal: EF Teó = EI + compras + prést.recib − prést.env − ventas teó − decomisos − consumo.
                       const cmvReal = isAlmacen
                         ? (ei + purchases + produccion + loansReceived - loansSent - waste - staff_consumption - recupero - ventasPersonal - ef)
                         : (ei + purchases + loansReceived - loansSent - waste - staff_consumption - ef);
                       const efTeorica = isAlmacen
                         ? (ei + purchases + produccion + loansReceived - loansSent - staff_consumption - recupero - ventasPersonal - waste)
                         : (ei + purchases + loansReceived - loansSent - theoretical_sales - waste - staff_consumption);
                       const desvio = ef - efTeorica; // = ventas teóricas − CMV real
                       // Desvío %: (EF Real − EF Teórica) / EF Teórica × 100
                       const desvioPct = efTeorica !== 0 ? (desvio / efTeorica) * 100 : null;
                       return (
                         <tr key={id} className="hover:bg-bg-accent/20 transition-colors text-[11px]">
                           <td className="px-4 py-3 sticky left-0 bg-bg-sidebar z-10 border-r border-border-dim">
                             <div className="font-black uppercase text-text-main text-[11px]">{item?.name}</div>
                             <div className="text-[8px] font-bold text-text-dim uppercase opacity-60">{item?.unit || ''}</div>
                           </td>
                           <td className="p-0 border-r border-border-dim/30 bg-bg-accent/20">
                             <input type="number" step="0.001" value={ei || ''} placeholder="0" disabled={weekClosed}
                               onChange={(e) => updateDailyLog(weekDates[0], id, 'ei', parseFloat(e.target.value) || 0)} className={inputCls} />
                           </td>
                           <td className="p-0 border-r border-border-dim/30 bg-brand-500/5">
                             <input type="number" step="0.001" value={purchases || ''} placeholder="0" disabled={weekClosed}
                               onChange={(e) => updateDailyLog(dateStr, id, 'purchases', parseFloat(e.target.value) || 0)} className={inputBrand} />
                           </td>
                           {isAlmacen && (
                             <td className="p-0 border-r border-border-dim/30 bg-emerald-500/5">
                               <input type="number" step="0.001" value={produccion || ''} placeholder="0" disabled={weekClosed}
                                 onChange={(e) => updateWeeklyAggregate(weekDates, id, 'produccion', parseFloat(e.target.value) || 0)} className={inputCls} />
                             </td>
                           )}
                           <td className="p-0 border-r border-border-dim/30 bg-bg-accent/20">
                             <input type="number" step="0.001" value={loansReceived || ''} placeholder="0" disabled={weekClosed}
                               onChange={(e) => updateWeeklyAggregate(weekDates, id, 'loansReceived', parseFloat(e.target.value) || 0)} className={inputCls} />
                           </td>
                           <td className="p-0 border-r border-border-dim/30 bg-bg-accent/20">
                             <input type="number" step="0.001" value={loansSent || ''} placeholder="0" disabled={weekClosed}
                               onChange={(e) => updateWeeklyAggregate(weekDates, id, 'loansSent', parseFloat(e.target.value) || 0)} className={inputCls} />
                           </td>
                           <td className="p-0 border-r border-border-dim/30 bg-bg-accent/20">
                             <input type="number" step="0.001" value={staff_consumption || ''} placeholder="0" disabled={weekClosed}
                               onChange={(e) => updateWeeklyAggregate(weekDates, id, 'staff_consumption', parseFloat(e.target.value) || 0)} className={inputCls} />
                           </td>
                           {isAlmacen && (
                             <td className="p-0 border-r border-border-dim/30 bg-red-500/5">
                               <input type="number" step="0.001" value={recupero || ''} placeholder="0" disabled={weekClosed}
                                 onChange={(e) => updateWeeklyAggregate(weekDates, id, 'recupero', parseFloat(e.target.value) || 0)} className={inputCls} />
                             </td>
                           )}
                           {isAlmacen && (
                             <td className="p-0 border-r border-border-dim/30 bg-red-500/5">
                               <input type="number" step="0.001" value={ventasPersonal || ''} placeholder="0" disabled={weekClosed}
                                 onChange={(e) => updateWeeklyAggregate(weekDates, id, 'ventasPersonal', parseFloat(e.target.value) || 0)} className={inputCls} />
                             </td>
                           )}
                           {!isAlmacen && (
                             <td className="p-0 border-r border-border-dim/30 bg-purple-500/5">
                               <input type="number" step="0.001" value={theoretical_sales || ''} placeholder="0" disabled={weekClosed}
                                 onChange={(e) => updateDailyLog(dateStr, id, 'theoretical_sales', parseFloat(e.target.value) || 0)} className={inputBrand} />
                             </td>
                           )}
                           <td className="p-0 border-r border-border-dim/30 bg-red-500/5">
                             <input type="number" step="0.001" value={waste || ''} placeholder="0" disabled={weekClosed}
                               onChange={(e) => updateDailyLog(dateStr, id, 'waste', parseFloat(e.target.value) || 0)} className={inputBrand} />
                           </td>
                           <td className="p-0 border-r border-border-dim/30 bg-bg-accent/20">
                             <input type="number" step="0.001" value={ef || ''} placeholder="0" disabled={weekClosed}
                               onChange={(e) => updateDailyLog(weekDates[0], id, 'ef', parseFloat(e.target.value) || 0)} className={inputCls} />
                           </td>
                           <td className="px-3 py-3 text-center border-r border-border-dim/30 bg-teal-500/5" title="Existencia Final Teórica (calculada, no editable)">
                             <span className="font-mono text-[11px] font-bold text-teal-600">{efTeorica.toLocaleString('es-AR', { maximumFractionDigits: 3 })}</span>
                           </td>
                           {!isAlmacen && (
                             <td className="px-3 py-3 text-center border-r border-border-dim bg-brand-500/5" title="CMV Real = EI + compras + prést.recib − prést.env − consumo − decomisos − EF Real">
                               <span className="font-mono text-[11px] font-black text-text-main">{cmvReal.toLocaleString('es-AR', { maximumFractionDigits: 1 })}</span>
                             </td>
                           )}
                           <td className="px-3 py-3 text-center border-l border-border-dim bg-amber-500/5">
                             <span className={cn("text-[12px] font-mono font-black px-2 py-1 rounded",
                               Math.abs(desvio) < 2 ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500")}>
                               {desvio > 0 ? '+' : ''}{desvio.toFixed(1)}
                             </span>
                           </td>
                           <td className="px-3 py-3 text-center bg-amber-500/5">
                             {desvioPct === null ? (
                               <span className="text-text-dim font-mono font-black">—</span>
                             ) : (
                               <span className={cn("text-[12px] font-mono font-black px-2 py-1 rounded",
                                 Math.abs(desvioPct) < 5 ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500")}>
                                 {desvioPct > 0 ? '+' : ''}{desvioPct.toFixed(1)}%
                               </span>
                             )}
                           </td>
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

              {/* Buscador de Insumos Rápido */}
              <div className="flex gap-2 mb-6">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
                  <input 
                    type="text"
                    value={selectorSearch}
                    onChange={(e) => setSelectorSearch(e.target.value)}
                    placeholder="Escriba el nombre del insumo para buscar..."
                    className="w-full pl-9 pr-12 py-2.5 bg-bg-accent border border-border-dim rounded text-[10px] font-black uppercase tracking-widest outline-none focus:border-brand-500 placeholder-text-dim/60"
                  />
                  {selectorSearch && (
                    <button 
                      onClick={() => setSelectorSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-main transition-colors"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                {selectorSearch && (
                  <button
                    onClick={() => {
                      const filtered = catalogItems.filter(item => item.name.toLowerCase().includes(selectorSearch.toLowerCase()));
                      const itemsToSelect = filtered.map(item => item.id);
                      setControlledIds(prev => {
                        const next = [...prev];
                        itemsToSelect.forEach(id => {
                          if (!next.includes(id)) {
                            next.push(id);
                          }
                        });
                        return next;
                      });
                    }}
                    className="px-4 py-2.5 bg-brand-500/10 hover:bg-brand-500/20 text-brand-500 rounded border border-brand-500/30 text-[10px] font-black uppercase tracking-widest transition-all shrink-0"
                  >
                    Marcar Todos
                  </button>
                )}
              </div>

              {/* Resumen de Insumos Seleccionados */}
              {validControlledIds.length > 0 && (
                <div className="mb-6 p-4 bg-brand-50/[0.04] dark:bg-brand-500/[0.04] border border-brand-500/20 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[9px] font-black uppercase text-brand-500 tracking-wider">
                      Insumos actualmente controlados ({validControlledIds.length})
                    </span>
                    <button 
                      onClick={() => setControlledIds([])}
                      className="text-[9px] font-black text-text-dim hover:text-brand-500 uppercase transition-colors"
                    >
                      Deseleccionar Todos
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto custom-scrollbar pr-1">
                    {catalogItems.filter(item => controlledIds.includes(item.id)).map(item => (
                      <span 
                        key={item.id}
                        onClick={() => setControlledIds(prev => prev.filter(id => id !== item.id))}
                        className="inline-flex items-center gap-1.5 px-2 py-1 bg-brand-500 text-white rounded text-[8px] font-black uppercase tracking-wider cursor-pointer hover:bg-brand-600 transition-all hover:scale-[1.03] shadow-md shadow-brand-500/10"
                      >
                        {prodIdSet.has(item.id) && (
                          <span className="px-1 py-0.5 rounded bg-white/25 text-[6px] leading-none">PROD</span>
                        )}
                        {item.name}
                        <X size={10} className="stroke-[3]" />
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Encabezado de la grilla y Filtro */}
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-black uppercase text-text-dim tracking-wider">
                  Disponibles en catálogo (Priorizados arriba)
                </span>
                <button
                  onClick={() => setShowOnlySelected(!showOnlySelected)}
                  className={cn(
                    "px-3 py-1 rounded text-[9px] font-black uppercase tracking-wider transition-all border",
                    showOnlySelected 
                      ? "bg-brand-500 text-white border-brand-600 shadow shadow-brand-500/20 font-bold" 
                      : "bg-bg-accent border-border-dim text-text-dim hover:border-brand-500/50"
                  )}
                >
                  {showOnlySelected ? "Ver Todos" : "Ver Solo Seleccionados"}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[350px] overflow-y-auto custom-scrollbar pr-1">
                {catalogItems
                  .filter(item => !selectorSearch || item.name.toLowerCase().includes(selectorSearch.toLowerCase()))
                  .filter(item => !showOnlySelected || controlledIds.includes(item.id))
                  .sort((a, b) => {
                    const aSel = controlledIds.includes(a.id);
                    const bSel = controlledIds.includes(b.id);
                    if (aSel && !bSel) return -1;
                    if (!aSel && bSel) return 1;
                    return a.name.localeCompare(b.name);
                  }).length > 0 ? (
                  catalogItems
                    .filter(item => !selectorSearch || item.name.toLowerCase().includes(selectorSearch.toLowerCase()))
                    .filter(item => !showOnlySelected || controlledIds.includes(item.id))
                    .sort((a, b) => {
                      const aSel = controlledIds.includes(a.id);
                      const bSel = controlledIds.includes(b.id);
                      if (aSel && !bSel) return -1;
                      if (!aSel && bSel) return 1;
                      return a.name.localeCompare(b.name);
                    }).map(item => (
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
                          ? "bg-brand-500 text-white border-brand-600 shadow-md shadow-brand-500/15" 
                          : "bg-bg-accent border-border-dim text-text-dim hover:border-brand-500/50"
                      )}
                    >
                      <span className={cn("flex items-center gap-2 min-w-0", controlledIds.includes(item.id) ? "text-white font-black" : "text-text-dim group-hover:text-text-main")}>
                        <span className={cn(
                          "shrink-0 px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wider border",
                          prodIdSet.has(item.id)
                            ? (controlledIds.includes(item.id) ? "bg-white/20 border-white/40 text-white" : "bg-purple-500/10 border-purple-500/30 text-purple-500")
                            : (controlledIds.includes(item.id) ? "bg-white/20 border-white/40 text-white" : "bg-sky-500/10 border-sky-500/30 text-sky-500")
                        )}>
                          {prodIdSet.has(item.id) ? 'Prod.' : 'Insumo'}
                        </span>
                        <span className="truncate">{item.name}</span>
                      </span>
                      <div className={cn(
                        "w-5 h-5 rounded flex items-center justify-center border transition-all shrink-0",
                        controlledIds.includes(item.id) ? "bg-white border-white text-brand-500 shadow-sm" : "border-border-dim bg-transparent"
                      )}>
                         {controlledIds.includes(item.id) ? (
                           <Check size={11} className="text-brand-500 stroke-[3.5]" />
                         ) : (
                           <Plus size={11} className="text-text-dim/60 group-hover:text-text-main" />
                         )}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="col-span-2 py-8 text-center text-text-dim text-[10px] font-bold uppercase tracking-wider">
                    No se encontraron insumos que coincidan con la búsqueda
                  </div>
                )}
              </div>

              <div className="mt-8 space-y-3">
                <button 
                  onClick={saveMonthlyControl}
                  className="w-full bg-brand-500 text-black py-4 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-xl shadow-brand-500/10 font-bold"
                >
                  CONFIRMAR CONTROL MENSUAL SUCURSAL ACTUAL
                </button>

                <button 
                  onClick={saveMonthlyControlForAllBranches}
                  className="w-full bg-bg-accent border border-brand-500/20 text-brand-500 py-4 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-500/10 hover:border-brand-500 transition-all font-bold"
                >
                  APLICAR ESTOS INSUMOS A TODAS LAS SUCURSALES
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'recetas' && (
          <motion.div key="recetas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex gap-2">
                <button 
                  onClick={() => setRecipeViewMode('individual')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded text-[10px] font-black uppercase transition-all",
                    recipeViewMode === 'individual' ? "bg-brand-500 text-black shadow-lg" : "bg-bg-sidebar border border-border-dim text-text-dim hover:border-brand-500/50"
                  )}
                >
                  <LayoutDashboard size={14} />
                  Editor Individual
                </button>
                <button 
                  onClick={() => setRecipeViewMode('table')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded text-[10px] font-black uppercase transition-all",
                    recipeViewMode === 'table' ? "bg-brand-500 text-black shadow-lg" : "bg-bg-sidebar border border-border-dim text-text-dim hover:border-brand-500/50"
                  )}
                >
                  <Table2 size={14} />
                  Tabla de Recetas
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => downloadTemplate('recipes')}
                  className="flex items-center gap-2 px-4 py-2 bg-bg-accent border border-border-dim rounded hover:border-brand-500 transition-all text-text-dim hover:text-brand-500 text-[10px] font-black uppercase"
                >
                  <Download size={14} />
                  Modelo
                </button>
                <label className="flex items-center gap-2 px-4 py-2 bg-bg-accent border border-brand-500/20 rounded cursor-pointer hover:border-brand-500 transition-all text-brand-500 text-[10px] font-black uppercase">
                  <Upload size={14} />
                  Importar Recetas
                  <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleImportRecipes} />
                </label>
              </div>
            </div>

            {recipeViewMode === 'individual' ? (
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
                     {products.filter(p => !recipeSearch || p.name.toLowerCase().includes(recipeSearch.toLowerCase())).map(p => {
                       const hasRecipe = (recipes[p.id]?.length || 0) > 0;
                       return (
                         <button 
                          key={p.id} 
                          onClick={() => setSelectedProductId(p.id)}
                          className={cn(
                            "w-full text-left p-3 rounded transition-colors border-l-2 group relative",
                            selectedProductId === p.id 
                              ? "bg-brand-500/10 border-brand-500" 
                              : "hover:bg-bg-accent border-transparent hover:border-brand-500/50"
                          )}
                         >
                            <div className="flex justify-between items-center">
                               <div className="flex-1 truncate pr-2">
                                  <p className={cn(
                                    "text-[10px] font-black transition-colors uppercase tracking-tight truncate",
                                    selectedProductId === p.id ? "text-brand-500" : "text-text-main group-hover:text-brand-500"
                                  )}>{p.name}</p>
                                  <p className="text-[8px] text-text-dim uppercase font-bold opacity-60 truncate">{p.category}</p>
                               </div>
                               {hasRecipe && (
                                  <div className="shrink-0 flex items-center gap-1.5 px-1.5 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/20">
                                     <div className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
                                     <span className="text-[7px] font-black text-brand-500 uppercase">{recipes[p.id].length}</span>
                                  </div>
                               )}
                            </div>
                         </button>
                       );
                     })}
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
                         {(recipes[selectedProductId] || []).map((line, index) => {
                           const item = catalogItems.find(i => i.id === line.itemId);
                           return (
                             <div key={`${line.itemId}-${index}`} className="flex items-center justify-between bg-bg-accent/40 p-4 rounded border border-border-dim group hover:border-brand-500/30 transition-all">
                                <div className="flex items-center gap-3">
                                   <div className="w-10 h-10 rounded bg-bg-sidebar flex items-center justify-center border border-border-dim text-brand-500 shadow-inner">
                                      <Table2 size={18} />
                                   </div>
                                   <div className="flex flex-col">
                                      <span className="text-[11px] font-black text-text-main uppercase tracking-tight">{item?.name}</span>
                                      <span className="text-[8px] text-text-dim uppercase font-bold">Unidad base: {item?.unit}</span>
                                   </div>
                                </div>
                                <div className="flex items-center gap-4">
                                   <div className="flex flex-col items-end gap-1">
                                      <span className="text-[8px] font-black text-text-dim uppercase">Cantidad</span>
                                      <div className="flex items-center bg-bg-sidebar border border-border-dim rounded overflow-hidden shadow-sm">
                                         <QuantityInput
                                           value={getDisplayQuantity(line.itemId, line.quantity, selectedProductId)}
                                           onCommit={(val) => updateIngredientQuantity(selectedProductId, line.itemId, val)}
                                           disabled={isReadOnly}
                                           className="w-24 py-2 px-3 text-center text-[12px] font-mono font-black text-brand-500 bg-transparent outline-none focus:bg-brand-500/5 transition-colors"
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
                                              "bg-bg-accent px-3 py-2 border-l border-border-dim text-[10px] font-bold transition-colors min-w-[40px]",
                                              getSubUnit(item?.unit || '') ? "cursor-pointer hover:bg-brand-500 hover:text-black" : "cursor-default text-text-dim"
                                            )}
                                         >
                                            {recipeDisplayUnits[`${selectedProductId}-${line.itemId}`] || item?.unit}
                                         </button>
                                      </div>
                                   </div>
                                   {!isReadOnly && (
                                     <div className="pt-5">
                                       <button
                                         onClick={() => removeIngredientFromRecipe(selectedProductId, line.itemId)}
                                         className="text-text-dim hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-2 hover:bg-red-500/10 rounded"
                                         title="Eliminar insumo de receta"
                                       >
                                          <X size={16} />
                                       </button>
                                     </div>
                                   )}
                                </div>
                             </div>
                           );
                         })}
                         
                         {!isReadOnly && (
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
                                   {catalogItems.filter(i => !(recipes[selectedProductId] || []).some(r => r.itemId === i.id)).map(i => (
                                     <option key={i.id} value={i.id}>{i.name} ({i.unit}){prodIdSet.has(i.id) ? ' · PROD' : ''}</option>
                                   ))}
                                </select>
                              </div>
                           </div>
                         )}
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
            ) : (
              <div className="bg-bg-sidebar border border-border-dim rounded-lg shadow-xl overflow-hidden flex flex-col h-[600px]">
                <div className="p-4 border-b border-border-dim bg-bg-accent/20 flex justify-between items-center">
                  <div className="relative w-64">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
                    <input 
                      className="w-full pl-9 pr-4 py-2 bg-bg-sidebar border border-border-dim rounded text-[10px] font-black uppercase outline-none focus:border-brand-500" 
                      placeholder="BUSCAR EN TODAS LAS RECETAS..." 
                      onChange={(e) => setRecipeTableSearch(e.target.value)}
                      value={recipeTableSearch}
                    />
                  </div>
                  <div className="text-[10px] font-black text-brand-500 uppercase">
                    {flattenedRecipes.length} INGREDIENTES CARGADOS
                  </div>
                </div>
                <div className="flex-1 overflow-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-bg-sidebar border-b border-border-dim">
                      <tr>
                        <th className="p-4 text-[10px] font-black uppercase text-text-dim tracking-widest">Producto</th>
                        <th className="p-4 text-[10px] font-black uppercase text-text-dim tracking-widest">Insumo</th>
                        <th className="p-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Cantidad</th>
                        <th className="p-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Unidad</th>
                        <th className="p-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-dim/50">
                      {flattenedRecipes
                        .filter(r => {
                          if (!recipeTableSearch) return true;
                          const p = products.find(prod => prod.id === r.productId);
                          const i = catalogItems.find(item => item.id === r.itemId);
                          const search = recipeTableSearch.toLowerCase();
                          return p?.name.toLowerCase().includes(search) || i?.name.toLowerCase().includes(search);
                        })
                        .map((line, idx) => {
                          const product = products.find(p => p.id === line.productId);
                          const item = catalogItems.find(i => i.id === line.itemId);
                          return (
                            <tr key={`${line.productId}-${line.itemId}-${idx}`} className="hover:bg-bg-accent/40 transition-colors group">
                              <td className="p-4">
                                <p className="text-[10px] font-black uppercase text-text-main">{product?.name}</p>
                                <p className="text-[8px] text-text-dim uppercase font-bold">{product?.category}</p>
                              </td>
                              <td className="p-4">
                                <p className="text-[10px] font-black uppercase text-brand-500">{item?.name}</p>
                              </td>
                              <td className="p-4 text-center">
                                <QuantityInput
                                  value={getDisplayQuantity(line.itemId, line.quantity, line.productId)}
                                  onCommit={(val) => updateIngredientQuantity(line.productId, line.itemId, val)}
                                  disabled={isReadOnly}
                                  className="w-20 py-1 px-2 text-center text-[11px] font-mono font-black text-brand-500 bg-bg-sidebar border border-border-dim rounded outline-none focus:border-brand-500 transition-colors"
                                />
                              </td>
                              <td className="p-4 text-center">
                                <button 
                                  onClick={() => {
                                    const sub = getSubUnit(item?.unit || '');
                                    if (sub) {
                                      setRecipeDisplayUnits(prev => ({
                                        ...prev,
                                        [`${line.productId}-${line.itemId}`]: (recipeDisplayUnits[`${line.productId}-${line.itemId}`] || item?.unit) === sub ? (item?.unit || '') : sub
                                      }));
                                    }
                                  }}
                                  className={cn(
                                    "px-2 py-1 rounded text-[9px] font-black uppercase transition-all",
                                    getSubUnit(item?.unit || '') ? "bg-bg-accent hover:bg-brand-500 hover:text-black cursor-pointer" : "text-text-dim cursor-default"
                                  )}
                                >
                                  {recipeDisplayUnits[`${line.productId}-${line.itemId}`] || item?.unit}
                                </button>
                              </td>
                              <td className="p-4 text-right">
                                <button 
                                  onClick={() => removeIngredientFromRecipe(line.productId, line.itemId)}
                                  className="text-text-dim hover:text-red-500 transition-all p-2 hover:bg-red-500/10 rounded"
                                >
                                  <X size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                  {flattenedRecipes.length === 0 && (
                    <div className="p-12 text-center">
                      <p className="text-[10px] text-text-dim font-black uppercase">No hay recetas cargadas aún.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'diagnostico' && (
          <motion.div key="diagnostico" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
                <div>
                  <h3 className="text-sm font-black uppercase text-text-main tracking-wider">Diagnóstico de Ventas Teóricas</h3>
                  <p className="text-[10px] text-text-dim font-bold uppercase mt-0.5">Productos del Ranking de Ventas y si tienen receta cargada para descomponer en insumos</p>
                </div>
                <button onClick={loadRankingDiagnostic} disabled={diagLoading}
                  className="px-4 py-2 rounded bg-brand-500 hover:bg-brand-600 text-black text-[10px] font-black uppercase tracking-widest transition-all">
                  {diagLoading ? 'Cargando...' : 'Actualizar'}
                </button>
              </div>
              {rankingNames.length > 0 && (
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="bg-bg-accent/30 border border-border-dim/40 rounded-lg p-3">
                    <span className="text-[8px] font-black uppercase text-text-dim tracking-widest block opacity-70">Total productos en Ranking</span>
                    <p className="text-lg font-mono font-black text-text-main mt-1">{diagnostic.total}</p>
                  </div>
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                    <span className="text-[8px] font-black uppercase text-text-dim tracking-widest block opacity-70">Con receta (hacen match)</span>
                    <p className="text-lg font-mono font-black text-emerald-400 mt-1">{diagnostic.conReceta.length}</p>
                  </div>
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                    <span className="text-[8px] font-black uppercase text-text-dim tracking-widest block opacity-70">SIN receta (no se computan)</span>
                    <p className="text-lg font-mono font-black text-red-400 mt-1">{diagnostic.sinReceta.length}</p>
                  </div>
                </div>
              )}
            </div>

            {diagnostic.sinReceta.length > 0 && (
              <div className="bg-bg-sidebar border-2 border-red-500/30 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={16} className="text-red-500" />
                  <h4 className="text-xs font-black uppercase text-red-500 tracking-widest">Productos del Ranking SIN receta ({diagnostic.sinReceta.length})</h4>
                </div>
                <p className="text-[10px] text-text-dim font-bold mb-3">Estos productos se venden pero no tienen receta con ese nombre exacto, así que NO suman a las ventas teóricas. Cargá su receta (en la pestaña Recetas) usando exactamente este nombre, o renombrá la receta para que coincida.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-[400px] overflow-y-auto">
                  {diagnostic.sinReceta.map((name, i) => (
                    <div key={i} className="bg-red-500/5 border border-red-500/20 rounded px-3 py-1.5 text-[10px] font-bold text-text-main uppercase">{name}</div>
                  ))}
                </div>
              </div>
            )}

            {diagnostic.conReceta.length > 0 && (
              <div className="bg-bg-sidebar border border-emerald-500/20 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen size={16} className="text-emerald-400" />
                  <h4 className="text-xs font-black uppercase text-emerald-400 tracking-widest">Productos con receta OK ({diagnostic.conReceta.length})</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-[300px] overflow-y-auto">
                  {diagnostic.conReceta.map((name, i) => (
                    <div key={i} className="bg-emerald-500/5 border border-emerald-500/20 rounded px-3 py-1.5 text-[10px] font-bold text-text-main uppercase">{name}</div>
                  ))}
                </div>
              </div>
            )}

            {!diagLoading && rankingNames.length === 0 && (
              <p className="text-center py-8 text-[11px] text-text-dim uppercase font-bold italic">No se encontraron productos en el Ranking de Ventas. Importá el ranking en el módulo Ventas primero.</p>
            )}
          </motion.div>
        )}

        {activeTab === 'gestion' && (
          <motion.div key="gestion" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Insumos Management */}
              <div className="bg-bg-sidebar border border-border-dim rounded-lg p-6 shadow-xl space-y-6">
                <div className="flex items-center justify-between border-b border-border-dim pb-4">
                  <h3 className="text-sm font-black uppercase text-brand-500 tracking-widest">Maestro de Insumos</h3>
                  <div className="flex gap-2">
                    {!isReadOnly && (
                    <button
                      onClick={handleRecalcCostos}
                      disabled={recalcCostos}
                      title="Recalcula y guarda el costo de todas las recetas y platos según los costos actuales de insumos"
                      className="flex items-center gap-2 px-3 py-1.5 bg-bg-accent border border-border-dim rounded hover:border-emerald-500 transition-all text-text-dim hover:text-emerald-500 text-[9px] font-black uppercase disabled:opacity-50"
                    >
                      {recalcCostos ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} />}
                      Recalcular costos
                    </button>
                    )}
                    <button
                      onClick={exportItems}
                      title="Exportar a Excel"
                      className="flex items-center gap-2 px-3 py-1.5 bg-bg-accent border border-border-dim rounded hover:border-emerald-500 transition-all text-text-dim hover:text-emerald-500 text-[9px] font-black uppercase"
                    >
                      <FileSpreadsheet size={14} />
                      Exportar
                    </button>
                    <button
                      onClick={() => downloadTemplate('items')}
                      className="flex items-center gap-2 px-3 py-1.5 bg-bg-accent border border-border-dim rounded hover:border-brand-500 transition-all text-text-dim hover:text-brand-500 text-[9px] font-black uppercase"
                    >
                      <Download size={14} />
                      Modelo
                    </button>
                    <label className="flex items-center gap-2 px-3 py-1.5 bg-bg-accent border border-brand-500/20 rounded cursor-pointer hover:border-brand-500 transition-all text-brand-500 text-[9px] font-black uppercase">
                      <Upload size={14} />
                      Importar
                      <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleImportItems} />
                    </label>
                  </div>
                </div>
                
                {/* Item Form */}
                <div className="bg-bg-accent/40 p-4 rounded border border-brand-500/20 space-y-3">
                   <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-text-dim uppercase">Categoría</label>
                        <input 
                          value={itemForm.category}
                          onChange={e => setItemForm({...itemForm, category: e.target.value})}
                          className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none focus:border-brand-500 uppercase font-black"
                          placeholder="CARNES..."
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-text-dim uppercase">Código</label>
                        <input 
                          value={itemForm.code}
                          onChange={e => setItemForm({...itemForm, code: e.target.value})}
                          className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none focus:border-brand-500 uppercase font-black"
                          placeholder="INS-001..."
                        />
                      </div>
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
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-text-dim uppercase">Costo ($)</label>
                        <input 
                          type="number"
                          value={itemForm.cost || ''}
                          onChange={e => setItemForm({...itemForm, cost: parseFloat(e.target.value) || 0})}
                          className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none focus:border-brand-500 font-mono font-black"
                          placeholder="0"
                        />
                      </div>
                   </div>
                   <button 
                    onClick={async () => {
                        if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
                        if (editingItem) {
                          await supabase.from('stock_items').update(itemForm).eq('id', editingItem.id);
                          setEditingItem(null);
                        } else {
                          await supabase.from('stock_items').insert(itemForm);
                        }
                        setItemForm({ name: '', unit: '', cost: 0, category: '', code: '' });
                        await reloadItems();
                    }}
                    className="w-full bg-brand-500 text-black py-2 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all font-bold"
                   >
                     {editingItem ? 'Guardar Cambios' : 'Agregar Insumo'}
                   </button>
                   {editingItem && (
                     <button onClick={() => { setEditingItem(null); setItemForm({ name: '', unit: '', cost: 0, category: '', code: '' }); }} className="w-full text-[9px] font-bold text-text-dim uppercase underline">Cancelar Edición</button>
                   )}
                </div>

                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
                  <input
                    value={itemMasterSearch}
                    onChange={e => setItemMasterSearch(e.target.value)}
                    placeholder="Buscar insumo por nombre o categoría..."
                    className="w-full bg-bg-card border border-border-dim rounded pl-9 pr-3 py-2 text-[10px] text-text-main outline-none focus:border-brand-500 uppercase font-bold"
                  />
                </div>

                {!isReadOnly && items.length > 0 && (
                  <div className="flex items-center justify-between gap-2 flex-wrap bg-bg-accent/30 border border-border-dim rounded px-3 py-2">
                    <span className="text-[9px] font-black text-text-dim uppercase">
                      {selectedItemIds.size > 0 ? `${selectedItemIds.size} seleccionado(s)` : `${items.length} insumo(s)`}
                    </span>
                    <div className="flex items-center gap-2">
                      {selectedItemIds.size > 0 && (
                        <button onClick={deleteSelectedItems} className="flex items-center gap-1 px-2.5 py-1 bg-red-500/10 text-red-500 border border-red-500/30 rounded text-[9px] font-black uppercase hover:bg-red-500/20 transition-all">
                          <Trash2 size={12} /> Eliminar selección
                        </button>
                      )}
                      <button onClick={deleteAllItems} className="flex items-center gap-1 px-2.5 py-1 bg-bg-card text-text-dim border border-border-dim rounded text-[9px] font-black uppercase hover:text-red-500 hover:border-red-500/30 transition-all">
                        <Trash2 size={12} /> Eliminar todo
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                  {items.filter(item => {
                    if (!itemMasterSearch) return true;
                    const q = itemMasterSearch.toLowerCase();
                    return item.name.toLowerCase().includes(q) || (item.category || '').toLowerCase().includes(q);
                  }).map(item => {
                    const inhabilitado = (item as any).is_active === false;
                    return (
                    <div key={item.id} className={cn("flex items-center justify-between p-4 rounded border group transition-all", selectedItemIds.has(item.id) ? "bg-brand-500/10 border-brand-500/40" : "bg-bg-accent/40 border-border-dim hover:border-brand-500/30", inhabilitado && "opacity-55")}>
                      <div className="flex items-center gap-3">
                        {!isReadOnly && (
                          <input type="checkbox" checked={selectedItemIds.has(item.id)} onChange={() => toggleItemSelected(item.id)}
                            className="w-4 h-4 accent-brand-500 cursor-pointer shrink-0" />
                        )}
                        <div>
                          <p className="text-[11px] font-black text-text-main uppercase flex items-center gap-2 flex-wrap">
                            <span>{item.code ? <span className="text-brand-500 mr-1.5">{item.code}</span> : ''}{item.name}</span>
                            {inhabilitado && <span className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30">Inhabilitado</span>}
                          </p>
                          <p className="text-[9px] text-text-dim font-bold uppercase mt-1">
                            Unidad: {item.unit}
                            {item.category ? ` · ${item.category}` : ''}
                            {item.cost ? ` · $${item.cost.toLocaleString('es-AR')}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isReadOnly && (
                          <button
                            title={inhabilitado ? 'Habilitar (vuelve a figurar en Pedidos Internos)' : 'Inhabilitar (no figura para pedir, sin borrarlo)'}
                            onClick={async () => {
                              const { error } = await supabase.from('stock_items').update({ is_active: inhabilitado }).eq('id', item.id);
                              if (!error) await reloadItems();
                              else alert('No se pudo cambiar el estado: ' + error.message);
                            }}
                            className={cn("p-2 transition-colors", inhabilitado ? "text-amber-500 hover:text-emerald-500" : "text-text-dim hover:text-amber-500")}
                          >
                            {inhabilitado ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setEditingItem(item);
                            setItemForm({ name: item.name, unit: item.unit, cost: item.cost || 0, category: item.category || '', code: item.code || '' });
                          }}
                          className="p-2 text-text-dim hover:text-brand-500 transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={async () => {
                        if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
                            if (window.confirm('¿Está seguro de eliminar este insumo? Se eliminará de todas las recetas y del control de desvíos.')) {
                              const { error } = await supabase.from('stock_items').delete().eq('id', item.id);
                              if (!error) {
                                setControlledIds(prev => prev.filter(id => id !== item.id));
                                await reloadItems();
                              }
                            }
                          }}
                          className="p-2 text-text-dim hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>

              {/* Productos Management */}
              <div className="bg-bg-sidebar border border-border-dim rounded-lg p-6 shadow-xl space-y-6">
                <div className="flex items-center justify-between border-b border-border-dim pb-4">
                  <h3 className="text-sm font-black uppercase text-teal-500 tracking-widest">Maestro de Productos</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={exportProductsXlsx}
                      title="Exportar a Excel"
                      className="flex items-center gap-2 px-3 py-1.5 bg-bg-accent border border-border-dim rounded hover:border-emerald-500 transition-all text-text-dim hover:text-emerald-500 text-[9px] font-black uppercase"
                    >
                      <FileSpreadsheet size={14} />
                      Exportar
                    </button>
                    <button
                      onClick={() => downloadTemplate('products')}
                      className="flex items-center gap-2 px-3 py-1.5 bg-bg-accent border border-border-dim rounded hover:border-teal-500 transition-all text-text-dim hover:text-teal-500 text-[9px] font-black uppercase"
                    >
                      <Download size={14} />
                      Modelo
                    </button>
                    <label className="flex items-center gap-2 px-3 py-1.5 bg-bg-accent border border-teal-500/20 rounded cursor-pointer hover:border-teal-500 transition-all text-teal-500 text-[9px] font-black uppercase">
                      <Upload size={14} />
                      Importar
                      <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleImportProducts} />
                    </label>
                  </div>
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
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-text-dim uppercase">Código</label>
                        <input
                          value={productForm.code}
                          onChange={e => setProductForm({...productForm, code: e.target.value})}
                          className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[10px] font-mono text-text-main outline-none focus:border-teal-500 font-black uppercase"
                          placeholder="PROD-001"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-text-dim uppercase">Costo</label>
                        <input
                          type="number" step="0.01"
                          value={productForm.cost}
                          onChange={e => setProductForm({...productForm, cost: e.target.value})}
                          className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[10px] font-mono text-text-main outline-none focus:border-teal-500 font-black"
                          placeholder="0.00"
                        />
                      </div>
                   </div>
                   <button
                    onClick={async () => {
                        if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
                        const payload = {
                          name: productForm.name,
                          category: productForm.category,
                          code: productForm.code.trim() || null,
                          cost: productForm.cost.trim() === '' ? null : Number(productForm.cost),
                        };
                        if (editingProduct) {
                          await supabase.from('products').update(payload).eq('id', editingProduct.id);
                          setEditingProduct(null);
                        } else {
                          await supabase.from('products').insert(payload);
                        }
                        setProductForm({ name: '', category: '', code: '', cost: '' });
                        await reloadProducts();
                    }}
                    className="w-full bg-teal-500 text-black py-2 rounded text-[10px] font-black uppercase tracking-widest hover:bg-teal-600 transition-all font-bold"
                   >
                     {editingProduct ? 'Guardar Cambios' : 'Agregar Producto'}
                   </button>
                   {editingProduct && (
                     <button onClick={() => { setEditingProduct(null); setProductForm({ name: '', category: '', code: '', cost: '' }); }} className="w-full text-[9px] font-bold text-text-dim uppercase underline">Cancelar Edición</button>
                   )}
                </div>

                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
                  <input
                    value={productMasterSearch}
                    onChange={e => setProductMasterSearch(e.target.value)}
                    placeholder="Buscar producto por nombre o categoría..."
                    className="w-full bg-bg-card border border-border-dim rounded pl-9 pr-3 py-2 text-[10px] text-text-main outline-none focus:border-teal-500 uppercase font-bold"
                  />
                </div>

                {!isReadOnly && products.length > 0 && (
                  <div className="flex items-center justify-between gap-2 flex-wrap bg-bg-accent/30 border border-border-dim rounded px-3 py-2">
                    <span className="text-[9px] font-black text-text-dim uppercase">
                      {selectedProductIds.size > 0 ? `${selectedProductIds.size} seleccionado(s)` : `${products.length} producto(s)`}
                    </span>
                    <div className="flex items-center gap-2">
                      {selectedProductIds.size > 0 && (
                        <button onClick={deleteSelectedProducts} className="flex items-center gap-1 px-2.5 py-1 bg-red-500/10 text-red-500 border border-red-500/30 rounded text-[9px] font-black uppercase hover:bg-red-500/20 transition-all">
                          <Trash2 size={12} /> Eliminar selección
                        </button>
                      )}
                      <button onClick={deleteAllProducts} className="flex items-center gap-1 px-2.5 py-1 bg-bg-card text-text-dim border border-border-dim rounded text-[9px] font-black uppercase hover:text-red-500 hover:border-red-500/30 transition-all">
                        <Trash2 size={12} /> Eliminar todo
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                  {products.filter(p => {
                    if (!productMasterSearch) return true;
                    const q = productMasterSearch.toLowerCase();
                    return p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q);
                  }).map(p => {
                    const inhabilitado = (p as any).is_active === false;
                    return (
                    <div key={p.id} className={cn("flex items-center justify-between p-4 rounded border group transition-all", selectedProductIds.has(p.id) ? "bg-teal-500/10 border-teal-500/40" : "bg-bg-accent/40 border-border-dim hover:border-teal-500/30", inhabilitado && "opacity-55")}>
                      <div className="flex items-center gap-3">
                        {!isReadOnly && (
                          <input type="checkbox" checked={selectedProductIds.has(p.id)} onChange={() => toggleProductSelected(p.id)}
                            className="w-4 h-4 accent-teal-500 cursor-pointer shrink-0" />
                        )}
                        <div>
                          <p className="text-[11px] font-black text-text-main uppercase flex items-center gap-2 flex-wrap">
                            <span>{(p as any).code ? <span className="text-teal-500 mr-1.5 font-mono">{(p as any).code}</span> : ''}{p.name}</span>
                            {inhabilitado && <span className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30">Inhabilitado</span>}
                          </p>
                          <p className="text-[9px] text-text-dim font-bold uppercase mt-1">
                            Categoría: {p.category}
                            {(p as any).cost != null ? ` · $${Number((p as any).cost).toLocaleString('es-AR')}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isReadOnly && (
                          <button
                            title={inhabilitado ? 'Habilitar (vuelve a figurar para elegir)' : 'Inhabilitar (no figura para elegir, sin borrarlo)'}
                            onClick={async () => {
                              const { error } = await supabase.from('products').update({ is_active: inhabilitado }).eq('id', p.id);
                              if (!error) await reloadProducts();
                              else alert('No se pudo cambiar el estado: ' + error.message);
                            }}
                            className={cn("p-2 transition-colors", inhabilitado ? "text-amber-500 hover:text-emerald-500" : "text-text-dim hover:text-amber-500")}
                          >
                            {inhabilitado ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setEditingProduct(p);
                            setProductForm({ name: p.name, category: p.category, code: (p as any).code || '', cost: (p as any).cost != null ? String((p as any).cost) : '' });
                          }}
                          className="p-2 text-text-dim hover:text-teal-500 transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={async () => {
                        if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
                            if (window.confirm('¿Está seguro de eliminar este producto?')) {
                              const { error } = await supabase.from('products').delete().eq('id', p.id);
                              if (!error) {
                                if (selectedProductId === p.id) setSelectedProductId(null);
                                await reloadProducts();
                              }
                            }
                          }}
                          className="p-2 text-text-dim hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>

              {/* Maestro Recetas Producción */}
              <RecipeMastersManager tipo="produccion" title="Maestro Recetas Producción" color="purple" isReadOnly={isReadOnly} showCost />

              {/* Maestro Recetas Sucursales */}
              <RecipeMastersManager tipo="sucursal" title="Maestro Recetas Sucursales" color="orange" isReadOnly={isReadOnly} showCost />

              {/* Maestro Secciones Carta: sin unidad de medida (una sección de la carta no la tiene) */}
              <RecipeMastersManager tipo="seccion_carta" title="Maestro Secciones Carta" color="sky" showUnit={false} isReadOnly={isReadOnly} />
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
