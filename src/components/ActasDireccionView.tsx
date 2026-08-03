/**
 * ACTAS DE DIRECCIÓN — Gerencia General
 *
 * Registro de las reuniones de dirección con los departamentos: temas tratados
 * (con items), y por cada item tratado se puede marcar "Charlado" y cargar la
 * conclusión / compromiso, con un responsable (usuario de la app) y fecha límite.
 * Al asignar un responsable se genera automáticamente una TAREA en su módulo de
 * Tareas Pendientes; cuando la persona la marca hecha allá, acá se refleja como
 * "Realizado".
 *
 * Tablas: direccion_areas, direccion_actas (temas jsonb con items), tasks.
 * direccion_compromisos queda solo para los compromisos cargados con el formato
 * anterior (se muestran en el tablero pero no dentro del acta).
 */
import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Landmark, Plus, Trash2, Pencil, X, Save, Loader2, CalendarDays, Users, ListChecks,
  ClipboardList, FileText, CheckCircle2, Settings2, CheckSquare, Square, User as UserIcon
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtDMY = (iso?: string | null) => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

interface Area { id: string; name: string; sort_order?: number; }
interface AppUser { id: string; name: string; }
interface TemaItem {
  id: string;
  texto: string;                 // el punto tratado dentro del tema
  charlado: boolean;             // se tilda cuando ya se habló
  conclusion: string;            // conclusión / compromiso (aparece al tildar)
  responsableId: string | null;  // id del usuario responsable (genera la tarea)
  responsableName: string | null;
  dueDate: string | null;
  taskId: string | null;         // id de la tarea creada en 'tasks'
}
interface Tema { titulo: string; detalle: string; items: TemaItem[]; }
interface Acta {
  id: string; date: string; participants: string[]; temas: Tema[]; notes: string | null;
  created_by?: string | null;
}
// Compromiso "viejo" (formato anterior) — solo lectura en el tablero
interface Compromiso {
  id: string; acta_id: string; acta_date: string | null; tema: string | null;
  descripcion: string; responsable: string | null; due_date: string | null; status: string;
}
// Fila unificada del tablero
interface BoardRow {
  key: string; acta_id: string; acta_date: string | null; tema: string | null;
  descripcion: string; responsable: string | null; due_date: string | null;
  status: string; source: 'item' | 'legacy';
}

