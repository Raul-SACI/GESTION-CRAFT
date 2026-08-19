/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Calendar, 
  Award, 
  AlertCircle, 
  Building2, 
  ChevronLeft, 
  ChevronRight, 
  Info, 
  Coffee, 
  Star, 
  Flag, 
  Clock, 
  Users, 
  Briefcase, 
  AlertTriangle, 
  Pencil,
  X,
  Percent, 
  ShieldAlert, 
  RefreshCw,
  CheckCircle2,
  XCircle,
  BarChart4,
  Ticket,
  Lock,
  Loader2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { Branch } from '../types';
import { SEEDED_TEMPLATES } from '../lib/supervisionSeeds';
import MonthlyRankingTop from './MonthlyRankingTop';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import ReadOnlyPlantaView from './ReadOnlyPlantaView';
import TasksSummaryWidget from './TasksSummaryWidget';
import OrdersSummary from './OrdersSummary';
import ConsolidatedEncargadoView from './ConsolidatedEncargadoView';

interface EncargadoDashboardProps {
  selectedBranchId: string;
  branches: Branch[];
  onBranchChange?: (id: string) => void;
  onNavigateToTab?: (tabId: string) => void;
  currentUser?: any;
  isReadOnly?: boolean;
}

// Normaliza un nombre/rol de puesto a un identificador genérico, para cruzar
// el presupuesto (nombres como "MOZOS") con las horas reales (roles como "mozos").
function normalizeRole(value: string): string {
  const n = (value || '').toLowerCase().trim();
  if (n.includes('encargado')) return 'encargado';
  if (n.includes('lider de cocina') || n.includes('líder de cocina') || n.includes('jefe de cocina') || n.includes('jefe cocina') || n.includes('jefe_cocina')) return 'jefe_cocina';
  if (n.includes('segundo')) return 'segundo_cocina';
  if (n.includes('cocinero') || n === 'cocina') return 'cocinero';
  if (n.includes('cajero') || n.includes('caja')) return 'caja';
  if (n.includes('barra') || n.includes('bartender')) return 'barra';
  if (n.includes('runner')) return 'runners';
  if (n.includes('bachero') || n.includes('bacha')) return 'bacha';
  if (n.includes('mozo')) return 'mozos';
  return n;
}

