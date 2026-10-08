/**
 * SPDX-License-Identifier: Apache-2.0
 * Gerencia General · Organigrama y Manual de Funciones (Fase 1).
 * Puestos en árbol jerárquico ("reporta a"), dibujado como organigrama (cajas y líneas).
 * A cada puesto se le asignan empleados (0..n; un puesto puede quedar vacante, ej. mozos).
 * Manual de funciones por puesto con secciones fijas: Objetivo, Funciones, Requisitos;
 * "Reporta a" y "Supervisa a" se derivan del árbol.
 * Tablas: org_puestos y org_asignaciones (RLS desactivado).
 */
import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Network, Loader2, X, Pencil, BookOpen, Download, Search, UserPlus, Building2 } from 'lucide-react';
import jsPDF from 'jspdf';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';
import { Branch } from '../types';

interface Puesto {
  id: string; nombre: string; area: string; parent_id: string | null; branch_id: string;
  objetivo: string; funciones: string; requisitos: string; sort_order: number;
}
interface Empleado { id: string; name: string; legajo: string; position: string; branch_id: string; active: boolean; }
const newId = () => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const emptyPuesto = (parent_id: string | null = null): Puesto => ({
  id: newId(), nombre: '', area: '', parent_id, branch_id: '', objetivo: '', funciones: '', requisitos: '', sort_order: 0,
});

