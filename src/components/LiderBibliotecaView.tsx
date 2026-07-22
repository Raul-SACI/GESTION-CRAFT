/**
 * SPDX-License-Identifier: Apache-2.0
 * Biblioteca de Funciones → Tareas → Descripción del líder (por rol, editable).
 * Etapa 1 del tablero semanal de líderes: acá se define QUÉ tareas existen (agrupadas por
 * función) para después, en la planificación semanal, asignarlas a los días.
 */
import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Plus, Trash2, Edit2, X, Save, Layers, Loader2, ListChecks, FileText } from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

interface Funcion { id: string; role: string; name: string; orden?: number; }
interface Tarea { id: string; funcion_id: string; role: string; title: string; description: string | null; orden?: number; }

const uid = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

export default function LiderBibliotecaView({
  role, roleLabel, isReadOnly = false,
}: { role: string; roleLabel?: string; isReadOnly?: boolean }) {
  const [funciones, setFunciones] = useState<Funcion[]>([]);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [loading, setLoading] = useState(true);

  const [nuevaFuncion, setNuevaFuncion] = useState('');
  const [editFuncion, setEditFuncion] = useState<{ id: string; name: string } | null>(null);

  const [addTareaFor, setAddTareaFor] = useState<string | null>(null);
  const [nuevoTitulo, setNuevoTitulo] = useState('');
  const [nuevaDesc, setNuevaDesc] = useState('');
  const [editTarea, setEditTarea] = useState<{ id: string; title: string; description: string } | null>(null);

  const cargar = async () => {
    setLoading(true);
    try {
      const [{ data: fx }, { data: tk }] = await Promise.all([
        supabase.from('lider_funciones').select('*').eq('role', role).order('orden').order('created_at'),
        supabase.from('lider_tareas').select('*').eq('role', role).order('orden').order('created_at'),
      ]);
      setFunciones((fx as Funcion[]) || []);
      setTareas((tk as Tarea[]) || []);
    } catch { setFunciones([]); setTareas([]); }
    setLoading(false);
  };
  useEffect(() => { if (role) cargar(); }, [role]);

  const agregarFuncion = async () => {
    if (isReadOnly) return;
    const name = nuevaFuncion.trim();
    if (!name) return;
    const row: Funcion = { id: uid(), role, name, orden: funciones.length };
    const { error } = await supabase.from('lider_funciones').insert(row);
    if (error) { alert('Error al crear la función: ' + error.message); return; }
    setNuevaFuncion('');
    setFunciones(p => [...p, row]);
  };

  const guardarNombreFuncion = async () => {
    if (!editFuncion) return;
    const name = editFuncion.name.trim();
    if (!name) return;
    const { error } = await supabase.from('lider_funciones').update({ name }).eq('id', editFuncion.id);
    if (error) { alert('Error: ' + error.message); return; }
    setFunciones(p => p.map(f => f.id === editFuncion.id ? { ...f, name } : f));
    setEditFuncion(null);
  };

  const borrarFuncion = async (id: string) => {
    if (isReadOnly) return;
    if (!window.confirm('¿Eliminar esta función y TODAS sus tareas?')) return;
    await supabase.from('lider_tareas').delete().eq('funcion_id', id);
    await supabase.from('lider_funciones').delete().eq('id', id);
    setTareas(p => p.filter(t => t.funcion_id !== id));
    setFunciones(p => p.filter(f => f.id !== id));
  };

  const agregarTarea = async (funcionId: string) => {
    if (isReadOnly) return;
    const title = nuevoTitulo.trim();
    if (!title) { alert('Escribí la tarea.'); return; }
    const row: Tarea = {
      id: uid(), funcion_id: funcionId, role, title,
      description: nuevaDesc.trim() || null,
      orden: tareas.filter(t => t.funcion_id === funcionId).length,
    };
    const { error } = await supabase.from('lider_tareas').insert(row);
    if (error) { alert('Error al crear la tarea: ' + error.message); return; }
    setTareas(p => [...p, row]);
    setNuevoTitulo(''); setNuevaDesc(''); setAddTareaFor(null);
  };

  const guardarTarea = async () => {
    if (!editTarea) return;
    const title = editTarea.title.trim();
    if (!title) return;
    const description = editTarea.description.trim() || null;
    const { error } = await supabase.from('lider_tareas').update({ title, description }).eq('id', editTarea.id);
    if (error) { alert('Error: ' + error.message); return; }
    setTareas(p => p.map(t => t.id === editTarea.id ? { ...t, title, description } : t));
    setEditTarea(null);
  };

  const borrarTarea = async (id: string) => {
    if (isReadOnly) return;
    if (!window.confirm('¿Eliminar esta tarea?')) return;
    await supabase.from('lider_tareas').delete().eq('id', id);
    setTareas(p => p.filter(t => t.id !== id));
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* Encabezado */}
      <div className="bg-bg-sidebar border border-border-dim rounded-lg p-5">
        <div className="flex items-center gap-3">
          <div className="bg-brand-500/10 p-2.5 rounded-lg"><Layers className="text-brand-500" size={20} /></div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-text-main">Biblioteca de Funciones y Tareas</h3>
            <p className="text-[9px] text-text-dim uppercase font-bold tracking-widest mt-0.5">
              {roleLabel ? `${roleLabel} · ` : ''}Definí las funciones, sus tareas y cómo se hacen. Después se asignan a los días.
            </p>
          </div>
        </div>
      </div>

      {/* Alta de función */}
      {!isReadOnly && (
        <div className="bg-bg-sidebar border border-border-dim rounded-lg p-4 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Nueva función (inherente al rol)</label>
            <input
              type="text"
              value={nuevaFuncion}
              onChange={e => setNuevaFuncion(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') agregarFuncion(); }}
              placeholder="Ej: Controlar los indicadores de los encargados"
              className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-brand-500"
            />
          </div>
          <button onClick={agregarFuncion} disabled={!nuevaFuncion.trim()}
            className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-40">
            <Plus size={13} /> Agregar función
          </button>
        </div>
      )}

      {/* Listado de funciones y tareas */}
      {loading ? (
        <div className="py-10 flex flex-col items-center gap-2 text-text-dim">
          <Loader2 size={26} className="animate-spin text-brand-500" />
          <p className="text-[10px] font-bold uppercase tracking-widest">Cargando biblioteca…</p>
        </div>
      ) : funciones.length === 0 ? (
        <p className="text-center text-[10px] font-bold uppercase text-text-dim py-10">
          Todavía no hay funciones cargadas. Empezá agregando una arriba.
        </p>
      ) : (
        <div className="space-y-4">
          {funciones.map(f => {
            const tareasFuncion = tareas.filter(t => t.funcion_id === f.id);
            return (
              <div key={f.id} className="bg-bg-sidebar border border-border-dim rounded-lg overflow-hidden">
                {/* Cabecera de la función */}
                <div className="flex items-center justify-between gap-2 px-4 py-3 bg-bg-accent/40 border-b border-border-dim">
                  {editFuncion?.id === f.id ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        value={editFuncion.name}
                        onChange={e => setEditFuncion({ ...editFuncion, name: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') guardarNombreFuncion(); if (e.key === 'Escape') setEditFuncion(null); }}
                        autoFocus
                        className="flex-1 bg-bg-card border border-brand-500 rounded px-2 py-1 text-[11px] font-black uppercase text-text-main outline-none"
                      />
                      <button onClick={guardarNombreFuncion} className="text-emerald-500 hover:text-emerald-400"><Save size={14} /></button>
                      <button onClick={() => setEditFuncion(null)} className="text-text-dim hover:text-text-main"><X size={14} /></button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <ListChecks size={14} className="text-brand-500 shrink-0" />
                        <span className="text-[11px] font-black uppercase text-text-main truncate">{f.name}</span>
                        <span className="text-[8px] font-black uppercase text-text-dim bg-bg-card border border-border-dim rounded px-1.5 py-0.5 shrink-0">{tareasFuncion.length} tareas</span>
                      </div>
                      {!isReadOnly && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => setEditFuncion({ id: f.id, name: f.name })} className="text-text-dim hover:text-brand-500" title="Renombrar función"><Edit2 size={13} /></button>
                          <button onClick={() => borrarFuncion(f.id)} className="text-text-dim hover:text-red-500" title="Eliminar función"><Trash2 size={13} /></button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Tareas de la función */}
                <div className="p-3 space-y-2">
                  {tareasFuncion.length === 0 && (
                    <p className="text-[9px] font-bold uppercase text-text-dim opacity-60 text-center py-2">Sin tareas en esta función</p>
                  )}
                  {tareasFuncion.map(t => (
                    <div key={t.id} className="bg-bg-card border border-border-dim/60 rounded px-3 py-2">
                      {editTarea?.id === t.id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editTarea.title}
                            onChange={e => setEditTarea({ ...editTarea, title: e.target.value })}
                            placeholder="Tarea (ej. Revisar que el encargado de BN haya cargado indicadores)"
                            className="w-full bg-bg-accent border border-brand-500/60 rounded px-2 py-1.5 text-[11px] font-bold text-text-main outline-none"
                          />
                          <textarea
                            value={editTarea.description}
                            onChange={e => setEditTarea({ ...editTarea, description: e.target.value })}
                            placeholder="Descripción / cómo se hace (ej. Ingresar a la app y verificar horas, decomisos, ventas…)"
                            rows={2}
                            className="w-full bg-bg-accent border border-border-dim rounded px-2 py-1.5 text-[10px] text-text-main outline-none focus:border-brand-500 resize-y"
                          />
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setEditTarea(null)} className="px-3 py-1 rounded text-[9px] font-black uppercase text-text-dim border border-border-dim hover:text-text-main">Cancelar</button>
                            <button onClick={guardarTarea} className="flex items-center gap-1.5 bg-brand-500 text-white px-3 py-1 rounded text-[9px] font-black uppercase hover:bg-brand-600"><Save size={12} /> Guardar</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold uppercase text-text-main">{t.title}</p>
                            {t.description && (
                              <p className="text-[9px] text-text-dim mt-0.5 flex items-start gap-1"><FileText size={10} className="mt-0.5 shrink-0 opacity-60" /> {t.description}</p>
                            )}
                          </div>
                          {!isReadOnly && (
                            <div className="flex items-center gap-2 shrink-0">
                              <button onClick={() => setEditTarea({ id: t.id, title: t.title, description: t.description || '' })} className="text-text-dim hover:text-brand-500"><Edit2 size={12} /></button>
                              <button onClick={() => borrarTarea(t.id)} className="text-text-dim hover:text-red-500"><Trash2 size={12} /></button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Alta de tarea dentro de la función */}
                  {!isReadOnly && (
                    addTareaFor === f.id ? (
                      <div className="bg-bg-accent/40 border border-brand-500/30 rounded px-3 py-2 space-y-2">
                        <input
                          type="text"
                          value={nuevoTitulo}
                          onChange={e => setNuevoTitulo(e.target.value)}
                          autoFocus
                          placeholder="Tarea (ej. Revisar que el encargado de BN haya cargado indicadores)"
                          className="w-full bg-bg-card border border-brand-500/60 rounded px-2 py-1.5 text-[11px] font-bold text-text-main outline-none"
                        />
                        <textarea
                          value={nuevaDesc}
                          onChange={e => setNuevaDesc(e.target.value)}
                          placeholder="Descripción / cómo se hace (opcional)"
                          rows={2}
                          className="w-full bg-bg-card border border-border-dim rounded px-2 py-1.5 text-[10px] text-text-main outline-none focus:border-brand-500 resize-y"
                        />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => { setAddTareaFor(null); setNuevoTitulo(''); setNuevaDesc(''); }} className="px-3 py-1 rounded text-[9px] font-black uppercase text-text-dim border border-border-dim hover:text-text-main">Cancelar</button>
                          <button onClick={() => agregarTarea(f.id)} disabled={!nuevoTitulo.trim()} className="flex items-center gap-1.5 bg-brand-500 text-white px-3 py-1 rounded text-[9px] font-black uppercase hover:bg-brand-600 disabled:opacity-40"><Plus size={12} /> Agregar</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setAddTareaFor(f.id); setNuevoTitulo(''); setNuevaDesc(''); }}
                        className="w-full flex items-center justify-center gap-1.5 border border-dashed border-border-dim rounded px-3 py-2 text-[9px] font-black uppercase tracking-widest text-text-dim hover:text-brand-500 hover:border-brand-500/50 transition-all">
                        <Plus size={12} /> Agregar tarea a esta función
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
