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
  Save,
  RefreshCcw,
  Flag,
  Calendar as CalendarIcon,
  Info
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { Branch, PerformanceTargets, PerformanceResult } from '../types';
import { supabase } from '../lib/supabase';

export default function PerformanceAdminView({ 
  branches, 
  selectedBranchId 
}: { 
  branches: Branch[], 
  selectedBranchId: string 
}) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      } else {
        setTargets(prev => ({ ...prev, id: '', branchId: selectedBranchId, month: selectedMonth }));
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
          actualCmv: 0,
          actualStockDeviation: 0,
          actualHourDeviation: 0,
          actualGoogleScore: 0,
          actualPedidosYaScore: 0,
          actualSales: 0,
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
    bonus = Math.max(0, bonus - penalty);
    return bonus;
  };

  const isAchieved = {
    cmv: (actuals.actualCmv || 0) <= targets.targetCmv,
    stock: (actuals.actualStockDeviation || 0) <= targets.targetStockDeviation,
    hours: (actuals.actualHourDeviation || 0) <= targets.targetHourDeviation,
    google: (actuals.actualGoogleScore || 0) >= targets.targetGoogleScore,
    pedidosYa: (actuals.actualPedidosYaScore || 0) >= targets.targetPedidosYaScore,
    sales: (actuals.actualSales || 0) >= targets.salesGoal,
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const targetPayload = {
        branch_id: selectedBranchId,
        month: selectedMonth,
        target_cmv: targets.targetCmv,
        target_stock_deviation: targets.targetStockDeviation,
        target_hour_deviation: targets.targetHourDeviation,
        target_google_score: targets.targetGoogleScore,
        target_pedidos_ya_score: targets.targetPedidosYaScore,
        sales_goal: targets.salesGoal,
        bonus_percentage: targets.bonusPercentage,
        red_flag_penalty: targets.redFlagPenalty
      };

      const resultPayload = {
        branch_id: selectedBranchId,
        month: selectedMonth,
        actual_cmv: actuals.actualCmv,
        actual_stock_deviation: actuals.actualStockDeviation,
        actual_hour_deviation: actuals.actualHourDeviation,
        actual_google_score: actuals.actualGoogleScore,
        actual_pedidos_ya_score: actuals.actualPedidosYaScore,
        actual_sales: actuals.actualSales,
        red_flags_count: actuals.redFlagsCount,
        calculated_bonus: calculateBonus()
      };

      const { error: tError } = await supabase
        .from('performance_targets')
        .upsert(targetPayload, { onConflict: 'branch_id,month' });

      const { error: rError } = await supabase
        .from('performance_results')
        .upsert(resultPayload, { onConflict: 'branch_id,month' });

      if (tError || rError) throw tError || rError;
      alert('Configuración de premios guardada exitosamente.');
      fetchData();
    } catch (err) {
      console.error('Save error:', err);
      alert('Error al guardar. Verifique la conexión o existencia de tablas.');
    } finally {
      setSaving(false);
    }
  };

  if (selectedBranchId === 'all') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-text-dim text-center p-8 bg-bg-sidebar/30 rounded-xl border border-dashed border-border-dim">
        <Calculator size={48} className="mb-4 opacity-20" />
        <h3 className="text-xl font-black uppercase mb-2">Administración de Premios</h3>
        <p className="text-sm max-w-md">Por favor, selecciona una sucursal específica para definir sus objetivos mensuales y premios.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-sidebar p-5 rounded-lg border border-border-dim shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-500 rounded-lg text-white shadow-lg shadow-blue-500/20">
            <Calculator size={24} />
          </div>
          <div>
            <h2 className="text-lg font-black text-text-main uppercase tracking-tight">Configuración de Premios (ADMIN)</h2>
            <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest leading-none mt-1">Definición de variables y carga mensual</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-bg-accent px-3 py-1.5 rounded border border-border-dim shadow-inner">
            <CalendarIcon size={16} className="text-text-dim mr-2" />
            <input 
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent border-none text-[12px] font-black uppercase text-blue-500 focus:outline-none"
            />
          </div>
          <button 
            onClick={fetchData} 
            className="p-2 text-text-dim hover:text-blue-500 transition-colors"
          >
            <RefreshCcw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          <div className="glass-card overflow-hidden">
            <div className="bg-bg-accent/40 px-6 py-4 border-b border-border-dim flex items-center justify-between">
              <h3 className="text-xs font-black uppercase text-text-main tracking-widest flex items-center gap-2">
                <Target size={16} className="text-blue-500" />
                Matriz de Desempeño y Resultados
              </h3>
              <span className="text-[10px] font-black text-text-dim uppercase bg-black/20 px-2 py-1 rounded">Periodo: {selectedMonth}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-bg-accent/20 border-b border-border-dim">
                  <tr>
                    <th className="px-6 py-3 text-[10px] font-black uppercase text-text-dim tracking-widest">Variable</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase text-text-dim tracking-widest w-40">Objetivo Mensual</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase text-text-dim tracking-widest w-40">Resultado Real</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase text-text-dim tracking-widest w-20 text-center">Final</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dim">
                  {/* CMV */}
                  <tr className="hover:bg-bg-accent/5 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-[11px] font-black text-text-main uppercase">CMV Definitivo del Mes</p>
                      <p className="text-[9px] text-text-dim uppercase font-bold">Porcentaje sobre ventas netas</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="relative">
                        <input 
                          type="number"
                          value={targets.targetCmv}
                          onChange={(e) => setTargets({...targets, targetCmv: parseFloat(e.target.value)})}
                          className="w-full bg-bg-accent border border-border-dim rounded px-3 py-1.5 text-[12px] font-black text-blue-500 focus:border-blue-500 outline-none pr-8"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-text-dim">%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="relative">
                        <input 
                          type="number"
                          value={actuals.actualCmv}
                          onChange={(e) => setActuals({...actuals, actualCmv: parseFloat(e.target.value)})}
                          className="w-full bg-bg-sidebar border border-border-dim rounded px-3 py-1.5 text-[12px] font-black text-text-main focus:border-blue-500 outline-none pr-8"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-text-dim">%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {isAchieved.cmv ? <CheckCircle2 size={18} className="text-green-500 mx-auto" /> : <XCircle size={18} className="text-red-500 mx-auto" />}
                    </td>
                  </tr>

                  {/* Stock Deviation */}
                  <tr className="hover:bg-bg-accent/5 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-[11px] font-black text-text-main uppercase">Desvíos Control Stock</p>
                      <p className="text-[9px] text-text-dim uppercase font-bold">Límite permitido (%)</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="relative">
                        <input 
                          type="number"
                          value={targets.targetStockDeviation}
                          onChange={(e) => setTargets({...targets, targetStockDeviation: parseFloat(e.target.value)})}
                          className="w-full bg-bg-accent border border-border-dim rounded px-3 py-1.5 text-[12px] font-black text-blue-500 focus:border-blue-500 outline-none pr-8"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-text-dim">%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="relative">
                        <input 
                          type="number"
                          value={actuals.actualStockDeviation}
                          onChange={(e) => setActuals({...actuals, actualStockDeviation: parseFloat(e.target.value)})}
                          className="w-full bg-bg-sidebar border border-border-dim rounded px-3 py-1.5 text-[12px] font-black text-text-main focus:border-blue-500 outline-none pr-8"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-text-dim">%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {isAchieved.stock ? <CheckCircle2 size={18} className="text-green-500 mx-auto" /> : <XCircle size={18} className="text-red-500 mx-auto" />}
                    </td>
                  </tr>

                  {/* Hour Deviation */}
                  <tr className="hover:bg-bg-accent/5 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-[11px] font-black text-text-main uppercase">Desvíos en Horas</p>
                      <p className="text-[9px] text-text-dim uppercase font-bold">Límite permitido (HS)</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="relative">
                        <input 
                          type="number"
                          value={targets.targetHourDeviation}
                          onChange={(e) => setTargets({...targets, targetHourDeviation: parseFloat(e.target.value)})}
                          className="w-full bg-bg-accent border border-border-dim rounded px-3 py-1.5 text-[12px] font-black text-blue-500 focus:border-blue-500 outline-none pr-8"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-text-dim">HS</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="relative">
                        <input 
                          type="number"
                          value={actuals.actualHourDeviation}
                          onChange={(e) => setActuals({...actuals, actualHourDeviation: parseFloat(e.target.value)})}
                          className="w-full bg-bg-sidebar border border-border-dim rounded px-3 py-1.5 text-[12px] font-black text-text-main focus:border-blue-500 outline-none pr-8"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-text-dim">HS</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {isAchieved.hours ? <CheckCircle2 size={18} className="text-green-500 mx-auto" /> : <XCircle size={18} className="text-red-500 mx-auto" />}
                    </td>
                  </tr>

                  {/* Red Flags Penalty */}
                  <tr className="bg-red-500/5 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Flag size={14} className="text-red-500" />
                        <p className="text-[11px] font-black text-text-main uppercase">Banderas Rojas (Penalidad)</p>
                      </div>
                      <p className="text-[9px] text-text-dim uppercase font-bold">Descuento fijo por cada bandera</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-text-dim">$</span>
                        <input 
                          type="number"
                          value={targets.redFlagPenalty}
                          onChange={(e) => setTargets({...targets, redFlagPenalty: parseFloat(e.target.value)})}
                          className="w-full bg-bg-accent border border-border-dim rounded pl-6 pr-3 py-1.5 text-[12px] font-black text-red-500"
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="relative">
                        <input 
                          type="number"
                          value={actuals.redFlagsCount}
                          onChange={(e) => setActuals({...actuals, redFlagsCount: parseInt(e.target.value) || 0})}
                          className="w-full bg-bg-sidebar border border-border-dim rounded px-3 py-1.5 text-[12px] font-black text-red-500"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-text-dim">CANT</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                       <span className="text-[12px] font-black text-red-500">-${((actuals.redFlagsCount || 0) * targets.redFlagPenalty).toLocaleString()}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <div className="p-6 bg-bg-accent/10 border-t border-border-dim flex justify-end">
              <button 
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-8 py-2.5 rounded font-black uppercase text-[12px] tracking-widest transition-all shadow-lg shadow-blue-500/20"
              >
                {saving ? <RefreshCcw size={16} className="animate-spin" /> : <Save size={16} />}
                Confirmar y Guardar Todo
              </button>
            </div>
          </div>

          <div className="glass-card p-4 border border-amber-500/30 bg-amber-500/5">
             <div className="flex items-center gap-2 text-amber-500 mb-2">
                <AlertCircle size={14} />
                <span className="text-[10px] font-black uppercase tracking-widest">Esquema SQL</span>
             </div>
             <pre className="text-[8px] bg-black/40 p-3 rounded text-amber-500/80 font-mono overflow-x-auto border border-amber-500/20">
{`CREATE TABLE performance_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id TEXT NOT NULL,
  month TEXT NOT NULL,
  target_cmv NUMERIC DEFAULT 30,
  target_stock_deviation NUMERIC DEFAULT 2,
  target_hour_deviation NUMERIC DEFAULT 10,
  target_google_score NUMERIC DEFAULT 4.5,
  target_pedidos_ya_score NUMERIC DEFAULT 4.5,
  sales_goal NUMERIC DEFAULT 0,
  bonus_percentage NUMERIC DEFAULT 1,
  red_flag_penalty NUMERIC DEFAULT 1000,
  UNIQUE(branch_id, month)
);

CREATE TABLE performance_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id TEXT NOT NULL,
  month TEXT NOT NULL,
  actual_cmv NUMERIC,
  actual_stock_deviation NUMERIC,
  actual_hour_deviation NUMERIC,
  actual_google_score NUMERIC,
  actual_pedidos_ya_score NUMERIC,
  actual_sales NUMERIC,
  red_flags_count INTEGER DEFAULT 0,
  calculated_bonus NUMERIC DEFAULT 0,
  UNIQUE(branch_id, month)
);`}
             </pre>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="glass-card p-6 border-l-4 border-blue-500">
            <h3 className="text-sm font-black uppercase text-blue-500 tracking-widest mb-6 flex items-center gap-2">
              <TrendingUp size={18} />
              Previsión de Ventas
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-text-dim uppercase ml-1">Meta de Venta del Mes ($)</label>
                <div className="relative">
                   <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim font-black">$</span>
                   <input 
                    type="number"
                    value={targets.salesGoal}
                    onChange={(e) => setTargets({...targets, salesGoal: parseFloat(e.target.value)})}
                    className="w-full bg-bg-accent border border-border-dim rounded pl-8 pr-4 py-3 text-lg font-black text-text-main focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-text-dim uppercase ml-1">Venta Real ($)</label>
                <div className="relative">
                   <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim font-black">$</span>
                   <input 
                    type="number"
                    value={actuals.actualSales}
                    onChange={(e) => setActuals({...actuals, actualSales: parseFloat(e.target.value)})}
                    className="w-full bg-bg-sidebar border border-border-dim rounded pl-8 pr-4 py-3 text-lg font-black text-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card p-6 bg-blue-500/5 border-l-4 border-blue-600">
            <h3 className="text-sm font-black uppercase text-text-main tracking-widest mb-6 flex items-center gap-2">
              <DollarSign size={18} className="text-blue-500" />
              Impacto en el Premio
            </h3>
            
            <div className="space-y-4">
              <div className="flex justify-between border-b border-border-dim pb-2">
                <span className="text-[11px] font-bold text-text-dim uppercase">Premio s/ Venta %</span>
                <div className="flex items-center gap-2">
                  <input 
                    type="number"
                    step="0.1"
                    value={targets.bonusPercentage}
                    onChange={(e) => setTargets({...targets, bonusPercentage: parseFloat(e.target.value)})}
                    className="w-16 bg-bg-accent border border-border-dim rounded px-2 py-1 text-[11px] font-black text-blue-500 text-right outline-none"
                  />
                  <span className="text-[11px] font-black text-text-dim">%</span>
                </div>
              </div>

              <div className="pt-4 mt-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-black text-text-dim uppercase tracking-wider">Premio Proyectado Final</span>
                </div>
                <p className="text-4xl font-black text-blue-500 leading-none">
                  ${calculateBonus().toLocaleString()}
                </p>
                <div className="mt-6 p-3 bg-blue-500/10 rounded flex items-start gap-3">
                   <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
                   <p className="text-[9px] font-bold text-text-dim leading-relaxed uppercase">
                     Como administrador, usted está definiendo los valores que impactarán en el tablero del encargado. Solo los resultados guardados serán visibles para el personal.
                   </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