export default function OrganigramaView({ branches = [], isReadOnly = false }: { branches?: Branch[]; isReadOnly?: boolean }) {
  const operative = useMemo(() => branches.filter(b => b.id !== 'all' && b.id !== 'virtual'), [branches]);
  const branchName = (id: string) => id ? (branches.find(b => b.id === id)?.name || id) : 'General';

  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [asign, setAsign] = useState<{ puesto_id: string; empleado_id: string }[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(false);

  const [editing, setEditing] = useState<Puesto | null>(null);
  const [editAsign, setEditAsign] = useState<string[]>([]);   // empleado_ids
  const [origAsign, setOrigAsign] = useState<string[]>([]);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [empSearch, setEmpSearch] = useState('');
  const [manual, setManual] = useState<Puesto | null>(null);

  const cargar = async () => {
    setLoading(true);
    try {
      const [pu, asg, emp] = await Promise.all([
        supabase.from('org_puestos').select('*').order('sort_order').order('nombre'),
        supabase.from('org_asignaciones').select('puesto_id, empleado_id'),
        supabase.from('employees').select('id, name, legajo, position, branch_id, active'),
      ]);
      setPuestos(((pu.data as any[]) || []).map(r => ({
        id: r.id, nombre: r.nombre || '', area: r.area || '', parent_id: r.parent_id || null, branch_id: r.branch_id || '',
        objetivo: r.objetivo || '', funciones: r.funciones || '', requisitos: r.requisitos || '', sort_order: Number(r.sort_order) || 0,
      })));
      setAsign(((asg.data as any[]) || []).map(r => ({ puesto_id: r.puesto_id, empleado_id: r.empleado_id })));
      setEmpleados(((emp.data as any[]) || []).map(r => ({ id: r.id, name: r.name || '', legajo: r.legajo || '', position: r.position || '', branch_id: r.branch_id || '', active: r.active !== false })));
    } catch (e) { console.warn('Organigrama load error', e); }
    finally { setLoading(false); }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  const empById = useMemo(() => { const m: Record<string, Empleado> = {}; empleados.forEach(e => m[e.id] = e); return m; }, [empleados]);
  const asignByPuesto = useMemo(() => { const m: Record<string, string[]> = {}; asign.forEach(a => { (m[a.puesto_id] ||= []).push(a.empleado_id); }); return m; }, [asign]);
  const childrenOf = useMemo(() => { const m: Record<string, Puesto[]> = {}; puestos.forEach(p => { const k = p.parent_id || '__root__'; (m[k] ||= []).push(p); }); return m; }, [puestos]);
  const roots = useMemo(() => puestos.filter(p => !p.parent_id || !puestos.some(x => x.id === p.parent_id)), [puestos]);
  const areas = useMemo(() => Array.from(new Set(puestos.map(p => p.area).filter(Boolean))).sort(), [puestos]);
  const nombreById = (id: string | null) => id ? (puestos.find(p => p.id === id)?.nombre || '') : '';

  // Descendientes de un puesto (para no permitir elegirlo como "reporta a" y evitar ciclos).
  const descendants = (id: string): Set<string> => {
    const out = new Set<string>(); const stack = [id];
    while (stack.length) { const cur = stack.pop()!; (childrenOf[cur] || []).forEach(c => { if (!out.has(c.id)) { out.add(c.id); stack.push(c.id); } }); }
    return out;
  };

  // ── Abrir editor ──
  const abrirNuevo = (parent_id: string | null = null) => { if (isReadOnly) return; setEditing(emptyPuesto(parent_id)); setEditAsign([]); setOrigAsign([]); setIsNew(true); setEmpSearch(''); };
  const abrirEditar = (p: Puesto) => { setEditing({ ...p }); const a = asignByPuesto[p.id] || []; setEditAsign([...a]); setOrigAsign([...a]); setIsNew(false); setEmpSearch(''); };

  const guardar = async () => {
    if (!editing || isReadOnly) return;
    if (!editing.nombre.trim()) { alert('Poné un nombre al puesto.'); return; }
    setSaving(true);
    try {
      const p = editing;
      const { error } = await supabase.from('org_puestos').upsert({
        id: p.id, nombre: p.nombre.trim(), area: p.area.trim() || null, parent_id: p.parent_id || null, branch_id: p.branch_id || null,
        objetivo: p.objetivo.trim() || null, funciones: p.funciones.trim() || null, requisitos: p.requisitos.trim() || null,
        sort_order: p.sort_order || 0, updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) throw error;
      const quitar = origAsign.filter(id => !editAsign.includes(id));
      const agregar = editAsign.filter(id => !origAsign.includes(id));
      if (quitar.length) await supabase.from('org_asignaciones').delete().eq('puesto_id', p.id).in('empleado_id', quitar);
      if (agregar.length) await supabase.from('org_asignaciones').upsert(agregar.map(eid => ({ puesto_id: p.id, empleado_id: eid })), { onConflict: 'puesto_id,empleado_id' });
      await cargar();
      setEditing(null);
    } catch (e: any) { alert('No se pudo guardar: ' + (e.message || e)); }
    finally { setSaving(false); }
  };

  const borrar = async (p: Puesto) => {
    if (isReadOnly) return;
    const hijos = (childrenOf[p.id] || []).length;
    if (!confirm(`¿Eliminar el puesto "${p.nombre}"?${hijos ? ` Sus ${hijos} subordinado(s) quedarán sin jefe (pasan a nivel superior).` : ''}`)) return;
    try {
      await supabase.from('org_puestos').delete().eq('id', p.id);
      await cargar();
      if (editing?.id === p.id) setEditing(null);
    } catch (e: any) { alert('No se pudo eliminar: ' + (e.message || e)); }
  };

  const exportManualPDF = (p: Puesto) => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = 18;
    doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.text(p.nombre || 'Puesto', 14, y); y += 7;
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(120);
    doc.text(`${p.area || 'Sin área'}${p.branch_id ? ' · ' + branchName(p.branch_id) : ''} · Manual de funciones`, 14, y); y += 8;
    doc.setTextColor(0);
    const sec = (titulo: string, texto: string, bullets = false) => {
      if (!texto || !texto.trim()) return;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(titulo, 14, y); y += 6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      const lines = bullets ? texto.split('\n').filter(l => l.trim()) : [texto];
      lines.forEach(l => {
        const wrapped = doc.splitTextToSize((bullets ? '•  ' : '') + l.trim(), W - 28);
        wrapped.forEach((wl: string) => { if (y > 280) { doc.addPage(); y = 18; } doc.text(wl, 14, y); y += 5.5; });
      });
      y += 3;
    };
    sec('Reporta a', nombreById(p.parent_id) || '—');
    const hijos = (childrenOf[p.id] || []).map(c => c.nombre).join(', ');
    sec('Supervisa a', hijos || '—');
    sec('Objetivo del puesto', p.objetivo);
    sec('Funciones / responsabilidades', p.funciones, true);
    sec('Requisitos', p.requisitos, true);
    doc.save(`manual_${(p.nombre || 'puesto').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
  };

  const inp = 'w-full bg-bg-card border border-border-dim rounded px-2 py-1.5 text-[11px] text-text-main outline-none focus:border-brand-500';
  const lbl = 'text-[9px] font-black uppercase text-text-dim tracking-widest';

  // ── Nodo del organigrama ──
  const asignadosNombres = (pid: string) => (asignByPuesto[pid] || []).map(eid => empById[eid]?.name).filter(Boolean) as string[];
  const renderNode = (p: Puesto) => {
    const hijos = (childrenOf[p.id] || []).slice().sort((a, b) => a.sort_order - b.sort_order || a.nombre.localeCompare(b.nombre));
    const nombres = asignadosNombres(p.id);
    return (
      <li key={p.id}>
        <div className="org-node bg-bg-sidebar border border-border-dim rounded-xl shadow-sm px-3 py-2.5 inline-block align-top text-left w-[190px]">
          <div className="font-black text-[12px] text-text-main uppercase leading-tight">{p.nombre}</div>
          {p.area && <div className="text-[8px] font-black uppercase tracking-widest text-brand-500 mt-0.5">{p.area}</div>}
          {p.branch_id && <div className="text-[8px] font-bold uppercase text-text-dim flex items-center gap-1"><Building2 size={8} /> {branchName(p.branch_id)}</div>}
          <div className="mt-1.5 min-h-[16px]">
            {nombres.length === 0 ? (
              <span className="text-[9px] font-bold uppercase text-amber-600 bg-amber-500/10 rounded px-1.5 py-0.5">Vacante</span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {nombres.slice(0, 3).map((n, i) => <span key={i} className="text-[9px] font-bold text-text-main bg-bg-accent/60 rounded px-1.5 py-0.5">{n}</span>)}
                {nombres.length > 3 && <span className="text-[9px] font-bold text-text-dim">+{nombres.length - 3}</span>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border-dim/40">
            <button onClick={() => setManual(p)} title="Manual de funciones" className="text-text-dim hover:text-brand-500"><BookOpen size={13} /></button>
            {!isReadOnly && <button onClick={() => abrirEditar(p)} title="Editar puesto" className="text-text-dim hover:text-brand-500"><Pencil size={13} /></button>}
            {!isReadOnly && <button onClick={() => abrirNuevo(p.id)} title="Agregar subordinado" className="text-text-dim hover:text-emerald-600"><UserPlus size={13} /></button>}
            {!isReadOnly && <button onClick={() => borrar(p)} title="Eliminar" className="text-text-dim hover:text-red-500 ml-auto"><Trash2 size={13} /></button>}
          </div>
        </div>
        {hijos.length > 0 && <ul>{hijos.map(renderNode)}</ul>}
      </li>
    );
  };

  const empFiltrados = empleados.filter(e => e.active).filter(e => {
    const q = empSearch.trim().toLowerCase();
    return !q || `${e.name} ${e.legajo} ${e.position}`.toLowerCase().includes(q);
  }).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-5">
      <style>{`
        .orgtree ul { position: relative; padding: 26px 0 0 0; margin: 0; display: flex; justify-content: center; list-style: none; }
        .orgtree li { position: relative; padding: 26px 10px 0 10px; list-style: none; display: flex; flex-direction: column; align-items: center; }
        .orgtree li::before, .orgtree li::after { content: ''; position: absolute; top: 0; width: 50%; height: 26px; border-top: 2px solid var(--org-line); }
        .orgtree li::before { right: 50%; }
        .orgtree li::after { left: 50%; border-left: 2px solid var(--org-line); }
        .orgtree li:only-child::before, .orgtree li:only-child::after { display: none; }
        .orgtree li:only-child { padding-top: 26px; }
        .orgtree li:first-child::before, .orgtree li:last-child::after { border: 0 none; }
        .orgtree li:last-child::before { border-right: 2px solid var(--org-line); }
        .orgtree ul ul::before { content: ''; position: absolute; top: 0; left: 50%; width: 0; height: 26px; border-left: 2px solid var(--org-line); }
        .orgtree > ul { padding-top: 0; }
        .orgtree > ul > li { padding-top: 0; }
        .orgtree > ul > li::before, .orgtree > ul > li::after { display: none; }
      `}</style>

      {/* Header */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Network size={18} className="text-brand-500" />
          <h2 className="text-lg font-black uppercase text-text-main tracking-tight">Organigrama</h2>
        </div>
        <p className="text-[11px] text-text-dim font-bold uppercase tracking-widest mb-4">Puestos, personas y manual de funciones</p>
        <div className="flex flex-wrap items-center gap-3">
          {!isReadOnly && (
            <button onClick={() => abrirNuevo(null)} className="flex items-center gap-1.5 bg-brand-500 text-white rounded-lg px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-brand-600">
              <Plus size={14} /> Nuevo puesto
            </button>
          )}
          {loading && <Loader2 size={15} className="animate-spin text-brand-500" />}
          <span className="text-[10px] text-text-dim font-bold uppercase ml-auto">{puestos.length} puesto(s) · {asign.length} asignación(es)</span>
        </div>
      </div>

      {/* Organigrama */}
      {puestos.length === 0 ? (
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-10 text-center">
          <Network size={40} className="mx-auto text-text-dim/30 mb-3" />
          <p className="text-[12px] font-black uppercase text-text-dim">Todavía no hay puestos cargados.</p>
          {!isReadOnly && <p className="text-[10px] text-text-dim mt-1">Empezá con el puesto más alto (ej. "Gerente General") y después agregá subordinados.</p>}
        </div>
      ) : (
        <div className="bg-bg-sidebar/40 border border-border-dim rounded-xl p-4 overflow-x-auto">
          <div className="orgtree inline-block min-w-full" style={{ ['--org-line' as any]: 'rgba(130,130,130,0.45)' }}>
            <ul>{roots.slice().sort((a, b) => a.sort_order - b.sort_order || a.nombre.localeCompare(b.nombre)).map(renderNode)}</ul>
          </div>
        </div>
      )}

      {/* ─────────── MANUAL (lectura) ─────────── */}
      {manual && (() => {
        const p = puestos.find(x => x.id === manual.id) || manual;
        const hijos = (childrenOf[p.id] || []).map(c => c.nombre);
        const nombres = asignadosNombres(p.id);
        const bullets = (t: string) => t.split('\n').map(l => l.trim()).filter(Boolean);
        const Sec = ({ t, children }: { t: string; children: any }) => (<div><h4 className="text-[10px] font-black uppercase tracking-widest text-brand-500 mb-1">{t}</h4><div className="text-[12px] text-text-main">{children}</div></div>);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setManual(null)}>
            <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-border-dim sticky top-0 bg-bg-sidebar z-10">
                <div>
                  <h3 className="text-[14px] font-black uppercase text-text-main tracking-wide">{p.nombre}</h3>
                  <p className="text-[9px] font-bold uppercase text-text-dim tracking-widest">{p.area || 'Sin área'}{p.branch_id ? ' · ' + branchName(p.branch_id) : ''} · Manual de funciones</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => exportManualPDF(p)} title="Exportar PDF" className="text-text-dim hover:text-red-500"><Download size={16} /></button>
                  {!isReadOnly && <button onClick={() => { setManual(null); abrirEditar(p); }} title="Editar" className="text-text-dim hover:text-brand-500"><Pencil size={16} /></button>}
                  <button onClick={() => setManual(null)} className="text-text-dim hover:text-text-main"><X size={18} /></button>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Sec t="Reporta a">{nombreById(p.parent_id) || <span className="text-text-dim">—</span>}</Sec>
                  <Sec t="Supervisa a">{hijos.length ? hijos.join(', ') : <span className="text-text-dim">—</span>}</Sec>
                </div>
                <Sec t="Personas asignadas">{nombres.length ? <div className="flex flex-wrap gap-1.5 mt-1">{nombres.map((n, i) => <span key={i} className="text-[10px] font-bold bg-bg-accent/60 rounded px-2 py-0.5">{n}</span>)}</div> : <span className="text-amber-600 font-bold">Vacante</span>}</Sec>
                <Sec t="Objetivo del puesto">{p.objetivo ? <p className="whitespace-pre-wrap leading-relaxed">{p.objetivo}</p> : <span className="text-text-dim">—</span>}</Sec>
                <Sec t="Funciones / responsabilidades">{bullets(p.funciones).length ? <ul className="list-disc pl-5 space-y-0.5 mt-1">{bullets(p.funciones).map((f, i) => <li key={i}>{f}</li>)}</ul> : <span className="text-text-dim">—</span>}</Sec>
                <Sec t="Requisitos">{bullets(p.requisitos).length ? <ul className="list-disc pl-5 space-y-0.5 mt-1">{bullets(p.requisitos).map((f, i) => <li key={i}>{f}</li>)}</ul> : <span className="text-text-dim">—</span>}</Sec>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─────────── EDITOR ─────────── */}
      {editing && (() => {
        const desc = isNew ? new Set<string>() : descendants(editing.id);
        const opcionesParent = puestos.filter(p => p.id !== editing.id && !desc.has(p.id));
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && setEditing(null)}>
            <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-border-dim sticky top-0 bg-bg-sidebar z-10">
                <h3 className="text-[13px] font-black uppercase text-text-main tracking-wide">{isNew ? 'Nuevo puesto' : 'Editar puesto'}</h3>
                <button onClick={() => !saving && setEditing(null)} className="text-text-dim hover:text-text-main"><X size={18} /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2"><label className={lbl}>Nombre del puesto *</label><input autoFocus disabled={isReadOnly} className={cn(inp, 'mt-1')} placeholder="Ej. Encargado de Sucursal / Mozo" value={editing.nombre} onChange={e => setEditing({ ...editing, nombre: e.target.value })} /></div>
                  <div><label className={lbl}>Área</label><input disabled={isReadOnly} list="area-list" className={cn(inp, 'mt-1')} placeholder="Ej. Operaciones / Salón / Cocina" value={editing.area} onChange={e => setEditing({ ...editing, area: e.target.value })} /><datalist id="area-list">{areas.map(a => <option key={a} value={a} />)}</datalist></div>
                  <div><label className={lbl}>Reporta a</label><select disabled={isReadOnly} className={cn(inp, 'mt-1')} value={editing.parent_id || ''} onChange={e => setEditing({ ...editing, parent_id: e.target.value || null })}><option value="">— (puesto más alto)</option>{opcionesParent.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
                  <div><label className={lbl}>Sucursal / Área física</label><select disabled={isReadOnly} className={cn(inp, 'mt-1')} value={editing.branch_id} onChange={e => setEditing({ ...editing, branch_id: e.target.value })}><option value="">General</option>{operative.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
                  <div><label className={lbl}>Orden (entre pares)</label><input type="number" disabled={isReadOnly} className={cn(inp, 'mt-1 font-mono')} value={editing.sort_order || 0} onChange={e => setEditing({ ...editing, sort_order: parseInt(e.target.value) || 0 })} /></div>
                </div>

                {/* Manual */}
                <div className="border-t border-border-dim pt-3 space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-500">Manual de funciones</h4>
                  <div><label className={lbl}>Objetivo del puesto</label><textarea disabled={isReadOnly} className={cn(inp, 'mt-1 h-16 resize-none')} placeholder="Para qué existe el puesto…" value={editing.objetivo} onChange={e => setEditing({ ...editing, objetivo: e.target.value })} /></div>
                  <div><label className={lbl}>Funciones / responsabilidades <span className="text-text-dim/70 normal-case">(una por línea)</span></label><textarea disabled={isReadOnly} className={cn(inp, 'mt-1 h-28 resize-none')} placeholder={'Abrir el local\nControlar caja\nSupervisar al equipo…'} value={editing.funciones} onChange={e => setEditing({ ...editing, funciones: e.target.value })} /></div>
                  <div><label className={lbl}>Requisitos <span className="text-text-dim/70 normal-case">(una por línea)</span></label><textarea disabled={isReadOnly} className={cn(inp, 'mt-1 h-20 resize-none')} placeholder={'Experiencia previa\nDisponibilidad horaria…'} value={editing.requisitos} onChange={e => setEditing({ ...editing, requisitos: e.target.value })} /></div>
                </div>

                {/* Asignados */}
                <div className="border-t border-border-dim pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-500">Personas asignadas <span className="text-text-dim">({editAsign.length})</span></h4>
                  </div>
                  {editAsign.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {editAsign.map(eid => (
                        <span key={eid} className="flex items-center gap-1 text-[10px] font-bold bg-brand-500/10 text-brand-600 border border-brand-500/25 rounded px-2 py-0.5">
                          {empById[eid]?.name || eid}
                          {!isReadOnly && <button onClick={() => setEditAsign(prev => prev.filter(x => x !== eid))} className="hover:text-red-500"><X size={11} /></button>}
                        </span>
                      ))}
                    </div>
                  )}
                  {!isReadOnly && (
                    <>
                      <div className="relative mb-2">
                        <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-dim" />
                        <input value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="Buscar empleado por nombre, legajo o puesto…" className={cn(inp, 'pl-7')} />
                      </div>
                      <div className="max-h-40 overflow-y-auto border border-border-dim rounded-lg divide-y divide-border-dim/40">
                        {empFiltrados.length === 0 ? <p className="text-[10px] text-text-dim italic p-3">No hay empleados que coincidan.</p> : empFiltrados.slice(0, 50).map(e => {
                          const sel = editAsign.includes(e.id);
                          return (
                            <button key={e.id} onClick={() => setEditAsign(prev => sel ? prev.filter(x => x !== e.id) : [...prev, e.id])}
                              className={cn('w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-bg-accent/40', sel && 'bg-brand-500/5')}>
                              <span className="text-[11px] text-text-main">{e.name} {e.legajo && <span className="text-text-dim text-[9px]">#{e.legajo}</span>} {e.position && <span className="text-text-dim text-[9px]">· {e.position}</span>}</span>
                              <span className={cn('text-[9px] font-black uppercase px-1.5 py-0.5 rounded shrink-0', sel ? 'bg-brand-500 text-white' : 'bg-bg-accent text-text-dim')}>{sel ? '✓' : '+'}</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[9px] text-text-dim mt-1">Si la persona no está, cargala primero en <b className="text-text-main">Empleados</b>. Un puesto sin asignar queda "Vacante".</p>
                    </>
                  )}
                </div>
              </div>
              {!isReadOnly && (
                <div className="flex justify-between gap-2 px-5 py-3 border-t border-border-dim sticky bottom-0 bg-bg-sidebar">
                  {!isNew ? <button onClick={() => borrar(editing)} disabled={saving} className="text-[10px] font-black uppercase text-red-500 px-3 py-2 hover:bg-red-500/10 rounded">Eliminar</button> : <span />}
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(null)} disabled={saving} className="text-[10px] font-black uppercase text-text-dim px-4 py-2 hover:text-text-main">Cancelar</button>
                    <button onClick={guardar} disabled={saving} className="flex items-center gap-2 bg-brand-500 text-white rounded-lg px-5 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 disabled:opacity-50">{saving ? <Loader2 size={13} className="animate-spin" /> : null} Guardar</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