const STATUS = [
  { id: 'pendiente', label: 'Pendiente', color: 'text-red-500 bg-red-500/10 border-red-500/30' },
  { id: 'en_curso', label: 'En curso', color: 'text-amber-500 bg-amber-500/10 border-amber-500/30' },
  { id: 'resuelto', label: 'Resuelto', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30' },
];
const stInfo = (s: string) => STATUS.find(x => x.id === s) || STATUS[0];

// Normaliza un tema viejo (sin items) al nuevo formato
const normTema = (t: any): Tema => ({
  titulo: t?.titulo || '',
  detalle: t?.detalle || '',
  items: Array.isArray(t?.items) ? t.items.map((it: any) => ({
    id: it.id || uid('it'),
    texto: it.texto || '',
    charlado: !!it.charlado,
    conclusion: it.conclusion || '',
    responsableId: it.responsableId ?? null,
    responsableName: it.responsableName ?? null,
    dueDate: it.dueDate ?? null,
    taskId: it.taskId ?? null,
  })) : [],
});

export default function ActasDireccionView({ currentUserName, isReadOnly }: { currentUserName?: string; isReadOnly?: boolean }) {
  const [tab, setTab] = useState<'actas' | 'compromisos' | 'areas'>('actas');
  const [areas, setAreas] = useState<Area[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [actas, setActas] = useState<Acta[]>([]);
  const [compromisos, setCompromisos] = useState<Compromiso[]>([]); // legacy
  const [taskStatus, setTaskStatus] = useState<Record<string, string>>({}); // taskId -> 'pending'|'done'
  const [loading, setLoading] = useState(false);

  // Editor de acta
  const [editing, setEditing] = useState<Acta | null>(null);
  const [deletedTaskIds, setDeletedTaskIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Filtros del tablero
  const [fResp, setFResp] = useState('');
  const [fEstado, setFEstado] = useState('pendientes'); // pendientes | todos | resueltos

  // Alta de área
  const [nuevaArea, setNuevaArea] = useState('');

  const cargar = async () => {
    setLoading(true);
    try {
      const [{ data: ar }, { data: ac }, { data: co }, { data: us }] = await Promise.all([
        supabase.from('direccion_areas').select('*').order('sort_order').order('name'),
        supabase.from('direccion_actas').select('*').order('date', { ascending: false }),
        supabase.from('direccion_compromisos').select('*').order('due_date'),
        supabase.from('profiles').select('id, name').order('name'),
      ]);
      setAreas((ar as Area[]) || []);
      setUsers((us as AppUser[]) || []);
      const actasNorm: Acta[] = ((ac as any[]) || []).map(a => ({
        ...a,
        participants: Array.isArray(a.participants) ? a.participants : (a.participants ? JSON.parse(a.participants) : []),
        temas: (Array.isArray(a.temas) ? a.temas : (a.temas ? JSON.parse(a.temas) : [])).map(normTema),
      }));
      setActas(actasNorm);
      setCompromisos((co as Compromiso[]) || []);

      // Estado de las tareas vinculadas a los items (para reflejar "Realizado")
      const taskIds: string[] = [];
      actasNorm.forEach(a => a.temas.forEach(t => t.items.forEach(it => { if (it.taskId) taskIds.push(it.taskId); })));
      if (taskIds.length > 0) {
        const { data: tks } = await supabase.from('tasks').select('id, status').in('id', taskIds);
        const map: Record<string, string> = {};
        (tks || []).forEach((t: any) => { map[t.id] = t.status || 'pending'; });
        setTaskStatus(map);
      } else {
        setTaskStatus({});
      }
    } catch { setAreas([]); setActas([]); setCompromisos([]); setUsers([]); }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, []);

  const compByActa = useMemo(() => {
    const m: Record<string, Compromiso[]> = {};
    compromisos.forEach(c => { (m[c.acta_id] = m[c.acta_id] || []).push(c); });
    return m;
  }, [compromisos]);

  // Compromisos derivados de los items (nuevo formato)
  const itemComps = useMemo(() => {
    const rows: BoardRow[] = [];
    actas.forEach(a => a.temas.forEach(t => t.items.forEach(it => {
      if (it.charlado && it.conclusion.trim() && it.responsableName) {
        const done = it.taskId ? taskStatus[it.taskId] === 'done' : false;
        rows.push({
          key: it.id, acta_id: a.id, acta_date: a.date, tema: t.titulo || null,
          descripcion: it.conclusion, responsable: it.responsableName,
          due_date: it.dueDate, status: done ? 'resuelto' : 'pendiente', source: 'item',
        });
      }
    })));
    return rows;
  }, [actas, taskStatus]);

  // Cantidad de compromisos (items) por acta
  const itemCompsByActa = useMemo(() => {
    const m: Record<string, BoardRow[]> = {};
    itemComps.forEach(r => { (m[r.acta_id] = m[r.acta_id] || []).push(r); });
    return m;
  }, [itemComps]);

  // ── Editor de acta ──
  const emptyActa = (): Acta => ({ id: '', date: todayISO(), participants: [], temas: [], notes: '' });
  const abrirNueva = () => { setEditing(emptyActa()); setDeletedTaskIds([]); };
  const abrirActa = (a: Acta) => {
    setEditing({ ...a, participants: [...a.participants], temas: a.temas.map(t => ({ ...t, items: t.items.map(it => ({ ...it })) })) });
    setDeletedTaskIds([]);
  };
  const cerrar = () => { setEditing(null); setDeletedTaskIds([]); };

  const toggleParticipante = (name: string) => setEditing(e => e ? ({ ...e, participants: e.participants.includes(name) ? e.participants.filter(p => p !== name) : [...e.participants, name] }) : e);

  // Temas
  const addTema = () => setEditing(e => e ? ({ ...e, temas: [...e.temas, { titulo: '', detalle: '', items: [] }] }) : e);
  const setTemaField = (i: number, field: 'titulo' | 'detalle', val: string) => setEditing(e => e ? ({ ...e, temas: e.temas.map((t, idx) => idx === i ? { ...t, [field]: val } : t) }) : e);
  const delTema = (i: number) => setEditing(e => {
    if (!e) return e;
    const tema = e.temas[i];
    const ids = tema.items.map(it => it.taskId).filter(Boolean) as string[];
    if (ids.length) setDeletedTaskIds(prev => [...prev, ...ids]);
    return { ...e, temas: e.temas.filter((_, idx) => idx !== i) };
  });

  // Items dentro de un tema
  const addItem = (ti: number) => setEditing(e => e ? ({
    ...e, temas: e.temas.map((t, idx) => idx === ti ? { ...t, items: [...t.items, { id: uid('it'), texto: '', charlado: false, conclusion: '', responsableId: null, responsableName: null, dueDate: null, taskId: null }] } : t)
  }) : e);
  const setItem = (ti: number, ii: number, patch: Partial<TemaItem>) => setEditing(e => e ? ({
    ...e, temas: e.temas.map((t, idx) => idx === ti ? { ...t, items: t.items.map((it, jdx) => jdx === ii ? { ...it, ...patch } : it) } : t)
  }) : e);
  const delItem = (ti: number, ii: number) => setEditing(e => {
    if (!e) return e;
    const it = e.temas[ti].items[ii];
    if (it?.taskId) setDeletedTaskIds(prev => [...prev, it.taskId as string]);
    return { ...e, temas: e.temas.map((t, idx) => idx === ti ? { ...t, items: t.items.filter((_, jdx) => jdx !== ii) } : t) };
  });
  const toggleCharlado = (ti: number, ii: number) => setEditing(e => e ? ({
    ...e, temas: e.temas.map((t, idx) => idx === ti ? { ...t, items: t.items.map((it, jdx) => jdx === ii ? { ...it, charlado: !it.charlado } : it) } : t)
  }) : e);

  const setResponsable = (ti: number, ii: number, userId: string) => {
    const u = users.find(x => x.id === userId) || null;
    setItem(ti, ii, { responsableId: userId || null, responsableName: u?.name || null });
  };

  const guardar = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    if (!editing) return;
    if (!editing.date) { alert('Poné la fecha de la reunión.'); return; }
    setSaving(true);
    try {
      const isNew = !editing.id;
      const actaId = editing.id || uid('ac');

      // Clon profundo de temas para sincronizar taskIds
      const temas: Tema[] = editing.temas.map(t => ({ ...t, items: t.items.map(it => ({ ...it })) }));

      // Borrar tareas de items/temas eliminados
      for (const tid of deletedTaskIds) {
        try { await supabase.from('tasks').delete().eq('id', tid); } catch { /* ignore */ }
      }

      // Sincronizar tareas de los items
      for (const t of temas) {
        for (const it of t.items) {
          const qualifies = it.charlado && !!it.responsableId && it.conclusion.trim().length > 0;
          const taskPayload: any = {
            description: it.conclusion.trim() || it.texto.trim() || 'Compromiso de reunión',
            notes: `Compromiso de reunión de dirección (${fmtDMY(editing.date)})${t.titulo ? ' · Tema: ' + t.titulo : ''}`,
            branch_id: 'all', target_role: 'all', target_user: it.responsableId,
            due_date: it.dueDate || null, priority: 'normal', recurrence: 'none', recurrence_day: null,
          };
          if (qualifies) {
            if (!it.taskId) {
              const { data, error } = await supabase.from('tasks')
                .insert({ ...taskPayload, status: 'pending', created_by: currentUserName || '—' })
                .select().single();
              if (!error && data) it.taskId = data.id;
            } else {
              // No tocamos el status: la persona lo completa en Tareas Pendientes
              await supabase.from('tasks').update(taskPayload).eq('id', it.taskId);
            }
          } else if (it.taskId) {
            // Dejó de ser una tarea asignada -> borrar
            try { await supabase.from('tasks').delete().eq('id', it.taskId); } catch { /* ignore */ }
            it.taskId = null;
          }
        }
      }

      // Guardar acta (dejamos temas que tengan título, detalle o algún item)
      const temasToSave = temas.filter(t => t.titulo.trim() || t.detalle.trim() || t.items.length > 0);
      const payload = {
        id: actaId, date: editing.date, participants: editing.participants, temas: temasToSave,
        notes: editing.notes?.trim() || null, created_by: currentUserName || '—', updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('direccion_actas').upsert(payload, { onConflict: 'id' });
      if (error) throw error;

      cerrar(); await cargar();
      if (isNew) setTab('actas');
    } catch (e: any) { alert('Error al guardar: ' + (e.message || e)); }
    setSaving(false);
  };

  const borrarActa = async (a: Acta) => {
    if (!window.confirm(`¿Eliminar el acta del ${fmtDMY(a.date)}? Se borran también sus compromisos y las tareas que generó.`)) return;
    // Borrar tareas vinculadas a los items
    const ids: string[] = [];
    a.temas.forEach(t => t.items.forEach(it => { if (it.taskId) ids.push(it.taskId); }));
    for (const tid of ids) { try { await supabase.from('tasks').delete().eq('id', tid); } catch { /* ignore */ } }
    await supabase.from('direccion_compromisos').delete().eq('acta_id', a.id);
    await supabase.from('direccion_actas').delete().eq('id', a.id);
    await cargar();
  };

  // Cambiar estado de un compromiso LEGACY desde el tablero
  const cambiarEstadoLegacy = async (id: string, status: string) => {
    if (isReadOnly) return;
    setCompromisos(prev => prev.map(x => x.id === id ? { ...x, status } : x));
    const { error } = await supabase.from('direccion_compromisos').update({ status }).eq('id', id);
    if (error) { alert('Error: ' + error.message); await cargar(); }
  };

  // ── Áreas ──
  const agregarArea = async () => {
    if (isReadOnly) return;
    const name = nuevaArea.trim();
    if (!name) return;
    if (areas.some(a => a.name.trim().toLowerCase() === name.toLowerCase())) { alert('Ya existe esa área.'); return; }
    const { error } = await supabase.from('direccion_areas').insert({ id: uid('ar'), name, sort_order: (areas.length + 1) });
    if (error) { alert('No se pudo guardar el área: ' + error.message); return; }
    setNuevaArea(''); await cargar();
  };
  const borrarArea = async (a: Area) => {
    if (!window.confirm(`¿Eliminar el área "${a.name}"? (No borra las actas ni los compromisos ya cargados)`)) return;
    await supabase.from('direccion_areas').delete().eq('id', a.id); await cargar();
  };

  // ── Tablero de compromisos (items + legacy) ──
  const boardRows = useMemo(() => {
    const legacy: BoardRow[] = compromisos.map(c => ({
      key: 'lg_' + c.id, acta_id: c.acta_id, acta_date: c.acta_date, tema: c.tema,
      descripcion: c.descripcion, responsable: c.responsable, due_date: c.due_date,
      status: c.status, source: 'legacy',
    }));
    return [...itemComps, ...legacy];
  }, [itemComps, compromisos]);

  const responsablesList = useMemo(() => {
    const set = new Set<string>();
    boardRows.forEach(r => { if (r.responsable) set.add(r.responsable); });
    return Array.from(set).sort();
  }, [boardRows]);

  const compFiltrados = useMemo(() => {
    return boardRows.filter(r => {
      if (fResp && r.responsable !== fResp) return false;
      if (fEstado === 'pendientes' && r.status === 'resuelto') return false;
      if (fEstado === 'resueltos' && r.status !== 'resuelto') return false;
      return true;
    }).sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')));
  }, [boardRows, fResp, fEstado]);

  const pendientesPorResp = useMemo(() => {
    const m: Record<string, number> = {};
    boardRows.filter(r => r.status !== 'resuelto').forEach(r => { const k = r.responsable || 'Sin asignar'; m[k] = (m[k] || 0) + 1; });
    return m;
  }, [boardRows]);

  const exportarPDF = (a: Acta) => {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text('Acta de Reunión de Dirección', 14, 16);
    doc.setFontSize(10); doc.text(`Fecha: ${fmtDMY(a.date)}`, 14, 24);
    doc.setFontSize(9);
    const parts = a.participants.length ? a.participants.join(', ') : 'Sin registrar';
    const partLines = doc.splitTextToSize(`Participantes: ${parts}`, 180);
    doc.text(partLines, 14, 30);
    let y = 30 + partLines.length * 5 + 4;
    const comps: BoardRow[] = [];
    a.temas.forEach((t, i) => {
      if (y > 265) { doc.addPage(); y = 16; }
      doc.setFontSize(10); doc.setFont(undefined as any, 'bold');
      doc.text(`${i + 1}. ${t.titulo || '(sin título)'}`, 14, y); y += 5;
      doc.setFont(undefined as any, 'normal'); doc.setFontSize(9);
      if (t.detalle) { const dl = doc.splitTextToSize(t.detalle, 178); doc.text(dl, 18, y); y += dl.length * 4.5 + 1; }
      t.items.forEach(it => {
        if (y > 275) { doc.addPage(); y = 16; }
        const mark = it.charlado ? '[x]' : '[ ]';
        const il = doc.splitTextToSize(`${mark} ${it.texto || '(item)'}`, 174);
        doc.text(il, 20, y); y += il.length * 4.5;
        if (it.charlado && it.conclusion) {
          const cl = doc.splitTextToSize(`→ Conclusión/Compromiso: ${it.conclusion}${it.responsableName ? ' · Resp: ' + it.responsableName : ''}${it.dueDate ? ' · Límite: ' + fmtDMY(it.dueDate) : ''}`, 168);
          doc.setTextColor(90); doc.text(cl, 26, y); doc.setTextColor(0); y += cl.length * 4.5 + 1;
          if (it.charlado && it.conclusion.trim() && it.responsableName) {
            comps.push({ key: it.id, acta_id: a.id, acta_date: a.date, tema: t.titulo, descripcion: it.conclusion, responsable: it.responsableName, due_date: it.dueDate, status: it.taskId && taskStatus[it.taskId] === 'done' ? 'resuelto' : 'pendiente', source: 'item' });
          }
        }
        y += 1;
      });
      y += 2;
    });
    if (comps.length) {
      if (y > 250) { doc.addPage(); y = 16; }
      doc.setFontSize(10); doc.setFont(undefined as any, 'bold'); doc.text('Compromisos / Tareas', 14, y); y += 3;
      doc.setFont(undefined as any, 'normal');
      autoTable(doc, {
        head: [['Compromiso', 'Responsable', 'Límite', 'Estado']],
        body: comps.map(c => [c.descripcion, c.responsable || '—', c.due_date ? fmtDMY(c.due_date) : '—', stInfo(c.status).label]),
        startY: y + 2, styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: [193, 18, 31] },
        columnStyles: { 0: { cellWidth: 90 } },
      });
    }
    if (a.notes) {
      const afterY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 6 : y;
      doc.setFontSize(9); doc.setFont(undefined as any, 'bold'); doc.text('Notas:', 14, afterY);
      doc.setFont(undefined as any, 'normal'); doc.text(doc.splitTextToSize(a.notes, 180), 14, afterY + 5);
    }
    doc.save(`acta_direccion_${a.date}.pdf`);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* Encabezado */}
      <div className="bg-bg-card border border-border-dim rounded-lg p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-brand-500/10 p-2.5 rounded-lg"><Landmark className="text-brand-500" size={20} /></div>
            <div>
              <h2 className="text-base font-black uppercase text-text-main tracking-wider">Actas de Dirección</h2>
              <p className="text-[9px] text-text-dim uppercase font-bold">Reuniones con los departamentos · temas, items y compromisos</p>
            </div>
          </div>
          <div className="flex gap-1 bg-bg-accent p-1 rounded-lg">
            <button onClick={() => setTab('actas')} className={cn("px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5", tab === 'actas' ? "bg-brand-500 text-white" : "text-text-dim hover:text-text-main")}><ClipboardList size={12} /> Actas</button>
            <button onClick={() => setTab('compromisos')} className={cn("px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5", tab === 'compromisos' ? "bg-brand-500 text-white" : "text-text-dim hover:text-text-main")}><ListChecks size={12} /> Compromisos</button>
            {!isReadOnly && <button onClick={() => setTab('areas')} className={cn("px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5", tab === 'areas' ? "bg-brand-500 text-white" : "text-text-dim hover:text-text-main")}><Settings2 size={12} /> Áreas</button>}
          </div>
        </div>
      </div>

      {/* ───────── ACTAS ───────── */}
      {tab === 'actas' && (
        <>
          {!isReadOnly && (
            <div className="flex justify-end">
              <button onClick={abrirNueva} className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all">
                <Plus size={14} /> Nueva acta
              </button>
            </div>
          )}
          {loading ? (
            <p className="text-center text-[10px] font-bold uppercase text-text-dim py-10">Cargando…</p>
          ) : actas.length === 0 ? (
            <p className="text-center text-[10px] font-bold uppercase text-text-dim py-12">No hay actas cargadas.{!isReadOnly && ' Usá "Nueva acta" para registrar la reunión.'}</p>
          ) : (
            <div className="space-y-2">
              {actas.map(a => {
                const comps = itemCompsByActa[a.id] || [];
                const pend = comps.filter(c => c.status !== 'resuelto').length;
                const nItems = a.temas.reduce((s, t) => s + t.items.length, 0);
                return (
                  <div key={a.id} className="bg-bg-sidebar border border-border-dim rounded-lg p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1 cursor-pointer" onClick={() => abrirActa(a)}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[12px] font-black uppercase text-text-main flex items-center gap-1"><CalendarDays size={13} className="text-brand-500" /> Reunión {fmtDMY(a.date)}</span>
                          <span className="text-[8px] font-black uppercase text-text-dim">· {a.temas.length} tema(s) · {nItems} item(s) · {comps.length} compromiso(s)</span>
                          {pend > 0 && <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-red-500/10 text-red-500 border border-red-500/30">{pend} pendiente(s)</span>}
                        </div>
                        {a.participants.length > 0 && (
                          <p className="text-[9px] font-bold uppercase text-text-dim mt-1 flex items-center gap-1"><Users size={10} /> {a.participants.join(' · ')}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => exportarPDF(a)} title="Exportar PDF" className="p-1.5 text-text-dim hover:text-red-500 transition-colors"><FileText size={15} /></button>
                        <button onClick={() => abrirActa(a)} title={isReadOnly ? 'Ver' : 'Editar'} className="p-1.5 text-text-dim hover:text-brand-500 transition-colors"><Pencil size={15} /></button>
                        {!isReadOnly && <button onClick={() => borrarActa(a)} title="Eliminar" className="p-1.5 text-text-dim hover:text-red-500 transition-colors"><Trash2 size={15} /></button>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ───────── COMPROMISOS ───────── */}
      {tab === 'compromisos' && (
        <>
          <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 flex flex-wrap gap-3 items-center">
            <select value={fResp} onChange={e => setFResp(e.target.value)} className="bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none">
              <option value="">Todos los responsables</option>
              {responsablesList.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <div className="flex gap-1 bg-bg-accent rounded-lg p-1">
              {([['pendientes', 'Pendientes'], ['todos', 'Todos'], ['resueltos', 'Resueltos']] as const).map(([v, l]) => (
                <button key={v} onClick={() => setFEstado(v)} className={cn("px-3 py-1.5 rounded text-[9px] font-black uppercase transition-all", fEstado === v ? "bg-brand-500 text-white" : "text-text-dim hover:text-text-main")}>{l}</button>
              ))}
            </div>
            <span className="text-[10px] font-black text-text-dim uppercase tracking-widest ml-auto">{compFiltrados.length} compromiso(s)</span>
          </div>

          {/* Resumen por responsable (pendientes) */}
          {Object.keys(pendientesPorResp).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(pendientesPorResp).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([resp, n]) => (
                <button key={resp} onClick={() => { setFResp(resp === 'Sin asignar' ? '' : resp); setFEstado('pendientes'); }}
                  className="bg-bg-card border border-border-dim rounded-lg px-3 py-2 hover:border-brand-500/40 transition-all">
                  <span className="text-[9px] font-bold uppercase text-text-dim">{resp}</span>
                  <span className="text-[13px] font-mono font-black text-red-500 ml-2">{n}</span>
                </button>
              ))}
            </div>
          )}

          {compFiltrados.length === 0 ? (
            <p className="text-center text-[10px] font-bold uppercase text-text-dim py-12">No hay compromisos para este filtro.</p>
          ) : (
            <div className="space-y-2">
              {compFiltrados.map(r => {
                const si = stInfo(r.status);
                const vencido = r.status !== 'resuelto' && r.due_date && r.due_date < todayISO();
                return (
                  <div key={r.key} className="bg-bg-sidebar border border-border-dim rounded-lg p-3.5 flex items-start justify-between gap-3" style={{ borderLeftWidth: '3px', borderLeftColor: si.color.includes('red') ? '#ef4444' : si.color.includes('amber') ? '#f59e0b' : '#10b981' }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {r.responsable && <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-brand-500/10 text-brand-500 border border-brand-500/30 flex items-center gap-1"><UserIcon size={9} /> {r.responsable}</span>}
                        {vencido && <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-red-500/15 text-red-500">Vencido</span>}
                        <span className="text-[8px] font-bold uppercase text-text-dim">Reunión {fmtDMY(r.acta_date)}{r.tema ? ` · ${r.tema}` : ''}</span>
                      </div>
                      <p className="text-[12px] text-text-main">{r.descripcion}</p>
                      <p className="text-[9px] font-bold uppercase text-text-dim mt-1">Límite: {fmtDMY(r.due_date)}</p>
                    </div>
                    {r.source === 'item' ? (
                      <span className={cn("text-[8px] font-black uppercase px-2 py-1 rounded border shrink-0 text-center leading-tight", si.color)} title="El estado se actualiza cuando el responsable la completa en Tareas Pendientes">
                        {r.status === 'resuelto' ? 'Realizado' : 'Pendiente'}
                        <span className="block text-[6px] opacity-70">en tareas pendientes</span>
                      </span>
                    ) : isReadOnly ? (
                      <span className={cn("text-[8px] font-black uppercase px-2 py-1 rounded border shrink-0", si.color)}>{si.label}</span>
                    ) : (
                      <select value={r.status} onChange={e => cambiarEstadoLegacy(r.key.replace(/^lg_/, ''), e.target.value)}
                        className="bg-bg-accent border border-border-dim rounded px-2 py-1 text-[9px] font-black uppercase text-text-main outline-none shrink-0">
                        {STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ───────── ÁREAS ───────── */}
      {tab === 'areas' && !isReadOnly && (
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 space-y-4 max-w-xl">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-brand-500">Áreas / Participantes</h3>
          <p className="text-[9px] font-bold text-text-dim">Estas áreas son las que aparecen como participantes de la reunión.</p>
          <div className="flex gap-2">
            <input value={nuevaArea} onChange={e => setNuevaArea(e.target.value)} onKeyDown={e => e.key === 'Enter' && agregarArea()}
              placeholder="Nueva área (ej. Compras)…" className="flex-1 bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-brand-500" />
            <button onClick={agregarArea} className="bg-brand-500 text-white px-4 rounded text-[10px] font-black uppercase hover:bg-brand-600 flex items-center gap-1"><Plus size={14} /> Agregar</button>
          </div>
          <div className="space-y-1.5">
            {areas.map(a => (
              <div key={a.id} className="flex items-center justify-between bg-bg-accent/40 border border-border-dim rounded px-3 py-2">
                <span className="text-[11px] font-bold uppercase text-text-main">{a.name}</span>
                <button onClick={() => borrarArea(a)} className="text-text-dim hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ))}
            {areas.length === 0 && <p className="text-[9px] font-bold uppercase text-text-dim text-center py-3">Sin áreas cargadas.</p>}
          </div>
        </div>
      )}

      {/* ───────── EDITOR DE ACTA ───────── */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start md:items-center justify-center p-3 overflow-y-auto" onClick={() => !saving && cerrar()}>
          <div className="bg-bg-card border border-border-dim rounded-xl max-w-3xl w-full my-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border-dim">
              <h3 className="text-sm font-black uppercase text-text-main flex items-center gap-2"><ClipboardList size={16} className="text-brand-500" /> {isReadOnly ? 'Ver acta' : editing.id ? 'Editar acta' : 'Nueva acta'}</h3>
              <button onClick={cerrar} className="p-1.5 text-text-dim hover:text-text-main"><X size={18} /></button>
            </div>

            <div className="p-4 space-y-4 max-h-[72vh] overflow-y-auto custom-scrollbar">
              {/* Fecha */}
              <div className="flex items-center gap-3 flex-wrap">
                <div>
                  <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Fecha de la reunión</label>
                  <input type="date" readOnly={isReadOnly} value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value })}
                    className="bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-mono font-bold text-text-main outline-none focus:border-brand-500" />
                </div>
              </div>
              {/* Participantes */}
              <div>
                <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1.5">Participantes</label>
                <div className="flex flex-wrap gap-1.5">
                  {areas.map(a => {
                    const on = editing.participants.includes(a.name);
                    return (
                      <button key={a.id} type="button" disabled={isReadOnly} onClick={() => toggleParticipante(a.name)}
                        className={cn("px-3 py-1.5 rounded text-[9px] font-black uppercase border transition-all", on ? "bg-brand-500 text-white border-brand-500" : "bg-bg-accent text-text-dim border-border-dim hover:border-brand-500/40")}>
                        {a.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Temas con items */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-brand-500 flex items-center gap-2"><ListChecks size={14} /> Temas tratados ({editing.temas.length})</p>
                  {!isReadOnly && <button onClick={addTema} type="button" className="text-[8px] font-black uppercase text-white bg-brand-500 hover:bg-brand-600 rounded px-2 py-1 flex items-center gap-1"><Plus size={11} /> Tema</button>}
                </div>
                {editing.temas.length === 0 ? (
                  <p className="text-[9px] font-bold uppercase text-text-dim py-1">Sin temas.{!isReadOnly && ' Agregá los puntos que se trataron.'}</p>
                ) : editing.temas.map((t, ti) => (
                  <div key={ti} className="bg-bg-accent/40 border border-border-dim rounded-lg p-3 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-brand-500">{ti + 1}.</span>
                      <input readOnly={isReadOnly} value={t.titulo} onChange={e => setTemaField(ti, 'titulo', e.target.value)}
                        placeholder="Título del tema" className="flex-1 bg-bg-card border border-border-dim rounded px-2 py-1.5 text-[11px] font-bold text-text-main outline-none focus:border-brand-500" />
                      {!isReadOnly && <button onClick={() => delTema(ti)} type="button" title="Eliminar tema" className="text-text-dim hover:text-red-500"><Trash2 size={13} /></button>}
                    </div>

                    {/* Items del tema */}
                    <div className="space-y-2 pl-1">
                      {t.items.map((it, ii) => {
                        const taskDone = it.taskId ? taskStatus[it.taskId] === 'done' : false;
                        return (
                          <div key={it.id} className="bg-bg-card border border-border-dim rounded-lg p-2.5 space-y-2">
                            <div className="flex items-start gap-2">
                              <button type="button" disabled={isReadOnly} onClick={() => toggleCharlado(ti, ii)} title="Marcar como charlado"
                                className={cn("mt-0.5 shrink-0 transition-colors", it.charlado ? "text-emerald-500" : "text-text-dim hover:text-brand-500")}>
                                {it.charlado ? <CheckSquare size={17} /> : <Square size={17} />}
                              </button>
                              <input readOnly={isReadOnly} value={it.texto} onChange={e => setItem(ti, ii, { texto: e.target.value })}
                                placeholder="Punto tratado…" className="flex-1 bg-bg-accent border border-border-dim rounded px-2 py-1.5 text-[11px] text-text-main outline-none focus:border-brand-500" />
                              {!isReadOnly && <button onClick={() => delItem(ti, ii)} type="button" className="text-text-dim hover:text-red-500 mt-1"><Trash2 size={12} /></button>}
                            </div>

                            {/* Panel de conclusión / compromiso (al tildar Charlado) */}
                            {it.charlado && (
                              <div className="ml-6 space-y-2 border-l-2 border-emerald-500/30 pl-3">
                                <p className="text-[8px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1"><CheckCircle2 size={11} /> Conclusión / compromiso</p>
                                <textarea readOnly={isReadOnly} value={it.conclusion} onChange={e => setItem(ti, ii, { conclusion: e.target.value })} rows={2}
                                  placeholder="Qué se concluyó y qué hay que hacer…" className="w-full bg-bg-accent border border-border-dim rounded px-2 py-1.5 text-[10px] text-text-main outline-none focus:border-emerald-500 resize-none" />
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[8px] font-black uppercase text-text-dim block mb-0.5">Responsable (usuario)</label>
                                    <select disabled={isReadOnly} value={it.responsableId || ''} onChange={e => setResponsable(ti, ii, e.target.value)}
                                      className="w-full bg-bg-accent border border-border-dim rounded px-2 py-1.5 text-[10px] font-bold text-text-main outline-none">
                                      <option value="">Sin tarea (solo conclusión)…</option>
                                      {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[8px] font-black uppercase text-text-dim block mb-0.5">Fecha límite</label>
                                    <input type="date" readOnly={isReadOnly} value={it.dueDate || ''} onChange={e => setItem(ti, ii, { dueDate: e.target.value || null })}
                                      className="w-full bg-bg-accent border border-border-dim rounded px-2 py-1.5 text-[10px] font-mono font-bold text-text-main outline-none" />
                                  </div>
                                </div>
                                {it.responsableId ? (
                                  <p className="text-[8px] font-bold uppercase text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                    <CheckCircle2 size={10} /> {it.taskId ? (taskDone ? 'Tarea REALIZADA por el responsable' : 'Genera tarea en Tareas Pendientes (pendiente)') : 'Se creará una tarea al guardar'}
                                  </p>
                                ) : (
                                  <p className="text-[8px] font-bold uppercase text-text-dim">Sin responsable: queda como conclusión, no genera tarea.</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {!isReadOnly && (
                        <button onClick={() => addItem(ti)} type="button" className="text-[8px] font-black uppercase text-brand-500 hover:text-brand-600 flex items-center gap-1 pl-1">
                          <Plus size={11} /> Agregar item
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Notas */}
              <div>
                <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Notas generales</label>
                <textarea readOnly={isReadOnly} value={editing.notes || ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} rows={2}
                  className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500 resize-none" />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 p-4 border-t border-border-dim">
              {editing.id ? <button onClick={() => exportarPDF(editing)} className="flex items-center gap-1.5 px-3 py-2 rounded text-[9px] font-black uppercase text-text-dim hover:text-brand-500 border border-border-dim"><FileText size={13} /> Exportar PDF</button> : <span />}
              <div className="flex items-center gap-2">
                <button onClick={cerrar} className="px-4 py-2 rounded text-[9px] font-black uppercase text-text-dim hover:text-text-main border border-border-dim">{isReadOnly ? 'Cerrar' : 'Cancelar'}</button>
                {!isReadOnly && (
                  <button onClick={guardar} disabled={saving} className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-5 py-2 rounded text-[9px] font-black uppercase tracking-widest disabled:opacity-50">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar acta
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
