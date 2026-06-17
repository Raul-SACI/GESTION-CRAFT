/**
 * SPDX-License-Identifier: Apache-2.0
 * GiftCard digital de CRAFT (Marketing & Comercial).
 * Genera una gift card en PDF con el diseño de CRAFT y guarda el registro de cada emisión.
 */
import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Loader2, Gift, Download, Trash2, Plus } from 'lucide-react';
import jsPDF from 'jspdf';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import { GIFTCARD_BG } from './giftCardBg';

interface GiftCardRec {
  id: string; codigo: string; para: string; regalo: string; de_parte_de: string; fecha_emision: string; created_at?: string;
}

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const fmtDMY = (iso: string) => { if (!iso) return ''; const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; };
// Código único tipo CRAFT-XXXX-XXXX
const genCodigo = () => {
  const part = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CRAFT-${part()}-${part()}`;
};

export default function GiftCardView({ isReadOnly }: { isReadOnly?: boolean }) {
  const [records, setRecords] = useState<GiftCardRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ para: '', regalo: '', deParteDe: '', fecha: todayISO() });

  const loadRecords = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('gift_cards').select('*').order('created_at', { ascending: false }).limit(200);
      setRecords((data as GiftCardRec[]) || []);
    } catch (e) { console.error('Error cargando gift cards:', e); }
    setLoading(false);
  };

  useEffect(() => { loadRecords(); }, []);

  // Genera el PDF de la gift card escribiendo sobre el diseño oficial de CRAFT
  const buildPdf = (rec: GiftCardRec) => {
    // Página en px con el tamaño exacto de la imagen de fondo (1025x709)
    const IW = 1025, IH = 709;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'px', format: [IW, IH] });
    // Imagen de fondo (diseño oficial)
    doc.addImage(GIFTCARD_BG, 'JPEG', 0, 0, IW, IH);

    doc.setTextColor(40, 40, 40);
    doc.setFont('helvetica', 'normal');

    // PARA: (valor a la derecha de la etiqueta, dentro de la caja blanca)
    doc.setFontSize(20);
    doc.text(doc.splitTextToSize(rec.para || '', 380), 560, 185);

    // TU REGALO ES: (valor a la derecha de la etiqueta multilínea)
    doc.setFontSize(18);
    doc.text(doc.splitTextToSize(rec.regalo || '', 380), 560, 322);

    // DE PARTE DE: (valor a la derecha de la etiqueta)
    doc.setFontSize(20);
    doc.text(doc.splitTextToSize(rec.de_parte_de || '', 330), 620, 478);

    // FECHA DE EMISIÓN: (valor a la derecha del texto, en blanco sobre fondo rojo)
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(fmtDMY(rec.fecha_emision), 632, 585);

    // CÓDIGO (debajo, en blanco)
    doc.setFontSize(12);
    doc.text(`CÓDIGO: ${rec.codigo}`, 450, 660);

    return doc;
  };

  const generateAndSave = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    if (!form.para.trim() || !form.regalo.trim()) { alert('Completá al menos "Para" y "Tu regalo es".'); return; }
    setSaving(true);
    try {
      const rec: GiftCardRec = {
        id: Math.random().toString(36).slice(2, 12),
        codigo: genCodigo(),
        para: form.para.trim(),
        regalo: form.regalo.trim(),
        de_parte_de: form.deParteDe.trim(),
        fecha_emision: form.fecha || todayISO(),
      };
      const { error } = await supabase.from('gift_cards').insert(rec);
      if (error) throw error;
      // Descargar PDF
      const doc = buildPdf(rec);
      doc.save(`giftcard_${rec.codigo}.pdf`);
      // Limpiar y recargar
      setForm({ para: '', regalo: '', deParteDe: '', fecha: todayISO() });
      await loadRecords();
    } catch (e: any) {
      alert('Error al generar la gift card: ' + (e.message || e));
    }
    setSaving(false);
  };

  const redownload = (rec: GiftCardRec) => {
    const doc = buildPdf(rec);
    doc.save(`giftcard_${rec.codigo}.pdf`);
  };

  const deleteRec = async (rec: GiftCardRec) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    if (!window.confirm(`¿Eliminar el registro de la gift card ${rec.codigo}?`)) return;
    try {
      const { error } = await supabase.from('gift_cards').delete().eq('id', rec.id);
      if (error) throw error;
      await loadRecords();
    } catch (e: any) { alert('Error al eliminar: ' + (e.message || e)); }
  };

  const inputCls = "w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[12px] text-text-main outline-none focus:border-brand-500";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Formulario */}
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Gift size={16} className="text-brand-500" />
            <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest">Nueva Gift Card</h3>
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Para</label>
            <input value={form.para} onChange={e => setForm({ ...form, para: e.target.value })} placeholder="Nombre del destinatario" className={inputCls} />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Tu regalo es</label>
            <textarea value={form.regalo} onChange={e => setForm({ ...form, regalo: e.target.value })} placeholder="Ej: Un café + medialuna / $5.000 en consumición" className={cn(inputCls, "min-h-[70px]")} />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">De parte de</label>
            <input value={form.deParteDe} onChange={e => setForm({ ...form, deParteDe: e.target.value })} placeholder="Quién regala" className={inputCls} />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Fecha de emisión</label>
            <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} className={inputCls} />
          </div>
          <button onClick={generateAndSave} disabled={saving || isReadOnly}
            className="w-full flex items-center justify-center gap-2 bg-brand-500 text-white py-3 rounded-lg text-[11px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all disabled:opacity-60">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Generar y descargar PDF
          </button>
          <p className="text-[9px] text-text-dim font-bold uppercase text-center">Se genera un código único y se guarda el registro</p>
        </div>

        {/* Vista previa */}
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
          <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest mb-3">Vista previa</h3>
          <div className="rounded-xl overflow-hidden" style={{ background: '#e31e24', aspectRatio: '148/105' }}>
            <div className="h-full w-full p-5 flex">
              <div className="flex flex-col justify-center pr-3">
                <p className="text-white font-black italic leading-none" style={{ fontSize: '28px' }}>#GIFT</p>
                <p className="text-white font-black italic leading-none" style={{ fontSize: '28px' }}>CARD</p>
                <p className="text-white text-[8px] font-bold mt-3">@CRAFT.TUC</p>
              </div>
              <div className="flex-1 flex flex-col justify-center gap-1.5">
                <div className="bg-white rounded px-2 py-1">
                  <p className="text-[7px] font-black" style={{ color: '#e31e24' }}>PARA:</p>
                  <p className="text-[9px] text-neutral-800 font-bold truncate">{form.para || '—'}</p>
                </div>
                <div className="bg-white rounded px-2 py-1">
                  <p className="text-[7px] font-black" style={{ color: '#e31e24' }}>TU REGALO ES:</p>
                  <p className="text-[9px] text-neutral-800 truncate">{form.regalo || '—'}</p>
                </div>
                <div className="bg-white rounded px-2 py-1">
                  <p className="text-[7px] font-black" style={{ color: '#e31e24' }}>DE PARTE DE:</p>
                  <p className="text-[9px] text-neutral-800 truncate">{form.deParteDe || '—'}</p>
                </div>
                <p className="text-white text-[6px] font-bold mt-1">VÁLIDO POR 30 DÍAS · CASCO VIEJO, PERON, BARRIO NORTE Y SUR</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Historial de gift cards emitidas */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border-dim flex items-center gap-2">
          <Plus size={14} className="text-brand-500" />
          <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest">Gift Cards Emitidas</h3>
          <span className="text-[9px] font-bold text-text-dim uppercase">({records.length})</span>
        </div>
        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 size={24} className="animate-spin text-brand-500" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-bg-accent/40 border-b border-border-dim text-[10px] font-black uppercase text-text-dim tracking-widest">
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Para</th>
                  <th className="px-4 py-3">Regalo</th>
                  <th className="px-4 py-3">De parte de</th>
                  <th className="px-4 py-3">Emisión</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id} className="border-b border-border-dim/30 hover:bg-bg-accent/20 transition-colors text-[11px]">
                    <td className="px-4 py-2.5 font-mono font-black text-brand-500">{r.codigo}</td>
                    <td className="px-4 py-2.5 font-bold text-text-main">{r.para}</td>
                    <td className="px-4 py-2.5 text-text-dim truncate max-w-[200px]">{r.regalo}</td>
                    <td className="px-4 py-2.5 text-text-dim">{r.de_parte_de || '—'}</td>
                    <td className="px-4 py-2.5 text-text-dim font-mono">{fmtDMY(r.fecha_emision)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => redownload(r)} title="Descargar PDF" className="p-1.5 text-text-dim hover:text-emerald-500 transition-colors"><Download size={14} /></button>
                        {!isReadOnly && <button onClick={() => deleteRec(r)} title="Eliminar registro" className="p-1.5 text-text-dim hover:text-red-500 transition-colors"><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {records.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-[10px] font-black uppercase text-text-dim">Todavía no se emitieron gift cards</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
}
