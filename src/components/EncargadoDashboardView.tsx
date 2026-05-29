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
  Percent, 
  ShieldAlert, 
  Sliders, 
  RefreshCw,
  CheckCircle2,
  XCircle,
  BarChart4,
  Lock
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { Branch } from '../types';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import ReadOnlyPlantaView from './ReadOnlyPlantaView';

interface EncargadoDashboardProps {
  selectedBranchId: string;
  branches: Branch[];
  onBranchChange?: (id: string) => void;
  onNavigateToTab?: (tabId: string) => void;
}

export default function EncargadoDashboardView({ 
  selectedBranchId, 
  branches, 
  onBranchChange,
  onNavigateToTab 
}: EncargadoDashboardProps) {
  const placesLib = useMapsLibrary('places');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [loading, setLoading] = useState(false);

  // Core metrics state parsed or loaded dynamically
  const [salesNet, setSalesNet] = useState(0);
  const [salesGross, setSalesGross] = useState(0);
  const [salesOrdersCount, setSalesOrdersCount] = useState(0);
  
  // CMV State (EI, EF, Purchases, Movements)
  const [cmvInitial, setCmvInitial] = useState(0);
  const [cmvFinal, setCmvFinal] = useState(0);
  const [cmvPurchases, setCmvPurchases] = useState(0);
  const [cmvMovements, setCmvMovements] = useState(0);

  // Deviations State
  const [wasteTotal, setWasteTotal] = useState(0);
  const [itemDeviations, setItemDeviations] = useState<any[]>([]);

  // HR Hours State
  const [hourBudgetRows, setHourBudgetRows] = useState<any[]>([]);
  const [weeklyHoursLogs, setWeeklyHoursLogs] = useState<Record<string, any[]>>({});
  
  // Reputación State
  const [googleRating, setGoogleRating] = useState(4.5);
  const [googleRatingCount, setGoogleRatingCount] = useState(0);
  const [pedidosYaRestoRating, setPedidosYaRestoRating] = useState(4.5);
  const [pedidosYaCafeRating, setPedidosYaCafeRating] = useState(4.5);

  // Supervision Flags State
  const [supervisionFlags, setSupervisionFlags] = useState({ red: 0, yellow: 0, green: 0 });
  const [supervisionResponses, setSupervisionResponses] = useState<any[]>([]);

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

  // Handle Month changes
  const adjustMonth = (offset: number) => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const date = new Date(parseInt(yearStr), parseInt(monthStr) - 1 + offset, 1);
    setSelectedMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };

  // 1. Fetch sales from Supabase
  const fetchSalesData = async (branchId: string, month: string) => {
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('net_sales, pesos, orders, date')
        .eq('branch_id', branchId)
        .gte('date', `${month}-01`)
        .lte('date', `${month}-31`);

      console.log('[Dashboard Sales] branch:', branchId, 'month:', month, 'rows:', data?.length, 'error:', error?.message);
      if (!error && data && data.length > 0) {
        const netSum = data.reduce((sum, item) => sum + (Number(item.net_sales) || 0), 0);
        const grossSum = data.reduce((sum, item) => sum + (Number(item.pesos) || 0), 0);
        const ordersSum = data.reduce((sum, item) => sum + (Number(item.orders) || 0), 0);
        setSalesNet(netSum);
        setSalesGross(grossSum);
        setSalesOrdersCount(ordersSum);
      } else {
        // No hay ventas cargadas aún
        setSalesNet(0);
        setSalesGross(0);
        setSalesOrdersCount(0);
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

      if (!error && data) {
        setCmvInitial(data.initial_existence || 0);
        setCmvFinal(data.final_existence || 0);
        setCmvPurchases(data.total_purchases || 0);
        setCmvMovements(data.total_movements || 0);
      } else {
        // Sin datos reales
        setCmvInitial(0);
        setCmvFinal(0);
        setCmvPurchases(0);
        setCmvMovements(0);
      }
    } catch (err) {
      console.error('Error loading CMV from Supabase:', err);
    }
  };

  // 3. Fetch Deviations (inventory logs)
  const fetchDeviations = async (branchId: string, month: string) => {
    try {
      const { data, error } = await supabase
        .from('inventory_logs')
        .select('*')
        .match({ branch_id: branchId })
        .gte('date', `${month}-01`)
        .lte('date', `${month}-31`);

      if (!error && data && data.length > 0) {
        const totalW = data.reduce((sum, item) => sum + (Number(item.decomisos) || 0), 0);
        setWasteTotal(totalW);
        
        // Match items with higher deviations (theoretical vs real physical diffs)
        const sortedItems = [...data]
          .map(d => ({
            name: d.item_id, // raw code or name
            date: d.date,
            deviation: (d.ei || 0) + (d.compras || 0) - (d.decomisos || 0) - (d.ventas_teorico || 0)
          }))
          .filter(d => Math.abs(d.deviation) > 0.1)
          .slice(0, 4);
        
        setItemDeviations(sortedItems);
      } else {
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
          hourlyRate: r.hourly_rate || 0
        })));
      } else {
        setHourBudgetRows([]);
      }

      // Cargar horas reales RRHH desde Supabase
      const { data: hoursData } = await supabase
        .from('hr_hour_logs')
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
      setWeeklyHoursLogs(weeklyLogs);

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
      let pyResto = 4.5;
      let pyCafe = 4.4;
      
      if (pySaved) {
        try {
          const parsed = JSON.parse(pySaved);
          if (parsed[branchId]) {
            pyResto = parsed[branchId].restoRating || 4.5;
            pyCafe = parsed[branchId].cafeRating || 4.4;
          }
        } catch(e) {}
      } else {
        // Query database `pedidos_ya_ratings` table
        const { data: dbData } = await supabase
          .from('pedidos_ya_ratings')
          .select('*')
          .eq('month', month);
          
        if (dbData && dbData.length > 0) {
          const matchedResto = dbData.find(row => row.branch_id === `${branchId}_resto` || row.branch_id === branchId);
          const matchedCafe = dbData.find(row => row.branch_id === `${branchId}_cafe`);
          if (matchedResto) pyResto = matchedResto.rating || 4.5;
          if (matchedCafe) pyCafe = matchedCafe.rating || 4.4;
        }
      }
      setPedidosYaRestoRating(pyResto);
      setPedidosYaCafeRating(pyCafe);

      // Google rating from active branch config
      if (activeBranch) {
        setGoogleRating(activeBranch.googleRating || 4.5);
        setGoogleRatingCount(activeBranch.googleRatingCount || 0);
      }

      // Supervision responses for Red/Yellow/Green flags
      try {
        const { data: responses, error: respError } = await supabase
          .from('supervision_responses')
          .select('*')
          .eq('branch_id', branchId)
          .gte('date', `${month}-01`)
          .lte('date', `${month}-31`);

        if (!respError && responses) {
          setSupervisionResponses(responses);
          let redSum = 0, yellowSum = 0, greenSum = 0;
          responses.forEach(r => {
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

  const loadAllData = async () => {
    if (!selectedBranchId) return;
    setLoading(true);
    const branchKey = selectedBranchId === 'all' ? 'bn' : selectedBranchId;
    await Promise.all([
      fetchSalesData(branchKey, selectedMonth),
      fetchDeviations(branchKey, selectedMonth),
      fetchRatingsAndSupervision(branchKey, selectedMonth),
      fetchPerformanceConfigs(branchKey, selectedMonth),
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
        setGoogleRating(activeBranch.googleRating || 4.5);
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
        setGoogleRating(activeBranch.googleRating || 4.5);
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

  const cmvPercentage = useMemo(() => {
    const net = isSimulationMode && manualSalesOverride ? parseFloat(manualSalesOverride) : salesNet;
    if (net <= 0) return 30.2;
    return (totalCMVAmount / net) * 100;
  }, [totalCMVAmount, salesNet, isSimulationMode, manualSalesOverride]);

  // 2. HR Hours calculations
  const positionHoursBreakdown = useMemo(() => {
    return hourBudgetRows.map(row => {
      const positionId = row.roleId || row.positionId;
      const positionName = row.roleLabel || row.positionName;

      // calculate budget for the month
      let budgetedHours = (row.week1 || 0) + (row.week2 || 0) + (row.week3 || 0) + (row.week4 || 0);
      
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

      // calculate actually worked hours from w1-w4
      let actualHours = 0;
      for (let w = 1; w <= 4; w++) {
        const weekEntries = weeklyHoursLogs[`w${w}`] || [];
        // find matching records for this job id or name template
        const match = weekEntries.find((ent: any) => 
          (positionId && ent.positionId === positionId) || 
          (positionName && ent.positionName === positionName) || 
          (positionName && ent.name === positionName)
        );
        if (match) {
          actualHours += (match.definitiveHours !== undefined ? Number(match.definitiveHours) : (match.referenceHours || 0));
        }
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

  const totalHourBudget = useMemo(() => {
    return positionHoursBreakdown.reduce((sum, item) => sum + item.budgeted, 0);
  }, [positionHoursBreakdown]);

  const totalHourWorked = useMemo(() => {
    return positionHoursBreakdown.reduce((sum, item) => sum + item.worked, 0);
  }, [positionHoursBreakdown]);

  const totalHourRemaining = useMemo(() => {
    return totalHourBudget - totalHourWorked;
  }, [totalHourBudget, totalHourWorked]);

  const hourDeviationPercentage = useMemo(() => {
    if (totalHourBudget <= 0) return 0;
    const dev = totalHourWorked - totalHourBudget;
    return (dev / totalHourBudget) * 100;
  }, [totalHourBudget, totalHourWorked]);


  // LIVE VALUES READY FOR VARIABLES IN BONUS
  const liveNetSales = isSimulationMode && manualSalesOverride ? parseFloat(manualSalesOverride) : salesNet;
  const liveCmvValue = isSimulationMode && manualCmvOverride ? parseFloat(manualCmvOverride) : cmvPercentage;
  const liveGoogleScore = isSimulationMode && manualGoogleOverride ? parseFloat(manualGoogleOverride) : googleRating;
  const livePyRestoScore = isSimulationMode && manualPyRestoOverride ? parseFloat(manualPyRestoOverride) : pedidosYaRestoRating;
  const livePyCafeScore = isSimulationMode && manualPyCafeOverride ? parseFloat(manualPyCafeOverride) : pedidosYaCafeRating;
  const liveRedFlags = isSimulationMode && manualRedFlagsOverride ? parseInt(manualRedFlagsOverride) : supervisionFlags.red;

  // Desvío promedio de insumos controlados (desde inventory_logs, columna desvio)
  const averageStockDeviation = useMemo(() => {
    if (!itemDeviations || itemDeviations.length === 0) return 0;
    const total = itemDeviations.reduce((sum: number, d: any) => sum + Math.abs(d.deviation || 0), 0);
    return total / itemDeviations.length;
  }, [itemDeviations]);

  // Desvío de horas vs presupuesto (%)
  const hoursDeviationPct = useMemo(() => {
    let totalPlanned = 0;
    let totalActual = 0;
    if (hourBudgetRows && weeklyHoursLogs) {
      hourBudgetRows.forEach((row: any) => {
        totalPlanned += (row.week1 || 0) + (row.week2 || 0) + (row.week3 || 0) + (row.week4 || 0);
      });
      Object.values(weeklyHoursLogs).forEach((weekLogs: any) => {
        if (Array.isArray(weekLogs)) {
          weekLogs.forEach((log: any) => {
            totalActual += Number(log.hours_rrhh || log.hoursRrhh || log.hoursActual || 0);
          });
        }
      });
    }
    if (totalPlanned === 0) return 0;
    return Math.abs(((totalActual - totalPlanned) / totalPlanned) * 100);
  }, [hourBudgetRows, weeklyHoursLogs]);

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
        red_flag_penalty: 1500,
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
        red_flag_penalty: 1000,
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

  const activeConfigs = useMemo(() => {
    if (performanceConfigs.length > 0) {
      return performanceConfigs;
    }
    return generatedFallbackConfigs;
  }, [performanceConfigs, generatedFallbackConfigs]);

  const calculatedPrizesBreakdown = useMemo(() => {
    const result: Record<string, any> = {};

    ['encargado', 'jefe_cocina', 'segundo_cocina'].forEach(role => {
      let salesGoal = 4500000;
      let redFlagPenalty = 1000;
      let variablesList: any[] = [];
      let isMatched = false;

      if (role === 'segundo_cocina') {
        // Derived from Jefe de Cocina
        const chefConfig = activeConfigs.find(c => c.role === 'jefe_cocina');
        if (chefConfig) {
          salesGoal = chefConfig.sales_goal || chefConfig.salesGoal || 1;
          redFlagPenalty = chefConfig.red_flag_penalty || chefConfig.redFlagPenalty || 0;
          variablesList = chefConfig.variables || [];
          isMatched = true;
        }
      } else {
        const cfg = activeConfigs.find(c => c.role === role);
        if (cfg) {
          salesGoal = cfg.sales_goal || cfg.salesGoal || 1;
          redFlagPenalty = cfg.red_flag_penalty || cfg.redFlagPenalty || 0;
          variablesList = cfg.variables || [];
          isMatched = true;
        }
      }

      // Calculate achievements
      const variablesStatus = variablesList.map(v => {
        let currentValue = 0;
        
        // Match actual metric according to variable identity or name
        const lowerName = v.name.toLowerCase();
        if (lowerName.includes('cmv')) {
          currentValue = liveCmvValue;
        } else if (lowerName.includes('google')) {
          currentValue = liveGoogleScore;
        } else if (lowerName.includes('pedidos') && lowerName.includes('resto')) {
          currentValue = livePyRestoScore;
        } else if (lowerName.includes('pedidos') && lowerName.includes('caf')) {
          currentValue = livePyCafeScore;
        } else if (lowerName.includes('desv') || lowerName.includes('desperdi') || lowerName.includes('insumo')) {
          // Desvío promedio de insumos controlados del mes (en %)
          currentValue = averageStockDeviation;
        } else if (lowerName.includes('hora') || lowerName.includes('presup')) {
          // Desvío de horas vs presupuesto (en %)
          currentValue = hoursDeviationPct;
        } else {
          currentValue = 0;
        }

        const tier = getAchievedTier(v, currentValue);
        return {
          variableId: v.id,
          variableName: v.name,
          currentValue,
          unit: v.unit,
          achievedTier: tier,
          prize: tier ? tier.prize : 0,
          targetText: v.tiers ? v.tiers.map((t: any) => `${v.isLowerBetter ? '<=': '>='} ${t.threshold}${v.unit} ($${t.prize.toLocaleString()})`).join(' | ') : 'Sin escala'
        };
      });

      const rawPrizesTotal = variablesStatus.reduce((sum, v) => sum + v.prize, 0);
      const isSalesGoalMet = liveNetSales >= salesGoal;
      const totalPenaltyVal = liveRedFlags * redFlagPenalty;
      let finalCalculatedPrize = isSalesGoalMet ? Math.max(0, rawPrizesTotal - totalPenaltyVal) : 0;

      if (role === 'segundo_cocina') {
        // Segundo de cocina gets exactly 80% of Chef de cocina prize!
        const chefRawTotal = result['jefe_cocina']?.rawPrizesTotal || 0;
        const chefPenalty = result['jefe_cocina']?.totalPenaltyVal || 0;
        const chefSalesMet = result['jefe_cocina']?.isSalesGoalMet || false;
        const chefFinal = chefSalesMet ? Math.max(0, chefRawTotal - chefPenalty) : 0;
        finalCalculatedPrize = Math.round(chefFinal * 0.8);
      }

      result[role] = {
        roleLabel: role === 'encargado' ? 'Premio Encargado' : role === 'jefe_cocina' ? 'Premio Jefe de Cocina' : 'Premio Segundo de Cocina (80%)',
        salesGoal,
        isSalesGoalMet,
        redFlagPenalty,
        totalPenaltyVal,
        rawPrizesTotal,
        finalCalculatedPrize,
        variablesStatus,
        isMatched
      };
    });

    return result;
  }, [activeConfigs, liveNetSales, liveCmvValue, liveGoogleScore, livePyRestoScore, livePyCafeScore, liveRedFlags, averageStockDeviation, hoursDeviationPct]);

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
                onChange={(e) => onBranchChange(e.target.value)}
                className="bg-bg-accent text-text-main text-[11px] font-bold border border-border-dim rounded-md px-3 py-2 outline-none focus:border-brand-500 appearance-none pr-8 cursor-pointer uppercase font-mono"
              >
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
        </div>
      </div>

      {/* SIMULATOR AND OVERRIDE MODE FOR USER EXPERIENCE PREVIEW */}
      <div className="bg-brand-500/5 border border-brand-500/20 p-4 rounded bg-gradient-to-r from-bg-sidebar/90 to-brand-500/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Sliders size={18} className="text-brand-500 shrink-0" />
            <div>
              <p className="text-[11px] font-black text-text-main uppercase">Panel de Configuración de Calibrado / Simulación</p>
              <p className="text-[9px] text-text-dim uppercase">Permite al encargado proyectar ventas, CMV y estrellas de calificaciones para previsualizar impacto en premios</p>
            </div>
          </div>
          <button 
            onClick={() => {
              setIsSimulationMode(!isSimulationMode);
              if(!isSimulationMode) {
                // Populate default overrides
                setManualSalesOverride(salesNet.toString());
                setManualCmvOverride(cmvPercentage.toFixed(1));
                setManualGoogleOverride(googleRating.toFixed(1));
                setManualPyRestoOverride(pedidosYaRestoRating.toFixed(1));
                setManualPyCafeOverride(pedidosYaCafeRating.toFixed(1));
                setManualRedFlagsOverride(supervisionFlags.red.toString());
              }
            }}
            className={cn(
              "px-4 py-1.5 rounded text-[10px] font-black uppercase tracking-widest cursor-pointer border transition-all",
              isSimulationMode 
                ? "bg-brand-500 text-black border-brand-500" 
                : "bg-bg-accent text-text-dim border-border-dim hover:text-text-main"
            )}
          >
            {isSimulationMode ? "Desactivar Calibrador" : "Simular / Calibrar Proyección"}
          </button>
        </div>

        {isSimulationMode && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-4 pt-4 border-t border-brand-500/20"
          >
            <div className="space-y-1">
              <label className="text-[8px] font-black text-text-dim uppercase">Sales Net ($)</label>
              <input 
                type="number"
                value={manualSalesOverride}
                onChange={(e) => setManualSalesOverride(e.target.value)}
                className="w-full bg-bg-sidebar border border-border-dim rounded px-2.5 py-1.5 text-[11px] font-mono text-text-main outline-none focus:border-brand-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-text-dim uppercase">CMV (%)</label>
              <input 
                type="number"
                step="0.1"
                value={manualCmvOverride}
                onChange={(e) => setManualCmvOverride(e.target.value)}
                className="w-full bg-bg-sidebar border border-border-dim rounded px-2.5 py-1.5 text-[11px] font-mono text-text-main outline-none focus:border-brand-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-text-dim uppercase">Google Score</label>
              <input 
                type="number"
                step="0.1"
                value={manualGoogleOverride}
                onChange={(e) => setManualGoogleOverride(e.target.value)}
                className="w-full bg-bg-sidebar border border-border-dim rounded px-2.5 py-1.5 text-[11px] font-mono text-text-main outline-none focus:border-brand-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-text-dim uppercase">PeYa Restó (1-5)</label>
              <input 
                type="number"
                step="0.1"
                value={manualPyRestoOverride}
                onChange={(e) => setManualPyRestoOverride(e.target.value)}
                className="w-full bg-bg-sidebar border border-border-dim rounded px-2.5 py-1.5 text-[11px] font-mono text-text-main outline-none focus:border-brand-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-text-dim uppercase">PeYa Café (1-5)</label>
              <input 
                type="number"
                step="0.1"
                value={manualPyCafeOverride}
                onChange={(e) => setManualPyCafeOverride(e.target.value)}
                className="w-full bg-bg-sidebar border border-border-dim rounded px-2.5 py-1.5 text-[11px] font-mono text-text-main outline-none focus:border-brand-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-text-dim uppercase">Banderas Rojas</label>
              <input 
                type="number"
                value={manualRedFlagsOverride}
                onChange={(e) => setManualRedFlagsOverride(e.target.value)}
                className="w-full bg-bg-sidebar border border-border-dim rounded px-2.5 py-1.5 text-[11px] font-mono text-text-main outline-none focus:border-brand-500"
              />
            </div>
          </motion.div>
        )}
      </div>

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
            {isSimulationMode && (
              <span className="text-[8px] text-brand-500 font-black uppercase">Simulado</span>
            )}
          </div>
          <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-border-dim/40 text-[9px] text-text-dim font-bold font-mono">
            <span>BRUTAS (TICKETS):</span>
            <span className="text-text-main">${salesGross.toLocaleString()}</span>
          </div>
        </div>

        {/* CMV Monthly Column */}
        <div className="bg-bg-sidebar border border-border-dim p-5 rounded relative overflow-hidden group hover:border-emerald-500/40 transition-all shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] font-black uppercase tracking-wider text-text-dim">Compras & CMV</span>
            <TrendingDown size={14} className="text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <h2 className="text-2xl font-mono font-black text-text-main">
              ${totalCMVAmount.toLocaleString()}
            </h2>
            <span className="text-xs font-mono font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
              {liveCmvValue.toFixed(1)}%
            </span>
          </div>
          <p className="text-[8px] text-text-dim uppercase font-bold mt-1.5 font-mono">ΕΙ: ${cmvInitial.toLocaleString()} + Compras + Mov - EF: ${cmvFinal.toLocaleString()}</p>
        </div>

        {/* HR Hour Deviation Column */}
        <div className="bg-bg-sidebar border border-border-dim p-5 rounded relative overflow-hidden group hover:border-blue-500/40 transition-all shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] font-black uppercase tracking-wider text-text-dim">Control Horas (RRHH)</span>
            <Clock size={14} className="text-blue-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <h2 className="text-2xl font-mono font-black text-text-main">
              {Math.abs(totalHourWorked - totalHourBudget)} hs
            </h2>
            <span className={cn(
              "text-xs font-mono font-bold px-1.5 py-0.5 rounded",
              hourDeviationPercentage <= 0 ? "text-emerald-500 bg-emerald-500/10" : "text-red-400 bg-red-400/10"
            )}>
              {hourDeviationPercentage > 0 ? `+${hourDeviationPercentage.toFixed(1)}%` : `${hourDeviationPercentage.toFixed(1)}%`}
            </span>
          </div>
          <p className="text-[8px] text-text-dim uppercase font-bold mt-1.5">Desvío vs Presupuesto ideal en el mes</p>
        </div>

        {/* Supervision Flag Penalties Column */}
        <div className="bg-bg-sidebar border border-border-dim p-5 rounded relative overflow-hidden group hover:border-red-500/40 transition-all shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] font-black uppercase tracking-wider text-text-dim">Banderas Rojas</span>
            <Flag size={14} className="text-red-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <h2 className="text-2xl font-mono font-black text-red-500">
              {liveRedFlags} Rojas
            </h2>
            <span className="text-[9px] font-bold text-text-dim uppercase font-mono">
              ({supervisionFlags.yellow} Am | {supervisionFlags.green} Ve)
            </span>
          </div>
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
                  <p className="text-[9px] text-text-dim uppercase font-bold mt-0.5">Disponibilidad y consumo de horas del mes actual</p>
                </div>
              </div>
              <div className="text-right">
                <span className="block text-[11px] font-mono font-black text-text-main">
                  {totalHourWorked} / {totalHourBudget} hs
                </span>
                <span className="block text-[8px] text-text-dim uppercase font-bold">Consumido (${totalHourRemaining > 0 ? `le quedan ${totalHourRemaining} hs` : `exceso de ${Math.abs(totalHourRemaining)} hs`})</span>
              </div>
            </div>

            <div className="space-y-4">
              {positionHoursBreakdown.map((item) => {
                const isOver = item.worked > item.budgeted;
                return (
                  <div key={item.positionId} className="space-y-1 bg-bg-accent/20 p-3 rounded border border-border-dim/40 hover:border-brand-500/20 transition-all">
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
                    <div className="w-full bg-bg-accent h-1.5 rounded-full overflow-hidden mt-1">
                      <div 
                        className={cn("h-full transition-all duration-500", isOver ? "bg-red-500" : "bg-blue-500")}
                        style={{ width: `${Math.min(100, item.percent)}%` }}
                      />
                    </div>
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

          {/* Planta de Personal en Planta (Sólo Lectura) */}
          <ReadOnlyPlantaView 
            selectedBranchId={selectedBranchId}
            branches={branches}
            selectedMonth={selectedMonth}
          />

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

            <div className="flex items-center justify-between border-b border-border-dim pb-4 mb-4">
              <div className="flex items-center gap-2">
                <Award size={18} className="text-brand-500" />
                <div>
                  <h3 className="text-xs font-black uppercase text-text-main tracking-wider">Cálculo de Premios Operativos</h3>
                  <p className="text-[8px] text-text-dim uppercase font-bold mt-0.5">Cálculo automático de bonos según variables met</p>
                </div>
              </div>
              {onNavigateToTab && (
                <button 
                  onClick={() => onNavigateToTab('performance')}
                  className="bg-brand-500/10 text-brand-500 border border-brand-500/20 px-2 py-1 rounded text-[8px] font-black uppercase tracking-wider hover:bg-brand-500/20 transition-all cursor-pointer"
                >
                  Configurar
                </button>
              )}
            </div>

            {/* List calculated bonuses */}
            <div className="space-y-6">
              {['encargado', 'jefe_cocina', 'segundo_cocina'].map(role => {
                const breakdown = calculatedPrizesBreakdown[role];
                if (!breakdown) return null;

                const hasBlocker = liveNetSales < breakdown.salesGoal;

                return (
                  <div key={role} className="space-y-2 pb-4 border-b border-border-dim/40 last:border-none last:pb-0">
                    <div className="flex justify-between items-baseline">
                      <div>
                        <span className="text-[10px] font-extrabold text-brand-500 uppercase tracking-wider">{breakdown.roleLabel}</span>
                        {role === 'segundo_cocina' && (
                          <span className="block text-[8px] text-text-dim uppercase">80% correspondiente al Jefe</span>
                        )}
                      </div>
                      <div className="text-right font-mono">
                        <span className={cn(
                          "text-xl font-black",
                          hasBlocker ? "text-text-dim/60 line-through" : "text-text-main"
                        )}>
                          ${breakdown.finalCalculatedPrize.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Sales Trigger Notification */}
                    {hasBlocker ? (
                      <div className="bg-red-500/15 border border-red-500/30 p-2 rounded text-[8px] text-red-400 font-extrabold uppercase flex items-center gap-1.5">
                        <XCircle size={10} /> BLOQUEADO (Metas Ventas no alcanzó ${breakdown.salesGoal.toLocaleString()})
                      </div>
                    ) : (
                      <div className="bg-emerald-500/10 p-2 rounded text-[8px] text-emerald-400 font-extrabold uppercase flex items-center gap-1.5 border border-emerald-500/20">
                        <CheckCircle2 size={10} /> Meta mínima ventas superada
                      </div>
                    )}

                    {/* Show breakdown of target items (only for primary configurations) */}
                    {role !== 'segundo_cocina' && breakdown.variablesStatus && breakdown.variablesStatus.length > 0 && (
                      <div className="space-y-1 pl-1 bg-bg-accent/40 rounded p-2.5">
                        <p className="text-[7.5px] font-black text-text-dim uppercase tracking-wider mb-1">Desglose de Objetivos:</p>
                        {breakdown.variablesStatus.map((v: any) => (
                          <div key={v.variableId} className="flex justify-between text-[8px] leading-relaxed uppercase">
                            <span className="text-text-dim font-bold truncate max-w-[130px]">{v.variableName}:</span>
                            <span className="font-mono flex items-center gap-1">
                              <span className="text-text-main font-black">{v.currentValue?.toFixed(1)}{v.unit}</span>
                              <span className="text-text-dim italic">({v.achievedTier ? `+$${v.achievedTier.prize.toLocaleString()}` : '$0'})</span>
                            </span>
                          </div>
                        ))}

                        {/* Penalty rows */}
                        {breakdown.totalPenaltyVal > 0 && (
                          <div className="flex justify-between text-[8px] uppercase border-t border-border-dim/40 pt-1 mt-1 text-red-400 font-extrabold">
                            <span>Descuento Banderas Rojas ({liveRedFlags} * ${breakdown.redFlagPenalty}):</span>
                            <span className="font-mono">-${breakdown.totalPenaltyVal.toLocaleString()}</span>
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
    </motion.div>
  );
}
