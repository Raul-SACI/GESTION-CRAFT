/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Star, Utensils, ClipboardList, Plus, MessageSquare, MapPin, ExternalLink, Calendar, Loader2, Trash2 } from 'lucide-react';
 import { cn } from '@/src/lib/utils';
 import { Branch } from '../types';
 import { supabase } from '../lib/supabase';

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

export const NewsView: React.FC<{ branches: Branch[], selectedBranchId: string }> = ({ branches, selectedBranchId }) => {
  const activeBranch = branches.find(b => b.id === selectedBranchId);
  const [newEntries, setNewEntries] = useState<any[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchNews = async () => {
    let query = supabase.from('news').select('*').order('created_at', { ascending: false });
    if (selectedBranchId !== 'all') {
      query = query.eq('branch_id', selectedBranchId);
    }
    const { data } = await query;
    if (data) setNewEntries(data);
  };

  React.useEffect(() => {
    fetchNews();
  }, [selectedBranchId]);

  const handlePost = async () => {
    if (!content.trim() || selectedBranchId === 'all') return;
    setLoading(true);
    const { error } = await supabase.from('news').insert([{
      branch_id: selectedBranchId,
      title: `Bitácora - ${new Date().toLocaleDateString()}`,
      content: content.toUpperCase(),
      importance: 'normal'
    }]);

    if (!error) {
      setContent('');
      fetchNews();
    }
    setLoading(false);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-3xl mx-auto space-y-10"
    >
      <div className="text-center space-y-2">
         <h2 className="text-2xl font-bold text-text-main tracking-tight uppercase">
           Bitácora de Novedades {activeBranch ? `• ${activeBranch.name}` : '(Todas las sucursales)'}
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
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="DESCRIBE LOS EVENTOS DEL DÍA... (EJ: INSPECCIONES, REVISIONES TÉCNICAS, NOVEDADES DE PERSONAL)"
              className="w-full h-32 bg-bg-accent border border-border-dim rounded p-4 text-[11px] outline-none focus:border-brand-500 transition-all font-bold uppercase tracking-widest placeholder:text-text-dim/30 placeholder:italic"
           />
           <div className="mt-6 flex justify-end">
              <button 
                onClick={handlePost}
                disabled={loading}
                className="bg-brand-500 text-black px-10 py-2.5 rounded text-[11px] font-black uppercase tracking-widest shadow-lg shadow-brand-500/10 flex items-center gap-2"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                PUBLICAR REGISTRO
              </button>
           </div>
        </div>
      )}

      <div className="space-y-4 relative">
         <div className="absolute left-[31px] top-6 bottom-6 w-px bg-border-dim border-dashed border-r opacity-30" />
         {newEntries.length === 0 ? (
           <div className="text-center py-10 opacity-30 italic text-[10px] uppercase">No hay novedades registradas</div>
         ) : (
           newEntries.map(entry => {
             const date = new Date(entry.created_at);
             const branch = branches.find(b => b.id === entry.branch_id);
             return (
               <div key={entry.id} className="flex gap-8 items-start relative bg-bg-sidebar border border-border-dim p-6 rounded group hover:border-brand-500/30 transition-colors">
                  <div className="w-16 h-16 rounded bg-bg-accent border border-border-dim flex flex-col items-center justify-center text-text-main flex-shrink-0 z-10">
                     <span className="text-[9px] font-black uppercase leading-none opacity-40 mb-1">
                       {date.toLocaleString('es-AR', { month: 'short' }).toUpperCase()}
                     </span>
                     <span className="text-xl font-mono font-bold leading-none">{date.getDate()}</span>
                  </div>
                  <div className="space-y-3 pt-1 flex-1">
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                           <p className="text-[11px] font-black text-text-main uppercase tracking-tight">{branch?.name || 'Sistema'}</p>
                           <span className="text-[9px] text-brand-500 font-bold uppercase tracking-widest flex items-center gap-1 opacity-80">
                              <Loader2 size={12} className="hidden" /> {/* Placeholder for icon */}
                              {date.toLocaleDateString('es-AR', { weekday: 'long' }).toUpperCase()}, {date.getHours()}:{date.getMinutes().toString().padStart(2, '0')}HS
                           </span>
                        </div>
                        <button 
                          onClick={async () => {
                            if(confirm('¿Eliminar novedad?')) {
                              await supabase.from('news').delete().eq('id', entry.id);
                              fetchNews();
                            }
                          }}
                          className="p-1 text-text-dim hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                     </div>
                     <p className="text-[11px] text-text-dim leading-relaxed font-medium uppercase tracking-tight opacity-70">
                        {entry.content}
                     </p>
                  </div>
               </div>
             );
           })
         )}
      </div>
    </motion.div>
  );
}
