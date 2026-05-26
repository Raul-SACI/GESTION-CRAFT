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
  Sparkles,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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
  ResponsiveContainer, 
  Legend 
} from 'recharts';

interface PedidosYaViewProps {
  branches: Branch[];
}

interface WeeklyRating {
  branch_id: string;
  month: string; // YYYY-MM
  week_1: number | null;
  week_2: number | null;
  week_3: number | null;
  week_4: number | null;
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

  const [ratings, setRatings] = useState<Record<string, WeeklyRating>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeChartTab, setActiveChartTab] = useState<'line' | 'summary'>('line');

  // Load ratings for chosen month
  const fetchRatings = async () => {
    setLoading(true);
    try {
      // Initialize empty default ratings for all active branches
      const defaultState: Record<string, WeeklyRating> = {};
      activeBranches.forEach(b => {
        defaultState[b.id] = {
          branch_id: b.id,
          month: selectedMonth,
          week_1: null,
          week_2: null,
          week_3: null,
          week_4: null
        };
      });

      // 1. Try reading from LocalStorage as priority / fallback
      const localKey = `craft_pedidos_ya_ratings_${selectedMonth}`;
      let cachedRatings: Record<string, WeeklyRating> | null = null;
      try {
        const localData = localStorage.getItem(localKey);
        if (localData) {
          cachedRatings = JSON.parse(localData);
        }
      } catch (err) {
        console.error('Error reading localStorage for Pedidos Ya:', err);
      }

      // 2. Try fetching from Supabase Table `pedidos_ya_ratings`
      let dbRatings: Record<string, WeeklyRating> = {};
      try {
        const { data, error } = await supabase
          .from('pedidos_ya_ratings')
          .select('*')
          .eq('month', selectedMonth);

        if (!error && data && data.length > 0) {
          data.forEach((row: any) => {
            dbRatings[row.branch_id] = {
              branch_id: row.branch_id,
              month: row.month,
              week_1: row.week_1 !== null ? Number(row.week_1) : null,
              week_2: row.week_2 !== null ? Number(row.week_2) : null,
              week_3: row.week_3 !== null ? Number(row.week_3) : null,
              week_4: row.week_4 !== null ? Number(row.week_4) : null,
            };
          });
        }
      } catch (dbErr) {
        console.warn('Supabase pedidos_ya_ratings retrieval failed or table not found. Using LocalStorage fallback:', dbErr);
      }

      // Merge defaults -> Local Cache -> DB Ratings
      const finalRatings = { ...defaultState };
      if (cachedRatings) {
        Object.assign(finalRatings, cachedRatings);
      }
      if (Object.keys(dbRatings).length > 0) {
        Object.assign(finalRatings, dbRatings);
      }

      setRatings(finalRatings);
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

  // Handle rating change in the inputs
  const handleRatingChange = (branchId: string, week: 'week_1' | 'week_2' | 'week_3' | 'week_4', valString: string) => {
    // If value is empty, set to null
    if (valString === '') {
      setRatings(prev => ({
        ...prev,
        [branchId]: {
          ...prev[branchId],
          [week]: null
        }
      }));
      return;
    }

    // Replace comma with point
    const sanitizedVal = valString.replace(',', '.');
    const numericVal = parseFloat(sanitizedVal);

    if (isNaN(numericVal)) return;

    // Strict boundary checks
    if (numericVal < 1.0 || numericVal > 5.0) return;

    // Keep it up to 2 decimal places maximum
    const formattedVal = Math.round(numericVal * 100) / 100;

    setRatings(prev => ({
      ...prev,
      [branchId]: {
        ...prev[branchId],
        [week]: formattedVal
      }
    }));
  };

  // Bulk Save Ratings
  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const payloads = (Object.values(ratings) as WeeklyRating[]).map(item => ({
        branch_id: item.branch_id,
        month: item.month,
        week_1: item.week_1,
        week_2: item.week_2,
        week_3: item.week_3,
        week_4: item.week_4
      }));

      // Cache directly in LocalStorage to guarantee robust offline/re-refresh persistence
      const localKey = `craft_pedidos_ya_ratings_${selectedMonth}`;
      try {
        localStorage.setItem(localKey, JSON.stringify(ratings));
      } catch (localErr) {
        console.error('Error cache writing Pedidos Ya ratings:', localErr);
      }

      // Try writing to Supabase
      const { error } = await supabase
        .from('pedidos_ya_ratings')
        .upsert(payloads, { onConflict: 'branch_id,month' });

      if (error) {
        console.warn('Supabase ratings save failed, but synchronized locally on this browser:', error);
        alert('Calificaciones guardadas correctamente de manera local.');
      } else {
        alert('Calificaciones de Pedidos Ya guardadas de manera exitosa en el sistema.');
      }
      fetchRatings();
    } catch (err) {
      console.error('Error saving Pedidos Ya ratings:', err);
      alert('Error al guardar en el servidor. Los datos se guardaron en la memoria local.');
    } finally {
      setSaving(false);
    }
  };

  // Helper rating badge color based on rating score
  const getRatingStyle = (rating: number | null) => {
    if (rating === null) return { bg: 'bg-bg-accent/40 text-text-dim border-border-dim/40', label: 'PENDIENTE', textColor: 'text-text-dim' };
    if (rating >= 4.5) return { bg: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', label: 'EXCELENTE', textColor: 'text-emerald-500' };
    if (rating >= 4.0) return { bg: 'bg-lime-500/10 text-lime-400 border-lime-500/20', label: 'BUENO', textColor: 'text-lime-400' };
    if (rating >= 3.5) return { bg: 'bg-amber-500/10 text-amber-500 border-amber-500/20', label: 'REGULAR', textColor: 'text-amber-500' };
    return { bg: 'bg-red-500/10 text-red-500 border-red-500/20', label: 'CRÍTICO', textColor: 'text-red-500' };
  };

  // Month stats summaries
  const stats = useMemo(() => {
    let sum = 0;
    let count = 0;
    let highestAvg = -1;
    let starBranchName = 'Ninguna';
    let lowestAvg = 6;
    let riskBranchName = 'Ninguna';

    activeBranches.forEach(b => {
      const row = ratings[b.id];
      if (!row) return;

      const weeks = [row.week_1, row.week_2, row.week_3, row.week_4].filter((w): w is number => w !== null);
      if (weeks.length > 0) {
        const avg = weeks.reduce((acc, current) => acc + current, 0) / weeks.length;
        sum += avg;
        count++;

        if (avg > highestAvg) {
          highestAvg = avg;
          starBranchName = b.name;
        }
        if (avg < lowestAvg) {
          lowestAvg = avg;
          riskBranchName = b.name;
        }
      }
    });

    const finalAvg = count > 0 ? sum / count : null;
    return {
      average: finalAvg !== null ? Math.round(finalAvg * 100) / 100 : null,
      starBranch: starBranchName,
      starAvg: highestAvg !== -1 ? Math.round(highestAvg * 100) / 100 : null,
      riskBranch: riskBranchName,
      riskAvg: lowestAvg !== 6 ? Math.round(lowestAvg * 100) / 100 : null,
    };
  }, [ratings, activeBranches]);

  // Generate Recharts trend data
  const chartData = useMemo(() => {
    // Weeks structure
    const weeksList = [
      { name: 'Semana 1', key: 'week_1' as const },
      { name: 'Semana 2', key: 'week_2' as const },
      { name: 'Semana 3', key: 'week_3' as const },
      { name: 'Semana 4', key: 'week_4' as const },
    ];

    return weeksList.map(week => {
      const entry: any = { name: week.name };
      activeBranches.forEach(b => {
        const rating = ratings[b.id]?.[week.key];
        entry[b.name] = rating !== null ? rating : undefined;
      });
      return entry;
    });
  }, [ratings, activeBranches]);

  // Assign nice distinct hues for chart lines
  const branchHues = useMemo(() => {
    const hues: Record<string, string> = {
      'Palermo': '#10b981',
      'Belgrano': '#3b82f6',
      'Recoleta': '#f59e0b',
      'Caballito': '#ec4899',
      'Las Cañitas': '#8b5cf6',
      'San Isidro': '#06b6d4'
    };
    
    // Fallbacks
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#14b8a6', '#f43f5e', '#a855f7', '#6366f1'];
    activeBranches.forEach((b, i) => {
      if (!hues[b.name]) {
        hues[b.name] = colors[i % colors.length];
      }
    });
    return hues;
  }, [activeBranches]);

  // Handle month picker change
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
              Calificaciones de Sucursales
            </h2>
            <p className="text-[10px] text-text-dim font-bold uppercase tracking-wider mt-0.5">
              Carga y control semanal de valoraciones en la plataforma Pedidos Ya (1.0 a 5.0)
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
        {/* Promedio General */}
        <div className="p-5 bg-bg-sidebar border border-border-dim rounded-xl shadow-lg relative overflow-hidden flex flex-col justify-between h-[115px]">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[9px] font-black text-text-dim uppercase tracking-widest">PROMEDIO GENERAL MES</span>
              <p className="text-[8.5px] text-text-dim/80 font-bold uppercase tracking-wider mt-0.5">Puntaje global consolidado</p>
            </div>
            <div className="p-2 bg-rose-500/10 rounded-lg text-rose-500">
              <Star size={16} className="fill-rose-500/20" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-text-main font-mono">
              {stats.average !== null ? `${stats.average.toFixed(2)}` : '---'}
            </span>
            {stats.average !== null && (
              <span className="text-[9.5px] font-black uppercase px-2 py-0.5 bg-emerald-500/10 text-emerald-500 rounded border border-emerald-500/10">
                {stats.average >= 4.5 ? 'Excelente' : stats.average >= 4.0 ? 'Sobresaliente' : 'A mejorar'}
              </span>
            )}
          </div>
          <div className="absolute right-[-10px] bottom-[-15px] text-text-dim/5 pointer-events-none select-none">
            <Star size={100} className="fill-current" />
          </div>
        </div>

        {/* Sucursal Estrella */}
        <div className="p-5 bg-bg-sidebar border border-border-dim rounded-xl shadow-lg relative overflow-hidden flex flex-col justify-between h-[115px]">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[9px] font-black text-text-dim uppercase tracking-widest">SUCURSAL ESTRELLA</span>
              <p className="text-[8.5px] text-text-dim/80 font-bold uppercase tracking-wider mt-0.5">Mejor promedio acumulado</p>
            </div>
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
              <Award size={16} />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-md font-black text-text-main uppercase tracking-tight truncate max-w-[200px]">
              {stats.starBranch}
            </span>
            {stats.starAvg !== null && (
              <span className="text-xs font-bold font-mono text-emerald-500 flex items-center gap-1 mt-0.5">
                ★ {stats.starAvg.toFixed(2)} / 5.0
              </span>
            )}
          </div>
          <div className="absolute right-[-10px] bottom-[-15px] text-text-dim/5 pointer-events-none select-none">
            <Award size={100} />
          </div>
        </div>

        {/* Alerta de Desempeño Crítico */}
        <div className="p-5 bg-bg-sidebar border border-border-dim rounded-xl shadow-lg relative overflow-hidden flex flex-col justify-between h-[115px]">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[9px] font-black text-text-dim uppercase tracking-widest">ZONA BAJA CALIFICACIÓN</span>
              <p className="text-[8.5px] text-text-dim/80 font-bold uppercase tracking-wider mt-0.5">Sucursal con menor valoración</p>
            </div>
            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
              <AlertCircle size={16} />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-md font-black text-text-main uppercase tracking-tight truncate max-w-[200px]">
              {stats.riskAvg !== null && stats.riskAvg < 4.0 ? stats.riskBranch : 'Ninguna menor a 4.0'}
            </span>
            {stats.riskAvg !== null && (
              <span className={cn(
                "text-xs font-bold font-mono flex items-center gap-1 mt-0.5",
                stats.riskAvg < 4.0 ? "text-amber-500" : "text-text-dim"
              )}>
                ★ {stats.riskAvg.toFixed(2)} / 5.0
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
                Ingreso de Calificaciones Semanales
              </h3>
              <p className="text-[9px] text-text-dim font-bold uppercase tracking-widest mt-0.5">Rango válido: 1.00 a 5.00 • Se calculan promedios al momento</p>
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
                    <th className="p-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">W1 (Semana 1)</th>
                    <th className="p-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">W2 (Semana 2)</th>
                    <th className="p-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">W3 (Semana 3)</th>
                    <th className="p-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">W4 (Semana 4)</th>
                    <th className="p-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-right">Promedio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dim/30">
                  {activeBranches.map(branch => {
                    const rowData = ratings[branch.id] || {
                      branch_id: branch.id,
                      month: selectedMonth,
                      week_1: null,
                      week_2: null,
                      week_3: null,
                      week_4: null
                    };

                    // Compute individual average
                    const values = [rowData.week_1, rowData.week_2, rowData.week_3, rowData.week_4].filter((w): w is number => w !== null);
                    const branchAvg = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
                    const styleMeta = getRatingStyle(branchAvg);

                    return (
                      <tr 
                        key={branch.id} 
                        className="hover:bg-bg-accent/10 transition-colors"
                      >
                        {/* Branch Name & Indicator */}
                        <td className="p-4 min-w-[140px]">
                          <div className="flex flex-col">
                            <span className="text-[11px] font-black text-text-main uppercase tracking-tight">{branch.name}</span>
                            <span className="text-[8px] text-text-dim font-bold uppercase tracking-widest mt-0.5">{branch.location || 'Corporativa'}</span>
                          </div>
                        </td>

                        {/* Week 1 Rating */}
                        <td className="p-4">
                          <div className="flex flex-col items-center">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="--.-"
                              value={rowData.week_1 !== null ? rowData.week_1 : ''}
                              onChange={(e) => handleRatingChange(branch.id, 'week_1', e.target.value)}
                              className="w-16 px-2 py-1.5 bg-bg-accent border border-border-dim/80 hover:border-border-dim rounded text-center text-xs font-mono font-bold text-text-main outline-none focus:border-rose-500 focus:bg-bg-sidebar transition-all"
                            />
                            {rowData.week_1 !== null && (
                              <span className={cn("text-[7.5px] font-black uppercase mt-1", getRatingStyle(rowData.week_1).textColor)}>
                                ★ {rowData.week_1.toFixed(1)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Week 2 Rating */}
                        <td className="p-4">
                          <div className="flex flex-col items-center">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="--.-"
                              value={rowData.week_2 !== null ? rowData.week_2 : ''}
                              onChange={(e) => handleRatingChange(branch.id, 'week_2', e.target.value)}
                              className="w-16 px-2 py-1.5 bg-bg-accent border border-border-dim/80 hover:border-border-dim rounded text-center text-xs font-mono font-bold text-text-main outline-none focus:border-rose-500 focus:bg-bg-sidebar transition-all"
                            />
                            {rowData.week_2 !== null && (
                              <span className={cn("text-[7.5px] font-black uppercase mt-1", getRatingStyle(rowData.week_2).textColor)}>
                                ★ {rowData.week_2.toFixed(1)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Week 3 Rating */}
                        <td className="p-4">
                          <div className="flex flex-col items-center">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="--.-"
                              value={rowData.week_3 !== null ? rowData.week_3 : ''}
                              onChange={(e) => handleRatingChange(branch.id, 'week_3', e.target.value)}
                              className="w-16 px-2 py-1.5 bg-bg-accent border border-border-dim/80 hover:border-border-dim rounded text-center text-xs font-mono font-bold text-text-main outline-none focus:border-rose-500 focus:bg-bg-sidebar transition-all"
                            />
                            {rowData.week_3 !== null && (
                              <span className={cn("text-[7.5px] font-black uppercase mt-1", getRatingStyle(rowData.week_3).textColor)}>
                                ★ {rowData.week_3.toFixed(1)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Week 4 Rating */}
                        <td className="p-4">
                          <div className="flex flex-col items-center">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="--.-"
                              value={rowData.week_4 !== null ? rowData.week_4 : ''}
                              onChange={(e) => handleRatingChange(branch.id, 'week_4', e.target.value)}
                              className="w-16 px-2 py-1.5 bg-bg-accent border border-border-dim/80 hover:border-border-dim rounded text-center text-xs font-mono font-bold text-text-main outline-none focus:border-rose-500 focus:bg-bg-sidebar transition-all"
                            />
                            {rowData.week_4 !== null && (
                              <span className={cn("text-[7.5px] font-black uppercase mt-1", getRatingStyle(rowData.week_4).textColor)}>
                                ★ {rowData.week_4.toFixed(1)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Calculated Row Average */}
                        <td className="p-4 text-right min-w-[100px]">
                          {branchAvg !== null ? (
                            <div className="flex flex-col items-end">
                              <span className={cn("text-xs font-mono font-bold px-2 py-0.5 border rounded uppercase", styleMeta.bg)}>
                                {branchAvg.toFixed(2)}
                              </span>
                              <span className="text-[7px] text-text-dim font-black uppercase tracking-widest mt-1">
                                {styleMeta.label}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-text-dim italic font-black uppercase tracking-wider">PENDIENTE</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {activeBranches.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center p-10 font-bold uppercase text-text-dim text-[11px]">No hay sucursales activas registradas</td>
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
                  <p className="text-[9px] text-text-dim font-bold uppercase tracking-widest mt-0.5">Evolución de valoraciones por semana</p>
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
                      {activeBranches.map(b => (
                        <Line
                          key={b.id}
                          type="monotone"
                          dataKey={b.name}
                          stroke={branchHues[b.name]}
                          strokeWidth={2.5}
                          dot={{ r: 3, fill: branchHues[b.name], strokeWidth: 1 }}
                          activeDot={{ r: 5 }}
                          connectNulls={true}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-text-dim text-[10px] font-black uppercase">Faltan cargar datos para ver gráfica</div>
                )}
              </div>
            </div>

            {/* Quick Chart Legend / Actions */}
            <div className="pt-3 border-t border-border-dim/30 mt-3 flex flex-wrap gap-x-3 gap-y-1">
              {activeBranches.slice(0, 4).map(b => (
                <div key={b.id} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: branchHues[b.name] }} />
                  <span className="text-[8px] font-black uppercase tracking-wider text-text-dim">{b.name}</span>
                </div>
              ))}
              {activeBranches.length > 4 && (
                <span className="text-[8px] font-black uppercase text-text-dim/60">+{activeBranches.length - 4} sucursales</span>
              )}
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
