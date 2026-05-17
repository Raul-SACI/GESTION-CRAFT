import React, { useState } from 'react';
import { 
  Flag, 
  ClipboardCheck, 
  ChevronRight, 
  AlertCircle,
  CheckCircle2,
  XCircle,
  Calendar,
  Building2,
  ArrowRight,
  Filter,
  BarChart3,
  Search,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Branch } from '../types';

// Shared interfaces (conceptually)
interface Option {
  id: string;
  text: string;
  score: number;
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
  const [selectedAudit, setSelectedAudit] = useState<{branch: Branch, template: AuditTemplate} | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Mock templates (should ideally be shared via context/state)
  const templates: AuditTemplate[] = [
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
  ];

  // Mock KPIs for branches
  const auditResults: AuditResult[] = [
    { branchId: 'bn', templateId: '1', status: 'completed', lastDate: '2024-05-10', flags: { red: 0, yellow: 1, green: 5 } },
    { branchId: 'bs', templateId: '1', status: 'pending', flags: { red: 0, yellow: 0, green: 0 } },
    { branchId: 'mt', templateId: '1', status: 'completed', lastDate: '2024-05-12', flags: { red: 2, yellow: 2, green: 3 } },
    { branchId: 'pn', templateId: '1', status: 'pending', flags: { red: 0, yellow: 0, green: 0 } },
    { branchId: 'ml', templateId: '1', status: 'completed', lastDate: '2024-05-14', flags: { red: 1, yellow: 0, green: 6 } },
  ];

  const handleOpenAudit = (branch: Branch) => {
    setSelectedAudit({ branch, template: templates[0] });
    setShowForm(true);
  };

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
            <div className="bg-bg-sidebar border border-border-dim rounded px-4 py-2 flex items-center gap-3">
                <Calendar size={14} className="text-brand-500" />
                <span className="text-[10px] font-black uppercase text-text-main tracking-widest">Semana 3 - Mayo</span>
            </div>
        </div>
      </div>

