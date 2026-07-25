/**
 * SPDX-License-Identifier: Apache-2.0
 * Armado de una nueva lista de precios a partir de los precios sugeridos (ideales s/inflación).
 * Permite editar cada precio, guardar borrador, exportar (Excel/PDF) y confirmar vigencia desde una fecha.
 */
import { useState, useEffect, type ChangeEvent } from 'react';
import { motion } from 'motion/react';
import { X, Save, FileSpreadsheet, FileText, CheckCircle2, Loader2, FolderOpen, Trash2, Upload, Download, AlertTriangle, PlusCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

interface BuilderItem {
  id: string; category: string; name: string;
  precioActual: number; precioInicial?: number | null;
  precioSugerido: number; // editable
  isNew?: boolean; // producto dado de alta desde una importación (todavía no existe en la carta)
  externalCode?: string | null; // código del artículo en Maxirest (para emparejar exacto)
  pendingLink?: { code?: string | null; category?: string | null } | null; // datos a guardar al confirmar (código/rubro)
}

interface Draft {
  id: string; nombre: string; menu_tipo: string; fecha_vigencia: string | null;
  estado: string; items: BuilderItem[]; updated_at?: string;
}

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;
const uid = () => Math.random().toString(36).slice(2, 12);

// Normaliza un nombre para emparejar (sin espacios de más, en mayúsculas)
const norm = (s: any) => String(s ?? '').trim().toUpperCase();

// Convierte un valor de celda a número de pesos entero. Acepta "$8.800", "8800", 8800, etc.
// Los precios se manejan sin centavos, así que se descartan los separadores.
const parseMoney = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? Math.round(v) : null;
  let s = String(v).trim().replace(/[^0-9.,-]/g, '');
  if (!s) return null;
  s = s.replace(/\./g, '').replace(/,/g, ''); // quita separadores de miles/decimales
  const n = parseInt(s, 10);
  return isFinite(n) ? n : null;
};

// ─── Formato Maxirest (el Excel del sistema del restaurante) ───
// Encabezados esperados: COD RUBRO, NOM RUBRO, COD ARTICULO, NOM ARTICULO, PRECIOS SALON, PRECIOS PEDIDOS YA
const MX = {
  codigo: 'COD ARTICULO',
  nombre: 'NOM ARTICULO',
  rubro: 'NOM RUBRO',
  precioSalon: 'PRECIOS SALON',
  precioPY: 'PRECIOS PEDIDOS YA',
};
// Un archivo es "Maxirest" si trae el código de artículo y al menos una columna de precios conocida
const esArchivoMaxirest = (headers: string[]) =>
  headers.includes(MX.codigo) && (headers.includes(MX.precioSalon) || headers.includes(MX.precioPY));

