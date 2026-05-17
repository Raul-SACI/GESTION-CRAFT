/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Users, 
  Clock, 
  Calendar, 
  Save, 
  Search, 
  ChevronRight, 
  CheckCircle2,
  AlertTriangle,
  History,
  FileSpreadsheet,
  FileText
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Branch } from '../types';

interface HrHourRecord {
  id: string;
  roleId: string;
  roleLabel: string;
  definitiveHours: number;
  status: 'pending' | 'verified';
}

const POSITIONS = [
  { id: 'encargado', label: 'Encargado' },
  { id: 'jefe_cocina', label: 'Jefe de Cocina' },
  { id: 'segundo_cocina', label: 'Segundo de Cocina' },
  { id: 'cocinero', label: 'Cocinero' },
  { id: 'caja', label: 'Caja' },
  { id: 'barra', label: 'Barra' },
  { id: 'mozos', label: 'Mozos' },
  { id: 'runners', label: 'Runners' },
  { id: 'bacha', label: 'Bacha' },
];

export default function HrHourControlView({ branches }: { branches: Branch[] }) {
  const [selectedBranch, setSelectedBranch] = useState(branches[0]?.id || '');
  const [dateRange, setDateRange] = useState({
    from: new Date().toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });

  const [records, setRecords] = useState<HrHourRecord[]>(
    POSITIONS.map(p => ({
      id: p.id,
      roleId: p.id,
      roleLabel: p.label,
      definitiveHours: 0,
      status: 'pending'
    }))
  );

  const handleUpdateHours = (id: string, hours: number) => {
    setRecords(records.map(r => r.id === id ? { ...r, definitiveHours: hours } : r));
  };

  const handleVerify = (id: string) => {
    setRecords(records.map(r => r.id === id ? { ...r, status: 'verified' } : r));
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <h2 className="text-xl font-black uppercase text-text-main tracking-widest flex items-center gap-2">
            <Users className="text-brand-500" size={24} /> Control de Horas (RRHH)
          </h2>
          <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mt-1 opacity-70">
            Carga definitiva de horas reales por puesto de trabajo
          </p>
        </div>

        <div className="flex gap-2">
          <button className="px-4 py-2 bg-bg-accent border border-border-dim rounded text-[10px] font-black uppercase tracking-widest text-text-dim hover:text-text-main transition-all flex items-center gap-2">
            <History size={14} /> Historial
          </button>
          <button 
            className="px-4 py-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all flex items-center gap-2"
            onClick={() => window.print()}
          >
            <FileSpreadsheet size={14} /> EXCEL
          </button>
          <button 
            className="px-4 py-2 bg-brand-500/10 text-brand-500 border border-brand-500/20 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-500/20 transition-all flex items-center gap-2"
            onClick={() => window.print()}
          >
            <FileText size={14} /> PDF
          </button>
        </div>
      </div>

      <div className="bg-bg-sidebar border border-border-dim rounded-lg p-6 shadow-2xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-dim uppercase tracking-widest">Sucursal</label>
            <select 
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main font-bold uppercase outline-none focus:border-brand-500 transition-all"
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-dim uppercase tracking-widest">Desde</label>
            <input 
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange({...dateRange, from: e.target.value})}
              className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main font-bold uppercase outline-none focus:border-brand-500 transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-dim uppercase tracking-widest">Hasta</label>
            <input 
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange({...dateRange, to: e.target.value})}
              className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main font-bold uppercase outline-none focus:border-brand-500 transition-all"
            />
          </div>
        </div>
      </div>

      <div className="bg-bg-sidebar border border-border-dim rounded-lg overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-border-dim bg-brand-500/5 flex items-center gap-3">
          <AlertTriangle size={16} className="text-brand-500" />
          <p className="text-[10px] font-bold text-brand-500 uppercase tracking-widest">
            Auditando periodo: {dateRange.from} al {dateRange.to}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-bg-accent/50 border-b border-border-dim">
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest">Puesto Operativo</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Horas Carga Encargado</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Horas Definitivas RRHH</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Estado</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dim/50">
              {records.map(record => (
                <tr key={record.id} className="hover:bg-bg-accent/10 transition-colors group">
                  <td className="px-6 py-6 text-[11px] font-black text-text-main uppercase tracking-tight">
                    {record.roleLabel}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-xs font-mono text-text-dim italic">42.5h (Ref)</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                       <Clock size={12} className="text-brand-500" />
                       <input 
                         type="number" 
                         value={record.definitiveHours || ''}
                         onChange={(e) => handleUpdateHours(record.id, parseFloat(e.target.value) || 0)}
                         className="w-24 bg-bg-accent border border-border-dim rounded px-3 py-2 text-center text-xs font-mono font-bold text-text-main outline-none focus:border-brand-500"
                         placeholder="0.0"
                       />
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {record.status === 'verified' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-[9px] font-black uppercase tracking-tighter shadow-sm border border-emerald-500/20">
                         <CheckCircle2 size={10} /> Conciliado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-500/10 text-brand-500 text-[9px] font-black uppercase tracking-tighter shadow-sm border border-brand-500/20">
                         Pendiente
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button 
                      disabled={record.status === 'verified'}
                      onClick={() => handleVerify(record.id)}
                      className={cn(
                        "p-2 rounded transition-all",
                        record.status === 'verified' ? "text-emerald-500 cursor-default" : "text-text-dim hover:bg-bg-accent hover:text-brand-500"
                      )}
                    >
                      <CheckCircle2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-8 border-t border-border-dim bg-bg-accent/20 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="text-center px-6 border-r border-border-dim/50">
               <p className="text-[9px] text-text-dim uppercase font-black">Total Horas Periodo</p>
               <p className="text-lg font-black font-mono text-text-main mt-1">
                 {records.reduce((acc, r) => acc + r.definitiveHours, 0).toFixed(1)}h
               </p>
            </div>
            <div className="text-center px-6">
               <p className="text-[9px] text-text-dim uppercase font-black">Porcentaje Verificado</p>
               <p className="text-lg font-black font-mono text-brand-500 mt-1">
                 {Math.round((records.filter(r => r.status === 'verified').length / records.length) * 100)}%
               </p>
            </div>
          </div>
          
          <button className="bg-brand-500 text-black px-10 py-5 rounded text-[11px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all flex items-center gap-3 shadow-2xl shadow-brand-500/20 border border-brand-500/50">
            <Save size={18} /> Ejecutar Cierre de Periodo
          </button>
        </div>
      </div>
    </motion.div>
  );
}
