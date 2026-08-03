/**
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileCheck2,
  Clock,
  CheckCircle2,
  Calendar,
  Plus,
  Edit2,
  Trash2,
  X,
  Search,
  Ban,
  User,
  FileSpreadsheet,
  FileText,
  Landmark,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';

interface Cheque {
  id: string;
  fecha_emision: string;
  destinatario: string;
  monto: number;
  fecha_pago: string;
  banco: string;
  tipo: 'fisico' | 'echeq';
  numero?: string | null;
  estado: 'pendiente' | 'pagado' | 'anulado';
  created_by?: string | null;
  created_at?: string;
}

const ESTADO_CONF: Record<string, { label: string; bg: string; text: string; border: string }> = {
  pendiente: { label: 'PENDIENTE', bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
  pagado: { label: 'PAGADO', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  anulado: { label: 'ANULADO', bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/20' },
};

const fmtMoney = (n: number) => `$${Number(n || 0).toLocaleString('es-AR')}`;
const fmtFecha = (iso: string) => {
  if (!iso) return '-';
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
};

export default function ChequesEmitidosView({
  currentUserName = 'Sistema',
  isReadOnly = false,
}: { currentUserName?: string; isReadOnly?: boolean } = {}) {
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<'all' | 'pendiente' | 'pagado' | 'anulado'>('all');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Cheque | null>(null);
  const [fEmision, setFEmision] = useState('');
  const [fDest, setFDest] = useState('');
  const [fMonto, setFMonto] = useState<number>(0);
  const [fPago, setFPago] = useState('');
  const [fTipo, setFTipo] = useState<'fisico' | 'echeq'>('fisico');
  const [fNumero, setFNumero] = useState('');
  const [fEstado, setFEstado] = useState<'pendiente' | 'pagado' | 'anulado'>('pendiente');

  const todayISO = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('cheques_emitidos')
      .select('*')
      .order('fecha_pago', { ascending: true });
    if (!error && data) {
      setCheques(data as Cheque[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    if (isReadOnly) return;
    setEditing(null);
    setFEmision(todayISO);
    setFDest('');
    setFMonto(0);
    setFPago(todayISO);
    setFTipo('fisico');
    setFNumero('');
    setFEstado('pendiente');
    setShowModal(true);
  };

  const openEdit = (c: Cheque) => {
    if (isReadOnly) return;
    setEditing(c);
    setFEmision(c.fecha_emision);
    setFDest(c.destinatario);
    setFMonto(c.monto);
    setFPago(c.fecha_pago);
    setFTipo(c.tipo === 'echeq' ? 'echeq' : 'fisico');
    setFNumero(c.numero || '');
    setFEstado(c.estado);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!fDest.trim() || fMonto <= 0 || !fEmision || !fPago) {
      alert('Completá el destinatario, un monto válido, la fecha de emisión y la fecha de pago.');
      return;
    }
    const payload: any = {
      fecha_emision: fEmision,
      destinatario: fDest.trim().toUpperCase(),
      monto: Number(fMonto),
      fecha_pago: fPago,
      banco: 'SANTANDER',
      tipo: fTipo,
      numero: fNumero.trim() || null,
      estado: fEstado,
    };

    if (editing) {
      const { error } = await supabase.from('cheques_emitidos').update(payload).eq('id', editing.id);
      if (error) { alert('No se pudo guardar: ' + error.message); return; }
      setCheques(prev => prev.map(c => c.id === editing.id ? { ...c, ...payload } : c));
    } else {
      payload.created_by = currentUserName;
      const { data, error } = await supabase.from('cheques_emitidos').insert([payload]).select().single();
      if (error) { alert('No se pudo guardar: ' + error.message); return; }
      if (data) setCheques(prev => [...prev, data as Cheque]);
    }
    setShowModal(false);
  };

  const handleDelete = async (id: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!window.confirm('¿Eliminar este cheque? Dejará de impactar en el Cronograma y en Pasivos Bancarios.')) return;
    const { error } = await supabase.from('cheques_emitidos').delete().eq('id', id);
    if (error) { alert('No se pudo eliminar: ' + error.message); return; }
    setCheques(prev => prev.filter(c => c.id !== id));
  };

  const cambiarEstado = async (c: Cheque, nuevo: 'pendiente' | 'pagado' | 'anulado') => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    const { error } = await supabase.from('cheques_emitidos').update({ estado: nuevo }).eq('id', c.id);
    if (error) { alert('No se pudo actualizar: ' + error.message); return; }
    setCheques(prev => prev.map(x => x.id === c.id ? { ...x, estado: nuevo } : x));
  };

  const processed = useMemo(() => {
    let list = [...cheques];
    if (filterEstado !== 'all') list = list.filter(c => c.estado === filterEstado);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.destinatario.toLowerCase().includes(q) ||
        (c.numero || '').toLowerCase().includes(q) ||
        (c.created_by || '').toLowerCase().includes(q) ||
        c.fecha_pago.includes(q)
      );
    }
    return list.sort((a, b) => a.fecha_pago.localeCompare(b.fecha_pago));
  }, [cheques, search, filterEstado]);

  const stats = useMemo(() => {
    const pend = cheques.filter(c => c.estado === 'pendiente');
    const totalPend = pend.reduce((s, c) => s + Number(c.monto || 0), 0);
    const proximo = [...pend].sort((a, b) => a.fecha_pago.localeCompare(b.fecha_pago))[0];
    const pagados = cheques.filter(c => c.estado === 'pagado').reduce((s, c) => s + Number(c.monto || 0), 0);
    return {
      totalPend,
      countPend: pend.length,
      proximo: proximo ? fmtFecha(proximo.fecha_pago) : '—',
      pagados,
    };
  }, [cheques]);

  const exportExcel = () => {
    const aoa: any[][] = [
      ['CHEQUES EMITIDOS · BANCO SANTANDER'],
      [],
      ['Emisión', 'Destinatario', 'Tipo', 'N° Cheque', 'F. Pago', 'Monto', 'Estado', 'Generado por'],
    ];
    processed.forEach(c => aoa.push([
      fmtFecha(c.fecha_emision), c.destinatario, c.tipo === 'echeq' ? 'e-Cheq' : 'Físico',
      c.numero || '', fmtFecha(c.fecha_pago), Number(c.monto || 0), (ESTADO_CONF[c.estado]?.label || c.estado), c.created_by || '',
    ]));
    aoa.push([]);
    aoa.push(['', '', '', '', 'TOTAL PENDIENTE', stats.totalPend]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cheques Emitidos');
    XLSX.writeFile(wb, 'cheques_emitidos.xlsx');
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text('Cheques Emitidos · Banco Santander', 14, 15);
    doc.setFontSize(9); doc.text(`Total pendiente: ${fmtMoney(stats.totalPend)}  ·  ${stats.countPend} cheque(s) por pagar`, 14, 21);
    autoTable(doc, {
      head: [['Emisión', 'Destinatario', 'Tipo', 'N°', 'F. Pago', 'Monto', 'Estado', 'Generado por']],
      body: processed.map(c => [
        fmtFecha(c.fecha_emision), c.destinatario, c.tipo === 'echeq' ? 'e-Cheq' : 'Físico',
        c.numero || '-', fmtFecha(c.fecha_pago), fmtMoney(c.monto), (ESTADO_CONF[c.estado]?.label || c.estado), c.created_by || '-',
      ]),
      startY: 26, styles: { fontSize: 8, cellPadding: 1.8 }, headStyles: { fillColor: [193, 18, 31] },
      columnStyles: { 5: { halign: 'right' } },
    });
    doc.save('cheques_emitidos.pdf');
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Title */}
      <div className="flex flex-wrap justify-between items-end gap-4 border-b border-border-dim pb-4">
        <div>
          <h2 className="text-xl font-black uppercase text-text-main tracking-widest flex items-center gap-2">
            <FileCheck2 className="text-brand-500" size={24} /> Cheques Emitidos
          </h2>
          <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mt-1 opacity-70">
            Cheques físicos y e-cheq emitidos desde Banco Santander · impactan en el Cronograma y en Pasivos Bancarios en su fecha de pago
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportExcel} className="bg-bg-accent border border-border-dim text-text-main px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:border-emerald-500/50 transition-all flex items-center gap-2">
            <FileSpreadsheet size={13} /> Excel
          </button>
          <button onClick={exportPDF} className="bg-bg-accent border border-border-dim text-text-main px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:border-brand-500/50 transition-all flex items-center gap-2">
            <FileText size={13} /> PDF
          </button>
          {!isReadOnly && (
            <button onClick={openAdd} className="bg-brand-500 text-black px-5 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-xl shadow-brand-500/10 flex items-center gap-2">
              <Plus size={14} /> Emitir Cheque
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Pendiente', value: fmtMoney(stats.totalPend), color: 'text-brand-500', icon: Clock, desc: 'Cheques por pagar (Santander)' },
          { label: 'Próximo Pago', value: stats.proximo, color: 'text-orange-500', icon: Calendar, desc: 'Fecha del próximo cheque' },
          { label: 'Cheques Pendientes', value: String(stats.countPend), color: 'text-text-main', icon: FileCheck2, desc: 'Cantidad por cubrir' },
          { label: 'Pagados', value: fmtMoney(stats.pagados), color: 'text-emerald-500', icon: CheckCircle2, desc: 'Cheques ya cobrados' },
        ].map((s, i) => (
          <div key={i} className="bg-bg-sidebar border border-border-dim/80 p-4 rounded-xl flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-black text-text-dim uppercase tracking-wider">{s.label}</span>
              <s.icon size={13} className={s.color} />
            </div>
            <div>
              <p className={cn('text-lg font-mono font-black', s.color)}>{s.value}</p>
              <p className="text-[8px] text-text-dim mt-0.5 uppercase tracking-wide opacity-65">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Banco banner */}
      <div className="bg-red-500/5 border border-red-500/20 rounded-xl px-5 py-3 flex items-center gap-3">
        <Landmark size={16} className="text-red-500" />
        <p className="text-[10px] font-bold text-text-dim uppercase tracking-widest">
          Todos los cheques se emiten desde <span className="text-red-400 font-black">BANCO SANTANDER</span>. El monto se reserva en el flujo el día de su fecha de pago.
        </p>
      </div>

      {/* Controls */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black text-text-dim uppercase tracking-wider">Filtro:</span>
            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value as any)}
              className="bg-bg-accent border border-border-dim rounded px-3 py-1.5 text-[10px] font-bold uppercase text-text-main outline-none focus:border-brand-500"
            >
              <option value="all">Todos los estados</option>
              <option value="pendiente">Pendientes</option>
              <option value="pagado">Pagados</option>
              <option value="anulado">Anulados</option>
            </select>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={14} />
            <input
              type="text"
              placeholder="BUSCAR POR DESTINATARIO, N°, USUARIO..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-bg-accent border border-border-dim rounded-full pl-9 pr-4 py-2 text-[10px] text-text-main outline-none focus:border-brand-500 uppercase font-black"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-main">
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="border border-border-dim/60 rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-bg-accent/40 border-b border-border-dim">
                <th className="px-4 py-3.5 text-[10px] font-black uppercase text-text-dim tracking-widest">Destinatario</th>
                <th className="px-4 py-3.5 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Tipo</th>
                <th className="px-4 py-3.5 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Emisión</th>
                <th className="px-4 py-3.5 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">F. Pago</th>
                <th className="px-4 py-3.5 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Monto</th>
                <th className="px-4 py-3.5 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Estado</th>
                <th className="px-4 py-3.5 text-[10px] font-black uppercase text-text-dim tracking-widest">Generó</th>
                {!isReadOnly && <th className="px-4 py-3.5 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dim/30 font-medium">
              {processed.map(c => {
                const conf = ESTADO_CONF[c.estado] || ESTADO_CONF.pendiente;
                return (
                  <tr key={c.id} className="hover:bg-bg-accent/15 transition-colors group">
                    <td className="px-4 py-4">
                      <p className="text-[11px] font-black text-text-main uppercase tracking-tight">{c.destinatario}</p>
                      {c.numero && <span className="text-[8px] font-bold text-text-dim uppercase">N° {c.numero}</span>}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={cn(
                        'text-[8px] font-black uppercase px-2 py-0.5 rounded border tracking-wider',
                        c.tipo === 'echeq' ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' : 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20'
                      )}>
                        {c.tipo === 'echeq' ? 'e-Cheq' : 'Físico'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center text-xs font-mono text-text-dim">{fmtFecha(c.fecha_emision)}</td>
                    <td className="px-4 py-4 text-center text-xs font-mono font-bold text-text-main">{fmtFecha(c.fecha_pago)}</td>
                    <td className="px-4 py-4 text-right text-xs font-mono font-black text-text-main italic">{fmtMoney(c.monto)}</td>
                    <td className="px-4 py-4 text-center">
                      {isReadOnly ? (
                        <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded border text-[9px] font-black uppercase tracking-tighter', conf.bg, conf.text, conf.border)}>
                          {conf.label}
                        </span>
                      ) : (
                        <button
                          onClick={() => cambiarEstado(c, c.estado === 'pagado' ? 'pendiente' : 'pagado')}
                          disabled={c.estado === 'anulado'}
                          className={cn(
                            'inline-flex items-center gap-1 px-2.5 py-0.5 rounded border text-[9px] font-black uppercase tracking-tighter select-none transition-all',
                            conf.bg, conf.text, conf.border,
                            c.estado === 'anulado' ? 'opacity-60 cursor-default' : 'cursor-pointer hover:brightness-125',
                            c.estado === 'pendiente' ? 'animate-pulse' : ''
                          )}
                          title={c.estado === 'anulado' ? 'Cheque anulado' : 'Cambiar estado pagado/pendiente'}
                        >
                          {conf.label}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-[9px] font-bold text-text-dim uppercase tracking-wide flex items-center gap-1">
                        <User size={10} /> {c.created_by || '—'}
                      </span>
                    </td>
                    {!isReadOnly && (
                      <td className="px-4 py-4 text-center">
                        <div className="flex justify-center items-center gap-1.5">
                          <button onClick={() => openEdit(c)} className="p-1 border border-border-dim/60 hover:border-brand-500/50 rounded hover:text-brand-500 text-text-dim transition-all" title="Editar">
                            <Edit2 size={11} />
                          </button>
                          {c.estado !== 'anulado' && (
                            <button onClick={() => cambiarEstado(c, 'anulado')} className="p-1 border border-border-dim/60 hover:border-zinc-400/50 rounded hover:text-zinc-300 text-text-dim transition-all" title="Anular">
                              <Ban size={11} />
                            </button>
                          )}
                          <button onClick={() => handleDelete(c.id)} className="p-1 border border-border-dim/60 hover:border-red-500/50 rounded hover:text-red-500 text-text-dim transition-all" title="Eliminar">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {!loading && processed.length === 0 && (
                <tr>
                  <td colSpan={isReadOnly ? 7 : 8} className="py-8 text-center text-xs text-text-dim uppercase font-bold italic">
                    Sin cheques registrados
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={isReadOnly ? 7 : 8} className="py-8 text-center text-xs text-text-dim uppercase font-bold italic">
                    Cargando cheques...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-bg-sidebar border border-border-dim p-6 rounded-xl w-full max-w-lg shadow-2xl relative"
            >
              <button onClick={() => setShowModal(false)} className="absolute right-4 top-4 text-text-dim hover:text-red-500 transition-colors">
                <X size={18} />
              </button>
              <h3 className="text-sm font-black text-brand-500 uppercase tracking-widest mb-6 border-l-2 border-brand-500 pl-3">
                {editing ? 'Editar Cheque' : 'Emitir Cheque'} · Santander
              </h3>

              <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-text-dim uppercase tracking-wider">Destinatario / Beneficiario</label>
                  <input
                    type="text"
                    value={fDest}
                    onChange={(e) => setFDest(e.target.value)}
                    placeholder="Ej: DISTRIBUIDORA NORTE S.A."
                    className="w-full px-3 py-2 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 uppercase font-black"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-text-dim uppercase tracking-wider">Tipo de Cheque</label>
                    <select
                      value={fTipo}
                      onChange={(e) => setFTipo(e.target.value as any)}
                      className="w-full px-3 py-2 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 font-bold uppercase"
                    >
                      <option value="fisico">Físico</option>
                      <option value="echeq">e-Cheq</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-text-dim uppercase tracking-wider">N° de Cheque (opcional)</label>
                    <input
                      type="text"
                      value={fNumero}
                      onChange={(e) => setFNumero(e.target.value)}
                      placeholder="Ej: 00012345"
                      className="w-full px-3 py-2 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-text-dim uppercase tracking-wider">Fecha de Emisión</label>
                    <input
                      type="date"
                      value={fEmision}
                      onChange={(e) => setFEmision(e.target.value)}
                      className="w-full px-3 py-2 bg-bg-accent border border-border-dim rounded text-text-main text-xs font-mono outline-none focus:border-brand-500 font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-brand-500 uppercase tracking-wider">Fecha de Pago (impacta flujo)</label>
                    <input
                      type="date"
                      value={fPago}
                      onChange={(e) => setFPago(e.target.value)}
                      className="w-full px-3 py-2 bg-bg-accent border border-brand-500/40 rounded text-text-main text-xs font-mono outline-none focus:border-brand-500 font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-text-dim uppercase tracking-wider">Monto ($)</label>
                    <input
                      type="number"
                      value={fMonto || ''}
                      onChange={(e) => setFMonto(Number(e.target.value))}
                      placeholder="0"
                      className="w-full px-3 py-2 bg-bg-accent border border-border-dim rounded text-text-main text-xs font-mono outline-none focus:border-brand-500 font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-text-dim uppercase tracking-wider">Estado</label>
                    <select
                      value={fEstado}
                      onChange={(e) => setFEstado(e.target.value as any)}
                      className="w-full px-3 py-2 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 font-bold uppercase"
                    >
                      <option value="pendiente">Pendiente</option>
                      <option value="pagado">Pagado</option>
                      <option value="anulado">Anulado</option>
                    </select>
                  </div>
                </div>

                <div className="p-3 bg-bg-accent/40 border border-border-dim rounded-lg flex items-center gap-2">
                  <Landmark size={13} className="text-red-500" />
                  <span className="text-[9px] font-bold text-text-dim uppercase tracking-widest">Banco: <span className="text-red-400 font-black">SANTANDER</span></span>
                  {!editing && (
                    <span className="ml-auto text-[9px] font-bold text-text-dim uppercase tracking-widest flex items-center gap-1">
                      <User size={11} /> Genera: <span className="text-text-main font-black">{currentUserName}</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                <button onClick={handleSave} className="flex-1 bg-brand-500 text-black py-2.5 rounded text-[11px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all">
                  {editing ? 'Guardar Cambios' : 'Registrar Cheque'}
                </button>
                <button onClick={() => setShowModal(false)} className="px-6 py-2.5 rounded border border-border-dim text-text-dim text-[11px] font-black uppercase tracking-widest hover:bg-bg-accent transition-all">
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
