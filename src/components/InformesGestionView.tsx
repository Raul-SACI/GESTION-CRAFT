/**
 * INFORMES DE GESTIÓN — Gerencia General
 *
 * El gerente (admin) diseña la ESTRUCTURA de un informe: secciones con campos
 * tipados (texto, párrafo, número, fecha, sí/no) y tablas con columnas. Le asigna
 * un responsable (por rol y/o usuario), una periodicidad (semanal, mensual,
 * anual, etc.) y la fecha exacta en que debe presentarse.
 *
 * Cada período es una ENTREGA: el responsable la completa hasta la fecha límite
 * y el gerente la revisa. Queda registro de si fue APROBADA u OBSERVADA, con las
 * observaciones/anotaciones y quién/cuándo la revisó. El historial de entregas
 * se conserva.
 *
 * Tablas: informes_templates (definición) e informes_submissions (entregas).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  FileCheck2, Plus, Trash2, Pencil, X, Save, Loader2, CalendarDays, User as UserIcon,
  ListChecks, Table as TableIcon, CheckCircle2, AlertCircle, Clock, Send, ClipboardList,
  Eye, ShieldCheck, RotateCcw, Layers
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtDMY = (iso?: string | null) => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'boolean' | 'table';
interface TableColumn { id: string; label: string; type: 'text' | 'number' | 'date'; }
interface Field { id: string; label: string; type: FieldType; required?: boolean; columns?: TableColumn[]; }
interface Section { id: string; title: string; fields: Field[]; }
type Periodicity = 'semanal' | 'quincenal' | 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual' | 'unico';

interface Template {
  id: string; name: string; description: string; periodicity: Periodicity; structure: Section[];
  responsibleRole: string | null; responsibleUserId: string | null; responsibleUserName: string | null;
  nextDueDate: string | null; isActive: boolean; createdBy?: string | null;
}
type SubStatus = 'pendiente' | 'entregado' | 'aprobado' | 'observado';
interface Submission {
  id: string; templateId: string; periodLabel: string; dueDate: string | null; status: SubStatus;
  values: Record<string, any>;
  submittedAt?: string | null; submittedBy?: string | null;
  reviewedAt?: string | null; reviewedBy?: string | null; observations?: string | null;
}
interface AppUser { id: string; name: string; role?: string; }
interface RoleCfg { id: string; name: string; }

const PERIODICITIES: { id: Periodicity; label: string }[] = [
  { id: 'semanal', label: 'Semanal' },
  { id: 'quincenal', label: 'Quincenal' },
  { id: 'mensual', label: 'Mensual' },
  { id: 'bimestral', label: 'Bimestral' },
  { id: 'trimestral', label: 'Trimestral' },
  { id: 'semestral', label: 'Semestral' },
  { id: 'anual', label: 'Anual' },
  { id: 'unico', label: 'Único (sin repetición)' },
];
const perLabel = (p: Periodicity) => PERIODICITIES.find(x => x.id === p)?.label || p;

const FIELD_TYPES: { id: FieldType; label: string }[] = [
  { id: 'text', label: 'Texto corto' },
  { id: 'textarea', label: 'Párrafo' },
  { id: 'number', label: 'Número' },
  { id: 'date', label: 'Fecha' },
  { id: 'boolean', label: 'Sí / No' },
  { id: 'table', label: 'Tabla' },
];
const COL_TYPES: { id: TableColumn['type']; label: string }[] = [
  { id: 'text', label: 'Texto' }, { id: 'number', label: 'Número' }, { id: 'date', label: 'Fecha' },
];

const STATUS_INFO: Record<SubStatus, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: 'text-amber-500 bg-amber-500/10 border-amber-500/30' },
  entregado: { label: 'Entregado', color: 'text-blue-500 bg-blue-500/10 border-blue-500/30' },
  aprobado: { label: 'Aprobado', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30' },
  observado: { label: 'Observado', color: 'text-red-500 bg-red-500/10 border-red-500/30' },
};

// Avanza una fecha ISO según la periodicidad, para proponer el próximo vencimiento.
const advanceDate = (iso: string, p: Periodicity): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const base = new Date(y, m - 1, d, 12);
  const addMonths = (n: number) => { base.setMonth(base.getMonth() + n); };
  switch (p) {
    case 'semanal': base.setDate(base.getDate() + 7); break;
    case 'quincenal': base.setDate(base.getDate() + 14); break;
    case 'mensual': addMonths(1); break;
    case 'bimestral': addMonths(2); break;
    case 'trimestral': addMonths(3); break;
    case 'semestral': addMonths(6); break;
    case 'anual': addMonths(12); break;
    case 'unico': return iso;
  }
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
};

// Etiqueta del período a partir del vencimiento + periodicidad.
const periodLabelFor = (dueISO: string | null, p: Periodicity): string => {
  if (!dueISO) return 'Sin fecha';
  const [y, m, d] = dueISO.split('-');
  const mesName = MESES[parseInt(m) - 1] || m;
  switch (p) {
    case 'semanal':
    case 'quincenal': return `Semana del ${d}/${m}/${y}`;
    case 'mensual': return `${mesName} ${y}`;
    case 'bimestral':
    case 'trimestral':
    case 'semestral': return `${mesName} ${y}`;
    case 'anual': return `Año ${y}`;
    default: return `${d}/${m}/${y}`;
  }
};

export default function InformesGestionView({
  currentUserId, currentUserName, currentUserRole, isAdmin, isReadOnly
}: {
  currentUserId: string; currentUserName: string; currentUserRole: string; isAdmin: boolean; isReadOnly?: boolean;
}) {
  const [tab, setTab] = useState<'entregas' | 'informes'>(isAdmin ? 'informes' : 'entregas');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<RoleCfg[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingTpl, setEditingTpl] = useState<Template | null>(null);
  const [openingSub, setOpeningSub] = useState<Submission | null>(null);

  // Filtros del tablero de entregas
  const [fEstado, setFEstado] = useState<'todos' | SubStatus>('todos');
  const [fInforme, setFInforme] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: tpl }, { data: subs }, { data: us }, { data: rl }] = await Promise.all([
        supabase.from('informes_templates').select('*').order('created_at', { ascending: false }),
        supabase.from('informes_submissions').select('*').order('due_date', { ascending: false }),
        supabase.from('profiles').select('id, name, role').order('name'),
        supabase.from('roles_config').select('id, name').order('name'),
      ]);
      setTemplates(((tpl as any[]) || []).map(mapTemplate));
      setSubmissions(((subs as any[]) || []).map(mapSubmission));
      setUsers((us as AppUser[]) || []);
      setRoles((rl as RoleCfg[]) || []);
    } catch (e) {
      console.error('Error cargando informes de gestión:', e);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const tplById = useMemo(() => Object.fromEntries(templates.map(t => [t.id, t])), [templates]);
  const roleName = (id: string | null) => (id ? (roles.find(r => r.id === id)?.name || id) : '');

  // ¿El usuario actual es responsable de este informe? (por usuario o por rol)
  const isResponsibleFor = (t?: Template | null) => {
    if (!t) return false;
    if (t.responsibleUserId && t.responsibleUserId === currentUserId) return true;
    if (t.responsibleRole && t.responsibleRole === currentUserRole) return true;
    return false;
  };

  // Entregas visibles: el admin ve todas; un responsable ve solo las suyas.
  const visibleSubs = useMemo(() => {
    let rows = submissions
      .map(s => ({ s, t: tplById[s.templateId] }))
      .filter((x): x is { s: Submission; t: Template } => !!x.t);
    if (!isAdmin) rows = rows.filter(x => isResponsibleFor(x.t));
    if (fEstado !== 'todos') rows = rows.filter(x => x.s.status === fEstado);
    if (fInforme) rows = rows.filter(x => x.s.templateId === fInforme);
    return rows.sort((a, b) => String(b.s.dueDate || '').localeCompare(String(a.s.dueDate || '')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions, tplById, isAdmin, fEstado, fInforme, currentUserId, currentUserRole]);

  const subsByTpl = useMemo(() => {
    const m: Record<string, Submission[]> = {};
    submissions.forEach(s => { (m[s.templateId] = m[s.templateId] || []).push(s); });
    return m;
  }, [submissions]);

  // ───────── Editor de informe (estructura) ─────────
  const emptyTemplate = (): Template => ({
    id: '', name: '', description: '', periodicity: 'mensual', structure: [],
    responsibleRole: null, responsibleUserId: null, responsibleUserName: null,
    nextDueDate: todayISO(), isActive: true,
  });
  const nuevoInforme = () => setEditingTpl(emptyTemplate());
  const editarInforme = (t: Template) => setEditingTpl(JSON.parse(JSON.stringify(t)));

  const setTpl = (patch: Partial<Template>) => setEditingTpl(e => e ? { ...e, ...patch } : e);
  const addSection = () => setEditingTpl(e => e ? { ...e, structure: [...e.structure, { id: uid('sec'), title: '', fields: [] }] } : e);
  const setSection = (si: number, patch: Partial<Section>) => setEditingTpl(e => e ? { ...e, structure: e.structure.map((s, i) => i === si ? { ...s, ...patch } : s) } : e);
  const delSection = (si: number) => setEditingTpl(e => e ? { ...e, structure: e.structure.filter((_, i) => i !== si) } : e);
  const addField = (si: number) => setEditingTpl(e => e ? {
    ...e, structure: e.structure.map((s, i) => i === si ? { ...s, fields: [...s.fields, { id: uid('f'), label: '', type: 'text' }] } : s)
  } : e);
  const setField = (si: number, fi: number, patch: Partial<Field>) => setEditingTpl(e => e ? {
    ...e, structure: e.structure.map((s, i) => i === si ? { ...s, fields: s.fields.map((f, j) => j === fi ? { ...f, ...patch } : f) } : s)
  } : e);
  const delField = (si: number, fi: number) => setEditingTpl(e => e ? {
    ...e, structure: e.structure.map((s, i) => i === si ? { ...s, fields: s.fields.filter((_, j) => j !== fi) } : s)
  } : e);
  const changeFieldType = (si: number, fi: number, type: FieldType) => {
    const patch: Partial<Field> = { type };
    if (type === 'table') patch.columns = [{ id: uid('c'), label: 'Columna 1', type: 'text' }];
    else patch.columns = undefined;
    setField(si, fi, patch);
  };
  const addColumn = (si: number, fi: number) => setEditingTpl(e => e ? {
    ...e, structure: e.structure.map((s, i) => i === si ? { ...s, fields: s.fields.map((f, j) => j === fi ? { ...f, columns: [...(f.columns || []), { id: uid('c'), label: `Columna ${(f.columns?.length || 0) + 1}`, type: 'text' }] } : f) } : s)
  } : e);
  const setColumn = (si: number, fi: number, ci: number, patch: Partial<TableColumn>) => setEditingTpl(e => e ? {
    ...e, structure: e.structure.map((s, i) => i === si ? { ...s, fields: s.fields.map((f, j) => j === fi ? { ...f, columns: (f.columns || []).map((c, k) => k === ci ? { ...c, ...patch } : c) } : f) } : s)
  } : e);
  const delColumn = (si: number, fi: number, ci: number) => setEditingTpl(e => e ? {
    ...e, structure: e.structure.map((s, i) => i === si ? { ...s, fields: s.fields.map((f, j) => j === fi ? { ...f, columns: (f.columns || []).filter((_, k) => k !== ci) } : f) } : s)
  } : e);

  const guardarInforme = async () => {
    if (!editingTpl) return;
    if (isReadOnly || !isAdmin) { alert('Solo la Gerencia puede diseñar informes.'); return; }
    if (!editingTpl.name.trim()) { alert('Poné un nombre al informe.'); return; }
    setSaving(true);
    try {
      const isNew = !editingTpl.id;
      const tplId = editingTpl.id || uid('inf');
      const respUserName = editingTpl.responsibleUserId ? (users.find(u => u.id === editingTpl.responsibleUserId)?.name || editingTpl.responsibleUserName || null) : null;
      const payload = {
        id: tplId, name: editingTpl.name.trim(), description: editingTpl.description?.trim() || null,
        periodicity: editingTpl.periodicity, structure: editingTpl.structure,
        responsible_role: editingTpl.responsibleRole || null,
        responsible_user_id: editingTpl.responsibleUserId || null,
        responsible_user_name: respUserName,
        next_due_date: editingTpl.nextDueDate || null,
        is_active: editingTpl.isActive, created_by: currentUserName || '—', updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('informes_templates').upsert(payload, { onConflict: 'id' });
      if (error) throw error;

      // Al crear un informe nuevo, se abre automáticamente la primera entrega.
      if (isNew && editingTpl.nextDueDate) {
        await crearEntrega(tplId, editingTpl.nextDueDate, editingTpl.periodicity, true);
      }
      setEditingTpl(null);
      await load();
    } catch (e: any) {
      alert('Error al guardar el informe: ' + (e?.message || e));
    }
    setSaving(false);
  };

  const borrarInforme = async (t: Template) => {
    if (isReadOnly || !isAdmin) return;
    if (!window.confirm(`¿Eliminar el informe "${t.name}"? Se borran también todas sus entregas y el historial.`)) return;
    try {
      await supabase.from('informes_submissions').delete().eq('template_id', t.id);
      await supabase.from('informes_templates').delete().eq('id', t.id);
      await load();
    } catch (e: any) { alert('Error al eliminar: ' + (e?.message || e)); }
  };

  const toggleActivo = async (t: Template) => {
    if (isReadOnly || !isAdmin) return;
    await supabase.from('informes_templates').update({ is_active: !t.isActive, updated_at: new Date().toISOString() }).eq('id', t.id);
    await load();
  };

  // Crear una entrega (período) para un informe.
  const crearEntrega = async (templateId: string, dueDate: string, periodicity: Periodicity, silent = false) => {
    const row = {
      id: uid('ent'), template_id: templateId, period_label: periodLabelFor(dueDate, periodicity),
      due_date: dueDate || null, status: 'pendiente', values: {}, updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('informes_submissions').insert(row);
    if (error && !silent) alert('Error al abrir el período: ' + error.message);
    return !error;
  };

  // Abrir el próximo período desde el tablero (admin).
  const abrirProximoPeriodo = async (t: Template) => {
    if (isReadOnly || !isAdmin) return;
    const subs = subsByTpl[t.id] || [];
    const abierta = subs.find(s => s.status === 'pendiente' || s.status === 'observado');
    if (abierta && !window.confirm(`Este informe ya tiene una entrega sin cerrar (${abierta.periodLabel}). ¿Abrir igual otro período?`)) return;
    const lastDue = subs.map(s => s.dueDate).filter(Boolean).sort().slice(-1)[0] || t.nextDueDate || todayISO();
    const proposed = t.periodicity === 'unico' ? lastDue! : advanceDate(lastDue!, t.periodicity);
    const input = window.prompt('Fecha de presentación del próximo período (AAAA-MM-DD):', proposed || todayISO());
    if (!input) return;
    const ok = await crearEntrega(t.id, input, t.periodicity);
    if (ok) {
      await supabase.from('informes_templates').update({ next_due_date: input, updated_at: new Date().toISOString() }).eq('id', t.id);
      await load();
    }
  };

  // ───────── Completar / revisar una entrega ─────────
  const openSub = (s: Submission) => setOpeningSub(JSON.parse(JSON.stringify(s)));
  const setSubValue = (fieldId: string, value: any) => setOpeningSub(s => s ? { ...s, values: { ...s.values, [fieldId]: value } } : s);

  const template = openingSub ? tplById[openingSub.templateId] : null;
  const canFill = !!openingSub && !isReadOnly && isResponsibleFor(template) &&
    (openingSub.status === 'pendiente' || openingSub.status === 'observado');
  const canReview = !!openingSub && !isReadOnly && isAdmin &&
    (openingSub.status === 'entregado' || openingSub.status === 'observado' || openingSub.status === 'aprobado');

  const persistSub = async (patch: Partial<Submission> & { status?: SubStatus }) => {
    if (!openingSub) return;
    setSaving(true);
    try {
      const merged = { ...openingSub, ...patch };
      const payload: any = {
        id: merged.id, template_id: merged.templateId, period_label: merged.periodLabel, due_date: merged.dueDate || null,
        status: merged.status, values: merged.values || {},
        submitted_at: merged.submittedAt || null, submitted_by: merged.submittedBy || null,
        reviewed_at: merged.reviewedAt || null, reviewed_by: merged.reviewedBy || null,
        observations: merged.observations || null, updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('informes_submissions').upsert(payload, { onConflict: 'id' });
      if (error) throw error;
      setOpeningSub(merged);
      await load();
    } catch (e: any) { alert('Error al guardar: ' + (e?.message || e)); }
    setSaving(false);
  };

  const guardarBorrador = () => persistSub({});
  const entregar = () => {
    if (!openingSub) return;
    persistSub({ status: 'entregado', submittedAt: new Date().toISOString(), submittedBy: currentUserName || '—' });
  };
  const aprobar = () => persistSub({ status: 'aprobado', reviewedAt: new Date().toISOString(), reviewedBy: currentUserName || '—' });
  const observar = () => {
    if (!openingSub) return;
    if (!(openingSub.observations || '').trim()) { alert('Escribí la observación antes de devolver el informe.'); return; }
    persistSub({ status: 'observado', reviewedAt: new Date().toISOString(), reviewedBy: currentUserName || '—' });
  };

  const borrarEntrega = async (s: Submission) => {
    if (isReadOnly || !isAdmin) return;
    if (!window.confirm(`¿Eliminar la entrega "${s.periodLabel}"?`)) return;
    await supabase.from('informes_submissions').delete().eq('id', s.id);
    if (openingSub?.id === s.id) setOpeningSub(null);
    await load();
  };

  // ───────── Render de un campo (completar / ver) ─────────
  const renderFieldValue = (f: Field, value: any, readOnly: boolean) => {
    const base = 'w-full bg-bg-accent border border-border-dim rounded px-2.5 py-2 text-[11px] text-text-main outline-none focus:border-brand-500';
    if (f.type === 'textarea') return <textarea readOnly={readOnly} rows={3} value={value ?? ''} onChange={e => setSubValue(f.id, e.target.value)} className={cn(base, 'resize-y')} />;
    if (f.type === 'number') return <input readOnly={readOnly} type="number" value={value ?? ''} onChange={e => setSubValue(f.id, e.target.value === '' ? '' : Number(e.target.value))} className={cn(base, 'font-mono')} />;
    if (f.type === 'date') return <input readOnly={readOnly} type="date" value={value ?? ''} onChange={e => setSubValue(f.id, e.target.value)} className={cn(base, 'font-mono')} />;
    if (f.type === 'boolean') return (
      <div className="flex gap-1.5">
        {[['si', 'Sí'], ['no', 'No']].map(([v, l]) => (
          <button key={v} type="button" disabled={readOnly} onClick={() => setSubValue(f.id, v)}
            className={cn('px-3 py-1.5 rounded text-[10px] font-black uppercase border transition-all',
              value === v ? (v === 'si' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-red-500 text-white border-red-500') : 'bg-bg-accent text-text-dim border-border-dim hover:border-brand-500/40')}>
            {l}
          </button>
        ))}
      </div>
    );
    if (f.type === 'table') return renderTableField(f, Array.isArray(value) ? value : [], readOnly);
    return <input readOnly={readOnly} type="text" value={value ?? ''} onChange={e => setSubValue(f.id, e.target.value)} className={base} />;
  };

  const renderTableField = (f: Field, rows: any[], readOnly: boolean) => {
    const cols = f.columns || [];
    const addRow = () => setSubValue(f.id, [...rows, Object.fromEntries(cols.map(c => [c.id, '']))]);
    const setCell = (ri: number, cid: string, val: any) => setSubValue(f.id, rows.map((r, i) => i === ri ? { ...r, [cid]: val } : r));
    const delRow = (ri: number) => setSubValue(f.id, rows.filter((_, i) => i !== ri));
    return (
      <div className="border border-border-dim rounded-lg overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-bg-accent/60">
              {cols.map(c => <th key={c.id} className="px-2 py-1.5 text-[8px] font-black uppercase tracking-wider text-text-dim border-b border-border-dim">{c.label || '—'}</th>)}
              {!readOnly && <th className="w-8 border-b border-border-dim" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={cols.length + 1} className="px-2 py-2 text-[9px] text-text-dim italic uppercase text-center">Sin filas</td></tr>
            ) : rows.map((r, ri) => (
              <tr key={ri} className="border-b border-border-dim/40">
                {cols.map(c => (
                  <td key={c.id} className="px-1.5 py-1">
                    <input readOnly={readOnly} type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'}
                      value={r[c.id] ?? ''} onChange={e => setCell(ri, c.id, c.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
                      className={cn('w-full bg-bg-card border border-border-dim rounded px-2 py-1 text-[10px] text-text-main outline-none focus:border-brand-500', c.type !== 'text' && 'font-mono')} />
                  </td>
                ))}
                {!readOnly && <td className="px-1 text-center"><button onClick={() => delRow(ri)} className="text-text-dim hover:text-red-500"><Trash2 size={12} /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!readOnly && (
          <button onClick={addRow} className="w-full text-[9px] font-black uppercase text-brand-500 hover:text-brand-600 py-1.5 flex items-center justify-center gap-1 border-t border-border-dim">
            <Plus size={11} /> Agregar fila
          </button>
        )}
      </div>
    );
  };

  const responsableTxt = (t?: Template | null) => {
    if (!t) return '—';
    const parts: string[] = [];
    if (t.responsibleUserName) parts.push(t.responsibleUserName);
    if (t.responsibleRole) parts.push(`Rol: ${roleName(t.responsibleRole)}`);
    return parts.length ? parts.join(' · ') : 'Sin asignar';
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* Encabezado */}
      <div className="bg-bg-card border border-border-dim rounded-lg p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-brand-500/10 p-2.5 rounded-lg"><FileCheck2 className="text-brand-500" size={20} /></div>
            <div>
              <h2 className="text-base font-black uppercase text-text-main tracking-wider">Informes de Gestión</h2>
              <p className="text-[9px] text-text-dim uppercase font-bold">Diseño, presentación y aprobación de informes por período</p>
            </div>
          </div>
          <div className="flex gap-1 bg-bg-accent p-1 rounded-lg">
            <button onClick={() => setTab('entregas')} className={cn('px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5', tab === 'entregas' ? 'bg-brand-500 text-white' : 'text-text-dim hover:text-text-main')}><ClipboardList size={12} /> {isAdmin ? 'Entregas' : 'Mis informes'}</button>
            {isAdmin && <button onClick={() => setTab('informes')} className={cn('px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5', tab === 'informes' ? 'bg-brand-500 text-white' : 'text-text-dim hover:text-text-main')}><Layers size={12} /> Informes</button>}
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-[10px] font-bold uppercase text-text-dim py-10">Cargando…</p>
      ) : tab === 'informes' && isAdmin ? (
        /* ───────── DEFINICIONES DE INFORMES ───────── */
        <>
          {!isReadOnly && (
            <div className="flex justify-end">
              <button onClick={nuevoInforme} className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all">
                <Plus size={14} /> Nuevo informe
              </button>
            </div>
          )}
          {templates.length === 0 ? (
            <p className="text-center text-[10px] font-bold uppercase text-text-dim py-12">No hay informes diseñados. Usá "Nuevo informe" para crear la estructura.</p>
          ) : (
            <div className="space-y-2">
              {templates.map(t => {
                const subs = subsByTpl[t.id] || [];
                const pend = subs.filter(s => s.status === 'pendiente' || s.status === 'observado').length;
                const nFields = t.structure.reduce((s, sec) => s + sec.fields.length, 0);
                return (
                  <div key={t.id} className="bg-bg-sidebar border border-border-dim rounded-lg p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[12px] font-black uppercase text-text-main flex items-center gap-1"><FileCheck2 size={13} className="text-brand-500" /> {t.name}</span>
                          <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-brand-500/10 text-brand-500 border border-brand-500/30">{perLabel(t.periodicity)}</span>
                          {!t.isActive && <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-text-dim/10 text-text-dim border border-border-dim">Inactivo</span>}
                          {pend > 0 && <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30">{pend} sin cerrar</span>}
                        </div>
                        <p className="text-[9px] font-bold uppercase text-text-dim mt-1 flex items-center gap-1"><UserIcon size={10} /> {responsableTxt(t)}</p>
                        <p className="text-[9px] font-bold uppercase text-text-dim mt-0.5">
                          {t.structure.length} sección(es) · {nFields} campo(s) · {subs.length} entrega(s)
                          {t.nextDueDate ? ` · Próx.: ${fmtDMY(t.nextDueDate)}` : ''}
                        </p>
                      </div>
                      {!isReadOnly && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => abrirProximoPeriodo(t)} title="Abrir próximo período" className="p-1.5 text-text-dim hover:text-emerald-500 transition-colors"><CalendarDays size={15} /></button>
                          <button onClick={() => toggleActivo(t)} title={t.isActive ? 'Desactivar' : 'Activar'} className="p-1.5 text-text-dim hover:text-brand-500 transition-colors"><RotateCcw size={15} /></button>
                          <button onClick={() => editarInforme(t)} title="Editar estructura" className="p-1.5 text-text-dim hover:text-brand-500 transition-colors"><Pencil size={15} /></button>
                          <button onClick={() => borrarInforme(t)} title="Eliminar" className="p-1.5 text-text-dim hover:text-red-500 transition-colors"><Trash2 size={15} /></button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* ───────── TABLERO DE ENTREGAS ───────── */
        <>
          <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 flex flex-wrap gap-3 items-center">
            <select value={fInforme} onChange={e => setFInforme(e.target.value)} className="bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none">
              <option value="">Todos los informes</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <div className="flex gap-1 bg-bg-accent rounded-lg p-1">
              {(['todos', 'pendiente', 'entregado', 'observado', 'aprobado'] as const).map(v => (
                <button key={v} onClick={() => setFEstado(v)} className={cn('px-3 py-1.5 rounded text-[9px] font-black uppercase transition-all', fEstado === v ? 'bg-brand-500 text-white' : 'text-text-dim hover:text-text-main')}>
                  {v === 'todos' ? 'Todos' : STATUS_INFO[v].label}
                </button>
              ))}
            </div>
            <span className="text-[10px] font-black text-text-dim uppercase tracking-widest ml-auto">{visibleSubs.length} entrega(s)</span>
          </div>

          {visibleSubs.length === 0 ? (
            <p className="text-center text-[10px] font-bold uppercase text-text-dim py-12">No hay entregas para este filtro.</p>
          ) : (
            <div className="space-y-2">
              {visibleSubs.map(({ s, t }) => {
                const si = STATUS_INFO[s.status];
                const vencida = (s.status === 'pendiente' || s.status === 'observado') && s.dueDate && s.dueDate < todayISO();
                return (
                  <div key={s.id} className="bg-bg-sidebar border border-border-dim rounded-lg p-3.5 flex items-start justify-between gap-3"
                    style={{ borderLeftWidth: '3px', borderLeftColor: si.color.includes('emerald') ? '#10b981' : si.color.includes('amber') ? '#f59e0b' : si.color.includes('red') ? '#ef4444' : '#3b82f6' }}>
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => openSub(s)}>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[11px] font-black uppercase text-text-main">{t.name}</span>
                        <span className="text-[8px] font-bold uppercase text-text-dim">· {s.periodLabel}</span>
                        {vencida && <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-red-500/15 text-red-500">Vencida</span>}
                      </div>
                      <p className="text-[9px] font-bold uppercase text-text-dim flex items-center gap-1"><UserIcon size={9} /> {responsableTxt(t)}</p>
                      <p className="text-[9px] font-bold uppercase text-text-dim mt-0.5 flex items-center gap-1"><Clock size={9} /> Presentar antes del {fmtDMY(s.dueDate)}
                        {s.reviewedBy ? ` · Revisó: ${s.reviewedBy}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn('text-[8px] font-black uppercase px-2 py-1 rounded border text-center', si.color)}>{si.label}</span>
                      <button onClick={() => openSub(s)} className="p-1.5 text-text-dim hover:text-brand-500" title="Abrir"><Eye size={15} /></button>
                      {isAdmin && !isReadOnly && <button onClick={() => borrarEntrega(s)} className="p-1.5 text-text-dim hover:text-red-500" title="Eliminar entrega"><Trash2 size={14} /></button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ───────── EDITOR DE INFORME (estructura) ───────── */}
      {editingTpl && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start md:items-center justify-center p-3 overflow-y-auto" onClick={() => !saving && setEditingTpl(null)}>
          <div className="bg-bg-card border border-border-dim rounded-xl max-w-3xl w-full my-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border-dim">
              <h3 className="text-sm font-black uppercase text-text-main flex items-center gap-2"><Layers size={16} className="text-brand-500" /> {editingTpl.id ? 'Editar informe' : 'Nuevo informe'}</h3>
              <button onClick={() => setEditingTpl(null)} className="p-1.5 text-text-dim hover:text-text-main"><X size={18} /></button>
            </div>

            <div className="p-4 space-y-4 max-h-[74vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Nombre del informe</label>
                  <input value={editingTpl.name} onChange={e => setTpl({ name: e.target.value })} placeholder="Ej: Informe Semanal de Ventas"
                    className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-brand-500" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Descripción (opcional)</label>
                  <input value={editingTpl.description} onChange={e => setTpl({ description: e.target.value })} placeholder="Para qué sirve este informe…"
                    className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Periodicidad</label>
                  <select value={editingTpl.periodicity} onChange={e => setTpl({ periodicity: e.target.value as Periodicity })}
                    className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-brand-500">
                    {PERIODICITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Fecha de presentación (1er período)</label>
                  <input type="date" value={editingTpl.nextDueDate || ''} onChange={e => setTpl({ nextDueDate: e.target.value || null })}
                    className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-mono font-bold text-text-main outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Responsable · Rol</label>
                  <select value={editingTpl.responsibleRole || ''} onChange={e => setTpl({ responsibleRole: e.target.value || null })}
                    className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-brand-500">
                    <option value="">— Sin rol —</option>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Responsable · Usuario</label>
                  <select value={editingTpl.responsibleUserId || ''} onChange={e => setTpl({ responsibleUserId: e.target.value || null })}
                    className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-brand-500">
                    <option value="">— Sin usuario —</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Estructura: secciones con campos y tablas */}
              <div className="space-y-3 pt-2 border-t border-border-dim">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-brand-500 flex items-center gap-2"><ListChecks size={14} /> Estructura ({editingTpl.structure.length} sección/es)</p>
                  <button onClick={addSection} type="button" className="text-[8px] font-black uppercase text-white bg-brand-500 hover:bg-brand-600 rounded px-2 py-1 flex items-center gap-1"><Plus size={11} /> Sección</button>
                </div>

                {editingTpl.structure.length === 0 && <p className="text-[9px] font-bold uppercase text-text-dim py-1">Sin secciones. Agregá la primera para armar el informe.</p>}

                {editingTpl.structure.map((sec, si) => (
                  <div key={sec.id} className="bg-bg-accent/40 border border-border-dim rounded-lg p-3 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-brand-500">{si + 1}.</span>
                      <input value={sec.title} onChange={e => setSection(si, { title: e.target.value })} placeholder="Título de la sección"
                        className="flex-1 bg-bg-card border border-border-dim rounded px-2 py-1.5 text-[11px] font-bold text-text-main outline-none focus:border-brand-500" />
                      <button onClick={() => delSection(si)} type="button" title="Eliminar sección" className="text-text-dim hover:text-red-500"><Trash2 size={13} /></button>
                    </div>

                    <div className="space-y-2 pl-1">
                      {sec.fields.map((f, fi) => (
                        <div key={f.id} className="bg-bg-card border border-border-dim rounded-lg p-2.5 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <input value={f.label} onChange={e => setField(si, fi, { label: e.target.value })} placeholder="Nombre del campo"
                              className="flex-1 min-w-[140px] bg-bg-accent border border-border-dim rounded px-2 py-1.5 text-[11px] text-text-main outline-none focus:border-brand-500" />
                            <select value={f.type} onChange={e => changeFieldType(si, fi, e.target.value as FieldType)}
                              className="bg-bg-accent border border-border-dim rounded px-2 py-1.5 text-[10px] font-bold uppercase text-text-main outline-none">
                              {FIELD_TYPES.map(ft => <option key={ft.id} value={ft.id}>{ft.label}</option>)}
                            </select>
                            <label className="flex items-center gap-1 text-[8px] font-black uppercase text-text-dim cursor-pointer select-none">
                              <input type="checkbox" checked={!!f.required} onChange={e => setField(si, fi, { required: e.target.checked })} /> Obligatorio
                            </label>
                            <button onClick={() => delField(si, fi)} type="button" className="text-text-dim hover:text-red-500 ml-auto"><Trash2 size={12} /></button>
                          </div>

                          {/* Configuración de columnas para tablas */}
                          {f.type === 'table' && (
                            <div className="ml-1 border-l-2 border-brand-500/30 pl-3 space-y-1.5">
                              <p className="text-[8px] font-black uppercase text-brand-500 flex items-center gap-1"><TableIcon size={11} /> Columnas de la tabla</p>
                              {(f.columns || []).map((c, ci) => (
                                <div key={c.id} className="flex items-center gap-2">
                                  <input value={c.label} onChange={e => setColumn(si, fi, ci, { label: e.target.value })} placeholder="Columna"
                                    className="flex-1 bg-bg-accent border border-border-dim rounded px-2 py-1 text-[10px] text-text-main outline-none focus:border-brand-500" />
                                  <select value={c.type} onChange={e => setColumn(si, fi, ci, { type: e.target.value as TableColumn['type'] })}
                                    className="bg-bg-accent border border-border-dim rounded px-2 py-1 text-[9px] font-bold uppercase text-text-main outline-none">
                                    {COL_TYPES.map(ct => <option key={ct.id} value={ct.id}>{ct.label}</option>)}
                                  </select>
                                  <button onClick={() => delColumn(si, fi, ci)} type="button" className="text-text-dim hover:text-red-500"><X size={12} /></button>
                                </div>
                              ))}
                              <button onClick={() => addColumn(si, fi)} type="button" className="text-[8px] font-black uppercase text-brand-500 hover:text-brand-600 flex items-center gap-1"><Plus size={10} /> Columna</button>
                            </div>
                          )}
                        </div>
                      ))}
                      <button onClick={() => addField(si)} type="button" className="text-[8px] font-black uppercase text-brand-500 hover:text-brand-600 flex items-center gap-1 pl-1"><Plus size={11} /> Agregar campo</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-4 border-t border-border-dim">
              <button onClick={() => setEditingTpl(null)} className="px-4 py-2 rounded text-[9px] font-black uppercase text-text-dim hover:text-text-main border border-border-dim">Cancelar</button>
              <button onClick={guardarInforme} disabled={saving} className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-5 py-2 rounded text-[9px] font-black uppercase tracking-widest disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar informe
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────── COMPLETAR / REVISAR ENTREGA ───────── */}
      {openingSub && template && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start md:items-center justify-center p-3 overflow-y-auto" onClick={() => !saving && setOpeningSub(null)}>
          <div className="bg-bg-card border border-border-dim rounded-xl max-w-3xl w-full my-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border-dim gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-black uppercase text-text-main flex items-center gap-2 truncate"><FileCheck2 size={16} className="text-brand-500" /> {template.name}</h3>
                <p className="text-[9px] font-bold uppercase text-text-dim mt-0.5">{openingSub.periodLabel} · Vence {fmtDMY(openingSub.dueDate)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn('text-[8px] font-black uppercase px-2 py-1 rounded border', STATUS_INFO[openingSub.status].color)}>{STATUS_INFO[openingSub.status].label}</span>
                <button onClick={() => setOpeningSub(null)} className="p-1.5 text-text-dim hover:text-text-main"><X size={18} /></button>
              </div>
            </div>

            <div className="p-4 space-y-4 max-h-[72vh] overflow-y-auto custom-scrollbar">
              {template.description && <p className="text-[10px] text-text-dim font-medium">{template.description}</p>}

              {/* Observaciones de la gerencia (si fue observado) */}
              {openingSub.status === 'observado' && openingSub.observations && (
                <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-red-500">Observaciones de la Gerencia</p>
                    <p className="text-[11px] text-text-main mt-0.5 whitespace-pre-wrap">{openingSub.observations}</p>
                  </div>
                </div>
              )}

              {template.structure.length === 0 ? (
                <p className="text-[10px] font-bold uppercase text-text-dim py-2">Este informe no tiene estructura cargada.</p>
              ) : template.structure.map(sec => (
                <div key={sec.id} className="space-y-2.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-brand-500 border-b border-border-dim/60 pb-1">{sec.title || 'Sección'}</p>
                  <div className="grid grid-cols-1 gap-3">
                    {sec.fields.map(f => (
                      <div key={f.id}>
                        <label className="text-[9px] font-black uppercase text-text-dim tracking-wider block mb-1">
                          {f.label || '—'}{f.required && <span className="text-red-500"> *</span>}
                        </label>
                        {renderFieldValue(f, openingSub.values?.[f.id], !canFill)}
                      </div>
                    ))}
                    {sec.fields.length === 0 && <p className="text-[9px] italic text-text-dim uppercase">Sección sin campos.</p>}
                  </div>
                </div>
              ))}

              {/* Datos de presentación / revisión */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-border-dim text-[9px] font-bold uppercase text-text-dim">
                {openingSub.submittedBy && <span className="flex items-center gap-1"><Send size={10} /> Entregado por {openingSub.submittedBy}{openingSub.submittedAt ? ` · ${new Date(openingSub.submittedAt).toLocaleDateString('es-AR')}` : ''}</span>}
                {openingSub.reviewedBy && <span className="flex items-center gap-1"><ShieldCheck size={10} /> Revisado por {openingSub.reviewedBy}{openingSub.reviewedAt ? ` · ${new Date(openingSub.reviewedAt).toLocaleDateString('es-AR')}` : ''}</span>}
              </div>

              {/* Panel de revisión de la gerencia */}
              {canReview && (
                <div className="bg-bg-accent/40 border border-border-dim rounded-lg p-3 space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-brand-500 flex items-center gap-1.5"><ShieldCheck size={12} /> Revisión de la Gerencia</p>
                  <textarea value={openingSub.observations || ''} onChange={e => setOpeningSub(s => s ? { ...s, observations: e.target.value } : s)} rows={2}
                    placeholder="Observaciones / anotaciones (obligatorio para observar)…"
                    className="w-full bg-bg-card border border-border-dim rounded px-2.5 py-2 text-[11px] text-text-main outline-none focus:border-brand-500 resize-y" />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 p-4 border-t border-border-dim flex-wrap">
              <div className="text-[9px] font-bold uppercase text-text-dim">
                {!canFill && !canReview && 'Solo lectura'}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {canFill && (
                  <>
                    <button onClick={guardarBorrador} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded text-[9px] font-black uppercase text-text-dim hover:text-text-main border border-border-dim disabled:opacity-50">
                      {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar borrador
                    </button>
                    <button onClick={entregar} disabled={saving} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded text-[9px] font-black uppercase tracking-widest disabled:opacity-50">
                      <Send size={13} /> Entregar
                    </button>
                  </>
                )}
                {canReview && (
                  <>
                    <button onClick={observar} disabled={saving} className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest disabled:opacity-50">
                      <AlertCircle size={13} /> Observar
                    </button>
                    <button onClick={aprobar} disabled={saving} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded text-[9px] font-black uppercase tracking-widest disabled:opacity-50">
                      <CheckCircle2 size={13} /> Aprobar
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ───────── Mapeos DB (snake) ↔ TS (camel) ─────────
function mapTemplate(a: any): Template {
  return {
    id: a.id, name: a.name || '', description: a.description || '', periodicity: (a.periodicity || 'mensual') as Periodicity,
    structure: Array.isArray(a.structure) ? a.structure : (a.structure ? safeParse(a.structure, []) : []),
    responsibleRole: a.responsible_role || null, responsibleUserId: a.responsible_user_id || null, responsibleUserName: a.responsible_user_name || null,
    nextDueDate: a.next_due_date || null, isActive: a.is_active !== false, createdBy: a.created_by || null,
  };
}
function mapSubmission(a: any): Submission {
  return {
    id: a.id, templateId: a.template_id, periodLabel: a.period_label || '', dueDate: a.due_date || null, status: (a.status || 'pendiente') as SubStatus,
    values: a.values && typeof a.values === 'object' ? a.values : safeParse(a.values, {}),
    submittedAt: a.submitted_at || null, submittedBy: a.submitted_by || null,
    reviewedAt: a.reviewed_at || null, reviewedBy: a.reviewed_by || null, observations: a.observations || null,
  };
}
function safeParse(v: any, fallback: any) { try { return JSON.parse(v); } catch { return fallback; } }
