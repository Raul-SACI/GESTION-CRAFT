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
interface Responsable {
  id: string;        // id del usuario (profile)
  name: string;      // nombre para mostrar / PDF
  taskId: string | null; // id de la tarea creada para ESE usuario
}
interface TemaItem {
  id: string;
  texto: string;                 // el punto tratado dentro del tema
  charlado: boolean;             // se tilda cuando ya se habló
  conclusion: string;            // conclusión / compromiso (aparece al tildar)
  responsables: Responsable[];   // uno o varios usuarios; cada uno recibe su tarea
  dueDate: string | null;
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
    // Compatibilidad: items viejos tenían un único responsableId/taskId
    responsables: Array.isArray(it.responsables)
      ? it.responsables.map((r: any) => ({ id: r.id, name: r.name || '', taskId: r.taskId ?? null }))
      : (it.responsableId ? [{ id: it.responsableId, name: it.responsableName || '', taskId: it.taskId ?? null }] : []),
    dueDate: it.dueDate ?? null,
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
  const [fFecha, setFFecha] = useState(''); // fecha de acta ('' = todas)

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
      actasNorm.forEach(a => a.temas.forEach(t => t.items.forEach(it => it.responsables.forEach(r => { if (r.taskId) taskIds.push(r.taskId); }))));
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
      if (it.charlado && it.conclusion.trim() && it.responsables.length > 0) {
        // Una fila por responsable, cada uno con su propio estado
        it.responsables.forEach(r => {
          const done = r.taskId ? taskStatus[r.taskId] === 'done' : false;
          rows.push({
            key: `${it.id}_${r.id}`, acta_id: a.id, acta_date: a.date, tema: t.titulo || null,
            descripcion: it.conclusion, responsable: r.name,
            due_date: it.dueDate, status: done ? 'resuelto' : 'pendiente', source: 'item',
          });
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
    const ids = tema.items.flatMap(it => it.responsables.map(r => r.taskId)).filter(Boolean) as string[];
    if (ids.length) setDeletedTaskIds(prev => [...prev, ...ids]);
    return { ...e, temas: e.temas.filter((_, idx) => idx !== i) };
  });

  // Items dentro de un tema
  const addItem = (ti: number) => setEditing(e => e ? ({
    ...e, temas: e.temas.map((t, idx) => idx === ti ? { ...t, items: [...t.items, { id: uid('it'), texto: '', charlado: false, conclusion: '', responsables: [], dueDate: null }] } : t)
  }) : e);
  const setItem = (ti: number, ii: number, patch: Partial<TemaItem>) => setEditing(e => e ? ({
    ...e, temas: e.temas.map((t, idx) => idx === ti ? { ...t, items: t.items.map((it, jdx) => jdx === ii ? { ...it, ...patch } : it) } : t)
  }) : e);
  const delItem = (ti: number, ii: number) => setEditing(e => {
    if (!e) return e;
    const it = e.temas[ti].items[ii];
    const ids = (it?.responsables || []).map(r => r.taskId).filter(Boolean) as string[];
    if (ids.length) setDeletedTaskIds(prev => [...prev, ...ids]);
    return { ...e, temas: e.temas.map((t, idx) => idx === ti ? { ...t, items: t.items.filter((_, jdx) => jdx !== ii) } : t) };
  });
  const toggleCharlado = (ti: number, ii: number) => setEditing(e => e ? ({
    ...e, temas: e.temas.map((t, idx) => idx === ti ? { ...t, items: t.items.map((it, jdx) => jdx === ii ? { ...it, charlado: !it.charlado } : it) } : t)
  }) : e);

  const addResponsable = (ti: number, ii: number, userId: string) => {
    if (!userId) return;
    const u = users.find(x => x.id === userId);
    if (!u) return;
    setEditing(e => e ? ({
      ...e, temas: e.temas.map((t, idx) => idx === ti ? { ...t, items: t.items.map((it, jdx) => {
        if (jdx !== ii) return it;
        if (it.responsables.some(r => r.id === userId)) return it; // ya está
        return { ...it, responsables: [...it.responsables, { id: u.id, name: u.name, taskId: null }] };
      }) } : t)
    }) : e);
  };
  const removeResponsable = (ti: number, ii: number, userId: string) => {
    setEditing(e => {
      if (!e) return e;
      const it = e.temas[ti].items[ii];
      const r = it?.responsables.find(x => x.id === userId);
      if (r?.taskId) setDeletedTaskIds(prev => [...prev, r.taskId as string]);
      return { ...e, temas: e.temas.map((t, idx) => idx === ti ? { ...t, items: t.items.map((x, jdx) => jdx === ii ? { ...x, responsables: x.responsables.filter(rr => rr.id !== userId) } : x) } : t) };
    });
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
      const temas: Tema[] = editing.temas.map(t => ({ ...t, items: t.items.map(it => ({ ...it, responsables: it.responsables.map(r => ({ ...r })) })) }));

      // Borrar tareas de items/temas eliminados
      for (const tid of deletedTaskIds) {
        try { await supabase.from('tasks').delete().eq('id', tid); } catch { /* ignore */ }
      }

      // Sincronizar tareas de los items (una tarea por responsable)
      for (const t of temas) {
        for (const it of t.items) {
          const qualifies = it.charlado && it.conclusion.trim().length > 0 && it.responsables.length > 0;
          const basePayload = {
            description: it.conclusion.trim() || it.texto.trim() || 'Compromiso de reunión',
            notes: `Compromiso de reunión de dirección (${fmtDMY(editing.date)})${t.titulo ? ' · Tema: ' + t.titulo : ''}`,
            branch_id: 'all', target_role: 'all',
            due_date: it.dueDate || null, priority: 'normal', recurrence: 'none', recurrence_day: null,
          };
          for (const r of it.responsables) {
            if (qualifies) {
              const payloadR: any = { ...basePayload, target_user: r.id };
              if (!r.taskId) {
                const { data, error } = await supabase.from('tasks')
                  .insert({ ...payloadR, status: 'pending', created_by: currentUserName || '—' })
                  .select().single();
                if (!error && data) r.taskId = data.id;
              } else {
                // No tocamos el status: cada persona lo completa en Tareas Pendientes
                await supabase.from('tasks').update(payloadR).eq('id', r.taskId);
              }
            } else if (r.taskId) {
              // El item dejó de derivar en tareas -> borrar la de cada responsable
              try { await supabase.from('tasks').delete().eq('id', r.taskId); } catch { /* ignore */ }
              r.taskId = null;
            }
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
    a.temas.forEach(t => t.items.forEach(it => it.responsables.forEach(r => { if (r.taskId) ids.push(r.taskId); })));
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

  // Fechas de acta presentes (más recientes primero)
  const fechasList = useMemo(() => {
    const set = new Set<string>();
    boardRows.forEach(r => { if (r.acta_date) set.add(r.acta_date); });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [boardRows]);

  const compFiltrados = useMemo(() => {
    return boardRows.filter(r => {
      if (fResp && r.responsable !== fResp) return false;
      if (fFecha && r.acta_date !== fFecha) return false;
      if (fEstado === 'pendientes' && r.status === 'resuelto') return false;
      if (fEstado === 'resueltos' && r.status !== 'resuelto') return false;
      return true;
    }).sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')));
  }, [boardRows, fResp, fFecha, fEstado]);

  const pendientesPorResp = useMemo(() => {
    const m: Record<string, number> = {};
    boardRows.filter(r => r.status !== 'resuelto').forEach(r => { const k = r.responsable || 'Sin asignar'; m[k] = (m[k] || 0) + 1; });
    return m;
  }, [boardRows]);

  const exportarPDF = (a: Acta) => {
    const doc = new jsPDF();
    const M = 14;            // margen
    const PW = 210, PH = 297;
    const CW = PW - M * 2;   // ancho de contenido
    const BOTTOM = 280;      // límite antes del footer
    // Paleta
    const BRAND: [number, number, number] = [193, 18, 31];
    const DARK: [number, number, number] = [33, 37, 41];
    const GRAY: [number, number, number] = [110, 116, 122];
    const EMER: [number, number, number] = [16, 150, 100];
    const F = 'helvetica';

    let y = 0;

    const ensure = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); y = 20; } };

    // ── Cabecera de marca ──
    const drawHeaderBand = () => {
      doc.setFillColor(...BRAND); doc.rect(0, 0, PW, 30, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont(F, 'bold'); doc.setFontSize(9);
      doc.text('GESTIÓN CRAFT', M, 12);
      doc.setFontSize(16);
      doc.text('ACTA DE REUNIÓN DE DIRECCIÓN', M, 21);
      doc.setFont(F, 'normal'); doc.setFontSize(8);
      doc.text('Gerencia General', M, 26.5);
      // Fecha a la derecha, en recuadro
      doc.setFont(F, 'bold'); doc.setFontSize(9);
      doc.text('REUNIÓN', PW - M, 13, { align: 'right' });
      doc.setFontSize(13);
      doc.text(fmtDMY(a.date), PW - M, 20, { align: 'right' });
    };
    drawHeaderBand();
    y = 38;

    // ── Participantes ──
    doc.setFont(F, 'bold'); doc.setFontSize(7.5); doc.setTextColor(...BRAND);
    doc.text('PARTICIPANTES', M, y); y += 4.5;
    doc.setFont(F, 'normal'); doc.setFontSize(9.5); doc.setTextColor(...DARK);
    const parts = a.participants.length ? a.participants.join('  ·  ') : 'Sin registrar';
    const pl = doc.splitTextToSize(parts, CW);
    doc.text(pl, M, y); y += pl.length * 4.8 + 3;
    doc.setDrawColor(225, 227, 229); doc.setLineWidth(0.3); doc.line(M, y, PW - M, y); y += 7;

    // ── Helpers de dibujo ──
    const drawCheckbox = (x: number, cy: number, checked: boolean) => {
      if (checked) {
        doc.setFillColor(...EMER); doc.setDrawColor(...EMER); doc.setLineWidth(0.4);
        doc.roundedRect(x, cy, 3.6, 3.6, 0.7, 0.7, 'F');
        doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.6);
        doc.line(x + 0.9, cy + 1.9, x + 1.5, cy + 2.6);
        doc.line(x + 1.5, cy + 2.6, x + 2.8, cy + 1.0);
      } else {
        doc.setDrawColor(180, 184, 188); doc.setLineWidth(0.4);
        doc.roundedRect(x, cy, 3.6, 3.6, 0.7, 0.7, 'S');
      }
    };
    // Fila de chips de responsables con wrap
    const drawChips = (names: { name: string; done: boolean }[], x0: number, startY: number, maxRight: number) => {
      let cx = x0, cy = startY;
      doc.setFontSize(7);
      names.forEach(({ name, done }) => {
        const label = name.toUpperCase();
        const w = doc.getTextWidth(label) + 5;
        if (cx + w > maxRight) { cx = x0; cy += 6; }
        if (done) { doc.setFillColor(223, 244, 235); } else { doc.setFillColor(252, 228, 231); }
        doc.roundedRect(cx, cy - 3.1, w, 4.8, 1.2, 1.2, 'F');
        doc.setTextColor(done ? EMER[0] : BRAND[0], done ? EMER[1] : BRAND[1], done ? EMER[2] : BRAND[2]);
        doc.setFont(F, 'bold');
        doc.text(label + (done ? '  OK' : ''), cx + 2.5, cy);
        cx += w + 2.5;
      });
      return cy + 3;
    };

    const comps: BoardRow[] = [];

    // ── Temas ──
    a.temas.forEach((t, i) => {
      ensure(14);
      // Badge de número + título
      doc.setFillColor(...BRAND); doc.roundedRect(M, y - 4.6, 6.5, 6.5, 1.3, 1.3, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont(F, 'bold'); doc.setFontSize(9);
      doc.text(String(i + 1), M + 3.25, y, { align: 'center' });
      doc.setTextColor(...DARK); doc.setFontSize(12);
      const tt = doc.splitTextToSize(t.titulo || '(sin título)', CW - 10);
      doc.text(tt, M + 9.5, y); y += tt.length * 5.4 + 1.5;
      // Detalle del tema (gris)
      if (t.detalle) {
        doc.setFont(F, 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAY);
        const dl = doc.splitTextToSize(t.detalle, CW - 6);
        ensure(dl.length * 4.4 + 2);
        doc.text(dl, M + 4, y); y += dl.length * 4.4 + 1.5;
      }

      // Items
      t.items.forEach(it => {
        ensure(8);
        drawCheckbox(M + 4, y - 3.1, it.charlado);
        doc.setFont(F, it.charlado ? 'bold' : 'normal'); doc.setFontSize(9.5);
        doc.setTextColor(...DARK);
        const il = doc.splitTextToSize(it.texto || '(item)', CW - 16);
        doc.text(il, M + 10.5, y); y += il.length * 4.8;

        if (it.charlado && it.conclusion.trim()) {
          const bx = M + 10.5;
          const boxW = CW - 10.5;
          const innerW = boxW - 8;
          doc.setFont(F, 'normal'); doc.setFontSize(8.8);
          const cl = doc.splitTextToSize(it.conclusion.trim(), innerW);
          const hasResp = it.responsables.length > 0;
          const chipRows = hasResp ? 1 : 0; // aprox; wrap se ajusta abajo
          const boxH = 5.5 + cl.length * 4.2 + (hasResp ? 6.5 : 0) + (it.dueDate ? 4.5 : 0) + 3 + chipRows * 0;
          ensure(boxH + 2);
          // Caja
          doc.setFillColor(247, 248, 249); doc.roundedRect(bx, y - 2.5, boxW, boxH, 1.6, 1.6, 'F');
          doc.setFillColor(...EMER); doc.rect(bx, y - 2.5, 1.4, boxH, 'F');
          let by = y + 1.5;
          doc.setFont(F, 'bold'); doc.setFontSize(7); doc.setTextColor(...EMER);
          doc.text('CONCLUSIÓN / COMPROMISO', bx + 4, by); by += 4;
          doc.setFont(F, 'normal'); doc.setFontSize(8.8); doc.setTextColor(...DARK);
          doc.text(cl, bx + 4, by); by += cl.length * 4.2 + 1.5;
          if (hasResp) {
            doc.setFont(F, 'bold'); doc.setFontSize(6.8); doc.setTextColor(...GRAY);
            doc.text('RESPONSABLES', bx + 4, by); by += 3;
            by = drawChips(it.responsables.map(r => ({ name: r.name, done: !!(r.taskId && taskStatus[r.taskId] === 'done') })), bx + 4, by, bx + boxW - 4);
            by += 1;
          }
          if (it.dueDate) {
            doc.setFont(F, 'bold'); doc.setFontSize(7.2); doc.setTextColor(...BRAND);
            doc.text(`LÍMITE: ${fmtDMY(it.dueDate)}`, bx + 4, by + 1);
          }
          y += boxH + 2.5;

          it.responsables.forEach(r => {
            comps.push({ key: `${it.id}_${r.id}`, acta_id: a.id, acta_date: a.date, tema: t.titulo, descripcion: it.conclusion, responsable: r.name, due_date: it.dueDate, status: r.taskId && taskStatus[r.taskId] === 'done' ? 'resuelto' : 'pendiente', source: 'item' });
          });
        }
        y += 1.5;
      });
      y += 3.5;
    });

    // ── Tabla resumen de compromisos ──
    if (comps.length) {
      ensure(20);
      doc.setFont(F, 'bold'); doc.setFontSize(11); doc.setTextColor(...BRAND);
      doc.text('RESUMEN DE COMPROMISOS', M, y); y += 2;
      autoTable(doc, {
        head: [['Compromiso', 'Responsable', 'Límite', 'Estado']],
        body: comps.map(c => [c.descripcion, c.responsable || '-', c.due_date ? fmtDMY(c.due_date) : '-', c.status === 'resuelto' ? 'Realizado' : 'Pendiente']),
        startY: y + 3,
        margin: { left: M, right: M },
        styles: { fontSize: 8.5, cellPadding: 2.5, textColor: DARK as any, lineColor: [235, 236, 238] as any, lineWidth: 0.2 },
        headStyles: { fillColor: BRAND as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [249, 250, 251] as any },
        columnStyles: { 0: { cellWidth: 86 }, 1: { cellWidth: 46 }, 2: { cellWidth: 24, halign: 'center' }, 3: { cellWidth: 22, halign: 'center' } },
        didParseCell: (data: any) => {
          if (data.section === 'body' && data.column.index === 3) {
            const done = data.cell.raw === 'Realizado';
            data.cell.styles.textColor = done ? EMER : BRAND;
            data.cell.styles.fontStyle = 'bold';
          }
        },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // ── Notas ──
    if (a.notes) {
      ensure(16);
      doc.setFont(F, 'bold'); doc.setFontSize(8); doc.setTextColor(...BRAND);
      doc.text('NOTAS GENERALES', M, y); y += 4;
      doc.setFont(F, 'normal'); doc.setFontSize(9); doc.setTextColor(...DARK);
      const nl = doc.splitTextToSize(a.notes, CW - 6);
      doc.setFillColor(247, 248, 249); doc.roundedRect(M, y - 2.5, CW, nl.length * 4.4 + 5, 1.6, 1.6, 'F');
      doc.text(nl, M + 4, y + 2); y += nl.length * 4.4 + 6;
    }

    // ── Footer en todas las páginas ──
    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setDrawColor(230, 231, 233); doc.setLineWidth(0.3); doc.line(M, PH - 12, PW - M, PH - 12);
      doc.setFont(F, 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
      doc.text(`Acta de Dirección · Reunión ${fmtDMY(a.date)}`, M, PH - 8);
      doc.text(`Página ${p} de ${pageCount}`, PW - M, PH - 8, { align: 'right' });
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
            <select value={fFecha} onChange={e => setFFecha(e.target.value)} className="bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none">
              <option value="">Todas las fechas de acta</option>
              {fechasList.map(f => <option key={f} value={f}>Reunión {fmtDMY(f)}</option>)}
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
                        const doneCount = it.responsables.filter(r => r.taskId && taskStatus[r.taskId] === 'done').length;
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
                                    <label className="text-[8px] font-black uppercase text-text-dim block mb-0.5">Responsables (usuarios)</label>
                                    {/* Chips de responsables elegidos */}
                                    {it.responsables.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mb-1">
                                        {it.responsables.map(r => {
                                          const rDone = r.taskId && taskStatus[r.taskId] === 'done';
                                          return (
                                            <span key={r.id} className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase border", rDone ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" : "bg-brand-500/10 text-brand-500 border-brand-500/30")}>
                                              <UserIcon size={9} /> {r.name}{rDone ? ' ✓' : ''}
                                              {!isReadOnly && <button type="button" onClick={() => removeResponsable(ti, ii, r.id)} className="hover:text-red-500"><X size={10} /></button>}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    )}
                                    {!isReadOnly && (
                                      <select disabled={isReadOnly} value="" onChange={e => { addResponsable(ti, ii, e.target.value); e.currentTarget.value = ''; }}
                                        className="w-full bg-bg-accent border border-border-dim rounded px-2 py-1.5 text-[10px] font-bold text-text-main outline-none">
                                        <option value="">+ Agregar responsable…</option>
                                        {users.filter(u => !it.responsables.some(r => r.id === u.id)).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                      </select>
                                    )}
                                  </div>
                                  <div>
                                    <label className="text-[8px] font-black uppercase text-text-dim block mb-0.5">Fecha límite</label>
                                    <input type="date" readOnly={isReadOnly} value={it.dueDate || ''} onChange={e => setItem(ti, ii, { dueDate: e.target.value || null })}
                                      className="w-full bg-bg-accent border border-border-dim rounded px-2 py-1.5 text-[10px] font-mono font-bold text-text-main outline-none" />
                                  </div>
                                </div>
                                {it.responsables.length > 0 ? (
                                  <p className="text-[8px] font-bold uppercase text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                    <CheckCircle2 size={10} /> Genera {it.responsables.length} tarea(s) en Tareas Pendientes · {doneCount}/{it.responsables.length} realizada(s)
                                  </p>
                                ) : (
                                  <p className="text-[8px] font-bold uppercase text-text-dim">Sin responsables: queda como conclusión, no genera tareas.</p>
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
