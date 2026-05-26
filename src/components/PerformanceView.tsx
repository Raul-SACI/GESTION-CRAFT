import React, { useState, useEffect } from 'react';
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
  RefreshCcw,
  Flag,
  Calendar as CalendarIcon,
  Info,
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Branch, PerformanceRoleConfig, PerformanceReport, PerformanceVariable, PerformanceTier } from '../types';
import { supabase } from '../lib/supabase';

export default function PerformanceView({ 
  branches, 
  selectedBranchId 
}: { 
  branches: Branch[], 
  selectedBranchId: string 
}) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));
  const [activeRole, setActiveRole] = useState<'encargado' | 'jefe_cocina'>('encargado');
  const [loading, setLoading] = useState(true);
  
  const [config, setConfig] = useState<PerformanceRoleConfig | null>(null);
  const [report, setReport] = useState<PerformanceReport | null>(null);

  useEffect(() => {
    if (selectedBranchId && selectedBranchId !== 'all') {
      fetchData();
    }
  }, [selectedBranchId, selectedMonth, activeRole]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Config
      const { data: configData } = await supabase
        .from('performance_role_configs')
        .select('*')
        .match({ branch_id: selectedBranchId, month: selectedMonth, role: activeRole })
        .single();

      if (configData) {
        setConfig({
          id: configData.id,
          branchId: configData.branch_id,
          month: configData.month,
          role: configData.role,
          variables: configData.variables || [],
          salesGoal: configData.sales_goal || 0,
          redFlagPenalty: configData.red_flag_penalty || 1000
        });
      } else {
        setConfig(null);
      }

      // 2. Fetch Report (Actuals)
      const { data: reportData } = await supabase
        .from('performance_reports')
        .select('*')
        .match({ branch_id: selectedBranchId, month: selectedMonth, role: activeRole })
        .single();

      if (reportData) {
        setReport({
          id: reportData.id,
          branchId: reportData.branch_id,
          month: reportData.month,
          role: reportData.role,
          results: reportData.results || [],
          actualSales: reportData.actual_sales || 0,
          redFlagsCount: reportData.red_flags_count || 0,
          totalCalculatedPrize: reportData.total_calculated_prize || 0
        });
      } else {
        setReport({
          id: '',
          branchId: selectedBranchId,
          month: selectedMonth,
          role: activeRole,
          results: [],
          actualSales: 0,
          redFlagsCount: 0,
          totalCalculatedPrize: 0
        });
      }
    } catch (err) {
      console.error('Error fetching performance data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getAchievedTier = (variable: PerformanceVariable, actualValue: number) => {
    if (!variable.tiers || variable.tiers.length === 0) return null;
    
    // For CMV/Deviation (isLowerBetter): 30% is better than 31%
    // Thresholds: 31 ($50k), 30 ($60k), 29 ($70k)
    // If actual is 30.5: Achieved 31 threshold
    
    const sortedTiers = [...variable.tiers].sort((a, b) => 
      variable.isLowerBetter ? b.threshold - a.threshold : a.threshold - b.threshold
    );

    let bestTier: PerformanceTier | null = null;
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

  if (selectedBranchId === 'all') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-text-dim text-center p-8 bg-bg-sidebar/30 rounded-xl border border-dashed border-border-dim">
        <Trophy size={48} className="mb-4 opacity-20" />
        <h3 className="text-xl font-black uppercase mb-2">Mi Desempeño</h3>
        <p className="text-sm max-w-md">Selecciona tu sucursal para ver el estado de tus objetivos y el premio proyectado del mes.</p>
      </div>
    );
  }

  if (!config && !loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-sidebar p-5 rounded-lg border border-border-dim shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-500/10 rounded-lg text-red-500">
              <AlertCircle size={24} />
            </div>
            <div>
              <h2 className="text-lg font-black text-text-main uppercase">Sin Configuración</h2>
              <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mt-1">El administrador aún no ha definido objetivos para este periodo</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input 
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-bg-accent border border-border-dim rounded px-3 py-1.5 text-[12px] font-black uppercase text-brand-500"
            />
            <button onClick={fetchData} className="p-2 text-text-dim hover:text-brand-500"><RefreshCcw size={18} /></button>
          </div>
        </div>
        
        <div className="flex p-1 bg-bg-sidebar rounded-lg border border-border-dim w-fit">
          {(['encargado', 'jefe_cocina'] as const).map((role) => (
            <button
              key={role}
              onClick={() => setActiveRole(role)}
              className={cn(
                "px-6 py-2 rounded-md font-black uppercase text-[11px] tracking-widest transition-all",
                activeRole === role ? "bg-brand-500 text-black shadow-md" : "text-text-dim hover:text-text-main"
              )}
            >
              {role.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-sidebar p-5 rounded-lg border border-border-dim shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-brand-500 rounded-lg text-black shadow-lg shadow-brand-500/20">
            <Trophy size={24} />
          </div>
          <div>
            <h2 className="text-lg font-black text-text-main uppercase tracking-tight">Seguimiento de Desempeño</h2>
            <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest leading-none mt-1">Visualización de objetivos y premios</p>
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

      {/* Role Selector */}
      <div className="flex p-1 bg-bg-sidebar rounded-lg border border-border-dim w-fit">
        {(['encargado', 'jefe_cocina'] as const).map((role) => (
          <button
            key={role}
            onClick={() => setActiveRole(role)}
            className={cn(
              "px-6 py-2 rounded-md font-black uppercase text-[11px] tracking-widest transition-all",
              activeRole === role ? "bg-brand-500 text-black shadow-md" : "text-text-dim hover:text-text-main"
            )}
          >
            {role.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Metric Cards Grid */}
        <div className="lg:col-span-8 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {config?.variables.map((v) => {
              const resultEntry = report?.results.find(r => r.variableId === v.id);
              const actualValue = resultEntry?.actualValue || 0;
              const achievedTier = getAchievedTier(v, actualValue);
              
              return (
                <div key={v.id} className="glass-card p-5 relative overflow-hidden group">
                  <div className={cn(
                    "absolute top-0 right-0 w-1 h-full",
                    achievedTier ? "bg-brand-500" : "bg-red-500"
                  )} />
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2 bg-bg-accent rounded border border-border-dim group-hover:scale-110 transition-transform">
                      <Target size={18} className="text-text-dim" />
                    </div>
                    {achievedTier ? 
                      <div className="flex items-center gap-1 text-[10px] font-black text-brand-500 uppercase">
                        <CheckCircle2 size={12} /> Objetivo Cumplido
                      </div> : 
                      <div className="flex items-center gap-1 text-[10px] font-black text-red-500 uppercase">
                        <XCircle size={12} /> Fuera de Objetivo
                      </div>
                    }
                  </div>
                  <h4 className="text-[10px] font-black text-text-dim uppercase tracking-wider mb-1">{v.name}</h4>
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-3xl font-black text-text-main">{actualValue}{v.unit}</span>
                    <span className="text-[10px] font-bold text-text-dim uppercase">Valor Actual</span>
                  </div>

                  <div className="space-y-1.5 border-t border-border-dim/50 pt-3">
                    <p className="text-[9px] font-black text-text-dim uppercase mb-1">Escalas de Premio:</p>
                    {v.tiers.map(t => (
                      <div key={t.id} className={cn(
                        "flex justify-between items-center px-2 py-1 rounded text-[10px] font-bold",
                        achievedTier?.id === t.id ? "bg-brand-500/20 text-brand-500" : "text-text-dim opacity-60"
                      )}>
                        <span>{v.isLowerBetter ? '≤' : '≥'} {t.threshold}{v.unit}</span>
                        <span className="font-black">${t.prize.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="glass-card p-5 flex items-center justify-between border-b-4 border-red-500/30">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-500/10 rounded-full text-red-500">
                <Flag size={24} />
              </div>
              <div>
                <h4 className="text-[11px] font-black text-text-main uppercase">Penalidades por Banderas Rojas</h4>
                <p className="text-[9px] text-text-dim font-bold uppercase">Impacto directo por desvíos críticos</p>
              </div>
            </div>
            <div className="text-right">
              <span className="block text-2xl font-black text-red-500">{report?.redFlagsCount || 0} BANDERAS</span>
              <span className="text-[10px] font-black text-text-dim uppercase">-${((report?.redFlagsCount || 0) * (config?.redFlagPenalty || 0)).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Bonus Summary Column */}
        <div className="lg:col-span-4 space-y-6">
          <div className="glass-card p-6 bg-brand-500/5 border-l-4 border-brand-500">
            <h3 className="text-sm font-black uppercase text-brand-500 tracking-widest mb-6 flex items-center gap-2">
              <TrendingUp size={18} />
              Ventas del Mes
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <span className="text-[10px] font-black text-text-dim uppercase">Venta Real vs Meta</span>
                <span className="text-lg font-black text-text-main">${(report?.actualSales || 0).toLocaleString()}</span>
              </div>
              <div className="h-2 bg-black/20 rounded-full overflow-hidden">
                <motion.div 
                   initial={{ width: 0 }}
                   animate={{ width: `${Math.min(100, (config?.salesGoal || 1) > 0 ? ((report?.actualSales || 0) / (config?.salesGoal || 1) * 100) : 0)}%` }}
                   className={cn("h-full rounded-full transition-all", (report?.actualSales || 0) >= (config?.salesGoal || 0) ? "bg-brand-500" : "bg-text-dim")}
                />
              </div>
              <div className="flex justify-between text-[10px] font-black uppercase text-text-dim">
                <span>0%</span>
                <span>Objetivo: ${config?.salesGoal.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="glass-card p-8 bg-black/20 border-b-4 border-brand-500 shadow-xl relative overflow-hidden sticky top-6">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Trophy size={160} />
            </div>
            <h3 className="text-sm font-black uppercase text-text-main tracking-widest mb-8 flex items-center gap-2">
              <DollarSign size={20} className="text-brand-500" />
              Premio Estimado
            </h3>
            
            <div className="space-y-6 relative z-10">
              <div className="flex justify-between border-b border-border-dim/30 pb-3">
                <span className="text-[11px] font-bold text-text-dim uppercase">Premios por Objetivos</span>
                <span className="text-lg font-black text-text-main">
                  ${config?.variables.reduce((acc, v) => {
                    const result = report?.results.find(r => r.variableId === v.id);
                    const tier = getAchievedTier(v, result?.actualValue || 0);
                    return acc + (tier?.prize || 0);
                  }, 0).toLocaleString()}
                </span>
              </div>

              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] font-black text-text-dim uppercase tracking-widest mb-1">Total a Percibir</p>
                  <p className="text-[11px] font-bold text-text-main uppercase opacity-50">Proyectado Mensual</p>
                </div>
                <div className="text-right">
                  {/* Logic: Prizes sum - (Flags * Penalty). If Sales Goal not met, maybe prizes are 0? 
                      The user didn't specify if sales goal is a blocker or just another variable. 
                      I'll assume it's a blocker for the TOTAL prize as per previous logic. */}
                  {(() => {
                    const totalPrizes = config?.variables.reduce((acc, v) => {
                      const result = report?.results.find(r => r.variableId === v.id);
                      const tier = getAchievedTier(v, result?.actualValue || 0);
                      return acc + (tier?.prize || 0);
                    }, 0) || 0;
                    
                    const penalty = (report?.redFlagsCount || 0) * (config?.redFlagPenalty || 0);
                    const isSalesMet = (report?.actualSales || 0) >= (config?.salesGoal || 0);
                    
                    const finalPrize = isSalesMet ? Math.max(0, totalPrizes - penalty) : 0;
                    
                    return (
                      <p className={cn(
                        "text-5xl font-black leading-none",
                        isSalesMet ? "text-brand-500" : "text-text-dim opacity-50"
                      )}>
                        ${finalPrize.toLocaleString()}
                      </p>
                    );
                  })()}
                </div>
              </div>

              {activeRole === 'jefe_cocina' && (
                <div className="mt-4 p-4 bg-brand-500/10 border border-brand-500/20 rounded-md flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase text-brand-500">Segundo de cocina (80%)</span>
                    <span className="text-[10px] font-black text-text-dim tracking-wide text-right">Referencial</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[9.5px] font-bold text-text-dim uppercase leading-relaxed">Premio Proyectado 80% del Jefe</span>
                    <span className="text-2xl font-black text-brand-500 font-mono">
                      ${(() => {
                        const totalPrizes = config?.variables.reduce((acc, v) => {
                          const result = report?.results.find(r => r.variableId === v.id);
                          const tier = getAchievedTier(v, result?.actualValue || 0);
                          return acc + (tier?.prize || 0);
                        }, 0) || 0;
                        
                        const penalty = (report?.redFlagsCount || 0) * (config?.redFlagPenalty || 0);
                        const isSalesMet = (report?.actualSales || 0) >= (config?.salesGoal || 0);
                        
                        const finalPrize = isSalesMet ? Math.max(0, totalPrizes - penalty) : 0;
                        return Math.round(finalPrize * 0.8).toLocaleString();
                      })()}
                    </span>
                  </div>
                </div>
              )}

              <div className="mt-8 p-4 bg-bg-accent/40 rounded flex items-start gap-4">
                <Info size={18} className="text-brand-500 shrink-0 mt-1" />
                <p className="text-[10px] font-bold text-text-dim leading-relaxed uppercase">
                  {(report?.actualSales || 0) < (config?.salesGoal || 0) 
                    ? "El premio total está bloqueado porque no se alcanzó la meta mínima de ventas de la sucursal."
                    : "El cálculo final será auditado por el departamento de Administración al cierre de mes. Cumple todos tus objetivos para maximizar tu premio."
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
