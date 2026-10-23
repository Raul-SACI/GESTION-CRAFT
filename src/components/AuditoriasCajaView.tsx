/**
 * SPDX-License-Identifier: Apache-2.0
 * Tesorería · Auditorías sorpresa de caja.
 * Una persona de administración visita la caja de un restaurante y realiza un arqueo:
 *  1) Información general (sucursal, auditor, cajero, turno, horarios)
 *  2) Arqueo físico de efectivo (desglose de billetes) + conceptos de control
 *  3) Control de medios de pago electrónicos / POS
 *  4) Checklist operativo de caja (editable)
 *  5) Evaluación del cajero (preguntas editables: descuentos, Club Craft, orden…)
 *  6) Observaciones finales
 * Tablas: tes_auditorias_caja y tes_config (RLS con políticas permisivas).
 */
import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, X, Pencil, Eye, Search, FileText, Loader2, Settings, ClipboardCheck, Check } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';
import { Branch } from '../types';

const newId = () => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const fmt = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`;
const N = (v: any) => Number(v) || 0;

// Denominaciones de billetes/monedas (ARS).
const DENOMS = [20000, 10000, 2000, 1000, 500, 200, 100, 50, 20, 10];

type Resp = 'si' | 'no' | 'parcial' | 'na';
type Cumple = 'cumple' | 'no_cumple' | 'na';
const RESP_LBL: Record<Resp, string> = { si: 'Sí', no: 'No', parcial: 'Parcial', na: 'N/A' };
const CUMPLE_LBL: Record<Cumple, string> = { cumple: 'Cumple', no_cumple: 'No cumple', na: 'N/A' };

interface MedioPago { id: string; medio: string; montoSistema: number; montoComprobantes: number; }
interface ChecklistItem { id: string; punto: string; resultado: Cumple; obs: string; }
interface EvalItem { id: string; pregunta: string; respuesta: Resp; obs: string; }
interface Audit {
  id: string; branch_id: string; fecha: string | null; auditor: string; cajero: string; turno: string;
  hora_inicio: string; hora_fin: string; sistema: string;
  denom: Record<string, number>;
  cajaChicaInicial: number; ventasEfectivoSistema: number; gastosAutorizados: number;
  medios: MedioPago[]; checklist: ChecklistItem[]; evalCajero: EvalItem[]; observaciones: string;
}

// Defaults (si no hay config guardada). Se pueden editar desde "Configurar".
const DEF_CHECKLIST = [
  'Caja cerrada y con llave mientras no se cobra',
  'Solo el cajero asignado manipula la caja registradora',
  'Todas las mesas abiertas tienen comanda / pedido en sistema',
  'Anulaciones y descuentos cuentan con firma del encargado',
  'Sin valores o dinero personal dentro de la caja',
  'Comprobantes de gastos de caja chica con factura adjunta',
];
const DEF_PREGUNTAS = [
  '¿Utiliza correctamente los descuentos de caja?',
  '¿Accede a Club Craft y sabe realizar la carga de puntos y demás operaciones?',
  '¿Tiene ordenado el efectivo y/o papeles de caja al momento de la auditoría?',
];
const DEF_MEDIOS = ['Tarjetas', 'Pedidos Ya online', 'Otros'];

// Derivados del arqueo
const totalFisico = (denom: Record<string, number>) => DENOMS.reduce((s, d) => s + d * N(denom[d]), 0);
const efectivoEsperado = (a: Pick<Audit, 'cajaChicaInicial' | 'ventasEfectivoSistema' | 'gastosAutorizados'>) =>
  N(a.cajaChicaInicial) + N(a.ventasEfectivoSistema) - N(a.gastosAutorizados);
const difEfectivo = (a: Audit) => totalFisico(a.denom) - efectivoEsperado(a);

export default function AuditoriasCajaView({ branches = [], isReadOnly = false }: { branches?: Branch[]; isReadOnly?: boolean }) {
  const operative = useMemo(() => branches.filter(b => b.id !== 'all' && b.id !== 'virtual'), [branches]);
  const branchName = (id: string) => id ? (branches.find(b => b.id === id)?.name || id) : '—';

  const [rows, setRows] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(false);
  const [cfgChecklist, setCfgChecklist] = useState<string[]>(DEF_CHECKLIST);
  const [cfgPreguntas, setCfgPreguntas] = useState<string[]>(DEF_PREGUNTAS);

  // Filtros
  const [fBranch, setFBranch] = useState('');
  const [fTexto, setFTexto] = useState('');

  // Modales
  const [editing, setEditing] = useState<Audit | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [viewing, setViewing] = useState<Audit | null>(null);
  const [saving, setSaving] = useState(false);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [savingCfg, setSavingCfg] = useState(false);

  const inp = 'w-full bg-bg-card border border-border-dim rounded px-2 py-1.5 text-[11px] text-text-main outline-none focus:border-brand-500';
  const lbl = 'text-[9px] font-black uppercase text-text-dim tracking-widest';

  const mapRow = (r: any): Audit => ({
    id: r.id, branch_id: r.branch_id || '', fecha: r.fecha || null, auditor: r.auditor || '', cajero: r.cajero || '',
    turno: r.turno || '', hora_inicio: r.hora_inicio || '', hora_fin: r.hora_fin || '', sistema: r.sistema || '',
    denom: (r.efectivo_denom && typeof r.efectivo_denom === 'object') ? r.efectivo_denom : {},
    cajaChicaInicial: N(r.caja_chica_inicial), ventasEfectivoSistema: N(r.ventas_efectivo_sistema), gastosAutorizados: N(r.gastos_autorizados),
    medios: Array.isArray(r.medios_pago) ? r.medios_pago.map((m: any) => ({ id: m.id || newId(), medio: String(m.medio || ''), montoSistema: N(m.montoSistema), montoComprobantes: N(m.montoComprobantes) })) : [],
    checklist: Array.isArray(r.checklist) ? r.checklist.map((c: any) => ({ id: c.id || newId(), punto: String(c.punto || ''), resultado: (c.resultado || 'na') as Cumple, obs: String(c.obs || '') })) : [],
    evalCajero: Array.isArray(r.eval_cajero) ? r.eval_cajero.map((e: any) => ({ id: e.id || newId(), pregunta: String(e.pregunta || ''), respuesta: (e.respuesta || 'na') as Resp, obs: String(e.obs || '') })) : [],
    observaciones: r.observaciones || '',
  });

  const cargar = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('tes_auditorias_caja').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false });
      setRows(((data as any[]) || []).map(mapRow));
    } catch (e) { console.warn('Auditorías load error', e); }
    finally { setLoading(false); }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('tes_config').select('value').eq('key', 'auditorias').maybeSingle();
      const v = (data?.value as any) || {};
      if (Array.isArray(v.checklist) && v.checklist.length) setCfgChecklist(v.checklist);
      if (Array.isArray(v.preguntasCajero) && v.preguntasCajero.length) setCfgPreguntas(v.preguntasCajero);
    })().catch(() => {});
  }, []);

  const saveConfig = async () => {
    setSavingCfg(true);
    try {
      const checklist = cfgChecklist.map(s => s.trim()).filter(Boolean);
      const preguntasCajero = cfgPreguntas.map(s => s.trim()).filter(Boolean);
      const { error } = await supabase.from('tes_config').upsert({ key: 'auditorias', value: { checklist, preguntasCajero }, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      setCfgChecklist(checklist); setCfgPreguntas(preguntasCajero); setCfgOpen(false);
    } catch (e: any) { alert('No se pudo guardar la configuración: ' + (e.message || e)); }
    finally { setSavingCfg(false); }
  };

  const nuevaAuditoria = (): Audit => ({
    id: newId(), branch_id: operative[0]?.id || '', fecha: new Date().toISOString().slice(0, 10),
    auditor: '', cajero: '', turno: '', hora_inicio: '', hora_fin: '', sistema: '',
    denom: {}, cajaChicaInicial: 0, ventasEfectivoSistema: 0, gastosAutorizados: 0,
    medios: DEF_MEDIOS.map(m => ({ id: newId(), medio: m, montoSistema: 0, montoComprobantes: 0 })),
    checklist: cfgChecklist.map(p => ({ id: newId(), punto: p, resultado: 'cumple' as Cumple, obs: '' })),
    evalCajero: cfgPreguntas.map(p => ({ id: newId(), pregunta: p, respuesta: 'si' as Resp, obs: '' })),
    observaciones: '',
  });

  const abrirNuevo = () => { if (isReadOnly) return; setEditing(nuevaAuditoria()); setIsNew(true); };
  const abrirEditar = (a: Audit) => { setEditing(JSON.parse(JSON.stringify(a))); setIsNew(false); };

  const guardar = async () => {
    if (!editing || isReadOnly) return;
    if (!editing.branch_id) { alert('Elegí la sucursal.'); return; }
    if (!editing.cajero.trim()) { alert('Cargá el nombre y apellido del cajero.'); return; }
    setSaving(true);
    try {
      const a = editing;
      const { error } = await supabase.from('tes_auditorias_caja').upsert({
        id: a.id, branch_id: a.branch_id, fecha: a.fecha || null, auditor: a.auditor.trim() || null, cajero: a.cajero.trim(),
        turno: a.turno.trim() || null, hora_inicio: a.hora_inicio || null, hora_fin: a.hora_fin || null, sistema: a.sistema.trim() || null,
        efectivo_denom: a.denom, total_efectivo_fisico: totalFisico(a.denom),
        caja_chica_inicial: N(a.cajaChicaInicial), ventas_efectivo_sistema: N(a.ventasEfectivoSistema), gastos_autorizados: N(a.gastosAutorizados),
        efectivo_neto_rendido: efectivoEsperado(a), diferencia_efectivo: difEfectivo(a),
        medios_pago: a.medios.map(m => ({ id: m.id, medio: m.medio.trim(), montoSistema: N(m.montoSistema), montoComprobantes: N(m.montoComprobantes) })),
        checklist: a.checklist.map(c => ({ id: c.id, punto: c.punto, resultado: c.resultado, obs: c.obs.trim() })),
        eval_cajero: a.evalCajero.map(e => ({ id: e.id, pregunta: e.pregunta, respuesta: e.respuesta, obs: e.obs.trim() })),
        observaciones: a.observaciones.trim() || null, updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) throw error;
      setEditing(null); await cargar();
    } catch (e: any) { alert('No se pudo guardar: ' + (e.message || e)); }
    finally { setSaving(false); }
  };

  const borrar = async (a: Audit) => {
    if (isReadOnly) return;
    if (!confirm(`¿Borrar la auditoría de ${branchName(a.branch_id)} del ${a.fecha || ''}?`)) return;
    try { await supabase.from('tes_auditorias_caja').delete().eq('id', a.id); await cargar(); }
    catch (e: any) { alert('No se pudo borrar: ' + (e.message || e)); }
  };

  const listaFiltrada = useMemo(() => {
    const q = fTexto.trim().toLowerCase();
    return rows.filter(a => {
      if (fBranch && a.branch_id !== fBranch) return false;
      if (q && !(`${a.cajero} ${a.auditor} ${a.turno}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, fBranch, fTexto]);

  // Resumen de cumplimiento de una auditoría
  const resumen = (a: Audit) => {
    const chkTot = a.checklist.filter(c => c.resultado !== 'na').length;
    const chkOk = a.checklist.filter(c => c.resultado === 'cumple').length;
    const evTot = a.evalCajero.filter(e => e.respuesta !== 'na').length;
    const evOk = a.evalCajero.filter(e => e.respuesta === 'si').length;
    return { chkTot, chkOk, evTot, evOk };
  };

  const exportPDF = (a: Audit) => {
    const doc = new jsPDF();
    const dif = difEfectivo(a);
    doc.setFontSize(14); doc.text('AUDITORÍA SORPRESA DE CAJA · CRAFT', 14, 16);
    doc.setFontSize(9);
    doc.text(`Sucursal: ${branchName(a.branch_id)}    Fecha: ${a.fecha || '—'}    Turno: ${a.turno || '—'}`, 14, 23);
    doc.text(`Auditor: ${a.auditor || '—'}    Cajero: ${a.cajero || '—'}    Horario: ${a.hora_inicio || '—'} a ${a.hora_fin || '—'}`, 14, 28);
    autoTable(doc, {
      startY: 33, head: [['Arqueo de efectivo', 'Monto']], theme: 'grid', styles: { fontSize: 8 },
      body: [
        ['Caja chica inicial', fmt(a.cajaChicaInicial)],
        ['Ventas en efectivo (sistema)', fmt(a.ventasEfectivoSistema)],
        ['Gastos autorizados c/comprobante', fmt(a.gastosAutorizados)],
        ['(=) Efectivo esperado en caja', fmt(efectivoEsperado(a))],
        ['Total efectivo físico recontado', fmt(totalFisico(a.denom))],
        [`Diferencia (${dif >= 0 ? 'sobrante' : 'faltante'})`, fmt(dif)],
      ],
    });
    const y1 = (doc as any).lastAutoTable.finalY + 4;
    autoTable(doc, {
      startY: y1, head: [['Medio de pago', 'Sistema', 'Comprobantes/POS', 'Diferencia']], theme: 'grid', styles: { fontSize: 8 },
      body: a.medios.map(m => [m.medio, fmt(m.montoSistema), fmt(m.montoComprobantes), fmt(N(m.montoSistema) - N(m.montoComprobantes))]),
    });
    const y2 = (doc as any).lastAutoTable.finalY + 4;
    autoTable(doc, {
      startY: y2, head: [['Checklist operativo', 'Resultado', 'Obs.']], theme: 'grid', styles: { fontSize: 8 },
      body: a.checklist.map(c => [c.punto, CUMPLE_LBL[c.resultado], c.obs]),
    });
    const y3 = (doc as any).lastAutoTable.finalY + 4;
    autoTable(doc, {
      startY: y3, head: [['Evaluación del cajero', 'Resp.', 'Obs.']], theme: 'grid', styles: { fontSize: 8 },
      body: a.evalCajero.map(e => [e.pregunta, RESP_LBL[e.respuesta], e.obs]),
    });
    if (a.observaciones) {
      const y4 = (doc as any).lastAutoTable.finalY + 6;
      doc.setFontSize(9); doc.text('Observaciones:', 14, y4);
      doc.setFontSize(8); doc.text(doc.splitTextToSize(a.observaciones, 180), 14, y4 + 5);
    }
    doc.save(`auditoria_caja_${branchName(a.branch_id).replace(/\s+/g, '_')}_${a.fecha || ''}.pdf`);
  };

  const difColor = (d: number) => Math.abs(d) < 0.5 ? 'text-emerald-600' : 'text-red-500';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-bg-sidebar border border-border-dim rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-brand-500/10 text-brand-500 rounded-xl p-2.5"><ClipboardCheck size={22} /></div>
            <div>
              <h2 className="text-lg font-black text-text-main uppercase tracking-tight">Auditorías de Caja</h2>
              <p className="text-[11px] font-bold text-text-dim uppercase tracking-wider">Arqueo sorpresa · control operativo · evaluación del cajero</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCfgOpen(true)} className="flex items-center gap-1.5 text-[10px] font-black uppercase text-text-dim border border-border-dim rounded-lg px-3 py-2 hover:text-text-main hover:border-brand-500"><Settings size={13} /> Configurar</button>
            {!isReadOnly && <button onClick={abrirNuevo} className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-4 py-2 text-[11px] font-black uppercase tracking-wider"><Plus size={15} /> Nueva auditoría</button>}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-dim" />
          <input value={fTexto} onChange={e => setFTexto(e.target.value)} placeholder="Buscar cajero / auditor…" className={cn(inp, 'pl-7 w-56')} />
        </div>
        <select value={fBranch} onChange={e => setFBranch(e.target.value)} className={cn(inp, 'w-48')}><option value="">Sucursal: todas</option>{operative.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      </div>

      {/* Lista */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-[12px] border-collapse min-w-[860px]">
          <thead><tr className="bg-bg-accent/20 text-text-dim">
            <th className="p-2.5 text-left text-[9px] font-black uppercase tracking-widest">Fecha</th>
            <th className="p-2.5 text-left text-[9px] font-black uppercase tracking-widest">Sucursal</th>
            <th className="p-2.5 text-left text-[9px] font-black uppercase tracking-widest">Cajero</th>
            <th className="p-2.5 text-left text-[9px] font-black uppercase tracking-widest">Auditor</th>
            <th className="p-2.5 text-center text-[9px] font-black uppercase tracking-widest">Turno</th>
            <th className="p-2.5 text-right text-[9px] font-black uppercase tracking-widest">Dif. efectivo</th>
            <th className="p-2.5 text-center text-[9px] font-black uppercase tracking-widest">Checklist</th>
            <th className="p-2.5 text-center text-[9px] font-black uppercase tracking-widest">Cajero</th>
            <th className="w-24" />
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="p-8 text-center text-text-dim"><Loader2 size={20} className="animate-spin mx-auto" /></td></tr>
            ) : listaFiltrada.length === 0 ? (
              <tr><td colSpan={9} className="p-8 text-center text-text-dim text-[11px] italic">Sin auditorías. {!isReadOnly && 'Registrá una con "Nueva auditoría".'}</td></tr>
            ) : listaFiltrada.map(a => {
              const dif = difEfectivo(a); const r = resumen(a);
              return (
                <tr key={a.id} className="border-t border-border-dim/25 hover:bg-bg-accent/20">
                  <td className="p-2.5 font-mono text-text-dim text-[11px]">{a.fecha ? new Date(a.fecha + 'T00:00:00').toLocaleDateString('es-AR') : '—'}</td>
                  <td className="p-2.5 font-bold text-text-main">{branchName(a.branch_id)}</td>
                  <td className="p-2.5 text-text-main">{a.cajero || '—'}</td>
                  <td className="p-2.5 text-text-dim">{a.auditor || '—'}</td>
                  <td className="p-2.5 text-center text-text-dim">{a.turno || '—'}</td>
                  <td className={cn('p-2.5 text-right font-mono font-bold', difColor(dif))}>{dif > 0 ? '+' : ''}{fmt(dif)}</td>
                  <td className="p-2.5 text-center"><span className={cn('text-[9px] font-black px-2 py-0.5 rounded', r.chkTot && r.chkOk === r.chkTot ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/15 text-amber-600')}>{r.chkOk}/{r.chkTot || 0}</span></td>
                  <td className="p-2.5 text-center"><span className={cn('text-[9px] font-black px-2 py-0.5 rounded', r.evTot && r.evOk === r.evTot ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/15 text-amber-600')}>{r.evOk}/{r.evTot || 0}</span></td>
                  <td className="p-2.5">
                    <div className="flex items-center justify-center gap-1.5">
                      <button onClick={() => setViewing(a)} className="text-text-dim hover:text-brand-500" title="Ver"><Eye size={15} /></button>
                      <button onClick={() => exportPDF(a)} className="text-text-dim hover:text-red-500" title="PDF"><FileText size={15} /></button>
                      <button onClick={() => abrirEditar(a)} className="text-text-dim hover:text-brand-500" title="Editar"><Pencil size={14} /></button>
                      {!isReadOnly && <button onClick={() => borrar(a)} className="text-text-dim hover:text-red-500" title="Borrar"><Trash2 size={14} /></button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ───────── Modal edición ───────── */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4" onClick={() => !saving && setEditing(null)}>
          <div className="bg-bg-sidebar border border-border-dim rounded-2xl shadow-2xl w-full max-w-4xl my-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border-dim sticky top-0 bg-bg-sidebar rounded-t-2xl z-10">
              <h3 className="text-sm font-black uppercase tracking-wider text-text-main">{isNew ? 'Nueva auditoría de caja' : 'Editar auditoría'}</h3>
              <button onClick={() => !saving && setEditing(null)} className="text-text-dim hover:text-text-main"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-5">
              {/* 1. Información general */}
              <section>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-500 mb-2">1 · Información general</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div><label className={lbl}>Sucursal / Bar</label><select disabled={isReadOnly} className={cn(inp, 'mt-1')} value={editing.branch_id} onChange={e => setEditing({ ...editing, branch_id: e.target.value })}><option value="">—</option>{operative.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
                  <div><label className={lbl}>Fecha de auditoría</label><input type="date" disabled={isReadOnly} className={cn(inp, 'mt-1')} value={editing.fecha || ''} onChange={e => setEditing({ ...editing, fecha: e.target.value || null })} /></div>
                  <div><label className={lbl}>Auditor a cargo</label><input disabled={isReadOnly} className={cn(inp, 'mt-1')} value={editing.auditor} onChange={e => setEditing({ ...editing, auditor: e.target.value })} /></div>
                  <div><label className={lbl}>Cajero / Encargado (nombre y apellido)</label><input disabled={isReadOnly} className={cn(inp, 'mt-1')} value={editing.cajero} onChange={e => setEditing({ ...editing, cajero: e.target.value })} /></div>
                  <div><label className={lbl}>Turno</label><input disabled={isReadOnly} className={cn(inp, 'mt-1')} placeholder="Mañana / Tarde / Noche" value={editing.turno} onChange={e => setEditing({ ...editing, turno: e.target.value })} /></div>
                  <div><label className={lbl}>Sistema</label><input disabled={isReadOnly} className={cn(inp, 'mt-1')} value={editing.sistema} onChange={e => setEditing({ ...editing, sistema: e.target.value })} /></div>
                  <div><label className={lbl}>Hora inicio</label><input type="time" disabled={isReadOnly} className={cn(inp, 'mt-1')} value={editing.hora_inicio} onChange={e => setEditing({ ...editing, hora_inicio: e.target.value })} /></div>
                  <div><label className={lbl}>Hora fin</label><input type="time" disabled={isReadOnly} className={cn(inp, 'mt-1')} value={editing.hora_fin} onChange={e => setEditing({ ...editing, hora_fin: e.target.value })} /></div>
                </div>
              </section>

              {/* 2. Arqueo de efectivo */}
              <section className="border-t border-border-dim pt-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-500 mb-2">2 · Arqueo físico de efectivo</h4>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Desglose de billetes */}
                  <div>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-[8px] font-black uppercase text-text-dim tracking-widest px-1 mb-1">
                      <span>Denominación</span><span className="w-20 text-right">Cantidad</span><span className="w-28 text-right">Subtotal</span>
                    </div>
                    <div className="space-y-1">
                      {DENOMS.map(d => (
                        <div key={d} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                          <span className="text-[11px] font-bold text-text-main font-mono">{fmt(d)}</span>
                          <input type="number" disabled={isReadOnly} className={cn(inp, 'w-20 text-right font-mono')} value={editing.denom[d] || ''} onChange={e => setEditing({ ...editing, denom: { ...editing.denom, [d]: parseFloat(e.target.value) || 0 } })} />
                          <span className="w-28 text-right font-mono text-[11px] text-text-dim">{fmt(d * N(editing.denom[d]))}</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center border-t border-border-dim pt-1.5 mt-1">
                        <span className="text-[10px] font-black uppercase text-text-main">Total efectivo físico (A)</span>
                        <span className="font-mono font-black text-text-main">{fmt(totalFisico(editing.denom))}</span>
                      </div>
                    </div>
                  </div>
                  {/* Conceptos de control */}
                  <div className="space-y-2">
                    <div><label className={lbl}>Caja chica inicial</label><input type="number" disabled={isReadOnly} className={cn(inp, 'mt-1 font-mono')} value={editing.cajaChicaInicial || ''} onChange={e => setEditing({ ...editing, cajaChicaInicial: parseFloat(e.target.value) || 0 })} /></div>
                    <div><label className={lbl}>Ventas en efectivo según sistema</label><input type="number" disabled={isReadOnly} className={cn(inp, 'mt-1 font-mono')} value={editing.ventasEfectivoSistema || ''} onChange={e => setEditing({ ...editing, ventasEfectivoSistema: parseFloat(e.target.value) || 0 })} /></div>
                    <div><label className={lbl}>Gastos autorizados con comprobante</label><input type="number" disabled={isReadOnly} className={cn(inp, 'mt-1 font-mono')} value={editing.gastosAutorizados || ''} onChange={e => setEditing({ ...editing, gastosAutorizados: parseFloat(e.target.value) || 0 })} /></div>
                    <div className="flex justify-between items-center pt-1"><span className="text-[10px] font-bold text-text-dim uppercase">(=) Efectivo esperado</span><span className="font-mono font-bold text-text-main">{fmt(efectivoEsperado(editing))}</span></div>
                    {(() => { const d = difEfectivo(editing); return (
                      <div className={cn('flex justify-between items-center rounded-lg px-3 py-2', Math.abs(d) < 0.5 ? 'bg-emerald-500/10' : 'bg-red-500/10')}>
                        <span className="text-[10px] font-black uppercase text-text-main">Diferencia ({d >= 0 ? 'sobrante' : 'faltante'})</span>
                        <span className={cn('font-mono font-black', difColor(d))}>{d > 0 ? '+' : ''}{fmt(d)}</span>
                      </div>
                    ); })()}
                  </div>
                </div>
              </section>

              {/* 3. Medios de pago */}
              <section className="border-t border-border-dim pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-500">3 · Medios de pago electrónicos / POS</h4>
                  {!isReadOnly && <button onClick={() => setEditing({ ...editing, medios: [...editing.medios, { id: newId(), medio: '', montoSistema: 0, montoComprobantes: 0 }] })} className="flex items-center gap-1 text-[9px] font-black uppercase text-brand-500 border border-brand-500/25 rounded px-2 py-1 hover:bg-brand-500/10"><Plus size={11} /> Medio</button>}
                </div>
                <div className="space-y-2">
                  <div className="hidden sm:grid grid-cols-[1fr_7rem_7rem_7rem_auto] gap-2 text-[8px] font-black uppercase text-text-dim tracking-widest px-1">
                    <span>Medio / Terminal</span><span className="text-right">Sistema</span><span className="text-right">Comprob./POS</span><span className="text-right">Diferencia</span><span className="w-4" />
                  </div>
                  {editing.medios.map(m => { const dif = N(m.montoSistema) - N(m.montoComprobantes); return (
                    <div key={m.id} className="grid grid-cols-[1fr_7rem_7rem_7rem_auto] gap-2 items-center">
                      <input disabled={isReadOnly} className={inp} placeholder="Tarjetas, Pedidos Ya…" value={m.medio} onChange={e => setEditing({ ...editing, medios: editing.medios.map(x => x.id === m.id ? { ...x, medio: e.target.value } : x) })} />
                      <input type="number" disabled={isReadOnly} className={cn(inp, 'text-right font-mono')} value={m.montoSistema || ''} onChange={e => setEditing({ ...editing, medios: editing.medios.map(x => x.id === m.id ? { ...x, montoSistema: parseFloat(e.target.value) || 0 } : x) })} />
                      <input type="number" disabled={isReadOnly} className={cn(inp, 'text-right font-mono')} value={m.montoComprobantes || ''} onChange={e => setEditing({ ...editing, medios: editing.medios.map(x => x.id === m.id ? { ...x, montoComprobantes: parseFloat(e.target.value) || 0 } : x) })} />
                      <span className={cn('text-right font-mono text-[11px] font-bold', difColor(dif))}>{dif > 0 ? '+' : ''}{fmt(dif)}</span>
                      {!isReadOnly && <button onClick={() => setEditing({ ...editing, medios: editing.medios.filter(x => x.id !== m.id) })} className="text-text-dim hover:text-red-500"><Trash2 size={13} /></button>}
                    </div>
                  ); })}
                </div>
              </section>

              {/* 4. Checklist operativo */}
              <section className="border-t border-border-dim pt-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-500 mb-2">4 · Checklist de control operativo</h4>
                <div className="space-y-2">
                  {editing.checklist.map(c => (
                    <div key={c.id} className="bg-bg-accent/20 rounded-lg p-2.5 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[11px] font-bold text-text-main flex-1">{c.punto}</span>
                        <div className="flex gap-1 shrink-0">
                          {(['cumple', 'no_cumple', 'na'] as Cumple[]).map(opt => (
                            <button key={opt} disabled={isReadOnly} onClick={() => setEditing({ ...editing, checklist: editing.checklist.map(x => x.id === c.id ? { ...x, resultado: opt } : x) })}
                              className={cn('px-2 py-0.5 rounded text-[9px] font-black uppercase', c.resultado === opt ? (opt === 'cumple' ? 'bg-emerald-500 text-white' : opt === 'no_cumple' ? 'bg-red-500 text-white' : 'bg-text-dim text-white') : 'bg-bg-card border border-border-dim text-text-dim hover:text-text-main')}>{CUMPLE_LBL[opt]}</button>
                          ))}
                        </div>
                      </div>
                      <input disabled={isReadOnly} className={cn(inp, 'text-[10px]')} placeholder="Observaciones / detalles" value={c.obs} onChange={e => setEditing({ ...editing, checklist: editing.checklist.map(x => x.id === c.id ? { ...x, obs: e.target.value } : x) })} />
                    </div>
                  ))}
                </div>
              </section>

              {/* 5. Evaluación del cajero */}
              <section className="border-t border-border-dim pt-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-500 mb-2">5 · Evaluación del cajero <span className="text-text-dim normal-case tracking-normal">({editing.cajero || 'sin nombre'})</span></h4>
                <div className="space-y-2">
                  {editing.evalCajero.map(ev => (
                    <div key={ev.id} className="bg-bg-accent/20 rounded-lg p-2.5 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[11px] font-bold text-text-main flex-1">{ev.pregunta}</span>
                        <div className="flex gap-1 shrink-0">
                          {(['si', 'parcial', 'no', 'na'] as Resp[]).map(opt => (
                            <button key={opt} disabled={isReadOnly} onClick={() => setEditing({ ...editing, evalCajero: editing.evalCajero.map(x => x.id === ev.id ? { ...x, respuesta: opt } : x) })}
                              className={cn('px-2 py-0.5 rounded text-[9px] font-black uppercase', ev.respuesta === opt ? (opt === 'si' ? 'bg-emerald-500 text-white' : opt === 'no' ? 'bg-red-500 text-white' : opt === 'parcial' ? 'bg-amber-500 text-white' : 'bg-text-dim text-white') : 'bg-bg-card border border-border-dim text-text-dim hover:text-text-main')}>{RESP_LBL[opt]}</button>
                          ))}
                        </div>
                      </div>
                      <input disabled={isReadOnly} className={cn(inp, 'text-[10px]')} placeholder="Observaciones / detalles" value={ev.obs} onChange={e => setEditing({ ...editing, evalCajero: editing.evalCajero.map(x => x.id === ev.id ? { ...x, obs: e.target.value } : x) })} />
                    </div>
                  ))}
                  <p className="text-[9px] text-text-dim italic">Para agregar o quitar preguntas usá el botón "Configurar" en la pantalla principal.</p>
                </div>
              </section>

              {/* 6. Observaciones */}
              <section className="border-t border-border-dim pt-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-500 mb-2">6 · Observaciones finales</h4>
                <textarea disabled={isReadOnly} rows={3} className={cn(inp, 'resize-y')} placeholder="Observaciones del auditor / justificación de diferencias por parte del cajero…" value={editing.observaciones} onChange={e => setEditing({ ...editing, observaciones: e.target.value })} />
              </section>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-dim sticky bottom-0 bg-bg-sidebar rounded-b-2xl">
              <button onClick={() => !saving && setEditing(null)} className="text-[11px] font-black uppercase text-text-dim px-4 py-2 hover:text-text-main">Cancelar</button>
              {!isReadOnly && <button onClick={guardar} disabled={saving} className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-5 py-2 text-[11px] font-black uppercase tracking-wider disabled:opacity-50">{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Guardar</button>}
            </div>
          </div>
        </div>
      )}

      {/* ───────── Modal ver ───────── */}
      {viewing && (() => { const a = viewing; const dif = difEfectivo(a); return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4" onClick={() => setViewing(null)}>
          <div className="bg-bg-sidebar border border-border-dim rounded-2xl shadow-2xl w-full max-w-2xl my-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border-dim">
              <h3 className="text-sm font-black uppercase tracking-wider text-text-main">Auditoría · {branchName(a.branch_id)}</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => exportPDF(a)} className="text-text-dim hover:text-red-500" title="PDF"><FileText size={16} /></button>
                <button onClick={() => setViewing(null)} className="text-text-dim hover:text-text-main"><X size={18} /></button>
              </div>
            </div>
            <div className="p-5 space-y-3 text-[12px]">
              <div className="grid grid-cols-2 gap-2 text-text-dim">
                <span><b className="text-text-main">Fecha:</b> {a.fecha || '—'}</span>
                <span><b className="text-text-main">Turno:</b> {a.turno || '—'}</span>
                <span><b className="text-text-main">Cajero:</b> {a.cajero || '—'}</span>
                <span><b className="text-text-main">Auditor:</b> {a.auditor || '—'}</span>
                <span><b className="text-text-main">Horario:</b> {a.hora_inicio || '—'} a {a.hora_fin || '—'}</span>
                <span><b className="text-text-main">Sistema:</b> {a.sistema || '—'}</span>
              </div>
              <div className="bg-bg-accent/20 rounded-lg p-3 space-y-1">
                <div className="flex justify-between"><span className="text-text-dim">Efectivo físico</span><span className="font-mono">{fmt(totalFisico(a.denom))}</span></div>
                <div className="flex justify-between"><span className="text-text-dim">Efectivo esperado</span><span className="font-mono">{fmt(efectivoEsperado(a))}</span></div>
                <div className="flex justify-between font-bold"><span>Diferencia ({dif >= 0 ? 'sobrante' : 'faltante'})</span><span className={cn('font-mono', difColor(dif))}>{dif > 0 ? '+' : ''}{fmt(dif)}</span></div>
              </div>
              <div>
                <p className={lbl}>Medios de pago</p>
                {a.medios.map(m => <div key={m.id} className="flex justify-between text-[11px] text-text-dim"><span>{m.medio}</span><span className="font-mono">Sist {fmt(m.montoSistema)} · POS {fmt(m.montoComprobantes)} · Dif {fmt(N(m.montoSistema) - N(m.montoComprobantes))}</span></div>)}
              </div>
              <div>
                <p className={lbl}>Checklist operativo</p>
                {a.checklist.map(c => <div key={c.id} className="flex items-start justify-between gap-2 text-[11px]"><span className="text-text-dim flex-1">{c.punto}{c.obs && <span className="italic"> — {c.obs}</span>}</span><span className={cn('font-black shrink-0', c.resultado === 'cumple' ? 'text-emerald-600' : c.resultado === 'no_cumple' ? 'text-red-500' : 'text-text-dim')}>{CUMPLE_LBL[c.resultado]}</span></div>)}
              </div>
              <div>
                <p className={lbl}>Evaluación del cajero</p>
                {a.evalCajero.map(ev => <div key={ev.id} className="flex items-start justify-between gap-2 text-[11px]"><span className="text-text-dim flex-1">{ev.pregunta}{ev.obs && <span className="italic"> — {ev.obs}</span>}</span><span className={cn('font-black shrink-0', ev.respuesta === 'si' ? 'text-emerald-600' : ev.respuesta === 'no' ? 'text-red-500' : ev.respuesta === 'parcial' ? 'text-amber-600' : 'text-text-dim')}>{RESP_LBL[ev.respuesta]}</span></div>)}
              </div>
              {a.observaciones && <div><p className={lbl}>Observaciones</p><p className="text-[11px] text-text-dim">{a.observaciones}</p></div>}
            </div>
          </div>
        </div>
      ); })()}

      {/* ───────── Modal config ───────── */}
      {cfgOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4" onClick={() => !savingCfg && setCfgOpen(false)}>
          <div className="bg-bg-sidebar border border-border-dim rounded-2xl shadow-2xl w-full max-w-2xl my-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border-dim">
              <h3 className="text-sm font-black uppercase tracking-wider text-text-main">Configurar auditoría</h3>
              <button onClick={() => !savingCfg && setCfgOpen(false)} className="text-text-dim hover:text-text-main"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-5">
              <p className="text-[10px] text-text-dim italic">Los cambios se aplican a las <b>nuevas</b> auditorías. Las ya registradas conservan las preguntas con las que se hicieron.</p>
              {/* Checklist operativo */}
              {([
                { title: 'Checklist de control operativo', list: cfgChecklist, set: setCfgChecklist, ph: 'Ej. Caja cerrada y con llave mientras no se cobra' },
                { title: 'Preguntas de evaluación del cajero', list: cfgPreguntas, set: setCfgPreguntas, ph: 'Ej. ¿Utiliza correctamente los descuentos de caja?' },
              ] as const).map(sec => (
                <section key={sec.title}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-500">{sec.title}</h4>
                    <button onClick={() => sec.set([...sec.list, ''])} className="flex items-center gap-1 text-[9px] font-black uppercase text-brand-500 border border-brand-500/25 rounded px-2 py-1 hover:bg-brand-500/10"><Plus size={11} /> Agregar</button>
                  </div>
                  <div className="space-y-1.5">
                    {sec.list.length === 0 && <p className="text-[10px] text-text-dim italic">Sin ítems. Agregá al menos uno.</p>}
                    {sec.list.map((t, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-text-dim w-5 text-right">{i + 1}.</span>
                        <input className={inp} placeholder={sec.ph} value={t} onChange={e => sec.set(sec.list.map((x, j) => j === i ? e.target.value : x))} />
                        <button onClick={() => sec.set(sec.list.filter((_, j) => j !== i))} className="text-text-dim hover:text-red-500"><Trash2 size={13} /></button>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-dim">
              <button onClick={() => !savingCfg && setCfgOpen(false)} className="text-[11px] font-black uppercase text-text-dim px-4 py-2 hover:text-text-main">Cancelar</button>
              <button onClick={saveConfig} disabled={savingCfg} className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-5 py-2 text-[11px] font-black uppercase tracking-wider disabled:opacity-50">{savingCfg ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Guardar configuración</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
