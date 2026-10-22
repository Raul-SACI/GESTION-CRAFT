/**
 * SPDX-License-Identifier: Apache-2.0
 * Finanzas · Plan de Inversiones y Gastos Proyectados (Fase 1).
 * Cada ítem es un "Gasto / Inversión" agrupado por Categoría, con tipo
 * (gasto/inversión), importancia (deseable/importante/muy importante), urgencia
 * (no urgente/urgente), presupuesto estimado, fecha probable, estado y costo real.
 * Un ítem puede pagarse en cuotas en distintos meses.
 * Vistas: Lista (backlog), Matriz de prioridad 3×2, Calendario anual de pagos y Resumen.
 * Tablas: fin_inversiones_plan y fin_inversiones_pagos (RLS desactivado).
 */
import { useState, useEffect, useMemo, Fragment } from 'react';
import { Plus, Trash2, Wallet, Loader2, X, Pencil, ListChecks, Grid3x3, CalendarDays, PieChart, Download, FileText, Search, ChevronLeft, ChevronRight, Upload, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';
import { Branch } from '../types';

type Tipo = 'gasto' | 'inversion' | 'obra';
type Importancia = 'deseable' | 'importante' | 'muy_importante';
type Urgencia = 'no_urgente' | 'urgente';
type Estado = 'pendiente' | 'aprobado' | 'en_curso' | 'hecho' | 'descartado';

interface Pago { id: string; plan_id: string; fecha: string; monto: number; descripcion: string; pagado: boolean; }
interface SubGasto { id: string; nombre: string; manoObra: number; materiales: number; }
// Total de un rubro = mano de obra + materiales
const subTotal = (s: SubGasto) => (Number(s.manoObra) || 0) + (Number(s.materiales) || 0);
interface Item {
  id: string; tipo: Tipo; nombre: string; categoria: string; branch_id: string;
  importancia: Importancia; urgencia: Urgencia; presupuesto: number; fecha_estimada: string | null;
  estado: Estado; costo_real: number | null; proveedor: string; responsable: string; notas: string;
  subGastos: SubGasto[];
}

const newId = () => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const fmt = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`;
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const TIPO_LBL: Record<Tipo, string> = { gasto: 'Gasto', inversion: 'Inversión', obra: 'Obra' };
const IMP_LBL: Record<Importancia, string> = { deseable: 'Deseable', importante: 'Importante', muy_importante: 'Muy importante' };
const URG_LBL: Record<Urgencia, string> = { no_urgente: 'No urgente', urgente: 'Urgente' };
const EST_LBL: Record<Estado, string> = { pendiente: 'Pendiente', aprobado: 'Aprobado', en_curso: 'En curso', hecho: 'Hecho', descartado: 'Descartado' };
const IMP_ORDER: Importancia[] = ['muy_importante', 'importante', 'deseable'];

// ── Helpers de import/export Excel ──
const normTxt = (s: any) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');
const pad2 = (n: number) => String(n).padStart(2, '0');
const toNumAr = (v: any): number => {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (v == null || v === '') return 0;
  let s = String(v).replace(/[^0-9.,-]/g, '');
  if (/,\d{1,2}$/.test(s) || (s.includes('.') && s.includes(','))) s = s.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = parseFloat(s); return isNaN(n) ? 0 : n;
};
const parseFechaISO = (v: any): string | null => {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) { let y = m[3]; if (y.length === 2) y = '20' + y; return `${y}-${pad2(+m[2])}-${pad2(+m[1])}`; }
  m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (m) return `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}`;
  return null;
};
const parseTipo = (v: any): Tipo => { const s = String(v || ''); if (/obra/i.test(s)) return 'obra'; if (/gast/i.test(s)) return 'gasto'; return 'inversion'; };
const parseImp = (v: any): Importancia => { const s = String(v || '').toLowerCase(); if (s.includes('muy')) return 'muy_importante'; if (s.includes('desea')) return 'deseable'; return 'importante'; };
const parseUrg = (v: any): Urgencia => { const s = String(v || '').toLowerCase(); if (s.includes('no')) return 'no_urgente'; if (s.includes('urg')) return 'urgente'; return 'no_urgente'; };
const parseEstado = (v: any): Estado => { const s = String(v || '').toLowerCase(); if (s.includes('aprob')) return 'aprobado'; if (s.includes('curso')) return 'en_curso'; if (s.includes('hecho') || s.includes('realiz')) return 'hecho'; if (s.includes('descart') || s.includes('anul')) return 'descartado'; return 'pendiente'; };
// Localiza la fila de encabezado y mapea cada columna conocida por palabras clave.
const findColsInv = (rows: any[][]): { headerRow: number; idx: Record<string, number> } | null => {
  const want: Record<string, string[]> = {
    tipo: ['tipo'], nombre: ['gasto', 'inversi', 'nombre', 'item', 'concepto', 'descrip'],
    categoria: ['categor', 'rubro'], sucursal: ['sucursal', 'área', 'area', 'local'],
    importancia: ['importan'], urgencia: ['urgenc'], presupuesto: ['presupuesto', 'importe', 'monto', 'estimad'],
    fecha: ['fecha'], estado: ['estado'], costo_real: ['costo real', 'costo', 'real'], responsable: ['responsable', 'encargado', 'asignad'], proveedor: ['proveedor'], notas: ['nota', 'detalle', 'observ'],
  };
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const row = (rows[i] || []).map((c: any) => String(c ?? '').trim().toLowerCase());
    const idx: Record<string, number> = {}; let hits = 0;
    for (const k in want) { const j = row.findIndex(c => want[k].some(w => c.includes(w))); if (j >= 0) { idx[k] = j; hits++; } }
    if (idx.nombre != null && hits >= 3) return { headerRow: i, idx };
  }
  return null;
};
const EST_COLOR: Record<Estado, string> = {
  pendiente: 'bg-text-dim/15 text-text-dim',
  aprobado: 'bg-sky-500/15 text-sky-600',
  en_curso: 'bg-amber-500/15 text-amber-600',
  hecho: 'bg-emerald-500/15 text-emerald-600',
  descartado: 'bg-red-500/10 text-red-500 line-through',
};

// Zona de la matriz de Eisenhower (3 importancias × 2 urgencias), adaptada a decisiones de plata.
const cellMeta = (imp: Importancia, urg: Urgencia): { label: string; bg: string; ring: string } => {
  if (imp === 'deseable') {
    return urg === 'urgente'
      ? { label: 'REVISAR', bg: 'bg-sky-500', ring: 'ring-sky-500/40' }
      : { label: 'POSTERGAR', bg: 'bg-emerald-500', ring: 'ring-emerald-500/40' };
  }
  // muy importante / importante
  if (urg === 'urgente') return { label: imp === 'muy_importante' ? 'HACER YA' : 'HACER', bg: 'bg-red-500', ring: 'ring-red-500/40' };
  return { label: 'PLANIFICAR', bg: 'bg-amber-400', ring: 'ring-amber-400/40' };
};

const emptyItem = (): Item => ({
  id: newId(), tipo: 'inversion', nombre: '', categoria: '', branch_id: '',
  importancia: 'importante', urgencia: 'no_urgente', presupuesto: 0, fecha_estimada: null,
  estado: 'pendiente', costo_real: null, proveedor: '', responsable: '', notas: '', subGastos: [],
});

export default function InversionesPlanView({ branches = [], isReadOnly = false }: { branches?: Branch[]; isReadOnly?: boolean }) {
  const operative = useMemo(() => branches.filter(b => b.id !== 'all' && b.id !== 'virtual'), [branches]);
  const branchName = (id: string) => id ? (branches.find(b => b.id === id)?.name || id) : 'General';

  const [items, setItems] = useState<Item[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'lista' | 'matriz' | 'calendario' | 'resumen'>('lista');
  const [year, setYear] = useState(() => new Date().getFullYear());

  // Filtros de la lista
  const [fTexto, setFTexto] = useState('');
  const [fTipo, setFTipo] = useState<'' | Tipo>('');
  const [fCat, setFCat] = useState('');
  const [fImp, setFImp] = useState<'' | Importancia>('');
  const [fUrg, setFUrg] = useState<'' | Urgencia>('');
  const [fBranch, setFBranch] = useState('');
  const [fEstado, setFEstado] = useState<'' | Estado>('');
  const [fResp, setFResp] = useState('');
  // Orden por columna (click en encabezado). null = orden sugerido por prioridad.
  type SortCol = 'nombre' | 'categoria' | 'tipo' | 'branch' | 'responsable' | 'prioridad' | 'presupuesto' | 'fecha' | 'estado';
  const [sort, setSort] = useState<{ col: SortCol; dir: 'asc' | 'desc' } | null>(null);
  const toggleSort = (col: SortCol) => setSort(prev => !prev || prev.col !== col ? { col, dir: 'asc' } : prev.dir === 'asc' ? { col, dir: 'desc' } : null);

  // Modal de edición
  const [editing, setEditing] = useState<Item | null>(null);
  const [editPagos, setEditPagos] = useState<Pago[]>([]);
  const [origPagoIds, setOrigPagoIds] = useState<string[]>([]);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      const [pl, pg] = await Promise.all([
        supabase.from('fin_inversiones_plan').select('*').order('created_at', { ascending: true }),
        supabase.from('fin_inversiones_pagos').select('*').order('fecha', { ascending: true }),
      ]);
      setItems(((pl.data as any[]) || []).map(r => ({
        id: r.id, tipo: (r.tipo || 'inversion') as Tipo, nombre: r.nombre || '', categoria: r.categoria || '',
        branch_id: r.branch_id || '', importancia: (r.importancia || 'importante') as Importancia,
        urgencia: (r.urgencia || 'no_urgente') as Urgencia, presupuesto: Number(r.presupuesto) || 0,
        fecha_estimada: r.fecha_estimada || null, estado: (r.estado || 'pendiente') as Estado,
        costo_real: r.costo_real == null ? null : Number(r.costo_real), proveedor: r.proveedor || '', responsable: r.responsable || '', notas: r.notas || '',
        subGastos: Array.isArray(r.sub_gastos) ? r.sub_gastos.map((s: any) => {
          const hasDesglose = s.manoObra != null || s.materiales != null;
          // Compat: rubros viejos (solo 'presupuesto') se cargan como mano de obra.
          return { id: s.id || newId(), nombre: String(s.nombre || ''), manoObra: hasDesglose ? (Number(s.manoObra) || 0) : (Number(s.presupuesto) || 0), materiales: Number(s.materiales) || 0 };
        }) : [],
      })));
      setPagos(((pg.data as any[]) || []).map(r => ({ id: r.id, plan_id: r.plan_id, fecha: r.fecha, monto: Number(r.monto) || 0, descripcion: r.descripcion || '', pagado: !!r.pagado })));
    } catch (e) { console.warn('Inversiones load error', e); }
    finally { setLoading(false); }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  const categorias = useMemo(() => Array.from(new Set(items.map(i => i.categoria).filter(Boolean))).sort(), [items]);
  const pagosByItem = useMemo(() => {
    const m: Record<string, Pago[]> = {};
    pagos.forEach(p => { (m[p.plan_id] ||= []).push(p); });
    return m;
  }, [pagos]);

  // "Pagos efectivos" de un ítem: sus cuotas; si no tiene, una cuota única = presupuesto en su fecha estimada.
  const efectivosDeItem = (it: Item): { fecha: string | null; monto: number; pagado: boolean }[] => {
    const cuotas = pagosByItem[it.id] || [];
    if (cuotas.length) return cuotas.map(c => ({ fecha: c.fecha, monto: c.monto, pagado: c.pagado }));
    return [{ fecha: it.fecha_estimada, monto: it.presupuesto, pagado: it.estado === 'hecho' }];
  };

  // ── Filtro de la lista ──
  const listaFiltrada = useMemo(() => {
    const q = fTexto.trim().toLowerCase();
    const resp = fResp.trim().toLowerCase();
    const filtrada = items.filter(it => {
      if (fTipo && it.tipo !== fTipo) return false;
      if (fCat && it.categoria !== fCat) return false;
      if (fImp && it.importancia !== fImp) return false;
      if (fUrg && it.urgencia !== fUrg) return false;
      if (fBranch && it.branch_id !== fBranch) return false;
      if (fEstado && it.estado !== fEstado) return false;
      if (resp && !(it.responsable || '').toLowerCase().includes(resp)) return false;
      if (q && !(`${it.nombre} ${it.categoria} ${it.proveedor} ${it.notas}`.toLowerCase().includes(q))) return false;
      return true;
    });
    if (sort) {
      // "Prioridad" (Eisenhower): muy_importante+urgente primero → deseable+no_urgente último
      const prioScore = (it: Item) => IMP_ORDER.indexOf(it.importancia) * 2 + (it.urgencia === 'urgente' ? 0 : 1);
      const estOrder = Object.keys(EST_LBL) as Estado[];
      const sortVal = (it: Item): string | number => {
        switch (sort.col) {
          case 'nombre': return it.nombre.toLowerCase();
          case 'categoria': return (it.categoria || '').toLowerCase();
          case 'tipo': return TIPO_LBL[it.tipo].toLowerCase();
          case 'branch': return branchName(it.branch_id).toLowerCase();
          case 'responsable': return (it.responsable || '').toLowerCase();
          case 'prioridad': return prioScore(it);
          case 'presupuesto': return it.presupuesto;
          case 'fecha': return it.fecha_estimada || '9999-99-99';
          case 'estado': return estOrder.indexOf(it.estado);
        }
      };
      const mul = sort.dir === 'asc' ? 1 : -1;
      return [...filtrada].sort((a, b) => {
        const va = sortVal(a), vb = sortVal(b);
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mul;
        return String(va).localeCompare(String(vb), 'es') * mul;
      });
    }
    return filtrada.sort((a, b) => {
      // Orden sugerido: por importancia (desc) y urgencia (urgente primero)
      const ia = IMP_ORDER.indexOf(a.importancia), ib = IMP_ORDER.indexOf(b.importancia);
      if (ia !== ib) return ia - ib;
      if (a.urgencia !== b.urgencia) return a.urgencia === 'urgente' ? -1 : 1;
      return (a.fecha_estimada || '9999').localeCompare(b.fecha_estimada || '9999');
    });
  }, [items, fTexto, fTipo, fCat, fImp, fUrg, fBranch, fEstado, fResp, sort]);

  const totalFiltrado = listaFiltrada.reduce((s, it) => s + it.presupuesto, 0);

  // ── Guardar / borrar ──
  const abrirNuevo = () => { if (isReadOnly) return; setEditing(emptyItem()); setEditPagos([]); setOrigPagoIds([]); setIsNew(true); };
  const abrirEditar = (it: Item) => { setEditing({ ...it }); const ps = (pagosByItem[it.id] || []).map(p => ({ ...p })); setEditPagos(ps); setOrigPagoIds(ps.map(p => p.id)); setIsNew(false); };

  const guardar = async () => {
    if (!editing || isReadOnly) return;
    if (!editing.nombre.trim()) { alert('Poné un nombre al Gasto / Inversión.'); return; }
    setSaving(true);
    try {
      const it = editing;
      const subs = (it.tipo === 'obra' ? it.subGastos : []).filter(s => s.nombre.trim() || subTotal(s));
      const presObra = subs.reduce((s, x) => s + subTotal(x), 0);
      const presupuestoFinal = (it.tipo === 'obra' && subs.length) ? presObra : (Number(it.presupuesto) || 0);
      const { error } = await supabase.from('fin_inversiones_plan').upsert({
        id: it.id, tipo: it.tipo, nombre: it.nombre.trim(), categoria: it.categoria.trim() || null,
        branch_id: it.branch_id || null, importancia: it.importancia, urgencia: it.urgencia,
        presupuesto: presupuestoFinal, fecha_estimada: it.fecha_estimada || null, estado: it.estado,
        sub_gastos: subs.length ? subs.map(s => ({ id: s.id, nombre: s.nombre.trim(), manoObra: Number(s.manoObra) || 0, materiales: Number(s.materiales) || 0, presupuesto: subTotal(s) })) : null,
        costo_real: it.costo_real == null || (it.costo_real as any) === '' ? null : Number(it.costo_real),
        proveedor: it.proveedor.trim() || null, responsable: it.responsable.trim() || null, notas: it.notas.trim() || null, updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) throw error;
      // Sincronizar cuotas
      const currentIds = editPagos.map(p => p.id);
      const borrar = origPagoIds.filter(id => !currentIds.includes(id));
      if (borrar.length) await supabase.from('fin_inversiones_pagos').delete().in('id', borrar);
      const validas = editPagos.filter(p => p.fecha);
      if (validas.length) {
        const { error: ep } = await supabase.from('fin_inversiones_pagos').upsert(
          validas.map(p => ({ id: p.id, plan_id: it.id, fecha: p.fecha, monto: Number(p.monto) || 0, descripcion: p.descripcion.trim() || null, pagado: p.pagado })),
          { onConflict: 'id' });
        if (ep) throw ep;
      }
      await cargar();
      setEditing(null);
    } catch (e: any) { alert('No se pudo guardar: ' + (e.message || e)); }
    finally { setSaving(false); }
  };

  const borrar = async (it: Item) => {
    if (isReadOnly) return;
    if (!confirm(`¿Eliminar "${it.nombre}" y sus cuotas?`)) return;
    try {
      await supabase.from('fin_inversiones_plan').delete().eq('id', it.id);
      setItems(prev => prev.filter(x => x.id !== it.id));
      setPagos(prev => prev.filter(x => x.plan_id !== it.id));
    } catch (e: any) { alert('No se pudo eliminar: ' + (e.message || e)); }
  };

  // ── Cuotas dentro del modal ──
  const addPago = () => editing && setEditPagos(prev => [...prev, { id: newId(), plan_id: editing.id, fecha: `${year}-01-01`, monto: 0, descripcion: '', pagado: false }]);
  const sumCuotas = editPagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);

  // ── Calendario anual de pagos ──
  const calendario = useMemo(() => {
    const mByMonth: { total: number; pagado: number; detalle: { nombre: string; monto: number; pagado: boolean }[] }[] =
      Array.from({ length: 12 }, () => ({ total: 0, pagado: 0, detalle: [] }));
    let sinFecha = 0;
    items.forEach(it => {
      if (it.estado === 'descartado') return;
      efectivosDeItem(it).forEach(e => {
        if (!e.fecha) { sinFecha += e.monto; return; }
        const d = new Date(e.fecha + 'T00:00:00');
        if (d.getFullYear() !== year) return;
        const m = d.getMonth();
        mByMonth[m].total += e.monto;
        if (e.pagado) mByMonth[m].pagado += e.monto;
        mByMonth[m].detalle.push({ nombre: it.nombre, monto: e.monto, pagado: e.pagado });
      });
    });
    const totalAnio = mByMonth.reduce((s, m) => s + m.total, 0);
    const pagadoAnio = mByMonth.reduce((s, m) => s + m.pagado, 0);
    return { mByMonth, totalAnio, pagadoAnio, sinFecha };
  }, [items, pagosByItem, year]);
  const [mesAbierto, setMesAbierto] = useState<number | null>(null);

  // ── Resumen / KPIs (del año seleccionado por fecha estimada / cuotas) ──
  const resumen = useMemo(() => {
    const enAnio = (it: Item) => efectivosDeItem(it).some(e => e.fecha && new Date(e.fecha + 'T00:00:00').getFullYear() === year) || (!it.fecha_estimada && (pagosByItem[it.id] || []).length === 0);
    const act = items.filter(it => it.estado !== 'descartado' && enAnio(it));
    const byKey = (f: (it: Item) => string) => {
      const m: Record<string, number> = {};
      act.forEach(it => { const k = f(it); m[k] = (m[k] || 0) + it.presupuesto; });
      return Object.entries(m).sort((a, b) => b[1] - a[1]);
    };
    const totalInv = act.filter(i => i.tipo === 'inversion').reduce((s, i) => s + i.presupuesto, 0);
    const totalGasto = act.filter(i => i.tipo === 'gasto').reduce((s, i) => s + i.presupuesto, 0);
    const hechos = items.filter(i => i.estado === 'hecho' && i.costo_real != null);
    const estReal = { est: hechos.reduce((s, i) => s + i.presupuesto, 0), real: hechos.reduce((s, i) => s + (i.costo_real || 0), 0), n: hechos.length };
    return {
      totalInv, totalGasto, total: totalInv + totalGasto, n: act.length,
      porCat: byKey(i => i.categoria || 'Sin categoría'),
      porEstado: byKey(i => EST_LBL[i.estado]),
      porSucursal: byKey(i => branchName(i.branch_id)),
      estReal,
    };
  }, [items, pagosByItem, year]);

  // ── Planilla modelo (para importar) ──
  const exportModelo = () => {
    const headers = ['Gasto / Inversión', 'Tipo', 'Categoría', 'Sucursal/Área', 'Responsable', 'Importancia', 'Urgencia', 'Presupuesto', 'Fecha probable (DD/MM/AAAA)', 'Estado', 'Costo real', 'Proveedor', 'Notas'];
    const suc = operative[0]?.name || 'CRAFT Barrio Norte';
    const ejemplos = [
      ['Sillas Interior', 'Inversión', 'Remodelación', suc, 'Manuel', 'Muy importante', 'Urgente', 250000, '15/03/2026', 'Pendiente', '', 'Mueblería X', 'Para el salón principal'],
      ['Vajilla nueva', 'Gasto', 'Vajilla', 'General', 'Lucía', 'Importante', 'No urgente', 80000, '10/05/2026', 'Pendiente', '', '', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...ejemplos]);
    ws['!cols'] = headers.map((h, i) => ({ wch: i === 0 ? 26 : i === headers.length - 1 ? 30 : 16 }));
    const ayuda = [
      ['Columna', 'Qué poner / valores permitidos'],
      ['Gasto / Inversión', 'Nombre de lo que se compra/hace (ej. Sillas Interior). Obligatorio.'],
      ['Tipo', 'Gasto  /  Inversión'],
      ['Categoría', 'Libre (ej. Remodelación, Vajilla, Equipamiento…)'],
      ['Sucursal/Área', 'General, o el nombre EXACTO de la sucursal'],
      ['Responsable', 'Nombre de quién se encarga (ej. Manuel). Opcional.'],
      ['Importancia', 'Deseable  /  Importante  /  Muy importante'],
      ['Urgencia', 'No urgente  /  Urgente'],
      ['Presupuesto', 'Número (ej. 250000)'],
      ['Fecha probable', 'DD/MM/AAAA (ej. 15/03/2026)'],
      ['Estado', 'Pendiente / Aprobado / En curso / Hecho / Descartado'],
      ['Costo real', 'Número, solo si ya se ejecutó (opcional)'],
      ['Proveedor / Notas', 'Libre (opcional)'],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(ayuda);
    ws2['!cols'] = [{ wch: 20 }, { wch: 60 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plan');
    XLSX.utils.book_append_sheet(wb, ws2, 'Instrucciones');
    XLSX.writeFile(wb, 'modelo_plan_inversiones.xlsx');
  };

  // ── Importar desde Excel ──
  const importarExcel = async (file?: File) => {
    if (isReadOnly || !file) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' }) as any[][];
      const f = findColsInv(rows);
      if (!f || f.idx.nombre == null) { alert('No reconocí las columnas. Descargá el botón "Modelo" y usá esa planilla (hoja "Plan").'); setImporting(false); return; }
      // Emparejar la sucursal del Excel con las de la app ignorando "CRAFT", acentos y
      // espacios; además "depósito/almacén/producción" → la sucursal de Almacén y Producción.
      const normLocX = (s: any) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/CRAFT/g, '').replace(/[^A-Z0-9]/g, '');
      const byLoc: Record<string, string> = {}; operative.forEach(b => { byLoc[normLocX(b.name)] = b.id; });
      const almacenId = operative.find(b => /ALMAC|PRODUC|DEPOSIT/.test(normLocX(b.name)))?.id || '';
      const resolveBranch = (raw: string): string => {
        const k = normLocX(raw);
        if (!k || k === 'GENERAL') return '';
        if (byLoc[k]) return byLoc[k];
        const hit = operative.find(b => { const n = normLocX(b.name); return !!n && (n.includes(k) || k.includes(n)); });
        if (hit) return hit.id;
        if (/DEPOSIT|ALMAC|PRODUC|CENTRO/.test(k) && almacenId) return almacenId;
        return '';
      };
      const g = (r: any[], k: string) => f.idx[k] != null ? r[f.idx[k]] : '';
      // Clave de identidad para NO duplicar: nombre + sucursal + categoría + tipo (normalizados).
      const dupKey = (nombre: string, branchId: string, categoria: string, tipo: string) =>
        `${nombre.trim().toLowerCase()}|${branchId || ''}|${(categoria || '').trim().toLowerCase()}|${tipo}`;
      const existentes = new Set(items.map(it => dupKey(it.nombre, it.branch_id, it.categoria, it.tipo)));
      const nuevos: any[] = [];
      let omit = 0, dupes = 0;
      for (let i = f.headerRow + 1; i < rows.length; i++) {
        const r = rows[i]; if (!r) continue;
        const nombre = String(g(r, 'nombre') ?? '').trim();
        if (!nombre) { continue; }
        const brRaw = String(g(r, 'sucursal') ?? '').trim();
        const brId = resolveBranch(brRaw);
        if (brRaw && normLocX(brRaw) !== 'GENERAL' && !brId) omit++; // sucursal no reconocida → queda General
        const tipo = parseTipo(g(r, 'tipo'));
        const categoria = String(g(r, 'categoria') ?? '').trim();
        const k = dupKey(nombre, brId, categoria, tipo);
        if (existentes.has(k)) { dupes++; continue; } // ya existe (o repetido en el Excel) → no se duplica
        existentes.add(k);
        const costoRaw = g(r, 'costo_real');
        nuevos.push({
          id: newId(), tipo, nombre, categoria: categoria || null,
          branch_id: brId || null, importancia: parseImp(g(r, 'importancia')), urgencia: parseUrg(g(r, 'urgencia')),
          presupuesto: toNumAr(g(r, 'presupuesto')), fecha_estimada: parseFechaISO(g(r, 'fecha')), estado: parseEstado(g(r, 'estado')),
          costo_real: (costoRaw === '' || costoRaw == null) ? null : toNumAr(costoRaw),
          responsable: String(g(r, 'responsable') ?? '').trim() || null,
          proveedor: String(g(r, 'proveedor') ?? '').trim() || null, notas: String(g(r, 'notas') ?? '').trim() || null,
          updated_at: new Date().toISOString(),
        });
      }
      if (nuevos.length === 0) { alert(dupes > 0 ? `No se importó nada: los ${dupes} ítem(s) del Excel ya existen (no se duplican).` : 'No encontré filas para importar en la planilla.'); setImporting(false); return; }
      const { error } = await supabase.from('fin_inversiones_plan').insert(nuevos);
      if (error) throw error;
      await cargar();
      alert(`Importados ${nuevos.length} ítem(s).${dupes ? ` ${dupes} ya existían y no se duplicaron.` : ''}${omit ? ` (${omit} con sucursal no reconocida → quedaron como "General")` : ''}`);
    } catch (e: any) { alert('No se pudo importar: ' + (e.message || e)); }
    finally { setImporting(false); }
  };

  // ── Exportar ──
  const exportExcel = () => {
    const rows = listaFiltrada.map(it => ({
      'Gasto / Inversión': it.nombre, Tipo: TIPO_LBL[it.tipo], Categoría: it.categoria, 'Sucursal/Área': branchName(it.branch_id),
      Importancia: IMP_LBL[it.importancia], Urgencia: URG_LBL[it.urgencia], Presupuesto: it.presupuesto,
      'Fecha probable': it.fecha_estimada || '', Estado: EST_LBL[it.estado], 'Costo real': it.costo_real ?? '', Responsable: it.responsable, Proveedor: it.proveedor,
      'Sub-gastos (obra)': it.subGastos.map(s => `${s.nombre}: ${Math.round(subTotal(s))} (MO ${Math.round(Number(s.manoObra) || 0)} + Mat ${Math.round(Number(s.materiales) || 0)})`).join(' · '), Notas: it.notas,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Plan');
    XLSX.writeFile(wb, `plan_inversiones_${year}.xlsx`);
  };
  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14); doc.text('Plan de Inversiones y Gastos', 14, 14);
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text(`${listaFiltrada.length} ítem(s) · Total presupuestado ${fmt(totalFiltrado)} · Generado ${new Date().toLocaleDateString('es-AR')}`, 14, 20);
    doc.setTextColor(0);
    autoTable(doc, {
      startY: 25, styles: { fontSize: 7 }, headStyles: { fillColor: [220, 38, 38] },
      head: [['Gasto / Inversión', 'Tipo', 'Categoría', 'Sucursal', 'Responsable', 'Imp.', 'Urg.', 'Presupuesto', 'Fecha', 'Estado']],
      body: listaFiltrada.map(it => [it.nombre, TIPO_LBL[it.tipo], it.categoria, branchName(it.branch_id), it.responsable, IMP_LBL[it.importancia], URG_LBL[it.urgencia], fmt(it.presupuesto), it.fecha_estimada || '—', EST_LBL[it.estado]]),
    });
    doc.save(`plan_inversiones_${year}.pdf`);
  };

  const inp = 'w-full bg-bg-card border border-border-dim rounded px-2 py-1.5 text-[11px] text-text-main outline-none focus:border-brand-500';
  const lbl = 'text-[9px] font-black uppercase text-text-dim tracking-widest';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Wallet size={18} className="text-brand-500" />
          <h2 className="text-lg font-black uppercase text-text-main tracking-tight">Plan de Inversiones y Gastos</h2>
        </div>
        <p className="text-[11px] text-text-dim font-bold uppercase tracking-widest mb-4">Proyección anual · priorización · calendario de pagos</p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-bg-accent/40 p-1 rounded-lg border border-border-dim/80">
            <button onClick={() => setYear(y => y - 1)} className="p-1.5 hover:bg-bg-sidebar rounded text-text-dim"><ChevronLeft size={15} /></button>
            <span className="text-[12px] font-black text-text-main w-14 text-center">{year}</span>
            <button onClick={() => setYear(y => y + 1)} className="p-1.5 hover:bg-bg-sidebar rounded text-text-dim"><ChevronRight size={15} /></button>
          </div>
          {!isReadOnly && (
            <button onClick={abrirNuevo} className="flex items-center gap-1.5 bg-brand-500 text-white rounded-lg px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-brand-600">
              <Plus size={14} /> Nuevo Gasto / Inversión
            </button>
          )}
          {loading && <Loader2 size={15} className="animate-spin text-brand-500" />}
        </div>
      </div>

      {/* Pestañas */}
      <div className="flex flex-wrap gap-1 border-b border-border-dim/60">
        {([['lista', 'Lista', ListChecks], ['matriz', 'Matriz de prioridad', Grid3x3], ['calendario', 'Calendario de pagos', CalendarDays], ['resumen', 'Resumen', PieChart]] as const).map(([k, l, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn('flex items-center gap-1.5 px-3.5 py-2.5 text-[11px] font-black uppercase tracking-wider rounded-t-lg transition-colors',
              tab === k ? 'text-brand-500 border-b-2 border-brand-500 bg-brand-500/5' : 'text-text-dim hover:text-text-main')}>
            <Icon size={13} /> {l}
          </button>
        ))}
      </div>

      {/* ─────────── LISTA ─────────── */}
      {tab === 'lista' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-dim" />
              <input value={fTexto} onChange={e => setFTexto(e.target.value)} placeholder="Buscar…" className={cn(inp, 'pl-7 w-48')} />
            </div>
            <select value={fTipo} onChange={e => setFTipo(e.target.value as any)} className={cn(inp, 'w-32')}><option value="">Tipo: todos</option><option value="inversion">Inversión</option><option value="gasto">Gasto</option><option value="obra">Obra</option></select>
            <select value={fCat} onChange={e => setFCat(e.target.value)} className={cn(inp, 'w-40')}><option value="">Categoría: todas</option>{categorias.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select value={fImp} onChange={e => setFImp(e.target.value as any)} className={cn(inp, 'w-40')}><option value="">Importancia: todas</option>{IMP_ORDER.map(i => <option key={i} value={i}>{IMP_LBL[i]}</option>)}</select>
            <select value={fUrg} onChange={e => setFUrg(e.target.value as any)} className={cn(inp, 'w-36')}><option value="">Urgencia: todas</option><option value="urgente">Urgente</option><option value="no_urgente">No urgente</option></select>
            <select value={fBranch} onChange={e => setFBranch(e.target.value)} className={cn(inp, 'w-40')}><option value="">Sucursal: todas</option><option value="">General</option>{operative.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            <select value={fEstado} onChange={e => setFEstado(e.target.value as any)} className={cn(inp, 'w-36')}><option value="">Estado: todos</option>{(Object.keys(EST_LBL) as Estado[]).map(s => <option key={s} value={s}>{EST_LBL[s]}</option>)}</select>
            <input value={fResp} onChange={e => setFResp(e.target.value)} placeholder="Responsable…" className={cn(inp, 'w-36')} />
            <div className="ml-auto flex items-center gap-2">
              <button onClick={exportModelo} className="flex items-center gap-1 text-[9px] font-black uppercase text-text-dim border border-border-dim rounded px-2.5 py-1.5 hover:text-text-main hover:border-brand-500" title="Descargar planilla modelo para completar e importar"><Download size={12} /> Modelo</button>
              {!isReadOnly && (
                <label className={cn('flex items-center gap-1 text-[9px] font-black uppercase text-sky-600 border border-sky-500/30 rounded px-2.5 py-1.5 cursor-pointer hover:bg-sky-500/10', importing && 'opacity-50 pointer-events-none')} title="Importar lista desde Excel (usá el Modelo)">
                  {importing ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Importar
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { importarExcel(e.target.files?.[0]); e.currentTarget.value = ''; }} />
                </label>
              )}
              <button onClick={exportExcel} className="flex items-center gap-1 text-[9px] font-black uppercase text-emerald-600 border border-emerald-500/30 rounded px-2.5 py-1.5 hover:bg-emerald-500/10"><Download size={12} /> Excel</button>
              <button onClick={exportPDF} className="flex items-center gap-1 text-[9px] font-black uppercase text-red-500 border border-red-500/30 rounded px-2.5 py-1.5 hover:bg-red-500/10"><FileText size={12} /> PDF</button>
            </div>
          </div>

          <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full text-[12px] border-collapse min-w-[1000px]">
              <thead><tr className="bg-bg-accent/20 text-text-dim">
                {([
                  ['nombre', 'Gasto / Inversión', 'left'],
                  ['categoria', 'Categoría', 'left'],
                  ['tipo', 'Tipo', 'center'],
                  ['branch', 'Sucursal/Área', 'left'],
                  ['responsable', 'Responsable', 'left'],
                  ['prioridad', 'Prioridad', 'center'],
                  ['presupuesto', 'Presupuesto', 'right'],
                  ['fecha', 'Fecha', 'center'],
                  ['estado', 'Estado', 'center'],
                ] as [SortCol, string, 'left' | 'center' | 'right'][]).map(([col, label, align]) => {
                  const active = sort?.col === col;
                  return (
                    <th key={col} className={cn('p-2.5 text-[9px] font-black uppercase tracking-widest', align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center')}>
                      <button
                        onClick={() => toggleSort(col)}
                        className={cn('inline-flex items-center gap-1 select-none hover:text-text-main transition-colors', active && 'text-brand-500', align === 'right' ? 'flex-row-reverse' : '')}
                        title="Ordenar por esta columna"
                      >
                        {label}
                        {active ? (sort!.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ChevronsUpDown size={11} className="opacity-40" />}
                      </button>
                    </th>
                  );
                })}
                <th className="w-16" />
              </tr></thead>
              <tbody>
                {listaFiltrada.length === 0 ? (
                  <tr><td colSpan={10} className="p-8 text-center text-text-dim text-[11px] italic">Sin ítems. {!isReadOnly && 'Agregá uno con "Nuevo Gasto / Inversión".'}</td></tr>
                ) : listaFiltrada.map(it => {
                  const cm = cellMeta(it.importancia, it.urgencia);
                  const ncuotas = (pagosByItem[it.id] || []).length;
                  return (
                    <tr key={it.id} className="border-t border-border-dim/25 hover:bg-bg-accent/20">
                      <td className="p-2.5 font-bold text-text-main">{it.nombre}{it.tipo === 'obra' && it.subGastos.length > 0 && <span className="ml-1.5 text-[8px] font-black uppercase text-indigo-500">· {it.subGastos.length} rubro(s)</span>}{ncuotas > 0 && <span className="ml-1.5 text-[8px] font-black uppercase text-text-dim">· {ncuotas} cuota(s)</span>}</td>
                      <td className="p-2.5 text-text-dim">{it.categoria || '—'}</td>
                      <td className="p-2.5 text-center"><span className={cn('text-[9px] font-black uppercase px-2 py-0.5 rounded', it.tipo === 'inversion' ? 'bg-sky-500/15 text-sky-600' : it.tipo === 'obra' ? 'bg-indigo-500/15 text-indigo-600' : 'bg-amber-500/15 text-amber-600')}>{TIPO_LBL[it.tipo]}</span></td>
                      <td className="p-2.5 text-text-dim">{branchName(it.branch_id)}</td>
                      <td className="p-2.5 text-text-dim">{it.responsable || '—'}</td>
                      <td className="p-2.5 text-center"><span className={cn('text-[8px] font-black uppercase text-white px-2 py-0.5 rounded', cm.bg)} title={`${IMP_LBL[it.importancia]} · ${URG_LBL[it.urgencia]}`}>{cm.label}</span></td>
                      <td className="p-2.5 text-right font-mono font-bold text-text-main">{fmt(it.presupuesto)}</td>
                      <td className="p-2.5 text-center text-text-dim font-mono text-[10px]">{it.fecha_estimada ? new Date(it.fecha_estimada + 'T00:00:00').toLocaleDateString('es-AR') : '—'}</td>
                      <td className="p-2.5 text-center"><span className={cn('text-[9px] font-black uppercase px-2 py-0.5 rounded', EST_COLOR[it.estado])}>{EST_LBL[it.estado]}</span></td>
                      <td className="p-2.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={() => abrirEditar(it)} className="text-text-dim hover:text-brand-500"><Pencil size={14} /></button>
                          {!isReadOnly && <button onClick={() => borrar(it)} className="text-text-dim hover:text-red-500"><Trash2 size={14} /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {listaFiltrada.length > 0 && (
                <tfoot><tr className="border-t-2 border-border-dim bg-bg-accent/20 font-black">
                  <td className="p-2.5 text-text-main uppercase text-[10px]" colSpan={6}>Total ({listaFiltrada.length})</td>
                  <td className="p-2.5 text-right font-mono text-brand-500">{fmt(totalFiltrado)}</td>
                  <td colSpan={3} />
                </tr></tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ─────────── MATRIZ 3×2 ─────────── */}
      {tab === 'matriz' && (() => {
        const activos = items.filter(i => i.estado !== 'hecho' && i.estado !== 'descartado');
        const cel = (imp: Importancia, urg: Urgencia) => activos.filter(i => i.importancia === imp && i.urgencia === urg);
        return (
          <div className="space-y-3">
            <p className="text-[10px] text-text-dim">Matriz de prioridad (Eisenhower) de los ítems <b className="text-text-main">pendientes</b>. Las filas son la importancia; las columnas, la urgencia.</p>
            <div className="overflow-x-auto">
              <div className="min-w-[640px] grid" style={{ gridTemplateColumns: '120px 1fr 1fr' }}>
                <div />
                <div className="text-center text-[10px] font-black uppercase tracking-widest text-red-500 pb-2">Urgente</div>
                <div className="text-center text-[10px] font-black uppercase tracking-widest text-emerald-600 pb-2">No urgente</div>
                {IMP_ORDER.map(imp => (
                  <Fragment key={imp}>
                    <div className="flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-text-dim pr-2 text-right">{IMP_LBL[imp]}</div>
                    {(['urgente', 'no_urgente'] as Urgencia[]).map(urg => {
                      const cm = cellMeta(imp, urg);
                      const list = cel(imp, urg);
                      const tot = list.reduce((s, i) => s + i.presupuesto, 0);
                      return (
                        <div key={`${imp}-${urg}`} className={cn('m-1 rounded-xl p-3 min-h-[120px] ring-1', cm.ring, 'bg-bg-sidebar border border-border-dim')}>
                          <div className="flex items-center justify-between mb-2">
                            <span className={cn('text-[9px] font-black uppercase text-white px-2 py-0.5 rounded', cm.bg)}>{cm.label}</span>
                            <span className="text-[9px] font-mono font-black text-text-dim">{list.length} · {fmt(tot)}</span>
                          </div>
                          <div className="space-y-1">
                            {list.slice(0, 8).map(it => (
                              <button key={it.id} onClick={() => abrirEditar(it)} className="w-full text-left flex items-center justify-between gap-2 bg-bg-accent/40 rounded px-2 py-1 hover:bg-bg-accent">
                                <span className="text-[10px] font-bold text-text-main truncate">{it.nombre}</span>
                                <span className="text-[9px] font-mono text-text-dim shrink-0">{fmt(it.presupuesto)}</span>
                              </button>
                            ))}
                            {list.length > 8 && <p className="text-[9px] text-text-dim italic px-2">+{list.length - 8} más…</p>}
                            {list.length === 0 && <p className="text-[9px] text-text-dim/60 italic px-2">—</p>}
                          </div>
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─────────── CALENDARIO DE PAGOS ─────────── */}
      {tab === 'calendario' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4"><p className={lbl}>Total a pagar en {year}</p><p className="text-xl font-black font-mono text-text-main mt-1">{fmt(calendario.totalAnio)}</p></div>
            <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-4"><p className={lbl}>Ya pagado</p><p className="text-xl font-black font-mono text-emerald-600 mt-1">{fmt(calendario.pagadoAnio)}</p></div>
            <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-4"><p className={lbl}>Pendiente de pago</p><p className="text-xl font-black font-mono text-amber-600 mt-1">{fmt(calendario.totalAnio - calendario.pagadoAnio)}</p></div>
          </div>
          {calendario.sinFecha > 0 && <p className="text-[10px] text-text-dim">⚠ Hay {fmt(calendario.sinFecha)} en ítems <b className="text-text-main">sin fecha probable</b> (no se muestran en el calendario hasta asignarles fecha o cuotas).</p>}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {calendario.mByMonth.map((m, i) => (
              <button key={i} onClick={() => setMesAbierto(mesAbierto === i ? null : i)}
                className={cn('text-left bg-bg-sidebar border rounded-xl p-3 transition-colors', m.total > 0 ? 'border-border-dim hover:border-brand-500' : 'border-border-dim/40 opacity-60')}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase text-text-main">{MESES[i]}</span>
                  <span className="text-[9px] font-mono text-text-dim">{m.detalle.length}</span>
                </div>
                <p className="text-lg font-black font-mono text-text-main mt-1">{fmt(m.total)}</p>
                {m.pagado > 0 && <p className="text-[9px] text-emerald-600 font-bold">pagado {fmt(m.pagado)}</p>}
                {mesAbierto === i && m.detalle.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border-dim/40 space-y-1">
                    {m.detalle.map((d, k) => (
                      <div key={k} className="flex items-center justify-between gap-2">
                        <span className={cn('text-[10px] truncate', d.pagado ? 'text-text-dim line-through' : 'text-text-main')}>{d.nombre}</span>
                        <span className="text-[9px] font-mono text-text-dim shrink-0">{fmt(d.monto)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─────────── RESUMEN ─────────── */}
      {tab === 'resumen' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4"><p className={lbl}>Total proyectado {year}</p><p className="text-xl font-black font-mono text-text-main mt-1">{fmt(resumen.total)}</p><p className="text-[9px] text-text-dim mt-0.5">{resumen.n} ítem(s)</p></div>
            <div className="bg-sky-500/10 border border-sky-500/25 rounded-xl p-4"><p className={lbl}>Inversiones</p><p className="text-xl font-black font-mono text-sky-600 mt-1">{fmt(resumen.totalInv)}</p></div>
            <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-4"><p className={lbl}>Gastos</p><p className="text-xl font-black font-mono text-amber-600 mt-1">{fmt(resumen.totalGasto)}</p></div>
            <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4"><p className={lbl}>Ejecutado (real vs est.)</p>{resumen.estReal.n > 0 ? (<><p className="text-lg font-black font-mono text-text-main mt-1">{fmt(resumen.estReal.real)}</p><p className={cn('text-[9px] font-bold', resumen.estReal.real > resumen.estReal.est ? 'text-red-500' : 'text-emerald-600')}>est. {fmt(resumen.estReal.est)} · {resumen.estReal.est > 0 ? (((resumen.estReal.real - resumen.estReal.est) / resumen.estReal.est) * 100).toFixed(0) : '0'}%</p></>) : <p className="text-[10px] text-text-dim mt-1">Sin ítems "Hecho" con costo real.</p>}</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {([['Por categoría', resumen.porCat], ['Por estado', resumen.porEstado], ['Por sucursal/área', resumen.porSucursal]] as const).map(([titulo, data]) => (
              <div key={titulo} className="bg-bg-sidebar border border-border-dim rounded-xl p-4">
                <h3 className="text-[11px] font-black uppercase tracking-wider text-text-main mb-3">{titulo}</h3>
                {data.length === 0 ? <p className="text-[10px] text-text-dim italic">Sin datos.</p> : (
                  <div className="space-y-1.5">
                    {data.map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-text-main truncate">{k}</span>
                        <span className="text-[11px] font-mono font-bold text-text-dim shrink-0">{fmt(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────── MODAL EDICIÓN ─────────── */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && setEditing(null)}>
          <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border-dim sticky top-0 bg-bg-sidebar z-10">
              <h3 className="text-[13px] font-black uppercase text-text-main tracking-wide">{isNew ? 'Nuevo Gasto / Inversión' : 'Editar'}</h3>
              <button onClick={() => !saving && setEditing(null)} className="text-text-dim hover:text-text-main"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2"><label className={lbl}>Gasto / Inversión *</label><input autoFocus disabled={isReadOnly} className={cn(inp, 'mt-1')} placeholder="Ej. Sillas Interior" value={editing.nombre} onChange={e => setEditing({ ...editing, nombre: e.target.value })} /></div>
                <div><label className={lbl}>Tipo</label><select disabled={isReadOnly} className={cn(inp, 'mt-1')} value={editing.tipo} onChange={e => setEditing({ ...editing, tipo: e.target.value as Tipo })}><option value="inversion">Inversión</option><option value="gasto">Gasto</option><option value="obra">Obra (con sub-gastos)</option></select></div>
                <div><label className={lbl}>Categoría</label><input disabled={isReadOnly} list="cat-list" className={cn(inp, 'mt-1')} placeholder="Ej. Remodelación" value={editing.categoria} onChange={e => setEditing({ ...editing, categoria: e.target.value })} /><datalist id="cat-list">{categorias.map(c => <option key={c} value={c} />)}</datalist></div>
                <div><label className={lbl}>Sucursal / Área</label><select disabled={isReadOnly} className={cn(inp, 'mt-1')} value={editing.branch_id} onChange={e => setEditing({ ...editing, branch_id: e.target.value })}><option value="">General</option>{operative.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
                {(() => { const esObra = editing.tipo === 'obra' && editing.subGastos.length > 0; const sumObra = Math.round(editing.subGastos.reduce((s, x) => s + subTotal(x), 0));
                  return (<div><label className={lbl}>Presupuesto estimado{esObra ? ' (= suma de sub-gastos)' : ''}</label><input type="number" disabled={isReadOnly || esObra} className={cn(inp, 'mt-1 font-mono', esObra && 'opacity-70')} value={esObra ? sumObra : (editing.presupuesto || '')} onChange={e => setEditing({ ...editing, presupuesto: parseFloat(e.target.value) || 0 })} /></div>); })()}
                <div><label className={lbl}>Importancia</label><select disabled={isReadOnly} className={cn(inp, 'mt-1')} value={editing.importancia} onChange={e => setEditing({ ...editing, importancia: e.target.value as Importancia })}>{IMP_ORDER.map(i => <option key={i} value={i}>{IMP_LBL[i]}</option>)}</select></div>
                <div><label className={lbl}>Urgencia</label><select disabled={isReadOnly} className={cn(inp, 'mt-1')} value={editing.urgencia} onChange={e => setEditing({ ...editing, urgencia: e.target.value as Urgencia })}><option value="no_urgente">No urgente</option><option value="urgente">Urgente</option></select></div>
                <div><label className={lbl}>Fecha probable</label><input type="date" disabled={isReadOnly} className={cn(inp, 'mt-1')} value={editing.fecha_estimada || ''} onChange={e => setEditing({ ...editing, fecha_estimada: e.target.value || null })} /></div>
                <div><label className={lbl}>Estado</label><select disabled={isReadOnly} className={cn(inp, 'mt-1')} value={editing.estado} onChange={e => setEditing({ ...editing, estado: e.target.value as Estado })}>{(Object.keys(EST_LBL) as Estado[]).map(s => <option key={s} value={s}>{EST_LBL[s]}</option>)}</select></div>
                <div><label className={lbl}>Costo real (al ejecutar)</label><input type="number" disabled={isReadOnly} className={cn(inp, 'mt-1 font-mono')} placeholder="—" value={editing.costo_real ?? ''} onChange={e => setEditing({ ...editing, costo_real: e.target.value === '' ? null : parseFloat(e.target.value) })} /></div>
                <div><label className={lbl}>Responsable</label><input disabled={isReadOnly} className={cn(inp, 'mt-1')} placeholder="Ej. Manuel (busca presupuesto)" value={editing.responsable} onChange={e => setEditing({ ...editing, responsable: e.target.value })} /></div>
                <div><label className={lbl}>Proveedor</label><input disabled={isReadOnly} className={cn(inp, 'mt-1')} value={editing.proveedor} onChange={e => setEditing({ ...editing, proveedor: e.target.value })} /></div>
                <div className="sm:col-span-2"><label className={lbl}>Notas</label><textarea disabled={isReadOnly} className={cn(inp, 'mt-1 h-16 resize-none')} value={editing.notas} onChange={e => setEditing({ ...editing, notas: e.target.value })} /></div>
              </div>

              {/* Sub-gastos (solo Obra) */}
              {editing.tipo === 'obra' && (
                <div className="border-t border-border-dim pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-500">Sub-gastos de la obra <span className="text-text-dim">(rubros · mano de obra + materiales)</span></h4>
                    {!isReadOnly && <button onClick={() => setEditing({ ...editing, subGastos: [...editing.subGastos, { id: newId(), nombre: '', manoObra: 0, materiales: 0 }] })} className="flex items-center gap-1 text-[9px] font-black uppercase text-brand-500 border border-brand-500/25 rounded px-2 py-1 hover:bg-brand-500/10"><Plus size={11} /> Rubro</button>}
                  </div>
                  {editing.subGastos.length === 0 ? (
                    <p className="text-[10px] text-text-dim italic">Sin sub-gastos. Agregá los rubros de la obra (herrero, pintor, albañil, plomero…), cada uno con su mano de obra y materiales por separado. El presupuesto de la obra es la suma de todos.</p>
                  ) : (
                    <div className="space-y-2">
                      <div className="hidden sm:flex items-center gap-2 px-1 text-[8px] font-black uppercase tracking-widest text-text-dim">
                        <span className="flex-1 min-w-[140px]">Rubro</span>
                        <span className="w-32 text-right">Mano de obra</span>
                        <span className="w-32 text-right">Materiales</span>
                        <span className="w-28 text-right">Subtotal</span>
                        <span className="w-4" />
                      </div>
                      {editing.subGastos.map(s => (
                        <div key={s.id} className="flex flex-wrap items-center gap-2">
                          <input disabled={isReadOnly} className={cn(inp, 'flex-1 min-w-[140px]')} placeholder="Rubro (ej. Herrero, Pintor, Albañil…)" value={s.nombre} onChange={e => setEditing({ ...editing, subGastos: editing.subGastos.map(x => x.id === s.id ? { ...x, nombre: e.target.value } : x) })} />
                          <input type="number" disabled={isReadOnly} className={cn(inp, 'w-32 font-mono')} placeholder="Mano de obra" value={s.manoObra || ''} onChange={e => setEditing({ ...editing, subGastos: editing.subGastos.map(x => x.id === s.id ? { ...x, manoObra: parseFloat(e.target.value) || 0 } : x) })} />
                          <input type="number" disabled={isReadOnly} className={cn(inp, 'w-32 font-mono')} placeholder="Materiales" value={s.materiales || ''} onChange={e => setEditing({ ...editing, subGastos: editing.subGastos.map(x => x.id === s.id ? { ...x, materiales: parseFloat(e.target.value) || 0 } : x) })} />
                          <span className="w-28 text-right font-mono text-[11px] font-bold text-text-main">{fmt(subTotal(s))}</span>
                          {!isReadOnly && <button onClick={() => setEditing({ ...editing, subGastos: editing.subGastos.filter(x => x.id !== s.id) })} className="text-text-dim hover:text-red-500"><Trash2 size={13} /></button>}
                        </div>
                      ))}
                      <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-[10px] font-bold pt-1">
                        <span className="text-text-dim">Mano de obra: <span className="text-text-main font-mono">{fmt(editing.subGastos.reduce((s, x) => s + (Number(x.manoObra) || 0), 0))}</span></span>
                        <span className="text-text-dim">Materiales: <span className="text-text-main font-mono">{fmt(editing.subGastos.reduce((s, x) => s + (Number(x.materiales) || 0), 0))}</span></span>
                        <span className="text-emerald-600">Total obra: {fmt(editing.subGastos.reduce((s, x) => s + subTotal(x), 0))}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Cuotas */}
              <div className="border-t border-border-dim pt-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-text-main">Pagos / cuotas</h4>
                  {!isReadOnly && <button onClick={addPago} className="flex items-center gap-1 text-[9px] font-black uppercase text-brand-500 border border-brand-500/25 rounded px-2 py-1 hover:bg-brand-500/10"><Plus size={11} /> Cuota</button>}
                </div>
                {editPagos.length === 0 ? (
                  <p className="text-[10px] text-text-dim italic">Sin cuotas. Si no cargás cuotas, se toma el presupuesto completo en la fecha probable.</p>
                ) : (
                  <div className="space-y-2">
                    {editPagos.map((p) => (
                      <div key={p.id} className="flex flex-wrap items-center gap-2">
                        <input type="date" disabled={isReadOnly} className={cn(inp, 'w-36')} value={p.fecha} onChange={e => setEditPagos(prev => prev.map(x => x.id === p.id ? { ...x, fecha: e.target.value } : x))} />
                        <input type="number" disabled={isReadOnly} className={cn(inp, 'w-32 font-mono')} placeholder="Monto" value={p.monto || ''} onChange={e => setEditPagos(prev => prev.map(x => x.id === p.id ? { ...x, monto: parseFloat(e.target.value) || 0 } : x))} />
                        <input disabled={isReadOnly} className={cn(inp, 'flex-1 min-w-[120px]')} placeholder="Detalle (ej. Seña, Cuota 1)" value={p.descripcion} onChange={e => setEditPagos(prev => prev.map(x => x.id === p.id ? { ...x, descripcion: e.target.value } : x))} />
                        <button disabled={isReadOnly} onClick={() => setEditPagos(prev => prev.map(x => x.id === p.id ? { ...x, pagado: !x.pagado } : x))} className={cn('px-2 py-1 rounded text-[9px] font-black uppercase', p.pagado ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/30' : 'bg-bg-accent border border-border-dim text-text-dim')}>{p.pagado ? 'Pagado' : 'Pendiente'}</button>
                        {!isReadOnly && <button onClick={() => setEditPagos(prev => prev.filter(x => x.id !== p.id))} className="text-text-dim hover:text-red-500"><Trash2 size={13} /></button>}
                      </div>
                    ))}
                    <p className={cn('text-[10px] font-bold', Math.abs(sumCuotas - editing.presupuesto) < 1 ? 'text-emerald-600' : 'text-amber-600')}>
                      Suma de cuotas: {fmt(sumCuotas)} {Math.abs(sumCuotas - editing.presupuesto) >= 1 && `· presupuesto: ${fmt(editing.presupuesto)}`}
                    </p>
                  </div>
                )}
              </div>
            </div>
            {!isReadOnly && (
              <div className="flex justify-end gap-2 px-5 py-3 border-t border-border-dim sticky bottom-0 bg-bg-sidebar">
                <button onClick={() => setEditing(null)} disabled={saving} className="text-[10px] font-black uppercase text-text-dim px-4 py-2 hover:text-text-main">Cancelar</button>
                <button onClick={guardar} disabled={saving} className="flex items-center gap-2 bg-brand-500 text-white rounded-lg px-5 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 disabled:opacity-50">{saving ? <Loader2 size={13} className="animate-spin" /> : null} Guardar</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