      {/* KPI Flags Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KPICard 
            label="Sucursales en Verde" 
            value={auditResults.filter(r => r.flags.red === 0 && r.status === 'completed').length.toString()} 
            sublabel="Cumplimiento Total"
            color="text-emerald-500"
            icon={<CheckCircle2 size={20} />}
          />
          <KPICard 
            label="Banderas Amarillas" 
            value={auditResults.reduce((acc, r) => acc + r.flags.yellow, 0).toString()} 
            sublabel="Requieren Observación"
            color="text-orange-500"
            icon={<AlertCircle size={20} />}
          />
          <KPICard 
            label="Banderas Rojas" 
            value={auditResults.reduce((acc, r) => acc + r.flags.red, 0).toString()} 
            sublabel="Acción Inmediata Requerida"
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
                    Estado de Auditorías por Sucursal
                </h3>
             </div>
             <div className="grid gap-3">
                {branches.map(branch => {
                    const result = auditResults.find(r => r.branchId === branch.id);
                    const totalFlags = (result?.flags.red || 0) + (result?.flags.yellow || 0) + (result?.flags.green || 0);
                    
                    return (
                        <div key={branch.id} className="bg-bg-sidebar border border-border-dim rounded-lg p-4 flex items-center justify-between group hover:border-brand-500/30 transition-all shadow-lg">
                            <div className="flex items-center gap-4">
                               <div className="w-10 h-10 rounded bg-bg-accent border border-border-dim flex items-center justify-center text-[10px] font-black text-text-dim group-hover:text-brand-500 group-hover:border-brand-500/50 transition-all">
                                  {branch.name.substring(0, 2).toUpperCase()}
                               </div>
                               <div>
                                  <p className="text-xs font-black uppercase text-text-main tracking-tight">{branch.name}</p>
                                  <p className="text-[10px] font-bold text-text-dim uppercase tracking-widest mt-0.5">
                                      {result?.status === 'completed' ? `ÚLTIMA: ${result.lastDate}` : 'PENDIENTE ESTA SEMANA'}
                                  </p>
                               </div>
                            </div>
                            
                            <div className="flex items-center gap-6">
                               <div className="flex gap-2">
                                  <div className="flex flex-col items-center">
                                     <span className="text-[8px] font-black text-text-dim uppercase">R</span>
                                     <div className={cn("px-2 py-0.5 rounded text-[10px] font-mono font-black", result?.flags.red && result.flags.red > 0 ? "bg-red-500/20 text-red-500" : "bg-bg-accent text-text-dim/30")}>
                                        {result?.flags.red || 0}
                                     </div>
                                  </div>
                                  <div className="flex flex-col items-center">
                                     <span className="text-[8px] font-black text-text-dim uppercase">A</span>
                                     <div className={cn("px-2 py-0.5 rounded text-[10px] font-mono font-black", result?.flags.yellow && result.flags.yellow > 0 ? "bg-orange-500/20 text-orange-500" : "bg-bg-accent text-text-dim/30")}>
                                        {result?.flags.yellow || 0}
                                     </div>
                                  </div>
                                  <div className="flex flex-col items-center">
                                     <span className="text-[8px] font-black text-text-dim uppercase">V</span>
                                     <div className={cn("px-2 py-0.5 rounded text-[10px] font-mono font-black", result?.flags.green && result.flags.green > 0 ? "bg-emerald-500/20 text-emerald-500" : "bg-bg-accent text-text-dim/30")}>
                                        {result?.flags.green || 0}
                                     </div>
                                  </div>
                               </div>

                               <button 
                                 onClick={() => handleOpenAudit(branch)}
                                 className={cn(
                                   "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                                   result?.status === 'completed' 
                                     ? "bg-bg-accent text-text-dim hover:text-brand-500 hover:bg-brand-500/10" 
                                     : "bg-brand-500 text-black hover:bg-brand-600 shadow-lg shadow-brand-500/20"
                                 )}
                               >
                                  {result?.status === 'completed' ? <BarChart3 size={14} /> : <Plus size={16} />}
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
                        <AlertCircle size={14} /> Alertas de Integridad
                      </h3>
                      <div className="space-y-4">
                          {[
                              { branch: 'MT - Mercato', issue: '2 Banderas Rojas en Auditoría Bromatológica', action: 'Plan de choque requerido', time: '1d ago' },
                              { branch: 'ML - Mate de Luna', issue: 'Bandera Roja: Cadena de Frio', action: 'Revisión técnica inmediata', time: '2h ago' }
                          ].map((alert, i) => (
                              <div key={i} className="bg-bg-sidebar border border-border-dim rounded p-4 border-l-4 border-l-red-500">
                                  <div className="flex justify-between items-start">
                                      <p className="text-[10px] font-black uppercase text-text-main">{alert.branch}</p>
                                      <span className="text-[8px] font-bold text-text-dim uppercase">{alert.time}</span>
                                  </div>
                                  <p className="text-[11px] font-bold text-red-500 uppercase mt-1">{alert.issue}</p>
                                  <p className="text-[9px] font-medium text-text-dim italic mt-2">Acción: {alert.action}</p>
                              </div>
                          ))}
                      </div>
                  </div>
                  <Flag className="absolute -bottom-10 -right-10 text-orange-500/5 rotate-12" size={200} />
              </div>
          </div>
      </div>

      {/* Audit Modal/Form */}
      <AnimatePresence>
          {showForm && selectedAudit && (
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
                    className="relative w-full max-w-2xl bg-bg-sidebar border border-border-dim rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                  >
                    {/* Modal Header */}
                    <div className="p-6 border-b border-border-dim bg-bg-accent/30 flex justify-between items-center">
                        <div>
                            <p className="text-[9px] font-black text-brand-500 uppercase tracking-widest">Ejecución de Auditoría</p>
                            <h3 className="text-xl font-black text-text-main uppercase tracking-tight">{selectedAudit.template.name}</h3>
                            <div className="flex items-center gap-3 mt-1">
                               <span className="px-2 py-0.5 bg-brand-500 text-black text-[9px] font-black rounded uppercase tracking-tighter">
                                   Sucursal: {selectedAudit.branch.name}
                               </span>
                            </div>
                        </div>
                        <button 
                          onClick={() => setShowForm(false)}
                          className="p-2 hover:bg-bg-accent rounded-full text-text-dim transition-all"
                        >
                            <XCircle size={24} />
                        </button>
                    </div>

                    {/* Form Content */}
                    <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
                        {selectedAudit.template.questions.map((q, idx) => (
                            <div key={q.id} className="space-y-4">
                                <p className="text-sm font-black text-text-main uppercase flex items-start gap-4">
                                    <span className="text-brand-500 opacity-50 font-mono tracking-tighter">0{idx + 1}</span>
                                    {q.text}
                                </p>
                                <div className="grid grid-cols-1 gap-3 ml-8">
                                    {q.options.map(opt => (
                                        <button 
                                          key={opt.id}
                                          className="flex items-center justify-between p-4 bg-bg-accent border border-border-dim rounded-lg hover:border-brand-500 group transition-all"
                                        >
                                            <div className="flex items-center gap-3">
                                               <div className="w-5 h-5 rounded-full border-2 border-border-dim group-hover:border-brand-500 flex items-center justify-center transition-all">
                                                  <div className="w-2.5 h-2.5 rounded-full bg-brand-500 scale-0 group-hover:scale-100 transition-transform" />
                                               </div>
                                               <span className="text-[11px] font-bold uppercase text-text-main">{opt.text}</span>
                                            </div>
                                            {opt.color === 'red' && (
                                                <div className="flex items-center gap-2 px-2 py-1 bg-red-500/10 text-red-500 border border-red-500/20 rounded text-[8px] font-black italic">
                                                   <AlertCircle size={10} /> DISPARA BANDERA ROJA
                                                </div>
                                            )}
                                            {opt.color === 'green' && (
                                                <div className="flex items-center gap-2 px-2 py-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded text-[8px] font-black italic">
                                                   <CheckCircle2 size={10} /> CUMPLE
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}

                        <div className="space-y-3 ml-8 pt-6">
                            <label className="text-[10px] font-black text-text-dim uppercase tracking-widest">Observaciones y Hallazgos</label>
                            <textarea 
                              className="w-full h-32 bg-bg-accent border border-border-dim rounded-lg p-4 outline-none focus:border-brand-500 text-xs font-bold uppercase text-text-main"
                              placeholder="DETALLE AQUÍ CUALQUIER ANOMALÍA O COMENTARIO ADICIONAL..."
                            />
                        </div>
                    </div>

                    {/* Modal Footer */}
                    <div className="p-6 border-t border-border-dim bg-bg-accent/30 flex gap-4">
                        <button 
                          onClick={() => setShowForm(false)}
                          className="flex-1 bg-brand-500 text-black py-4 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-xl shadow-brand-500/20"
                        >
                            Finalizar y Registrar Visita
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
