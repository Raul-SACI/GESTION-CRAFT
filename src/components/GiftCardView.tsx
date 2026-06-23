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
import { GIFTCARD_CUMPLE_BG } from './giftCardCumpleBg';

interface GiftCardRec {
  id: string; codigo: string; para: string; regalo: string; de_parte_de: string; fecha_emision: string;
  tipo?: string;
  emitida_por?: string; medio_pago?: string; utilizada?: boolean; utilizada_fecha?: string | null; utilizada_sucursal?: string | null; created_at?: string;
}

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const fmtDMY = (iso: string) => { if (!iso) return ''; const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; };
// Código único tipo CRAFT-XXXX-XXXX
const genCodigo = () => {
  const part = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CRAFT-${part()}-${part()}`;
};

export default function GiftCardView({ isReadOnly, currentUser }: { isReadOnly?: boolean; currentUser?: { name?: string } }) {
  const [records, setRecords] = useState<GiftCardRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ tipo: 'clasica', para: '', regalo: '', deParteDe: '', fecha: todayISO(), medioPago: '' });
  const [previewUrl, setPreviewUrl] = useState<string>('');

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
    if (rec.tipo === 'cumpleanos') return buildPdfCumple(rec);
    return buildPdfClasica(rec);
  };

  const buildPdfClasica = (rec: GiftCardRec) => {
    // Página en px con el tamaño exacto del diseño original (2883x1992)
    const IW = 2883, IH = 1992;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'px', format: [IW, IH] });
    doc.addImage(GIFTCARD_BG, 'JPEG', 0, 0, IW, IH);

    doc.setTextColor(35, 35, 35);
    doc.setFont('helvetica', 'bold');

    // PARA (valor dentro de la caja blanca, centrado)
    doc.setFontSize(72);
    doc.text(doc.splitTextToSize(rec.para || '', 1180), 1320, 555);

    // TU REGALO ES (valor dentro de la caja blanca, centrado)
    doc.setFontSize(66);
    doc.text(doc.splitTextToSize(rec.regalo || '', 1180), 1320, 950);

    // DE PARTE DE (valor dentro de la caja blanca, centrado)
    doc.setFontSize(72);
    doc.text(doc.splitTextToSize(rec.de_parte_de || '', 1180), 1320, 1335);

    // FECHA DE EMISIÓN (valor a la derecha de la etiqueta, en blanco)
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(50);
    doc.text(fmtDMY(rec.fecha_emision), 1900, 1610);

    // CÓDIGO (extremo inferior izquierdo, en blanco)
    doc.setFontSize(30);
    doc.text(`CÓDIGO: ${rec.codigo}`, 130, 1920);

    return doc;
  };

  // PDF de la Gift Card de CUMPLEAÑOS (diseño rojo, solo Para + Fecha; el regalo va impreso)
  const buildPdfCumple = (rec: GiftCardRec) => {
    // Tamaño exacto del diseño de cumpleaños (2690x1859)
    const IW = 2690, IH = 1859;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'px', format: [IW, IH] });
    doc.addImage(GIFTCARD_CUMPLE_BG, 'JPEG', 0, 0, IW, IH);

    doc.setFont('helvetica', 'bold');

    // PARA: nombre dentro de la caja blanca. Caja: x 1458–2451, centro y ~1178.
    // Texto oscuro porque el fondo de la caja es blanco. Centrado en la caja.
    doc.setTextColor(35, 35, 35);
    doc.setFontSize(64);
    const cajaCx = 1954;
    const para = rec.para || '';
    doc.text(para, cajaCx, 1215, { align: 'center', maxWidth: 950 });

    // FECHA DE EMISIÓN: el rótulo está impreso (~y 1336–1367, x desde ~1458).
    // La fecha va a la derecha del rótulo, en blanco.
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(46);
    doc.text(fmtDMY(rec.fecha_emision), 2050, 1372);

    // CÓDIGO chico en blanco, esquina inferior derecha del panel (debajo del texto legal)
    doc.setFontSize(26);
    doc.text(`CÓDIGO: ${rec.codigo}`, 1458, 1800);

    return doc;
  };

  // Vista previa: regenera la imagen del PDF real cuando cambian los datos (con debounce)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const recPreview: GiftCardRec = {
          id: 'preview', codigo: 'CRAFT-XXXX-XXXX', tipo: form.tipo,
          para: form.para, regalo: form.regalo, de_parte_de: form.deParteDe,
          fecha_emision: form.fecha || todayISO(),
        };
        const doc = buildPdf(recPreview);
        setPreviewUrl(doc.output('datauristring'));
      } catch (e) { console.error('Error generando vista previa:', e); }
    }, 350);
    return () => clearTimeout(t);
  }, [form.tipo, form.para, form.regalo, form.deParteDe, form.fecha]);

  const generateAndSave = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    const esCumple = form.tipo === 'cumpleanos';
    if (!form.para.trim()) { alert('Completá el campo "Para".'); return; }
    if (!esCumple && !form.regalo.trim()) { alert('Completá al menos "Para" y "Tu regalo es".'); return; }
    setSaving(true);
    try {
      const rec: GiftCardRec = {
        id: Math.random().toString(36).slice(2, 12),
        codigo: genCodigo(),
        tipo: form.tipo,
        para: form.para.trim(),
        regalo: esCumple ? 'Pizza muzza de regalo' : form.regalo.trim(),
        de_parte_de: esCumple ? '' : form.deParteDe.trim(),
        fecha_emision: form.fecha || todayISO(),
        emitida_por: currentUser?.name || 'CRAFT',
        medio_pago: form.medioPago.trim() || null as any,
        utilizada: false,
      };
      const { error } = await supabase.from('gift_cards').insert(rec);
      if (error) throw error;
      // Descargar PDF
      const doc = buildPdf(rec);
      doc.save(`giftcard_${esCumple ? 'cumple_' : ''}${rec.codigo}.pdf`);
      // Limpiar y recargar (conservando el tipo elegido)
      setForm({ tipo: form.tipo, para: '', regalo: '', deParteDe: '', fecha: todayISO(), medioPago: '' });
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
          {/* Selector de tipo de gift card */}
          <div>
            <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Tipo de Gift Card</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setForm({ ...form, tipo: 'clasica' })}
                className={cn("py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all",
                  form.tipo === 'clasica' ? "bg-brand-500 text-white border-brand-500" : "bg-bg-accent text-text-dim border-border-dim hover:border-brand-500")}>
                Clásica
              </button>
              <button type="button" onClick={() => setForm({ ...form, tipo: 'cumpleanos' })}
                className={cn("py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all",
                  form.tipo === 'cumpleanos' ? "bg-brand-500 text-white border-brand-500" : "bg-bg-accent text-text-dim border-border-dim hover:border-brand-500")}>
                Cumpleaños
              </button>
            </div>
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Para</label>
            <input value={form.para} onChange={e => setForm({ ...form, para: e.target.value })} placeholder="Nombre del destinatario" className={inputCls} />
          </div>
          {form.tipo === 'cumpleanos' ? (
            <div className="bg-bg-accent/40 border border-border-dim rounded-lg px-3 py-2.5">
              <p className="text-[9px] font-black uppercase text-text-dim tracking-widest mb-0.5">Regalo (fijo en el diseño)</p>
              <p className="text-[11px] font-bold text-text-main">🍕 Pizza muzza de regalo</p>
            </div>
          ) : (
            <>
              <div>
                <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Tu regalo es</label>
                <textarea value={form.regalo} onChange={e => setForm({ ...form, regalo: e.target.value })} placeholder="Ej: Un café + medialuna / $5.000 en consumición" className={cn(inputCls, "min-h-[70px]")} />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">De parte de</label>
                <input value={form.deParteDe} onChange={e => setForm({ ...form, deParteDe: e.target.value })} placeholder="Quién regala" className={inputCls} />
              </div>
            </>
          )}
          <div>
            <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Fecha de emisión</label>
            <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Medio de pago</label>
            <input value={form.medioPago} onChange={e => setForm({ ...form, medioPago: e.target.value })} placeholder="Ej: Efectivo, Transferencia, Cortesía..." className={inputCls} />
          </div>
          <button onClick={generateAndSave} disabled={saving || isReadOnly}
            className="w-full flex items-center justify-center gap-2 bg-brand-500 text-white py-3 rounded-lg text-[11px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all disabled:opacity-60">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Generar y descargar PDF
          </button>
          <p className="text-[9px] text-text-dim font-bold uppercase text-center">Se genera un código único y se guarda el registro</p>
        </div>

        {/* Vista previa: muestra el PDF real que se va a descargar */}
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
          <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest mb-3">Vista previa</h3>
          <div className="rounded-xl overflow-hidden bg-bg-accent/30" style={{ aspectRatio: '2883/1992' }}>
            {previewUrl ? (
              <iframe
                title="Vista previa Gift Card"
                src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                className="w-full h-full border-0"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 size={22} className="animate-spin text-brand-500" />
              </div>
            )}
          </div>
          <p className="text-[9px] text-text-dim font-bold uppercase text-center mt-2">Así se verá el PDF que se descarga</p>
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
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Para</th>
                  <th className="px-4 py-3">Regalo</th>
                  <th className="px-4 py-3">De parte de</th>
                  <th className="px-4 py-3">Medio pago</th>
                  <th className="px-4 py-3">Emitida por</th>
                  <th className="px-4 py-3">Emisión</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id} className="border-b border-border-dim/30 hover:bg-bg-accent/20 transition-colors text-[11px]">
                    <td className="px-4 py-2.5 font-mono font-black text-brand-500">{r.codigo}</td>
                    <td className="px-4 py-2.5">
                      {r.tipo === 'cumpleanos'
                        ? <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-brand-500/10 text-brand-500">Cumpleaños</span>
                        : <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-text-dim/10 text-text-dim">Clásica</span>}
                    </td>
                    <td className="px-4 py-2.5 font-bold text-text-main">{r.para}</td>
                    <td className="px-4 py-2.5 text-text-dim truncate max-w-[200px]">{r.regalo}</td>
                    <td className="px-4 py-2.5 text-text-dim">{r.de_parte_de || '—'}</td>
                    <td className="px-4 py-2.5 text-text-dim">{r.medio_pago || '—'}</td>
                    <td className="px-4 py-2.5 text-text-dim">{r.emitida_por || '—'}</td>
                    <td className="px-4 py-2.5 text-text-dim font-mono">{fmtDMY(r.fecha_emision)}</td>
                    <td className="px-4 py-2.5 text-center">
                      {r.utilizada
                        ? <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-text-dim/10 text-text-dim">Usada{r.utilizada_sucursal ? ` · ${r.utilizada_sucursal}` : ''}</span>
                        : <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500">Vigente</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => redownload(r)} title="Descargar PDF" className="p-1.5 text-text-dim hover:text-emerald-500 transition-colors"><Download size={14} /></button>
                        {!isReadOnly && <button onClick={() => deleteRec(r)} title="Eliminar registro" className="p-1.5 text-text-dim hover:text-red-500 transition-colors"><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {records.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-10 text-center text-[10px] font-black uppercase text-text-dim">Todavía no se emitieron gift cards</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
}
