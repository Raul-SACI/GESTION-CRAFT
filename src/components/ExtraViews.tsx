/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Star, Utensils, ClipboardList, Plus, MessageSquare, MapPin, ExternalLink, Calendar } from 'lucide-react';
import { cn } from '@/src/lib/utils';

import { Branch } from '../types';

export const PerformanceView: React.FC<{ branches: Branch[], selectedBranchId: string }> = ({ branches, selectedBranchId }) => {
  const selectedBranch = branches.find(b => b.id === selectedBranchId);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-8"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-orange-500/10 p-2 text-orange-500 border border-orange-500/20 rounded">
            <Star size={20} className="fill-orange-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-main uppercase tracking-tight">Desempeño y Feedback</h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest">Plataformas externas y satisfacción</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-bg-sidebar border border-border-dim p-8 space-y-6 rounded">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase text-text-dim flex items-center gap-2 border-l-2 border-brand-500 pl-2">
              Google Maps
            </h3>
            {selectedBranch?.googleMapsUrl ? (
              <a 
                href={selectedBranch.googleMapsUrl} 
                target="_blank" 
                rel="noreferrer"
                className="text-brand-500 font-bold text-[10px] uppercase tracking-widest flex items-center gap-1 hover:underline"
              >
                Ver perfil <ExternalLink size={12} />
              </a>
            ) : (
              <span className="text-text-dim/40 font-bold text-[10px] uppercase tracking-widest flex items-center gap-1">
                Link no disponible
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-6 py-6 border-y border-border-dim">
             <div className="text-5xl font-mono font-bold text-text-main tracking-tighter">4.7</div>
             <div className="space-y-2">
                <div className="flex text-orange-400 gap-0.5">
                   {[1,2,3,4,5].map(i => <Star key={i} size={14} className="fill-orange-400" />)}
                </div>
                <p className="text-[9px] text-text-dim font-bold uppercase tracking-widest opacity-60">1,248 reseñas totales</p>
             </div>
          </div>

          <div className="space-y-4">
             <h4 className="text-[10px] font-black uppercase tracking-widest text-[#8B949E]">Comentarios Destacados</h4>
             {[1, 2].map(i => (
               <div key={i} className="p-4 bg-bg-accent rounded border border-border-dim">
                  <p className="text-[11px] font-medium text-text-dim leading-relaxed italic opacity-80">"Excelente atención de los mozos y la comida llegó muy rápido. El vacío estaba en su punto justo."</p>
                  <p className="text-[9px] font-bold text-text-dim mt-3 uppercase tracking-tighter opacity-40">2 DÍAS ATRÁS — VERIFICADO</p>
               </div>
             ))}
          </div>
        </div>

        <div className="bg-bg-sidebar border border-border-dim p-8 space-y-6 rounded">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase text-text-dim border-l-2 border-red-500 pl-2">
               Pedidos Ya
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 py-6 border-y border-border-dim">
             <div className="p-4 bg-red-500/5 rounded border border-red-500/10 text-center">
                <p className="text-[9px] font-bold text-red-400 uppercase tracking-widest mb-1 opacity-60">Calificación</p>
                <p className="text-2xl font-mono font-bold text-red-400">4.5</p>
             </div>
             <div className="p-4 bg-bg-accent rounded border border-border-dim text-center">
                <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest mb-1 opacity-60">Demora Prom.</p>
                <p className="text-2xl font-mono font-bold text-text-main">22m</p>
             </div>
          </div>

          <div className="space-y-4">
             <h4 className="text-[10px] font-black uppercase tracking-widest text-red-400">Alertas Críticas</h4>
             <div className="p-4 bg-red-600 text-white rounded shadow-lg shadow-red-900/40">
                <div className="flex gap-3">
                   <div className="p-1.5 bg-black/20 rounded h-fit"><MessageSquare size={14} /></div>
                   <div>
                      <p className="text-[11px] font-black uppercase tracking-tight">2 Comentarios Negativos</p>
                      <p className="text-[10px] opacity-90 mt-1 italic leading-snug">"La comida llegó fría y faltaban los cubiertos solicitados en la orden #4521"</p>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export const TablewareView: React.FC<{ branches: Branch[], selectedBranchId: string }> = ({ branches, selectedBranchId }) => {
  const categories = ['Platos', 'Cubiertos', 'Copas', 'Textiles'];
  const activeBranch = branches.find(b => b.id === selectedBranchId);
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-brand-500/10 p-2 text-brand-500 border border-brand-500/20 rounded">
            <Utensils size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-main uppercase tracking-tight">
              Control de Vajilla {activeBranch ? `• ${activeBranch.name}` : '(CONSOLIDADO)'}
            </h1>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest">Inventario semanal de rotura y faltantes</p>
          </div>
        </div>
        {selectedBranchId !== 'all' && (
          <button className="bg-brand-500 hover:bg-brand-600 text-black px-6 py-2 rounded text-[11px] font-black uppercase tracking-widest transition-all shadow-lg shadow-brand-500/10">
             INGRESAR INVENTARIO
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {categories.map(cat => (
           <div key={cat} className="bg-bg-sidebar border border-border-dim p-6 hover:border-brand-500 transition-all cursor-pointer group rounded">
              <div className="w-10 h-10 rounded bg-bg-accent border border-border-dim flex items-center justify-center text-text-dim mb-4 group-hover:text-brand-500 transition-colors">
                 <Utensils size={18} />
              </div>
              <h3 className="text-xs font-bold text-text-main uppercase tracking-tight">{cat}</h3>
              <p className="text-[9px] text-text-dim mt-1 font-bold uppercase opacity-50">CONTROL: 5 DÍAS ATRÁS</p>
           </div>
        ))}
      </div>

      <div className="bg-bg-sidebar border border-border-dim rounded overflow-hidden">
         <table className="w-full text-[11px]">
            <thead className="bg-bg-accent border-b border-border-dim text-text-dim">
               <tr className="uppercase font-bold">
                  <th className="px-8 py-3 text-left tracking-widest">Ítem</th>
                  <th className="px-8 py-3 text-center tracking-widest">Stock Ideal</th>
                  <th className="px-8 py-3 text-center tracking-widest">Actual</th>
                  <th className="px-8 py-3 text-right tracking-widest">Estado</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-border-dim">
               {[
                 { name: 'Plato Playo 26cm', ideal: 120, current: 114 },
                 { name: 'Copa Vino Tinto', ideal: 80, current: 62 },
                 { name: 'Tenedor Principal', ideal: 200, current: 198 },
               ].map((item, i) => (
                 <tr key={i} className="hover:bg-bg-accent/50 transition-colors">
                    <td className="px-8 py-5 text-text-main font-bold uppercase tracking-tight">{item.name}</td>
                    <td className="px-8 py-5 text-center text-text-dim font-mono">{item.ideal}</td>
                    <td className="px-8 py-5 text-center font-bold text-text-main font-mono">{item.current}</td>
                    <td className="px-8 py-5 text-right">
                       <span className={cn(
                         "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border",
                         item.current < item.ideal * 0.9 ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                       )}>
                         {item.current < item.ideal * 0.9 ? 'Reponer' : 'OK'}
                       </span>
                    </td>
                 </tr>
               ))}
            </tbody>
         </table>
      </div>
    </motion.div>
  );
}

export const NewsView: React.FC<{ branches: Branch[], selectedBranchId: string }> = ({ branches, selectedBranchId }) => {
  const activeBranch = branches.find(b => b.id === selectedBranchId);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-3xl mx-auto space-y-10"
    >
      <div className="text-center space-y-2">
         <h2 className="text-2xl font-bold text-text-main tracking-tight uppercase">
           Bitácora de Novedades {activeBranch ? `• ${activeBranch.name}` : '(TODAS)'}
         </h2>
         <p className="text-text-dim text-[11px] font-bold uppercase tracking-widest opacity-60">Registro diario de incidencias operativas</p>
      </div>

      {selectedBranchId !== 'all' && (
        <div className="bg-bg-sidebar border border-brand-500/30 p-8 rounded relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <ClipboardList size={80} />
           </div>
           <h4 className="text-[11px] font-black uppercase text-brand-500 mb-6 flex items-center gap-2">
              <Plus size={16} /> NUEVA ENTRADA DE BITÁCORA ({activeBranch?.name})
           </h4>
           <textarea 
              placeholder="DESCRIBE LOS EVENTOS DEL DÍA... (EJ: INSPECCIONES, REVISIONES TÉCNICAS, NOVEDADES DE PERSONAL)"
              className="w-full h-32 bg-bg-accent border border-border-dim rounded p-4 text-[11px] outline-none focus:border-brand-500 transition-all font-bold uppercase tracking-widest placeholder:text-text-dim/30 placeholder:italic"
           />
           <div className="mt-6 flex justify-end">
              <button className="bg-brand-500 text-black px-10 py-2.5 rounded text-[11px] font-black uppercase tracking-widest shadow-lg shadow-brand-500/10">PUBLICAR REGISTRO</button>
           </div>
        </div>
      )}

      <div className="space-y-4 relative">
         <div className="absolute left-[31px] top-6 bottom-6 w-px bg-border-dim border-dashed border-r opacity-30" />
         {[1, 2, 3].map(i => (
            <div key={i} className="flex gap-8 items-start relative bg-bg-sidebar border border-border-dim p-6 rounded group hover:border-brand-500/30 transition-colors">
               <div className="w-16 h-16 rounded bg-bg-accent border border-border-dim flex flex-col items-center justify-center text-text-main flex-shrink-0 z-10">
                  <span className="text-[9px] font-black uppercase leading-none opacity-40 mb-1">MAY</span>
                  <span className="text-xl font-mono font-bold leading-none">{14 - i}</span>
               </div>
               <div className="space-y-3 pt-1">
                  <div className="flex items-center gap-4">
                     <p className="text-[11px] font-black text-text-main uppercase tracking-tight">Sucursal Barrio Norte</p>
                     <span className="text-[9px] text-brand-500 font-bold uppercase tracking-widest flex items-center gap-1 opacity-80">
                        <Calendar size={12} /> MARTES, 19:42HS
                     </span>
                  </div>
                  <p className="text-[11px] text-text-dim leading-relaxed font-medium uppercase tracking-tight opacity-70">
                     Hoy recibimos la inspección de bromatología. Se realizaron ajustes menores en el etiquetado de la cámara 2. El técnico de A/C pasó a revisar el equipo del salón, falta repuesto de compresor.
                  </p>
                  <div className="flex items-center gap-2 border-t border-border-dim pt-3 mt-4">
                     <div className="w-6 h-6 rounded bg-brand-500/20 flex items-center justify-center text-brand-500 text-[8px] font-black">CH</div>
                     <span className="text-[9px] text-text-dim uppercase font-bold tracking-widest opacity-50">Carlos Herrera • Encargado Operativo</span>
                  </div>
               </div>
            </div>
         ))}
      </div>
    </motion.div>
  );
}