// Qué columna de precio y qué filas corresponden a cada carta dentro del archivo Maxirest
const columnaPrecioMaxirest = (menuType: string) => (menuType === 'pedidosya' ? MX.precioPY : MX.precioSalon);
const filaCorrespondeAMaxirest = (menuType: string, rubro: string, precio: number | null): boolean => {
  const r = String(rubro || '').trim().toUpperCase();
  const p = precio || 0;
  if (menuType === 'pedidosya') return p > 0;   // cualquier rubro con precio en la columna Pedidos Ya (incluye SIN GLUTEN)
  // salón: todo lo que tenga precio de salón (incluye SIN GLUTEN, que ahora es una categoría más)
  return p > 0 && r !== 'PEDIDOS YA';           // el rubro PEDIDOS YA son combos exclusivos de delivery
};

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
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [draftId, setDraftId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);

  // ─── Importación desde Excel ───
  const [showImport, setShowImport] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<Record<string, any>[]>([]);
  const [colProducto, setColProducto] = useState('');
  const [colPrecio, setColPrecio] = useState('');
  const [colCategoria, setColCategoria] = useState('');
  const [colCodigo, setColCodigo] = useState('');       // columna de código (Maxirest)
  const [maxirestMode, setMaxirestMode] = useState(false);

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

  // Descarga una plantilla simple (Categoría, Producto, Precio) con los precios actuales.
  // El usuario edita la columna "Precio" y la vuelve a subir con "Importar Excel".
  const descargarPlantilla = () => {
    const data = rows.map(r => ({
      'Categoría': r.category,
      'Producto': r.name,
      'Precio': Math.round(r.precioActual),
    }));
    const ws = XLSX.utils.json_to_sheet(data, { header: ['Categoría', 'Producto', 'Precio'] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
    XLSX.writeFile(wb, `plantilla_precios_${menuType}_${todayISO()}.xlsx`);
  };

  // Lee el Excel elegido, detecta la fila de encabezados (ignora las filas de título)
  // y precarga las columnas de Producto / Precio / Categoría.
  const onImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (!aoa.length) { alert('El archivo está vacío.'); return; }
      // Buscar la fila de encabezados: la primera que tenga una celda tipo "Producto/Nombre/Artículo"
      let hdrIdx = aoa.findIndex(row => row.some(c => /producto|nombre|art[ií]culo/i.test(String(c))));
      if (hdrIdx < 0) hdrIdx = 0;
      const headers = aoa[hdrIdx].map((c, i) => String(c).trim() || `Columna ${i + 1}`);
      const dataRows = aoa.slice(hdrIdx + 1).filter(row => row.some(c => String(c).trim() !== ''));
      const json = dataRows.map(row => {
        const o: Record<string, any> = {};
        headers.forEach((h, i) => { o[h] = row[i] ?? ''; });
        return o;
      });
      if (!json.length) { alert('No encontré filas de datos debajo de los encabezados.'); return; }
      setImportHeaders(headers);
      setImportRows(json);

      // ¿Es el archivo del sistema del restaurante (Maxirest)? → configuración automática por carta
      if (esArchivoMaxirest(headers)) {
        setMaxirestMode(true);
        setColProducto(MX.nombre);
        setColCategoria(MX.rubro);
        setColCodigo(MX.codigo);
        setColPrecio(columnaPrecioMaxirest(menuType));
      } else {
        // Autodetección de columnas (archivo genérico / plantilla)
        setMaxirestMode(false);
        setColCodigo('');
        const find = (regexes: RegExp[]) => {
          for (const rx of regexes) { const h = headers.find(x => rx.test(x)); if (h) return h; }
          return '';
        };
        setColProducto(find([/producto/i, /nombre/i, /art[ií]culo/i]) || headers[0] || '');
        setColCategoria(find([/categor/i]));
        setColPrecio(find([/precio\s*nuevo/i, /precio\s*a\s*fijar/i, /^precio$/i, /precio\s*actual/i, /precio\s*sugerido/i]) || '');
      }
    } catch (err: any) {
      alert('No pude leer el archivo. Asegurate de que sea un Excel (.xlsx). Detalle: ' + (err.message || err));
    }
    e.target.value = ''; // permite volver a elegir el mismo archivo
  };

  // Calcula qué haría la importación con las columnas elegidas (para el preview y para aplicar).
  const buildPreview = () => {
    const toUpdate: { item: BuilderItem; price: number; code: string; category: string }[] = [];
    const toCreate: { name: string; category: string; price: number; code: string }[] = [];
    const errores: { name: string; motivo: string }[] = [];
    const sinCambio: { name: string; price: number }[] = [];
    const empty = { toUpdate, toCreate, errores, sinCambio };
    if (!colProducto || !colPrecio) return empty;

    const existingByName = new Map<string, BuilderItem>(rows.map(r => [norm(r.name), r] as [string, BuilderItem]));
    const existingByCode = new Map<string, BuilderItem>(
      rows.filter(r => r.externalCode).map(r => [String(r.externalCode).trim(), r] as [string, BuilderItem])
    );
    const seen = new Set<string>();

    importRows.forEach(raw => {
      const nombreOriginal = String(raw[colProducto] ?? '').trim();
      const name = norm(nombreOriginal);
      const price = parseMoney(raw[colPrecio]);
      const code = colCodigo ? String(raw[colCodigo] ?? '').trim() : '';
      const rubro = colCategoria ? norm(raw[colCategoria]) : '';

      // En modo Maxirest, cada carta toma solo las filas que le corresponden
      if (maxirestMode && !filaCorrespondeAMaxirest(menuType, rubro, price)) return;

      if (!name) { errores.push({ name: '(sin nombre)', motivo: 'fila sin producto' }); return; }
      if (price === null || price <= 0) { errores.push({ name: nombreOriginal, motivo: 'precio inválido o vacío' }); return; }
      const dedupeKey = code || name;
      if (seen.has(dedupeKey)) { errores.push({ name: nombreOriginal, motivo: 'repetido en el archivo' }); return; }
      seen.add(dedupeKey);

      // Empareja primero por código (exacto), y si no hay, por nombre
      const ex = (code && existingByCode.get(code)) || existingByName.get(name);
      if (ex) {
        const mismoPrecio = price === ex.precioSugerido;
        const mismoCodigo = String(ex.externalCode || '') === code;
        const mismoRubro = !rubro || norm(ex.category) === rubro;
        if (mismoPrecio && mismoCodigo && mismoRubro) sinCambio.push({ name: ex.name, price });
        else toUpdate.push({ item: ex, price, code, category: rubro });
      } else {
        toCreate.push({ name: nombreOriginal, category: rubro, price, code });
      }
    });
    return { toUpdate, toCreate, errores, sinCambio };
  };

  const aplicarImport = () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    const { toUpdate, toCreate } = buildPreview();
    if (toUpdate.length === 0 && toCreate.length === 0) { alert('No hay nada para importar con las columnas elegidas.'); return; }
    setRows(prev => {
      const next = prev.map(r => {
        const u = toUpdate.find(x => x.item.id === r.id);
        if (!u) return r;
        const codeChanged = !!u.code && String(r.externalCode || '') !== u.code;
        const catChanged = !!u.category && norm(r.category) !== u.category;
        const pendingLink = (codeChanged || catChanged)
          ? { code: u.code || r.externalCode || null, category: u.category || r.category }
          : (r.pendingLink || null);
        return {
          ...r,
          precioSugerido: u.price,
          externalCode: u.code || r.externalCode || null,
          category: u.category || r.category,
          pendingLink,
        };
      });
      const nuevos: BuilderItem[] = toCreate.map(c => ({
        id: uid(),
        category: norm(c.category) || 'SIN CATEGORÍA',
        name: norm(c.name),
        precioActual: 0,
        precioInicial: null,
        precioSugerido: c.price,
        isNew: true,
        externalCode: c.code || null,
      }));
      return [...next, ...nuevos];
    });
    setShowImport(false);
    setImportRows([]); setImportHeaders([]); setImportFileName(''); setMaxirestMode(false);
    alert(`Importación aplicada:\n· ${toUpdate.length} precio(s) actualizado(s)\n· ${toCreate.length} producto(s) nuevo(s) agregado(s)\n\nRevisá la tabla y, cuando estés conforme, tocá "Dejar Vigente".`);
  };

  const confirmarVigencia = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    const cambios = rows.filter(r => r.precioSugerido !== r.precioActual);
    // Filas sin cambio de precio pero que hay que vincular (código/rubro nuevos desde Maxirest)
    const soloVinculo = rows.filter(r => r.precioSugerido === r.precioActual && !r.isNew && r.pendingLink);
    if (cambios.length === 0 && soloVinculo.length === 0) { alert('No hay precios modificados ni vinculaciones pendientes.'); return; }
    const altas = cambios.filter(r => r.isNew).length;
    const actualizaciones = cambios.length - altas;
    const vinculos = soloVinculo.length;
    if (!window.confirm(
      `Vas a dejar VIGENTES ${cambios.length} cambio(s) para "${menuLabel}" desde el ${fechaVigencia.split('-').reverse().join('/')}:\n` +
      `· ${actualizaciones} precio(s) actualizado(s)\n· ${altas} producto(s) nuevo(s) que se dan de alta en la carta\n` +
      (vinculos > 0 ? `· ${vinculos} producto(s) que solo actualizan su código/rubro (sin cambio de precio)\n` : '') +
      `\nLos precios anteriores quedan guardados en el historial para comparar la evolución.\n\n¿Confirmás?`
    )) return;
    setProgress({ done: 0, total: cambios.length + soloVinculo.length });
    setSaving(true);
    try {
      // Actualiza el precio de cada item modificado (o crea los nuevos) y registra el cambio en el historial
      for (const r of cambios) {
        if (r.isNew) {
          // Producto nuevo importado: se da de alta en la carta y su precio inicial queda en el historial
          const { data: nuevo, error: insErr } = await supabase.from('menu_items').insert([{
            menu_type: menuType, category: r.category, name: r.name,
            price: r.precioSugerido, last_update: fechaVigencia,
            external_code: r.externalCode || null,
          }]).select().single();
          if (insErr) throw insErr;
          await supabase.from('menu_price_history').insert([{
            menu_item_id: nuevo.id, menu_type: menuType, category: r.category, item_name: r.name,
            old_price: null, new_price: r.precioSugerido, change_date: fechaVigencia,
          }]);
        } else {
          // Al actualizar el precio, además guardamos código y rubro si vinieron del archivo
          const upd: Record<string, any> = { price: r.precioSugerido, last_update: fechaVigencia };
          if (r.pendingLink?.code) upd.external_code = r.pendingLink.code;
          if (r.pendingLink?.category) upd.category = r.pendingLink.category;
          const { error: upErr } = await supabase.from('menu_items').update(upd).eq('id', r.id);
          if (upErr) throw upErr;
          await supabase.from('menu_price_history').insert([{
            menu_item_id: r.id, menu_type: menuType, category: r.category, item_name: r.name,
            old_price: r.precioActual, new_price: r.precioSugerido, change_date: fechaVigencia,
          }]);
        }
        setProgress(p => ({ ...p, done: p.done + 1 }));
      }
      // Vinculaciones sin cambio de precio: solo se guarda código/rubro (no toca el historial)
      for (const r of soloVinculo) {
        const upd: Record<string, any> = {};
        if (r.pendingLink?.code) upd.external_code = r.pendingLink.code;
        if (r.pendingLink?.category) upd.category = r.pendingLink.category;
        if (Object.keys(upd).length > 0) {
          const { error: linkErr } = await supabase.from('menu_items').update(upd).eq('id', r.id);
          if (linkErr) throw linkErr;
        }
        setProgress(p => ({ ...p, done: p.done + 1 }));
      }
      // Marcar el borrador como confirmado (si venía de uno)
      if (draftId) {
        await supabase.from('price_list_drafts').update({ estado: 'confirmada', updated_at: new Date().toISOString() }).eq('id', draftId);
      }
      alert(`Listo. ${cambios.length} precio(s) quedaron vigentes desde el ${fechaVigencia.split('-').reverse().join('/')}` +
        (soloVinculo.length > 0 ? ` y ${soloVinculo.length} vinculación(es) de código/rubro guardadas.` : '.'));
      onConfirmed();
      onClose();
    } catch (e: any) { alert('Error al confirmar: ' + (e.message || e)); }
    setSaving(false);
  };

  const totalCambios = rows.filter(r => r.precioSugerido !== r.precioActual).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      {/* Cartel de carga mientras se guardan los precios */}
      {saving && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-bg-sidebar border border-brand-500/40 rounded-xl shadow-2xl px-8 py-7 flex flex-col items-center gap-3 max-w-sm text-center">
            <Loader2 size={40} className="animate-spin text-brand-500" />
            <p className="text-sm font-black uppercase tracking-widest text-text-main">Guardando precios…</p>
            {progress.total > 0 ? (
              <>
                <p className="text-[11px] font-bold text-text-dim">{progress.done} de {progress.total} productos</p>
                <div className="w-full h-2 bg-bg-accent rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500 transition-all duration-200" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
                </div>
              </>
            ) : (
              <p className="text-[11px] font-bold text-text-dim">Un momento…</p>
            )}
            <p className="text-[9px] font-bold text-amber-500 uppercase tracking-wide mt-1">No cierres esta ventana hasta que termine</p>
          </div>
        </div>
      )}
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
          <button onClick={() => { setShowDrafts(!showDrafts); setShowImport(false); }} className="flex items-center gap-1.5 bg-bg-card border border-border-dim px-3 py-2 rounded text-[9px] font-black uppercase tracking-widest text-text-dim hover:text-text-main transition-all">
            <FolderOpen size={13} /> Borradores ({drafts.length})
          </button>
          <button onClick={descargarPlantilla} className="flex items-center gap-1.5 bg-bg-card border border-border-dim px-3 py-2 rounded text-[9px] font-black uppercase tracking-widest text-text-dim hover:text-text-main transition-all" title="Descargá una plantilla con los productos y sus precios actuales para editar y volver a subir">
            <Download size={13} /> Plantilla
          </button>
          {!isReadOnly && (
            <button onClick={() => { setShowImport(!showImport); setShowDrafts(false); }} className={cn("flex items-center gap-1.5 border px-3 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all", showImport ? "bg-brand-500 text-white border-brand-500" : "bg-bg-card border-border-dim text-text-dim hover:text-text-main")}>
              <Upload size={13} /> Importar Excel
            </button>
          )}
        </div>

        {/* Lista de borradores */}
        {showDrafts && (
          <div className="shrink-0 px-4 py-3 border-b border-border-dim bg-bg-accent/10 max-h-40 overflow-y-auto space-y-1">
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

        {/* Panel de importación */}
        {showImport && (() => {
          const prev = buildPreview();
          const listo = Boolean(colProducto && colPrecio) && importRows.length > 0;
          return (
            <div className="shrink-0 px-4 py-3 border-b border-border-dim bg-bg-accent/10 max-h-[60vh] overflow-y-auto space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 bg-brand-500/10 text-brand-500 border border-brand-500/40 px-3 py-2 rounded text-[9px] font-black uppercase tracking-widest cursor-pointer hover:bg-brand-500/20 transition-all">
                  <Upload size={13} /> Elegir archivo Excel
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={onImportFile} className="hidden" />
                </label>
                {importFileName && <span className="text-[10px] font-mono text-text-dim">{importFileName}</span>}
              </div>

              {importRows.length > 0 && (
                <>
                  {maxirestMode ? (
                    /* Archivo del sistema (Maxirest): todo automático según la carta */
                    <div className="bg-emerald-500/5 border border-emerald-500/30 rounded px-3 py-2 text-[10px] text-text-dim">
                      <p className="font-black uppercase text-emerald-500 tracking-widest mb-0.5">Archivo Maxirest detectado</p>
                      <p>
                        Para <b className="text-text-main uppercase">{menuLabel}</b> tomo la columna <b className="text-text-main">{colPrecio}</b>,
                        empareja por <b className="text-text-main">código de artículo</b> y guarda el rubro como categoría.
                        {menuType === 'salon' && ' Se toman todos los artículos con precio de salón (incluidos los SIN GLUTEN); se excluye el rubro PEDIDOS YA (combos de delivery).'}
                        {menuType === 'pedidosya' && ' Se toman todos los artículos con precio en la columna Pedidos Ya.'}
                      </p>
                    </div>
                  ) : (
                    /* Archivo genérico / plantilla: elegís las columnas a mano */
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="text-[8px] font-black uppercase text-text-dim tracking-widest block mb-1">Columna Producto</label>
                        <select value={colProducto} onChange={e => setColProducto(e.target.value)} className="w-full bg-bg-card border border-border-dim rounded px-2 py-1.5 text-[11px] text-text-main outline-none focus:border-brand-500">
                          <option value="">— elegir —</option>
                          {importHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[8px] font-black uppercase text-brand-500 tracking-widest block mb-1">Columna Precio a fijar</label>
                        <select value={colPrecio} onChange={e => setColPrecio(e.target.value)} className="w-full bg-bg-card border border-brand-500/50 rounded px-2 py-1.5 text-[11px] text-text-main outline-none focus:border-brand-500">
                          <option value="">— elegir —</option>
                          {importHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[8px] font-black uppercase text-text-dim tracking-widest block mb-1">Columna Categoría (opcional)</label>
                        <select value={colCategoria} onChange={e => setColCategoria(e.target.value)} className="w-full bg-bg-card border border-border-dim rounded px-2 py-1.5 text-[11px] text-text-main outline-none focus:border-brand-500">
                          <option value="">— sin categoría —</option>
                          {importHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Resumen */}
                  {listo ? (
                    <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-widest">
                      <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">{prev.toUpdate.length} a actualizar</span>
                      <span className="px-2 py-1 rounded bg-brand-500/10 text-brand-500 border border-brand-500/30">{prev.toCreate.length} nuevos</span>
                      <span className="px-2 py-1 rounded bg-bg-card text-text-dim border border-border-dim">{prev.sinCambio.length} sin cambio</span>
                      {prev.errores.length > 0 && <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30">{prev.errores.length} con problema</span>}
                    </div>
                  ) : (
                    <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Elegí la columna de Producto y la de Precio para ver la vista previa.</p>
                  )}

                  {/* Detalle */}
                  {listo && (
                    <div className="space-y-2">
                      {prev.toCreate.length > 0 && (
                        <div className="text-[10px] text-text-dim">
                          <p className="font-black uppercase text-brand-500 mb-1 flex items-center gap-1"><PlusCircle size={11} /> Productos nuevos ({prev.toCreate.length})</p>
                          <div className="flex flex-wrap gap-1">
                            {prev.toCreate.slice(0, 30).map((c, i) => (
                              <span key={i} className="font-mono bg-brand-500/5 border border-brand-500/20 rounded px-1.5 py-0.5">{c.name} · {fmt(c.price)}</span>
                            ))}
                            {prev.toCreate.length > 30 && <span className="italic">+{prev.toCreate.length - 30} más…</span>}
                          </div>
                        </div>
                      )}
                      {prev.errores.length > 0 && (
                        <div className="text-[10px] text-amber-500">
                          <p className="font-black uppercase mb-1 flex items-center gap-1"><AlertTriangle size={11} /> No se importan ({prev.errores.length})</p>
                          <div className="flex flex-wrap gap-1">
                            {prev.errores.slice(0, 20).map((er, i) => (
                              <span key={i} className="font-mono bg-amber-500/5 border border-amber-500/20 rounded px-1.5 py-0.5">{er.name} · {er.motivo}</span>
                            ))}
                            {prev.errores.length > 20 && <span className="italic">+{prev.errores.length - 20} más…</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => { setShowImport(false); setImportRows([]); setImportHeaders([]); setImportFileName(''); setMaxirestMode(false); }} className="px-3 py-2 rounded text-[9px] font-black uppercase tracking-widest text-text-dim border border-border-dim hover:text-text-main">Cancelar</button>
                    <button onClick={aplicarImport} disabled={!listo || (prev.toUpdate.length === 0 && prev.toCreate.length === 0)} className="flex items-center gap-1.5 bg-brand-500 text-white px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all disabled:opacity-40">
                      <CheckCircle2 size={13} /> Aplicar importación
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })()}

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
                    <td className="px-4 py-2 font-bold text-text-main uppercase">
                      {r.name}
                      {r.isNew && <span className="ml-2 text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-500 border border-brand-500/30 align-middle">Nuevo</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-text-dim">{r.isNew ? '—' : fmt(r.precioActual)}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-brand-500 font-mono text-[11px]">$</span>
                        <input type="number" value={r.precioSugerido}
                          onChange={e => setPrecio(r.id, parseFloat(e.target.value) || 0)}
                          className="w-28 bg-bg-card border border-border-dim rounded px-2 py-1 text-right text-[12px] font-mono font-black text-brand-500 outline-none focus:border-brand-500" />
                      </div>
                    </td>
                    <td className="px-4 py-2 text-center">
                      {r.isNew ? (
                        <span className="text-[9px] font-black uppercase text-brand-500">Alta</span>
                      ) : (
                        <span className={cn("text-[10px] font-black font-mono", varPct > 0 ? "text-emerald-500" : varPct < 0 ? "text-red-500" : "text-text-dim")}>
                          {varPct > 0 ? '+' : ''}{varPct.toFixed(1)}%
                        </span>
                      )}
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
