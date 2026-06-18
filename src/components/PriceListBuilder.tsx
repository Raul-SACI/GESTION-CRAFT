/**
 * SPDX-License-Identifier: Apache-2.0
 * Armado de una nueva lista de precios a partir de los precios sugeridos (ideales s/inflación).
 * Permite editar cada precio, guardar borrador, exportar (Excel/PDF) y confirmar vigencia desde una fecha.
 */
import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Save, FileSpreadsheet, FileText, CheckCircle2, Loader2, FolderOpen, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

interface BuilderItem {
  id: string; category: string; name: string;
  precioActual: number; precioInicial?: number | null;
  precioSugerido: number; // editable
}

interface Draft {
  id: string; nombre: string; menu_tipo: string; fecha_vigencia: string | null;
  estado: string; items: BuilderItem[]; updated_at?: string;
}

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;
const uid = () => Math.random().toString(36).slice(2, 12);

export default function PriceListBuilder({
  menuType, menuLabel, items, onClose, onConfirmed, isReadOnly
}: {
  menuType: string;
  menuLabel: string;
  items: BuilderItem[];
  onClose: () => void;
  onConfirmed: () => void; // recargar la lista principal tras confirmar vigencia
  isReadOnly?: boolean;
}) {
  const [rows, setRows] = useState<BuilderItem[]>(items);
  const [nombre, setNombre] = useState(`Lista ${menuLabel} - ${todayISO()}`);
  const [fechaVigencia, setFechaVigencia] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);

  useEffect(() => { loadDrafts(); }, []);

  const loadDrafts = async () => {
    try {
      const { data } = await supabase.from('price_list_drafts').select('*').eq('menu_tipo', menuType).eq('estado', 'borrador').order('updated_at', { ascending: false });
      setDrafts((data as Draft[]) || []);
    } catch (e) { console.error('Error cargando borradores:', e); }
  };

  const setPrecio = (id: string, v: number) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, precioSugerido: v } : r));
  };

  const guardarBorrador = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    setSaving(true);
    try {
      const id = draftId || uid();
      const { error } = await supabase.from('price_list_drafts').upsert({
        id, nombre, menu_tipo: menuType, fecha_vigencia: fechaVigencia,
        estado: 'borrador', items: rows, updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setDraftId(id);
      await loadDrafts();
      alert('Borrador guardado.');
    } catch (e: any) { alert('Error al guardar el borrador: ' + (e.message || e)); }
    setSaving(false);
  };

  const cargarBorrador = (d: Draft) => {
    setRows(d.items || []);
    setNombre(d.nombre);
    setFechaVigencia(d.fecha_vigencia || todayISO());
    setDraftId(d.id);
    setShowDrafts(false);
  };

  const borrarBorrador = async (id: string) => {
    if (!window.confirm('¿Eliminar este borrador?')) return;
    try {
      await supabase.from('price_list_drafts').delete().eq('id', id);
      await loadDrafts();
      if (draftId === id) setDraftId(null);
    } catch (e: any) { alert('Error: ' + (e.message || e)); }
  };

  const exportExcel = () => {
    const data = rows.map(r => ({
      'Categoría': r.category,
      'Producto': r.name,
      'Precio Actual': r.precioActual,
      'Precio Nuevo': r.precioSugerido,
      'Variación %': r.precioActual > 0 ? Math.round(((r.precioSugerido - r.precioActual) / r.precioActual) * 1000) / 10 : 0,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lista de Precios');
    XLSX.writeFile(wb, `lista_precios_${menuType}_${fechaVigencia}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`CRAFT · Lista de Precios ${menuLabel}`, 14, 18);
    doc.setFontSize(10);
    doc.text(`Vigente desde: ${fechaVigencia.split('-').reverse().join('/')}`, 14, 25);
    autoTable(doc, {
      startY: 32,
      head: [['Categoría', 'Producto', 'Precio']],
      body: rows.map(r => [r.category, r.name, fmt(r.precioSugerido)]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [227, 30, 36] },
    });
    doc.save(`lista_precios_${menuType}_${fechaVigencia}.pdf`);
  };

  const confirmarVigencia = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    const cambios = rows.filter(r => r.precioSugerido !== r.precioActual);
    if (cambios.length === 0) { alert('No hay precios modificados respecto al actual.'); return; }
    if (!window.confirm(
      `Vas a dejar VIGENTES ${cambios.length} precio(s) nuevos para "${menuLabel}" desde el ${fechaVigencia.split('-').reverse().join('/')}.\n\n` +
      `Los precios anteriores quedan guardados en el historial para comparar la evolución.\n\n¿Confirmás?`
    )) return;
    setSaving(true);
    try {
      // Actualiza el precio actual de cada item modificado y registra el cambio en el historial
      for (const r of cambios) {
        const { error: upErr } = await supabase.from('menu_items')
          .update({ price: r.precioSugerido, last_update: fechaVigencia })
          .eq('id', r.id);
        if (upErr) throw upErr;
        await supabase.from('menu_price_history').insert([{
          menu_item_id: r.id, menu_type: menuType, category: r.category, item_name: r.name,
          old_price: r.precioActual, new_price: r.precioSugerido, change_date: fechaVigencia,
        }]);
      }
      // Marcar el borrador como confirmado (si venía de uno)
      if (draftId) {
        await supabase.from('price_list_drafts').update({ estado: 'confirmada', updated_at: new Date().toISOString() }).eq('id', draftId);
      }
      alert(`Listo. ${cambios.length} precio(s) quedaron vigentes desde el ${fechaVigencia.split('-').reverse().join('/')}.`);
      onConfirmed();
      onClose();
    } catch (e: any) { alert('Error al confirmar: ' + (e.message || e)); }
    setSaving(false);
  };

  const totalCambios = rows.filter(r => r.precioSugerido !== r.precioActual).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-bg-sidebar border border-border-dim rounded-xl w-full max-w-5xl shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-border-dim flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-text-main">Armar Lista de Precios · {menuLabel}</h3>
            <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest mt-0.5">Editá los precios sugeridos, guardá borrador o dejalos vigentes</p>
          </div>
          <button onClick={onClose} className="text-text-dim hover:text-text-main"><X size={20} /></button>
        </div>

        {/* Controles */}
        <div className="p-4 border-b border-border-dim flex flex-wrap items-end gap-3 bg-bg-accent/20">
          <div className="flex-1 min-w-[200px]">
            <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Nombre de la lista</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Vigente desde</label>
            <input type="date" value={fechaVigencia} onChange={e => setFechaVigencia(e.target.value)} className="bg-bg-card border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500" />
          </div>
          <button onClick={() => { setShowDrafts(!showDrafts); }} className="flex items-center gap-1.5 bg-bg-card border border-border-dim px-3 py-2 rounded text-[9px] font-black uppercase tracking-widest text-text-dim hover:text-text-main transition-all">
            <FolderOpen size={13} /> Borradores ({drafts.length})
          </button>
        </div>

        {/* Lista de borradores */}
        {showDrafts && (
          <div className="px-4 py-3 border-b border-border-dim bg-bg-accent/10 max-h-40 overflow-y-auto space-y-1">
            {drafts.length === 0 ? (
              <p className="text-[10px] text-text-dim font-bold uppercase text-center py-2">No hay borradores guardados</p>
            ) : drafts.map(d => (
              <div key={d.id} className="flex items-center justify-between gap-2 bg-bg-card border border-border-dim/50 rounded px-3 py-2">
                <button onClick={() => cargarBorrador(d)} className="flex-1 text-left">
                  <span className="text-[11px] font-bold text-text-main">{d.nombre}</span>
                  <span className="text-[8px] text-text-dim uppercase ml-2">vig. {d.fecha_vigencia ? d.fecha_vigencia.split('-').reverse().join('/') : '—'}</span>
                </button>
                <button onClick={() => borrarBorrador(d.id)} className="text-text-dim hover:text-red-500"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}

        {/* Tabla editable */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-bg-accent z-10">
              <tr className="border-b border-border-dim text-[9px] font-black uppercase text-text-dim tracking-widest">
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3 text-right">Precio Actual</th>
                <th className="px-4 py-3 text-right">Precio Nuevo</th>
                <th className="px-4 py-3 text-center">Var.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dim/40">
              {rows.map(r => {
                const varPct = r.precioActual > 0 ? ((r.precioSugerido - r.precioActual) / r.precioActual) * 100 : 0;
                const changed = r.precioSugerido !== r.precioActual;
                return (
                  <tr key={r.id} className={cn("text-[11px] hover:bg-bg-accent/10", changed && "bg-brand-500/5")}>
                    <td className="px-4 py-2"><span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-bg-accent border border-border-dim text-text-dim">{r.category}</span></td>
                    <td className="px-4 py-2 font-bold text-text-main uppercase">{r.name}</td>
                    <td className="px-4 py-2 text-right font-mono text-text-dim">{fmt(r.precioActual)}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-brand-500 font-mono text-[11px]">$</span>
                        <input type="number" value={r.precioSugerido}
                          onChange={e => setPrecio(r.id, parseFloat(e.target.value) || 0)}
                          className="w-28 bg-bg-card border border-border-dim rounded px-2 py-1 text-right text-[12px] font-mono font-black text-brand-500 outline-none focus:border-brand-500" />
                      </div>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={cn("text-[10px] font-black font-mono", varPct > 0 ? "text-emerald-500" : varPct < 0 ? "text-red-500" : "text-text-dim")}>
                        {varPct > 0 ? '+' : ''}{varPct.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer con acciones */}
        <div className="p-4 border-t border-border-dim flex flex-wrap items-center justify-between gap-3 bg-bg-accent/20">
          <span className="text-[10px] font-black uppercase text-text-dim tracking-widest">{totalCambios} precio(s) modificado(s)</span>
          <div className="flex flex-wrap gap-2">
            <button onClick={exportExcel} className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 px-3 py-2 rounded text-[9px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all">
              <FileSpreadsheet size={13} /> Excel
            </button>
            <button onClick={exportPdf} className="flex items-center gap-1.5 bg-bg-card text-text-dim border border-border-dim px-3 py-2 rounded text-[9px] font-black uppercase tracking-widest hover:text-text-main transition-all">
              <FileText size={13} /> PDF
            </button>
            <button onClick={guardarBorrador} disabled={saving || isReadOnly} className="flex items-center gap-1.5 bg-bg-card text-text-main border border-border-dim px-3 py-2 rounded text-[9px] font-black uppercase tracking-widest hover:border-brand-500/50 transition-all disabled:opacity-50">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar Borrador
            </button>
            <button onClick={confirmarVigencia} disabled={saving || isReadOnly} className="flex items-center gap-1.5 bg-brand-500 text-white px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all disabled:opacity-50">
              <CheckCircle2 size={13} /> Dejar Vigente
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