export default function EncargadoDashboardView({ 
  selectedBranchId, 
  branches, 
  onBranchChange,
  onNavigateToTab,
  currentUser
}: EncargadoDashboardProps) {
  const placesLib = useMapsLibrary('places');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [loading, setLoading] = useState(false);
  // Vista consolidada (una fila por sucursal con los 4 indicadores).
  const [consolidated, setConsolidated] = useState(false);
  // Solo pueden ver el consolidado: admin/dueño o quien tenga el permiso asignado.
  const canConsolidado = currentUser?.role === 'administrador' || currentUser?.role === 'dueño'
    || (Array.isArray(currentUser?.permissions) && currentUser.permissions.includes('encargado_consolidado'));

  // Core metrics state parsed or loaded dynamically
  const [salesNet, setSalesNet] = useState(0);
  const [salesGross, setSalesGross] = useState(0);
  const [salesOrdersCount, setSalesOrdersCount] = useState(0);
  const [salesLastDate, setSalesLastDate] = useState<string | null>(null);
  const [salesDaysCount, setSalesDaysCount] = useState(0);
  
  // CMV State (EI, EF, Purchases, Movements)
  const [cmvInitial, setCmvInitial] = useState(0);
  const [cmvFinal, setCmvFinal] = useState(0);
  const [cmvPurchases, setCmvPurchases] = useState(0);
  const [cmvMovements, setCmvMovements] = useState(0);
  // Hasta qué fecha están cargadas las líneas de compras/movimientos (period_end más reciente)
  const [cmvLastDate, setCmvLastDate] = useState<string | null>(null);

  // Deviations State
  const [wasteTotal, setWasteTotal] = useState(0);
  const [itemDeviations, setItemDeviations] = useState<any[]>([]);
  const [rawInventoryLogs, setRawInventoryLogs] = useState<any[]>([]);
  const [controlledItemIds, setControlledItemIds] = useState<string[]>([]);
  // Desvío de stock cargado a mano por administración (por sucursal y mes).
  // Se usa cuando el cálculo automático no puede reproducir la planilla.
  const [stockDeviationOverride, setStockDeviationOverride] = useState<{ id: string; value: number; note?: string } | null>(null);
  const [showDeviationModal, setShowDeviationModal] = useState(false);
  const [deviationInput, setDeviationInput] = useState('');
  const [deviationNote, setDeviationNote] = useState('');
  const [itemNamesById, setItemNamesById] = useState<Record<string, string>>({});
  // Venta teórica por semana e insumo, calculada desde el ranking (no depende de que esté
  // persistida en inventory_logs). weeklyVtByItem[week_number][item_id] = venta teórica.
  const [weeklyVtByItem, setWeeklyVtByItem] = useState<Record<number, Record<string, number>>>({});
  const [showDevDetail, setShowDevDetail] = useState(false);
  const [stockPrizeModal, setStockPrizeModal] = useState<any>(null); // detalle del premio de desvío (semana × insumo)

  // HR Hours State
  const [hourBudgetRows, setHourBudgetRows] = useState<any[]>([]);
  // Ajustes manuales de premio (excepciones cargadas por administración)
  const [prizeAdjustments, setPrizeAdjustments] = useState<Record<string, { id: string; amount: number; reason: string; created_by?: string }>>({});
  const [weeklyHoursLogs, setWeeklyHoursLogs] = useState<Record<string, any[]>>({});
  // Semanas (1-4) cuyas horas ya fueron validadas/guardadas por RRHH (tabla hr_hour_logs)
  const [rrhhValidatedWeeks, setRrhhValidatedWeeks] = useState<number[]>([]);
  
  // Reputación State
  const [googleRating, setGoogleRating] = useState(0);
  const [googleRatingCount, setGoogleRatingCount] = useState(0);
  const [pedidosYaRestoRating, setPedidosYaRestoRating] = useState(0);
  const [pedidosYaCafeRating, setPedidosYaCafeRating] = useState(0);

  // Supervision Flags State
  const [supervisionFlags, setSupervisionFlags] = useState({ red: 0, yellow: 0, green: 0 });
  const [supervisionResponses, setSupervisionResponses] = useState<any[]>([]);
  // Evaluaciones de Dueños del mes: sus "No cumple" son banderas negras.
  const [duenosResponses, setDuenosResponses] = useState<any[]>([]);
  // Banderas negras del mes (comentarios negativos de clientes), agrupadas por rol.
  // A diferencia de las rojas, que salen de las supervisiones, estas se cargan a
  // mano en Administración de Premios y viven en performance_reports.
  const [blackFlagsByRole, setBlackFlagsByRole] = useState<Record<string, any[]>>({});

  // Performance / Prizes configs
  const [performanceConfigs, setPerformanceConfigs] = useState<any[]>([]);
  
  // Overrides for simulation/preview/manual typing parameters
  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [manualSalesOverride, setManualSalesOverride] = useState('');
  const [manualCmvOverride, setManualCmvOverride] = useState('');
  const [manualGoogleOverride, setManualGoogleOverride] = useState('');
  const [manualPyRestoOverride, setManualPyRestoOverride] = useState('');
  const [manualPyCafeOverride, setManualPyCafeOverride] = useState('');
  const [manualRedFlagsOverride, setManualRedFlagsOverride] = useState('');

  const activeBranch = useMemo(() => {
    return branches.find(b => b.id === selectedBranchId) || branches[0];
  }, [branches, selectedBranchId]);

  // El Centro de Producción / Almacén no vende: su desvío se mide sin venta teórica,
  // con la EF teórica que sale de los movimientos (producción, envíos, consumo, etc.).
  const isAlmacenBranch = selectedBranchId === 'n4ncoary3' || /almac/i.test(activeBranch?.name || '');

  // Handle Month changes
  const adjustMonth = (offset: number) => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const date = new Date(parseInt(yearStr), parseInt(monthStr) - 1 + offset, 1);
    setSelectedMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };

  // 1. Fetch sales from Supabase
  const fetchSalesData = async (branchId: string, month: string) => {
    try {
      // Paginate to get all tickets (Supabase default limit = 1000, we have 16k+)
      let allData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('sales_tickets')
          .select('net_sales, gross_sales, orders, covers, date')
          .eq('month', month)
          .order('id', { ascending: true })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (branchId !== 'all') {
          query = query.eq('branch_id', branchId);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          hasMore = data.length === pageSize;
          page++;
        } else {
          hasMore = false;
        }
        if (page > 50) break; // safety
      }

      if (allData.length > 0) {
        setSalesNet(allData.reduce((s, i) => s + (Number(i.net_sales) || 0), 0));
        setSalesGross(allData.reduce((s, i) => s + (Number(i.gross_sales) || 0), 0));
        setSalesOrdersCount(allData.reduce((s, i) => s + (Number(i.orders) || 0), 0));
        // Última fecha con datos cargados (la mayor entre todos los tickets del mes)
        let last: string | null = null;
        const diasSet = new Set<string>();
        allData.forEach(i => {
          if (i.date) {
            const ds = String(i.date);
            if (!last || ds > last) last = ds;
            diasSet.add(ds.substring(0, 10)); // día único
          }
        });
        setSalesLastDate(last);
        setSalesDaysCount(diasSet.size);
      } else {
        setSalesNet(0);
        setSalesGross(0);
        setSalesOrdersCount(0);
        setSalesLastDate(null);
        setSalesDaysCount(0);
      }
    } catch (err) {
      console.error('Error fetching sales data:', err);
      setSalesNet(0);
      setSalesGross(0);
      setSalesOrdersCount(0);
    }
  };

  // 2. Fetch CMV desde Supabase
  const fetchCmvData = async (branchId: string, month: string) => {
    try {
      const { data, error } = await supabase
        .from('cmv_monthly')
        .select('*')
        .eq('branch_id', branchId)
        .eq('month', month)
        .maybeSingle();

      // La existencia inicial/final vive en el resumen cmv_monthly
      if (!error && data) {
        setCmvInitial(data.initial_existence || 0);
        setCmvFinal(data.final_existence || 0);
      } else {
        setCmvInitial(0);
        setCmvFinal(0);
      }

      // Compras y movimientos: se suman de las LÍNEAS reales (cmv_details), no del resumen
      // (el resumen total_purchases/total_movements puede quedar en 0 aunque haya líneas cargadas).
      // Además, de ahí sale hasta qué fecha están cargados (period_end más reciente).
      const { data: det } = await supabase
        .from('cmv_details')
        .select('type, amount, period_end')
        .eq('branch_id', branchId)
        .eq('month', month);
      let purchases = 0, movements = 0;
      let last: string | null = null;
      (det || []).forEach((r: any) => {
        if (r.type === 'purchase') purchases += Number(r.amount) || 0;
        if (r.type === 'movement') movements += Number(r.amount) || 0;
        if (r.period_end && (!last || String(r.period_end) > last)) last = String(r.period_end);
      });
      setCmvPurchases(purchases);
      setCmvMovements(movements);
      setCmvLastDate(last);
    } catch (err) {
      console.error('Error loading CMV from Supabase:', err);
    }
  };

  // 3. Fetch Deviations (inventory logs)
  const fetchDeviations = async (branchId: string, month: string) => {
    try {
      const [iy, im] = month.split('-').map(Number);
      const iLastDay = new Date(iy, im, 0).getDate();

      // Insumos que se controlan este mes en esta sucursal (misma lista que usa la planilla).
      // El dashboard debe medir el desvío SOLO sobre estos, no sobre todos los inventory_logs.
      try {
        const { data: mc } = await supabase
          .from('monthly_controlled_items')
          .select('item_ids')
          .match({ branch_id: branchId, month })
          .maybeSingle();
        setControlledItemIds((mc?.item_ids as string[]) || []);
      } catch { setControlledItemIds([]); }

      // Para junio 2026 la semana 4 se cierra a principios de julio, así que traemos
      // también esos días (si no, faltan las ventas teóricas del cierre de semana).
      const desde = `${month}-01`;
      const hasta = month === '2026-06'
        ? '2026-07-05'
        : `${month}-${String(iLastDay).padStart(2, '0')}`;

      const { data, error } = await supabase
        .from('inventory_logs')
        .select('*')
        .match({ branch_id: branchId })
        .gte('date', desde)
        .lte('date', hasta);

      if (!error && data && data.length > 0) {
        const totalW = data.reduce((sum, item) => sum + (Number(item.decomisos) || 0), 0);
        setWasteTotal(totalW);
        setRawInventoryLogs(data); // todos los logs del mes, para el cálculo oficial del desvío
        // Nombres de insumos (para el detalle del desvío)
        try {
          const { data: sitems } = await supabase.from('stock_items').select('id, name');
          const nm: Record<string, string> = {};
          (sitems || []).forEach((s: any) => { if (s.id) nm[s.id] = s.name; });
          setItemNamesById(nm);
        } catch { /* opcional */ }

        // Match items with higher deviations (theoretical vs real physical diffs) — solo para mostrar
        const sortedItems = [...data]
          .map(d => ({
            name: d.item_id, // raw code or name
            date: d.date,
            deviation: (d.ei || 0) + (d.compras || 0) - (d.decomisos || 0) - (d.ventas_teorico || 0)
          }))
          .filter(d => Math.abs(d.deviation) > 0.1)
          .slice(0, 4);
        
        setItemDeviations(sortedItems);

        // Venta teórica por SEMANA e INSUMO, calculada desde el ranking del POS (igual que
        // Control de Stock). No depende de que esté guardada en inventory_logs, así el premio
        // de desvío nunca se queda sin una semana por falta de sincronización.
        try {
          const [{ data: ranking }, { data: prods }, { data: recs }, { data: aliases }] = await Promise.all([
            supabase.from('product_rankings').select('product_code, product_name, quantity, week_number').eq('branch_id', branchId).eq('month', month),
            supabase.from('products').select('id, name, code'),
            supabase.from('recipes').select('product_id, item_id, quantity'),
            supabase.from('product_ranking_aliases').select('alias_name, product_id, ignore'),
          ]);
          const norm = (s: any) => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
          const normCode = (c: any) => String(c ?? '').trim();
          const idByName: Record<string, string> = {}; const idByCode: Record<string, string> = {};
          (prods || []).forEach((p: any) => { if (p.name) idByName[norm(p.name)] = p.id; if (normCode(p.code) !== '') idByCode[normCode(p.code)] = p.id; });
          (aliases || []).forEach((a: any) => { if (a.alias_name && !a.ignore && a.product_id) idByName[norm(a.alias_name)] = a.product_id; });
          const recipeByProd: Record<string, Array<{ itemId: string; quantity: number }>> = {};
          (recs || []).forEach((r: any) => { if (!r.product_id || !r.item_id) return; (recipeByProd[r.product_id] = recipeByProd[r.product_id] || []).push({ itemId: r.item_id, quantity: Number(r.quantity) || 0 }); });
          const vtMap: Record<number, Record<string, number>> = {};
          (ranking || []).forEach((rk: any) => {
            const prodId = (normCode(rk.product_code) !== '' && idByCode[normCode(rk.product_code)]) || idByName[norm(rk.product_name)];
            const recipe = prodId ? recipeByProd[prodId] : null;
            if (!recipe) return;
            const wk = Number(rk.week_number) || 1;
            const sold = Number(rk.quantity) || 0;
            const wmap = (vtMap[wk] = vtMap[wk] || {});
            recipe.forEach(ing => { wmap[ing.itemId] = (wmap[ing.itemId] || 0) + sold * ing.quantity; });
          });
          setWeeklyVtByItem(vtMap);
        } catch (e) { console.warn('No se pudo calcular venta teórica por semana:', e); setWeeklyVtByItem({}); }
      } else {
        setRawInventoryLogs([]);
        setWeeklyVtByItem({});
        setWasteTotal(14850);
        setItemDeviations([
          { name: 'Carne Vacuno (Kg)', date: '2026-05-24', deviation: -3.5 },
          { name: 'Café Grano Tostado (Kg)', date: '2026-05-23', deviation: -1.2 },
          { name: 'Leche Entera (L)', date: '2026-05-24', deviation: 8.0 },
          { name: 'Cerveza Patagonia (L)', date: '2026-05-20', deviation: -2.4 },
        ]);
      }
    } catch (err) {
      console.error('Error loading stock deviations:', err);
    }
  };

  // 4. Fetch Budgets & Worked Hours
  const fetchHoursData = async (branchId: string, month: string) => {
    try {
      const branchKey = branchId === 'all' ? branches[0]?.id || branchId : branchId;

      // Cargar presupuesto de horas desde Supabase
      const { data: budgetData } = await supabase
        .from('hour_budgets')
        .select('*')
        .eq('branch_id', branchKey)
        .eq('month', month);

      if (budgetData && budgetData.length > 0) {
        setHourBudgetRows(budgetData.map((r: any) => ({
          positionId: r.position_id,
          positionName: r.position_name,
          week1: r.week1 || 0,
          week2: r.week2 || 0,
          week3: r.week3 || 0,
          week4: r.week4 || 0,
          week5: r.week5 || 0,
          hourlyRate: r.hourly_rate || 0
        })));
      } else {
        setHourBudgetRows([]);
      }

      // Cargar horas cargadas por el ENCARGADO (hour_logs = sin validar)
      const { data: hoursData } = await supabase
        .from('hour_logs')
        .select('*')
        .eq('branch_id', branchKey)
        .eq('month', month);

      const weeklyLogs: Record<string, any[]> = { w1: [], w2: [], w3: [], w4: [] };
      if (hoursData && hoursData.length > 0) {
        hoursData.forEach((r: any) => {
          const key = `w${r.week_number}`;
          if (weeklyLogs[key]) weeklyLogs[key].push(r);
        });
      }

      // Cargar horas VALIDADAS por RRHH (hr_hour_logs). La presencia de filas
      // para una semana indica que RRHH ya la guardó/validó. En ese caso,
      // esa semana completa se reemplaza por las horas de RRHH (hours_rrhh).
      const { data: rrhhData } = await supabase
        .from('hr_hour_logs')
        .select('week_number, position_id, position_name, hours_rrhh')
        .eq('branch_id', branchKey)
        .eq('month', month);

      const validatedWeeks: number[] = [];
      if (rrhhData && rrhhData.length > 0) {
        // Agrupar las filas de RRHH por semana
        const rrhhByWeek: Record<number, any[]> = {};
        rrhhData.forEach((r: any) => {
          const w = Number(r.week_number);
          if (!rrhhByWeek[w]) rrhhByWeek[w] = [];
          rrhhByWeek[w].push(r);
        });
        // Para cada semana con datos de RRHH: marcarla como validada y
        // reemplazar esa semana en weeklyLogs con el formato que espera el dashboard.
        for (let w = 1; w <= 4; w++) {
          if (rrhhByWeek[w] && rrhhByWeek[w].length > 0) {
            validatedWeeks.push(w);
            weeklyLogs[`w${w}`] = rrhhByWeek[w].map((r: any) => ({
              week_number: w,
              position: r.position_name,
              position_id: r.position_id,
              hours_actual: Number(r.hours_rrhh) || 0, // el dashboard suma hours_actual
            }));
          }
        }
      }

      setWeeklyHoursLogs(weeklyLogs);
      setRrhhValidatedWeeks(validatedWeeks.sort((a, b) => a - b));

    } catch (err) {
      console.error('Error fetching hours from Supabase:', err);
    }
  };

  // 5. Fetch Ratings & Supervision flags in Supabase
  const fetchRatingsAndSupervision = async (branchId: string, month: string) => {
    try {
      // Pedidos Ya Double Channel ratings
      const pyKey = `craft_pedidos_ya_ratings_v2_${month}`;
      const pySaved = localStorage.getItem(pyKey);
      let pyResto = 0;
      let pyCafe = 0;
      
      if (pySaved) {
        try {
          const parsed = JSON.parse(pySaved);
          if (parsed[branchId]) {
            pyResto = parsed[branchId].restoRating ?? 0;
            pyCafe = parsed[branchId].cafeRating ?? 0;
          }
        } catch(e) {}
      } else {
        // Query database `pedidos_ya_ratings` table - real schema: branch_id, channel, week_number, rating
        const { data: dbData } = await supabase
          .from('pedidos_ya_ratings')
          .select('channel, week_number, rating')
          .eq('month', month)
          .eq('branch_id', branchId);
          
        if (dbData && dbData.length > 0) {
          const restoRows = dbData.filter(r => r.channel === 'resto' && r.rating !== null);
          const cafeRows = dbData.filter(r => r.channel === 'cafe' && r.rating !== null);
          if (restoRows.length > 0) {
            pyResto = Math.round((restoRows.reduce((s: number, r: any) => s + Number(r.rating), 0) / restoRows.length) * 10) / 10;
          }
          if (cafeRows.length > 0) {
            pyCafe = Math.round((cafeRows.reduce((s: number, r: any) => s + Number(r.rating), 0) / cafeRows.length) * 10) / 10;
          }
        }
      }
      setPedidosYaRestoRating(pyResto);
      setPedidosYaCafeRating(pyCafe);

      // Google rating from active branch config
      if (activeBranch) {
        setGoogleRating(activeBranch.googleRating || 0);
        setGoogleRatingCount(activeBranch.googleRatingCount || 0);
      }

      // Supervision responses for Red/Yellow/Green flags
      try {
        const [sy, sm] = month.split('-').map(Number);
        const sLastDay = new Date(sy, sm, 0).getDate();
        const { data: responses, error: respError } = await supabase
          .from('supervision_responses')
          .select('*')
          .eq('branch_id', branchId)
          .gte('date', `${month}-01`)
          .lte('date', `${month}-${String(sLastDay).padStart(2, '0')}`);

        if (!respError && responses) {
          // Las supervisiones ANULADAS no cuentan para banderas ni premios
          const vigentes = responses.filter((r: any) => !r.annulled);
          setSupervisionResponses(vigentes);
          let redSum = 0, yellowSum = 0, greenSum = 0;
          vigentes.forEach(r => {
            const flagsObj = r.scores?.flags;
            if (flagsObj) {
              redSum += (flagsObj.red || 0);
              yellowSum += (flagsObj.yellow || 0);
              greenSum += (flagsObj.green || 0);
            }
          });
          setSupervisionFlags({ red: redSum, yellow: yellowSum, green: greenSum });
        } else {
          setSupervisionFlags({ red: 0, yellow: 0, green: 0 });
          setSupervisionResponses([]);
        }
      } catch (supErr) {
        // Tabla puede no existir todavía
        setSupervisionFlags({ red: 0, yellow: 0, green: 0 });
        setSupervisionResponses([]);
      }

      // Evaluación de Dueños: los "No cumple" cuentan como BANDERAS NEGRAS del mes,
      // imputadas al rol elegido en cada uno (encargado / cocina / ambos), igual que
      // las banderas rojas de las supervisiones.
      try {
        const [dy, dm] = month.split('-').map(Number);
        const dLastDay = new Date(dy, dm, 0).getDate();
        const { data: duenos } = await supabase
          .from('evaluacion_duenos_responses')
          .select('*')
          .eq('branch_id', branchId)
          .gte('date', `${month}-01`)
          .lte('date', `${month}-${String(dLastDay).padStart(2, '0')}`);
        setDuenosResponses(duenos || []);
      } catch {
        setDuenosResponses([]);
      }

    } catch (err) {
      console.error('Error fetching reputations & supervision responses:', err);
    }
  };

  // 6. Fetch performance rules
  const fetchPerformanceConfigs = async (branchId: string, month: string) => {
    try {
      const { data, error } = await supabase
        .from('performance_role_configs')
        .select('*')
        .eq('branch_id', branchId)
        .eq('month', month);

      if (!error && data) {
        setPerformanceConfigs(data);
      } else {
        setPerformanceConfigs([]);
      }
    } catch (err) {
      console.error('Error fetching performance configs:', err);
    }
  };

  // 6b. Banderas negras del mes, por rol (se cargan en Administración de Premios)
  const fetchBlackFlags = async (branchId: string, month: string) => {
    try {
      const { data, error } = await supabase
        .from('performance_reports')
        .select('role, black_flags')
        .eq('branch_id', branchId)
        .eq('month', month);

      if (error || !data) {
        setBlackFlagsByRole({});
        return;
      }

      const byRole: Record<string, any[]> = {};
      data.forEach((r: any) => {
        byRole[r.role] = Array.isArray(r.black_flags) ? r.black_flags : [];
      });
      setBlackFlagsByRole(byRole);
    } catch (err) {
      // La columna puede no existir todavía si la base no fue migrada
      console.error('Error fetching black flags:', err);
      setBlackFlagsByRole({});
    }
  };

  const loadAllData = async () => {
    if (!selectedBranchId) return;
    setLoading(true);
    const branchKey = selectedBranchId === 'all' ? 'bn' : selectedBranchId;
    await Promise.all([
      fetchSalesData(selectedBranchId, selectedMonth),  // pass 'all' or real branch ID
      fetchDeviations(branchKey, selectedMonth),
      fetchRatingsAndSupervision(branchKey, selectedMonth),
      fetchPerformanceConfigs(branchKey, selectedMonth),
      fetchBlackFlags(branchKey, selectedMonth),
      fetchCmvData(branchKey, selectedMonth),
      fetchHoursData(branchKey, selectedMonth)
    ]);
    setLoading(false);
  };

  useEffect(() => {
    loadAllData();
  }, [selectedBranchId, selectedMonth, activeBranch]);

  useEffect(() => {
    if (!activeBranch || !activeBranch.googlePlaceId || !placesLib) {
      if (activeBranch) {
        setGoogleRating(activeBranch.googleRating || 0);
        // Also ensure fallback count is set
        setGoogleRatingCount(activeBranch.googleRatingCount || 0);
      }
      return;
    }

    const fetchLiveGoogleData = async () => {
      try {
        const place = new placesLib.Place({ id: activeBranch.googlePlaceId });
        await place.fetchFields({
          fields: ['rating', 'userRatingCount']
        });

        if (place.rating !== undefined && place.rating !== null) {
          setGoogleRating(place.rating);
          // Also automatically propagate/save so other views are synced
          supabase
            .from('branches')
            .update({
              google_rating: place.rating,
              google_rating_count: place.userRatingCount || activeBranch.googleRatingCount
            })
            .eq('id', activeBranch.id)
            .then(({ error }) => {
              if (error) console.error("Error updates realtime branch stats in dashboard:", error);
            });
        }
        if (place.userRatingCount !== undefined && place.userRatingCount !== null) {
          setGoogleRatingCount(place.userRatingCount);
        }
      } catch (err) {
        console.warn("Real-time Places API failed in branch dashboard, rendering cached values:", err);
        setGoogleRating(activeBranch.googleRating || 0);
        setGoogleRatingCount(activeBranch.googleRatingCount || 0);
      }
    };

    fetchLiveGoogleData();
  }, [placesLib, activeBranch.googlePlaceId, activeBranch.id]);

  // COMBINED OPERATIVE COMPUTATIONS:
  // 1. CMV Final value
  const totalCMVAmount = useMemo(() => {
    return cmvInitial + cmvPurchases + cmvMovements - cmvFinal;
  }, [cmvInitial, cmvPurchases, cmvMovements, cmvFinal]);

  // Compras + Movimientos (dato crudo, siempre disponible)
  const comprasMovimientos = useMemo(() => cmvPurchases + cmvMovements, [cmvPurchases, cmvMovements]);
  // ¿Están cargadas las existencias? Si EI y EF son ambas 0, no se puede cerrar el CMV.
  const existenciasCargadas = useMemo(() => cmvInitial !== 0 || cmvFinal !== 0, [cmvInitial, cmvFinal]);
  // % de Compras + Mov. sobre ventas (referencia mientras no haya existencias)
  const comprasMovPercentage = useMemo(() => {
    const net = isSimulationMode && manualSalesOverride ? parseFloat(manualSalesOverride) : salesNet;
    if (net <= 0) return null;
    return (comprasMovimientos / net) * 100;
  }, [comprasMovimientos, salesNet, isSimulationMode, manualSalesOverride]);

  const cmvPercentage = useMemo(() => {
    const net = isSimulationMode && manualSalesOverride ? parseFloat(manualSalesOverride) : salesNet;
    if (net <= 0) return 30.2;
    return (totalCMVAmount / net) * 100;
  }, [totalCMVAmount, salesNet, isSimulationMode, manualSalesOverride]);

  // 2. HR Hours calculations
  const positionHoursBreakdown = useMemo(() => {
    const countedRoles = new Set<string>(); // para no duplicar el consumo entre filas del mismo rol (mañana/tarde)
    return hourBudgetRows.map(row => {
      const positionId = row.roleId || row.positionId;
      const positionName = row.roleLabel || row.positionName;

      // calculate budget for the month
      let budgetedHours = (row.week1 || 0) + (row.week2 || 0) + (row.week3 || 0) + (row.week4 || 0) + (row.week5 || 0);
      
      // If zero (e.g., from V2 budget structure), compute dynamic calendar budget
      if (budgetedHours === 0) {
        try {
          const [yearStr, monthStr] = selectedMonth.split('-');
          const year = parseInt(yearStr) || 2026;
          const month = (parseInt(monthStr) || 6) - 1; // 0-indexed
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          
          for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            let headcount = 0;
            if (row.staffByDate && row.staffByDate[dateStr] !== undefined) {
              headcount = row.staffByDate[dateStr];
            } else {
              const dayOfWeek = new Date(year, month, d).getDay();
              const dayName = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][dayOfWeek];
              const isWeekend = ['Viernes', 'Sábado'].includes(dayName);
              headcount = isWeekend ? (row.countGroupB ?? row.countGroupA ?? 0) : (row.countGroupA ?? 0);
            }
            budgetedHours += headcount * (row.hoursPerDay || 8);
          }
        } catch (e) {
          console.error("Error calculating V2 dynamic hours budget for dashboard:", e);
        }
      }

      // calculate actually worked hours from w1-w4 (hour_logs: hours_actual)
      const targetRole = normalizeRole(positionName || positionId || '');
      let actualHours = 0;
      // El consumo es por rol; si ya lo contamos en una fila previa (otro turno del mismo puesto), no duplicar
      if (!countedRoles.has(targetRole)) {
        for (let w = 1; w <= 4; w++) {
          const weekEntries = weeklyHoursLogs[`w${w}`] || [];
          weekEntries.forEach((ent: any) => {
            const entRole = normalizeRole(ent.position || ent.position_id || ent.positionName || ent.positionId || '');
            if (entRole === targetRole) {
              actualHours += Number(ent.hours_actual ?? ent.definitiveHours ?? ent.hours ?? 0);
            }
          });
        }
        countedRoles.add(targetRole);
      }

      // No mock data - show real 0 if no hours loaded


      const remainingHours = budgetedHours - actualHours;
      const pct = budgetedHours > 0 ? (actualHours / budgetedHours) * 100 : 0;

      return {
        positionId,
        positionName,
        budgeted: budgetedHours,
        worked: actualHours,
        remaining: remainingHours,
        percent: pct
      };
    });
  }, [hourBudgetRows, weeklyHoursLogs, selectedMonth]);

  // Agrupar por puesto (unifica turnos mañana/tarde en una sola fila) y redondear
  const positionHoursGrouped = useMemo(() => {
    const map: Record<string, { positionName: string; budgeted: number; worked: number }> = {};
    positionHoursBreakdown.forEach(item => {
      const role = normalizeRole(item.positionName || item.positionId || '');
      if (!map[role]) {
        map[role] = { positionName: item.positionName, budgeted: 0, worked: 0 };
      }
      map[role].budgeted += item.budgeted;
      map[role].worked += item.worked; // worked ya viene sin duplicar (solo 1 fila del rol lo trae)
    });
    return Object.values(map).map(r => {
      const budgeted = Math.round(r.budgeted * 10) / 10;
      const worked = Math.round(r.worked * 10) / 10;
      return {
        positionName: r.positionName,
        budgeted,
        worked,
        remaining: Math.round((budgeted - worked) * 10) / 10,
        percent: budgeted > 0 ? (worked / budgeted) * 100 : 0
      };
    }).sort((a, b) => a.positionName.localeCompare(b.positionName));
  }, [positionHoursBreakdown]);

  // Factor de proyección lineal a fin de mes: díasDelMes / díasTranscurridos
  // Si el mes seleccionado ya pasó (o es futuro), no proyecta (factor 1 = usa lo real).
  const projectionFactor = useMemo(() => {
    const [yStr, mStr] = selectedMonth.split('-');
    const y = parseInt(yStr), m = parseInt(mStr);
    const daysInMonth = new Date(y, m, 0).getDate();
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === y && (today.getMonth() + 1) === m;
    if (!isCurrentMonth) return 1; // mes cerrado o futuro: no proyectar
    const dayOfMonth = today.getDate();
    if (dayOfMonth <= 0) return 1;
    return daysInMonth / dayOfMonth;
  }, [selectedMonth]);

  const isProjecting = projectionFactor > 1.0001;

  const positionHoursProjected = useMemo(() => {
    return positionHoursGrouped.map(item => {
      const projected = Math.round(item.worked * projectionFactor);
      return {
        ...item,
        projected,
        projectedOver: projected > item.budgeted,
        projectedRemaining: Math.round((item.budgeted - projected) * 10) / 10
      };
    });
  }, [positionHoursGrouped, projectionFactor]);

  const totalHourBudget = useMemo(() => {
    return Math.round(positionHoursBreakdown.reduce((sum, item) => sum + item.budgeted, 0) * 10) / 10;
  }, [positionHoursBreakdown]);

  const totalHourWorked = useMemo(() => {
    return Math.round(positionHoursBreakdown.reduce((sum, item) => sum + item.worked, 0) * 10) / 10;
  }, [positionHoursBreakdown]);

  const totalHourRemaining = useMemo(() => {
    return Math.round((totalHourBudget - totalHourWorked) * 10) / 10;
  }, [totalHourBudget, totalHourWorked]);

  const hourDeviationPercentage = useMemo(() => {
    if (totalHourBudget <= 0) return 0;
    const dev = totalHourWorked - totalHourBudget;
    return (dev / totalHourBudget) * 100;
  }, [totalHourBudget, totalHourWorked]);


  // LIVE VALUES READY FOR VARIABLES IN BONUS
  const liveNetSales = isSimulationMode && manualSalesOverride ? parseFloat(manualSalesOverride) : salesNet;

  // Proyección de ventas netas a fin de mes: venta cargada / días con ventas × días del mes
  const projectedNetSales = useMemo(() => {
    if (salesDaysCount <= 0) return 0;
    const [y, m] = selectedMonth.split('-').map(Number);
    const diasDelMes = new Date(y, m, 0).getDate(); // último día del mes
    return (liveNetSales / salesDaysCount) * diasDelMes;
  }, [liveNetSales, salesDaysCount, selectedMonth]);
  const liveCmvValue = isSimulationMode && manualCmvOverride ? parseFloat(manualCmvOverride) : cmvPercentage;
  const liveGoogleScore = isSimulationMode && manualGoogleOverride ? parseFloat(manualGoogleOverride) : googleRating;
  const livePyRestoScore = isSimulationMode && manualPyRestoOverride ? parseFloat(manualPyRestoOverride) : pedidosYaRestoRating;
  const livePyCafeScore = isSimulationMode && manualPyCafeOverride ? parseFloat(manualPyCafeOverride) : pedidosYaCafeRating;
  // Plantillas de supervisión (para resolver el texto de cada pregunta en el detalle de banderas)
  const [checklistTemplates, setChecklistTemplates] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('supervision_checklists').select('*');
        setChecklistTemplates((data && data.length > 0) ? data : SEEDED_TEMPLATES);
      } catch {
        setChecklistTemplates(SEEDED_TEMPLATES);
      }
    })();
  }, []);

  const questionTextById = useMemo(() => {
    const m: Record<string, string> = {};
    // Combinar plantillas de la base + semilla, para cubrir cualquier id de pregunta
    [...checklistTemplates, ...SEEDED_TEMPLATES].forEach((t: any) => {
      (t.questions || []).forEach((q: any) => { if (q?.id && q?.text && !m[q.id]) m[q.id] = q.text; });
    });
    return m;
  }, [checklistTemplates]);

  const [showFlagsModal, setShowFlagsModal] = useState(false);
  const liveRedFlags = isSimulationMode && manualRedFlagsOverride ? parseInt(manualRedFlagsOverride) : supervisionFlags.red;

  // Detalle de banderas rojas por responsable (encargado / cocina / ambos), con cuándo, por qué y quién
  const redFlagsDetail = useMemo(() => {
    const items: Array<{ date: string; supervisor: string; pregunta: string; target: string; template: string }> = [];
    let enc = 0, coc = 0;
    (supervisionResponses || []).forEach((r: any) => {
      const answers = r.scores?.answers || {};
      const supervisor = r.scores?.supervisor?.name || '—';
      const template = r.scores?.template_name || '—';
      Object.entries(answers).forEach(([qid, a]: any) => {
        if (a?.color !== 'red') return;
        const t = a?.target || 'ambos';
        if (t === 'encargado' || t === 'ambos') enc++;
        if (t === 'cocina' || t === 'ambos') coc++;
        items.push({
          date: r.date,
          supervisor,
          template,
          pregunta: a?.questionText || questionTextById[qid] || a?.text || 'Bandera roja',
          target: t
        });
      });
    });
    items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { encargado: enc, cocina: coc, items };
  }, [supervisionResponses, questionTextById]);

  // Banderas NEGRAS que llegan desde la Evaluación de Dueños: cada "No cumple" se
  // reparte por responsable igual que una bandera roja (encargado / cocina / ambos).
  const blackFlagsDuenosDetail = useMemo(() => {
    const items: Array<{ date: string; seccion: string; pregunta: string; target: string }> = [];
    let enc = 0, coc = 0;
    (duenosResponses || []).forEach((r: any) => {
      const answers = r.answers || {};
      Object.entries(answers).forEach(([, a]: any) => {
        if (a?.status !== 'no_cumple') return;
        const t = a?.target || 'ambos';
        if (t === 'encargado' || t === 'ambos') enc++;
        if (t === 'cocina' || t === 'ambos') coc++;
        items.push({ date: r.date, seccion: r.seccion, pregunta: a?.note || 'No cumple (Evaluación Dueños)', target: t });
      });
    });
    items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { encargado: enc, cocina: coc, items };
  }, [duenosResponses]);

  // Detalle de banderas negras: cada una ya viene con su fecha y su motivo cargados
  // a mano, asi que solo hay que aplanar los roles y ordenar por fecha.
  const blackFlagsDetail = useMemo(() => {
    const items: Array<{ date: string; reason: string; role: string; roleLabel: string }> = [];
    Object.keys(blackFlagsByRole).forEach((role) => {
      const flags = blackFlagsByRole[role] || [];
      const roleLabel = role === 'encargado' ? 'Encargado'
        : role === 'jefe_cocina' ? 'Jefe de Cocina'
        : role === 'segundo_cocina' ? 'Segundo de Cocina'
        : role;
      flags.forEach((f: any) => {
        items.push({
          date: f?.date || '—',
          reason: (f?.reason || '').trim() || 'Sin motivo cargado',
          role,
          roleLabel
        });
      });
    });
    items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return {
      encargado: (blackFlagsByRole['encargado'] || []).length,
      cocina: (blackFlagsByRole['jefe_cocina'] || []).length,
      total: items.length,
      items
    };
  }, [blackFlagsByRole]);

  // Desvío de stock para el premio (en % real), SEMANA A SEMANA.
  // 1) Por insumo y por semana (S1: días 1-7, S2: 8-14, S3: 15-21, S4: 22-fin), igual que
  //    la planilla de Control de Stock. Todos los datos de la semana viven en su primer día
  //    (1, 8, 15, 22); los decomisos vienen repartidos por día, así que se suman de la semana.
  //      cmvReal (semana) = EI + compras + prést.recib - prést.env - decomisos - consumo - EF
  //      desvío % (semana) = |cmvReal - ventas teóricas| / ventas teóricas * 100
  // 2) Desvío mensual del insumo = promedio de los % de sus semanas (con ventas teóricas > 0).
  // 3) Desvío del dashboard = promedio simple de los % mensuales de todos los insumos.
  // Desvío de stock MENSUAL, mismo criterio que Control de Stock (vista Mes):
  //  · El desvío del MES es la SUMA de los desvíos de las 4 semanas (cada semana se cuenta
  //    por separado, no encadenan). Por eso el CMV mensual usa la SUMA de las EI y de las EF
  //    semanales (no la EI de la semana 1 y la EF de la semana 4).
  //  · CMV real = ΣEI + compras + prést.recib − prést.env − decomisos − consumo − ΣEF.
  //    Desvío = CMV real − venta teórica.
  //  · EF real (mostrado) = EF de la última semana; EF teórica = EF real + desvío.
  //    Desvío % = desvío / EF teórica.
  //  · Desvío de la sucursal = promedio simple del |%| de cada insumo (un faltante y un
  //    sobrante no se compensan).
  const autoStockDeviationData = useMemo(() => {
    const empty = { value: 0, detail: [] as Array<{ id: string; name: string; ei: number; ef: number; efTeorica: number; desvio: number; pct: number }> };
    if (!rawInventoryLogs || rawInventoryLogs.length === 0) return empty;

    const dayOf = (d: any) => Number(String(d.date || '').substring(8, 10));
    const weekStarts = [1, 8, 15, 22];

    // Agrupar logs por insumo (respetando el filtro de insumos controlados si existe)
    const porItem: Record<string, any[]> = {};
    rawInventoryLogs.forEach((d: any) => {
      const id = d.item_id;
      if (!id) return;
      if (controlledItemIds.length > 0 && !controlledItemIds.includes(id)) return;
      if (!porItem[id]) porItem[id] = [];
      porItem[id].push(d);
    });

    const absPorInsumo: number[] = [];
    const detail: Array<{ id: string; name: string; ei: number; ef: number; efTeorica: number; desvio: number; pct: number }> = [];

    Object.entries(porItem).forEach(([itemId, itemLogs]) => {
      // Igual que Control de Stock (Mes): EI = día 01 (semana 1); EF = última semana cargada (22→01).
      const day1 = itemLogs.find((d: any) => dayOf(d) === 1);
      const ei = day1 ? Number(day1.ei) || 0 : 0;
      let ef = 0;
      for (let i = weekStarts.length - 1; i >= 0; i--) {
        const log = itemLogs.find((d: any) => dayOf(d) === weekStarts[i]);
        if (log && log.ef !== null && log.ef !== undefined) { ef = Number(log.ef) || 0; break; }
      }
      // Sumas del mes: compras/préstamos/consumo (viven en el primer día de cada semana) y
      // decomisos (repartidos por día) → se suma sobre TODOS los logs del insumo.
      let compras = 0, pRec = 0, pEnv = 0, consumo = 0, decomisos = 0, produccion = 0, recupero = 0, ventasPers = 0;
      itemLogs.forEach((d: any) => {
        compras += Number(d.compras) || 0;
        let pe = Number(d.prestamos_enviados) || 0, pr = Number(d.prestamos_recibidos) || 0;
        if (!pe && !pr && d.prestamos) { if (Number(d.prestamos) > 0) pr = Number(d.prestamos); else pe = Math.abs(Number(d.prestamos)); }
        pEnv += pe; pRec += pr;
        consumo += Number(d.consumo_personal) || 0;
        decomisos += Number(d.decomisos) || 0;
        produccion += Number(d.produccion) || 0;
        recupero += Number(d.recupero) || 0;
        ventasPers += Number(d.ventas_personal) || 0;
      });
      let efTeorica: number;
      if (isAlmacenBranch) {
        // Almacén: EF teórica = EI + compras + producción + devolución − envíos − consumo − recupero − ventas pers. − decomisos.
        efTeorica = ei + compras + produccion + pRec - pEnv - consumo - recupero - ventasPers - decomisos;
      } else {
        // Venta teórica del mes = suma por semana desde el ranking o la persistida.
        let vt = 0;
        weekStarts.forEach((ws, wi) => {
          const wNum = wi + 1;
          if (weeklyVtByItem[wNum] !== undefined) vt += weeklyVtByItem[wNum][itemId] || 0;
          else { const log = itemLogs.find((d: any) => dayOf(d) === ws); vt += log ? (Number(log.ventas_teorico) || 0) : 0; }
        });
        if (vt <= 0) return; // sin base teórica no se mide
        efTeorica = ei + compras + pRec - pEnv - vt - decomisos - consumo;
      }
      const desvio = ef - efTeorica; // EF Real − EF Teórica
      if (efTeorica === 0) return;
      const pct = (desvio / efTeorica) * 100;
      absPorInsumo.push(Math.abs(pct));
      detail.push({ id: itemId, name: itemNamesById[itemId] || itemId, ei, ef, efTeorica, desvio, pct });
    });

    if (absPorInsumo.length === 0) return empty;
    detail.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    return { value: absPorInsumo.reduce((s, p) => s + p, 0) / absPorInsumo.length, detail };
  }, [rawInventoryLogs, selectedMonth, controlledItemIds, itemNamesById, weeklyVtByItem, isAlmacenBranch]);

  const autoStockDeviation = autoStockDeviationData.value;

  // Desvío efectivo: si administración cargó un valor a mano para este mes/sucursal, se usa ese.
  const averageStockDeviation = stockDeviationOverride ? stockDeviationOverride.value : autoStockDeviation;

  // ── Desvío SEMANA A SEMANA por insumo (para el premio celda por celda) ──
  // El premio de desvío de stock se gana por cada (semana × insumo) que quede bajo el objetivo,
  // así no se puede "acomodar" el número en la última semana. Cada celda vale
  //   (premio del tramo alcanzado) ÷ 4 semanas ÷ N insumos.
  const weeklyStockDetail = useMemo(() => {
    if (!rawInventoryLogs || rawInventoryLogs.length === 0) return { insumos: [] as Array<{ id: string; name: string; weeks: Array<{ pct: number; desvio: number; efTeorica: number; ef: number } | null> }>, N: 0 };
    const [yy, mm] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(yy, mm, 0).getDate();
    const dayOf = (d: any) => Number(String(d.date || '').substring(8, 10));
    const semanas: [number, number][] = [[1, 7], [8, 14], [15, 21], [22, lastDay]];
    const porItem: Record<string, any[]> = {};
    rawInventoryLogs.forEach((d: any) => {
      const id = d.item_id; if (!id) return;
      if (controlledItemIds.length > 0 && !controlledItemIds.includes(id)) return;
      (porItem[id] = porItem[id] || []).push(d);
    });
    const insumos: Array<{ id: string; name: string; weeks: Array<{ pct: number; desvio: number; efTeorica: number; ef: number } | null> }> = [];
    Object.entries(porItem).forEach(([itemId, logs]) => {
      const weeks = semanas.map(([ws, we], idx) => {
        const first = logs.find((d: any) => dayOf(d) === ws);
        if (!first) return null;
        const wNum = idx + 1;
        const eiw = Number(first.ei) || 0, efw = Number(first.ef) || 0, comprasw = Number(first.compras) || 0;
        const consw = Number(first.consumo_personal) || 0;
        let pEnv = Number(first.prestamos_enviados) || 0, pRec = Number(first.prestamos_recibidos) || 0;
        if (!pEnv && !pRec && first.prestamos) { if (Number(first.prestamos) > 0) pRec = Number(first.prestamos); else pEnv = Math.abs(Number(first.prestamos)); }
        let decw = 0; logs.forEach((d: any) => { const dd = dayOf(d); if (dd >= ws && dd <= we) decw += Number(d.decomisos) || 0; });
        let efTeorica: number;
        if (isAlmacenBranch) {
          // Almacén (no vende): EF teórica = EI + compras + producción + devolución − envíos
          //   − consumo − recupero − ventas pers. − decomisos.
          const prodw = Number(first.produccion) || 0, recupw = Number(first.recupero) || 0, vpersw = Number(first.ventas_personal) || 0;
          efTeorica = eiw + comprasw + prodw + pRec - pEnv - consw - recupw - vpersw - decw;
        } else {
          // Sucursal: venta teórica desde el ranking (si esa semana tiene ranking) o la persistida.
          const vtw = weeklyVtByItem[wNum] !== undefined ? (weeklyVtByItem[wNum][itemId] || 0) : (Number(first.ventas_teorico) || 0);
          if (vtw <= 0) return null; // sin base teórica esa semana
          efTeorica = eiw + comprasw + pRec - pEnv - vtw - decw - consw;
        }
        const desvio = efw - efTeorica; // EF Real − EF Teórica
        if (efTeorica === 0) return null;
        return { pct: (desvio / efTeorica) * 100, desvio, efTeorica, ef: efw };
      });
      if (weeks.some(w => w !== null)) insumos.push({ id: itemId, name: itemNamesById[itemId] || itemId, weeks });
    });
    insumos.sort((a, b) => a.name.localeCompare(b.name));
    return { insumos, N: insumos.length };
  }, [rawInventoryLogs, selectedMonth, controlledItemIds, itemNamesById, weeklyVtByItem, isAlmacenBranch]);

  // Calcula el premio de desvío celda por celda para una escala de tramos dada.
  const computeStockCellPrize = (tiers: any[], isLowerBetter: boolean) => {
    const { insumos, N } = weeklyStockDetail;
    if (!N || !tiers || tiers.length === 0) return { total: 0, cells: [] as any[], N, weeks: 4, perCellMax: 0 };
    const variable = { tiers, isLowerBetter: isLowerBetter !== false }; // desvío: menor es mejor
    const cells: any[] = [];
    let total = 0;
    insumos.forEach(ins => {
      ins.weeks.forEach((w, wi) => {
        if (!w) { cells.push({ insumoId: ins.id, insumo: ins.name, week: wi + 1, pct: null, amount: 0, tier: null }); return; }
        const tier = getAchievedTier(variable, Math.abs(w.pct));
        const amount = tier ? (Number(tier.prize) || 0) / 4 / N : 0;
        total += amount;
        cells.push({ insumoId: ins.id, insumo: ins.name, week: wi + 1, pct: w.pct, amount, tier });
      });
    });
    const topTier = [...tiers].sort((a, b) => (Number(b.prize) || 0) - (Number(a.prize) || 0))[0];
    return { total: Math.round(total), cells, N, weeks: 4, perCellMax: topTier ? (Number(topTier.prize) || 0) / 4 / N : 0 };
  };

  // Desvío de horas vs presupuesto (%)
  // REGLAS:
  //  1. Solo cuentan los EXCESOS (gastar de menos no es desvío; los ahorros no compensan excesos).
  //  2. Los puestos de ENCARGADO quedan EXCLUIDOS (tienen vía libre para hacer las horas que necesiten).
  //  3. Se mide puesto por puesto, AGRUPANDO las filas del mismo rol (un puesto puede tener
  //     varias filas: turno mañana y turno tarde). Si no se agrupa, el consumo queda en una fila
  //     y el presupuesto repartido en varias, y aparecen excesos falsos.
  const hoursDeviationPct = useMemo(() => {
    const esEncargado = (nombre: string) => String(nombre || '').toUpperCase().includes('ENCARGADO');

    // Agrupar presupuesto y consumo por rol normalizado
    const porRol: Record<string, { budgeted: number; worked: number; nombre: string }> = {};
    positionHoursBreakdown.forEach(p => {
      const key = normalizeRole(p.positionName || p.positionId || '');
      if (!porRol[key]) porRol[key] = { budgeted: 0, worked: 0, nombre: p.positionName || '' };
      porRol[key].budgeted += Number(p.budgeted) || 0;
      porRol[key].worked += Number(p.worked) || 0; // el consumo ya viene sin duplicar
    });

    let excesoTotal = 0;      // horas de más (solo de los puestos que se pasaron)
    let presupuestoBase = 0;  // presupuesto de los puestos que SÍ cuentan

    Object.values(porRol).forEach(r => {
      if (esEncargado(r.nombre)) return;   // el encargado no computa
      if (r.budgeted <= 0) return;         // sin presupuesto no hay desvío medible
      presupuestoBase += r.budgeted;
      const exceso = r.worked - r.budgeted;
      if (exceso > 0) excesoTotal += exceso; // los ahorros se ignoran
    });

    if (presupuestoBase === 0) return 0;
    return (excesoTotal / presupuestoBase) * 100;
  }, [positionHoursBreakdown]);

  // PRIZE CALCULATION LOGIC PERFECT FOR EXTRACTION
  const getAchievedTier = (variable: any, actualValue: number) => {
    if (!variable.tiers || variable.tiers.length === 0) return null;
    
    const sortedTiers = [...variable.tiers].sort((a, b) => 
      variable.isLowerBetter ? b.threshold - a.threshold : a.threshold - b.threshold
    );

    let bestTier: any = null;
    for (const tier of sortedTiers) {
      const isAchieved = variable.isLowerBetter 
        ? actualValue <= tier.threshold 
        : actualValue >= tier.threshold;
      
      if (isAchieved) {
        if (!bestTier || tier.prize > bestTier.prize) {
          bestTier = tier;
        }
      }
    }
    return bestTier;
  };

  // Pre-load default configurations for simulated preview if database table is blank
  const generatedFallbackConfigs = useMemo(() => {
    const branchKey = selectedBranchId === 'all' ? 'bn' : selectedBranchId;
    return [
      {
        id: 'cfg_encargado_fallback',
        branch_id: branchKey,
        month: selectedMonth,
        role: 'encargado',
        sales_goal: Math.round(4500000 * (branchKey === 'bn' ? 1.5 : 1.1)),
        red_flag_penalty: 15000,
        variables: [
          {
            id: 'v_cmv',
            name: 'CMV % (Costo mercadería)',
            unit: '%',
            isLowerBetter: true,
            tiers: [
              { threshold: 31.0, prize: 15000 },
              { threshold: 30.0, prize: 30000 },
              { threshold: 29.0, prize: 50000 },
            ]
          },
          {
            id: 'v_google',
            name: 'Google Maps Calificación',
            unit: '⭐',
            isLowerBetter: false,
            tiers: [
              { threshold: 4.6, prize: 10000 },
              { threshold: 4.8, prize: 20000 },
            ]
          },
          {
            id: 'v_py_resto',
            name: 'Pedidos Ya Restó Calificación',
            unit: '⭐',
            isLowerBetter: false,
            tiers: [
              { threshold: 4.5, prize: 10000 },
              { threshold: 4.7, prize: 20000 },
            ]
          }
        ]
      },
      {
        id: 'cfg_chef_fallback',
        branch_id: branchKey,
        month: selectedMonth,
        role: 'jefe_cocina',
        sales_goal: Math.round(4500000 * (branchKey === 'bn' ? 1.5 : 1.1)),
        red_flag_penalty: 15000,
        variables: [
          {
            id: 'v_cmv_chef',
            name: 'CMV Cocina %',
            unit: '%',
            isLowerBetter: true,
            tiers: [
              { threshold: 31.0, prize: 15000 },
              { threshold: 30.0, prize: 30000 },
              { threshold: 29.0, prize: 45000 },
            ]
          },
          {
            id: 'v_decomisos',
            name: 'Desvíos de Stock / Insumo',
            unit: 'Kg',
            isLowerBetter: true,
            tiers: [
              { threshold: 10.0, prize: 10000 },
              { threshold: 5.0, prize: 20000 },
            ]
          }
        ]
      }
    ];
  }, [selectedBranchId, selectedMonth]);

  const activeConfigs = useMemo(() => {    // Only use real configs from DB - never show generated/fake data to encargados
    return performanceConfigs;
  }, [performanceConfigs]);

  // Objetivos de ventas netas (escalones del encargado) para mostrar en la tarjeta de ventas
  const salesTargets = useMemo(() => {
    const cfg = activeConfigs.find((c: any) => c.role === 'encargado') || activeConfigs[0];
    if (!cfg) return [];
    const vars = cfg.variables || [];
    const ventasVar = vars.find((v: any) => String(v.name || '').toLowerCase().includes('venta'));
    if (!ventasVar || !ventasVar.tiers) return [];
    return ventasVar.tiers
      .map((t: any) => ({ threshold: Number(t.threshold) || 0, prize: Number(t.prize) || 0 }))
      .sort((a: any, b: any) => a.threshold - b.threshold);
  }, [activeConfigs]);

  // --- AJUSTES MANUALES DE PREMIO (excepciones: horas autorizadas, reemplazos, etc.) ---
  const esAdmin = String((currentUser as any)?.role || '').toLowerCase() === 'administrador';

  const cargarAjustes = async () => {
    if (!selectedBranchId || selectedBranchId === 'all') { setPrizeAdjustments({}); return; }
    const { data } = await supabase
      .from('performance_adjustments')
      .select('id, role, amount, reason, created_by')
      .eq('branch_id', selectedBranchId)
      .eq('month', selectedMonth);
    const map: Record<string, any> = {};
    (data || []).forEach((a: any) => { map[a.role] = { id: a.id, amount: Number(a.amount) || 0, reason: a.reason, created_by: a.created_by }; });
    setPrizeAdjustments(map);
  };
  useEffect(() => { cargarAjustes(); }, [selectedBranchId, selectedMonth]);

  // --- DESVÍO DE STOCK CARGADO A MANO (por sucursal y mes) ---
  const cargarDesvioManual = async () => {
    if (!selectedBranchId || selectedBranchId === 'all') { setStockDeviationOverride(null); return; }
    try {
      const { data } = await supabase
        .from('stock_deviation_overrides')
        .select('id, value, note')
        .eq('branch_id', selectedBranchId)
        .eq('month', selectedMonth)
        .maybeSingle();
      setStockDeviationOverride(data ? { id: data.id, value: Number(data.value) || 0, note: data.note } : null);
    } catch { setStockDeviationOverride(null); }
  };
  useEffect(() => { cargarDesvioManual(); }, [selectedBranchId, selectedMonth]);

  const guardarDesvioManual = async () => {
    if (!esAdmin) { alert('Solo la administración puede cargar el desvío.'); return; }
    if (!selectedBranchId || selectedBranchId === 'all') { alert('Elegí una sucursal concreta.'); return; }
    const val = parseFloat(String(deviationInput).replace(',', '.'));
    if (isNaN(val) || val < 0) { alert('Ingresá un desvío válido (ej. 1,32).'); return; }
    const id = `${selectedBranchId}-${selectedMonth}`;
    const { error } = await supabase.from('stock_deviation_overrides').upsert({
      id,
      branch_id: selectedBranchId,
      month: selectedMonth,
      value: val,
      note: deviationNote || null,
      created_by: (currentUser as any)?.name || 'admin',
      created_at: new Date().toISOString()
    }, { onConflict: 'branch_id,month' });
    if (error) { alert('Error al guardar: ' + error.message); return; }
    setShowDeviationModal(false);
    setDeviationNote('');
    await cargarDesvioManual();
  };

  const borrarDesvioManual = async () => {
    if (!esAdmin || !stockDeviationOverride) return;
    if (!window.confirm('¿Quitar el desvío cargado a mano y volver al cálculo automático?')) return;
    await supabase.from('stock_deviation_overrides').delete().eq('id', stockDeviationOverride.id);
    setShowDeviationModal(false);
    await cargarDesvioManual();
  };

  const guardarAjuste = async (role: string, roleLabel: string) => {
    if (!esAdmin) { alert('Solo la administración puede ajustar premios.'); return; }
    const actual = prizeAdjustments[role];
    const montoStr = window.prompt(
      `AJUSTE DE PREMIO · ${roleLabel}\n\n` +
      `Sucursal: ${activeBranch?.name || selectedBranchId} · Mes: ${selectedMonth}\n\n` +
      `Ingresá el monto del ajuste (positivo suma, negativo resta).\n` +
      `Ej: 45000 para devolver un descuento indebido.\n` +
      `Dejalo en 0 para eliminar el ajuste.`,
      actual ? String(actual.amount) : '0'
    );
    if (montoStr === null) return;
    const monto = parseFloat(String(montoStr).replace(/\./g, '').replace(',', '.'));
    if (isNaN(monto)) { alert('El monto no es válido.'); return; }

    if (monto === 0) {
      if (actual) {
        await supabase.from('performance_adjustments').delete().eq('id', actual.id);
        await cargarAjustes();
        alert('Ajuste eliminado.');
      }
      return;
    }

    const motivo = window.prompt(
      `Motivo del ajuste (obligatorio):\n\nEj: "Horas autorizadas por reemplazo del jefe de cocina en vacaciones"`,
      actual?.reason || ''
    );
    if (motivo === null) return;
    if (!motivo.trim()) { alert('Tenés que indicar un motivo.'); return; }

    const { error } = await supabase.from('performance_adjustments').upsert({
      branch_id: selectedBranchId,
      month: selectedMonth,
      role,
      amount: monto,
      reason: motivo.trim(),
      created_by: (currentUser as any)?.name || 'ADMIN'
    }, { onConflict: 'branch_id,month,role' });

    if (error) { alert('No se pudo guardar: ' + error.message); return; }
    await cargarAjustes();
    alert(`Ajuste guardado: ${monto >= 0 ? '+' : ''}$${monto.toLocaleString('es-AR')}`);
  };

  const calculatedPrizesBreakdown = useMemo(() => {
    const result: Record<string, any> = {};

    ['encargado', 'jefe_cocina', 'segundo_cocina'].forEach(role => {
      let salesGoal = 4500000;
      let redFlagPenalty = 15000;
      let blackFlagPenalty = 0;
      let variablesList: any[] = [];
      let isMatched = false;

      if (role === 'segundo_cocina') {
        // Derived from Jefe de Cocina
        const chefConfig = activeConfigs.find(c => c.role === 'jefe_cocina');
        if (chefConfig) {
          salesGoal = chefConfig.sales_goal || chefConfig.salesGoal || 1;
          redFlagPenalty = chefConfig.red_flag_penalty || chefConfig.redFlagPenalty || 0;
          blackFlagPenalty = chefConfig.black_flag_penalty || chefConfig.blackFlagPenalty || 0;
          variablesList = chefConfig.variables || [];
          isMatched = true;
        }
      } else {
        const cfg = activeConfigs.find(c => c.role === role);
        if (cfg) {
          salesGoal = cfg.sales_goal || cfg.salesGoal || 1;
          redFlagPenalty = cfg.red_flag_penalty || cfg.redFlagPenalty || 0;
          blackFlagPenalty = cfg.black_flag_penalty || cfg.blackFlagPenalty || 0;
          variablesList = cfg.variables || [];
          isMatched = true;
        }
      }

      // Calculate achievements
      const variablesStatus = variablesList.map(v => {
        let currentValue = 0;
        
        // Match actual metric according to variable identity or name
        const lowerName = v.name.toLowerCase();
        let isStockVar = false;
        if (lowerName.includes('cmv')) {
          currentValue = liveCmvValue;
        } else if (lowerName.includes('google')) {
          currentValue = liveGoogleScore;
        } else if (lowerName.includes('pedidos') && lowerName.includes('resto')) {
          currentValue = livePyRestoScore;
        } else if (lowerName.includes('pedidos') && lowerName.includes('caf')) {
          currentValue = livePyCafeScore;
        } else if (lowerName.includes('hora') || lowerName.includes('presup')) {
          // Desvío de horas vs presupuesto (en %)
          currentValue = hoursDeviationPct;
        } else if (lowerName.includes('desv') || lowerName.includes('desperdi') || lowerName.includes('insumo') || lowerName.includes('stock')) {
          // Desvío promedio de insumos controlados del mes (en %) — solo informativo.
          // El PREMIO se calcula celda por celda (semana × insumo), más abajo.
          currentValue = averageStockDeviation;
          isStockVar = true;
        } else if (lowerName.includes('venta')) {
          // Ventas Netas reales del mes (del módulo Ventas)
          currentValue = liveNetSales;
        } else {
          currentValue = 0;
        }

        const tier = getAchievedTier(v, currentValue);
        // Premio de desvío de stock: por cada (semana × insumo) bajo el objetivo, no sobre el promedio del mes
        const stockCellPrize = isStockVar ? computeStockCellPrize(v.tiers || [], v.isLowerBetter) : null;

        // Escala de objetivos ordenada (del más fácil al más exigente) para mostrarla al usuario
        const tiersOrdenados = (v.tiers || [])
          .map((t: any) => ({ threshold: Number(t.threshold) || 0, prize: Number(t.prize) || 0 }))
          .sort((a: any, b: any) => v.isLowerBetter ? b.threshold - a.threshold : a.threshold - b.threshold);

        // Próximo escalón que NO se alcanzó (el objetivo a perseguir)
        const proximo = tiersOrdenados.find((t: any) =>
          v.isLowerBetter ? currentValue > t.threshold : currentValue < t.threshold
        ) || null;

        // Cuánto falta para alcanzarlo
        const falta = proximo
          ? (v.isLowerBetter ? currentValue - proximo.threshold : proximo.threshold - currentValue)
          : 0;

        return {
          variableId: v.id,
          variableName: v.name,
          currentValue,
          unit: v.unit,
          achievedTier: isStockVar ? null : tier,
          prize: isStockVar ? (stockCellPrize?.total || 0) : (tier ? tier.prize : 0),
          isLowerBetter: !!v.isLowerBetter,
          tiersOrdenados,
          proximo: isStockVar ? null : proximo,
          falta,
          isStockVar,
          stockCellPrize,
          targetText: v.tiers ? v.tiers.map((t: any) => `${v.isLowerBetter ? '<=': '>='} ${t.threshold}${v.unit} ($${t.prize.toLocaleString()})`).join(' | ') : 'Sin escala'
        };
      });

      const rawPrizesTotal = variablesStatus.reduce((sum, v) => sum + v.prize, 0);

      // Banderas que le corresponden a ESTE rol según el responsable asignado:
      //  - Encargado: las suyas + las de "ambos"
      //  - Jefe de Cocina (y Segundo, que hereda del Jefe): las de cocina + las de "ambos"
      // En modo simulación con override manual, se respeta el valor ingresado a mano.
      let flagsDelRol: number;
      if (isSimulationMode && manualRedFlagsOverride) {
        flagsDelRol = parseInt(manualRedFlagsOverride) || 0;
      } else if (role === 'encargado') {
        flagsDelRol = redFlagsDetail.encargado;
      } else {
        flagsDelRol = redFlagsDetail.cocina; // jefe_cocina y segundo_cocina
      }

      // Banderas negras = las cargadas a mano en Administración de Premios (contra un
      // rol puntual) + las que genera la Evaluación de Dueños ("No cumple"), que se
      // reparten por responsable igual que las rojas: encargado / cocina / ambos.
      // (El modo simulación solo maneja las rojas.)
      const blackFlagsManual = (blackFlagsByRole[role] || []).length;
      const blackFlagsDuenos = role === 'encargado' ? blackFlagsDuenosDetail.encargado : blackFlagsDuenosDetail.cocina;
      const blackFlagsDelRol = blackFlagsManual + blackFlagsDuenos;

      const redPenaltyVal = flagsDelRol * redFlagPenalty;
      const blackPenaltyVal = blackFlagsDelRol * blackFlagPenalty;
      const totalPenaltyVal = redPenaltyVal + blackPenaltyVal;
      // El premio se gana según cada variable y su escala (incluida Ventas Netas como variable).
      // No hay bloqueo por una "meta de ventas" general.
      let finalCalculatedPrize = Math.max(0, rawPrizesTotal - totalPenaltyVal);

      if (role === 'segundo_cocina') {
        // Segundo de cocina obtiene 80% del Jefe de Cocina
        const chefRawTotal = result['jefe_cocina']?.rawPrizesTotal || 0;
        const chefPenalty = result['jefe_cocina']?.totalPenaltyVal || 0;
        const chefFinal = Math.max(0, chefRawTotal - chefPenalty);
        finalCalculatedPrize = Math.round(chefFinal * 0.8);
      }

      // Ajuste manual cargado por administración (excepciones)
      const ajuste = prizeAdjustments[role];
      const ajusteMonto = ajuste ? Number(ajuste.amount) || 0 : 0;
      finalCalculatedPrize = Math.max(0, finalCalculatedPrize + ajusteMonto);

      result[role] = {
        roleLabel: role === 'encargado' ? 'Premio Encargado' : role === 'jefe_cocina' ? 'Premio Jefe de Cocina' : 'Premio Segundo de Cocina (80%)',
        salesGoal,
        redFlagPenalty,
        blackFlagPenalty,
        totalPenaltyVal,
        redPenaltyVal,
        blackPenaltyVal,
        flagsDelRol,
        blackFlagsDelRol,
        blackFlagsManual,
        blackFlagsDuenos,
        rawPrizesTotal,
        finalCalculatedPrize,
        ajusteMonto,
        ajusteMotivo: ajuste?.reason || '',
        ajustePor: ajuste?.created_by || '',
        variablesStatus,
        isMatched
      };
    });

    return result;
  }, [activeConfigs, liveNetSales, liveCmvValue, liveGoogleScore, livePyRestoScore, livePyCafeScore, liveRedFlags, redFlagsDetail, blackFlagsByRole, blackFlagsDuenosDetail, averageStockDeviation, hoursDeviationPct, prizeAdjustments, isSimulationMode, manualRedFlagsOverride, weeklyStockDetail]);

  // ===== Cierre de mes =====
  // Los resultados de premios ya no se cargan a mano: salen de acá, que es donde se
  // calculan en vivo. Al cerrar se congela la foto en performance_reports y desde ese
  // momento Carga de Resultados solo lee (lo único editable ahí son las negras).
  // esAdmin ya está definido más arriba (se usa para los ajustes manuales de premio)
  const [cerrando, setCerrando] = useState(false);
  const [cierreInfo, setCierreInfo] = useState<{ closedAt: string; closedBy: string } | null>(null);
  const branchKeyCierre = selectedBranchId === 'all' ? '' : selectedBranchId;

  const mesLabelCierre = (m: string) => {
    const [y, mm] = m.split('-');
    const names = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${names[parseInt(mm) - 1]} ${y}`;
  };

  const fetchCierre = async (branchId: string, month: string) => {
    if (!branchId) { setCierreInfo(null); return; }
    try {
      const { data, error } = await supabase
        .from('performance_reports')
        .select('closed_at, closed_by')
        .eq('branch_id', branchId).eq('month', month)
        .not('closed_at', 'is', null)
        .limit(1);
      if (error || !data || data.length === 0) { setCierreInfo(null); return; }
      setCierreInfo({ closedAt: data[0].closed_at, closedBy: data[0].closed_by || '' });
    } catch {
      setCierreInfo(null);
    }
  };

  useEffect(() => { fetchCierre(branchKeyCierre, selectedMonth); }, [branchKeyCierre, selectedMonth]);

  const cerrarMes = async () => {
    if (!esAdmin) return;
    if (!branchKeyCierre) {
      alert('Elegí una sucursal concreta para cerrar el mes. El cierre se hace de a una sucursal por vez.');
      return;
    }
    if (isSimulationMode) {
      alert('Estás en modo simulación: los números en pantalla no son los reales.\n\nSalí de la simulación antes de cerrar el mes.');
      return;
    }

    const nombreSucursal = branches.find(b => b.id === branchKeyCierre)?.name || branchKeyCierre;
    const detalle = ['encargado', 'jefe_cocina', 'segundo_cocina'].map(r => {
      const bd = calculatedPrizesBreakdown[r];
      return `  - ${bd?.roleLabel || r}: $${(bd?.finalCalculatedPrize || 0).toLocaleString('es-AR')}`;
    }).join('\n');

    const msg =
      `Vas a cerrar ${mesLabelCierre(selectedMonth)} para ${nombreSucursal}.\n\n` +
      `Se congelan estos premios:\n${detalle}\n\n` +
      `Las banderas negras cargadas hasta ahora quedan incluidas en el cálculo.\n\n` +
      (cierreInfo
        ? `ATENCIÓN: este mes YA fue cerrado el ${new Date(cierreInfo.closedAt).toLocaleString('es-AR')}${cierreInfo.closedBy ? ` por ${cierreInfo.closedBy}` : ''}. Se REEMPLAZA por la foto actual.\n\n`
        : `Después del cierre, Carga de Resultados pasa a solo lectura para este mes.\n\n`) +
      `¿Confirmás?`;
    if (!window.confirm(msg)) return;

    setCerrando(true);
    try {
      const ahora = new Date().toISOString();
      const payloads = ['encargado', 'jefe_cocina', 'segundo_cocina'].map(role => {
        const bd = calculatedPrizesBreakdown[role];
        return {
          branch_id: branchKeyCierre,
          month: selectedMonth,
          role,
          results: (bd?.variablesStatus || []).map((v: any) => ({
            variableId: v.variableId,
            variableName: v.variableName,
            actualValue: v.currentValue,
            achievedPrize: v.prize,
            // Para el desvío de stock, guardamos el desglose por insumo × semana (así el PDF
            // muestra cómo se ganó el premio, que se paga celda por celda y no por el promedio).
            ...(v.isStockVar && v.stockCellPrize ? { stockCells: v.stockCellPrize.cells, stockN: v.stockCellPrize.N } : {}),
          })),
          actual_sales: liveNetSales,
          red_flags_count: bd?.flagsDelRol || 0,
          total_calculated_prize: bd?.finalCalculatedPrize || 0,
          // Guardamos SOLO las banderas negras manuales al cierre: es lo que compara el
          // aviso de "cambiaron después del cierre" en Administración (que mira la lista
          // manual). Las de Evaluación de Dueños ya quedan incluidas en total_calculated_prize.
          black_flags_at_close: bd?.blackFlagsManual || 0,
          closed_at: ahora,
          closed_by: currentUser?.name || '',
          // black_flags se OMITE a propósito: el upsert no toca las columnas que no
          // vienen en el payload, así el cierre nunca pisa las banderas documentadas.
        };
      });

      const { error } = await supabase
        .from('performance_reports')
        .upsert(payloads, { onConflict: 'branch_id,month,role' });

      if (error) {
        console.error('Error al cerrar el mes:', error);
        alert('ATENCIÓN: No se pudo cerrar el mes.\n\nDetalle: ' + (error.message || 'error desconocido') + '\n\nReintentá.');
        return;
      }

      await fetchCierre(branchKeyCierre, selectedMonth);
      alert(`Mes cerrado. Los resultados de ${nombreSucursal} para ${mesLabelCierre(selectedMonth)} quedaron congelados.`);
    } catch (err: any) {
      console.error('Error cerrando el mes:', err);
      alert('ATENCIÓN: Ocurrió un error al cerrar el mes. ' + (err?.message || '') + '\n\nReintentá.');
    } finally {
      setCerrando(false);
    }
  };

  if (consolidated && canConsolidado) {
    return (
      <ConsolidatedEncargadoView
        branches={branches}
        month={selectedMonth}
        onAdjustMonth={adjustMonth}
        onSelectBranch={(id) => { setConsolidated(false); onBranchChange?.(id); }}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-6 pb-20"
    >
      {/* Header Selector Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-sidebar p-6 rounded border border-border-dim shadow-xl">
        <div className="flex items-center gap-4">
          <div className="bg-brand-500/10 p-3 text-brand-500 border border-brand-500/20 rounded shadow-md">
            <BarChart4 size={24} />
          </div>
          <div>
            <span className="text-[9px] font-black tracking-[0.25em] text-brand-500 uppercase">Resumen Operacional</span>
            <h1 className="text-xl font-black text-text-main tracking-tight uppercase">Dashboard de Encargado</h1>
            <p className="text-[10px] text-text-dim uppercase font-semibold tracking-wider mt-0.5">Control de Variables Clave, Desvíos y Premios de Sucursal</p>
          </div>
        </div>

        {/* Date and Navigation Row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Branch Filter */}
          {onBranchChange && (
            <div className="relative">
              <select
                value={selectedBranchId}
                onChange={(e) => { if (e.target.value === '__CONSOLIDADO__') { if (canConsolidado) setConsolidated(true); } else onBranchChange(e.target.value); }}
                className="bg-bg-accent text-text-main text-[11px] font-bold border border-border-dim rounded-md px-3 py-2 outline-none focus:border-brand-500 appearance-none pr-8 cursor-pointer uppercase font-mono"
              >
                {canConsolidado && <option value="__CONSOLIDADO__">◆ Consolidado (todas)</option>}
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <div className="absolute top-1/2 right-3 -translate-y-1/2 pointer-events-none text-text-dim text-[10px]">▼</div>
            </div>
          )}

          {/* Month Adjuster */}
          <div className="flex items-center bg-bg-accent border border-border-dim rounded-md overflow-hidden">
            <button 
              onClick={() => adjustMonth(-1)}
              className="px-3 py-2 text-text-dim hover:text-text-main hover:bg-bg-sidebar/50 transition-all border-r border-border-dim cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-4 py-2 text-[11px] font-black text-text-main uppercase font-mono tracking-wider">
              {(() => {
                const [y, m] = selectedMonth.split('-');
                const names = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                return `${names[parseInt(m) - 1]} ${y}`;
              })()}
            </span>
            <button 
              onClick={() => adjustMonth(1)}
              className="px-3 py-2 text-text-dim hover:text-text-main hover:bg-bg-sidebar/50 transition-all border-l border-border-dim cursor-pointer"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <button
            onClick={loadAllData}
            className="p-2 border border-border-dim bg-bg-accent rounded-md hover:bg-bg-sidebar/50 text-text-dim hover:text-text-main transition-all"
            title="Sincronizar información"
          >
            <RefreshCw size={14} className={cn(loading && "animate-spin text-brand-500")} />
          </button>

          {/* Cierre de mes: congela los resultados de premios. Solo administración. */}
          {esAdmin && (
            <div className="flex items-center gap-2">
              <button
                onClick={cerrarMes}
                disabled={cerrando}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[10px] font-black uppercase tracking-widest transition-all border disabled:opacity-50 cursor-pointer",
                  cierreInfo
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500 hover:text-white"
                    : "bg-brand-500/10 border-brand-500/30 text-brand-500 hover:bg-brand-500 hover:text-white"
                )}
                title={cierreInfo
                  ? 'El mes ya está cerrado. Volver a cerrarlo reemplaza la foto congelada por la actual.'
                  : 'Congelar los resultados de este mes. Después, Carga de Resultados solo lee.'}
              >
                {cerrando ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                {cierreInfo ? 'Mes Cerrado' : 'Cerrar Mes'}
              </button>
              {cierreInfo && (
                <span className="text-[8px] font-bold uppercase tracking-wider text-text-dim leading-tight">
                  {new Date(cierreInfo.closedAt).toLocaleDateString('es-AR')}
                  {cierreInfo.closedBy && <><br />por {cierreInfo.closedBy}</>}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Widget resumen de Tareas del día */}
      {currentUser && (
        <TasksSummaryWidget
          branches={branches}
          currentUser={{ ...currentUser, branchId: selectedBranchId !== 'all' ? selectedBranchId : currentUser.branchId }}
          onOpenTasks={onNavigateToTab ? () => onNavigateToTab('tareas') : undefined}
        />
      )}

      {/* Alerta: hasta qué día está cargada la información de Ventas */}
      {salesLastDate && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-start gap-3">
          <Clock size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="text-[10px] leading-relaxed">
            <span className="font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Información de Ventas cargada hasta el día {salesLastDate.split('-').reverse().join('/')}
            </span>
          </div>
        </div>
      )}

      {/* Primary Financial & Operation Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Sales Net Column */}
        <div className="bg-bg-sidebar border border-border-dim p-5 rounded relative overflow-hidden group hover:border-brand-500/40 transition-all shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] font-black uppercase tracking-wider text-text-dim">Ventas Netas</span>
            <DollarSign size={14} className="text-brand-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <h2 className="text-2xl font-mono font-black text-text-main">
              ${liveNetSales.toLocaleString()}
            </h2>
          </div>
          <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-border-dim/40 text-[9px] text-text-dim font-bold font-mono">
            <span>BRUTAS (TICKETS):</span>
            <span className="text-text-main">${salesGross.toLocaleString()}</span>
          </div>
          {!isSimulationMode && projectedNetSales > 0 && salesDaysCount > 0 && (
            <div className="flex justify-between items-center mt-1.5 text-[9px] font-bold font-mono">
              <span className="text-emerald-600 uppercase">Proyección neta:</span>
              <span className="text-emerald-600">${Math.round(projectedNetSales).toLocaleString()}</span>
            </div>
          )}
          {!isSimulationMode && salesDaysCount > 0 && (
            <p className="text-[7px] font-bold uppercase text-text-dim opacity-70 mt-1 leading-tight">
              {salesDaysCount} día{salesDaysCount !== 1 ? 's' : ''} cargado{salesDaysCount !== 1 ? 's' : ''} · proyectado a fin de mes
            </p>
          )}

          {/* Objetivos de ventas: el encargado ve si la PROYECCIÓN alcanza cada escalón */}
          {!isSimulationMode && salesTargets.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-border-dim/40">
              <p className="text-[7px] font-black uppercase tracking-widest text-text-dim mb-1.5">Objetivos de venta (vs proyección)</p>
              <div className="space-y-1">
                {salesTargets.map((t: any, i: number) => {
                  const fmt = (n: number) => n >= 1000000 ? `$${(n / 1000000).toFixed(1)}M` : `$${(n / 1000).toFixed(0)}k`;
                  const alcanzado = projectedNetSales >= t.threshold;
                  const yaLogrado = liveNetSales >= t.threshold;
                  return (
                    <div key={i} className="flex items-center justify-between text-[8px] font-mono font-bold">
                      <span className={cn(alcanzado ? "text-emerald-600" : "text-text-dim")}>
                        {alcanzado ? '✓' : '○'} {fmt(t.threshold)}
                        <span className="text-text-dim opacity-60"> = ${t.prize.toLocaleString('es-AR')}</span>
                      </span>
                      <span className={cn(
                        "uppercase text-[7px] font-black px-1.5 py-0.5 rounded",
                        yaLogrado ? "bg-emerald-500/15 text-emerald-600"
                          : alcanzado ? "bg-amber-500/10 text-amber-600"
                          : "bg-bg-accent text-text-dim"
                      )}>
                        {yaLogrado ? 'Logrado' : alcanzado ? 'Proyectado' : 'Lejos'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* CMV Monthly Column */}
        <div className={cn(
          "bg-bg-sidebar border p-5 rounded relative overflow-hidden group transition-all shadow-md",
          existenciasCargadas ? "border-border-dim hover:border-emerald-500/40" : "border-amber-500/40"
        )}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] font-black uppercase tracking-wider text-text-dim">
              {existenciasCargadas ? 'Compras & CMV' : 'Compras + Mov.'}
            </span>
            {existenciasCargadas
              ? <TrendingDown size={14} className="text-emerald-500" />
              : <AlertTriangle size={14} className="text-amber-500" />}
          </div>
          {existenciasCargadas ? (
            <>
              <div className="flex items-baseline gap-1.5">
                <h2 className="text-2xl font-mono font-black text-text-main">
                  ${totalCMVAmount.toLocaleString()}
                </h2>
                <span className="text-xs font-mono font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                  {liveCmvValue.toFixed(1)}%
                </span>
              </div>
              <p className="text-[8px] text-text-dim uppercase font-bold mt-1.5 font-mono">EI: ${cmvInitial.toLocaleString()} + Compras + Mov − EF: ${cmvFinal.toLocaleString()}</p>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-1.5">
                <h2 className="text-2xl font-mono font-black text-text-main">
                  ${comprasMovimientos.toLocaleString()}
                </h2>
                {comprasMovPercentage !== null && (
                  <span className="text-xs font-mono font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">
                    {comprasMovPercentage.toFixed(1)}%
                  </span>
                )}
              </div>
              <p className="text-[8px] text-amber-600 uppercase font-black mt-1.5 leading-tight">
                CMV sin cerrar · faltan cargar EI y EF
              </p>
              <p className="text-[7px] text-text-dim uppercase font-bold mt-0.5 font-mono">
                El CMV real = EI + Compras + Mov − EF
              </p>
            </>
          )}
          {cmvLastDate && (
            <p className="text-[8px] text-amber-600 uppercase font-black mt-1.5 leading-tight">
              Compras + Mov. cargadas hasta el {cmvLastDate.split('-').reverse().join('/')}
            </p>
          )}
        </div>

        {/* HR Hour Deviation Column */}
        <div className="bg-bg-sidebar border border-border-dim p-5 rounded relative overflow-hidden group hover:border-blue-500/40 transition-all shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] font-black uppercase tracking-wider text-text-dim">Control Horas (RRHH)</span>
            <Clock size={14} className="text-blue-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <h2 className="text-2xl font-mono font-black text-text-main">
              {Math.round(Math.abs(totalHourWorked - totalHourBudget) * 10) / 10} hs
            </h2>
            <span className={cn(
              "text-xs font-mono font-bold px-1.5 py-0.5 rounded",
              hourDeviationPercentage <= 0 ? "text-emerald-500 bg-emerald-500/10" : "text-red-400 bg-red-400/10"
            )}>
              {hourDeviationPercentage > 0 ? `+${hourDeviationPercentage.toFixed(1)}%` : `${hourDeviationPercentage.toFixed(1)}%`}
            </span>
          </div>
          <p className="text-[8px] text-text-dim uppercase font-bold mt-1.5">Desvío vs Presupuesto ideal en el mes</p>
          {/* El desvío que afecta los PREMIOS se calcula distinto: solo excesos, sin encargados */}
          <div className="mt-2 pt-2 border-t border-border-dim/40">
            <div className="flex items-center justify-between">
              <span className="text-[7px] font-black uppercase tracking-wider text-text-dim">Para premios</span>
              <span className={cn(
                "text-[10px] font-mono font-black",
                hoursDeviationPct === 0 ? "text-emerald-500" : hoursDeviationPct > 5 ? "text-red-500" : "text-amber-500"
              )}>
                {hoursDeviationPct.toFixed(1)}%
              </span>
            </div>
            <p className="text-[7px] text-text-dim uppercase font-bold mt-0.5 leading-tight opacity-70">
              Solo excesos por puesto · Encargados excluidos
            </p>
          </div>
        </div>

        {/* Supervision Flag Penalties Column */}
        <div onClick={() => (redFlagsDetail.items.length > 0 || blackFlagsDetail.items.length > 0) && setShowFlagsModal(true)}
          className={cn(
            "bg-bg-sidebar border border-border-dim p-5 rounded relative overflow-hidden group hover:border-red-500/40 transition-all shadow-md",
            (redFlagsDetail.items.length > 0 || blackFlagsDetail.items.length > 0) && "cursor-pointer"
          )}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] font-black uppercase tracking-wider text-text-dim">Banderas Rojas y Negras</span>
            <Flag size={14} className="text-red-500" />
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="text-2xl font-mono font-black text-red-500">
              {liveRedFlags} Rojas
            </h2>
            <h2 className="text-2xl font-mono font-black text-text-main">
              {blackFlagsDetail.total + blackFlagsDuenosDetail.items.length} Negras
            </h2>
            <span className="text-[9px] font-bold text-text-dim uppercase font-mono">
              ({supervisionFlags.yellow} Am | {supervisionFlags.green} Ve)
            </span>
          </div>

          {/* Desglose por responsable */}
          {!isSimulationMode && (redFlagsDetail.encargado > 0 || redFlagsDetail.cocina > 0 || blackFlagsDetail.encargado > 0 || blackFlagsDetail.cocina > 0) && (
            <div className="mt-3 pt-3 border-t border-border-dim/40 grid grid-cols-2 gap-2">
              <div className="bg-red-500/5 border border-red-500/20 rounded px-2 py-1.5">
                <p className="text-[7px] font-black uppercase tracking-wider text-text-dim">Encargado</p>
                <p className="text-sm font-mono font-black text-red-500">
                  {redFlagsDetail.encargado}
                  <span className="text-text-dim/50 font-bold"> · </span>
                  <span className="text-text-main">{blackFlagsDetail.encargado}</span>
                </p>
              </div>
              <div className="bg-red-500/5 border border-red-500/20 rounded px-2 py-1.5">
                <p className="text-[7px] font-black uppercase tracking-wider text-text-dim">Jefe de Cocina</p>
                <p className="text-sm font-mono font-black text-red-500">
                  {redFlagsDetail.cocina}
                  <span className="text-text-dim/50 font-bold"> · </span>
                  <span className="text-text-main">{blackFlagsDetail.cocina}</span>
                </p>
              </div>
            </div>
          )}
          {(redFlagsDetail.items.length > 0 || blackFlagsDetail.items.length > 0) && (
            <p className="mt-2 text-[8px] font-black uppercase tracking-wider text-brand-500 opacity-80">
              Ver detalle →
            </p>
          )}
          <p className="text-[8.5px] text-text-dim uppercase font-bold mt-1.5 flex items-center gap-1">
            <AlertCircle size={10} className="text-red-500" /> Resta según config de premios por bandera
          </p>
        </div>
      </div>

      {/* MAIN TWO-COLUMN DASHBOARD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: PUESTOS Y HORAS RESTANTES + CALIFICACIONES (2 COLUMNS SPAN ON DESKTOP) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Puestos y Presupuestos de Horas */}
          <div className="bg-bg-sidebar border border-border-dim rounded-lg shadow-xl p-6">
            <div className="flex items-center justify-between border-b border-border-dim pb-4 mb-4">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-blue-500" />
                <div>
                  <h3 className="text-xs font-black uppercase text-text-main tracking-wider">Presupuesto de Horas por Puesto</h3>
                  <p className="text-[9px] text-text-dim uppercase font-bold mt-0.5">Consumo del mes + proyección lineal a fin de mes</p>
                </div>
              </div>
              <div className="text-right">
                <span className="block text-[11px] font-mono font-black text-text-main">
                  {totalHourWorked} / {totalHourBudget} hs
                </span>
                <span className="block text-[8px] text-text-dim uppercase font-bold">Consumido (${totalHourRemaining > 0 ? `le quedan ${totalHourRemaining} hs` : `exceso de ${Math.abs(totalHourRemaining)} hs`})</span>
              </div>
            </div>

            {/* Indicador de validación RRHH: qué semanas ya dejó asentadas RRHH */}
            <div className="flex items-center gap-2 flex-wrap bg-bg-accent/30 border border-border-dim/40 rounded-md px-3 py-2 mb-4">
              <CheckCircle2 size={12} className={rrhhValidatedWeeks.length > 0 ? "text-emerald-500 shrink-0" : "text-text-dim shrink-0"} />
              {rrhhValidatedWeeks.length === 0 ? (
                <span className="text-[8px] font-bold uppercase tracking-wider text-text-dim">
                  Sin semanas validadas por RRHH · Mostrando horas cargadas por el encargado (provisorias)
                </span>
              ) : (
                <span className="text-[8px] font-bold uppercase tracking-wider text-text-dim">
                  <span className="text-emerald-500 font-black">Validado RRHH:</span> {rrhhValidatedWeeks.map(w => `S${w}`).join(', ')}
                  {[1, 2, 3, 4].filter(w => !rrhhValidatedWeeks.includes(w)).length > 0 && (
                    <> · <span className="text-amber-500 font-black">Provisorio (encargado):</span> {[1, 2, 3, 4].filter(w => !rrhhValidatedWeeks.includes(w)).map(w => `S${w}`).join(', ')}</>
                  )}
                </span>
              )}
            </div>

            <div className="space-y-4">
              {positionHoursProjected.map((item, idx) => {
                const isOver = item.worked > item.budgeted;
                return (
                  <div key={item.positionName + idx} className="space-y-1 bg-bg-accent/20 p-3 rounded border border-border-dim/40 hover:border-brand-500/20 transition-all">
                    <div className="flex justify-between items-baseline">
                      <span className="text-[10px] font-black text-text-main uppercase tracking-tight">{item.positionName}</span>
                      <div className="text-right font-mono text-[9px] font-bold">
                        <span className={cn(isOver ? "text-red-400 font-extrabold" : "text-text-main")}>{item.worked} hs</span>
                        <span className="text-text-dim italic mx-1">/</span>
                        <span className="text-text-dim">{item.budgeted} hs</span>
                        <span className={cn(
                          "ml-2.5 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider",
                          item.remaining >= 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                        )}>
                          {item.remaining >= 0 ? `Quedan ${item.remaining} hs` : `Exceso ${Math.abs(item.remaining)} hs`}
                        </span>
                      </div>
                    </div>
                    {/* Progress Bar Container */}
                    <div className="w-full bg-bg-accent h-1.5 rounded-full overflow-hidden mt-1 relative">
                      <div 
                        className={cn("h-full transition-all duration-500", isOver ? "bg-red-500" : "bg-blue-500")}
                        style={{ width: `${Math.min(100, item.percent)}%` }}
                      />
                      {/* Marca de proyección a fin de mes */}
                      {isProjecting && item.budgeted > 0 && (
                        <div className="absolute top-0 bottom-0 w-0.5 bg-amber-500"
                          style={{ left: `${Math.min(100, (item.projected / item.budgeted) * 100)}%` }}
                          title={`Proyección fin de mes: ${item.projected} hs`} />
                      )}
                    </div>
                    {/* Proyección a fin de mes */}
                    {isProjecting && (
                      <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-border-dim/30">
                        <TrendingUp size={10} className={cn(item.projectedOver ? "text-red-500" : "text-amber-500")} />
                        <span className="text-[8px] font-bold uppercase text-text-dim">Proyección fin de mes:</span>
                        <span className={cn("text-[9px] font-mono font-black", item.projectedOver ? "text-red-500" : "text-emerald-500")}>
                          {item.projected} hs
                        </span>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wider",
                          item.projectedOver ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-500"
                        )}>
                          {item.projectedOver
                            ? `Se excedería en ${Math.abs(item.projectedRemaining)} hs`
                            : `Dentro del presupuesto`}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            <div className="mt-4 flex justify-between items-center text-[9px] text-text-dim bg-bg-accent/40 p-3 rounded">
              <span className="flex items-center gap-1"><Info size={11} className="text-blue-500 shrink-0" /> Sincronizado en tiempo real con Presupuestador de Horas & Libro de Firmas.</span>
              {onNavigateToTab && (
                <button 
                  onClick={() => onNavigateToTab('hr_hour_control')}
                  className="text-brand-500 hover:underline uppercase font-black tracking-widest cursor-pointer text-[8px]"
                >
                  AUDITAR PLANILLA →
                </button>
              )}
            </div>
          </div>

          {/* Social Reputación & Canales Delivery */}
          <div className="bg-bg-sidebar border border-border-dim rounded-lg shadow-xl p-6">
            <h3 className="text-xs font-black uppercase text-text-main tracking-wider border-b border-border-dim pb-4 mb-4 flex items-center gap-2">
              <Star size={16} className="text-yellow-500" /> Reputación en Google & Calificaciones Pedidos Ya
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Google Maps Card */}
              <div className="bg-bg-accent/30 border border-border-dim p-4 rounded hover:border-yellow-500/30 transition-all flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black uppercase text-text-dim">Google Maps (Sincronizado)</span>
                  <div className="bg-yellow-500 text-black text-[8px] px-1.5 py-0.5 rounded font-black">G</div>
                </div>
                <div className="space-y-1">
                  <h2 className="text-3xl font-mono font-black text-text-main flex items-center gap-1.5">
                    {liveGoogleScore}
                    <Star size={18} className="text-yellow-500 fill-current" />
                  </h2>
                  <div className="flex justify-between items-center text-[9px] text-text-dim uppercase font-bold mt-1">
                    <span>Estrellas</span>
                    <span className="font-mono text-text-main">({googleRatingCount.toLocaleString('es-AR')} reseñas)</span>
                  </div>
                </div>
              </div>

              {/* Pedidos Ya Resto Card */}
              <div className="bg-bg-accent/30 border border-border-dim p-4 rounded hover:border-red-500/30 transition-all flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black uppercase text-text-dim">Pedidos Ya Restó</span>
                  <div className="bg-red-500 text-white text-[8px] px-1.5 py-0.5 rounded font-black">PY RESTO</div>
                </div>
                <div className="space-y-1">
                  <h2 className="text-3xl font-mono font-black text-text-main flex items-center gap-1.5">
                    {livePyRestoScore}
                    <Star size={18} className="text-red-500 fill-current" />
                  </h2>
                  <p className="text-[8px] text-text-dim uppercase font-bold">Calificación Oficial</p>
                </div>
              </div>

              {/* Pedidos Ya Cafe Card */}
              <div className="bg-bg-accent/30 border border-border-dim p-4 rounded hover:border-orange-500/30 transition-all flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black uppercase text-text-dim">Pedidos Ya Café</span>
                  <Coffee size={14} className="text-orange-500" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-3xl font-mono font-black text-text-main flex items-center gap-1.5">
                    {livePyCafeScore}
                    <Star size={18} className="text-orange-500 fill-current" />
                  </h2>
                  <p className="text-[8px] text-text-dim uppercase font-bold">Calificación Canal Café</p>
                </div>
              </div>
            </div>

            {onNavigateToTab && (
              <div className="mt-4 flex justify-end">
                <button 
                  onClick={() => onNavigateToTab('pedidos_ya')}
                  className="text-brand-500 hover:underline uppercase font-black tracking-widest cursor-pointer text-[8px]"
                >
                  CARGAR SEGUIMIENTO PEDIDOS YA →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: REGLAS DE PREMIOS Y TOTALES AUTOMÁTICOS (1 COLUMN SPAN ON DESKTOP) */}
        <div className="space-y-6">
          <div className="bg-bg-sidebar border border-brand-500/20 rounded-lg shadow-2xl p-6 bg-gradient-to-b from-bg-sidebar via-bg-sidebar to-brand-500/5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Award size={100} className="text-brand-500" />
            </div>

            <div className="flex items-center justify-between border-b border-border-dim pb-4 mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Award size={18} className="text-brand-500" />
                <div>
                  <h3 className="text-xs font-black uppercase text-text-main tracking-wider">Cálculo de Premios Operativos</h3>
                  <p className="text-[8px] text-text-dim uppercase font-bold mt-0.5">Premio que va alcanzando la sucursal según la configuración cargada</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {selectedBranchId !== 'all' && autoStockDeviationData.detail.length > 0 && (
                  <button
                    onClick={() => setShowDevDetail(true)}
                    className="px-3 py-1.5 rounded border border-border-dim bg-bg-accent text-text-dim hover:text-text-main text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5"
                    title="Ver cómo se calcula el % de desvío de stock, semana por semana y por insumo">
                    <Info size={11} /> Ver detalle desvío
                  </button>
                )}
                {esAdmin && selectedBranchId !== 'all' && (
                  <button
                    onClick={() => { setDeviationInput(stockDeviationOverride ? String(stockDeviationOverride.value) : ''); setDeviationNote(stockDeviationOverride?.note || ''); setShowDeviationModal(true); }}
                    className={cn(
                      "px-3 py-1.5 rounded border text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5",
                      stockDeviationOverride
                        ? "bg-amber-500/10 border-amber-500/40 text-amber-600 hover:bg-amber-500/20"
                        : "bg-bg-accent border-border-dim text-text-dim hover:text-text-main"
                    )}
                    title="Cargar a mano el desvío de stock de la planilla de Control de Desvíos">
                    <Pencil size={11} />
                    {stockDeviationOverride ? `Desvío cargado: ${stockDeviationOverride.value}` : 'Cargar desvío a mano'}
                  </button>
                )}
              </div>
            </div>

            {/* List calculated bonuses */}
            <div className="space-y-6">
              {activeConfigs.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                  <span className="text-3xl">⚙️</span>
                  <p className="text-[10px] font-black text-text-dim uppercase tracking-wider">Sin configuración de premios</p>
                  <p className="text-[9px] text-text-dim/70">La administración aún no cargó los objetivos y premios para este mes y sucursal.</p>
                </div>
              )}
              {activeConfigs.length > 0 && ['encargado', 'jefe_cocina', 'segundo_cocina'].map(role => {
                const breakdown = calculatedPrizesBreakdown[role];
                if (!breakdown) return null;

                return (
                  <div key={role} className="space-y-2 pb-4 border-b border-border-dim/40 last:border-none last:pb-0">
                    <div className="flex justify-between items-baseline">
                      <div>
                        <span className="text-[10px] font-extrabold text-brand-500 uppercase tracking-wider">{breakdown.roleLabel}</span>
                        {role === 'segundo_cocina' && (
                          <span className="block text-[8px] text-text-dim uppercase">80% correspondiente al Jefe</span>
                        )}
                      </div>
                      <div className="text-right font-mono flex items-center gap-2">
                        <span className="text-xl font-black text-text-main">
                          ${breakdown.finalCalculatedPrize.toLocaleString()}
                        </span>
                        {esAdmin && (
                          <button onClick={() => guardarAjuste(role, breakdown.roleLabel)}
                            className="text-text-dim hover:text-brand-500 transition-colors"
                            title="Ajustar premio (excepciones)">
                            <Pencil size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Ajuste manual cargado por administración */}
                    {breakdown.ajusteMonto !== 0 && (
                      <div className={cn(
                        "border rounded px-2 py-1.5",
                        breakdown.ajusteMonto > 0 ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"
                      )}>
                        <div className="flex items-center justify-between">
                          <span className="text-[8px] font-black uppercase text-text-dim">Ajuste de administración</span>
                          <span className={cn("text-[10px] font-mono font-black", breakdown.ajusteMonto > 0 ? "text-emerald-500" : "text-red-500")}>
                            {breakdown.ajusteMonto > 0 ? '+' : ''}${breakdown.ajusteMonto.toLocaleString('es-AR')}
                          </span>
                        </div>
                        <p className="text-[8px] font-bold text-text-main mt-0.5 leading-tight">{breakdown.ajusteMotivo}</p>
                        {breakdown.ajustePor && (
                          <p className="text-[7px] font-bold uppercase text-text-dim opacity-70 mt-0.5">Cargado por {breakdown.ajustePor}</p>
                        )}
                      </div>
                    )}

                    {/* Show breakdown of target items (only for primary configurations) */}
                    {role !== 'segundo_cocina' && breakdown.variablesStatus && breakdown.variablesStatus.length > 0 && (
                      <div className="space-y-1 pl-1 bg-bg-accent/40 rounded p-2.5">
                        <p className="text-[7.5px] font-black text-text-dim uppercase tracking-wider mb-1">Desglose de Objetivos:</p>
                        {breakdown.variablesStatus.map((v: any) => {
                          // Formato legible según la magnitud (las ventas son millones)
                          const fmtVal = (n: number) => {
                            if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
                            if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(0)}k`;
                            return `${n.toFixed(1)}${v.unit || ''}`;
                          };
                          const esPlata = String(v.unit || '').includes('$') || String(v.variableName).toLowerCase().includes('venta');
                          const mostrar = (n: number) => esPlata ? fmtVal(n) : `${n.toFixed(1)}${v.unit || ''}`;
                          return (
                            <div key={v.variableId} className="border-b border-border-dim/20 last:border-none pb-1 last:pb-0">
                              <div className="flex justify-between text-[8px] leading-relaxed uppercase">
                                <span className="text-text-dim font-bold truncate max-w-[130px]">{v.variableName}:</span>
                                <span className="font-mono flex items-center gap-1">
                                  <span className="text-text-main font-black">{mostrar(v.currentValue || 0)}</span>
                                  <span className={cn("italic font-bold", (v.isStockVar ? v.prize > 0 : v.achievedTier) ? "text-emerald-600" : "text-text-dim")}>
                                    ({v.isStockVar ? (v.prize > 0 ? `+$${v.prize.toLocaleString('es-AR')}` : '$0') : (v.achievedTier ? `+$${v.achievedTier.prize.toLocaleString('es-AR')}` : '$0')})
                                  </span>
                                </span>
                              </div>
                              {/* Desvío de stock: premio semana × insumo (no sobre el promedio del mes) */}
                              {v.isStockVar && v.stockCellPrize && (
                                <div className="flex flex-wrap items-center gap-1 mt-0.5 pl-1">
                                  <span className="text-[7px] font-bold uppercase text-text-dim">
                                    Semana × insumo · {v.stockCellPrize.N} insumo(s) × 4 sem
                                  </span>
                                  <button onClick={() => setStockPrizeModal({ ...v.stockCellPrize, tiers: v.tiersOrdenados, varName: v.variableName })}
                                    className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded border border-brand-500/40 bg-brand-500/10 text-brand-500 hover:bg-brand-500/20 transition-all">
                                    Ver detalle
                                  </button>
                                </div>
                              )}
                              {/* Escala de objetivos: cuál se alcanzó y cuál es el próximo (no para desvío de stock) */}
                              {!v.isStockVar && v.tiersOrdenados && v.tiersOrdenados.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-0.5 pl-1">
                                  {v.tiersOrdenados.map((t: any, i: number) => {
                                    const alcanzado = v.achievedTier && t.threshold === v.achievedTier.threshold;
                                    const esProximo = v.proximo && t.threshold === v.proximo.threshold;
                                    return (
                                      <span key={i} className={cn(
                                        "text-[7px] font-mono font-bold px-1 py-0.5 rounded border",
                                        alcanzado
                                          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-600"
                                          : esProximo
                                            ? "bg-amber-500/10 border-amber-500/40 text-amber-600"
                                            : "bg-bg-sidebar border-border-dim text-text-dim opacity-60"
                                      )}>
                                        {v.isLowerBetter ? '≤' : '≥'}{mostrar(t.threshold)} = ${t.prize.toLocaleString('es-AR')}
                                        {alcanzado && ' ✓'}
                                      </span>
                                    );
                                  })}
                                  {v.proximo && (
                                    <span className="text-[7px] font-bold uppercase text-amber-600 px-1 py-0.5">
                                      Falta {mostrar(Math.abs(v.falta))}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Penalty rows - always show so encargado knows cost per flag */}
                        <div className={`flex justify-between text-[8px] uppercase border-t border-border-dim/40 pt-1 mt-1 font-extrabold ${(breakdown.redPenaltyVal ?? 0) > 0 ? 'text-red-400' : 'text-text-dim'}`}>
                          <span>🚩 Descuento Banderas Rojas ({breakdown.flagsDelRol ?? 0} roja{(breakdown.flagsDelRol ?? 0) !== 1 ? 's' : ''} × ${breakdown.redFlagPenalty.toLocaleString()}):</span>
                          <span className="font-mono">{(breakdown.redPenaltyVal ?? 0) > 0 ? `-$${(breakdown.redPenaltyVal ?? 0).toLocaleString()}` : '$0'}</span>
                        </div>
                        <div className={`flex justify-between text-[8px] uppercase font-extrabold ${(breakdown.blackPenaltyVal ?? 0) > 0 ? 'text-red-400' : 'text-text-dim'}`}>
                          <span>🏴 Descuento Banderas Negras ({breakdown.blackFlagsDelRol ?? 0} negra{(breakdown.blackFlagsDelRol ?? 0) !== 1 ? 's' : ''} × ${(breakdown.blackFlagPenalty ?? 0).toLocaleString()}):</span>
                          <span className="font-mono">{(breakdown.blackPenaltyVal ?? 0) > 0 ? `-$${(breakdown.blackPenaltyVal ?? 0).toLocaleString()}` : '$0'}</span>
                        </div>
                        {(breakdown.blackFlagsDuenos ?? 0) > 0 && (
                          <div className="flex justify-between text-[7px] uppercase font-bold text-text-dim pl-3">
                            <span>↳ {breakdown.blackFlagsManual ?? 0} de Administración + {breakdown.blackFlagsDuenos} de Evaluación de Dueños</span>
                          </div>
                        )}
                      </div>
                    )}

                    {role === 'segundo_cocina' && breakdown.isMatched && (
                      <div className="text-[8px] text-text-dim bg-bg-accent/40 p-2.5 rounded italic">
                        Calculado mecánicamente de forma transparente sobre la conformación que consiga el Jefe de Cocina. En caso de cumplirse la meta de ventas de la sucursal, se asignará.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            <div className="mt-4 p-3 bg-brand-500/10 border border-brand-500/20 rounded text-[9px] text-text-dim leading-relaxed uppercase font-bold text-center">
              Cambia la sucursal o el mes para ver los premios aplicables cargados por la administración.
            </div>
          </div>
        </div>

      </div>

      {/* Distribución de Planta (Sólo Lectura) - ancho completo */}
      <ReadOnlyPlantaView 
        selectedBranchId={selectedBranchId}
        branches={branches}
        selectedMonth={selectedMonth}
      />

      {/* Tickets / Órdenes de la sucursal */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Ticket size={16} className="text-brand-500" />
          <h3 className="text-xs font-black uppercase text-text-main tracking-wider">Tickets / Órdenes</h3>
        </div>
        <OrdersSummary scope={selectedBranchId === 'all' ? 'consolidated' : selectedBranchId} />
      </div>

      <MonthlyRankingTop branches={branches} fixedBranchId={selectedBranchId !== 'all' ? selectedBranchId : undefined} />

      {/* Modal: cargar el desvío de stock a mano */}
      {showDeviationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowDeviationModal(false)}>
          <div className="bg-bg-card border border-border-dim rounded-xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border-dim flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest text-brand-500">Desvío de Stock · Carga Manual</h3>
              <button onClick={() => setShowDeviationModal(false)} className="text-text-dim hover:text-text-main"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-[10px] text-text-dim font-bold leading-relaxed">
                Ingresá el desvío que muestra la planilla de <strong>Control de Desvíos</strong> para esta sucursal y mes
                (el promedio de los insumos de la semana). Este valor reemplaza al cálculo automático para el premio.
              </p>
              <div>
                <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Desvío (%)</label>
                <input
                  type="text" inputMode="decimal" value={deviationInput}
                  onChange={e => setDeviationInput(e.target.value)}
                  placeholder="Ej: 1,32"
                  className="w-full mt-1 bg-bg-accent border border-border-dim rounded px-3 py-2 text-sm font-mono font-black text-text-main outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Nota (opcional)</label>
                <input
                  type="text" value={deviationNote}
                  onChange={e => setDeviationNote(e.target.value)}
                  placeholder="Ej: promedio semana 4 de junio"
                  className="w-full mt-1 bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-brand-500"
                />
              </div>
              {stockDeviationOverride && (
                <p className="text-[9px] font-bold text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2">
                  Actualmente cargado: <strong>{stockDeviationOverride.value}%</strong>
                  {stockDeviationOverride.note ? ` · ${stockDeviationOverride.note}` : ''}
                </p>
              )}
            </div>
            <div className="px-5 py-4 border-t border-border-dim flex items-center justify-between gap-2">
              {stockDeviationOverride ? (
                <button onClick={borrarDesvioManual}
                  className="px-3 py-2 rounded text-[9px] font-black uppercase text-red-500 hover:bg-red-500/10 transition-all">
                  Quitar y usar automático
                </button>
              ) : <span />}
              <div className="flex gap-2">
                <button onClick={() => setShowDeviationModal(false)}
                  className="px-4 py-2 rounded border border-border-dim text-[9px] font-black uppercase text-text-dim hover:text-text-main">Cancelar</button>
                <button onClick={guardarDesvioManual}
                  className="px-4 py-2 rounded bg-brand-500 text-white text-[9px] font-black uppercase hover:bg-brand-600 transition-all">Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: detalle del cálculo de desvío de stock (semana por semana, por insumo) */}
      {showDevDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowDevDetail(false)}>
          <div className="bg-bg-card border border-border-dim rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border-dim flex items-start justify-between">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-text-main">Detalle del % de Desvío de Stock</h3>
                <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest mt-0.5">
                  {activeBranch?.name} · {selectedMonth} · promedio semana a semana por insumo
                </p>
              </div>
              <button onClick={() => setShowDevDetail(false)} className="text-text-dim hover:text-text-main"><X size={18} /></button>
            </div>
            <div className="px-5 py-3 bg-bg-accent/30 border-b border-border-dim">
              <p className="text-[9px] font-bold text-text-dim leading-relaxed">
                Por insumo, con los totales del mes: <span className="font-mono">EF teórica = EI + compras + prést.recib − prést.env − venta teórica − decomisos − consumo</span>.
                Desvío = EF Real − EF Teórica; <span className="font-mono">% = (EF Real − EF Teórica) / EF Teórica × 100</span>. El desvío de la sucursal es el <strong>promedio del |%|</strong> de todos los insumos. Coincide con la vista Mes de Control de Stock.
              </p>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-bg-accent">
                  <tr className="text-[8px] font-black uppercase text-text-dim tracking-widest">
                    <th className="px-4 py-2">Insumo</th>
                    <th className="px-2 py-2 text-right">EF teórica</th>
                    <th className="px-2 py-2 text-right">EF real</th>
                    <th className="px-2 py-2 text-right">Desvío</th>
                    <th className="px-4 py-2 text-right">Desvío %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dim/30">
                  {autoStockDeviationData.detail.map(d => (
                    <tr key={d.id} className="text-[10px] hover:bg-bg-accent/20">
                      <td className="px-4 py-2 font-bold text-text-main">{d.name}</td>
                      <td className="px-2 py-2 text-right font-mono text-text-dim">{d.efTeorica.toFixed(2)}</td>
                      <td className="px-2 py-2 text-right font-mono text-text-dim">{d.ef.toFixed(2)}</td>
                      <td className="px-2 py-2 text-right font-mono text-text-dim">{d.desvio > 0 ? '+' : ''}{d.desvio.toFixed(2)}</td>
                      <td className={cn("px-4 py-2 text-right font-mono font-black", Math.abs(d.pct) < 5 ? 'text-emerald-500' : Math.abs(d.pct) >= 50 ? 'text-red-500' : 'text-amber-600')}>
                        {d.pct > 0 ? '+' : ''}{d.pct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-brand-500/10 border-t-2 border-brand-500/40 text-[11px]">
                    <td className="px-4 py-2.5 font-black uppercase text-brand-500" colSpan={4}>Desvío de la sucursal (promedio del |%| de insumos)</td>
                    <td className="px-4 py-2.5 text-right font-mono font-black text-brand-500">{autoStockDeviation.toFixed(1)}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-border-dim bg-bg-accent/20">
              <p className="text-[8px] font-bold text-text-dim uppercase tracking-widest leading-relaxed">
                Cada % coincide con el DESVÍO % que muestra Control de Stock (vista Mes) para ese insumo. El desvío de la sucursal promedia el valor absoluto (un faltante y un sobrante no se compensan).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal: detalle del PREMIO de desvío de stock (semana × insumo) */}
      {stockPrizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setStockPrizeModal(null)}>
          <div className="bg-bg-card border border-border-dim rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border-dim flex items-start justify-between">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-text-main">Premio por Desvío de Stock · semana × insumo</h3>
                <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest mt-0.5">
                  {activeBranch?.name} · {selectedMonth} · {stockPrizeModal.N} insumo(s) × 4 semanas
                </p>
              </div>
              <button onClick={() => setStockPrizeModal(null)} className="text-text-dim hover:text-text-main"><X size={18} /></button>
            </div>
            <div className="px-5 py-3 bg-bg-accent/30 border-b border-border-dim">
              <p className="text-[9px] font-bold text-text-dim leading-relaxed">
                El premio se gana <strong>por cada semana y por cada insumo</strong> que quede bajo el objetivo (así no se puede acomodar en la última semana). Cada celda vale <span className="font-mono">premio del tramo ÷ 4 semanas ÷ {stockPrizeModal.N} insumos</span>. Tramos:
                {(stockPrizeModal.tiers || []).map((t: any, i: number) => (
                  <span key={i} className="inline-block ml-1 font-mono text-text-main">≤{t.threshold}% = ${t.prize.toLocaleString('es-AR')} (${Math.round((Number(t.prize) || 0) / 4 / (stockPrizeModal.N || 1)).toLocaleString('es-AR')}/celda){i < stockPrizeModal.tiers.length - 1 ? ' ·' : ''}</span>
                ))}
              </p>
            </div>
            <div className="overflow-auto flex-1">
              {(() => {
                // Reagrupar celdas por insumo
                const byInsumo: Record<string, any> = {};
                (stockPrizeModal.cells || []).forEach((c: any) => {
                  if (!byInsumo[c.insumoId]) byInsumo[c.insumoId] = { name: c.insumo, weeks: [null, null, null, null], total: 0 };
                  byInsumo[c.insumoId].weeks[c.week - 1] = c;
                  byInsumo[c.insumoId].total += c.amount;
                });
                const rows = Object.values(byInsumo);
                return (
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-bg-accent">
                      <tr className="text-[8px] font-black uppercase text-text-dim tracking-widest">
                        <th className="px-4 py-2">Insumo</th>
                        {[1, 2, 3, 4].map(w => <th key={w} className="px-2 py-2 text-center">S{w}</th>)}
                        <th className="px-4 py-2 text-right">Ganado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-dim/30">
                      {rows.map((r: any, ri: number) => (
                        <tr key={ri} className="text-[10px] hover:bg-bg-accent/20">
                          <td className="px-4 py-2 font-bold text-text-main">{r.name}</td>
                          {r.weeks.map((c: any, wi: number) => (
                            <td key={wi} className="px-2 py-2 text-center font-mono">
                              {!c || c.pct === null ? (
                                <span className="text-text-dim/30">—</span>
                              ) : (
                                <div className="flex flex-col items-center leading-tight">
                                  <span className={cn("text-[9px]", Math.abs(c.pct) < 2 ? "text-emerald-500" : "text-text-dim")}>{c.pct > 0 ? '+' : ''}{c.pct.toFixed(1)}%</span>
                                  <span className={cn("text-[9px] font-black", c.amount > 0 ? "text-emerald-600" : "text-text-dim/50")}>{c.amount > 0 ? `$${Math.round(c.amount).toLocaleString('es-AR')}` : '$0'}</span>
                                </div>
                              )}
                            </td>
                          ))}
                          <td className="px-4 py-2 text-right font-mono font-black text-emerald-600">${Math.round(r.total).toLocaleString('es-AR')}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-brand-500/10 border-t-2 border-brand-500/40 text-[11px]">
                        <td className="px-4 py-2.5 font-black uppercase text-brand-500" colSpan={5}>Premio total desvío de stock</td>
                        <td className="px-4 py-2.5 text-right font-mono font-black text-brand-500">${Math.round(stockPrizeModal.total).toLocaleString('es-AR')}</td>
                      </tr>
                    </tfoot>
                  </table>
                );
              })()}
            </div>
            <div className="px-5 py-3 border-t border-border-dim bg-bg-accent/20">
              <p className="text-[8px] font-bold text-text-dim uppercase tracking-widest leading-relaxed">
                Cada celda toma el mejor tramo que cumple (en valor absoluto). Las semanas sin venta teórica cargada no suman. El % de cada semana usa la misma fórmula de Control de Stock (desvío / Existencia Final Teórica).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal: detalle de banderas rojas y negras */}
      {showFlagsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowFlagsModal(false)}>
          <div className="bg-bg-card border border-border-dim rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border-dim flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest text-red-500 flex items-center gap-2">
                <Flag size={15} /> Detalle de Banderas
              </h3>
              <button onClick={() => setShowFlagsModal(false)} className="text-text-dim hover:text-text-main">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-2 bg-bg-accent/30 grid grid-cols-2 gap-2 text-center">
              <div>
                <span className="text-[8px] font-black uppercase text-text-dim">Encargado: </span>
                <span className="font-mono font-black text-red-500">{redFlagsDetail.encargado}</span>
                <span className="text-text-dim/50 font-bold"> · </span>
                <span className="font-mono font-black text-text-main">{blackFlagsDetail.encargado}</span>
              </div>
              <div>
                <span className="text-[8px] font-black uppercase text-text-dim">Jefe de Cocina: </span>
                <span className="font-mono font-black text-red-500">{redFlagsDetail.cocina}</span>
                <span className="text-text-dim/50 font-bold"> · </span>
                <span className="font-mono font-black text-text-main">{blackFlagsDetail.cocina}</span>
              </div>
            </div>

            <div className="overflow-y-auto p-4 space-y-4">
              {/* Banderas rojas: vienen de las supervisiones */}
              <div className="space-y-2">
                <h4 className="text-[9px] font-black uppercase tracking-widest text-red-500 flex items-center gap-1.5">
                  <Flag size={11} /> Rojas ({redFlagsDetail.items.length})
                  <span className="text-text-dim font-bold tracking-wider">· de supervisiones</span>
                </h4>
                {redFlagsDetail.items.map((it, i) => (
                  <div key={i} className="bg-bg-sidebar border border-border-dim rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <p className="text-[11px] font-black text-text-main uppercase flex-1">{it.pregunta}</p>
                      <span className={cn(
                        "text-[7px] font-black uppercase tracking-wider px-2 py-1 rounded border shrink-0",
                        it.target === 'encargado' ? "bg-blue-500/10 text-blue-500 border-blue-500/30"
                          : it.target === 'cocina' ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                          : "bg-red-500/10 text-red-500 border-red-500/30"
                      )}>
                        {it.target === 'encargado' ? 'Encargado' : it.target === 'cocina' ? 'Jefe de Cocina' : 'Ambos'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[8px] font-bold uppercase text-text-dim">
                      <span>📅 {it.date}</span>
                      <span>👤 {it.supervisor}</span>
                      {it.template !== '—' && <span>📋 {it.template}</span>}
                    </div>
                  </div>
                ))}
                {redFlagsDetail.items.length === 0 && (
                  <p className="text-center text-[10px] font-bold uppercase text-text-dim py-4">Sin banderas rojas este mes.</p>
                )}
              </div>

              {/* Banderas negras: se cargan a mano con su fecha y su motivo */}
              <div className="space-y-2 pt-3 border-t border-border-dim">
                <h4 className="text-[9px] font-black uppercase tracking-widest text-text-main flex items-center gap-1.5">
                  <Flag size={11} /> Negras ({blackFlagsDetail.items.length})
                  <span className="text-text-dim font-bold tracking-wider">· comentarios negativos de clientes</span>
                </h4>
                {blackFlagsDetail.items.map((it, i) => (
                  <div key={i} className="bg-bg-sidebar border border-border-dim rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <p className="text-[11px] font-bold text-text-main flex-1 leading-relaxed">{it.reason}</p>
                      <span className={cn(
                        "text-[7px] font-black uppercase tracking-wider px-2 py-1 rounded border shrink-0",
                        it.role === 'encargado' ? "bg-blue-500/10 text-blue-500 border-blue-500/30"
                          : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                      )}>
                        {it.roleLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[8px] font-bold uppercase text-text-dim">
                      <span>📅 {it.date}</span>
                    </div>
                  </div>
                ))}
                {blackFlagsDetail.items.length === 0 && blackFlagsDuenosDetail.items.length === 0 && (
                  <p className="text-center text-[10px] font-bold uppercase text-text-dim py-4">Sin banderas negras este mes.</p>
                )}

                {/* Banderas negras que vienen de la Evaluación de Dueños ("No cumple") */}
                {blackFlagsDuenosDetail.items.length > 0 && (
                  <>
                    <p className="text-[8px] font-black uppercase tracking-widest text-text-dim pt-1">De Evaluación de Dueños ({blackFlagsDuenosDetail.items.length})</p>
                    {blackFlagsDuenosDetail.items.map((it, i) => (
                      <div key={`d${i}`} className="bg-bg-sidebar border border-border-dim rounded-lg p-3">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <p className="text-[11px] font-bold text-text-main flex-1 leading-relaxed">{it.pregunta}</p>
                          <span className="text-[7px] font-black uppercase tracking-wider px-2 py-1 rounded border shrink-0 bg-text-main/10 text-text-main border-text-main/30">
                            {it.target === 'encargado' ? 'Encargado' : it.target === 'cocina' ? 'Jefe de Cocina' : 'Ambos'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-[8px] font-bold uppercase text-text-dim">
                          <span>📅 {it.date}</span>
                          {it.seccion && <span>· {it.seccion.replace('_', ' ')}</span>}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </motion.div>
  );
}
