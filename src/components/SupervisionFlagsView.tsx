import React, { useState } from 'react';
import { 
  Flag, 
  Settings, 
  ClipboardCheck, 
  Plus, 
  Trash2, 
  ChevronRight, 
  ChevronDown,
  Save,
  FileText,
  AlertCircle,
  CheckCircle2,
  XCircle,
  MoreVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Branch } from '../types';

interface Option {
  id: string;
  text: string;
  score: number; // 0 for fail, 1 for pass, or intermediate
  color: 'red' | 'yellow' | 'green';
}

interface Question {
  id: string;
  text: string;
  options: Option[];
}

interface AuditTemplate {
  id: string;
  name: string;
  category: string;
  questions: Question[];
}

export default function SupervisionFlagsView({ branches }: { branches: Branch[] }) {
  const [viewMode, setViewMode] = useState<'admin' | 'supervisor'>('admin');
  const [templates, setTemplates] = useState<AuditTemplate[]>([
    {
      id: '1',
      name: 'Auditoría Bromatológica y Limpieza',
      category: 'Calidad',
      questions: [
        {
          id: 'q1',
          text: '¿Se respeta la cadena de frío en cámaras?',
          options: [
            { id: 'o1', text: 'Sí, cumple plenamente', score: 1, color: 'green' },
            { id: 'o2', text: 'Observaciones menores', score: 0.5, color: 'yellow' },
            { id: 'o3', text: 'No cumple (Peligro)', score: 0, color: 'red' }
          ]
        },
        {
          id: 'q2',
          text: 'Estado de uniformes y pulcritud del personal',
          options: [
            { id: 'o4', text: 'Excelente', score: 1, color: 'green' },
            { id: 'o5', text: 'Regular', score: 0, color: 'red' }
          ]
        }
      ]
    }
  ]);

  const [selectedTemplate, setSelectedTemplate] = useState<AuditTemplate | null>(templates[0]);
  const [isEditing, setIsEditing] = useState(false);

  const addQuestion = () => {
    if (!selectedTemplate) return;
    const newQuestion: Question = {
      id: Math.random().toString(36).substr(2, 9),
      text: 'Nueva Pregunta',
      options: [
        { id: 'no1', text: 'Cumple', score: 1, color: 'green' },
        { id: 'no2', text: 'No Cumple', score: 0, color: 'red' }
      ]
    };
    setSelectedTemplate({
      ...selectedTemplate,
      questions: [...selectedTemplate.questions, newQuestion]
    });
  };

  const updateQuestionText = (qId: string, text: string) => {
    if (!selectedTemplate) return;
    setSelectedTemplate({
      ...selectedTemplate,
      questions: selectedTemplate.questions.map(q => q.id === qId ? { ...q, text } : q)
    });
  };

  const deleteQuestion = (qId: string) => {
    if (!selectedTemplate) return;
    setSelectedTemplate({
      ...selectedTemplate,
      questions: selectedTemplate.questions.filter(q => q.id !== qId)
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-border-dim pb-4 gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-brand-500/10 p-3 text-brand-500 border border-brand-500/20 rounded-lg shadow-inner">
            <Flag size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-text-main uppercase tracking-tight">Supervisiones y Banderas</h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest italic opacity-70">Auditorías Operativas y Control de Calidad</p>
          </div>
        </div>

        <div className="flex bg-bg-sidebar p-1 rounded border border-border-dim shadow-sm">
          <button 
            onClick={() => setViewMode('admin')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all",
              viewMode === 'admin' ? "bg-bg-accent text-brand-500 shadow-md border border-border-dim/50" : "text-text-dim hover:text-text-main"
            )}
          >
            <Settings size={14} /> Consola Admin
          </button>
          <button 
            onClick={() => setViewMode('supervisor')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all",
              viewMode === 'supervisor' ? "bg-bg-accent text-brand-500 shadow-md border border-border-dim/50" : "text-text-dim hover:text-text-main"
            )}
          >
            <ClipboardCheck size={14} /> Registro de Visita
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {viewMode === 'admin' ? (
          <motion.div 
            key="admin"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="grid grid-cols-12 gap-6"
          >
            {/* Template List */}
            <div className="col-span-12 lg:col-span-4 space-y-4">
              <div className="bg-bg-sidebar border border-border-dim rounded-lg p-5 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-black uppercase text-brand-500 tracking-widest">Formularios / Templates</h3>
                  <button className="p-1.5 bg-brand-500/10 text-brand-500 rounded-md hover:bg-brand-500/20 transition-colors">
                    <Plus size={16} />
                  </button>
                </div>
                <div className="space-y-2">
                  {templates.map(t => (
                    <button 
                      key={t.id}
                      onClick={() => setSelectedTemplate(t)}
                      className={cn(
                        "w-full text-left p-4 rounded-md border transition-all flex items-center justify-between group",
                        selectedTemplate?.id === t.id 
                          ? "bg-brand-500/5 border-brand-500/30 text-brand-500" 
                          : "bg-bg-accent border-border-dim text-text-dim hover:border-brand-500/30"
                      )}
                    >
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-tight">{t.name}</p>
                        <p className="text-[9px] font-bold opacity-60 mt-1">{t.questions.length} PREGUNTAS</p>
                      </div>
                      <ChevronRight size={14} className={cn("transition-transform", selectedTemplate?.id === t.id && "translate-x-1")} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-orange-500/5 border border-orange-500/20 p-5 rounded-lg">
                <div className="flex gap-3">
                  <AlertCircle className="text-orange-500 flex-shrink-0" size={20} />
                  <div>
                    <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Importante</p>
                    <p className="text-[9px] text-text-main font-bold mt-1 leading-relaxed italic opacity-70">
                      Las banderas se disparan automáticamente cuando el supervisor marca una opción con puntaje 0 (Rojo). Esto genera una alerta inmediata en el dashboard de administración.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Builder Area */}
            <div className="col-span-12 lg:col-span-8 bg-bg-sidebar border border-border-dim rounded-xl p-8 shadow-2xl border-t-4 border-t-brand-500 min-h-[600px]">
              {selectedTemplate ? (
                <div className="space-y-8">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <input 
                        type="text" 
                        value={selectedTemplate.name}
                        onChange={(e) => setSelectedTemplate({...selectedTemplate, name: e.target.value})}
                        className="text-2xl font-black uppercase text-text-main bg-transparent outline-none border-b-2 border-transparent focus:border-brand-500 w-full tracking-tighter"
                      />
                      <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mt-2 px-1">Editor de Cuestionario Operativo</p>
                    </div>
                    <button className="flex items-center gap-2 bg-brand-500 text-black px-6 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-lg shadow-brand-500/10">
                      <Save size={14} /> Guardar Cambios
                    </button>
                  </div>

                  <div className="space-y-4">
                    {selectedTemplate.questions.map((q, idx) => (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={q.id} 
                        className="bg-bg-accent/40 border border-border-dim/50 rounded-lg p-6 group hover:border-brand-500/30 transition-all"
                      >
                        <div className="flex justify-between gap-4 mb-4">
                          <div className="flex items-start gap-4 flex-1">
                            <span className="w-8 h-8 rounded-full bg-bg-sidebar border border-border-dim flex items-center justify-center text-[10px] font-black text-brand-500 shadow-inner">
                              {idx + 1}
                            </span>
                            <div className="flex-1">
                              <input 
                                type="text"
                                value={q.text}
                                onChange={(e) => updateQuestionText(q.id, e.target.value)}
                                className="w-full bg-transparent text-sm font-black text-text-main uppercase tracking-tight outline-none border-b border-transparent focus:border-brand-500"
                              />
                            </div>
                          </div>
                          <button 
                            onClick={() => deleteQuestion(q.id)}
                            className="text-text-dim hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 ml-12">
                          {q.options.map((opt) => (
                            <div key={opt.id} className="flex flex-col gap-2 p-3 bg-bg-sidebar border border-border-dim rounded-md">
                               <div className="flex items-center gap-2">
                                  <div className={cn(
                                    "w-3 h-3 rounded-sm",
                                    opt.color === 'green' ? 'bg-emerald-500' : opt.color === 'yellow' ? 'bg-orange-500' : 'bg-red-500'
                                  )}></div>
                                  <input 
                                    className="bg-transparent text-[10px] font-bold uppercase text-text-main outline-none w-full" 
                                    defaultValue={opt.text} 
                                  />
                               </div>
                               <div className="flex items-center justify-between text-[8px] font-black uppercase text-text-dim">
                                  <span>PESO: {opt.score > 0 ? (opt.score === 1 ? 'APROBADO' : 'OBSERVADO') : 'BANDERA ROJA'}</span>
                               </div>
                            </div>
                          ))}
                          <button className="flex items-center justify-center gap-2 border border-dashed border-border-dim rounded-md p-3 text-[9px] font-black uppercase text-text-dim hover:text-brand-500 hover:border-brand-500 transition-all">
                             <Plus size={12} /> Agregar Opción
                          </button>
                        </div>
                      </motion.div>
                    ))}

                    <button 
                      onClick={addQuestion}
                      className="w-full py-6 border-2 border-dashed border-border-dim/40 rounded-xl text-[10px] font-black uppercase tracking-widest text-text-dim hover:border-brand-500 hover:text-brand-500 hover:bg-brand-500/5 transition-all flex items-center justify-center gap-3"
                    >
                      <Plus size={18} /> Agregar Pregunta al Formulario
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-text-dim opacity-50 space-y-4">
                  <FileText size={48} strokeWidth={1} />
                  <p className="text-[10px] font-black uppercase tracking-widest">Seleccione un formulario para editar</p>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="supervisor"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
             {/* Mock Supervisor View */}
             <div className="max-w-3xl mx-auto space-y-6">
                <div className="bg-bg-sidebar border border-border-dim rounded-xl p-8 shadow-2xl">
                   <div className="flex justify-between items-center mb-8 border-b border-border-dim pb-6">
                      <div>
                         <h3 className="text-xl font-black uppercase text-text-main tracking-tight">Nueva Visita de Supervisión</h3>
                         <div className="flex items-center gap-3 mt-2">
                            <span className="px-2 py-0.5 bg-brand-500 text-black text-[9px] font-black rounded uppercase">Sucursal Yerba Buena</span>
                            <span className="text-[10px] font-bold text-text-dim uppercase tracking-widest">{new Date().toLocaleDateString()}</span>
                         </div>
                      </div>
                      <div className="text-right">
                         <p className="text-[9px] font-black text-text-dim uppercase">Supervisor</p>
                         <p className="text-[11px] font-black text-text-main uppercase">Juan Carlos Pérez</p>
                      </div>
                   </div>

                   {selectedTemplate?.questions.map((q, idx) => (
                     <div key={q.id} className="mb-8 last:mb-0">
                        <p className="text-sm font-black text-text-main uppercase mb-4 flex items-center gap-3">
                           <span className="text-brand-500 italic opacity-50">#{idx + 1}</span> {q.text}
                        </p>
                        <div className="grid grid-cols-1 gap-2">
                           {q.options.map(opt => (
                             <button 
                                key={opt.id}
                                className={cn(
                                  "w-full p-4 rounded-lg border text-left flex items-center justify-between transition-all group",
                                  "bg-bg-accent border-border-dim text-text-dim hover:border-brand-500"
                                )}
                             >
                                <div className="flex items-center gap-3">
                                   <div className={cn(
                                     "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all",
                                     "border-border-dim group-hover:border-brand-500"
                                   )}>
                                      <div className="w-1.5 h-1.5 rounded-full bg-brand-500 opacity-0 group-hover:opacity-100"></div>
                                   </div>
                                   <span className="text-[11px] font-bold uppercase tracking-tight">{opt.text}</span>
                                </div>
                                {opt.color === 'red' && (
                                   <div className="px-2 py-1 bg-red-500/10 text-red-500 border border-red-500/20 rounded text-[8px] font-black italic">
                                      DISPARA BANDERA ROJA
                                   </div>
                                )}
                             </button>
                           ))}
                        </div>
                     </div>
                   ))}

                   <div className="mt-12 pt-8 border-t border-border-dim space-y-6">
                      <div className="space-y-2">
                         <p className="text-[10px] font-black text-text-dim uppercase tracking-widest">Observaciones Generales / Plan de Acción</p>
                         <textarea 
                           className="w-full bg-bg-accent border border-border-dim rounded-lg p-4 text-[11px] font-bold uppercase text-text-main outline-none focus:border-brand-500 h-32"
                           placeholder="ESCRIBA AQUÍ LAS OBSERVACIONES DE LA VISITA..."
                         />
                      </div>
                      <button className="w-full bg-brand-500 text-black py-4 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-xl shadow-brand-500/20">
                         FINALIZAR VISITA Y ENVIAR ALERTA
                      </button>
                   </div>
                </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function SummaryCard({ label, value, color, icon }: { label: string, value: string, color: string, icon: React.ReactNode }) {
  return (
    <div className="bg-bg-sidebar border border-border-dim p-4 rounded-lg flex items-center justify-between shadow-xl">
      <div>
        <p className="text-[10px] font-black text-text-dim uppercase tracking-widest mb-1">{label}</p>
        <p className={cn("text-2xl font-mono font-black", color)}>{value}</p>
      </div>
      <div className={cn("p-3.5 rounded-full bg-bg-accent border border-border-dim/30 shadow-inner", color)}>
        {icon}
      </div>
    </div>
  );
}
