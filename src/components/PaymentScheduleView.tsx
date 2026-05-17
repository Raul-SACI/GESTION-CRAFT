/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { Calendar, DollarSign, Clock, CheckCircle2, AlertCircle, Search, Filter } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export default function PaymentScheduleView() {
  const payments = [
    { id: '1', provider: 'Distribuidora Norte', amount: 150000, date: '2024-06-15', status: 'pending', category: 'Insumos' },
    { id: '2', provider: 'EDET (Luz)', amount: 85000, date: '2024-06-18', status: 'pending', category: 'Servicios' },
    { id: '3', provider: 'Alquiler Centro', amount: 450000, date: '2024-06-10', status: 'paid', category: 'Alquiler' },
    { id: '4', provider: 'SAT (Agua)', amount: 12000, date: '2024-06-20', status: 'pending', category: 'Servicios' },
    { id: '5', provider: 'Proveedor Carnes', amount: 280000, date: '2024-06-05', status: 'paid', category: 'Insumos' },
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
            <Calendar className="text-brand-500" size={24} /> Cronograma de Pagos
          </h2>
          <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mt-1 opacity-70">
            Calendario detallado de compromisos financieros y pagos a proveedores
          </p>
        </div>
        
        <div className="flex gap-2">
           <button className="px-4 py-3 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all flex items-center gap-2" onClick={() => window.print()}>
            <DollarSign size={14} /> EXCEL
          </button>
           <button className="px-4 py-3 bg-brand-500/10 text-brand-500 border border-brand-500/20 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-500/20 transition-all flex items-center gap-2" onClick={() => window.print()}>
            <Calendar size={14} /> PDF
          </button>
          <button className="bg-brand-500 text-black px-6 py-3 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-xl shadow-brand-500/10 font-bold">
            Registrar Nuevo Compromiso
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Pendiente', value: '$247.000', color: 'text-brand-500', icon: Clock },
          { label: 'Próximo Vencimiento', value: '15/06', color: 'text-orange-500', icon: Calendar },
          { label: 'Pagos Realizados', value: '$730.000', color: 'text-emerald-500', icon: CheckCircle2 },
          { label: 'Alertas', value: '0', color: 'text-text-dim', icon: AlertCircle },
        ].map((stat, i) => (
          <div key={i} className="bg-bg-sidebar border border-border-dim p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black text-text-dim uppercase tracking-widest">{stat.label}</span>
              <stat.icon size={12} className={stat.color} />
            </div>
            <p className={cn("text-lg font-black font-mono mt-1", stat.color)}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-bg-sidebar border border-border-dim rounded-lg overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-border-dim flex justify-between items-center bg-bg-accent/20">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={14} />
            <input 
              type="text" 
              placeholder="BUSCAR PROVEEDOR..." 
              className="w-full bg-bg-accent border border-border-dim rounded-full pl-9 pr-4 py-2 text-[10px] text-text-main outline-none focus:border-brand-500 uppercase font-bold"
            />
          </div>
          <button className="p-2 text-text-dim hover:text-brand-500 transition-colors">
            <Filter size={16} />
          </button>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-bg-accent/50 border-b border-border-dim">
              <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest">Proveedor / Concepto</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest">Categoría</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Vencimiento</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Monto</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-dim/50">
            {payments.map(payment => (
              <tr key={payment.id} className="hover:bg-bg-accent/10 transition-colors group">
                <td className="px-6 py-4">
                  <p className="text-[11px] font-black text-text-main uppercase tracking-tight">{payment.provider}</p>
                  <p className="text-[9px] text-text-dim font-bold uppercase mt-0.5 opacity-60">ID: {payment.id}</p>
                </td>
                <td className="px-6 py-4">
                   <span className="text-[9px] font-black text-text-dim uppercase tracking-tighter bg-bg-accent px-2 py-0.5 rounded border border-border-dim/50">
                    {payment.category}
                   </span>
                </td>
                <td className="px-6 py-4 text-center text-xs font-mono font-bold text-text-main">
                  {payment.date}
                </td>
                <td className="px-6 py-4 text-right text-xs font-mono font-bold text-text-main">
                  ${payment.amount.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right">
                   {payment.status === 'paid' ? (
                     <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-[9px] font-black uppercase tracking-tighter border border-emerald-500/20">
                        PAGADO
                     </span>
                   ) : (
                     <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/10 text-orange-500 text-[9px] font-black uppercase tracking-tighter border border-orange-500/20 animate-pulse">
                        PENDIENTE
                     </span>
                   )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
