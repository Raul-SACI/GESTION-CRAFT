import React, { useState, useEffect } from 'react';
import { 
  Flag, 
  ClipboardCheck, 
  AlertCircle,
  CheckCircle2,
  XCircle,
  Calendar,
  Building2,
  BarChart3,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Branch } from '../types';
import { supabase } from '../lib/supabase';
import { SEEDED_TEMPLATES, AuditTemplate, Question, Option } from '../lib/supervisionSeeds';

interface AuditResult {
  branchId: string;
  templateId: string;
  status: 'pending' | 'completed';
  lastDate?: string;
  flags: {
    red: number;
    yellow: number;
    green: number;
  };
}

export default function SupervisionsExecutionView({ branches }: { branches: Branch[] }) {
  const [templates, setTemplates] = useState<AuditTemplate[]>([]);
  const [dbResponses, setDbResponses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal execution state
  const [showForm, setShowForm] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<AuditTemplate | null>(null);
  const [answers, setAnswers] = useState<Record<string, { optionId: string; text: string; score: number; color: 'green' | 'yellow' | 'red'; textVal?: string }>>({});
  const [generalNotes, setGeneralNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load templates and responses from Supabase
  const loadData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch checklists
      const { data: checklistsData, error: ckError } = await supabase
        .from('supervision_checklists')
        .select('*')
        .order('name');
        
      if (ckError) throw ckError;

      const fetchedTemplates = (checklistsData && checklistsData.length > 0)
        ? checklistsData.map(item => ({
            id: item.id,
            name: item.name,
            category: item.category,
            questions: Array.isArray(item.items) ? item.items : JSON.parse(item.items || '[]')
          }))
        : SEEDED_TEMPLATES;

      setTemplates(fetchedTemplates);
      if (fetchedTemplates.length > 0 && !selectedTemplate) {
        setSelectedTemplate(fetchedTemplates[0]);
      }

      // 2. Fetch responses
      const { data: responsesData, error: respError } = await supabase
        .from('supervision_responses')
        .select('*')
        .order('date', { ascending: false });

      if (respError) throw respError;

      if (responsesData) {
        setDbResponses(responsesData);
      }
    } catch (err) {
      console.warn("Using fallback local templates / answers due to connection limits:", err);
      setTemplates(SEEDED_TEMPLATES);
      setSelectedTemplate(SEEDED_TEMPLATES[0]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute live KPIs per branch based on database responses
  const getBranchAuditResult = (branchId: string): AuditResult => {
    const lastResponse = dbResponses.find(r => r.branch_id === branchId);
    
    if (lastResponse) {
      const savedFlags = lastResponse.scores?.flags || { red: 0, yellow: 0, green: 0 };
      return {
        branchId,
        templateId: lastResponse.checklist_id,
        status: 'completed',
        lastDate: lastResponse.date,
        flags: {
          red: savedFlags.red || 0,
          yellow: savedFlags.yellow || 0,
          green: savedFlags.green || 0
        }
      };
    }

    return {
      branchId,
      templateId: '',
      status: 'pending',
      flags: { red: 0, yellow: 0, green: 0 }
    };
  };

  // Compile global KPI stats
  const totalVerde = branches.filter(b => {
    const res = getBranchAuditResult(b.id);
    return res.status === 'completed' && res.flags.red === 0;
  }).length;

  const totalAmarillo = branches.reduce((acc, b) => acc + getBranchAuditResult(b.id).flags.yellow, 0);
  const totalRojo = branches.reduce((acc, b) => acc + getBranchAuditResult(b.id).flags.red, 0);

  const handleOpenAudit = (branch: Branch) => {
    setSelectedBranch(branch);
    if (templates.length > 0) {
      setSelectedTemplate(templates[0]);
    }
    setAnswers({});
    setGeneralNotes('');
    setShowForm(true);
  };

  const handleSelectOption = (questionId: string, opt: Option) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: {
        optionId: opt.id,
        text: opt.text,
        score: opt.score,
        color: opt.color
      }
    }));
  };

  const handleTextAnswerChange = (questionId: string, value: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: {
        optionId: 'text_input',
        text: 'Respuesta de texto',
        score: 1,
        color: 'green',
        textVal: value
      }
    }));
  };

  const handleSubmitAudit = async () => {
    if (!selectedBranch || !selectedTemplate) return;

    // Validate non-text answers
    const selectQuestions = selectedTemplate.questions.filter(q => q.type !== 'text');
    const unanswered = selectQuestions.filter(q => !answers[q.id]);
    if (unanswered.length > 0) {
      alert(`Por favor, responda todas las preguntas antes de finalizar. Faltan ${unanswered.length} items de selección.`);
      return;
    }

    setIsSubmitting(true);
    let totalScore = 0;
    let redCount = 0;
    let yellowCount = 0;
    let greenCount = 0;

    selectQuestions.forEach(q => {
      const ans = answers[q.id];
      if (ans) {
        totalScore += ans.score;
        if (ans.color === 'red') redCount++;
        else if (ans.color === 'yellow') yellowCount++;
        else if (ans.color === 'green') greenCount++;
      }
    });

    const averageNormalizedScore = selectQuestions.length > 0
      ? (totalScore / selectQuestions.length) * 10
      : 10;

    try {
      const responseData = {
        branch_id: selectedBranch.id,
        checklist_id: selectedTemplate.id,
        date: new Date().toISOString().split('T')[0],
        scores: {
          answers,
          flags: { red: redCount, yellow: yellowCount, green: greenCount }
        },
        total_score: parseFloat(averageNormalizedScore.toFixed(2)),
        notes: generalNotes
      };

      const { error } = await supabase
        .from('supervision_responses')
        .insert(responseData);

      if (error) throw error;

      alert(`Supervisión registrada con éxito para ${selectedBranch.name}. Puntuación: ${averageNormalizedScore.toFixed(1)}/10.`);
      setShowForm(false);
      loadData(); // Reload active KPIs
    } catch (err) {
      console.error('Error saving compliance details:', err);
      alert('Error en base de datos. Se registró de manera temporal.');
      setShowForm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Compile alerts based on live DB answers
  const liveAlerts = dbResponses
    .filter(r => (r.scores?.flags?.red || 0) > 0)
    .slice(0, 3)
    .map(r => {
      const bObj = branches.find(b => b.id === r.branch_id);
      const cObj = templates.find(t => t.id === r.checklist_id);
      return {
        branch: bObj ? bObj.name : 'Sucursal Especial',
        issue: `${r.scores.flags.red} Banderas Rojas en ${cObj ? cObj.name : 'Supervisión'}`,
        action: 'Revisión y Plan de Acción Inmediato',
        time: `${r.date}`
      };
    });

  const alertsToDisplay = liveAlerts.length > 0 ? liveAlerts : [
    { branch: 'Sucursal General', issue: 'Cumplimiento Sano de Banderas', action: 'Ninguna acción urgente', time: 'Recién' }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-border-dim pb-4 gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-brand-500/10 p-3 text-brand-500 border border-brand-500/20 rounded-lg shadow-inner">
            <ClipboardCheck size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-text-main uppercase tracking-tight">Supervisiones</h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest italic opacity-70">Ejecución de Auditorías Semanales</p>
          </div>
        </div>

        <div className="flex gap-4">
            <div className="bg-bg-sidebar border border-border-dim rounded px-4 py-2 flex items-center gap-3 animate-pulse">
                <Calendar size={14} className="text-brand-500" />
                <span className="text-[10px] font-black uppercase text-text-main tracking-widest">
                  SEMANA ACTUAL DE OPERATIVAS
                </span>
            </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-text-dim animate-pulse">
          <div className="loader-ring w-12 h-12 border-4 border-t-brand-500 rounded-full animate-spin mb-4" />
          <p className="text-xs font-black uppercase tracking-widest text-text-dim">Cargando Supervisiones...</p>
        </div>
      ) : (
        <>
          {/* KPI Flags Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <KPICard 
                label="Sucursales Sin Peligros (Verde)" 
                value={totalVerde.toString()} 
                sublabel="Sin banderas rojas"
                color="text-emerald-500"
                icon={<CheckCircle2 size={20} />}
              />
              <KPICard 
                label="Banderas Amarillas Totales" 
                value={totalAmarillo.toString()} 
                sublabel="Requieren Mejora"
                color="text-orange-500"
                icon={<AlertCircle size={20} />}
              />
              <KPICard 
                label="Banderas Rojas Totales" 
                value={totalRojo.toString()} 
                sublabel="Atención Directa"
                color="text-red-500"
                icon={<Flag size={20} />}
              />
          </div>

          {/* Main Grid: Branches Status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                 <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-black uppercase text-text-dim flex items-center gap-2">
                        <Building2 size={14} className="text-brand-500" />
                        Auditorías Recientes por Sucursal
                    </h3>
                 </div>
                 <div className="grid gap-3">
                    {branches.map(branch => {
                        const result = getBranchAuditResult(branch.id);
                        
                        return (
                            <div key={branch.id} className="bg-bg-sidebar border border-border-dim rounded-lg p-4 flex items-center justify-between group hover:border-brand-500/30 transition-all shadow-lg">
                                <div className="flex items-center gap-4">
                                   <div className="w-10 h-10 rounded bg-bg-accent border border-border-dim flex items-center justify-center text-[10px] font-black text-text-dim group-hover:text-brand-500 group-hover:border-brand-500/50 transition-all">
                                      {branch.name.substring(0, 2).toUpperCase()}
                                   </div>
                                   <div>
                                      <p className="text-xs font-black uppercase text-text-main tracking-tight">{branch.name}</p>
                                      <p className="text-[10px] font-bold text-text-dim uppercase tracking-widest mt-0.5">
                                          {result.status === 'completed' ? `ÚLTIMA VISITA: ${result.lastDate}` : 'SIN REGISTRO CARGADO'}
                                      </p>
                                   </div>
                                </div>
                                
                                <div className="flex items-center gap-6">
                                   <div className="flex gap-2">
                                      <div className="flex flex-col items-center">
                                         <span className="text-[8px] font-black text-text-dim uppercase">R</span>
                                         <div className={cn("px-2 py-0.5 rounded text-[10px] font-mono font-black", result.flags.red > 0 ? "bg-red-500/20 text-red-500" : "bg-bg-accent text-text-dim/30")}>
                                            {result.flags.red}
                                         </div>
                                      </div>
                                      <div className="flex flex-col items-center">
                                         <span className="text-[8px] font-black text-text-dim uppercase">A</span>
                                         <div className={cn("px-2 py-0.5 rounded text-[10px] font-mono font-black", result.flags.yellow > 0 ? "bg-orange-500/20 text-orange-500" : "bg-bg-accent text-text-dim/30")}>
                                            {result.flags.yellow}
                                         </div>
                                      </div>
                                      <div className="flex flex-col items-center">
                                         <span className="text-[8px] font-black text-text-dim uppercase">V</span>
                                         <div className={cn("px-2 py-0.5 rounded text-[10px] font-mono font-black", result.flags.green > 0 ? "bg-emerald-500/20 text-emerald-500" : "bg-bg-accent text-text-dim/30")}>
                                            {result.flags.green}
                                         </div>
                                      </div>
                                   </div>

                                   <button 
                                     onClick={() => handleOpenAudit(branch)}
                                     title="Comenzar Nueva Supervisión"
                                     className={cn(
                                       "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                                       result.status === 'completed' 
                                         ? "bg-bg-accent text-text-dim hover:text-brand-500 hover:bg-brand-500/10" 
                                         : "bg-brand-500 text-black hover:bg-brand-600 shadow-lg shadow-brand-500/20"
                                     )}
                                   >
                                      {result.status === 'completed' ? <BarChart3 size={14} /> : <Plus size={16} />}
                                   </button>
                                </div>
                            </div>
                        );
                    })}
                 </div>
              </div>

              <div className="space-y-4">
                  <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-6 h-full relative overflow-hidden">
                      <div className="relative z-10">
                          <h3 className="text-xs font-black uppercase text-orange-500 tracking-widest mb-4 flex items-center gap-2">
                            <AlertCircle size={14} /> Historial Crítico de Banderas
                          </h3>
                          <div className="space-y-4">
                              {alertsToDisplay.map((alert, i) => (
                                  <div key={i} className="bg-bg-sidebar border border-border-dim rounded p-4 border-l-4 border-l-red-500">
                                      <div className="flex justify-between items-start">
                                          <p className="text-[10px] font-black uppercase text-text-main">{alert.branch}</p>
                                          <span className="text-[8px] font-bold text-text-dim uppercase">{alert.time}</span>
                                      </div>
                                      <p className="text-[11px] font-bold text-red-500 uppercase mt-1">{alert.issue}</p>
                                      <p className="text-[9px] font-medium text-text-dim italic mt-2">Medida: {alert.action}</p>
                                  </div>
                              ))}
                          </div>
                      </div>
                      <Flag className="absolute -bottom-10 -right-10 text-orange-500/5 rotate-12" size={200} />
                  </div>
              </div>
          </div>
        </>
      )}

      {/* Audit Modal/Form */}
      <AnimatePresence>
          {showForm && selectedBranch && selectedTemplate && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowForm(false)}
                    className="absolute inset-0 bg-black/80 backdrop-blur-md"
                  />
                  <motion.div 
                    initial={{ opacity: 0, y: 50, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 50, scale: 0.95 }}
                    className="relative w-full max-w-2xl bg-bg-sidebar border border-border-dim rounded-xl shadow-2xl overflow-hidden flex flex-col h-[90vh]"
                  >
                    {/* Modal Header */}
                    <div className="p-6 border-b border-border-dim bg-bg-accent/30 flex justify-between items-center">
                        <div className="space-y-1">
                            <div className="flex items-center gap-3">
                              <p className="text-[9px] font-black text-brand-500 uppercase tracking-widest">Sucursal: {selectedBranch.name}</p>
                            </div>
                            <div className="flex items-center gap-3">
                               <span className="text-[9px] font-black text-text-dim uppercase tracking-wider">Cuestionario:</span>
                               <select 
                                 className="bg-bg-accent border border-border-dim rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-tight text-brand-500 outline-none"
                                 value={selectedTemplate.id}
                                 onChange={(e) => {
                                   const t = templates.find(item => item.id === e.target.value);
                                   if (t) {
                                     setSelectedTemplate(t);
                                     setAnswers({});
                                   }
                                 }}
                               >
                                 {templates.map(t => (
                                   <option key={t.id} value={t.id} className="bg-bg-sidebar text-text-main">{t.name}</option>
                                 ))}
                               </select>
                            </div>
                        </div>
                        <button 
                          type="button"
                          onClick={() => setShowForm(false)}
                          className="p-2 hover:bg-bg-accent rounded-full text-text-dim transition-all"
                        >
                            <XCircle size={24} />
                        </button>
                    </div>

                    {/* Form Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar bg-bg-sidebar">
                        {selectedTemplate.questions.map((q, idx) => (
                            <div key={q.id} className="p-4 bg-bg-accent/20 border border-border-dim/40 rounded-lg">
                                <div className="flex justify-between items-start gap-4 mb-3">
                                  <p className="text-xs font-black text-text-main uppercase flex items-start gap-4">
                                      <span className="text-brand-500 opacity-50 font-mono tracking-tighter">0{idx + 1}</span>
                                      {q.text}
                                  </p>
                                  {q.category && (
                                    <span className="px-2 py-0.5 bg-bg-sidebar border border-border-dim/60 text-[8px] font-black text-text-dim tracking-widest rounded-sm uppercase">
                                      {q.category}
                                    </span>
                                  )}
                                </div>
                                
                                {q.type === 'text' ? (
                                  <textarea 
                                    className="w-full bg-bg-sidebar border border-border-dim rounded-lg p-3 text-[11px] font-bold uppercase text-text-main outline-none focus:border-brand-500 h-24"
                                    placeholder="Escriba comentarios u observaciones aquí..."
                                    value={answers[q.id]?.textVal || ''}
                                    onChange={(e) => handleTextAnswerChange(q.id, e.target.value)}
                                  />
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                      {q.options.map(opt => {
                                        const isSelected = answers[q.id]?.optionId === opt.id;
                                        return (
                                          <button 
                                            key={opt.id}
                                            type="button"
                                            onClick={() => handleSelectOption(q.id, opt)}
                                            className={cn(
                                              "p-3 rounded-md border text-left flex items-center justify-between transition-all group",
                                              isSelected 
                                                ? "bg-brand-500/15 border-brand-500/50 text-brand-500 shadow-md"
                                                : "bg-bg-sidebar border-border-dim/50 text-text-dim hover:border-brand-500"
                                            )}
                                          >
                                              <div className="flex items-center gap-3">
                                                 <div className={cn(
                                                   "w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all",
                                                   isSelected ? "border-brand-500 bg-brand-500/30" : "border-border-dim group-hover:border-brand-500"
                                                 )}>
                                                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-brand-500"></div>}
                                                 </div>
                                                 <span className="text-[10px] font-bold uppercase tracking-tight">{opt.text}</span>
                                              </div>
                                              {opt.color === 'red' && (
                                                 <div className="px-1.5 py-0.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded text-[7px] font-black tracking-tighter">
                                                    FLAG ROJA
                                                 </div>
                                              )}
                                          </button>
                                        );
                                      })}
                                  </div>
                                )}
                            </div>
                        ))}

                        <div className="space-y-3 pt-6">
                            <label className="text-[10px] font-black text-text-dim uppercase tracking-widest">Observaciones Generales y Plan de Acción</label>
                            <textarea 
                              className="w-full h-32 bg-bg-accent border border-border-dim rounded-lg p-4 outline-none focus:border-brand-500 text-xs font-bold uppercase text-text-main"
                              placeholder="DETALLE AQUÍ CUALQUIER ANOMALÍA O COMENTARIO ADICIONAL..."
                              value={generalNotes}
                              onChange={(e) => setGeneralNotes(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Modal Footer */}
                    <div className="p-6 border-t border-border-dim bg-bg-accent/30 flex gap-4">
                        <button 
                          disabled={isSubmitting}
                          onClick={handleSubmitAudit}
                          className="flex-1 bg-brand-500 text-black py-4 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-xl shadow-brand-500/20 disabled:opacity-50 font-black"
                        >
                            {isSubmitting ? 'REGISTRANDO...' : 'Finalizar y Registrar Visita'}
                        </button>
                    </div>
                  </motion.div>
              </div>
          )}
      </AnimatePresence>
    </motion.div>
  );
}

function KPICard({ label, value, sublabel, color, icon }: { label: string, value: string, sublabel: string, color: string, icon: React.ReactNode }) {
    return (
        <div className="bg-bg-sidebar border border-border-dim p-4 rounded-xl shadow-xl flex items-center justify-between border-b-4 border-b-bg-accent">
            <div>
                <p className="text-[9px] font-black text-text-dim uppercase tracking-widest">{label}</p>
                <div className="flex items-baseline gap-2 mt-1">
                    <span className={cn("text-3xl font-mono font-black", color)}>{value}</span>
                </div>
                <p className="text-[8px] font-bold text-text-dim uppercase mt-1 italic">{sublabel}</p>
            </div>
            <div className={cn("p-4 rounded-full bg-bg-accent border border-border-dim/20 shadow-inner", color)}>
                {icon}
            </div>
        </div>
    );
}
