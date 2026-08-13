/**
 * EVALUACIÓN DE DUEÑOS
 *
 * Una evaluación que ejecutan los dueños. Al empezar se elige la SUCURSAL:
 *   - Almacén Central       -> preguntas de la sección "Almacén".
 *   - Resto de sucursales   -> se elige "Servicio" o "Estado General".
 *
 * Todas las preguntas tienen 3 respuestas fijas: Cumple / Advertencia / No cumple
 * (No cumple = Bandera Negra). Cada respuesta puede llevar una nota de texto y una
 * foto. Cuando es "No cumple", se elige el responsable (Encargado / Jefe de Cocina
 * / Ambos), para que después sume como bandera negra en el premio (etapa siguiente).
 *
 * Tablas: evaluacion_duenos_questions (estructura), evaluacion_duenos_responses.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Landmark, Plus, Trash2, Pencil, X, Save, Loader2, CalendarDays, Building2,
  ClipboardCheck, Settings2, ListChecks, Camera, Image as ImageIcon, Flag,
  CheckCircle2, AlertTriangle, Eye, FileText
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { Branch } from '../types';
import SupervisionPhotoThumb from './SupervisionPhotoThumb';

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtDMY = (iso?: string | null) => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

type Grupo = 'almacen' | 'servicio' | 'estado_general';
const SECCIONES: { id: Grupo; label: string }[] = [
  { id: 'almacen', label: 'Almacén Central' },
  { id: 'servicio', label: 'Servicio' },
  { id: 'estado_general', label: 'Estado General' },
];
const seccionLabel = (g: string) => SECCIONES.find(s => s.id === g)?.label || g;

type Status = 'cumple' | 'advertencia' | 'no_cumple';
const OPCIONES: { id: Status; label: string }[] = [
  { id: 'cumple', label: 'Cumple' },
  { id: 'advertencia', label: 'Advertencia' },
  { id: 'no_cumple', label: 'No cumple' },
];
type Target = 'encargado' | 'cocina' | 'ambos';
const TARGETS: { id: Target; label: string }[] = [
  { id: 'encargado', label: 'Encargado' },
  { id: 'cocina', label: 'Jefe de Cocina' },
  { id: 'ambos', label: 'Ambos' },
];

interface Question { id: string; grupo: Grupo; text: string; sort_order: number; }
interface Answer { status?: Status; note?: string; photo?: string; target?: Target; }
interface Respuesta {
  id: string; branch_id: string; date: string; seccion: Grupo;
  answers: Record<string, Answer>; notes?: string | null; created_by?: string | null;
}

// La sucursal Almacén Central se detecta por el nombre.
const esAlmacen = (b?: Branch | null) => /almac/i.test(b?.name || '');

export default function EvaluacionDuenosView({
  branches, currentUserName, isAdmin, isReadOnly
}: {
  branches: Branch[]; currentUserName?: string; currentUserRole?: string; isAdmin?: boolean; isReadOnly?: boolean;
}) {
  const [tab, setTab] = useState<'evaluar' | 'resultados' | 'config'>('evaluar');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [respuestas, setRespuestas] = useState<Respuesta[]>([]);
  const [loading, setLoading] = useState(true);

  const activeBranches = useMemo(() => branches.filter(b => b.id !== 'all' && b.id !== 'virtual'), [branches]);
  const branchName = (id: string) => branches.find(b => b.id === id)?.name || id;

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: qs }, { data: rs }] = await Promise.all([
        supabase.from('evaluacion_duenos_questions').select('*').order('grupo').order('sort_order'),
        supabase.from('evaluacion_duenos_responses').select('*').order('date', { ascending: false }),
      ]);
      setQuestions(((qs as any[]) || []).map(q => ({ id: q.id, grupo: q.grupo, text: q.text || '', sort_order: q.sort_order || 0 })));
      setRespuestas(((rs as any[]) || []).map(r => ({
        id: r.id, branch_id: r.branch_id, date: r.date, seccion: r.seccion,
        answers: (r.answers && typeof r.answers === 'object') ? r.answers : {},
        notes: r.notes, created_by: r.created_by,
      })));
    } catch (e) { console.error('Error cargando Evaluación de Dueños:', e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const questionsByGroup = (g: Grupo) => questions.filter(q => q.grupo === g).sort((a, b) => a.sort_order - b.sort_order);

  // PDF con el cuestionario que auditan los dueños (por sección). Sirve de referencia
  // para el equipo y como planilla imprimible (columnas Cumple / Advertencia / No cumple).
  const exportPreguntasPDF = () => {
    const M = 14, PW = 210, PH = 297, CW = PW - 2 * M;
    const BRAND: [number, number, number] = [193, 18, 31];
    const DARK: [number, number, number] = [33, 37, 41];
    const GRAY: [number, number, number] = [110, 116, 122];
    const F = 'helvetica';

    const doc = new jsPDF();
    doc.setFillColor(...BRAND); doc.rect(0, 0, PW, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont(F, 'bold'); doc.setFontSize(9); doc.text('GESTIÓN CRAFT', M, 12);
    doc.setFontSize(15); doc.text('EVALUACIÓN DE DUEÑOS', M, 21);
    doc.setFont(F, 'normal'); doc.setFontSize(8); doc.text('Cuestionario de auditoría', M, 26.5);
    doc.setFont(F, 'bold'); doc.setFontSize(9); doc.text(fmtDMY(todayISO()), PW - M, 20, { align: 'right' });

    let y = 40;
    doc.setFont(F, 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAY);
    const intro = doc.splitTextToSize('Estas son las preguntas que los dueños auditan en cada sucursal. Cada punto se evalúa como Cumple, Advertencia o No cumple (Bandera Negra).', CW);
    doc.text(intro, M, y); y += intro.length * 4.6 + 4;

    const seccionesConPreguntas = SECCIONES.filter(sec => questionsByGroup(sec.id).length > 0);
    if (seccionesConPreguntas.length === 0) {
      doc.setTextColor(...GRAY); doc.setFontSize(10);
      doc.text('Todavía no hay preguntas cargadas.', M, y);
    }

    seccionesConPreguntas.forEach(sec => {
      const qs = questionsByGroup(sec.id);
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFont(F, 'bold'); doc.setFontSize(12); doc.setTextColor(...DARK);
      doc.text(sec.label.toUpperCase(), M, y);
      doc.setFont(F, 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
      doc.text(`${qs.length} pregunta(s)`, PW - M, y, { align: 'right' });
      y += 2;

      const rows = qs.map((q, i) => [String(i + 1), q.text, '', '', '']);
      autoTable(doc, {
        head: [['N°', 'Pregunta', 'Cumple', 'Advert.', 'No cumple']],
        body: rows,
        startY: y + 2, margin: { left: M, right: M },
        styles: { fontSize: 9, cellPadding: 2.5, textColor: DARK as any, lineColor: [235, 236, 238] as any, lineWidth: 0.2, valign: 'middle' },
        headStyles: { fillColor: BRAND as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 8, halign: 'center' },
        alternateRowStyles: { fillColor: [249, 250, 251] as any },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: CW - 10 - 3 * 18 },
          2: { cellWidth: 18, halign: 'center' },
          3: { cellWidth: 18, halign: 'center' },
          4: { cellWidth: 18, halign: 'center' },
        },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    });

    const pc = doc.getNumberOfPages();
    for (let p = 1; p <= pc; p++) {
      doc.setPage(p);
      doc.setFont(F, 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
      doc.text('Evaluación de Dueños · Cuestionario de auditoría', M, PH - 8);
      doc.text(`Página ${p} de ${pc}`, PW - M, PH - 8, { align: 'right' });
    }
    doc.save(`evaluacion_duenos_cuestionario_${todayISO()}.pdf`);
  };

  // ───────── Configuración (estructura) ─────────
  const [nuevaPregunta, setNuevaPregunta] = useState<Record<Grupo, string>>({ almacen: '', servicio: '', estado_general: '' });
  const [editQ, setEditQ] = useState<Question | null>(null);
  const [savingQ, setSavingQ] = useState(false);

  const agregarPregunta = async (g: Grupo) => {
    const text = (nuevaPregunta[g] || '').trim();
    if (!text) return;
    setSavingQ(true);
    try {
      const orden = (questionsByGroup(g).slice(-1)[0]?.sort_order || 0) + 1;
      const { error } = await supabase.from('evaluacion_duenos_questions').insert({ id: uid('edq'), grupo: g, text, sort_order: orden });
      if (error) throw error;
      setNuevaPregunta(prev => ({ ...prev, [g]: '' }));
      await load();
    } catch (e: any) { alert('No se pudo agregar: ' + (e?.message || e)); }
    setSavingQ(false);
  };
  const guardarEdicion = async () => {
    if (!editQ) return;
    if (!editQ.text.trim()) { alert('La pregunta no puede quedar vacía.'); return; }
    setSavingQ(true);
    try {
      const { error } = await supabase.from('evaluacion_duenos_questions').update({ text: editQ.text.trim() }).eq('id', editQ.id);
      if (error) throw error;
      setEditQ(null);
      await load();
    } catch (e: any) { alert('No se pudo guardar: ' + (e?.message || e)); }
    setSavingQ(false);
  };
  const borrarPregunta = async (q: Question) => {
    if (!window.confirm(`¿Eliminar la pregunta "${q.text}"?`)) return;
    await supabase.from('evaluacion_duenos_questions').delete().eq('id', q.id);
    await load();
  };

  // ───────── Ejecución ─────────
  const [evalBranchId, setEvalBranchId] = useState<string>('');
  const [evalSeccion, setEvalSeccion] = useState<Grupo | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string>>({});
  const [photoBusy, setPhotoBusy] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const evalBranch = branches.find(b => b.id === evalBranchId) || null;

  // Al elegir sucursal: si es Almacén, la sección queda fija; si no, se resetea para elegir.
  const elegirSucursal = (id: string) => {
    setEvalBranchId(id);
    setAnswers({});
    setPhotoPreviews({});
    setNotes('');
    const b = branches.find(x => x.id === id) || null;
    setEvalSeccion(esAlmacen(b) ? 'almacen' : null);
  };
  const elegirSeccion = (g: Grupo) => { setEvalSeccion(g); setAnswers({}); setPhotoPreviews({}); };

  const setAnswer = (qid: string, patch: Partial<Answer>) =>
    setAnswers(prev => ({ ...prev, [qid]: { ...prev[qid], ...patch } }));

  const sanitizeName = (name: string) =>
    name.normalize('NFD').replace(/[^\x00-\x7F]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'foto';

  const subirFoto = async (qid: string, file: File | null) => {
    if (!file || !evalBranchId) return;
    if (!file.type.startsWith('image/')) { alert('Subí una imagen (JPG, PNG, etc.).'); return; }
    if (file.size > 10 * 1024 * 1024) { alert('La imagen no puede superar los 10 MB.'); return; }
    setPhotoBusy(p => ({ ...p, [qid]: true }));
    try {
      const path = `evaluacion_duenos/${evalBranchId}/${todayISO()}_${qid}_${Date.now()}_${sanitizeName(file.name)}`;
      const { error } = await supabase.storage.from('documents').upload(path, file);
      if (error) throw error;
      setPhotoPreviews(prev => { if (prev[qid]) URL.revokeObjectURL(prev[qid]); return { ...prev, [qid]: URL.createObjectURL(file) }; });
      setAnswer(qid, { photo: path });
    } catch (e: any) { alert('No se pudo subir la foto: ' + (e?.message || e)); }
    finally { setPhotoBusy(p => ({ ...p, [qid]: false })); }
  };
  const quitarFoto = async (qid: string) => {
    const path = answers[qid]?.photo;
    if (path) { try { await supabase.storage.from('documents').remove([path]); } catch { /* ignore */ } }
    setAnswer(qid, { photo: undefined });
    setPhotoPreviews(prev => { if (prev[qid]) URL.revokeObjectURL(prev[qid]); const n = { ...prev }; delete n[qid]; return n; });
  };

  const preguntasEval = evalSeccion ? questionsByGroup(evalSeccion) : [];

  const guardarEvaluacion = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    if (!evalBranchId) { alert('Elegí la sucursal.'); return; }
    if (!evalSeccion) { alert('Elegí el tipo de evaluación (Servicio o Estado General).'); return; }
    const sinResponder = preguntasEval.filter(q => !answers[q.id]?.status);
    if (sinResponder.length > 0) { alert(`Faltan responder ${sinResponder.length} pregunta(s).`); return; }
    const noCumpleSinResp = preguntasEval.filter(q => answers[q.id]?.status === 'no_cumple' && !answers[q.id]?.target);
    if (noCumpleSinResp.length > 0) { alert(`Hay ${noCumpleSinResp.length} "No cumple" sin responsable asignado.`); return; }
    setSaving(true);
    try {
      const payload = {
        id: uid('edr'), branch_id: evalBranchId, date: todayISO(), seccion: evalSeccion,
        answers, notes: notes.trim() || null, created_by: currentUserName || '—',
      };
      const { error } = await supabase.from('evaluacion_duenos_responses').insert(payload);
      if (error) throw error;
      const nn = preguntasEval.filter(q => answers[q.id]?.status === 'no_cumple').length;
      alert(`Evaluación guardada.${nn > 0 ? ` Se registraron ${nn} bandera(s) negra(s).` : ''}`);
      setEvalBranchId(''); setEvalSeccion(null); setAnswers({}); setPhotoPreviews({}); setNotes('');
      setTab('resultados');
      await load();
    } catch (e: any) { alert('Error al guardar: ' + (e?.message || e)); }
    setSaving(false);
  };

  // ───────── Resultados ─────────
  const [expanded, setExpanded] = useState<string | null>(null);
  const qMap = useMemo(() => Object.fromEntries(questions.map(q => [q.id, q])), [questions]);
  const contarNoCumple = (r: Respuesta) => Object.values(r.answers).filter(a => a?.status === 'no_cumple').length;

  const borrarRespuesta = async (r: Respuesta) => {
    if (!isAdmin) return;
    if (!window.confirm(`¿Eliminar la evaluación de ${branchName(r.branch_id)} del ${fmtDMY(r.date)}?`)) return;
    await supabase.from('evaluacion_duenos_responses').delete().eq('id', r.id);
    await load();
  };

  const statusChip = (s?: Status) => {
    if (s === 'cumple') return <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">Cumple</span>;
    if (s === 'advertencia') return <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30">Advertencia</span>;
    if (s === 'no_cumple') return <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-text-main/90 text-bg-sidebar border border-text-main">⚫ No cumple</span>;
    return null;
  };

  // Botón de opción en la ejecución
  const optionBtn = (qid: string, o: { id: Status; label: string }) => {
    const sel = answers[qid]?.status === o.id;
    const cls = o.id === 'cumple'
      ? (sel ? 'bg-emerald-500 border-emerald-500 text-white' : 'hover:border-emerald-500/60')
      : o.id === 'advertencia'
      ? (sel ? 'bg-amber-500 border-amber-500 text-white' : 'hover:border-amber-500/60')
      : (sel ? 'bg-text-main border-text-main text-bg-sidebar' : 'hover:border-text-main/60');
    return (
      <button key={o.id} type="button" onClick={() => setAnswer(qid, { status: o.id, target: o.id === 'no_cumple' ? (answers[qid]?.target || 'ambos') : undefined })}
        className={cn('flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md border text-[10px] font-black uppercase tracking-wide transition-all bg-bg-sidebar border-border-dim text-text-dim', cls)}>
        {o.id === 'no_cumple' && <Flag size={11} />}{o.label}
        {o.id === 'no_cumple' && <span className="text-[7px] opacity-80">(B. Negra)</span>}
      </button>
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* Encabezado */}
      <div className="bg-bg-card border border-border-dim rounded-lg p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-brand-500/10 p-2.5 rounded-lg"><Landmark className="text-brand-500" size={20} /></div>
            <div>
              <h2 className="text-base font-black uppercase text-text-main tracking-wider">Evaluación de Dueños</h2>
              <p className="text-[9px] text-text-dim uppercase font-bold">Auditoría por sucursal · Cumple / Advertencia / No cumple (Bandera Negra)</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
          <button onClick={exportPreguntasPDF} title="Descargar el cuestionario en PDF"
            className="flex items-center gap-1.5 px-3 py-2 rounded text-[9px] font-black uppercase tracking-widest border border-border-dim text-text-dim hover:border-brand-500 hover:text-brand-500 transition-all">
            <FileText size={12} /> PDF preguntas
          </button>
          <div className="flex gap-1 bg-bg-accent p-1 rounded-lg">
            <button onClick={() => setTab('evaluar')} className={cn('px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5', tab === 'evaluar' ? 'bg-brand-500 text-white' : 'text-text-dim hover:text-text-main')}><ClipboardCheck size={12} /> Evaluar</button>
            <button onClick={() => setTab('resultados')} className={cn('px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5', tab === 'resultados' ? 'bg-brand-500 text-white' : 'text-text-dim hover:text-text-main')}><ListChecks size={12} /> Resultados</button>
            {isAdmin && <button onClick={() => setTab('config')} className={cn('px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5', tab === 'config' ? 'bg-brand-500 text-white' : 'text-text-dim hover:text-text-main')}><Settings2 size={12} /> Preguntas</button>}
          </div>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-[10px] font-bold uppercase text-text-dim py-10">Cargando…</p>
      ) : tab === 'config' && isAdmin ? (
        /* ───────── CONFIGURAR PREGUNTAS ───────── */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {SECCIONES.map(sec => (
            <div key={sec.id} className="bg-bg-sidebar border border-border-dim rounded-xl p-4 space-y-3">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-brand-500 flex items-center gap-2">
                <Building2 size={13} /> {sec.label}
                <span className="text-[8px] text-text-dim ml-auto">{questionsByGroup(sec.id).length}</span>
              </h3>
              {!isReadOnly && (
                <div className="flex gap-2">
                  <input value={nuevaPregunta[sec.id]} onChange={e => setNuevaPregunta(prev => ({ ...prev, [sec.id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && agregarPregunta(sec.id)}
                    placeholder="Nueva pregunta…" className="flex-1 bg-bg-card border border-border-dim rounded px-2.5 py-2 text-[10px] text-text-main outline-none focus:border-brand-500" />
                  <button onClick={() => agregarPregunta(sec.id)} disabled={savingQ} className="bg-brand-500 text-white px-3 rounded text-[10px] font-black uppercase hover:bg-brand-600 disabled:opacity-50"><Plus size={14} /></button>
                </div>
              )}
              <div className="space-y-1.5 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
                {questionsByGroup(sec.id).length === 0 ? (
                  <p className="text-[9px] text-text-dim italic uppercase text-center py-4">Sin preguntas.</p>
                ) : questionsByGroup(sec.id).map((q, i) => (
                  <div key={q.id} className="flex items-start gap-2 bg-bg-accent/40 border border-border-dim rounded p-2.5">
                    <span className="text-[9px] font-black text-brand-500 mt-0.5">{i + 1}.</span>
                    {editQ?.id === q.id ? (
                      <input autoFocus value={editQ.text} onChange={e => setEditQ({ ...editQ, text: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') guardarEdicion(); if (e.key === 'Escape') setEditQ(null); }}
                        className="flex-1 bg-bg-card border border-brand-500 rounded px-2 py-1 text-[10px] text-text-main outline-none" />
                    ) : (
                      <p className="flex-1 text-[10px] font-bold text-text-main uppercase leading-snug">{q.text}</p>
                    )}
                    {!isReadOnly && (
                      <div className="flex items-center gap-1 shrink-0">
                        {editQ?.id === q.id ? (
                          <button onClick={guardarEdicion} className="p-1 text-emerald-500"><Save size={13} /></button>
                        ) : (
                          <button onClick={() => setEditQ(q)} className="p-1 text-text-dim hover:text-brand-500"><Pencil size={13} /></button>
                        )}
                        <button onClick={() => borrarPregunta(q)} className="p-1 text-text-dim hover:text-red-500"><Trash2 size={13} /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : tab === 'resultados' ? (
        /* ───────── RESULTADOS ───────── */
        respuestas.length === 0 ? (
          <p className="text-center text-[10px] font-bold uppercase text-text-dim py-12">Todavía no hay evaluaciones cargadas.</p>
        ) : (
          <div className="space-y-2">
            {respuestas.map(r => {
              const nc = contarNoCumple(r);
              const isExp = expanded === r.id;
              return (
                <div key={r.id} className="bg-bg-sidebar border border-border-dim rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between gap-3 p-4 cursor-pointer" onClick={() => setExpanded(isExp ? null : r.id)}>
                    <div className="min-w-0">
                      <span className="text-[12px] font-black uppercase text-text-main flex items-center gap-1.5 flex-wrap">
                        <CalendarDays size={13} className="text-brand-500" /> {branchName(r.branch_id)}
                        <span className="text-[8px] text-text-dim">· {seccionLabel(r.seccion)} · {fmtDMY(r.date)}</span>
                      </span>
                      <p className="text-[9px] font-bold uppercase text-text-dim mt-1">
                        {r.created_by ? `Por ${r.created_by} · ` : ''}
                        {nc > 0
                          ? <span className="text-text-main">{nc} bandera(s) negra(s)</span>
                          : <span className="text-emerald-500">Sin banderas negras</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {nc > 0 && <span className="text-[9px] font-black uppercase px-2 py-1 rounded bg-text-main/90 text-bg-sidebar">{nc} ⚫</span>}
                      {isAdmin && <button onClick={e => { e.stopPropagation(); borrarRespuesta(r); }} className="p-1.5 text-text-dim hover:text-red-500"><Trash2 size={14} /></button>}
                      <Eye size={15} className="text-text-dim" />
                    </div>
                  </div>
                  {isExp && (
                    <div className="border-t border-border-dim p-4 space-y-2 bg-bg-accent/20">
                      {questionsByGroup(r.seccion).length === 0 && Object.keys(r.answers).length === 0 && (
                        <p className="text-[9px] text-text-dim italic uppercase">Sin detalle.</p>
                      )}
                      {(Object.entries(r.answers) as [string, Answer][]).map(([qid, a]) => (
                        <div key={qid} className={cn('rounded-lg border p-3', a.status === 'no_cumple' ? 'border-text-main/40 bg-bg-card' : 'border-border-dim bg-bg-card/60')}>
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-[10px] font-bold text-text-main uppercase flex-1">{qMap[qid]?.text || '(pregunta eliminada)'}</p>
                            {statusChip(a.status)}
                          </div>
                          {a.status === 'no_cumple' && a.target && (
                            <p className="text-[8px] font-black uppercase text-text-dim mt-1">Responsable: {TARGETS.find(t => t.id === a.target)?.label}</p>
                          )}
                          {a.note && <p className="text-[10px] text-text-main mt-1.5 whitespace-pre-wrap">📝 {a.note}</p>}
                          {a.photo && <div className="mt-2"><SupervisionPhotoThumb path={a.photo} /></div>}
                        </div>
                      ))}
                      {r.notes && (
                        <div className="rounded-lg border border-border-dim bg-bg-card/60 p-3">
                          <p className="text-[8px] font-black uppercase tracking-widest text-text-dim">Observaciones generales</p>
                          <p className="text-[10px] text-text-main mt-1 whitespace-pre-wrap">{r.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* ───────── EVALUAR ───────── */
        <div className="space-y-5">
          {/* Paso 1: Sucursal */}
          <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-brand-500 flex items-center gap-2"><Building2 size={14} /> 1 · ¿Qué sucursal estás evaluando?</p>
            <div className="flex flex-wrap gap-2">
              {activeBranches.map(b => (
                <button key={b.id} onClick={() => elegirSucursal(b.id)}
                  className={cn('px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-wide transition-all',
                    evalBranchId === b.id ? 'bg-brand-500 border-brand-500 text-white' : 'bg-bg-accent border-border-dim text-text-dim hover:border-brand-500/50')}>
                  {b.name}
                </button>
              ))}
            </div>
          </div>

          {/* Paso 2: Tipo (solo si no es Almacén) */}
          {evalBranch && !esAlmacen(evalBranch) && (
            <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-brand-500 flex items-center gap-2"><ListChecks size={14} /> 2 · ¿Qué tipo de evaluación?</p>
              <div className="flex flex-wrap gap-2">
                {(['servicio', 'estado_general'] as Grupo[]).map(g => (
                  <button key={g} onClick={() => elegirSeccion(g)}
                    className={cn('px-4 py-2 rounded-lg border text-[10px] font-black uppercase tracking-wide transition-all',
                      evalSeccion === g ? 'bg-brand-500 border-brand-500 text-white' : 'bg-bg-accent border-border-dim text-text-dim hover:border-brand-500/50')}>
                    {seccionLabel(g)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {evalBranch && esAlmacen(evalBranch) && (
            <div className="flex items-center gap-2 bg-brand-500/5 border border-brand-500/20 rounded-lg px-4 py-2.5">
              <Building2 size={14} className="text-brand-500" />
              <span className="text-[10px] font-black uppercase tracking-wider text-text-dim">Almacén Central · se usan las preguntas de la sección Almacén.</span>
            </div>
          )}

          {/* Paso 3: Preguntas */}
          {evalSeccion && (
            preguntasEval.length === 0 ? (
              <div className="bg-bg-sidebar border border-dashed border-border-dim rounded-xl p-8 text-center">
                <AlertTriangle size={22} className="text-amber-500 mx-auto mb-2" />
                <p className="text-[10px] font-black uppercase text-text-main">No hay preguntas cargadas para "{seccionLabel(evalSeccion)}".</p>
                {isAdmin && <p className="text-[9px] text-text-dim font-bold uppercase mt-1">Cargalas en la pestaña "Preguntas".</p>}
              </div>
            ) : (
              <div className="space-y-3">
                {preguntasEval.map((q, idx) => {
                  const a = answers[q.id] || {};
                  return (
                    <div key={q.id} className="bg-bg-sidebar border border-border-dim rounded-xl p-4 space-y-3">
                      <p className="text-[11px] font-black text-text-main uppercase flex items-start gap-2">
                        <span className="text-brand-500 opacity-60 font-mono">{String(idx + 1).padStart(2, '0')}</span> {q.text}
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {OPCIONES.map(o => optionBtn(q.id, o))}
                      </div>

                      {/* Responsable de la bandera negra */}
                      {a.status === 'no_cumple' && (
                        <div className="bg-text-main/5 border border-text-main/25 rounded-lg p-3">
                          <p className="text-[9px] font-black uppercase tracking-widest text-text-main mb-2 flex items-center gap-1.5"><Flag size={11} /> ¿A quién corresponde esta bandera negra?</p>
                          <div className="grid grid-cols-3 gap-2">
                            {TARGETS.map(t => {
                              const sel = (a.target || 'ambos') === t.id;
                              return (
                                <button key={t.id} type="button" onClick={() => setAnswer(q.id, { target: t.id })}
                                  className={cn('px-2 py-2 rounded-md border text-[9px] font-black uppercase tracking-wider transition-all',
                                    sel ? 'bg-text-main border-text-main text-bg-sidebar' : 'bg-bg-accent border-border-dim text-text-dim hover:border-text-main/50')}>
                                  {t.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Nota + foto (siempre disponibles) */}
                      <textarea value={a.note || ''} onChange={e => setAnswer(q.id, { note: e.target.value })} rows={2}
                        placeholder="Nota (opcional): qué observaste…"
                        className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none focus:border-brand-500 resize-y placeholder:text-text-dim/60" />

                      <div className="flex items-center gap-2 flex-wrap">
                        {(photoPreviews[q.id] || a.photo) ? (
                          <div className="flex items-center gap-2">
                            {photoPreviews[q.id]
                              ? <img src={photoPreviews[q.id]} alt="Foto" className="w-14 h-14 object-cover rounded border border-border-dim" />
                              : <SupervisionPhotoThumb path={a.photo!} />}
                            <button type="button" onClick={() => quitarFoto(q.id)} className="text-[9px] font-black uppercase text-red-500 hover:text-red-600 flex items-center gap-1"><X size={12} /> Quitar foto</button>
                          </div>
                        ) : photoBusy[q.id] ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-black uppercase text-text-dim"><Loader2 size={12} className="animate-spin" /> Subiendo…</span>
                        ) : (
                          <>
                            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-border-dim text-[9px] font-black uppercase tracking-wider text-text-dim hover:border-brand-500 hover:text-brand-500 cursor-pointer transition-all">
                              <Camera size={12} /> Tomar foto
                              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { subirFoto(q.id, e.target.files?.[0] || null); e.currentTarget.value = ''; }} />
                            </label>
                            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-border-dim text-[9px] font-black uppercase tracking-wider text-text-dim hover:border-brand-500 hover:text-brand-500 cursor-pointer transition-all">
                              <ImageIcon size={12} /> Galería
                              <input type="file" accept="image/*" className="hidden" onChange={e => { subirFoto(q.id, e.target.files?.[0] || null); e.currentTarget.value = ''; }} />
                            </label>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}

                <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 space-y-2">
                  <label className="text-[10px] font-black text-text-dim uppercase tracking-widest">Observaciones generales</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                    className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500 resize-y" />
                </div>

                {!isReadOnly && (
                  <div className="flex justify-end">
                    <button onClick={guardarEvaluacion} disabled={saving}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-8 py-3 rounded-lg font-black uppercase text-[12px] shadow-lg shadow-emerald-500/20">
                      {saving ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />} Guardar evaluación
                    </button>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}
    </motion.div>
  );
}
