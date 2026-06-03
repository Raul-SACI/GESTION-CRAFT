import React, { useState, useEffect } from 'react';
import { 
  Flag, 
  Settings, 
  ClipboardCheck, 
  Plus, 
  Trash2, 
  ChevronRight, 
  Save,
  FileText,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Building2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Branch } from '../types';
import { supabase } from '../lib/supabase';
import { 
  SEEDED_TEMPLATES, 
  AuditTemplate, 
  Question, 
  Option 
} from '../lib/supervisionSeeds';

export default function SupervisionFlagsView({ 
  branches, 
  initialViewMode = 'admin',
  hideToggle = false,
  customTitle,
  currentUserName,
  currentUserRole,
  isReadOnly = false
}: { 
  branches: Branch[]; 
  initialViewMode?: 'admin' | 'supervisor';
  hideToggle?: boolean;
  customTitle?: string;
  currentUserName?: string;
  currentUserRole?: string;
  isReadOnly?: boolean;
}) {
  const [viewMode, setViewMode] = useState<'admin' | 'supervisor'>(initialViewMode);
  const [templates, setTemplates] = useState<AuditTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<AuditTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Supervisor Form State
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [answers, setAnswers] = useState<Record<string, { optionId: string; text: string; score: number; color: 'green' | 'yellow' | 'red'; textVal?: string }>>({});
  const [generalNotes, setGeneralNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Admin Sub-tab state
  const [adminTab, setAdminTab] = useState<'templates' | 'assignments' | 'historial' | 'periodicidad'>('historial');
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [editingSupervisor, setEditingSupervisor] = useState<any | null>(null);
  // Supervisores tomados del maestro de Personal (empleados con puesto "Líder de...")
  const [leaderEmployees, setLeaderEmployees] = useState<{ name: string; position: string }[]>([]);
  // Asignaciones formulario↔supervisor: { supervisorName: [checklistId, ...] }
  const [formAssignments, setFormAssignments] = useState<Record<string, string[]>>({});
  // Periodicidad: { "checklistId|branchId": "semanal"|"quincenal"|"mensual" }
  const [schedules, setSchedules] = useState<Record<string, string>>({});
  const [savingSchedule, setSavingSchedule] = useState<string | null>(null);
  const [savingAssignment, setSavingAssignment] = useState<string | null>(null);
  const [selectedBranchesForEditing, setSelectedBranchesForEditing] = useState<string[]>([]);
  const [newSupervisorName, setNewSupervisorName] = useState('');
  const [isCreatingSupervisor, setIsCreatingSupervisor] = useState(false);
  const [allResponses, setAllResponses] = useState<any[]>([]);
  const [isAssignmentsLoading, setIsAssignmentsLoading] = useState(false);

  // Load supervisors and responses
  const fetchSupervisorsAndResponses = async () => {
    setIsAssignmentsLoading(true);
    try {
      const { data: profiles, error } = await supabase.from('profiles').select('*');
      if (!error && profiles) {
        let sups = profiles.filter(p => p.role === 'supervisor');
        // No auto-seed fake supervisors - show real empty state
        setSupervisors(sups);
      }

      // Load all Responses to compute weekly compliance
      const { data: responses, error: respError } = await supabase
        .from('supervision_responses')
        .select('*')
        .order('date', { ascending: false });
        
      if (!respError && responses) {
        setAllResponses(responses);
      }

      // Cargar empleados con puesto "Líder de..." del maestro de Personal (dedup por nombre)
      const { data: emps, error: empError } = await supabase
        .from('employees')
        .select('name, position')
        .eq('is_active', true);
      if (!empError && emps) {
        const leaders = emps.filter(e => (e.position || '').toLowerCase().trim().startsWith('líder de') || (e.position || '').toLowerCase().trim().startsWith('lider de'));
        const seen = new Set<string>();
        const unique: { name: string; position: string }[] = [];
        leaders.forEach(e => {
          const key = (e.name || '').toUpperCase().trim();
          if (key && !seen.has(key)) { seen.add(key); unique.push({ name: e.name, position: e.position }); }
        });
        unique.sort((a, b) => a.name.localeCompare(b.name));
        setLeaderEmployees(unique);
      }

      // Cargar asignaciones de formularios existentes
      const { data: assigns, error: assignError } = await supabase
        .from('supervisor_form_assignments')
        .select('supervisor_name, checklist_id');
      if (!assignError && assigns) {
        const map: Record<string, string[]> = {};
        assigns.forEach(a => {
          const key = (a.supervisor_name || '').toUpperCase().trim();
          if (!map[key]) map[key] = [];
          map[key].push(a.checklist_id);
        });
        setFormAssignments(map);
      }

      // Cargar periodicidades (schedule) existentes
      const { data: scheds, error: schedError } = await supabase
        .from('supervision_schedules')
        .select('checklist_id, branch_id, frequency');
      if (!schedError && scheds) {
        const map: Record<string, string> = {};
        scheds.forEach(s => { map[`${s.checklist_id}|${s.branch_id}`] = s.frequency; });
        setSchedules(map);
      }
    } catch (err) {
      console.error("Error fetching supervisors / weekly reports:", err);
    } finally {
      setIsAssignmentsLoading(false);
    }
  };

  useEffect(() => {
    fetchSupervisorsAndResponses();
  }, [viewMode, adminTab]);

  // En modo supervisor, mostrar solo los formularios asignados al usuario logueado.
  // Si el usuario no tiene asignaciones (o no se reconoce), se muestran todos (no bloquea).
  const visibleTemplates = React.useMemo(() => {
    if (viewMode !== 'supervisor' || !currentUserName) return templates;
    const key = currentUserName.toUpperCase().trim();
    const assignedIds = formAssignments[key];
    if (!assignedIds || assignedIds.length === 0) return templates;
    return templates.filter(t => assignedIds.includes(t.id));
  }, [viewMode, currentUserName, templates, formAssignments]);

  // Solo se pueden asignar formularios con UUID real (guardados en la base).
  // Los formularios "seeded" locales (ids tipo 't-servicio') no son asignables hasta guardarse.
  const assignableTemplates = React.useMemo(() => {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return templates.filter(t => uuidRe.test(t.id));
  }, [templates]);

  // Guardar la periodicidad de un formulario en una sucursal
  const setScheduleFrequency = async (checklistId: string, branchId: string, frequency: string) => {
    const key = `${checklistId}|${branchId}`;
    setSavingSchedule(key);
    try {
      if (!frequency) {
        // vacío = quitar periodicidad
        const { error } = await supabase
          .from('supervision_schedules')
          .delete()
          .eq('checklist_id', checklistId)
          .eq('branch_id', branchId);
        if (error) throw error;
        setSchedules(prev => { const n = { ...prev }; delete n[key]; return n; });
      } else {
        const { error } = await supabase
          .from('supervision_schedules')
          .upsert({ checklist_id: checklistId, branch_id: branchId, frequency }, { onConflict: 'checklist_id,branch_id' });
        if (error) throw error;
        setSchedules(prev => ({ ...prev, [key]: frequency }));
      }
    } catch (err: any) {
      console.error('Error guardando periodicidad:', err);
      alert('Error al guardar la periodicidad: ' + (err?.message || 'error desconocido'));
    } finally {
      setSavingSchedule(null);
    }
  };

  // Eliminar una supervisión realizada (solo administrador). Borrado permanente.
  const handleDeleteResponse = async (responseId: string, label: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (currentUserRole !== 'administrador' && currentUserRole !== 'dueño') {
      alert('Solo un administrador puede eliminar supervisiones.');
      return;
    }
    const ok = window.confirm(
      `¿Eliminar definitivamente esta supervisión?\n\n${label}\n\nEsta acción no se puede deshacer.`
    );
    if (!ok) return;
    try {
      const { error } = await supabase
        .from('supervision_responses')
        .delete()
        .eq('id', responseId);
      if (error) throw error;
      setAllResponses(prev => prev.filter(r => r.id !== responseId));
    } catch (err: any) {
      console.error('Error eliminando supervisión:', err);
      alert('Error al eliminar la supervisión: ' + (err?.message || 'error desconocido'));
    }
  };

  const handleSaveAssignments = async (supId: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ branch_name: selectedBranchesForEditing.join(',') })
        .eq('id', supId);
      
      if (error) throw error;
      
      setSupervisors(prev => prev.map(s => s.id === supId ? { ...s, branch_name: selectedBranchesForEditing.join(',') } : s));
      setEditingSupervisor(null);
      alert('¡Asignación de sucursales guardada con éxito!');
      fetchSupervisorsAndResponses();
    } catch (err) {
      console.error(err);
      alert('Error de conexión. Se guardó localmente de manera temporal.');
      setSupervisors(prev => prev.map(s => s.id === supId ? { ...s, branch_name: selectedBranchesForEditing.join(',') } : s));
      setEditingSupervisor(null);
    }
  };

  // Asignar o quitar un formulario a un supervisor (por nombre)
  const toggleFormAssignment = async (supervisorName: string, checklistId: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    const key = supervisorName.toUpperCase().trim();
    const current = formAssignments[key] || [];
    const isAssigned = current.includes(checklistId);
    setSavingAssignment(key + checklistId);
    try {
      if (isAssigned) {
        const { error } = await supabase
          .from('supervisor_form_assignments')
          .delete()
          .eq('supervisor_name', key)
          .eq('checklist_id', checklistId);
        if (error) throw error;
        setFormAssignments(prev => ({ ...prev, [key]: (prev[key] || []).filter(id => id !== checklistId) }));
      } else {
        const { error } = await supabase
          .from('supervisor_form_assignments')
          .insert({ supervisor_name: key, checklist_id: checklistId });
        if (error) throw error;
        setFormAssignments(prev => ({ ...prev, [key]: [...(prev[key] || []), checklistId] }));
      }
    } catch (err: any) {
      console.error('Error al asignar formulario:', err);
      alert('Error al guardar la asignación: ' + (err?.message || 'error desconocido'));
    } finally {
      setSavingAssignment(null);
    }
  };

  const handleCreateSupervisor = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!newSupervisorName.trim()) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          name: newSupervisorName.toUpperCase(),
          role: 'supervisor',
          branch_name: ''
        })
        .select()
        .single();
        
      if (error) throw error;
      
      setNewSupervisorName('');
      alert('¡Supervisor de Operaciones registrado con éxito!');
      fetchSupervisorsAndResponses();
    } catch (err) {
      console.error(err);
      alert('Error de conexión. Se creó localmente.');
      const mockSup = {
        id: Math.random().toString(36).substr(2, 9),
        name: newSupervisorName.toUpperCase(),
        role: 'supervisor',
        branch_name: ''
      };
      setSupervisors(prev => [...prev, mockSup]);
      setNewSupervisorName('');
    }
  };

  const handleToggleBranchForEditing = (branchId: string) => {
    setSelectedBranchesForEditing(prev => 
      prev.includes(branchId) ? prev.filter(id => id !== branchId) : [...prev, branchId]
    );
  };

  // Helper date calculators for current week Monday to Sunday
  const getStartOfWeekDate = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday (0) to go back to previous Mon
    const monday = new Date(now.setDate(diff));
    monday.setHours(0,0,0,0);
    return monday;
  };

  const getEndOfWeekDate = () => {
    const monday = getStartOfWeekDate();
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23,59,59,999);
    return sunday;
  };

  const startOfWeekStr = getStartOfWeekDate().toISOString().split('T')[0];
  const endOfWeekStr = getEndOfWeekDate().toISOString().split('T')[0];

  const handleResetTemplates = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!window.confirm("¿Está seguro de que desea restaurar las plantillas oficiales a sus valores por defecto? Esto actualizará las preguntas y secciones de los formularios oficiales (Servicio, Cocina, Delivery y Depósito Central) en la base de datos de forma inmediata.")) {
      return;
    }
    
    setIsResetting(true);
    try {
      const recordsToInsert = SEEDED_TEMPLATES.map(t => ({
        id: t.id === 't-servicio' ? '19c8f031-15b7-4b72-b5e0-47de31f24d71' : 
            t.id === 't-cocina' ? '29c8f031-15b7-4b72-b5e0-47de31f24d72' :
            t.id === 't-delivery' ? '39c8f031-15b7-4b72-b5e0-47de31f24d73' :
            '49c8f031-15b7-4b72-b5e0-47de31f24d74',
        name: t.name,
        category: t.category,
        items: t.questions
      }));

      for (const rec of recordsToInsert) {
        const { error } = await supabase
          .from('supervision_checklists')
          .upsert({
            id: rec.id,
            name: rec.name,
            category: rec.category,
            items: rec.items
          });
        if (error) throw error;
      }

      const { data, error: fetchError } = await supabase
        .from('supervision_checklists')
        .select('*')
        .order('name');
        
      if (fetchError) throw fetchError;

      if (data) {
        const formatted = data.map(item => ({
          id: item.id,
          name: item.name,
          category: item.category,
          questions: Array.isArray(item.items) ? item.items : JSON.parse(item.items || '[]')
        }));
        setTemplates(formatted);
        setSelectedTemplate(formatted[0]);
      }
      alert("¡Plantillas oficiales actualizadas y sincronizadas en la base de datos con éxito! Ahora dispones del set de preguntas completo.");
    } catch (err) {
      console.error("Error resetting templates:", err);
      alert("Hubo un error al re-sincronizar las plantillas de fábrica.");
    } finally {
      setIsResetting(false);
    }
  };

  useEffect(() => {
    if (branches && branches.length > 0 && !selectedBranchId) {
      setSelectedBranchId(branches[0].id);
    }
  }, [branches, selectedBranchId]);

  // Load and seed checklists
  useEffect(() => {
    async function loadTemplates() {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('supervision_checklists')
          .select('*')
          .order('name');
          
        if (error) throw error;

        if (data && data.length > 0) {
          const formatted = data.map(item => ({
            id: item.id,
            name: item.name,
            category: item.category,
            questions: Array.isArray(item.items) ? item.items : JSON.parse(item.items || '[]')
          }));
          setTemplates(formatted);
          setSelectedTemplate(formatted[0]);
        } else {
          // No templates inside table! Let's insert the Seeded ones.
          const recordsToInsert = SEEDED_TEMPLATES.map(t => ({
            id: t.id === 't-servicio' ? '19c8f031-15b7-4b72-b5e0-47de31f24d71' : 
                t.id === 't-cocina' ? '29c8f031-15b7-4b72-b5e0-47de31f24d72' :
                t.id === 't-delivery' ? '39c8f031-15b7-4b72-b5e0-47de31f24d73' :
                '49c8f031-15b7-4b72-b5e0-47de31f24d74',
            name: t.name,
            category: t.category,
            items: t.questions
          }));

          const { error: insertError } = await supabase
            .from('supervision_checklists')
            .insert(recordsToInsert);

          if (insertError) {
            console.warn("Seeding failed, using local variables:", insertError);
            setTemplates(SEEDED_TEMPLATES);
            setSelectedTemplate(SEEDED_TEMPLATES[0]);
          } else {
            const formatted = recordsToInsert.map(r => ({
              id: r.id,
              name: r.name,
              category: r.category,
              questions: r.items
            }));
            setTemplates(formatted);
            setSelectedTemplate(formatted[0]);
          }
        }
      } catch (err) {
        console.error("Supabase load failed. Falling back to Seeded templates:", err);
        setTemplates(SEEDED_TEMPLATES);
        setSelectedTemplate(SEEDED_TEMPLATES[0]);
      } finally {
        setIsLoading(false);
      }
    }
    loadTemplates();
  }, []);

  const handleSaveTemplate = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!selectedTemplate) return;

    // Asegurar un UUID válido: mapear los ids seeded conocidos, o generar uno nuevo.
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const seededUuidMap: Record<string, string> = {
      't-servicio': '19c8f031-15b7-4b72-b5e0-47de31f24d71',
      't-cocina': '29c8f031-15b7-4b72-b5e0-47de31f24d72',
      't-delivery': '39c8f031-15b7-4b72-b5e0-47de31f24d73',
      't-deposito': '49c8f031-15b7-4b72-b5e0-47de31f24d74',
    };
    let saveId = selectedTemplate.id;
    if (!uuidRe.test(saveId)) {
      saveId = seededUuidMap[saveId] || (crypto.randomUUID ? crypto.randomUUID() : '');
    }

    try {
      const { error } = await supabase
        .from('supervision_checklists')
        .upsert({
          id: saveId,
          name: selectedTemplate.name,
          category: selectedTemplate.category,
          items: selectedTemplate.questions
        });
        
      if (error) throw error;
      
      const savedTemplate = { ...selectedTemplate, id: saveId };
      setTemplates(prev => prev.map(t => t.id === selectedTemplate.id ? savedTemplate : t));
      setSelectedTemplate(savedTemplate);
      alert('¡Plantilla guardada con éxito en la Base de Datos!');
    } catch (err: any) {
      console.error('Error saving checklist template:', err);
      alert('Error al guardar la plantilla: ' + (err?.message || 'error desconocido'));
    }
  };

  const handleCreateTemplate = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    const newId = Math.random().toString(36).substr(2, 9);
    const newT: AuditTemplate = {
      id: newId,
      name: 'NUEVA SUPERVISIÓN CONFIG',
      category: 'General',
      questions: [
        {
          id: 'q_' + Math.random().toString(36).substr(2, 5),
          text: '¿PREGUNTA DE EVALUACIÓN?',
          category: 'GENERAL',
          options: [
            { id: 'opt_g_1', text: 'Excelente (Verde)', score: 1, color: 'green' },
            { id: 'opt_g_2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
            { id: 'opt_g_3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
          ]
        }
      ]
    };
    
    try {
      const { error } = await supabase
        .from('supervision_checklists')
        .insert({
          id: newId,
          name: newT.name,
          category: newT.category,
          items: newT.questions
        });
        
      if (error) throw error;
      setTemplates(prev => [...prev, newT]);
      setSelectedTemplate(newT);
    } catch (err) {
      console.error(err);
      setTemplates(prev => [...prev, newT]);
      setSelectedTemplate(newT);
    }
  };

  const addQuestion = () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!selectedTemplate) return;
    const newQuestion: Question = {
      id: 'q_' + Math.random().toString(36).substr(2, 7),
      text: 'Nueva Pregunta',
      category: 'GENERAL',
      options: [
        { id: 'opt_n_' + Math.random().toString(36).substr(2, 5), text: 'Excelente (Verde)', score: 1, color: 'green' },
        { id: 'opt_n_' + Math.random().toString(36).substr(2, 5), text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
        { id: 'opt_n_' + Math.random().toString(36).substr(2, 5), text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
      ]
    };
    setSelectedTemplate({
      ...selectedTemplate,
      questions: [...selectedTemplate.questions, newQuestion]
    });
  };

  const updateQuestionText = (qId: string, text: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!selectedTemplate) return;
    setSelectedTemplate({
      ...selectedTemplate,
      questions: selectedTemplate.questions.map(q => q.id === qId ? { ...q, text } : q)
    });
  };

  const updateQuestionCategory = (qId: string, category: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!selectedTemplate) return;
    setSelectedTemplate({
      ...selectedTemplate,
      questions: selectedTemplate.questions.map(q => q.id === qId ? { ...q, category } : q)
    });
  };

  const deleteQuestion = (qId: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!selectedTemplate) return;
    setSelectedTemplate({
      ...selectedTemplate,
      questions: selectedTemplate.questions.filter(q => q.id !== qId)
    });
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
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!selectedTemplate || !selectedBranchId) return;
    
    // Validate we've answered all non-text questions
    const nonTextQuestions = selectedTemplate.questions.filter(q => q.type !== 'text');
    const unanswered = nonTextQuestions.filter(q => !answers[q.id]);
    if (unanswered.length > 0) {
      alert(`Por favor, responda todas las preguntas antes de finalizar. Faltan ${unanswered.length} items de selección.`);
      return;
    }

    setIsSubmitting(true);
    let totalScore = 0;
    let redCount = 0;
    let yellowCount = 0;
    let greenCount = 0;

    nonTextQuestions.forEach(q => {
      const ans = answers[q.id];
      if (ans) {
        totalScore += ans.score;
        if (ans.color === 'red') redCount++;
        else if (ans.color === 'yellow') yellowCount++;
        else if (ans.color === 'green') greenCount++;
      }
    });

    const averageNormalizedScore = nonTextQuestions.length > 0 
      ? (totalScore / nonTextQuestions.length) * 10 
      : 10;

    try {
      // Only pass checklist_id if it's a valid UUID (not a local fallback id like 't-servicio')
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedTemplate.id);

      const responseData: any = {
        branch_id: selectedBranchId,
        date: new Date().toISOString().split('T')[0],
        scores: {
          answers,
          flags: { red: redCount, yellow: yellowCount, green: greenCount }
        },
        total_score: parseFloat(averageNormalizedScore.toFixed(2)),
        notes: generalNotes
      };

      if (isValidUUID) {
        responseData.checklist_id = selectedTemplate.id;
      }

      const { error } = await supabase
        .from('supervision_responses')
        .insert(responseData);

      if (error) {
        console.error('Supabase insert error:', error.message, error.details, error.hint);
        throw error;
      }

      alert(`¡Supervisión "${selectedTemplate.name}" registrada con éxito! Puntuación final: ${averageNormalizedScore.toFixed(1)}/10. Se encontraron ${redCount} banderas rojas.`);
      setAnswers({});
      setGeneralNotes('');
    } catch (err: any) {
      console.error('Error saving response:', err);
      const msg = err?.message || err?.details || JSON.stringify(err) || 'Error desconocido';
      alert(`Error al guardar la supervisión: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
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
            <h2 className="text-xl font-black text-text-main uppercase tracking-tight">
              {customTitle || (viewMode === 'supervisor' ? 'Registro de Supervisión' : 'Supervisiones y Banderas')}
            </h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest italic opacity-70">
              {viewMode === 'supervisor' ? 'Formulario de Auditoría y Control de Calidad' : 'Auditorías Operativas y Control de Calidad'}
            </p>
          </div>
        </div>

        {!hideToggle && (
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
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-text-dim animate-pulse">
          <div className="loader-ring w-12 h-12 border-4 border-t-brand-500 rounded-full animate-spin mb-4" />
          <p className="text-xs font-black uppercase tracking-widest text-text-dim">Cargando Cuestionarios...</p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {viewMode === 'admin' ? (
            <motion.div 
              key="admin"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6 w-full"
            >
              {/* Admin Subtabs Selector */}
              <div className="flex bg-bg-sidebar/40 p-1 rounded-lg border border-border-dim/50 max-w-3xl">
                <button
                  type="button"
                  onClick={() => setAdminTab('historial')}
                  className={cn(
                    "flex-1 text-center py-2.5 rounded text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer",
                    adminTab === 'historial' 
                      ? "bg-brand-500 text-black shadow-md font-bold" 
                      : "text-text-dim hover:text-text-main"
                  )}
                >
                  📋 Supervisiones Realizadas
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('templates')}
                  className={cn(
                    "flex-1 text-center py-2.5 rounded text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer",
                    adminTab === 'templates' 
                      ? "bg-brand-500 text-black shadow-md font-bold" 
                      : "text-text-dim hover:text-text-main"
                  )}
                >
                  ⚙️ Plantillas de Formularios
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('assignments')}
                  className={cn(
                    "flex-1 text-center py-2.5 rounded text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer",
                    adminTab === 'assignments' 
                      ? "bg-brand-500 text-black shadow-md font-bold" 
                      : "text-text-dim hover:text-text-main"
                  )}
                >
                  👥 Asignación de Supervisores y Tracker Semanal
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('periodicidad')}
                  className={cn(
                    "flex-1 text-center py-2.5 rounded text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer",
                    adminTab === 'periodicidad' 
                      ? "bg-brand-500 text-black shadow-md font-bold" 
                      : "text-text-dim hover:text-text-main"
                  )}
                >
                  🗓️ Periodicidad
                </button>
              </div>

              {adminTab === 'periodicidad' ? (
                <SupervisionScheduleEditor
                  templates={assignableTemplates}
                  branches={branches}
                  schedules={schedules}
                  savingSchedule={savingSchedule}
                  onSetFrequency={setScheduleFrequency}
                />
              ) : adminTab === 'historial' ? (
                <SupervisionHistoryList 
                  responses={allResponses} 
                  branches={branches}
                  canDelete={currentUserRole === 'administrador' || currentUserRole === 'dueño'}
                  onDelete={handleDeleteResponse}
                />
              ) : adminTab === 'templates' ? (
                <div className="grid grid-cols-12 gap-6">
                  {/* Template List */}
                  <div className="col-span-12 lg:col-span-4 space-y-4">
                    <div className="bg-bg-sidebar border border-border-dim rounded-lg p-5 shadow-xl">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-black uppercase text-brand-500 tracking-widest">Formularios / Templates</h3>
                        <button 
                          onClick={handleCreateTemplate}
                          className="p-1.5 bg-brand-500/10 text-brand-500 rounded-md hover:bg-brand-500/20 transition-colors"
                          title="Crear Nueva Plantilla"
                        >
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
                              <span className="inline-block mt-1 px-1.5 py-0.5 text-[8px] font-bold bg-bg-sidebar text-text-dim border border-border-dim rounded uppercase tracking-widest">
                                {t.questions.length} PREGUNTAS
                              </span>
                            </div>
                            <ChevronRight size={14} className={cn("transition-transform", selectedTemplate?.id === t.id && "translate-x-1")} />
                          </button>
                        ))}
                      </div>

                      <div className="mt-4 pt-4 border-t border-border-dim">
                        <button
                          onClick={handleResetTemplates}
                          disabled={isResetting}
                          className="w-full text-center bg-brand-500/15 hover:bg-brand-500/25 text-brand-500 py-3 rounded text-[9px] font-black uppercase tracking-widest border border-brand-500/30 hover:border-brand-500/50 transition-all cursor-pointer disabled:opacity-50"
                        >
                          {isResetting ? "Sincronizando..." : "Restaurar Plantillas de Fábrica"}
                        </button>
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
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1 space-y-2">
                            <input 
                              type="text" 
                              value={selectedTemplate.name}
                              onChange={(e) => setSelectedTemplate({...selectedTemplate, name: e.target.value})}
                              className="text-2xl font-black uppercase text-text-main bg-transparent outline-none border-b-2 border-transparent focus:border-brand-500 w-full tracking-tighter"
                            />
                            <div className="flex gap-4 items-center">
                              <span className="text-[9px] text-brand-500 font-black uppercase tracking-widest">CATEGORÍA:</span>
                              <input 
                                type="text"
                                value={selectedTemplate.category}
                                onChange={(e) => setSelectedTemplate({...selectedTemplate, category: e.target.value})}
                                className="bg-bg-accent border border-border-dim rounded px-2 py-0.5 text-[9px] font-bold uppercase text-text-main w-32"
                              />
                            </div>
                          </div>
                          <button 
                            onClick={handleSaveTemplate}
                            className="flex items-center gap-2 bg-brand-500 text-black px-6 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-lg shadow-brand-500/10"
                          >
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
                                  <div className="flex-1 space-y-3">
                                    <input 
                                      type="text"
                                      value={q.text}
                                      onChange={(e) => updateQuestionText(q.id, e.target.value)}
                                      className="w-full bg-transparent text-sm font-black text-text-main uppercase tracking-tight outline-none border-b border-transparent focus:border-brand-500"
                                    />
                                    <div className="flex items-center gap-2">
                                      <span className="text-[8px] font-bold text-text-dim uppercase tracking-wider">MÓDULO/SECTOR:</span>
                                      <input 
                                        type="text"
                                        value={q.category || ''}
                                        placeholder="SECTOR"
                                        onChange={(e) => updateQuestionCategory(q.id, e.target.value)}
                                        className="bg-bg-sidebar border border-border-dim/50 rounded px-2 py-0.5 text-[8px] font-bold uppercase text-text-main w-44 outline-none focus:border-brand-500/50"
                                      />
                                    </div>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => deleteQuestion(q.id)}
                                  className="text-text-dim hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>

                              {q.type === 'text' ? (
                                <div className="ml-12 p-3 bg-bg-sidebar border border-border-dim rounded-md">
                                  <p className="text-[9px] font-black uppercase tracking-widest text-text-dim">RESPUESTA DE TEXTO LIBRE</p>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 ml-12">
                                  {q.options.map((opt) => (
                                    <div key={opt.id} className="flex flex-col gap-2 p-3 bg-bg-sidebar border border-border-dim rounded-md">
                                       <div className="flex items-center gap-2">
                                          <div className={cn(
                                            "w-3 h-3 rounded-sm",
                                            opt.color === 'green' ? 'bg-emerald-500' : opt.color === 'yellow' ? 'bg-orange-500' : 'bg-red-500'
                                          )}></div>
                                          <input 
                                            className="bg-transparent text-[10px] font-bold uppercase text-text-main outline-none w-full border-b border-transparent focus:border-border-dim" 
                                            defaultValue={opt.text} 
                                            onChange={(e) => {
                                              opt.text = e.target.value;
                                            }}
                                          />
                                       </div>
                                       <div className="flex items-center justify-between text-[8px] font-black uppercase text-text-dim mt-1">
                                          <span>PESO: {opt.score > 0 ? (opt.score === 1 ? 'APROBADO' : 'OBSERVADO') : 'BANDERA ROJA'}</span>
                                       </div>
                                    </div>
                                  ))}
                                </div>
                              )}
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
                </div>
              ) : (
                /* Asignación de FORMULARIOS a Supervisores (empleados "Líder de...") */
                <div className="space-y-4">
                  <div className="bg-brand-500/5 border border-brand-500/20 rounded-lg p-4 text-[10px] text-text-dim uppercase font-bold tracking-wide">
                    Los supervisores se toman del Maestro de Personal (empleados con puesto "Líder de…"). Todos supervisan todas las sucursales; acá asignás qué formularios puede completar cada uno.
                  </div>

                  {leaderEmployees.length === 0 ? (
                    <div className="bg-bg-sidebar border border-border-dim rounded-lg p-10 text-center text-text-dim italic uppercase opacity-60 text-[11px]">
                      No hay empleados con puesto "Líder de…" en el maestro de Personal.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {leaderEmployees.map(emp => {
                        const key = emp.name.toUpperCase().trim();
                        const assigned = formAssignments[key] || [];
                        return (
                          <div key={key} className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm space-y-3">
                            <div className="flex items-center justify-between border-b border-border-dim pb-3">
                              <div>
                                <p className="text-sm font-black uppercase text-text-main tracking-tight">{emp.name}</p>
                                <p className="text-[9px] font-bold text-brand-500 uppercase tracking-widest">{emp.position}</p>
                              </div>
                              <span className="text-[9px] font-black text-text-dim uppercase bg-bg-accent px-2 py-1 rounded border border-border-dim">
                                {assigned.length} formulario{assigned.length === 1 ? '' : 's'}
                              </span>
                            </div>
                            <p className="text-[9px] font-black text-text-dim uppercase tracking-widest">Formularios asignados:</p>
                            <div className="space-y-1.5">
                              {assignableTemplates.length === 0 ? (
                                <p className="text-[9px] text-text-dim italic uppercase opacity-60 leading-relaxed">
                                  No hay formularios guardados en la base. Andá a "Plantillas de Formularios" y usá "Restaurar plantillas oficiales" para guardarlos antes de asignar.
                                </p>
                              ) : assignableTemplates.map(t => {
                                const checked = assigned.includes(t.id);
                                const isSaving = savingAssignment === key + t.id;
                                return (
                                  <button
                                    key={t.id}
                                    type="button"
                                    disabled={isSaving}
                                    onClick={() => toggleFormAssignment(emp.name, t.id)}
                                    className={cn(
                                      "w-full flex items-center justify-between gap-2 p-2.5 rounded border text-[10px] font-bold uppercase transition-all text-left",
                                      checked
                                        ? "bg-brand-500/10 border-brand-500/40 text-brand-500"
                                        : "bg-bg-accent/40 border-border-dim text-text-dim hover:border-brand-500/40",
                                      isSaving && "opacity-50 cursor-wait"
                                    )}
                                  >
                                    <span className="flex items-center gap-2 truncate">
                                      <span className={cn(
                                        "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                                        checked ? "bg-brand-500 border-brand-500" : "border-border-dim"
                                      )}>
                                        {checked && <CheckCircle2 size={11} className="text-black" />}
                                      </span>
                                      <span className="truncate">{t.name}</span>
                                    </span>
                                    {t.category && <span className="text-[8px] opacity-70 shrink-0">{t.category}</span>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div 
              key="supervisor"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
               {/* Supervisor Form View */}
               <div className="max-w-3xl mx-auto space-y-6">
                  <div className="bg-bg-sidebar border border-border-dim rounded-xl p-8 shadow-2xl">
                     <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 border-b border-border-dim pb-6">
                        <div>
                           <h3 className="text-xl font-black uppercase text-text-main tracking-tight">Nueva Visita de Supervisión</h3>
                           <div className="flex flex-wrap items-center gap-3 mt-2">
                              <div className="flex items-center gap-2 bg-bg-accent border border-border-dim rounded px-3 py-1">
                                <Building2 size={12} className="text-brand-500" />
                                <select 
                                  className="bg-transparent text-[9px] font-black uppercase text-brand-500 outline-none"
                                  value={selectedBranchId}
                                  onChange={(e) => setSelectedBranchId(e.target.value)}
                                >
                                  {branches.map(b => (
                                    <option key={b.id} value={b.id} className="bg-bg-sidebar text-text-main">{b.name}</option>
                                  ))}
                                </select>
                              </div>
                              <span className="text-[10px] font-bold text-text-dim uppercase tracking-widest">{new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                           </div>
                        </div>

                        <div className="flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 px-3 py-1.5 rounded">
                          <span className="text-[9px] font-black text-brand-500 uppercase tracking-widest">PLANTILLA ACTIVA: </span>
                          <select 
                            className="bg-transparent text-[9px] font-black uppercase text-brand-500 outline-none"
                            value={selectedTemplate?.id || ''}
                            onChange={(e) => {
                              const t = templates.find(temp => temp.id === e.target.value);
                              if (t) {
                                setSelectedTemplate(t);
                                setAnswers({});
                              }
                            }}
                          >
                            {visibleTemplates.map(t => (
                              <option key={t.id} value={t.id} className="bg-bg-sidebar text-text-main">{t.name}</option>
                            ))}
                          </select>
                        </div>
                     </div>

                     <div className="space-y-8">
                       {selectedTemplate?.questions.map((q, idx) => (
                         <div key={q.id} className="p-4 bg-bg-accent/20 border border-border-dim/30 rounded-lg last:mb-0">
                            <div className="flex justify-between items-start gap-4 mb-3">
                              <p className="text-xs font-black text-text-main uppercase flex items-start gap-3">
                                 <span className="text-brand-500 italic opacity-50">#{idx + 1}</span> {q.text}
                              </p>
                              {q.category && (
                                <span className="px-2 py-0.5 bg-bg-sidebar border border-border-dim/80 text-[8px] font-black text-text-dim tracking-widest rounded-sm uppercase">
                                  {q.category}
                                </span>
                              )}
                            </div>

                            {q.type === 'text' ? (
                              <textarea 
                                className="w-full bg-bg-accent border border-border-dim rounded-lg p-3 text-[11px] font-bold uppercase text-text-main outline-none focus:border-brand-500 h-24"
                                placeholder="Escriba los comentarios u observaciones aquí..."
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
                     </div>

                     <div className="mt-12 pt-8 border-t border-border-dim space-y-6">
                        <div className="space-y-2">
                           <p className="text-[10px] font-black text-text-dim uppercase tracking-widest">Observaciones Generales / Plan de Acción</p>
                           <textarea 
                             className="w-full bg-bg-accent border border-border-dim rounded-lg p-4 text-[11px] font-bold uppercase text-text-main outline-none focus:border-brand-500 h-32"
                             placeholder="ESCRIBA AQUÍ OBSERVACIONES GENERALES DE LA VISITA Y ACUERDOS..."
                             value={generalNotes}
                             onChange={(e) => setGeneralNotes(e.target.value)}
                           />
                        </div>
                        <button 
                          onClick={handleSubmitAudit}
                          disabled={isSubmitting}
                          className="w-full bg-brand-500 text-black py-4 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-xl shadow-brand-500/20 disabled:opacity-50"
                        >
                           {isSubmitting ? 'REGISTRANDO...' : 'FINALIZAR VISITA Y COMPILAR RESULTADOS'}
                        </button>
                     </div>
                  </div>
               </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </motion.div>
  );
}

// Editor de periodicidad: por cada formulario y sucursal, elegir Semanal/Quincenal/Mensual.
function SupervisionScheduleEditor({
  templates, branches, schedules, savingSchedule, onSetFrequency
}: {
  templates: AuditTemplate[];
  branches: Branch[];
  schedules: Record<string, string>;
  savingSchedule: string | null;
  onSetFrequency: (checklistId: string, branchId: string, frequency: string) => void;
}) {
  return (
    <div className="bg-bg-sidebar border border-border-dim rounded-lg p-5 shadow-xl space-y-4">
      <div>
        <h3 className="text-xs font-black uppercase text-brand-500 tracking-widest flex items-center gap-2">
          🗓️ Periodicidad de Supervisiones
        </h3>
        <p className="text-[10px] text-text-dim uppercase font-bold mt-1 tracking-wide">
          Definí cada cuánto debe realizarse cada formulario en cada sucursal. Si está vencida, se avisa en "Supervisiones" de Líderes Operativos.
        </p>
      </div>

      {templates.length === 0 ? (
        <p className="text-[10px] text-text-dim italic uppercase opacity-60 py-4">No hay formularios guardados todavía.</p>
      ) : (
        <div className="space-y-5">
          {templates.map(t => (
            <div key={t.id} className="border border-border-dim rounded-lg overflow-hidden">
              <div className="bg-bg-accent px-4 py-2.5 border-b border-border-dim">
                <span className="text-[11px] font-black uppercase text-text-main tracking-tight">{t.name}</span>
                {t.category && <span className="ml-2 text-[8px] text-text-dim uppercase">{t.category}</span>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
                {branches.map(b => {
                  const key = `${t.id}|${b.id}`;
                  const value = schedules[key] || '';
                  const isSaving = savingSchedule === key;
                  return (
                    <div key={b.id} className="flex items-center justify-between gap-2 bg-bg-accent/30 rounded border border-border-dim/40 px-3 py-2">
                      <span className="text-[9px] font-bold text-text-dim uppercase truncate">{b.name}</span>
                      <select
                        value={value}
                        disabled={isSaving}
                        onChange={(e) => onSetFrequency(t.id, b.id, e.target.value)}
                        className={cn(
                          "bg-bg-card border border-border-dim rounded px-2 py-1 text-[9px] font-black uppercase shrink-0",
                          value ? "text-brand-500" : "text-text-dim",
                          isSaving && "opacity-50"
                        )}
                      >
                        <option value="">— Sin definir</option>
                        <option value="semanal">Semanal</option>
                        <option value="quincenal">Quincenal</option>
                        <option value="mensual">Mensual</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Lista de supervisiones realizadas: fecha, sucursal, puntaje y banderas.
function SupervisionHistoryList({ responses, branches, canDelete, onDelete }: { responses: any[], branches: Branch[], canDelete?: boolean, onDelete?: (id: string, label: string) => void }) {
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');

  const branchName = (id: string) => branches.find(b => b.id === id)?.name || id || 'Desconocida';

  const monthsAvailable = React.useMemo(() => {
    const ms = Array.from(new Set(responses.map(r => (r.date || '').substring(0, 7)).filter(Boolean))).sort().reverse();
    return ms;
  }, [responses]);

  const monthLabel = (m: string) => {
    if (!m) return '—';
    const [y, mo] = m.split('-');
    const names = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return `${names[Number(mo) - 1] || mo} ${y}`;
  };

  const filtered = React.useMemo(() => {
    return [...responses]
      .filter(r => filterBranch === 'all' || r.branch_id === filterBranch)
      .filter(r => filterMonth === 'all' || (r.date || '').substring(0, 7) === filterMonth)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [responses, filterBranch, filterMonth]);

  return (
    <div className="bg-bg-sidebar border border-border-dim rounded-lg p-5 shadow-xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xs font-black uppercase text-brand-500 tracking-widest flex items-center gap-2">
          <ClipboardCheck size={15} /> Supervisiones Realizadas ({filtered.length})
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={filterBranch}
            onChange={(e) => setFilterBranch(e.target.value)}
            className="bg-bg-card border border-border-dim rounded px-3 py-1.5 text-[10px] font-black uppercase text-brand-500"
          >
            <option value="all">Todas las Sucursales</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="bg-bg-card border border-border-dim rounded px-3 py-1.5 text-[10px] font-mono"
          >
            <option value="all">Todos los meses</option>
            {monthsAvailable.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border-dim">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-bg-accent text-left text-text-dim font-bold uppercase tracking-widest border-b border-border-dim">
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Sucursal</th>
              <th className="px-4 py-3 text-center">Puntaje</th>
              <th className="px-4 py-3 text-center">🔴 Rojas</th>
              <th className="px-4 py-3 text-center">🟡 Amarillas</th>
              <th className="px-4 py-3 text-center">🟢 Verdes</th>
              {canDelete && <th className="px-4 py-3 text-center">Acción</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-dim/40">
            {filtered.length === 0 ? (
              <tr><td colSpan={canDelete ? 7 : 6} className="px-4 py-12 text-center text-text-dim italic uppercase opacity-50">No hay supervisiones cargadas para este filtro</td></tr>
            ) : filtered.map(r => {
              const flags = r.scores?.flags || {};
              const score = Number(r.total_score) || 0;
              return (
                <tr key={r.id} className="hover:bg-bg-accent/40">
                  <td className="px-4 py-3 font-mono text-text-dim">{r.date}</td>
                  <td className="px-4 py-3 font-black text-text-main uppercase">{branchName(r.branch_id)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      "font-black px-2 py-0.5 rounded",
                      score >= 8 ? "text-emerald-500" : score >= 6 ? "text-yellow-500" : "text-red-500"
                    )}>{score.toFixed(1)}/10</span>
                  </td>
                  <td className="px-4 py-3 text-center font-black text-red-500">{flags.red || 0}</td>
                  <td className="px-4 py-3 text-center font-black text-yellow-500">{flags.yellow || 0}</td>
                  <td className="px-4 py-3 text-center font-black text-emerald-500">{flags.green || 0}</td>
                  {canDelete && (
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => onDelete && onDelete(r.id, `${branchName(r.branch_id)} · ${r.date}`)}
                        className="text-text-dim hover:text-red-500 transition-colors p-1"
                        title="Eliminar supervisión"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
