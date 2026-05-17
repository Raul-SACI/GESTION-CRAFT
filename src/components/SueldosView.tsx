/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Clock, DollarSign, Save, AlertCircle, Calendar, Plus, Trash2, UserPlus, X, FileSpreadsheet, FileText } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Branch } from '../types';

interface HourRecord {
  id: string;
  roleId: string;
  personName: string;
  hours: number;
  rate: number;
}

const ROLES = [
  { id: 'encargado', label: 'Encargado', defaultRate: 5000 },
  { id: 'caja', label: 'Caja', defaultRate: 2500 },
  { id: 'runners', label: 'Runners', defaultRate: 2200 },
  { id: 'mozos', label: 'Mozos', defaultRate: 2200 },
  { id: 'barra', label: 'Barra', defaultRate: 2800 },
  { id: 'jefe_cocina', label: 'Jefe de Cocina', defaultRate: 4500 },
  { id: 'segundo_cocina', label: 'Segundo de Cocina', defaultRate: 3800 },
  { id: 'cocinero', label: 'Cocinero', defaultRate: 3200 },
  { id: 'bacha', label: 'Bacha', defaultRate: 2000 },
];

export default function HourControlView({ selectedBranchId, branches }: { selectedBranchId: string, branches: Branch[] }) {
  const activeBranch = branches.find(b => b.id === selectedBranchId);
  const [selectedWeekStart, setSelectedWeekStart] = useState(new Date().toISOString().split('T')[0]);
  
  // Staff Pool
  const [staffPool, setStaffPool] = useState<string[]>(['JUAN PEREZ', 'MARIA GARCIA', 'CARLOS LOPEZ', 'ANA MARTINEZ']);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');

  // Table Data
  const [records, setRecords] = useState<HourRecord[]>([
    { id: '1', roleId: 'caja', personName: 'JUAN PEREZ', hours: 40, rate: 2500 },
    { id: '2', roleId: 'mozos', personName: 'MARIA GARCIA', hours: 35, rate: 2200 },
  ]);

  const handleAddStaff = () => {
    if (!newStaffName.trim()) return;
    setStaffPool([...staffPool, newStaffName.trim().toUpperCase()]);
    setNewStaffName('');
    setShowAddStaff(false);
  };

  const handleAddRow = () => {
    const newRecord: HourRecord = {
      id: Math.random().toString(36).substr(2, 9),
      roleId: 'caja',
      personName: '',
      hours: 0,
      rate: 2500
    };
    setRecords([...records, newRecord]);
  };

  const handleRemoveRow = (id: string) => {
    setRecords(records.filter(r => r.id !== id));
  };

  const handleUpdateRecord = (id: string, field: keyof HourRecord, value: any) => {
    setRecords(records.map(r => {
      if (r.id === id) {
        const updated = { ...r, [field]: value };
        // Update rate if role changes
        if (field === 'roleId') {
          const role = ROLES.find(role => role.id === value);
          if (role) updated.rate = role.defaultRate;
        }
        return updated;
      }
      return r;
    }));
  };

  const calculateTotals = () => {
    return records.reduce((acc, r) => ({
      hours: acc.hours + r.hours,
      pesos: acc.pesos + (r.hours * r.rate)
    }), { hours: 0, pesos: 0 });
  };

  const totals = calculateTotals();
  const budgetPesosTotal = 2000000; // Mocked
  const weeklyBudgetPesos = budgetPesosTotal / 4.33;
  const weeklyDiff = totals.pesos - weeklyBudgetPesos;
  const isOverBudget = weeklyDiff > 0;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="bg-brand-500/10 p-2 text-brand-500 border border-brand-500/20 rounded">
            <Clock size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-main uppercase tracking-tight">
              Carga de Horas Reales {activeBranch ? `• ${activeBranch.name}` : '(CONSOLIDADO)'}
            </h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest">
              Carga semanal de horas trabajadas (Recursos Humanos)
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex gap-2 mr-2">
            <button 
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
              onClick={() => window.print()}
            >
              <FileSpreadsheet size={14} /> EXCEL
            </button>
            <button 
              className="flex items-center gap-2 px-4 py-2 bg-brand-500/10 text-brand-500 border border-brand-500/20 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-500/20 transition-all"
              onClick={() => window.print()}
            >
              <FileText size={14} /> PDF
            </button>
          </div>
          
          <button 
            onClick={() => setShowAddStaff(true)}
            className="px-4 py-2 bg-bg-sidebar border border-border-dim rounded text-[10px] font-black uppercase tracking-widest text-text-dim hover:text-brand-500 hover:border-brand-500 transition-all flex items-center gap-2"
          >
            <UserPlus size={14} /> Gestionar Personal
          </button>

          <div className="bg-bg-sidebar border border-border-dim rounded p-2 px-4 flex items-center gap-3">
            <Clock size={16} className="text-brand-500" />
            <div className="flex flex-col">
              <span className="text-[8px] font-bold text-text-dim uppercase leading-none mb-1">Semana del:</span>
              <input 
                type="date" 
                value={selectedWeekStart}
                onChange={(e) => setSelectedWeekStart(e.target.value)}
                className="bg-transparent border-none text-[11px] font-mono text-text-main outline-none uppercase"
              />
            </div>
          </div>
          
          <div className={cn(
            "px-4 py-2 rounded border flex flex-col items-end justify-center min-w-32",
            isOverBudget ? "border-red-500/20 bg-red-500/10 text-red-400" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
          )}>
            <span className="text-[9px] uppercase font-bold tracking-wider opacity-60">Desvío Semanal</span>
            <span className="font-mono font-bold text-lg leading-none mt-1">
              {isOverBudget ? '+' : ''}${weeklyDiff.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 bg-bg-sidebar border border-border-dim rounded overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-border-dim bg-bg-accent/30 flex justify-between items-center">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-text-dim">Registros de Jornada</h3>
            <button 
              onClick={handleAddRow}
              className="text-[10px] font-black uppercase text-brand-500 hover:text-brand-600 transition-all flex items-center gap-2"
            >
              <Plus size={14} /> Agregar Fila
            </button>
          </div>
          <table className="w-full text-left">
            <thead className="bg-[#1C1C1C] border-b border-border-dim text-[10px] font-black uppercase text-text-dim tracking-widest">
              <tr>
                <th className="px-6 py-4">Puesto</th>
                <th className="px-4 py-4">Persona</th>
                <th className="px-4 py-4 text-center">Horas</th>
                <th className="px-4 py-4 text-center">Valor Hora</th>
                <th className="px-6 py-4 text-right">Subtotal</th>
                <th className="px-4 py-4 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dim">
              <AnimatePresence mode="popLayout">
                {records.map((r) => (
                  <motion.tr 
                    key={r.id}
                    layout
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="hover:bg-bg-accent/50 transition-colors group"
                  >
                    <td className="px-6 py-3">
                      <select 
                        value={r.roleId}
                        onChange={(e) => handleUpdateRecord(r.id, 'roleId', e.target.value)}
                        className="w-full bg-bg-accent border border-border-dim rounded px-2 py-1.5 text-[11px] font-bold text-text-main outline-none focus:border-brand-500 uppercase"
                      >
                        {ROLES.map(role => (
                          <option key={role.id} value={role.id}>{role.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select 
                        value={r.personName}
                        onChange={(e) => handleUpdateRecord(r.id, 'personName', e.target.value)}
                        className="w-full bg-bg-accent border border-border-dim rounded px-2 py-1.5 text-[11px] font-bold text-text-main outline-none focus:border-brand-500 uppercase"
                      >
                        <option value="">Seleccionar Persona...</option>
                        {staffPool.map(staff => (
                          <option key={staff} value={staff}>{staff}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="number"
                        value={r.hours || ''}
                        onChange={(e) => handleUpdateRecord(r.id, 'hours', parseFloat(e.target.value) || 0)}
                        className="w-20 mx-auto block bg-bg-accent border border-border-dim rounded py-1.5 px-2 text-center text-text-main font-mono text-[11px] outline-none focus:border-brand-500"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-4 py-3 text-center text-text-dim font-mono text-[11px]">
                      ${r.rate.toLocaleString()}
                    </td>
                    <td className="px-6 py-3 text-right font-mono font-bold text-brand-500">
                      ${(r.hours * r.rate).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button 
                        onClick={() => handleRemoveRow(r.id)}
                        className="text-text-dim hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
            <tfoot>
              <tr className="bg-bg-accent text-white font-mono border-t border-border-dim font-bold">
                <td colSpan={2} className="px-6 py-5 uppercase text-text-dim text-[10px]">Totales Semanales</td>
                <td className="px-4 py-5 text-center text-brand-500">{totals.hours}h</td>
                <td className="px-4 py-5"></td>
                <td className="px-6 py-5 text-right text-lg font-black text-brand-500" colSpan={2}>
                  ${totals.pesos.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
          {records.length === 0 && (
            <div className="py-12 flex flex-col items-center justify-center text-text-dim opacity-30">
              <Clock size={48} />
              <p className="mt-4 text-[10px] font-black uppercase tracking-widest">Presione "Agregar Fila" para comenzar</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-1 space-y-6">
          <div className="bg-bg-sidebar border border-brand-500/20 rounded-lg p-6 relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-4 opacity-5">
                <DollarSign size={60} className="text-brand-500" />
             </div>
             <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#8B949E] mb-4">Eficiencia Semanal</h4>
             <div className="space-y-4">
                <div>
                  <p className="text-[9px] text-text-dim uppercase font-bold opacity-60">Presupuesto Semanal</p>
                  <p className="text-xl font-mono font-bold text-text-main leading-tight">${weeklyBudgetPesos.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[9px] text-text-dim uppercase font-bold opacity-60">Real Devengado</p>
                  <p className="text-xl font-mono font-bold text-text-main leading-tight">${totals.pesos.toLocaleString()}</p>
                </div>
                <div className="pt-4 border-t border-border-dim">
                  <p className="text-[9px] text-text-dim uppercase font-bold opacity-60">Desvío de la Semana</p>
                  <p className={cn(
                    "text-2xl font-mono font-black italic tracking-tighter",
                    isOverBudget ? "text-red-500" : "text-emerald-500"
                  )}>
                    {isOverBudget ? '+' : ''}${weeklyDiff.toLocaleString()}
                  </p>
                </div>
             </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between p-6 bg-bg-accent border border-border-dim rounded">
        <div className="flex items-center gap-3 text-text-dim">
          <AlertCircle size={20} className="text-brand-500" />
          <p className="text-[11px] font-medium uppercase tracking-tight italic text-left">
            Carga de horas verificada por Recursos Humanos. El desvío afecta directamente el P&L de la sucursal.
          </p>
        </div>
        <button className="bg-brand-500 hover:bg-brand-600 text-black px-8 py-3 rounded text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-brand-500/10">
          <Save size={16} /> GUARDAR REGISTROS SEMANALES
        </button>
      </div>

      <AnimatePresence>
        {showAddStaff && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddStaff(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-bg-card border border-border-dim rounded-lg shadow-2xl p-6"
            >
              <h3 className="text-xs font-black uppercase text-brand-500 tracking-widest mb-6 border-l-2 border-brand-500 pl-4">Gestión de Personal</h3>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-dim uppercase">Nombre y Apellido</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="NUEVO INTEGRANTE..."
                      className="flex-1 bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 uppercase"
                      value={newStaffName}
                      onChange={e => setNewStaffName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddStaff()}
                    />
                    <button 
                      onClick={handleAddStaff}
                      className="bg-brand-500 text-black px-4 py-3 rounded text-xs font-black"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 pt-4">
                  <label className="text-[10px] font-bold text-text-dim uppercase">Personal Registrado ({staffPool.length})</label>
                  <div className="max-h-48 overflow-y-auto bg-bg-accent rounded border border-border-dim p-2 space-y-1 custom-scrollbar">
                    {staffPool.map(staff => (
                      <div key={staff} className="flex justify-between items-center p-2 hover:bg-bg-card rounded group">
                        <span className="text-[10px] font-bold text-text-main">{staff}</span>
                        <button 
                          onClick={() => setStaffPool(staffPool.filter(s => s !== staff))}
                          className="text-text-dim hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <button 
                  onClick={() => setShowAddStaff(false)}
                  className="w-full py-4 rounded border border-border-dim text-text-dim text-[10px] font-black uppercase tracking-widest hover:bg-bg-accent transition-all"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

