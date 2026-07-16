import React, { useState, useEffect, useMemo } from 'react';
import { 
  Flag, 
  ClipboardCheck, 
  AlertCircle,
  CheckCircle2,
  XCircle,
  Calendar,
  Building2,
  BarChart3,
  Plus,
  Trash2
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

export default function SupervisionsExecutionView({ branches, isReadOnly = false, currentUserRole, currentUserName }: { branches: Branch[]; isReadOnly?: boolean; currentUserRole?: string; currentUserName?: string }) {
  const [templates, setTemplates] = useState<AuditTemplate[]>([]);
  const [dbResponses, setDbResponses] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<{ checklist_id: string; branch_id: string; frequency: string; start_date?: string | null }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal execution state
  const [showForm, setShowForm] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<AuditTemplate | null>(null);
  const [answers, setAnswers] = useState<Record<string, { optionId: string; text: string; score: number; color: 'green' | 'yellow' | 'red'; textVal?: string; target?: 'encargado' | 'cocina' | 'ambos' }>>({});
  const [generalNotes, setGeneralNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Supervisors & Assignments State
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [selectedSupId, setSelectedSupId] = useState<string>('all');
  const [showAllBranches, setShowAllBranches] = useState<boolean>(false);

  // Load templates and responses from Supabase
  const loadData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch supervisor profiles
      const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'supervisor')
        .order('name');
      
      if (!profErr && profiles && profiles.length > 0) {
        setSupervisors(profiles);
      } else {
        // Fallback seed layout to avoid blank profiles lists
        setSupervisors([
          { id: '11c8f031-15b7-4b72-b5e0-47de31f24d91', name: 'LUCAS PERALTA', role: 'supervisor', branch_name: '' },
          { id: '22c8f031-15b7-4b72-b5e0-47de31f24d92', name: 'ANDREA DOMÍNGUEZ', role: 'supervisor', branch_name: '' },
          { id: '33c8f031-15b7-4b72-b5e0-47de31f24d93', name: 'MARTÍN ROSSI', role: 'supervisor', branch_name: '' },
        ]);
      }

      // 2. Fetch checklists
      const { data: checklistsData, error: ckError } = await supabase
        .from('supervision_checklists')
        .select('*')
        .order('name');
        
      if (ckError) throw ckError;

      let fetchedTemplates;
      if (checklistsData && checklistsData.length > 0) {
        fetchedTemplates = checklistsData.map(item => ({
          id: item.id,
          name: item.name,
          category: item.category,
          questions: Array.isArray(item.items) ? item.items : JSON.parse(item.items || '[]')
        }));
      } else {
        // Auto-seed templates into Supabase so foreign keys work
        const seedPayloads = SEEDED_TEMPLATES.map(t => ({
          name: t.name,
          category: t.category,
          items: t.questions
        }));
        const { data: inserted, error: seedErr } = await supabase
          .from('supervision_checklists')
          .insert(seedPayloads)
          .select();
        if (!seedErr && inserted && inserted.length > 0) {
          fetchedTemplates = inserted.map((item: any) => ({
            id: item.id,
            name: item.name,
            category: item.category,
            questions: Array.isArray(item.items) ? item.items : JSON.parse(item.items || '[]')
          }));
        } else {
          // Supabase unavailable - use local seeds but skip checklist_id on save
          fetchedTemplates = SEEDED_TEMPLATES;
        }
      }

      setTemplates(fetchedTemplates);
      if (fetchedTemplates.length > 0 && !selectedTemplate) {
        setSelectedTemplate(fetchedTemplates[0]);
      }

      // 3. Fetch responses
      const { data: responsesData, error: respError } = await supabase
        .from('supervision_responses')
        .select('*')
        .order('date', { ascending: false });

      if (respError) throw respError;

      if (responsesData) {
        setDbResponses(responsesData);
      }

      // 4. Fetch periodicidades (schedules)
      try {
        const { data: schedData } = await supabase
          .from('supervision_schedules')
          .select('checklist_id, branch_id, frequency, start_date');
        if (schedData) setSchedules(schedData);
      } catch (e) {
        setSchedules([]);
      }
    } catch (err) {
      console.warn("Using fallback local templates / answers:", err);
      setTemplates(SEEDED_TEMPLATES);
      setSelectedTemplate(SEEDED_TEMPLATES[0]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Días según frecuencia
  const freqDays: Record<string, number> = { semanal: 7, quincenal: 15, mensual: 30 };

  // Calcula alertas: para cada periodicidad cargada, ve si la última supervisión está vencida.
  const scheduleAlerts = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return schedules.map(sch => {
      const days = freqDays[sch.frequency] || 7;
      // Última respuesta de ese formulario + sucursal
      const matching = dbResponses
        .filter(r => !r.annulled && r.branch_id === sch.branch_id && (r.checklist_id === sch.checklist_id))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const last = matching[0];
      const templateName = templates.find(t => t.id === sch.checklist_id)?.name || 'Formulario';
      const branchName = branches.find(b => b.id === sch.branch_id)?.name || sch.branch_id;
      const base = { key: `${sch.checklist_id}|${sch.branch_id}`, templateName, branchName, frequency: sch.frequency };

      // Calcula la fecha de vencimiento (inicio del período + días)
      const computeDueDate = (fromDate: Date) => {
        const d = new Date(fromDate);
        d.setDate(d.getDate() + days);
        return d;
      };

      if (!last) {
        // Nunca realizada: el vencimiento corre desde la fecha de inicio (si está definida)
        if (sch.start_date) {
          const startDate = new Date(sch.start_date + 'T12:00:00');
          const dueDate = computeDueDate(startDate);
          const daysLeft = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          if (today.getTime() < startDate.getTime()) {
            // Todavía no empezó
            return { ...base, status: 'upcoming' as const, daysSince: null, lastDate: null, dueDate: dueDate.toISOString().split('T')[0], daysLeft };
          }
          if (daysLeft >= 0) {
            return { ...base, status: 'pending' as const, daysSince: null, lastDate: null, dueDate: dueDate.toISOString().split('T')[0], daysLeft };
          }
          return { ...base, status: 'overdue' as const, daysSince: -daysLeft, lastDate: null, dueDate: dueDate.toISOString().split('T')[0], daysLeft };
        }
        // Sin fecha de inicio: se considera nunca realizada (pendiente sin plazo definido)
        return { ...base, status: 'never' as const, daysSince: null, lastDate: null, dueDate: null, daysLeft: null };
      }

      const lastDate = new Date(last.date + 'T12:00:00');
      const dueDate = computeDueDate(lastDate);
      const daysSince = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      const daysLeft = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const overdue = daysSince > days;
      return {
        ...base,
        status: overdue ? ('overdue' as const) : ('ok' as const),
        daysSince, lastDate: last.date, dueDate: dueDate.toISOString().split('T')[0], daysLeft
      };
    });
  }, [schedules, dbResponses, templates, branches]);

  const pendingAlerts = scheduleAlerts.filter(a => a.status === 'overdue' || a.status === 'never' || a.status === 'pending');

  // Filtered branches logic
  const activeSupervisor = supervisors.find(s => s.id === selectedSupId);
  const assignedBranchIds = activeSupervisor?.branch_name ? activeSupervisor.branch_name.split(',').filter(Boolean) : [];

  const filteredBranches = (selectedSupId === 'all' || showAllBranches)
    ? branches
    : branches.filter(b => assignedBranchIds.includes(b.id));

  // Compute live KPIs per branch based on database responses
  const getBranchAuditResult = (branchId: string): AuditResult => {
    // Las supervisiones ANULADAS no cuentan para banderas ni premios
    const lastResponse = dbResponses.find(r => r.branch_id === branchId && !r.annulled);
    
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

  // Compile global KPI stats based on filtered list
  const totalVerde = filteredBranches.filter(b => {
    const res = getBranchAuditResult(b.id);
    return res.status === 'completed' && res.flags.red === 0;
  }).length;

  // --- ANULAR SUPERVISIONES (solo administración: impactan en los premios) ---
  const puedeAnular = currentUserRole === 'administrador';

  const anularSupervision = async (r: any) => {
    if (!puedeAnular) { alert('Solo la administración puede anular supervisiones.'); return; }
    const suc = branches.find(b => b.id === r.branch_id)?.name || 'la sucursal';
    const rojas = r.scores?.flags?.red || 0;
    const motivo = window.prompt(
      `ANULAR SUPERVISIÓN\n\n` +
      `Fecha: ${r.date}\n` +
      `Sucursal: ${suc}\n` +
      `Banderas rojas: ${rojas}\n\n` +
      `La supervisión queda registrada pero NO cuenta para banderas ni premios.\n` +
      (rojas > 0 ? `⚠ Esto va a modificar los premios de esta sucursal.\n\n` : '\n') +
      `Escribí el motivo de la anulación:`
    );
    if (motivo === null) return;
    if (!motivo.trim()) { alert('Tenés que indicar un motivo para anular.'); return; }
    if (!window.confirm(`Confirmación final: ¿anular la supervisión del ${r.date} en ${suc}?`)) return;

    const { error } = await supabase
      .from('supervision_responses')
      .update({
        annulled: true,
        annulled_by: currentUserName || 'ADMIN',
        annulled_at: new Date().toISOString(),
        annulled_reason: motivo.trim()
      })
      .eq('id', r.id);

    if (error) { alert('No se pudo anular: ' + error.message); return; }
    await loadData();
    alert('Supervisión anulada. Ya no cuenta para banderas ni premios.');
  };

  const reactivarSupervision = async (r: any) => {
    if (!puedeAnular) return;
    if (!window.confirm(`¿Reactivar la supervisión del ${r.date}? Va a volver a contar para banderas y premios.`)) return;
    const { error } = await supabase
      .from('supervision_responses')
      .update({ annulled: false, annulled_by: null, annulled_at: null, annulled_reason: null })
      .eq('id', r.id);
    if (error) { alert('No se pudo reactivar: ' + error.message); return; }
    await loadData();
  };

  // --- RESUMEN: BANDERAS ROJAS POR RESPONSABLE ---
  const [flagsMonth, setFlagsMonth] = useState<string>('all');
  // Filtros de la tabla "Supervisiones Realizadas"
  const [listMonth, setListMonth] = useState<string>('all');
  const [listBranch, setListBranch] = useState<string>('all');
  const [listForm, setListForm] = useState<string>('all');
  const [flagsBranch, setFlagsBranch] = useState<string>('all');
  const [expandedFlag, setExpandedFlag] = useState<string | null>(null);
  const [savingTarget, setSavingTarget] = useState<string | null>(null);

  // Devuelve el detalle de las banderas rojas de una supervisión, con el texto de la pregunta
  const detalleBanderas = (r: any) => {
    const answers = r.scores?.answers || {};
    const tpl = templates.find(t => t.id === r.checklist_id);
    return Object.entries(answers)
      .filter(([, a]: any) => a?.color === 'red')
      .map(([qid, a]: any) => {
        const q = tpl?.questions.find(qq => qq.id === qid);
        return {
          qid,
          pregunta: q?.text || '(pregunta no encontrada — la plantilla pudo cambiar)',
          categoria: q?.category || '',
          target: a?.target || null // null = nunca se asignó
        };
      });
  };

  // Guarda el responsable de UNA bandera puntual de una supervisión ya cargada
  const asignarResponsable = async (r: any, qid: string, target: 'encargado' | 'cocina' | 'ambos') => {
    if (!puedeAnular) { alert('Solo la administración puede reasignar banderas.'); return; }
    setSavingTarget(`${r.id}_${qid}`);
    try {
      const scores = JSON.parse(JSON.stringify(r.scores || {}));
      if (!scores.answers?.[qid]) throw new Error('No se encontró la respuesta.');
      scores.answers[qid].target = target;

      // Recalcular el desglose por responsable con TODAS las respuestas
      let enc = 0, coc = 0;
      (Object.values(scores.answers) as any[]).forEach(a => {
        if (a?.color !== 'red') return;
        const t = a?.target || 'ambos';
        if (t === 'encargado' || t === 'ambos') enc++;
        if (t === 'cocina' || t === 'ambos') coc++;
      });
      scores.flags_by_target = { encargado: enc, cocina: coc };

      const { error } = await supabase
        .from('supervision_responses')
        .update({ scores })
        .eq('id', r.id);
      if (error) throw error;
      await loadData();
    } catch (e: any) {
      alert('No se pudo guardar: ' + (e.message || e));
    } finally {
      setSavingTarget(null);
    }
  };

  // Cuenta las banderas rojas de una supervisión, separadas por responsable.
  // Se cuenta desde las respuestas (cada una tiene su target), no desde el total.
  const contarPorResponsable = (r: any) => {
    const answers = r.scores?.answers || {};
    let soloEnc = 0, soloCoc = 0, ambos = 0;
    (Object.values(answers) as any[]).forEach(a => {
      if (a?.color !== 'red') return;
      const t = a?.target || 'ambos'; // las viejas (sin target) se asumen "ambos"
      if (t === 'encargado') soloEnc++;
      else if (t === 'cocina') soloCoc++;
      else ambos++;
    });
    return { soloEnc, soloCoc, ambos, total: soloEnc + soloCoc + ambos };
  };

  // Meses disponibles según las supervisiones cargadas
  const mesesDisponibles = useMemo(() => {
    const ms = Array.from(new Set(dbResponses.map(r => String(r.date || '').substring(0, 7)).filter(Boolean)));
    return ms.sort().reverse();
  }, [dbResponses]);

  const mesLabel = (m: string) => {
    if (m === 'all') return 'Todos los meses';
    const [y, mo] = m.split('-');
    const names = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${names[Number(mo) - 1] || mo} ${y}`;
  };

  // Formularios disponibles (para el filtro de la tabla)
  const formulariosDisponibles = useMemo(() => {
    const fs = new Set<string>();
    dbResponses.forEach(r => {
      const f = r.scores?.template_name || templates.find(t => t.id === r.checklist_id)?.name;
      if (f) fs.add(f);
    });
    return Array.from(fs).sort();
  }, [dbResponses, templates]);

  // Supervisiones realizadas, aplicando los filtros de la tabla
  const listaFiltrada = useMemo(() => {
    return dbResponses.filter(r => {
      if (listMonth !== 'all' && String(r.date || '').substring(0, 7) !== listMonth) return false;
      if (listBranch !== 'all' && r.branch_id !== listBranch) return false;
      if (listForm !== 'all') {
        const f = r.scores?.template_name || templates.find(t => t.id === r.checklist_id)?.name || '';
        if (f !== listForm) return false;
      }
      return true;
    });
  }, [dbResponses, listMonth, listBranch, listForm, templates]);

  // Filas del resumen: solo supervisiones NO anuladas y con banderas rojas
  const resumenBanderas = useMemo(() => {
    return dbResponses
      .filter(r => !r.annulled)
      .filter(r => flagsMonth === 'all' || String(r.date || '').substring(0, 7) === flagsMonth)
      .filter(r => flagsBranch === 'all' || r.branch_id === flagsBranch)
      .map(r => {
        const c = contarPorResponsable(r);
        return {
          id: r.id,
          date: r.date,
          branch: branches.find(b => b.id === r.branch_id)?.name || r.branch_id,
          form: r.scores?.template_name || templates.find(t => t.id === r.checklist_id)?.name || '—',
          user: r.scores?.supervisor?.name || '—',
          ...c
        };
      })
      .filter(f => f.total > 0)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [dbResponses, flagsMonth, flagsBranch, branches, templates]);

  const totalesBanderas = useMemo(() => resumenBanderas.reduce((acc, f) => ({
    soloEnc: acc.soloEnc + f.soloEnc,
    soloCoc: acc.soloCoc + f.soloCoc,
    ambos: acc.ambos + f.ambos,
    total: acc.total + f.total
  }), { soloEnc: 0, soloCoc: 0, ambos: 0, total: 0 }), [resumenBanderas]);

  const totalAmarillo = filteredBranches.reduce((acc, b) => acc + getBranchAuditResult(b.id).flags.yellow, 0);
  const totalRojo = filteredBranches.reduce((acc, b) => acc + getBranchAuditResult(b.id).flags.red, 0);

  const handleOpenAudit = (branch: Branch) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
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
        color: opt.color,
        // Las banderas rojas arrancan como "ambos"; el supervisor puede ajustarlo
        target: opt.color === 'red' ? (prev[questionId]?.target || 'ambos') : undefined
      }
    }));
  };

  // Cambia a quién corresponde una bandera roja
  const handleSetTarget = (questionId: string, target: 'encargado' | 'cocina' | 'ambos') => {
    setAnswers(prev => {
      const cur = prev[questionId];
      if (!cur || cur.color !== 'red') return prev;
      return { ...prev, [questionId]: { ...cur, target } };
    });
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
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
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
    let redEncargado = 0;
    let redCocina = 0;
    let yellowCount = 0;
    let greenCount = 0;

    selectQuestions.forEach(q => {
      const ans = answers[q.id];
      if (ans) {
        totalScore += ans.score;
        if (ans.color === 'red') {
          redCount++;
          const t = ans.target || 'ambos';
          if (t === 'encargado' || t === 'ambos') redEncargado++;
          if (t === 'cocina' || t === 'ambos') redCocina++;
        }
        else if (ans.color === 'yellow') yellowCount++;
        else if (ans.color === 'green') greenCount++;
      }
    });

    const averageNormalizedScore = selectQuestions.length > 0
      ? (totalScore / selectQuestions.length) * 10
      : 10;

    try {
      // Only use checklist_id if it's a real UUID (saved in Supabase)
      const isRealUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedTemplate.id);

      const responseData: any = {
        branch_id: selectedBranch.id,
        checklist_id: isRealUUID ? selectedTemplate.id : null,
        date: new Date().toISOString().split('T')[0],
        scores: {
          answers,
          flags: { red: redCount, yellow: yellowCount, green: greenCount },
          // Desglose de banderas rojas por responsable (para el cálculo de premios)
          flags_by_target: { encargado: redEncargado, cocina: redCocina },
          template_name: selectedTemplate.name,
          supervisor: activeSupervisor ? {
            id: activeSupervisor.id,
            name: activeSupervisor.name
          } : undefined
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
    } catch (err: any) {
      console.error('Error saving compliance details:', err);
      alert(`Error al guardar: ${err?.message || 'Error de conexión'}`);
      setShowForm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Mapa de ID de pregunta -> { texto, sección } desde las plantillas, para traducir
  // las respuestas guardadas (que usan el ID) a texto legible.
  const questionMap = React.useMemo(() => {
    const map: Record<string, { text: string; category: string }> = {};
    templates.forEach((t: any) => {
      (t.questions || []).forEach((q: any) => {
        if (q && q.id) map[q.id] = { text: q.text || '(sin texto)', category: q.category || t.category || '' };
      });
    });
    return map;
  }, [templates]);

  // Devuelve las preguntas marcadas en rojo de una respuesta
  const getRedQuestions = (r: any): { text: string; category: string }[] => {
    const ans = r?.scores?.answers || {};
    const reds: { text: string; category: string }[] = [];
    Object.keys(ans).forEach(qId => {
      if (ans[qId]?.color === 'red') {
        const info = questionMap[qId];
        reds.push({
          text: info?.text || '(pregunta no encontrada — pudo editarse o eliminarse)',
          category: info?.category || '',
        });
      }
    });
    return reds;
  };

  // Compile alerts based on live DB answers
  const liveAlerts = dbResponses
    .filter(r => !r.annulled && (r.scores?.flags?.red || 0) > 0)
    .slice(0, 3)
    .map(r => {
      const bObj = branches.find(b => b.id === r.branch_id);
      const cObj = templates.find(t => t.id === r.checklist_id);
      return {
        branch: bObj ? bObj.name : 'Sucursal Especial',
        issue: `${r.scores.flags.red} Banderas Rojas en ${cObj ? cObj.name : 'Supervisión'}`,
        action: 'Revisión y Plan de Acción Inmediato',
        time: `${r.date}`,
        redQuestions: getRedQuestions(r),
      };
    });

  const alertsToDisplay = liveAlerts.length > 0 ? liveAlerts : [
    { branch: 'Sucursal General', issue: 'Cumplimiento Sano de Banderas', action: 'Ninguna acción urgente', time: 'Recién', redQuestions: [] as { text: string; category: string }[] }
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

      {/* Alertas de periodicidad agrupadas por sucursal */}
      {pendingAlerts.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/30 rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-red-500" />
            <h3 className="text-[11px] font-black uppercase tracking-widest text-red-500">
              Supervisiones Pendientes / Vencidas ({pendingAlerts.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(() => {
              // Agrupar por sucursal
              const byBranch: Record<string, typeof pendingAlerts> = {};
              pendingAlerts.forEach(a => {
                if (!byBranch[a.branchName]) byBranch[a.branchName] = [];
                byBranch[a.branchName].push(a);
              });
              return Object.entries(byBranch)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([branchName, items]) => (
                  <div key={branchName} className="bg-bg-sidebar border border-red-500/20 rounded-lg overflow-hidden">
                    <div className="bg-red-500/10 px-4 py-2.5 border-b border-red-500/20 flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase text-text-main tracking-tight">{branchName}</span>
                      <span className="text-[8px] font-black uppercase text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">{items.length} pendiente{items.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="divide-y divide-border-dim/40">
                      {items.map(a => (
                        <div key={a.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
                          <div className="min-w-0">
                            <p className="text-[11px] font-black uppercase text-text-main truncate">{a.templateName}</p>
                            <p className="text-[8px] font-bold text-text-dim uppercase">{a.frequency}{a.dueDate ? ` · vence ${a.dueDate.split('-').reverse().join('/')}` : ''}</p>
                          </div>
                          <span className={cn(
                            "text-[8px] font-black uppercase shrink-0 text-right px-2 py-1 rounded",
                            a.status === 'overdue' ? "text-red-500 bg-red-500/10" :
                            a.status === 'never' ? "text-amber-500 bg-amber-500/10" :
                            "text-blue-500 bg-blue-500/10"
                          )}>
                            {a.status === 'never' ? 'NUNCA REALIZADA' :
                             a.status === 'overdue' ? `VENCIDA · hace ${a.daysSince}d` :
                             a.daysLeft === 0 ? 'VENCE HOY' : `QUEDAN ${a.daysLeft}d`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
            })()}
          </div>
        </div>
      )}

      {/* Resumen: Banderas Rojas por Responsable */}
      {dbResponses.length > 0 && (
        <div className="bg-bg-sidebar border border-border-dim rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-red-500 flex items-center gap-2">
              🚩 Banderas Rojas por Responsable
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              <select value={flagsBranch} onChange={e => setFlagsBranch(e.target.value)}
                className="bg-bg-card border border-border-dim rounded px-3 py-1.5 text-[9px] font-black uppercase text-text-main outline-none focus:border-brand-500 cursor-pointer">
                <option value="all">Todas las sucursales</option>
                {branches.filter(b => b.id !== 'all').map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <select value={flagsMonth} onChange={e => setFlagsMonth(e.target.value)}
                className="bg-bg-card border border-border-dim rounded px-3 py-1.5 text-[9px] font-black uppercase text-text-main outline-none focus:border-brand-500 cursor-pointer">
                <option value="all">Todos los meses</option>
                {mesesDisponibles.map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
              </select>
            </div>
          </div>

          {/* Totales del período */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-bg-accent/40 rounded-lg p-3">
              <p className="text-[8px] font-black uppercase tracking-widest text-text-dim">Solo Encargado</p>
              <p className="text-lg font-mono font-black text-red-500">{totalesBanderas.soloEnc}</p>
            </div>
            <div className="bg-bg-accent/40 rounded-lg p-3">
              <p className="text-[8px] font-black uppercase tracking-widest text-text-dim">Solo Jefe de Cocina</p>
              <p className="text-lg font-mono font-black text-red-500">{totalesBanderas.soloCoc}</p>
            </div>
            <div className="bg-bg-accent/40 rounded-lg p-3">
              <p className="text-[8px] font-black uppercase tracking-widest text-text-dim">Ambos</p>
              <p className="text-lg font-mono font-black text-amber-500">{totalesBanderas.ambos}</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-[8px] font-black uppercase tracking-widest text-text-dim">Total banderas</p>
              <p className="text-lg font-mono font-black text-red-500">{totalesBanderas.total}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border-dim">
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr className="bg-bg-accent text-left text-text-dim font-bold uppercase tracking-widest border-b border-border-dim">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Sucursal</th>
                  <th className="px-4 py-3">Formulario</th>
                  <th className="px-4 py-3">Supervisor</th>
                  <th className="px-4 py-3 text-center">Encargado</th>
                  <th className="px-4 py-3 text-center">Jefe Cocina</th>
                  <th className="px-4 py-3 text-center">Ambos</th>
                  <th className="px-4 py-3 text-center">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dim/40">
                {resumenBanderas.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-[10px] font-bold uppercase text-text-dim">
                      No hay banderas rojas para el filtro seleccionado.
                    </td>
                  </tr>
                ) : resumenBanderas.map(f => {
                  const resp = dbResponses.find(x => x.id === f.id);
                  const isExp = expandedFlag === f.id;
                  const sinAsignar = resp ? detalleBanderas(resp).filter(d => !d.target).length : 0;
                  return (
                  <React.Fragment key={f.id}>
                    <tr className={cn("hover:bg-bg-accent/40", puedeAnular && "cursor-pointer")}
                      onClick={() => puedeAnular && setExpandedFlag(isExp ? null : f.id)}>
                      <td className="px-4 py-3 font-mono text-text-dim">
                        {puedeAnular && <span className="mr-1.5 text-brand-500">{isExp ? '▾' : '▸'}</span>}
                        {f.date}
                      </td>
                      <td className="px-4 py-3 font-black text-text-main uppercase">{f.branch}</td>
                      <td className="px-4 py-3 font-bold text-text-main uppercase">
                        {f.form}
                        {sinAsignar > 0 && puedeAnular && (
                          <span className="ml-2 px-1.5 py-0.5 bg-amber-500/10 text-amber-500 border border-amber-500/30 rounded text-[7px] font-black">
                            {sinAsignar} sin asignar
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-bold text-text-dim uppercase">{f.user}</td>
                      <td className="px-4 py-3 text-center font-black text-red-500">{f.soloEnc || '—'}</td>
                      <td className="px-4 py-3 text-center font-black text-red-500">{f.soloCoc || '—'}</td>
                      <td className="px-4 py-3 text-center font-black text-amber-500">{f.ambos || '—'}</td>
                      <td className="px-4 py-3 text-center font-black text-text-main">{f.total}</td>
                    </tr>
                    {isExp && resp && (
                      <tr className="bg-bg-accent/20">
                        <td colSpan={8} className="px-4 py-3">
                          <p className="text-[9px] font-black uppercase tracking-widest text-text-dim mb-2">
                            Asignar responsable de cada bandera roja
                          </p>
                          <div className="space-y-2">
                            {detalleBanderas(resp).map(d => {
                              const guardando = savingTarget === `${resp.id}_${d.qid}`;
                              return (
                                <div key={d.qid} className="flex items-center justify-between gap-3 bg-bg-card border border-border-dim rounded-lg p-2.5 flex-wrap">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-bold text-text-main uppercase">{d.pregunta}</p>
                                    {d.categoria && <p className="text-[8px] font-bold text-text-dim uppercase">{d.categoria}</p>}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {([
                                      { id: 'encargado', label: 'Encargado' },
                                      { id: 'cocina', label: 'Jefe Cocina' },
                                      { id: 'ambos', label: 'Ambos' },
                                    ] as const).map(t => {
                                      const sel = d.target === t.id;
                                      return (
                                        <button key={t.id} type="button" disabled={guardando}
                                          onClick={(e) => { e.stopPropagation(); asignarResponsable(resp, d.qid, t.id); }}
                                          className={cn(
                                            "px-2.5 py-1.5 rounded border text-[8px] font-black uppercase tracking-wider transition-all",
                                            sel
                                              ? "bg-red-500 border-red-500 text-white"
                                              : "bg-bg-sidebar border-border-dim text-text-dim hover:border-red-500/50",
                                            guardando && "opacity-50 cursor-wait"
                                          )}>
                                          {t.label}
                                        </button>
                                      );
                                    })}
                                    {!d.target && (
                                      <span className="ml-1 text-[8px] font-black uppercase text-amber-500">Sin asignar</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[8px] font-bold uppercase text-text-dim opacity-70 leading-relaxed">
            Para los premios: al Encargado le corresponden {totalesBanderas.soloEnc + totalesBanderas.ambos} banderas
            (solo encargado + ambos) y al Jefe de Cocina {totalesBanderas.soloCoc + totalesBanderas.ambos} (solo cocina + ambos).
            Las supervisiones anuladas no se cuentan.
            {puedeAnular && ' Hacé clic en una fila para asignar el responsable de cada bandera. Las que nunca se asignaron cuentan como "Ambos" hasta que las edites.'}
          </p>
        </div>
      )}

      {/* Listado de supervisiones realizadas */}
      {dbResponses.length > 0 && (
        <div className="bg-bg-sidebar border border-border-dim rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-brand-500 flex items-center gap-2">
              <ClipboardCheck size={15} /> Supervisiones Realizadas ({listaFiltrada.length}{listaFiltrada.length !== dbResponses.length ? ` de ${dbResponses.length}` : ''})
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              <select value={listBranch} onChange={e => setListBranch(e.target.value)}
                className="bg-bg-card border border-border-dim rounded px-3 py-1.5 text-[9px] font-black uppercase text-text-main outline-none focus:border-brand-500 cursor-pointer">
                <option value="all">Todas las sucursales</option>
                {branches.filter(b => b.id !== 'all').map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <select value={listForm} onChange={e => setListForm(e.target.value)}
                className="bg-bg-card border border-border-dim rounded px-3 py-1.5 text-[9px] font-black uppercase text-text-main outline-none focus:border-brand-500 cursor-pointer">
                <option value="all">Todos los formularios</option>
                {formulariosDisponibles.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <select value={listMonth} onChange={e => setListMonth(e.target.value)}
                className="bg-bg-card border border-border-dim rounded px-3 py-1.5 text-[9px] font-black uppercase text-text-main outline-none focus:border-brand-500 cursor-pointer">
                <option value="all">Todos los meses</option>
                {mesesDisponibles.map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
              </select>
              {(listBranch !== 'all' || listForm !== 'all' || listMonth !== 'all') && (
                <button onClick={() => { setListBranch('all'); setListForm('all'); setListMonth('all'); }}
                  className="text-[9px] font-black uppercase text-brand-500 hover:text-brand-600 px-2 py-1">Limpiar</button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border-dim">
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr className="bg-bg-accent text-left text-text-dim font-bold uppercase tracking-widest border-b border-border-dim">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Sucursal</th>
                  <th className="px-4 py-3">Formulario</th>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3 text-center">Puntaje</th>
                  <th className="px-4 py-3 text-center">🔴</th>
                  <th className="px-4 py-3 text-center">🟡</th>
                  <th className="px-4 py-3 text-center">🟢</th>
                  {puedeAnular && <th className="px-4 py-3 text-center">Acción</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dim/40">
                {listaFiltrada.length === 0 ? (
                  <tr><td colSpan={puedeAnular ? 9 : 8} className="px-4 py-8 text-center text-[10px] font-bold uppercase text-text-dim">
                    No hay supervisiones para el filtro seleccionado.
                  </td></tr>
                ) : listaFiltrada.map(r => {
                  const flags = r.scores?.flags || {};
                  const score = Number(r.total_score) || 0;
                  const bName = branches.find(b => b.id === r.branch_id)?.name || r.branch_id;
                  const formName = r.scores?.template_name || templates.find(t => t.id === r.checklist_id)?.name || '—';
                  const userName = r.scores?.supervisor?.name || '—';
                  const anulada = !!r.annulled;
                  return (
                    <tr key={r.id} className={cn("hover:bg-bg-accent/40", anulada && "opacity-50")}>
                      <td className="px-4 py-3 font-mono text-text-dim">
                        {r.date}
                        {anulada && (
                          <span className="ml-2 px-1.5 py-0.5 bg-red-500/10 text-red-500 border border-red-500/30 rounded text-[7px] font-black uppercase"
                            title={`Anulada por ${r.annulled_by || '—'}${r.annulled_reason ? `: ${r.annulled_reason}` : ''}`}>
                            Anulada
                          </span>
                        )}
                      </td>
                      <td className={cn("px-4 py-3 font-black text-text-main uppercase", anulada && "line-through")}>{bName}</td>
                      <td className={cn("px-4 py-3 font-bold text-text-main uppercase", anulada && "line-through")}>{formName}</td>
                      <td className="px-4 py-3 font-bold text-text-dim uppercase">{userName}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("font-black", anulada ? "text-text-dim line-through" : score >= 8 ? "text-emerald-500" : score >= 6 ? "text-yellow-500" : "text-red-500")}>{score.toFixed(1)}/10</span>
                      </td>
                      <td className={cn("px-4 py-3 text-center font-black", anulada ? "text-text-dim" : "text-red-500")}>{flags.red || 0}</td>
                      <td className={cn("px-4 py-3 text-center font-black", anulada ? "text-text-dim" : "text-yellow-500")}>{flags.yellow || 0}</td>
                      <td className={cn("px-4 py-3 text-center font-black", anulada ? "text-text-dim" : "text-emerald-500")}>{flags.green || 0}</td>
                      {puedeAnular && (
                        <td className="px-4 py-3 text-center">
                          {anulada ? (
                            <button onClick={() => reactivarSupervision(r)}
                              className="text-[8px] font-black uppercase tracking-wider text-emerald-500 hover:text-emerald-400 border border-emerald-500/30 rounded px-2 py-1">
                              Reactivar
                            </button>
                          ) : (
                            <button onClick={() => anularSupervision(r)}
                              className="text-text-dim hover:text-red-500 transition-colors" title="Anular supervisión">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

          {/* Supervisor Selection Bar */}
          <div className="bg-bg-sidebar border border-border-dim rounded-xl p-6 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
             <div className="space-y-1">
                <span className="text-[9px] font-black uppercase text-brand-500 tracking-widest">
                   Perfil de Trabajo Activo (Registro de Visitas)
                </span>
                <p className="text-xs text-text-dim leading-relaxed italic opacity-85">
                   Selecciona tu perfil de Líder Operativo para ver tus sucursales asignadas y realizar tus visitas agendadas.
                </p>
             </div>

             <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <div className="flex items-center gap-2 bg-bg-accent border border-border-dim rounded px-3 py-2 min-w-[220px]">
                   <Building2 size={12} className="text-brand-500 flex-shrink-0" />
                   <select
                     value={selectedSupId}
                     onChange={(e) => setSelectedSupId(e.target.value)}
                     className="bg-transparent text-[10px] font-black uppercase text-brand-500 outline-none w-full cursor-pointer"
                   >
                     <option value="all" className="bg-bg-sidebar text-text-main">VER TODAS LAS SUCURSALES (ADMIN)</option>
                     {supervisors.map(sup => (
                       <option key={sup.id} value={sup.id} className="bg-bg-sidebar text-text-main">
                         {sup.name}
                       </option>
                     ))}
                   </select>
                </div>

                {selectedSupId !== 'all' && (
                   <label className="flex items-center gap-2 text-[9px] font-black text-text-dim uppercase tracking-wider cursor-pointer">
                     <input
                       type="checkbox"
                       checked={showAllBranches}
                       onChange={(e) => setShowAllBranches(e.target.checked)}
                       className="rounded border-border-dim text-brand-500 focus:ring-brand-500 bg-bg-sidebar w-3.5 h-3.5 cursor-pointer"
                     />
                     <span>Mostrar No Asignadas</span>
                   </label>
                )}
             </div>
          </div>

          {/* Assigned Branches Alert Banner */}
          {selectedSupId !== 'all' && assignedBranchIds.length === 0 && !showAllBranches && (
             <div className="bg-orange-500/10 border border-orange-500/20 p-5 rounded-lg">
                <div className="flex gap-3 text-orange-500">
                   <AlertCircle className="w-5 h-5 flex-shrink-0" />
                   <div className="text-[10px] leading-relaxed font-bold uppercase tracking-wide">
                      <p className="font-black text-orange-400">Sin sucursales asignadas</p>
                      <p className="text-text-dim font-medium lowercase tracking-normal italic mt-1 leading-normal">
                         Pídele a Administración que te asigne tus sucursales desde la pestaña "Asignación de Supervisores" en la sección de control general. O activa el check de "Mostrar No Asignadas" para pruebas de desarrollo.
                      </p>
                   </div>
                </div>
             </div>
          )}

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
                    {filteredBranches.map(branch => {
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
                                      {alert.redQuestions && alert.redQuestions.length > 0 && (
                                        <ul className="mt-2 space-y-1 border-t border-border-dim/40 pt-2">
                                          {alert.redQuestions.map((q, qi) => (
                                            <li key={qi} className="flex items-start gap-1.5 text-[10px]">
                                              <span className="text-red-500 mt-0.5 shrink-0">●</span>
                                              <span className="text-text-main font-semibold leading-tight">
                                                {q.category && <span className="text-text-dim font-bold uppercase text-[7px] mr-1.5 bg-bg-accent px-1 py-0.5 rounded">{q.category}</span>}
                                                {q.text}
                                              </span>
                                            </li>
                                          ))}
                                        </ul>
                                      )}
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

                                {/* Selector de responsable: solo si la respuesta es BANDERA ROJA */}
                                {answers[q.id]?.color === 'red' && (
                                  <div className="mt-3 bg-red-500/5 border border-red-500/30 rounded-lg p-3">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-red-500 mb-2 flex items-center gap-1.5">
                                      <Flag size={11} /> ¿A quién corresponde esta bandera roja?
                                    </p>
                                    <div className="grid grid-cols-3 gap-2">
                                      {([
                                        { id: 'encargado', label: 'Encargado' },
                                        { id: 'cocina', label: 'Jefe de Cocina' },
                                        { id: 'ambos', label: 'Ambos' },
                                      ] as const).map(t => {
                                        const sel = (answers[q.id]?.target || 'ambos') === t.id;
                                        return (
                                          <button key={t.id} type="button"
                                            onClick={() => handleSetTarget(q.id, t.id)}
                                            className={cn(
                                              "px-2 py-2 rounded-md border text-[9px] font-black uppercase tracking-wider transition-all",
                                              sel
                                                ? "bg-red-500 border-red-500 text-white"
                                                : "bg-bg-sidebar border-border-dim text-text-dim hover:border-red-500/50"
                                            )}>
                                            {t.label}
                                          </button>
                                        );
                                      })}
                                    </div>
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
