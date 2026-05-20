import React, { useState, useEffect, useMemo } from 'react';
import { 
  Trophy, 
  Target, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  Star, 
  DollarSign, 
  Calculator,
  Save,
  RefreshCcw,
  Flag,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Branch, PerformanceTargets, PerformanceResult } from '../types';
import { supabase } from '../lib/supabase';

export default function PerformanceView({ 
  branches, 
  selectedBranchId 
}: { 
  branches: Branch[], 
  selectedBranchId: string 
}) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));
  const [loading, setLoading] = useState(true);

  const [targets, setTargets] = useState<PerformanceTargets>({
    id: '',
    branchId: selectedBranchId,
    month: selectedMonth,
    targetCmv: 30,
    targetStockDeviation: 2,
    targetHourDeviation: 10,
    targetGoogleScore: 4.5,
    targetPedidosYaScore: 4.5,
    salesGoal: 0,
    bonusPercentage: 1,
    redFlagPenalty: 1000
  });

  const [actuals, setActuals] = useState<Partial<PerformanceResult>>({
    actualCmv: 0,
    actualStockDeviation: 0,
    actualHourDeviation: 0,
    actualGoogleScore: 0,
    actualPedidosYaScore: 0,
    actualSales: 0,
    redFlagsCount: 0
  });

  useEffect(() => {
    if (selectedBranchId && selectedBranchId !== 'all') {
      fetchData();
    }
  }, [selectedBranchId, selectedMonth]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: targetData } = await supabase
        .from('performance_targets')
        .select('*')
        .match({ branch_id: selectedBranchId, month: selectedMonth })
        .single();

      if (targetData) {
        setTargets({
          id: targetData.id,
          branchId: targetData.branch_id,
          month: targetData.month,
          targetCmv: targetData.target_cmv,
          targetStockDeviation: targetData.target_stock_deviation,
          targetHourDeviation: targetData.target_hour_deviation,
          targetGoogleScore: targetData.target_google_score,
          targetPedidosYaScore: targetData.target_pedidos_ya_score,
          salesGoal: targetData.sales_goal,
          bonusPercentage: targetData.bonus_percentage,
          redFlagPenalty: targetData.red_flag_penalty
        });
      }

      const { data: resultData } = await supabase
        .from('performance_results')
        .select('*')
        .match({ branch_id: selectedBranchId, month: selectedMonth })
        .single();

      if (resultData) {
        setActuals({
          actualCmv: resultData.actual_cmv,
          actualStockDeviation: resultData.actual_stock_deviation,
          actualHourDeviation: resultData.actual_hour_deviation,
          actualGoogleScore: resultData.actual_google_score,
          actualPedidosYaScore: resultData.actual_pedidos_ya_score,
          actualSales: resultData.actual_sales,
          redFlagsCount: resultData.red_flags_count
        });
      } else {
        setActuals({
          actualCmv: 0, actualStockDeviation: 0, actualHourDeviation: 0,
          actualGoogleScore: 0, actualPedidosYaScore: 0, actualSales: 0,
          redFlagsCount: 0
        });
      }
    } catch (err) {
      console.error('Error fetching performance data:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateBonus = () => {
    if (!actuals.actualSales || actuals.actualSales < targets.salesGoal) return 0;
    let bonus = actuals.actualSales * (targets.bonusPercentage / 100);
    const penalty = (actuals.redFlagsCount || 0) * targets.redFlagPenalty;
    return Math.max(0, bonus - penalty);
  };

  const isAchieved = {
    cmv: (actuals.actualCmv || 0) <= targets.targetCmv,
    stock: (actuals.actualStockDeviation || 0) <= targets.targetStockDeviation,
    hours: (actuals.actualHourDeviation || 0) <= targets.targetHourDeviation,
    google: (actuals.actualGoogleScore || 0) >= targets.targetGoogleScore,
    pedidosYa: (actuals.actualPedidosYaScore || 0) >= targets.targetPedidosYaScore,
    sales: (actuals.actualSales || 0) >= targets.salesGoal,
  };

  if (selectedBranchId === 'all') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-text-dim text-center p-8 bg-bg-sidebar/30 rounded-xl border border-dashed border-border-dim">
        <Trophy size={48} className="mb-4 opacity-20" />
        <h3 className="text-xl font-black uppercase mb-2">Mi Desempeño</h3>
        <p className="text-sm max-w-md">Selecciona tu sucursal para ver el estado de tus objetivos y el premio proyectado del mes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-sidebar p-5 rounded-lg border border-border-dim shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-brand-500 rounded-lg text-black shadow-lg shadow-brand-500/20">
            <Trophy size={24} />
          </div>
          <div>
            <h2 className="text-lg font-black text-text-main uppercase tracking-tight">Seguimiento de Desempeño</h2>
            <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest leading-none mt-1">Indicadores clave de sucursal</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-bg-accent px-3 py-1.5 rounded border border-border-dim">
            <CalendarIcon size={16} className="text-text-dim mr-2" />
            <input 
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent border-none text-[12px] font-black uppercase text-brand-500 focus:outline-none"
            />
          </div>
          <button onClick={fetchData} className="p-2 text-text-dim hover:text-brand-500 transition-colors">
            <RefreshCcw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Metric Cards Grid */}
        <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { label: 'CMV Definitivo', target: targets.targetCmv, actual: actuals.actualCmv, unit: '%', isLowerBetter: true, icon: Calculator },
            { label: 'Desvíos de Stock', target: targets.targetStockDeviation, actual: actuals.actualStockDeviation, unit: '%', isLowerBetter: true, icon: Target },
            { label: 'Desvíos de Horas', target: targets.targetHourDeviation, actual: actuals.actualHourDeviation, unit: 'HS', isLowerBetter: true, icon: CalendarIcon },
            { label: 'Calificación Google', target: targets.targetGoogleScore, actual: actuals.actualGoogleScore, unit: '★', isLowerBetter: false, icon: Star },
          ].map((metric) => {
            const achieved = metric.isLowerBetter ? (metric.actual || 0) <= (metric.target || 999) : (metric.actual || 0) >= (metric.target || 0);
            return (
              <div key={metric.label} className="glass-card p-5 relative overflow-hidden group">
                <div className={cn(
                  "absolute top-0 right-0 w-1 h-full",
                  achieved ? "bg-brand-500" : "bg-red-500"
                )} />
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-bg-accent rounded border border-border-dim group-hover:scale-110 transition-transform">
                    <metric.icon size={18} className="text-text-dim" />
                  </div>
                  {achieved ? 
                    <div className="flex items-center gap-1 text-[10px] font-black text-brand-500 uppercase">
                      <CheckCircle2 size={12} /> Objetivo Cumplido
                    </div> : 
                    <div className="flex items-center gap-1 text-[10px] font-black text-red-500 uppercase">
                      <XCircle size={12} /> Fuera de Objetivo
                    </div>
                  }
                </div>
                <h4 className="text-[10px] font-black text-text-dim uppercase tracking-wider mb-1">{metric.label}</h4>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-text-main">{metric.actual}{metric.unit}</span>
                  <span className="text-[10px] font-bold text-text-dim">/ Meta: {metric.target}{metric.unit}</span>
                </div>
              </div>
            );
          })}

          <div className="md:col-span-2 glass-card p-5 flex items-center justify-between border-b-4 border-red-500/30">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-500/10 rounded-full text-red-500">
                <Flag size={24} />
              </div>
              <div>
                <h4 className="text-[11px] font-black text-text-main uppercase">Penalidades por Banderas Rojas</h4>
                <p className="text-[9px] text-text-dim font-bold uppercase">Impacto directo en el premio acumulado</p>
              </div>
            </div>
            <div className="text-right">
              <span className="block text-2xl font-black text-red-500">{actuals.redFlagsCount} BANDERAS</span>
              <span className="text-[10px] font-black text-text-dim uppercase">-${((actuals.redFlagsCount || 0) * targets.redFlagPenalty).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Bonus Summary Column */}
        <div className="lg:col-span-4 space-y-6">
          <div className="glass-card p-6 bg-brand-500/5 border-l-4 border-brand-500">
            <h3 className="text-sm font-black uppercase text-brand-500 tracking-widest mb-6 flex items-center gap-2">
              <TrendingUp size={18} />
              Estado de Ventas
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <span className="text-[10px] font-black text-text-dim uppercase">Venta Real vs Meta</span>
                <span className="text-lg font-black text-text-main">${(actuals.actualSales || 0).toLocaleString()}</span>
              </div>
              <div className="h-2 bg-black/20 rounded-full overflow-hidden">
                <motion.div 
                   initial={{ width: 0 }}
                   animate={{ width: `${Math.min(100, targets.salesGoal > 0 ? ((actuals.actualSales || 0) / targets.salesGoal * 100) : 0)}%` }}
                   className={cn("h-full rounded-full transition-all", isAchieved.sales ? "bg-brand-500" : "bg-text-dim")}
                />
              </div>
              <div className="flex justify-between text-[10px] font-black uppercase text-text-dim">
                <span>0%</span>
                <span>Objetivo: ${targets.salesGoal.toLocaleString()}</span>
                <span>100%</span>
              </div>
            </div>
          </div>

          <div className="glass-card p-8 bg-black/20 border-b-4 border-brand-500 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Trophy size={160} />
            </div>
            <h3 className="text-sm font-black uppercase text-text-main tracking-widest mb-8 flex items-center gap-2">
              <DollarSign size={20} className="text-brand-500" />
              Estimación de Premio
            </h3>
            
            <div className="space-y-6 relative z-10">
              <div className="flex justify-between border-b border-border-dim/30 pb-3">
                <span className="text-[11px] font-bold text-text-dim uppercase">Premio s/ Venta ({targets.bonusPercentage}%)</span>
                <span className="text-lg font-black text-text-main">${(isAchieved.sales ? (actuals.actualSales || 0) * (targets.bonusPercentage / 100) : 0).toLocaleString()}</span>
              </div>

              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] font-black text-text-dim uppercase tracking-widest mb-1">Total a Percibir</p>
                  <p className="text-[11px] font-bold text-text-main uppercase opacity-50">Proyectado Mensual</p>
                </div>
                <div className="text-right">
                  <p className="text-5xl font-black text-brand-500 leading-none">${calculateBonus().toLocaleString()}</p>
                </div>
              </div>

              <div className="mt-8 p-4 bg-bg-accent/40 rounded flex items-start gap-4">
                <Info size={18} className="text-brand-500 shrink-0 mt-1" />
                <p className="text-[10px] font-bold text-text-dim leading-relaxed uppercase">
                  El cálculo final será auditado por el departamento de Administración al cierre de mes. Cumple todos tus objetivos para maximizar tu premio.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
