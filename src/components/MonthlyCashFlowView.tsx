/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { BarChart3, ArrowUpRight, ArrowDownRight, Download, Calendar, Filter } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export default function MonthlyCashFlowView() {
  const months = [
    { name: 'ENERO', income: 10500000, expenses: 8200000, balance: 2300000 },
    { name: 'FEBRERO', income: 9800000, expenses: 7900000, balance: 1900000 },
    { name: 'MARZO', income: 11200000, expenses: 8500000, balance: 2700000 },
    { name: 'ABRIL', income: 12100000, expenses: 8800000, balance: 3300000 },
    { name: 'MAYO', income: 12500000, expenses: 9100000, balance: 3400000 },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <h2 className="text-xl font-black uppercase text-text-main tracking-widest flex items-center gap-2">
            <BarChart3 className="text-brand-500" size={24} /> Flujo de Caja Mensual
          </h2>
          <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mt-1 opacity-70">
            Resumen histórico de movimientos de caja por mes
          </p>
        </div>
        
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all flex items-center gap-2 font-bold" onClick={() => window.print()}>
            <BarChart3 size={14} /> EXCEL
          </button>
          <button className="px-4 py-2 bg-brand-500/10 text-brand-500 border border-brand-500/20 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-500/20 transition-all flex items-center gap-2 font-bold" onClick={() => window.print()}>
            <Download size={14} /> PDF
          </button>
          <button className="px-4 py-2 bg-bg-accent border border-border-dim rounded text-[10px] font-black uppercase tracking-widest text-text-dim hover:text-text-main transition-all flex items-center gap-2 font-bold">
            <Filter size={14} /> Filtrar Periodo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-bg-sidebar border border-border-dim rounded-lg p-6">
          <h3 className="text-xs font-black uppercase text-text-main mb-6 border-l-2 border-brand-500 pl-4">Evolución de Caja 2024</h3>
          <div className="h-64 flex items-end justify-between gap-2 px-4 shadow-inner bg-bg-accent/10 rounded-lg p-4">
            {months.map((m, i) => {
              const maxIncome = 13000000;
              const height = (m.income / maxIncome) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                   <div 
                    className="w-full bg-brand-500/20 group-hover:bg-brand-500/40 transition-all rounded-t relative overflow-hidden" 
                    style={{ height: `${height}%` }}
                   >
                     <div className="absolute bottom-0 left-0 right-0 bg-brand-500 h-1/2 opacity-30" />
                   </div>
                   <span className="text-[8px] font-black text-text-dim uppercase">{m.name.slice(0, 3)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-bg-sidebar border border-border-dim p-6 rounded-lg">
             <h4 className="text-[10px] font-black text-text-dim uppercase tracking-widest mb-4">Resumen Acumulado</h4>
             <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-text-main uppercase tracking-tight">Total Ingresos</span>
                  <span className="text-sm font-mono font-black text-emerald-500">$56.100.000</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-text-main uppercase tracking-tight">Total Egresos</span>
                  <span className="text-sm font-mono font-black text-red-500">$42.500.000</span>
                </div>
                <div className="pt-4 border-t border-border-dim/50 flex justify-between items-center">
                  <span className="text-sm font-black text-brand-500 uppercase tracking-widest">Saldo Neto</span>
                  <span className="text-lg font-mono font-black text-text-main">$13.600.000</span>
                </div>
             </div>
          </div>

          <div className="bg-emerald-500/5 border border-emerald-500/20 p-6 rounded-lg">
             <div className="flex items-center gap-3">
                <Calendar className="text-emerald-500" size={20} />
                <div>
                   <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Estado Financiero</p>
                   <p className="text-xs font-bold text-text-main mt-1">Caja saludable con tendencia positiva de crecimiento.</p>
                </div>
             </div>
          </div>
        </div>
      </div>

      <div className="bg-bg-sidebar border border-border-dim rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-bg-accent/50 border-b border-border-dim">
              <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest">Mes</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Ingresos</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Egresos</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Saldo Final</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-dim/50">
            {months.reverse().map((m, i) => (
              <tr key={i} className="hover:bg-bg-accent/10 transition-colors">
                <td className="px-6 py-4 text-[11px] font-black text-text-main uppercase tracking-tight">{m.name} 2024</td>
                <td className="px-6 py-4 text-right text-xs font-mono font-bold text-emerald-500">${m.income.toLocaleString()}</td>
                <td className="px-6 py-4 text-right text-xs font-mono font-bold text-red-500">${m.expenses.toLocaleString()}</td>
                <td className="px-6 py-4 text-right text-xs font-mono font-bold text-text-main">${m.balance.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
