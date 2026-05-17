/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Plus, 
  Trash2, 
  Briefcase, 
  DollarSign, 
  Clock, 
  Calendar,
  X,
  AlertCircle,
  TrendingUp,
  CheckCircle2,
  FileSpreadsheet,
  FileText
} from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface SalaryPosition {
  id: string;
  title: string;
  type: 'hourly' | 'monthly';
  baseValue: number;
  category: string;
}

export default function SalaryManagementView() {
  const [positions, setPositions] = useState<SalaryPosition[]>([
    { id: '1', title: 'Cocinero A', type: 'hourly', baseValue: 3500, category: 'Cocina' },
    { id: '2', title: 'Mozo Salon', type: 'hourly', baseValue: 2800, category: 'Servicio' },
    { id: '3', title: 'Gerente Operativo', type: 'monthly', baseValue: 850000, category: 'Administración' },
    { id: '4', title: 'Sub-Encargado', type: 'monthly', baseValue: 620000, category: 'Gestión' },
  ]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newPos, setNewPos] = useState({
    title: '',
    type: 'hourly' as 'hourly' | 'monthly',
    baseValue: 0,
    category: ''
  });

  const handleAddPosition = () => {
    if (!newPos.title || newPos.baseValue <= 0) return;
    
    const pos: SalaryPosition = {
      id: Math.random().toString(36).substr(2, 9),
      ...newPos
    };

    setPositions([...positions, pos]);
    setShowAddModal(false);
    setNewPos({ title: '', type: 'hourly', baseValue: 0, category: '' });
  };

  const handleRemovePosition = (id: string) => {
    setPositions(positions.filter(p => p.id !== id));
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
            <Users className="text-brand-500" size={24} /> Sueldos y Escalas
          </h2>
          <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mt-1 opacity-70">
            Definición de puestos de trabajo y valores de remuneración
          </p>
        </div>

        <div className="flex gap-2">
          <button 
            className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
            onClick={() => window.print()}
          >
            <FileSpreadsheet size={14} /> EXCEL
          </button>
          <button 
            className="flex items-center gap-2 px-4 py-3 bg-brand-500/10 text-brand-500 border border-brand-500/20 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-500/20 transition-all"
            onClick={() => window.print()}
          >
            <FileText size={14} /> PDF
          </button>
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-brand-500 text-black px-6 py-3 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all flex items-center gap-2 shadow-xl shadow-brand-500/10"
          >
            <Plus size={14} /> Nuevo Puesto / Valor
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-bg-sidebar border border-border-dim rounded-lg overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-border-dim bg-bg-accent/30">
            <h3 className="text-xs font-black uppercase tracking-widest text-text-main">Vigencia de Valores Mayo 2024</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-bg-accent border-b border-border-dim">
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest">Área / Puesto</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest">Tipo</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Valor Base</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dim/50">
                {positions.map(pos => (
                  <tr key={pos.id} className="hover:bg-bg-accent/10 transition-colors group">
                    <td className="px-6 py-6">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-text-main uppercase">{pos.title}</span>
                        <span className="text-[9px] text-brand-500 font-bold uppercase tracking-tighter opacity-70">{pos.category}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {pos.type === 'hourly' ? <Clock size={12} className="text-blue-500" /> : <Calendar size={12} className="text-emerald-500" />}
                        <span className={cn(
                          "text-[9px] font-black uppercase px-2 py-0.5 rounded",
                          pos.type === 'hourly' ? "bg-blue-500/10 text-blue-500" : "bg-emerald-500/10 text-emerald-500"
                        )}>
                          {pos.type === 'hourly' ? 'Por Hora' : 'Mensual'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-[14px] font-black font-mono text-text-main">
                        ${pos.baseValue.toLocaleString('es-AR')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleRemovePosition(pos.id)}
                        className="p-2 text-text-dim hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-bg-card border border-border-dim rounded-lg p-6">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-main mb-6 flex items-center gap-2">
              <TrendingUp size={14} className="text-brand-500" /> Resumen de Costos
            </h4>
            <div className="space-y-4">
              <div className="p-4 bg-bg-accent rounded-lg border border-border-dim">
                <p className="text-[9px] text-text-dim uppercase font-bold">Promedio Hora Operativa</p>
                <div className="flex items-end justify-between mt-1">
                  <p className="text-xl font-black font-mono text-text-main">$3.150</p>
                  <span className="text-[10px] text-emerald-500 font-bold tracking-tighter">+4.2%</span>
                </div>
              </div>
              <div className="p-4 bg-bg-accent rounded-lg border border-border-dim">
                <p className="text-[9px] text-text-dim uppercase font-bold">Masa Salarial Mensual Est.</p>
                <div className="flex items-end justify-between mt-1">
                  <p className="text-xl font-black font-mono text-text-main">$8.4M</p>
                  <span className="text-[10px] text-text-dim font-bold tracking-tighter">CONSOLIDADO</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-brand-500/5 border border-brand-500/20 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-brand-500/20 rounded">
                <AlertCircle size={18} className="text-brand-500" />
              </div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-500">Nota de Auditoría</h4>
            </div>
            <p className="text-[11px] text-text-main leading-relaxed">
              Cualquier modificación en los valores de remuneración impactará directamente en los cálculos de <span className="font-bold">Estado de Resultado</span> y <span className="font-bold">Presupuesto de Horas</span>. Asegúrese de realizar cambios sólo bajo supervisión general.
            </p>
            <div className="mt-4 flex items-center gap-2 text-[9px] font-black uppercase text-brand-500">
               <CheckCircle2 size={12} /> Valores Revisados
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-bg-card border border-border-dim rounded-lg shadow-2xl p-6"
            >
              <h3 className="text-xs font-black uppercase text-brand-500 tracking-widest mb-6 border-l-2 border-brand-500 pl-4">
                Configurar Nuevo Puesto / Sueldo
              </h3>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-dim uppercase">Área / Sector</label>
                  <input 
                    type="text" 
                    placeholder="Ej: Cocina, Barra, Salón, Limpieza..."
                    className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500"
                    value={newPos.category}
                    onChange={e => setNewPos({...newPos, category: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-dim uppercase">Puesto de Trabajo</label>
                  <input 
                    type="text" 
                    placeholder="Ej: Ayudante, Mozo de Piso, Encargado..."
                    className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500"
                    value={newPos.title}
                    onChange={e => setNewPos({...newPos, title: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-text-dim uppercase">Modalidad</label>
                    <select 
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 font-bold uppercase transition-all"
                      value={newPos.type}
                      onChange={e => setNewPos({...newPos, type: e.target.value as any})}
                    >
                      <option value="hourly">Por Hora</option>
                      <option value="monthly">Mensual</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-text-dim uppercase">Valor Vigente ($)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={14} />
                      <input 
                        type="number" 
                        placeholder="0.00"
                        className="w-full bg-bg-accent border border-border-dim rounded pl-8 pr-4 py-3 text-xs text-text-main font-mono outline-none focus:border-brand-500"
                        value={newPos.baseValue || ''}
                        onChange={e => setNewPos({...newPos, baseValue: parseFloat(e.target.value)})}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                <button 
                  onClick={handleAddPosition}
                  className="flex-1 bg-brand-500 text-black py-4 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-xl shadow-brand-500/10"
                >
                  Registrar Puesto
                </button>
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="px-8 py-4 rounded border border-border-dim text-text-dim text-[10px] font-black uppercase tracking-widest hover:bg-bg-accent transition-all"
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
