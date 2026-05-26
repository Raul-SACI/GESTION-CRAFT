import React, { useState, useEffect, useMemo } from 'react';
import { 
  Star, 
  Save, 
  RefreshCw, 
  TrendingUp, 
  Award, 
  AlertCircle, 
  Building2, 
  Calendar,
  ChevronLeft,
  ChevronRight,
  Info,
  Coffee,
  Database
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { Branch } from '../types';
import { supabase } from '../lib/supabase';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

interface PedidosYaViewProps {
  branches: Branch[];
}

interface TwoChannelRating {
  branch_id: string;
  month: string; // YYYY-MM
  resto_week_1: number | null;
  resto_week_2: number | null;
  resto_week_3: number | null;
  resto_week_4: number | null;
  cafe_week_1: number | null;
  cafe_week_2: number | null;
  cafe_week_3: number | null;
  cafe_week_4: number | null;
}

export default function PedidosYaView({ branches }: PedidosYaViewProps) {
  const activeBranches = useMemo(() => {
    return branches.filter(b => b.id !== 'all' && b.id !== 'virtual' && b.isActive);
  }, [branches]);

  // Selected Period state (YYYY-MM)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mm}`;
  });

  const [ratings, setRatings] = useState<Record<string, TwoChannelRating>>({});
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load physical ratings for chosen month
  const fetchRatings = async () => {
    setLoading(true);
    try {
      // Default empty state for all active branches
      const defaultState: Record<string, TwoChannelRating> = {};
      activeBranches.forEach(b => {
        defaultState[b.id] = {
          branch_id: b.id,
          month: selectedMonth,
          resto_week_1: null,
          resto_week_2: null,
          resto_week_3: null,
          resto_week_4: null,
          cafe_week_1: null,
          cafe_week_2: null,
          cafe_week_3: null,
          cafe_week_4: null
        };
      });

      // 1. Try reading from LocalStorage as fallback
      const localKey = `craft_pedidos_ya_ratings_v2_${selectedMonth}`;
      let cachedRatings: Record<string, TwoChannelRating> | null = null;
      try {
        const localData = localStorage.getItem(localKey);
        if (localData) {
          cachedRatings = JSON.parse(localData);
        }
      } catch (err) {
        console.error('Error reading localStorage for Pedidos Ya:', err);
      }

      // 2. Try fetching from Supabase Table `pedidos_ya_ratings`
      const dbRatings: Record<string, TwoChannelRating> = {};
      try {
        const { data, error } = await supabase
          .from('pedidos_ya_ratings')
          .select('*')
          .eq('month', selectedMonth);

        if (!error && data && data.length > 0) {
          data.forEach((row: any) => {
            const rawBranchId = row.branch_id as string;
            let branchId = rawBranchId;
            let channel: 'resto' | 'cafe' = 'resto';

            if (rawBranchId.endsWith('_resto')) {
              branchId = rawBranchId.slice(0, -6);
              channel = 'resto';
            } else if (rawBranchId.endsWith('_cafe')) {
              branchId = rawBranchId.slice(0, -5);
              channel = 'cafe';
            }

            if (!dbRatings[branchId]) {
              dbRatings[branchId] = {
                branch_id: branchId,
                month: selectedMonth,
                resto_week_1: null,
                resto_week_2: null,
                resto_week_3: null,
                resto_week_4: null,
                cafe_week_1: null,
                cafe_week_2: null,
                cafe_week_3: null,
                cafe_week_4: null,
              };
            }

            if (channel === 'resto') {
              dbRatings[branchId].resto_week_1 = row.week_1 !== null ? Number(row.week_1) : null;
              dbRatings[branchId].resto_week_2 = row.week_2 !== null ? Number(row.week_2) : null;
              dbRatings[branchId].resto_week_3 = row.week_3 !== null ? Number(row.week_3) : null;
              dbRatings[branchId].resto_week_4 = row.week_4 !== null ? Number(row.week_4) : null;
            } else {
              dbRatings[branchId].cafe_week_1 = row.week_1 !== null ? Number(row.week_1) : null;
              dbRatings[branchId].cafe_week_2 = row.week_2 !== null ? Number(row.week_2) : null;
              dbRatings[branchId].cafe_week_3 = row.week_3 !== null ? Number(row.week_3) : null;
              dbRatings[branchId].cafe_week_4 = row.week_4 !== null ? Number(row.week_4) : null;
            }
          });
        }
      } catch (dbErr) {
        console.warn('Supabase fetch failed, relying on local cache:', dbErr);
      }

      // Merge defaults -> local -> DB
      const finalRatings = { ...defaultState };
      if (cachedRatings) {
        Object.assign(finalRatings, cachedRatings);
      }
      if (Object.keys(dbRatings).length > 0) {
        Object.assign(finalRatings, dbRatings);
      }

      setRatings(finalRatings);

      // Populate raw inputs with Argentine formatting (4,5)
      const initialRaw: Record<string, string> = {};
      Object.keys(finalRatings).forEach(branchId => {
        const item = finalRatings[branchId];
        const channels: ('resto' | 'cafe')[] = ['resto', 'cafe'];
        channels.forEach(ch => {
          ['week_1', 'week_2', 'week_3', 'week_4'].forEach(wk => {
            const val = item[`${ch}_${wk}` as keyof TwoChannelRating] as number | null;
            initialRaw[`${branchId}_${ch}_${wk}`] = val !== null && val !== undefined 
              ? val.toFixed(1).replace('.', ',') 
              : '';
          });
        });
      });
      setRawInputs(initialRaw);

    } catch (err) {
      console.error('Error in fetchRatings flow:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeBranches.length > 0) {
      fetchRatings();
    }
  }, [selectedMonth, activeBranches]);

  // Handle rating typing
  const handleRatingInputChange = (branchId: string, channel: 'resto' | 'cafe', week: 'week_1' | 'week_2' | 'week_3' | 'week_4', typedValue: string) => {
    const rawKey = `${branchId}_${channel}_${week}`;
    
    // Only allow typing digits, commas and dots
    const sanitizedInput = typedValue.replace(/[^0-9.,]/g, '');
    
    setRawInputs(prev => ({
      ...prev,
      [rawKey]: sanitizedInput
    }));

    // Update ratings numeric state instantly if it forms a valid decimal number
    const normStr = sanitizedInput.replace(',', '.');
    if (normStr === '') {
      setRatings(prev => ({
        ...prev,
        [branchId]: {
          ...prev[branchId],
          [`${channel}_${week}`]: null
        }
      }));
      return;
    }

    const numericVal = parseFloat(normStr);
    if (!isNaN(numericVal)) {
      if (numericVal >= 1.0 && numericVal <= 5.0) {
        // Enforce max 1 decimal point
        const rounded = Math.round(numericVal * 10) / 10;
        setRatings(prev => ({
          ...prev,
          [branchId]: {
            ...prev[branchId],
            [`${channel}_${week}`]: rounded
          }
        }));
      }
    }
  };

  // Finalize input value on focus out / blur
  const handleInputBlur = (branchId: string, channel: 'resto' | 'cafe', week: 'week_1' | 'week_2' | 'week_3' | 'week_4') => {
    const rawKey = `${branchId}_${channel}_${week}`;
    const value = rawInputs[rawKey] || '';
    const normStr = value.replace(',', '.');

    if (normStr === '') {
      setRatings(prev => ({
        ...prev,
        [branchId]: {
          ...prev[branchId],
          [`${channel}_${week}`]: null
        }
      }));
      return;
    }

    const valNumeric = parseFloat(normStr);
    if (isNaN(valNumeric) || valNumeric < 1.0 || valNumeric > 5.0) {
      // Invalid input - clear
      setRawInputs(prev => ({ ...prev, [rawKey]: '' }));
      setRatings(prev => ({
        ...prev,
        [branchId]: {
          ...prev[branchId],
          [`${channel}_${week}`]: null
        }
      }));
    } else {
      // Round to 1 decimal place and format output
      const rounded = Math.round(valNumeric * 10) / 10;
      setRawInputs(prev => ({ ...prev, [rawKey]: rounded.toFixed(1).replace('.', ',') }));
      setRatings(prev => ({
        ...prev,
        [branchId]: {
          ...prev[branchId],
          [`${channel}_${week}`]: rounded
        }
      }));
    }
  };

  // Save changes
  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const payloads: any[] = [];
      Object.values(ratings).forEach((item: TwoChannelRating) => {
        // Resto row
        payloads.push({
          branch_id: `${item.branch_id}_resto`,
          month: item.month,
          week_1: item.resto_week_1,
          week_2: item.resto_week_2,
          week_3: item.resto_week_3,
          week_4: item.resto_week_4
        });
        // Café row
        payloads.push({
          branch_id: `${item.branch_id}_cafe`,
          month: item.month,
          week_1: item.cafe_week_1,
          week_2: item.cafe_week_2,
          week_3: item.cafe_week_3,
          week_4: item.cafe_week_4
        });
      });

      // Save locally
      const localKey = `craft_pedidos_ya_ratings_v2_${selectedMonth}`;
      try {
        localStorage.setItem(localKey, JSON.stringify(ratings));
      } catch (localErr) {
        console.error('Error caching ratings locally:', localErr);
      }

      // Try sending to Supabase
      const { error } = await supabase
        .from('pedidos_ya_ratings')
        .upsert(payloads, { onConflict: 'branch_id,month' });

      if (error) {
        console.warn('Supabase save error, but fallback succeeded locally:', error);
        alert('Calificaciones guardadas de manera local en el navegador.');
      } else {
        alert('Calificaciones de Resto y Café guardadas con éxito en el servidor.');
      }
      fetchRatings();
    } catch (err) {
      console.error('Error saving Pedidos Ya ratings:', err);
      alert('Error en conexión. Datos guardados en la memoria local.');
    } finally {
      setSaving(false);
    }
  };

  // Scoring badge visual state
  const getRatingStyle = (rating: number | null) => {
    if (rating === null) return { bg: 'bg-bg-accent/40 text-text-dim border-border-dim/40', label: 'PENDIENTE', textColor: 'text-text-dim' };
    if (rating >= 4.5) return { bg: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', label: 'EXCELENTE', textColor: 'text-emerald-500' };
    if (rating >= 4.0) return { bg: 'bg-lime-500/10 text-lime-400 border-lime-500/20', label: 'BUENO', textColor: 'text-lime-400' };
    if (rating >= 3.5) return { bg: 'bg-amber-500/10 text-amber-500 border-amber-500/20', label: 'REGULAR', textColor: 'text-amber-500' };
    return { bg: 'bg-red-500/10 text-red-500 border-red-500/20', label: 'CRÍTICO', textColor: 'text-red-500' };
  };

  // Calculate stats for both Resto & Cafe
  const stats = useMemo(() => {
    let restoSum = 0;
    let restoCount = 0;
    let cafeSum = 0;
    let cafeCount = 0;
    
    let highestScore = -1;
    let starBranchName = 'Ninguna';
    let starChannel = 'Resto';

    let lowestScore = 6;
    let riskBranchName = 'Ninguna';
    let riskChannel = 'Resto';

    activeBranches.forEach(b => {
      const row = ratings[b.id];
      if (!row) return;

      const restoWeeks = [row.resto_week_1, row.resto_week_2, row.resto_week_3, row.resto_week_4].filter((w): w is number => w !== null);
      if (restoWeeks.length > 0) {
        const avg = restoWeeks.reduce((acc, c) => acc + c, 0) / restoWeeks.length;
        restoSum += avg;
        restoCount++;

        if (avg > highestScore) {
          highestScore = avg;
          starBranchName = b.name;
          starChannel = 'Resto';
        }
        if (avg < lowestScore) {
          lowestScore = avg;
          riskBranchName = b.name;
          riskChannel = 'Resto';
        }
      }

      const cafeWeeks = [row.cafe_week_1, row.cafe_week_2, row.cafe_week_3, row.cafe_week_4].filter((w): w is number => w !== null);
      if (cafeWeeks.length > 0) {
        const avg = cafeWeeks.reduce((acc, c) => acc + c, 0) / cafeWeeks.length;
        cafeSum += avg;
        cafeCount++;

        if (avg > highestScore) {
          highestScore = avg;
          starBranchName = b.name;
          starChannel = 'Café';
        }
        if (avg < lowestScore) {
          lowestScore = avg;
          riskBranchName = b.name;
          riskChannel = 'Café';
        }
      }
    });

    return {
      restoAvg: restoCount > 0 ? restoSum / restoCount : null,
      cafeAvg: cafeCount > 0 ? cafeSum / cafeCount : null,
      starBranch: starBranchName,
      starChannel: starChannel,
      starVal: highestScore !== -1 ? highestScore : null,
      riskBranch: riskBranchName,
      riskChannel: riskChannel,
      riskVal: lowestScore !== 6 ? lowestScore : null,
    };
  }, [ratings, activeBranches]);

  // Generate charts trend data for both channels
  const chartData = useMemo(() => {
    const weeksList = [
      { name: 'Semana 1', key: 'week_1' as const },
      { name: 'Semana 2', key: 'week_2' as const },
      { name: 'Semana 3', key: 'week_3' as const },
      { name: 'Semana 4', key: 'week_4' as const },
    ];

    return weeksList.map(week => {
      const entry: any = { name: week.name };
      activeBranches.forEach(b => {
        const ratingResto = ratings[b.id]?.[`resto_${week.key}` as keyof TwoChannelRating];
        const ratingCafe = ratings[b.id]?.[`cafe_${week.key}` as keyof TwoChannelRating];
        entry[`${b.name} (Resto)`] = ratingResto !== null ? ratingResto : undefined;
        entry[`${b.name} (Café)`] = ratingCafe !== null ? ratingCafe : undefined;
      });
      return entry;
    });
  }, [ratings, activeBranches]);

  // Assign nice distinct colors
  const chartLines = useMemo(() => {
    const linesList: { dataKey: string; color: string }[] = [];
    const colors = ['#f43f5e', '#ec4899', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6'];
    activeBranches.forEach((b, idx) => {
      const c = colors[idx % colors.length];
      linesList.push({ dataKey: `${b.name} (Resto)`, color: c });
      linesList.push({ dataKey: `${b.name} (Café)`, color: `${c}dd` }); // lighter dash
    });
    return linesList;
  }, [activeBranches]);

  const handlePrevMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const mm = String(prevDate.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${prevDate.getFullYear()}-${mm}`);
  };

  const handleNextMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const nextDate = new Date(year, month, 1);
    const mm = String(nextDate.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${nextDate.getFullYear()}-${mm}`);
  };

  const hasLoadedRatings = Object.keys(ratings).length > 0;

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="p-6 bg-bg-sidebar border border-border-dim rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-rose-500/10 rounded-xl text-rose-500 hidden sm:block shrink-0">
            <Star size={24} className="fill-rose-500/20 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-rose-500/10 text-[8px] font-black text-rose-500 rounded uppercase tracking-widest border border-rose-500/20">Pedidos Ya Delivery</span>
            </div>
            <h2 className="text-lg font-black text-text-main uppercase tracking-tight mt-1.5 flex items-center gap-2">
              Calificaciones de Canales - Pedidos Ya
            </h2>
            <p className="text-[10px] text-text-dim font-bold uppercase tracking-wider mt-0.5">
              Carga y control semanal de valoraciones para los canales **Restó** y **Café** (1,0 a 5,0)
            </p>
          </div>
        </div>

        {/* Month Selector Controls */}
        <div className="flex items-center gap-2 bg-bg-accent/40 p-1.5 rounded-lg border border-border-dim/80">
          <button 
            onClick={handlePrevMonth}
            className="p-1.5 hover:bg-bg-sidebar hover:text-white rounded transition-colors text-text-dim"
            title="Mes Anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="flex items-center gap-2 px-2">
            <Calendar size={14} className="text-rose-500 shrink-0" />
            <input 
              type="month" 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-text-main text-[11px] font-black uppercase outline-none focus:ring-0 w-[120px] cursor-pointer text-center"
            />
          </div>
          <button 
            onClick={handleNextMonth}
            className="p-1.5 hover:bg-bg-sidebar hover:text-white rounded transition-colors text-text-dim"
            title="Mes Siguiente"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Promedio General Canales */}
        <div className="p-5 bg-bg-sidebar border border-border-dim rounded-xl shadow-lg relative overflow-hidden flex flex-col justify-between h-[120px]">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[9px] font-black text-text-dim uppercase tracking-widest">PROMEDIADOS GLOBAL</span>
              <p className="text-[8.5px] text-text-dim/80 font-bold uppercase tracking-wider mt-0.5">Resultado mensual consolidado</p>
            </div>
            <div className="p-2 bg-rose-500/10 rounded-lg text-rose-500">
              <Star size={16} className="fill-rose-500/20" />
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex flex-col">
              <span className="text-[8px] font-black text-rose-400 uppercase">🍔 RESTÓ</span>
              <span className="text-xl font-black text-text-main font-mono">
                {stats.restoAvg !== null ? `${stats.restoAvg.toFixed(2).replace('.', ',')}` : '---'}
              </span>
            </div>
            <div className="flex flex-col border-l border-border-dim/40 pl-4">
              <span className="text-[8px] font-black text-amber-400 uppercase">☕ CAFÉ</span>
              <span className="text-xl font-black text-text-main font-mono">
                {stats.cafeAvg !== null ? `${stats.cafeAvg.toFixed(2).replace('.', ',')}` : '---'}
              </span>
            </div>
          </div>
          <div className="absolute right-[-10px] bottom-[-15px] text-text-dim/5 pointer-events-none select-none">
            <Star size={100} className="fill-current" />
          </div>
        </div>

        {/* Sucursal Estrella (Mejor Canal) */}
        <div className="p-5 bg-bg-sidebar border border-border-dim rounded-xl shadow-lg relative overflow-hidden flex flex-col justify-between h-[120px]">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[9px] font-black text-text-dim uppercase tracking-widest">CANAL MÁS VALORADO</span>
              <p className="text-[8.5px] text-text-dim/80 font-bold uppercase tracking-wider mt-0.5">Mejor promedio acumulado</p>
            </div>
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
              <Award size={16} />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-black text-text-main uppercase tracking-tight truncate max-w-[200px]">
              {stats.starBranch}
            </span>
            {stats.starVal !== null && (
              <span className="text-xs font-bold font-mono text-emerald-500 flex items-center gap-1 mt-1 uppercase">
                ★ {stats.starVal.toFixed(2).replace('.', ',')} en {stats.starChannel}
              </span>
            )}
          </div>
          <div className="absolute right-[-10px] bottom-[-15px] text-text-dim/5 pointer-events-none select-none">
            <Award size={100} />
          </div>
        </div>

        {/* Alerta Desempeño Crítico */}
        <div className="p-5 bg-bg-sidebar border border-border-dim rounded-xl shadow-lg relative overflow-hidden flex flex-col justify-between h-[120px]">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[9px] font-black text-text-dim uppercase tracking-widest">ALERTA DE REVISIÓN</span>
              <p className="text-[8.5px] text-text-dim/80 font-bold uppercase tracking-wider mt-0.5">Canal con menor puntaje</p>
            </div>
            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
              <AlertCircle size={16} />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-black text-text-main uppercase tracking-tight truncate max-w-[200px]">
              {stats.riskVal !== null && stats.riskVal < 4.0 ? stats.riskBranch : 'Todos los canales en regla'}
            </span>
            {stats.riskVal !== null && (
              <span className={cn(
                "text-xs font-bold font-mono flex items-center gap-1 mt-1 uppercase",
                stats.riskVal < 4.0 ? "text-amber-500" : "text-text-dim"
              )}>
                ★ {stats.riskVal.toFixed(2).replace('.', ',')} en {stats.riskChannel}
              </span>
            )}
          </div>
          <div className="absolute right-[-10px] bottom-[-15px] text-text-dim/5 pointer-events-none select-none">
            <AlertCircle size={100} />
          </div>
        </div>
      </div>

      {/* Main Grid: Forms & Visualizers */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Rating Inputs Table */}
        <div className="lg:col-span-8 bg-bg-sidebar border border-border-dim rounded-xl shadow-xl overflow-hidden flex flex-col">
          <div className="p-5 border-b border-border-dim/60 bg-bg-accent/15 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-xs font-black text-text-main uppercase tracking-wider flex items-center gap-2">
                <Building2 size={15} className="text-rose-500" />
                Ingreso de Calificaciones por Canal
              </h3>
              <p className="text-[9px] text-text-dim font-bold uppercase tracking-widest mt-0.5">Formatos válidos: 1,0 a 5,0 (Por ej: 4,4 o 4,8). 4 semanas mensuales.</p>
            </div>
            
            <button
              onClick={handleSaveAll}
              disabled={saving || !hasLoadedRatings}
              className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-rose-500/10"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              <span>{saving ? 'Guardando...' : 'Guardar Periodo'}</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <RefreshCw size={24} className="animate-spin text-rose-500" />
                <span className="text-[10px] text-text-dim font-black uppercase tracking-widest">Cargando Calificaciones...</span>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border-dim/60 bg-bg-accent/10 whitespace-nowrap">
                    <th className="p-4 text-[9px] font-black uppercase text-text-dim tracking-widest">Sucursal</th>
                    <th className="p-4 text-[9px] font-black uppercase text-text-dim tracking-widest">Canal</th>
                    <th className="p-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">SEM 1</th>
                    <th className="p-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">SEM 2</th>
                    <th className="p-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">SEM 3</th>
                    <th className="p-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">SEM 4</th>
                    <th className="p-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-right">Promedio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dim/30">
                  {activeBranches.map(branch => {
                    const rowData = ratings[branch.id] || {
                      branch_id: branch.id,
                      month: selectedMonth,
                      resto_week_1: null, resto_week_2: null, resto_week_3: null, resto_week_4: null,
                      cafe_week_1: null, cafe_week_2: null, cafe_week_3: null, cafe_week_4: null
                    };

                    // Resto Calculation and Styling
                    const restoVals = [rowData.resto_week_1, rowData.resto_week_2, rowData.resto_week_3, rowData.resto_week_4].filter((w): w is number => w !== null);
                    const restoAvg = restoVals.length > 0 ? restoVals.reduce((sum, v) => sum + v, 0) / restoVals.length : null;
                    const styleResto = getRatingStyle(restoAvg);

                    // Café Calculation and Styling
                    const cafeVals = [rowData.cafe_week_1, rowData.cafe_week_2, rowData.cafe_week_3, rowData.cafe_week_4].filter((w): w is number => w !== null);
                    const cafeAvg = cafeVals.length > 0 ? cafeVals.reduce((sum, v) => sum + v, 0) / cafeVals.length : null;
                    const styleCafe = getRatingStyle(cafeAvg);

                    return (
                      <React.Fragment key={branch.id}>
                        {/* RESTO ROW */}
                        <tr className="hover:bg-bg-accent/5 select-none transition-colors border-t border-border-dim/40 bg-bg-accent/5">
                          {/* Span Branch Column */}
                          <td className="p-4 min-w-[150px] font-black border-r border-border-dim/30" rowSpan={2}>
                            <div className="flex flex-col justify-center h-full">
                              <span className="text-[12px] font-black text-text-main uppercase tracking-tight">{branch.name}</span>
                              <span className="text-[8px] text-text-dim font-bold uppercase tracking-widest mt-0.5">{branch.location || 'Tucumán'}</span>
                              <div className="mt-2 text-[7.5px] font-black text-rose-500/80 uppercase tracking-widest flex items-center gap-1">
                                <Database size={10} /> 2 Canales PedidosYa
                              </div>
                            </div>
                          </td>

                          {/* Channel Badge Column */}
                          <td className="p-4 min-w-[120px]">
                            <div className="flex items-center gap-1.5 font-bold text-[9px] text-rose-500 uppercase tracking-wider bg-rose-500/5 px-2.5 py-1 rounded w-fit border border-rose-500/15">
                              <Star size={11} className="fill-rose-500" />
                              Pedidos Ya Restó
                            </div>
                          </td>

                          {/* Resto W1 */}
                          <td className="p-4">
                            <div className="flex flex-col items-center">
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="-,-"
                                value={rawInputs[`${branch.id}_resto_week_1`] || ''}
                                onChange={(e) => handleRatingInputChange(branch.id, 'resto', 'week_1', e.target.value)}
                                onBlur={() => handleInputBlur(branch.id, 'resto', 'week_1')}
                                className="w-14 px-2 py-1.5 bg-bg-accent border border-border-dim rounded text-center text-xs font-mono font-bold text-text-main outline-none focus:border-rose-500 focus:bg-bg-sidebar transition-all"
                              />
                            </div>
                          </td>

                          {/* Resto W2 */}
                          <td className="p-4">
                            <div className="flex flex-col items-center">
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="-,-"
                                value={rawInputs[`${branch.id}_resto_week_2`] || ''}
                                onChange={(e) => handleRatingInputChange(branch.id, 'resto', 'week_2', e.target.value)}
                                onBlur={() => handleInputBlur(branch.id, 'resto', 'week_2')}
                                className="w-14 px-2 py-1.5 bg-bg-accent border border-border-dim rounded text-center text-xs font-mono font-bold text-text-main outline-none focus:border-rose-500 focus:bg-bg-sidebar transition-all"
                              />
                            </div>
                          </td>

                          {/* Resto W3 */}
                          <td className="p-4">
                            <div className="flex flex-col items-center">
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="-,-"
                                value={rawInputs[`${branch.id}_resto_week_3`] || ''}
                                onChange={(e) => handleRatingInputChange(branch.id, 'resto', 'week_3', e.target.value)}
                                onBlur={() => handleInputBlur(branch.id, 'resto', 'week_3')}
                                className="w-14 px-2 py-1.5 bg-bg-accent border border-border-dim rounded text-center text-xs font-mono font-bold text-text-main outline-none focus:border-rose-500 focus:bg-bg-sidebar transition-all"
                              />
                            </div>
                          </td>

                          {/* Resto W4 */}
                          <td className="p-4">
                            <div className="flex flex-col items-center">
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="-,-"
                                value={rawInputs[`${branch.id}_resto_week_4`] || ''}
                                onChange={(e) => handleRatingInputChange(branch.id, 'resto', 'week_4', e.target.value)}
                                onBlur={() => handleInputBlur(branch.id, 'resto', 'week_4')}
                                className="w-14 px-2 py-1.5 bg-bg-accent border border-border-dim rounded text-center text-xs font-mono font-bold text-text-main outline-none focus:border-rose-500 focus:bg-bg-sidebar transition-all"
                              />
                            </div>
                          </td>

                          {/* Promedio Restó */}
                          <td className="p-4 text-right">
                            {restoAvg !== null ? (
                              <div className="flex flex-col items-end">
                                <span className={cn("text-xs font-mono font-black px-2 py-0.5 border rounded uppercase", styleResto.bg)}>
                                  {restoAvg.toFixed(2).replace('.', ',')}
                                </span>
                                <span className="text-[6.5px] text-text-dim font-black uppercase tracking-widest mt-1">
                                  {styleResto.label}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[8.5px] text-text-dim italic font-bold">VACÍO</span>
                            )}
                          </td>
                        </tr>

                        {/* CAFÉ ROW */}
                        <tr className="hover:bg-bg-accent/5 select-none transition-colors border-b border-border-dim/40">
                          {/* Channel Badge Column */}
                          <td className="p-4 min-w-[120px]">
                            <div className="flex items-center gap-1.5 font-bold text-[9px] text-amber-500 uppercase tracking-wider bg-amber-500/5 px-2.5 py-1 rounded w-fit border border-amber-500/15">
                              <Coffee size={11} className="text-amber-500" />
                              Pedidos Ya Café
                            </div>
                          </td>

                          {/* Cafe W1 */}
                          <td className="p-4">
                            <div className="flex flex-col items-center">
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="-,-"
                                value={rawInputs[`${branch.id}_cafe_week_1`] || ''}
                                onChange={(e) => handleRatingInputChange(branch.id, 'cafe', 'week_1', e.target.value)}
                                onBlur={() => handleInputBlur(branch.id, 'cafe', 'week_1')}
                                className="w-14 px-2 py-1.5 bg-bg-accent border border-border-dim rounded text-center text-xs font-mono font-bold text-text-main outline-none focus:border-amber-500 focus:bg-bg-sidebar transition-all"
                              />
                            </div>
                          </td>

                          {/* Cafe W2 */}
                          <td className="p-4">
                            <div className="flex flex-col items-center">
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="-,-"
                                value={rawInputs[`${branch.id}_cafe_week_2`] || ''}
                                onChange={(e) => handleRatingInputChange(branch.id, 'cafe', 'week_2', e.target.value)}
                                onBlur={() => handleInputBlur(branch.id, 'cafe', 'week_2')}
                                className="w-14 px-2 py-1.5 bg-bg-accent border border-border-dim rounded text-center text-xs font-mono font-bold text-text-main outline-none focus:border-amber-500 focus:bg-bg-sidebar transition-all"
                              />
                            </div>
                          </td>

                          {/* Cafe W3 */}
                          <td className="p-4">
                            <div className="flex flex-col items-center">
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="-,-"
                                value={rawInputs[`${branch.id}_cafe_week_3`] || ''}
                                onChange={(e) => handleRatingInputChange(branch.id, 'cafe', 'week_3', e.target.value)}
                                onBlur={() => handleInputBlur(branch.id, 'cafe', 'week_3')}
                                className="w-14 px-2 py-1.5 bg-bg-accent border border-border-dim rounded text-center text-xs font-mono font-bold text-text-main outline-none focus:border-amber-500 focus:bg-bg-sidebar transition-all"
                              />
                            </div>
                          </td>

                          {/* Cafe W4 */}
                          <td className="p-4">
                            <div className="flex flex-col items-center">
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="-,-"
                                value={rawInputs[`${branch.id}_cafe_week_4`] || ''}
                                onChange={(e) => handleRatingInputChange(branch.id, 'cafe', 'week_4', e.target.value)}
                                onBlur={() => handleInputBlur(branch.id, 'cafe', 'week_4')}
                                className="w-14 px-2 py-1.5 bg-bg-accent border border-border-dim rounded text-center text-xs font-mono font-bold text-text-main outline-none focus:border-amber-500 focus:bg-bg-sidebar transition-all"
                              />
                            </div>
                          </td>

                          {/* Promedio Café */}
                          <td className="p-4 text-right">
                            {cafeAvg !== null ? (
                              <div className="flex flex-col items-end">
                                <span className={cn("text-xs font-mono font-black px-2 py-0.5 border rounded uppercase", styleCafe.bg)}>
                                  {cafeAvg.toFixed(2).replace('.', ',')}
                                </span>
                                <span className="text-[6.5px] text-text-dim font-black uppercase tracking-widest mt-1">
                                  {styleCafe.label}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[8.5px] text-text-dim italic font-bold">VACÍO</span>
                            )}
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                  {activeBranches.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center p-10 font-bold uppercase text-text-dim text-[11px]">No hay sucursales activas registradas</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Quality Chart & Trend Analysis */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Chart Card */}
          <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-xl p-5 flex flex-col justify-between min-h-[350px]">
            <div>
              <div className="flex items-center justify-between border-b border-border-dim/40 pb-3">
                <div>
                  <h3 className="text-xs font-black text-text-main uppercase tracking-wider flex items-center gap-2">
                    <TrendingUp size={15} className="text-rose-500" />
                    Tendencias de Calificación
                  </h3>
                  <p className="text-[9px] text-text-dim font-bold uppercase tracking-widest mt-0.5">Evolución de Restó y Café por semana</p>
                </div>
              </div>

              {/* Chart Content */}
              <div className="h-60 w-full mt-5">
                {activeBranches.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 10, right: 10, left: -25, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#30363D/40" />
                      <XAxis 
                        dataKey="name" 
                        stroke="#8B949E" 
                        fontSize={8} 
                        fontWeight="bold"
                        tickLine={false} 
                      />
                      <YAxis 
                        domain={[1.0, 5.0]} 
                        ticks={[1, 2, 3, 4, 5]} 
                        stroke="#8B949E" 
                        fontSize={8} 
                        fontWeight="bold"
                        tickLine={false}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#161B22', 
                          borderColor: '#30363D', 
                          borderRadius: '8px',
                          fontFamily: 'monospace',
                          fontSize: '10px'
                        }}
                        itemStyle={{ color: '#E6EDF2' }}
                      />
                      {chartLines.map(line => (
                        <Line
                          key={line.dataKey}
                          type="monotone"
                          dataKey={line.dataKey}
                          stroke={line.color}
                          strokeWidth={line.dataKey.includes('Café') ? 1.5 : 2.5}
                          strokeDasharray={line.dataKey.includes('Café') ? '4 4' : undefined}
                          dot={{ r: 2, fill: line.color, strokeWidth: 1 }}
                          activeDot={{ r: 4 }}
                          connectNulls={true}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-text-dim text-[10px] font-black uppercase overflow-hidden">No hay gráficos para este mes</div>
                )}
              </div>
            </div>

            {/* Quick Chart Legend */}
            <div className="pt-3 border-t border-border-dim/30 mt-3">
              <span className="text-[7.5px] font-black uppercase text-text-dim tracking-widest block mb-2">Canales de Tendencia:</span>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-1 bg-red-500 rounded-full" />
                  <span className="text-[8px] font-black uppercase text-text-main">Línea Sólida: Restó</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-1 border-b border-dashed border-red-400" />
                  <span className="text-[8px] font-black uppercase text-text-main">Línea Punteada: Café</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Info & Warnings */}
          <div className="p-5 bg-rose-500/5 border border-rose-500/10 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-rose-500 font-black text-[10px] uppercase tracking-wider">
              <Info size={16} />
              <span>Importante para el Administrativo</span>
            </div>
            <p className="text-[9.5px] text-text-dim leading-relaxed font-bold uppercase">
              La calificación de la tienda influye directamente en el algoritmo de posicionamiento de Pedidos Ya. Procura actualizar semanalmente estas métricas para detectar desviaciones a tiempo y aplicar correctivos en la operación de las sucursales involucradas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
