/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { TrendingUp, Calendar, ArrowUpRight, ArrowDownRight, BarChart3, Filter } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export default function EstimatedCashFlowView() {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <h2 className="text-xl font-black uppercase text-text-main tracking-widest flex items-center gap-2">
            <TrendingUp className="text-brand-500" size={24} /> Flujo de Caja Estimado
          </h2>
          <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mt-1 opacity-70">
            Proyección de ingresos y egresos para los próximos periodos
          </p>
        </div>
        
        <div className="flex gap-2">
           <button className="px-4 py-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all flex items-center gap-2" onClick={() => window.print()}>
            <BarChart3 size={14} /> Excel
          </button>
           <button className="px-4 py-2 bg-brand-500/10 text-brand-500 border border-brand-500/20 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-500/20 transition-all flex items-center gap-2" onClick={() => window.print()}>
            <TrendingUp size={14} /> PDF
          </button>
           <button className="px-4 py-2 bg-bg-accent border border-border-dim rounded text-[10px] font-black uppercase tracking-widest text-text-dim hover:text-text-main transition-all flex items-center gap-2">
            <Filter size={14} /> Filtros
          </button>
          <button className="px-4 py-2 bg-brand-500 text-black rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-xl shadow-brand-500/10 font-bold">
            Actualizar Proyección
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-bg-sidebar border border-border-dim p-6 rounded-lg">
          <p className="text-[10px] font-black text-text-dim uppercase tracking-widest">Ingresos Estimados</p>
          <div className="flex items-baseline gap-2 mt-2">
            <h3 className="text-2xl font-black text-emerald-500 font-mono">$12.500.000</h3>
            <span className="text-[10px] text-emerald-500/70 font-bold group flex items-center gap-1">
              <ArrowUpRight size={12} /> +12%
            </span>
          </div>
        </div>
        <div className="bg-bg-sidebar border border-border-dim p-6 rounded-lg">
          <p className="text-[10px] font-black text-text-dim uppercase tracking-widest">Egresos Proyectados</p>
          <div className="flex items-baseline gap-2 mt-2">
            <h3 className="text-2xl font-black text-red-500 font-mono">$8.200.000</h3>
            <span className="text-[10px] text-red-500/70 font-bold flex items-center gap-1">
              <ArrowDownRight size={12} /> -5%
            </span>
          </div>
        </div>
        <div className="bg-brand-500/5 border border-brand-500/20 p-6 rounded-lg">
          <p className="text-[10px] font-black text-brand-500 uppercase tracking-widest">Saldo Estimado</p>
          <div className="mt-2">
            <h3 className="text-2xl font-black text-text-main font-mono">$4.300.000</h3>
            <p className="text-[9px] text-text-dim mt-1 font-bold">FECHA DE CIERRE: 30/06/2024</p>
          </div>
        </div>
      </div>

      <div className="bg-bg-sidebar border border-border-dim rounded-lg p-10 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-bg-accent rounded-full flex items-center justify-center text-brand-500 mb-4">
          <BarChart3 size={32} />
        </div>
        <h4 className="text-xs font-black uppercase text-text-main tracking-widest">Visualización de Flujo Estimado</h4>
        <p className="text-[10px] text-text-dim max-w-sm mt-2 leading-relaxed font-bold">
          El módulo de proyección está procesando los datos históricos de ventas y los compromisos de pago registrados para generar el gráfico comparativo.
        </p>
      </div>
    </motion.div>
  );
}
