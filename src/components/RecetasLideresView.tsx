/**
 * MÓDULO RECETAS — Gestión Líderes Operativos
 *
 * Independiente de "Recetas" de Administración. Maneja los 3 tipos de recetas del bar:
 *   · Producción      (elaborados del centro de producción)
 *   · En Sucursal     (preparaciones que se hacen en la sucursal)
 *   · Platos de la Carta (con sección y foto del plato)
 *
 * Las recetas se arman eligiendo insumos del Maestro de Insumos (stock_items).
 * Las fotos de los platos se comprimen en el navegador y se guardan en la base (base64).
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import {
  BookOpen, Plus, Trash2, Search, X, Save, Loader2, Upload, ImagePlus,
  ChefHat, Store, UtensilsCrossed, Pencil, ListChecks, ToggleRight, ToggleLeft, Calculator, FileText
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { recalcularCostosRecetas } from '../lib/recalcRecipeCosts';
import { StockItem } from '../types';

type Tipo = 'produccion' | 'sucursal' | 'carta';

interface Recipe {
  id: string;
  tipo: Tipo;
  code: string | null;
  name: string;
  seccion: string | null;
  unit: string | null;
  photo: string | null;
  notes: string | null;
  active?: boolean;
}
interface RecipeItem {
  id?: string;
  recipe_id?: string;
  item_id: string | null;
  code: string | null;
  item_name: string;
  unit: string | null;
  quantity: number | string | null; // durante la edición puede ser texto (ej. "0,084")
  sort_order?: number;
}

// Convierte lo escrito (acepta coma o punto decimal) a número. "0,084" → 0.084
const parseQty = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const s = String(v).trim();
  if (s === '') return null;
  const n = parseFloat(s.replace(/\./g, s.includes(',') ? '' : '.').replace(',', '.'));
  return isNaN(n) ? null : n;
};

const TIPOS: { id: Tipo; label: string; icon: any; color: string }[] = [
  { id: 'produccion', label: 'Producción', icon: ChefHat, color: 'text-teal-500' },
  { id: 'sucursal', label: 'En Sucursal', icon: Store, color: 'text-brand-500' },
  { id: 'carta', label: 'Platos de la Carta', icon: UtensilsCrossed, color: 'text-amber-500' },
];

// Comprime una imagen a JPEG (máx 1000px) y devuelve un data URL para guardar en la base.
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1000;
        let w = img.width, h = img.height;
        if (w > max || h > max) { const s = Math.min(max / w, max / h); w = Math.round(w * s); h = Math.round(h * s); }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('canvas')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const fmtQty = (q: number | string | null | undefined) => {
  if (q === null || q === undefined) return '';
  // Si ya es texto (mientras se escribe), mostrarlo tal cual para permitir la coma
  if (typeof q === 'string') return q;
  if (!isFinite(q)) return '';
  return String(q);
};

export default function RecetasLideresView({
  items,
  currentUserName,
  isReadOnly,
}: {
  items: StockItem[];
  currentUserName?: string;
  isReadOnly?: boolean;
}) {
  const [tipo, setTipo] = useState<Tipo>('produccion');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [itemsByRecipe, setItemsByRecipe] = useState<Record<string, RecipeItem[]>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<'activas' | 'inactivas' | 'todas'>('activas');
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Maestros para elegir el nombre del producto según el tipo de receta
  const [productos, setProductos] = useState<{ id: string; name: string; category?: string }[]>([]);
  const [recipeMasters, setRecipeMasters] = useState<{ tipo: string; name: string; unit: string | null; code: string | null }[]>([]);
  const [prodSearch, setProdSearch] = useState('');
  const [prodOpen, setProdOpen] = useState(false);
  const [secSearch, setSecSearch] = useState('');
  const [secOpen, setSecOpen] = useState(false);

  // Editor
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [draftItems, setDraftItems] = useState<RecipeItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [ingSearch, setIngSearch] = useState('');
  const [recalc, setRecalc] = useState(false);

  // Mapa de costos por código: insumos (stock_items) + recetas maestro (produccion/sucursal),
  // para valorizar la receta también cuando un "insumo" es una receta.
  const costByCode = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach(i => { if (i.code) m.set(String(i.code), Number(i.cost) || 0); });
    recipeMasters.forEach((rm: any) => { if (rm.code && rm.cost != null) m.set(String(rm.code), Number(rm.cost) || 0); });
    // Platos de la carta (products): un plato puede llevar otro plato adentro (ej. LATTE con TOSTADA AVOCADO).
    productos.forEach((p: any) => { if (p.code && p.cost != null) m.set(String(p.code), Number(p.cost) || 0); });
    return m;
  }, [items, recipeMasters, productos]);

  // Códigos que EXISTEN en algún maestro (Insumos, Recetas Prod./Suc., Productos),
  // sin importar si tienen costo cargado. Sirve para distinguir "no existe" de "existe pero cuesta 0".
  const knownCodes = useMemo(() => {
    const s = new Set<string>();
    items.forEach(i => { if (i.code) s.add(String(i.code).trim()); });
    recipeMasters.forEach((rm: any) => { if (rm.code) s.add(String(rm.code).trim()); });
    productos.forEach((p: any) => { if (p.code) s.add(String(p.code).trim()); });
    return s;
  }, [items, recipeMasters, productos]);

  const cargar = async () => {
    setLoading(true);
    try {
      const { data: recs } = await supabase.from('op_recipes').select('*').eq('tipo', tipo).order('seccion').order('name');
      const list = (recs as Recipe[]) || [];
      setRecipes(list);
      const ids = list.map(r => r.id);
      const map: Record<string, RecipeItem[]> = {};
      if (ids.length > 0) {
        // Paginar por si supera 1000 filas de insumos
        let from = 0; const page = 1000; let all: any[] = [];
        while (true) {
          const { data } = await supabase.from('op_recipe_items').select('*').in('recipe_id', ids).order('sort_order').range(from, from + page - 1);
          const chunk = data || [];
          all = all.concat(chunk);
          if (chunk.length < page) break;
          from += page;
        }
        all.forEach((it: any) => { (map[it.recipe_id] = map[it.recipe_id] || []).push(it); });
      }
      setItemsByRecipe(map);
    } catch { setRecipes([]); setItemsByRecipe({}); }
    setLoading(false);
  };

  // Recalcula y GUARDA el costo de todas las recetas y platos a partir de los costos
  // actuales del Maestro de Insumos, propagando de abajo hacia arriba
  // (insumo → receta producción → receta sucursal → plato de carta).
  const recalcularCostos = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    if (!window.confirm('Se van a recalcular y GUARDAR los costos de todas las recetas y platos usando los costos actuales de insumos. ¿Continuar?')) return;
    setRecalc(true);
    try {
      const res = await recalcularCostosRecetas();
      // Refrescar maestros en pantalla
      const [{ data: prods2 }, { data: masters2 }] = await Promise.all([
        supabase.from('products').select('id, name, category, code, cost').order('name'),
        supabase.from('recipe_masters').select('id, tipo, name, unit, code, cost').order('name'),
      ]);
      setProductos((prods2 as any[]) || []);
      setRecipeMasters((masters2 as any[]) || []);
      await cargar();
      alert(`Costos recalculados: ${res.recetas} receta(s) y ${res.platos} plato(s) actualizados.${res.sinMatch ? ` (${res.sinMatch} sin coincidencia en los maestros)` : ''}`);
    } catch (e: any) {
      alert('Error al recalcular costos: ' + (e.message || e));
    } finally {
      setRecalc(false);
    }
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [tipo]);

  // Carga los maestros una vez: Productos (para Carta) y Recetas Producción/Sucursal
  useEffect(() => {
    (async () => {
      try {
        const [{ data: prods }, { data: masters }] = await Promise.all([
          supabase.from('products').select('id, name, category, code, cost').order('name'),
          supabase.from('recipe_masters').select('id, tipo, name, unit, code, cost').order('name'),
        ]);
        setProductos((prods as any[]) || []);
        setRecipeMasters((masters as any[]) || []);
      } catch { setProductos([]); setRecipeMasters([]); }
    })();
  }, []);

  // Maestro que corresponde al tipo actual (nombre + unidad + código)
  const masterLabel = tipo === 'carta' ? 'Maestro de Platos' : tipo === 'produccion' ? 'Maestro Recetas Producción' : 'Maestro Recetas Sucursales';
  const masterOptions = useMemo(() => {
    if (tipo === 'carta') return productos.map(p => ({ name: p.name, unit: '', code: p.code || '', category: p.category || '' }));
    return recipeMasters.filter(m => m.tipo === tipo).map(m => ({ name: m.name, unit: m.unit || '', code: m.code || '', category: '' }));
  }, [tipo, productos, recipeMasters]);

  // Sugerencias del maestro según la búsqueda
  const prodSugerencias = useMemo(() => {
    const q = prodSearch.trim().toLowerCase();
    const base = q ? masterOptions.filter(o => o.name.toLowerCase().includes(q)) : masterOptions;
    return base.slice(0, 60);
  }, [prodSearch, masterOptions]);

  // Secciones de la carta (Maestro Secciones Carta)
  const seccionesMaster = useMemo(() => recipeMasters.filter(m => m.tipo === 'seccion_carta').map(m => m.name), [recipeMasters]);
  const secSugerencias = useMemo(() => {
    const q = secSearch.trim().toLowerCase();
    const base = q ? seccionesMaster.filter(s => s.toLowerCase().includes(q)) : seccionesMaster;
    return base.slice(0, 60);
  }, [secSearch, seccionesMaster]);

  // ¿La receta se considera activa? (por defecto sí, para las importadas sin el campo)
  const esActiva = (r: Recipe) => r.active !== false;
  const nActivas = useMemo(() => recipes.filter(esActiva).length, [recipes]);
  const nInactivas = recipes.length - nActivas;

  const recetasFiltradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recipes.filter(r => {
      if (estadoFiltro === 'activas' && !esActiva(r)) return false;
      if (estadoFiltro === 'inactivas' && esActiva(r)) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        String(r.code || '').toLowerCase().includes(q) ||
        String(r.seccion || '').toLowerCase().includes(q) ||
        (itemsByRecipe[r.id] || []).some(it => it.item_name.toLowerCase().includes(q))
      );
    });
  }, [recipes, search, itemsByRecipe, estadoFiltro]);

  // Agrupar carta por sección
  const grupos = useMemo(() => {
    if (tipo !== 'carta') return null;
    const g: Record<string, Recipe[]> = {};
    recetasFiltradas.forEach(r => { const k = r.seccion || 'SIN SECCIÓN'; (g[k] = g[k] || []).push(r); });
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  }, [recetasFiltradas, tipo]);

  const costoReceta = (r: Recipe) =>
    (itemsByRecipe[r.id] || []).reduce((acc, it) => acc + (costByCode.get(String(it.code)) || 0) * (Number(it.quantity) || 0), 0);

  // Exporta a PDF las recetas de la vista actual (respeta tipo, filtro y búsqueda),
  // cada una con el detalle de insumos, precio unitario, subtotal y costo total.
  const exportarPDF = () => {
    const lista = recetasFiltradas;
    if (!lista.length) { alert('No hay recetas para exportar en esta vista.'); return; }
    const doc = new jsPDF();
    const tipoLabel = TIPOS.find(t => t.id === tipo)?.label || '';
    const money = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-AR');
    const hoy = new Date().toLocaleDateString('es-AR');
    const pageH = doc.internal.pageSize.getHeight();

    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text(`Recetas · ${tipoLabel}`, 14, 18);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(120);
    doc.text(`${lista.length} receta(s) · Costos según último "Recalcular costos" · Generado ${hoy}`, 14, 24);
    doc.setTextColor(0);
    let y = 32;

    lista.forEach(r => {
      const its = itemsByRecipe[r.id] || [];
      const rows = its.map(it => {
        const q = Number(it.quantity) || 0;
        const pu = costByCode.get(String(it.code)) || 0;
        return [it.item_name || '', String(it.code || ''), q ? q.toLocaleString('es-AR') : '', it.unit || '', money(pu), money(pu * q)];
      });
      const total = costoReceta(r);
      if (y > pageH - 40) { doc.addPage(); y = 18; }
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
      const titulo = r.name + (r.code ? `  ·  Cód ${r.code}` : '') + (r.unit ? `  ·  ${r.unit}` : '');
      doc.text(titulo, 14, y);
      if (r.seccion) { doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(120); doc.text(String(r.seccion), 14, y + 4.5); doc.setTextColor(0); }
      autoTable(doc, {
        startY: y + (r.seccion ? 7 : 4),
        head: [['Insumo', 'Código', 'Cantidad', 'Unidad', 'Precio unit.', 'Subtotal']],
        body: rows.length ? rows : [['(sin insumos cargados)', '', '', '', '', '']],
        foot: [[{ content: 'Costo total de la receta', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } }, { content: money(total), styles: { halign: 'right', fontStyle: 'bold' } }]],
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [237, 28, 36], textColor: 255, fontSize: 8 },
        footStyles: { fillColor: [245, 245, 245], textColor: 0 },
        columnStyles: { 2: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
        margin: { left: 14, right: 14 },
        theme: 'grid',
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    });

    doc.save(`Recetas_${tipoLabel.replace(/\s+/g, '_')}_${hoy.replace(/\//g, '-')}.pdf`);
  };

  // ── Editor ──
  const abrirNueva = () => {
    setEditing({ id: '', tipo, code: null, name: '', seccion: null, unit: null, photo: null, notes: null, active: true });
    setDraftItems([]);
    setIngSearch(''); setProdSearch(''); setProdOpen(false); setSecSearch(''); setSecOpen(false);
  };
  const abrirEditar = (r: Recipe) => {
    setEditing({ ...r });
    setDraftItems((itemsByRecipe[r.id] || []).map(it => ({ ...it })));
    setIngSearch(''); setProdSearch(''); setProdOpen(false); setSecSearch(''); setSecOpen(false);
  };
  const cerrarEditor = () => { setEditing(null); setDraftItems([]); setProdSearch(''); setProdOpen(false); setSecSearch(''); setSecOpen(false); };

  const agregarInsumoMaestro = (it: { id?: string | null; code?: string | null; name: string; unit?: string | null }) => {
    setDraftItems(prev => [...prev, {
      item_id: it.id || null, code: it.code || null, item_name: it.name, unit: it.unit || null, quantity: null, sort_order: prev.length + 1
    }]);
    setIngSearch('');
  };
  const setItem = (i: number, field: keyof RecipeItem, value: any) =>
    setDraftItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it));
  const quitarItem = (i: number) => setDraftItems(prev => prev.filter((_, idx) => idx !== i));

  const onFoto = async (file?: File | null) => {
    if (!file) return;
    try { const dataUrl = await compressImage(file); setEditing(e => e ? { ...e, photo: dataUrl } : e); }
    catch { alert('No se pudo procesar la imagen.'); }
  };

  const guardar = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. Solo podés ver las recetas.'); return; }
    if (!editing) return;
    if (!editing.name.trim()) { alert(`Elegí el producto del ${masterLabel}.`); return; }
    // El nombre debe existir en el maestro correspondiente (solo al crear una receta nueva)
    if (!editing.id && !masterOptions.some(o => o.name.trim().toLowerCase() === editing.name.trim().toLowerCase())) {
      alert(`El producto debe existir en el ${masterLabel}. Elegilo de la lista.`);
      return;
    }
    // En Carta, la sección debe existir en el Maestro Secciones Carta (si hay secciones cargadas)
    if (tipo === 'carta' && !editing.id && seccionesMaster.length > 0) {
      const sec = (editing.seccion || '').trim().toLowerCase();
      if (!sec || !seccionesMaster.some(s => s.trim().toLowerCase() === sec)) {
        alert('Elegí una sección del Maestro Secciones Carta.');
        return;
      }
    }
    if (draftItems.length === 0) { alert('Agregá al menos un insumo.'); return; }
    if (draftItems.some(it => !it.item_name.trim())) { alert('Todos los insumos deben tener nombre.'); return; }
    setSaving(true);
    try {
      const isNew = !editing.id;
      const recipeId = editing.id || `r_${tipo.slice(0, 3)}_${Date.now()}${Math.random().toString(36).slice(2, 5)}`;
      const payload = {
        id: recipeId,
        tipo,
        code: editing.code?.trim() || null,
        name: editing.name.trim(),
        seccion: tipo === 'carta' ? (editing.seccion?.trim() || null) : null,
        unit: editing.unit?.trim() || null,
        photo: tipo === 'carta' ? (editing.photo || null) : null,
        notes: editing.notes?.trim() || null,
        active: editing.active !== false,
        created_by: currentUserName || '—',
        updated_at: new Date().toISOString(),
      };
      const { error: e1 } = await supabase.from('op_recipes').upsert(payload, { onConflict: 'id' });
      if (e1) throw e1;
      // Reemplazar insumos
      await supabase.from('op_recipe_items').delete().eq('recipe_id', recipeId);
      const rows = draftItems.map((it, idx) => ({
        id: `${recipeId}_i${idx + 1}_${Math.random().toString(36).slice(2, 5)}`,
        recipe_id: recipeId,
        item_id: it.item_id || null,
        code: it.code?.trim() || null,
        item_name: it.item_name.trim(),
        unit: it.unit?.trim() || null,
        quantity: parseQty(it.quantity),
        sort_order: idx + 1,
      }));
      if (rows.length > 0) { const { error: e2 } = await supabase.from('op_recipe_items').insert(rows); if (e2) throw e2; }
      cerrarEditor();
      await cargar();
      if (isNew) setSearch('');
    } catch (err: any) {
      alert('Error al guardar: ' + (err.message || err));
    }
    setSaving(false);
  };

  const borrar = async (r: Recipe) => {
    if (!window.confirm(`¿Eliminar la receta "${r.name}"?`)) return;
    await supabase.from('op_recipe_items').delete().eq('recipe_id', r.id);
    await supabase.from('op_recipes').delete().eq('id', r.id);
    await cargar();
  };

  // Activar / inactivar sin abrir el editor (la receta queda en la base)
  const toggleActiva = async (r: Recipe) => {
    const nuevo = !esActiva(r);
    setRecipes(prev => prev.map(x => x.id === r.id ? { ...x, active: nuevo } : x)); // optimista
    const { error } = await supabase.from('op_recipes').update({ active: nuevo, updated_at: new Date().toISOString() }).eq('id', r.id);
    if (error) { alert('Error al cambiar estado: ' + error.message); await cargar(); }
  };

  // ── Importador desde Excel (mismo formato de la planilla) ──
  const SHEET_MAP: { name: RegExp; tipo: Tipo; seccion: boolean }[] = [
    { name: /produccion/i, tipo: 'produccion', seccion: false },
    { name: /sucursal/i, tipo: 'sucursal', seccion: false },
    { name: /carta/i, tipo: 'carta', seccion: true },
  ];
  const cleanCell = (v: any) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string') { const s = v.trim(); return s || null; }
    return v;
  };
  const codeStr = (v: any) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return String(Math.trunc(v));
    return String(v).trim() || null;
  };
  const importar = async (file: File) => {
    if (!window.confirm('Importar reemplaza las recetas de las hojas encontradas (Producción, Sucursal y/o Carta). ¿Continuar?')) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      let totalR = 0, totalI = 0;
      const tiposImportados = new Set<Tipo>();
      const recipesToInsert: any[] = [];
      const itemsToInsert: any[] = [];

      for (const sh of wb.SheetNames) {
        const cfg = SHEET_MAP.find(m => m.name.test(sh));
        if (!cfg) continue;
        tiposImportados.add(cfg.tipo);
        const ws = wb.Sheets[sh];
        const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
        let cur: any = null; let seq = 0;
        for (let r = 1; r < aoa.length; r++) {
          const row = (aoa[r] || []).map(cleanCell);
          if (row.every(x => x === null || x === undefined)) continue;
          let codeArt, seccion, name, umpt, codeIns, insName, umIns, cant;
          if (cfg.seccion) { [codeArt, seccion, name, umpt, codeIns, insName, umIns, cant] = row; }
          else { [codeArt, name, umpt, codeIns, insName, umIns, cant] = row; seccion = null; }
          if (typeof seccion === 'string' && seccion.trim().toUpperCase() === 'SECCION') seccion = null;
          const isHdrName = (x: any) => typeof x === 'string' && x.trim().toUpperCase() === 'NOMBRE DEL PRODUCTO';
          const isHdrIns = (x: any) => typeof x === 'string' && x.trim().toUpperCase().startsWith('NOMBRE INSUMO');
          if (name !== null && name !== undefined && !isHdrName(name)) {
            const rid = `r_${cfg.tipo.slice(0, 3)}_imp_${Date.now()}_${seq++}`;
            cur = {
              id: rid, tipo: cfg.tipo, code: codeStr(codeArt), name: String(name).trim(),
              seccion: seccion && !isHdrName(seccion) ? String(seccion).trim() : null,
              unit: umpt ? String(umpt).trim() : null, created_by: currentUserName || '—',
            };
            recipesToInsert.push(cur); totalR++;
          }
          if (insName && !isHdrIns(insName)) {
            if (!cur) continue;
            const n = (itemsToInsert.filter(x => x.recipe_id === cur.id).length) + 1;
            itemsToInsert.push({
              id: `${cur.id}_i${n}`, recipe_id: cur.id, item_id: null, code: codeStr(codeIns),
              item_name: String(insName).trim(), unit: umIns ? String(umIns).trim() : null,
              quantity: cant === null || cant === '' ? null : Number(cant), sort_order: n,
            });
            totalI++;
          }
        }
      }
      if (tiposImportados.size === 0) { alert('No se encontraron hojas de recetas (Producción, Sucursal o Carta) en el archivo.'); setImporting(false); return; }

      // Reemplazar por tipo
      for (const t of tiposImportados) {
        const { data: old } = await supabase.from('op_recipes').select('id').eq('tipo', t);
        const oldIds = (old || []).map((o: any) => o.id);
        if (oldIds.length > 0) {
          for (let i = 0; i < oldIds.length; i += 200) await supabase.from('op_recipe_items').delete().in('recipe_id', oldIds.slice(i, i + 200));
          for (let i = 0; i < oldIds.length; i += 200) await supabase.from('op_recipes').delete().in('id', oldIds.slice(i, i + 200));
        }
      }
      for (let i = 0; i < recipesToInsert.length; i += 200) { const { error } = await supabase.from('op_recipes').insert(recipesToInsert.slice(i, i + 200)); if (error) throw error; }
      for (let i = 0; i < itemsToInsert.length; i += 300) { const { error } = await supabase.from('op_recipe_items').insert(itemsToInsert.slice(i, i + 300)); if (error) throw error; }

      alert(`Importación completa: ${totalR} recetas y ${totalI} insumos.`);
      await cargar();
    } catch (err: any) {
      alert('Error al importar: ' + (err.message || err));
    }
    setImporting(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  // Origen de los insumos del editor según el tipo de receta:
  //  - producción: Insumos + Recetas de Producción (una receta puede llevar otra receta,
  //    ej. "Tarta de jamón y queso" lleva "Masa de tarta", que es otra receta de producción).
  //  - sucursal: Insumos + Recetas de Sucursal + Recetas de Producción.
  //  - platos de la carta: Insumos + Recetas Producción + Recetas Sucursales + otros Platos de la Carta.
  const insumoOptions = useMemo(() => {
    const norm = (s: any) => String(s || '').trim().toUpperCase();
    const base = items.map((i: any) => ({ id: i.id, code: i.code || null, name: i.name, unit: i.unit || null, origen: 'INSUMO' }));
    const rmToOpt = (tipos: string[]) => recipeMasters
      .filter((m: any) => tipos.includes(m.tipo))
      // Una receta de producción no puede llevarse a sí misma como insumo
      .filter((m: any) => !(tipo === 'produccion' && editing?.id && m.id === editing.id) && !(tipo === 'produccion' && editing?.name && norm(m.name) === norm(editing.name)))
      .map((m: any) => ({ id: m.id || null, code: m.code || null, name: m.name, unit: m.unit || null, origen: m.tipo === 'produccion' ? 'RECETA PROD.' : 'RECETA SUC.' }));
    // Otros platos de la carta (products), excluyendo el que se está editando (no puede llevarse a sí mismo).
    const cartaPlates = () => productos
      .filter((p: any) => !(editing?.name && norm(p.name) === norm(editing.name)) && !(editing?.code && p.code && String(p.code).trim() === String(editing.code).trim()))
      .map((p: any) => ({ id: p.id || null, code: p.code || null, name: p.name, unit: 'UN', origen: 'PLATO CARTA' }));
    // Producción: insumos + Recetas de Producción.
    if (tipo === 'produccion') return [...base, ...rmToOpt(['produccion'])];
    // Sucursal: insumos + Recetas de Sucursal + Recetas de Producción.
    if (tipo === 'sucursal') return [...base, ...rmToOpt(['sucursal', 'produccion'])];
    // Carta: insumos + Recetas Producción + Recetas Sucursales + otros Platos de la Carta.
    return [...base, ...rmToOpt(['produccion', 'sucursal']), ...cartaPlates()];
  }, [items, recipeMasters, productos, tipo, editing?.id, editing?.name, editing?.code]);

  // Sugerencias del maestro para el buscador de insumos del editor
  const sugerencias = useMemo(() => {
    const q = ingSearch.trim().toLowerCase();
    if (!q) return [];
    return insumoOptions.filter(i => i.name.toLowerCase().includes(q) || String(i.code || '').includes(q)).slice(0, 8);
  }, [ingSearch, insumoOptions]);

  const draftCosto = draftItems.reduce((a, it) => a + (costByCode.get(String(it.code)) || 0) * (parseQty(it.quantity) || 0), 0);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* Encabezado */}
      <div className="bg-bg-card border border-border-dim rounded-lg p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-brand-500/10 p-2.5 rounded-lg"><BookOpen className="text-brand-500" size={20} /></div>
            <div>
              <h2 className="text-base font-black uppercase text-text-main tracking-wider">Recetas</h2>
              <p className="text-[9px] text-text-dim uppercase font-bold">Producción · En Sucursal · Platos de la Carta</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportarPDF}
              title="Exporta las recetas de esta vista a PDF con insumos y costos"
              className="flex items-center gap-2 bg-bg-accent border border-border-dim text-text-dim hover:text-brand-500 hover:border-brand-500/40 px-3 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all">
              <FileText size={13} /> Exportar PDF
            </button>
            {!isReadOnly && (
            <>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) importar(f); }} />
              <button onClick={recalcularCostos} disabled={recalc}
                title="Recalcula y guarda el costo de todas las recetas y platos según los costos actuales de insumos"
                className="flex items-center gap-2 bg-bg-accent border border-border-dim text-text-dim hover:text-emerald-500 hover:border-emerald-500/40 px-3 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-50">
                {recalc ? <Loader2 size={13} className="animate-spin" /> : <Calculator size={13} />} Recalcular costos
              </button>
              <button onClick={() => fileRef.current?.click()} disabled={importing}
                className="flex items-center gap-2 bg-bg-accent border border-border-dim text-text-dim hover:text-brand-500 hover:border-brand-500/40 px-3 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-50">
                {importing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Importar Excel
              </button>
              <button onClick={abrirNueva}
                className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all">
                <Plus size={14} /> Nueva receta
              </button>
            </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs de tipo */}
      <div className="flex flex-wrap gap-1.5">
        {TIPOS.map(t => {
          const Icon = t.icon;
          const active = tipo === t.id;
          return (
            <button key={t.id} onClick={() => setTipo(t.id)}
              className={cn("flex items-center gap-2 px-4 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all",
                active ? "bg-brand-500 text-white border-brand-500" : "bg-bg-card text-text-dim border-border-dim hover:border-brand-500/40")}>
              <Icon size={14} className={active ? "text-white" : t.color} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Filtro por estado */}
      <div className="flex flex-wrap items-center gap-1.5">
        {([
          { id: 'activas', label: `Activas (${nActivas})` },
          { id: 'inactivas', label: `Inactivas (${nInactivas})` },
          { id: 'todas', label: `Todas (${recipes.length})` },
        ] as const).map(f => (
          <button key={f.id} onClick={() => setEstadoFiltro(f.id)}
            className={cn("px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest border transition-all",
              estadoFiltro === f.id
                ? (f.id === 'inactivas' ? "bg-text-dim text-white border-text-dim" : "bg-emerald-500 text-white border-emerald-500")
                : "bg-bg-card text-text-dim border-border-dim hover:border-brand-500/40")}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Buscador */}
      <div className="flex items-center gap-2 bg-bg-card border border-border-dim rounded-lg px-3 py-2">
        <Search size={15} className="text-text-dim shrink-0" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por producto, código, sección o insumo…"
          className="flex-1 bg-transparent text-[11px] font-bold text-text-main outline-none placeholder:text-text-dim/60" />
        <span className="text-[9px] font-black uppercase text-text-dim shrink-0">{recetasFiltradas.length} receta(s)</span>
      </div>

      {/* Listado */}
      {loading ? (
        <p className="text-center text-[10px] font-bold uppercase text-text-dim py-10">Cargando…</p>
      ) : recetasFiltradas.length === 0 ? (
        <p className="text-center text-[10px] font-bold uppercase text-text-dim py-12">
          No hay recetas cargadas para este tipo.{!isReadOnly && ' Usá "Nueva receta" o "Importar Excel".'}
        </p>
      ) : tipo === 'carta' && grupos ? (
        <div className="space-y-6">
          {grupos.map(([seccion, recs]) => (
            <div key={seccion} className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 border-b border-amber-500/30 pb-1">{seccion} ({recs.length})</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {recs.map(r => (
                  <RecipeCard key={r.id} r={r} nItems={(itemsByRecipe[r.id] || []).length} costo={costoReceta(r)}
                    activa={esActiva(r)} onEdit={() => abrirEditar(r)} onDelete={() => borrar(r)} onToggle={() => toggleActiva(r)} isReadOnly={isReadOnly} withPhoto />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {recetasFiltradas.map(r => (
            <RecipeCard key={r.id} r={r} nItems={(itemsByRecipe[r.id] || []).length} costo={costoReceta(r)}
              activa={esActiva(r)} onEdit={() => abrirEditar(r)} onDelete={() => borrar(r)} onToggle={() => toggleActiva(r)} isReadOnly={isReadOnly} />
          ))}
        </div>
      )}

      {/* ── Editor modal ── */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start md:items-center justify-center p-3 overflow-y-auto" onClick={cerrarEditor}>
          <div className="bg-bg-card border border-border-dim rounded-xl max-w-3xl w-full my-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header editor */}
            <div className="flex items-center justify-between p-4 border-b border-border-dim">
              <h3 className="text-sm font-black uppercase text-text-main tracking-wide flex items-center gap-2">
                <Pencil size={16} className="text-brand-500" /> {isReadOnly ? 'Ver receta' : editing.id ? 'Editar receta' : 'Nueva receta'} · {TIPOS.find(t => t.id === tipo)?.label}
              </h3>
              <button onClick={cerrarEditor} className="p-1.5 text-text-dim hover:text-text-main"><X size={18} /></button>
            </div>

            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {/* Estado activa / inactiva */}
              <div className="flex items-center gap-2 flex-wrap bg-bg-accent/40 border border-border-dim rounded-lg px-3 py-2">
                <span className="text-[9px] font-black uppercase text-text-dim tracking-widest mr-1">Estado:</span>
                {([
                  { v: true, label: 'Activa' },
                  { v: false, label: 'Inactiva' },
                ] as const).map(o => (
                  <button key={String(o.v)} type="button" disabled={isReadOnly} onClick={() => setEditing({ ...editing, active: o.v })}
                    className={cn("px-3 py-1.5 rounded text-[9px] font-black uppercase border transition-all",
                      (editing.active !== false) === o.v
                        ? (o.v ? "bg-emerald-500 text-white border-emerald-500" : "bg-text-dim text-white border-text-dim")
                        : "bg-bg-card text-text-dim border-border-dim hover:border-brand-500/40")}>
                    {o.label}
                  </button>
                ))}
                <span className="text-[8px] font-bold uppercase text-text-dim opacity-70">Inactiva = queda guardada pero no se usa</span>
              </div>

              {/* Datos del producto */}
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <div className="md:col-span-3">
                  <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">
                    Nombre del producto * <span className="text-text-dim/60 normal-case">(del {masterLabel})</span>
                  </label>
                  {!isReadOnly ? (
                    <div className="relative">
                      <input
                        value={prodOpen ? prodSearch : (editing.name || '')}
                        onChange={e => { setProdSearch(e.target.value); setProdOpen(true); setEditing({ ...editing, name: '' }); }}
                        onFocus={() => { setProdOpen(true); setProdSearch(''); }}
                        onBlur={() => setTimeout(() => setProdOpen(false), 150)}
                        placeholder="Buscá y elegí del maestro…"
                        className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-brand-500" />
                      {prodOpen && (
                        <div className="absolute z-20 mt-1 w-full bg-bg-card border border-border-dim rounded-lg shadow-xl max-h-56 overflow-y-auto">
                          {prodSugerencias.length === 0 ? (
                            <p className="px-3 py-3 text-[9px] font-bold uppercase text-text-dim text-center">Sin resultados en el maestro. Cargalo en Maestros.</p>
                          ) : prodSugerencias.map((p, idx) => (
                            <button key={`${p.name}-${idx}`} type="button" onMouseDown={e => e.preventDefault()}
                              onClick={() => { setEditing({ ...editing, name: p.name, ...(p.unit ? { unit: p.unit } : {}), ...(p.code ? { code: p.code } : {}) }); setProdSearch(''); setProdOpen(false); }}
                              className="w-full text-left px-3 py-2 hover:bg-bg-accent flex items-center gap-2 border-b border-border-dim/30 last:border-0">
                              <span className="text-[10px] font-bold uppercase text-text-main flex-1 truncate">{p.name}</span>
                              {p.unit && <span className="text-[8px] font-black uppercase text-text-dim shrink-0">{p.unit}</span>}
                              {p.category && <span className="text-[8px] font-black uppercase text-text-dim shrink-0">{p.category}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <input readOnly value={editing.name}
                      className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-brand-500" />
                  )}
                </div>
                <div className="md:col-span-1">
                  <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Código</label>
                  <input readOnly value={editing.code || ''}
                    className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-mono font-bold text-text-dim outline-none" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">U.M. producto</label>
                  <input readOnly value={editing.unit || ''}
                    placeholder="—"
                    className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-dim outline-none" />
                </div>
                {tipo === 'carta' && (
                  <div className="md:col-span-6">
                    <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">
                      Sección de la carta <span className="text-text-dim/60 normal-case">(del Maestro Secciones Carta)</span>
                    </label>
                    {!isReadOnly ? (
                      <div className="relative">
                        <input
                          value={secOpen ? secSearch : (editing.seccion || '')}
                          onChange={e => { setSecSearch(e.target.value); setSecOpen(true); setEditing({ ...editing, seccion: '' }); }}
                          onFocus={() => { setSecOpen(true); setSecSearch(''); }}
                          onBlur={() => setTimeout(() => setSecOpen(false), 150)}
                          placeholder="Buscá y elegí la sección…"
                          className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-brand-500" />
                        {secOpen && (
                          <div className="absolute z-20 mt-1 w-full bg-bg-card border border-border-dim rounded-lg shadow-xl max-h-56 overflow-y-auto">
                            {secSugerencias.length === 0 ? (
                              <p className="px-3 py-3 text-[9px] font-bold uppercase text-text-dim text-center">Sin secciones cargadas. Cargalas en Maestros.</p>
                            ) : secSugerencias.map((s, idx) => (
                              <button key={`${s}-${idx}`} type="button" onMouseDown={e => e.preventDefault()}
                                onClick={() => { setEditing({ ...editing, seccion: s }); setSecSearch(''); setSecOpen(false); }}
                                className="w-full text-left px-3 py-2 hover:bg-bg-accent border-b border-border-dim/30 last:border-0">
                                <span className="text-[10px] font-bold uppercase text-text-main">{s}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <input readOnly value={editing.seccion || ''}
                        className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-brand-500" />
                    )}
                  </div>
                )}
              </div>

              {/* Foto (solo carta) */}
              {tipo === 'carta' && (
                <div className="flex items-center gap-3">
                  {editing.photo ? (
                    <div className="relative">
                      <img src={editing.photo} alt="plato" className="w-28 h-28 object-cover rounded-lg border border-border-dim" />
                      {!isReadOnly && (
                        <button onClick={() => setEditing({ ...editing, photo: null })}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"><X size={12} /></button>
                      )}
                    </div>
                  ) : isReadOnly ? (
                    <div className="w-28 h-28 rounded-lg border border-border-dim flex items-center justify-center text-text-dim/40"><ImagePlus size={22} /></div>
                  ) : (
                    <label className="w-28 h-28 rounded-lg border-2 border-dashed border-border-dim flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-brand-500/50 text-text-dim">
                      <ImagePlus size={22} />
                      <span className="text-[8px] font-black uppercase">Subir foto</span>
                      <input type="file" accept="image/*" className="hidden" onChange={e => onFoto(e.target.files?.[0])} />
                    </label>
                  )}
                  {!isReadOnly && (
                    <p className="text-[9px] font-bold uppercase text-text-dim opacity-70 leading-relaxed">
                      Foto del plato terminado.<br />Se comprime y se guarda en la app.
                    </p>
                  )}
                </div>
              )}

              {/* Insumos */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-brand-500 flex items-center gap-2"><ListChecks size={14} /> Insumos ({draftItems.length})</p>
                  {draftCosto > 0 && <span className="text-[10px] font-mono font-black text-emerald-500">Costo estimado: ${draftCosto.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span>}
                </div>

                {/* Buscador de insumos del maestro */}
                {!isReadOnly && (
                <div className="relative">
                  <div className="flex items-center gap-2 bg-bg-accent border border-border-dim rounded px-3 py-2">
                    <Search size={14} className="text-text-dim shrink-0" />
                    <input value={ingSearch} onChange={e => setIngSearch(e.target.value)}
                      placeholder={tipo === 'carta' ? 'Buscar insumo, receta o plato de la carta para agregar…' : tipo === 'sucursal' ? 'Buscar insumo o receta (suc./prod.) para agregar…' : 'Buscar insumo o receta de producción para agregar…'}
                      className="flex-1 bg-transparent text-[11px] font-bold text-text-main outline-none placeholder:text-text-dim/60" />
                  </div>
                  {sugerencias.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-bg-card border border-border-dim rounded-lg shadow-xl max-h-56 overflow-y-auto">
                      {sugerencias.map((s, i) => (
                        <button key={`${s.id || 'x'}-${s.code || i}`} onClick={() => agregarInsumoMaestro(s)} type="button"
                          className="w-full text-left px-3 py-2 hover:bg-bg-accent flex items-center gap-2 border-b border-border-dim/40 last:border-0">
                          <span className="text-[10px] font-bold uppercase text-text-main flex-1">{s.name}</span>
                          {(s as any).origen && (s as any).origen !== 'INSUMO' && (
                            <span className="text-[7px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-500 border border-brand-500/20">{(s as any).origen}</span>
                          )}
                          {s.code && <span className="text-[8px] font-mono text-text-dim">{s.code}</span>}
                          <span className="text-[8px] font-black uppercase text-text-dim">{s.unit}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                )}

                {/* Filas de insumos */}
                {draftItems.length === 0 ? (
                  <p className="text-center text-[9px] font-bold uppercase text-text-dim py-4">{isReadOnly ? 'Esta receta no tiene insumos.' : 'Todavía no agregaste insumos.'}</p>
                ) : (
                  <div className="space-y-1.5">
                    <div className="hidden md:grid grid-cols-12 gap-2 px-2 text-[8px] font-black uppercase text-text-dim tracking-widest">
                      <span className="col-span-3">Insumo</span><span className="col-span-1">Código</span>
                      <span className="col-span-1">Unidad</span><span className="col-span-2">Cantidad</span>
                      <span className="col-span-2 text-right">Precio unit.</span><span className="col-span-2 text-right">Subtotal</span><span className="col-span-1"></span>
                    </div>
                    {draftItems.map((it, i) => {
                      // Precio que trae cada insumo (por código) y subtotal = precio × cantidad.
                      const codeStr = String(it.code || '').trim();
                      // ¿El código existe en algún maestro (Insumos o Recetas)? Si no, el componente
                      // está mal vinculado y por eso nunca va a traer costo.
                      const codeKnown = codeStr !== '' && knownCodes.has(codeStr);
                      const unitCost = costByCode.get(codeStr) || 0;
                      const subtotal = unitCost * (parseQty(it.quantity) || 0);
                      return (
                      <div key={i} className="grid grid-cols-12 gap-2 items-center bg-bg-accent/40 border border-border-dim rounded px-2 py-1.5">
                        <input readOnly value={it.item_name}
                          className="col-span-12 md:col-span-3 bg-bg-card border border-border-dim rounded px-2 py-1 text-[10px] font-bold text-text-main outline-none" />
                        <input readOnly value={it.code || ''}
                          placeholder="cód." className="col-span-4 md:col-span-1 bg-bg-card border border-border-dim rounded px-2 py-1 text-[10px] font-mono text-text-dim outline-none" />
                        <input readOnly value={it.unit || ''}
                          placeholder="UM" className="col-span-3 md:col-span-1 bg-bg-card border border-border-dim rounded px-1 py-1 text-[10px] font-bold text-text-dim outline-none" />
                        <input readOnly={isReadOnly} type="text" inputMode="decimal" value={fmtQty(it.quantity)} onChange={e => setItem(i, 'quantity', e.target.value)}
                          placeholder="0" className="col-span-5 md:col-span-2 bg-bg-card border border-border-dim rounded px-2 py-1 text-[10px] font-mono font-bold text-text-main outline-none focus:border-brand-500" />
                        {/* Precio unitario (solo lectura, viene del maestro). Tres estados:
                            - código inexistente en ningún maestro -> ⚠ (hay que reemplazar el componente)
                            - código OK pero costo 0 en el maestro  -> "costo 0"
                            - precio normal */}
                        <div className={cn("col-span-6 md:col-span-2 text-right px-2 py-1 text-[10px] font-mono font-bold",
                          !codeKnown ? "text-red-500" : unitCost > 0 ? "text-text-dim" : "text-amber-500")}
                          title={!codeKnown
                            ? `El código ${codeStr || '(vacío)'} no existe en ningún maestro (Insumos ni Recetas). Reemplazá este componente desde el buscador para que tome el código correcto y su costo.`
                            : unitCost > 0 ? 'Precio unitario del insumo (maestro)' : 'El maestro tiene costo 0 para este código.'}>
                          {!codeKnown ? '⚠ código inexistente' : unitCost > 0 ? `$${unitCost.toLocaleString('es-AR', { maximumFractionDigits: 2 })}` : 'costo 0'}
                        </div>
                        {/* Subtotal = precio × cantidad */}
                        <div className="col-span-5 md:col-span-2 text-right px-2 py-1 text-[10px] font-mono font-black text-emerald-500"
                          title="Subtotal = precio unitario × cantidad">
                          ${subtotal.toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                        </div>
                        {!isReadOnly
                          ? <button onClick={() => quitarItem(i)} type="button" className="col-span-1 text-text-dim hover:text-red-500 flex justify-center"><Trash2 size={14} /></button>
                          : <span className="col-span-1" />}
                      </div>
                    );})}
                  </div>
                )}
              </div>
            </div>

            {/* Footer editor */}
            <div className="flex items-center justify-between gap-2 p-4 border-t border-border-dim">
              {isReadOnly ? <span className="text-[8px] font-black uppercase text-text-dim tracking-widest">Solo lectura · no podés modificar</span> : <span />}
              <div className="flex items-center gap-2">
                <button onClick={cerrarEditor} className="px-4 py-2 rounded text-[9px] font-black uppercase text-text-dim hover:text-text-main border border-border-dim">{isReadOnly ? 'Cerrar' : 'Cancelar'}</button>
                {!isReadOnly && (
                  <button onClick={guardar} disabled={saving}
                    className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-5 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-50">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar receta
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

const RecipeCard: React.FC<{
  r: Recipe; nItems: number; costo: number; activa: boolean; onEdit: () => void; onDelete: () => void; onToggle: () => void; isReadOnly?: boolean; withPhoto?: boolean;
}> = ({ r, nItems, costo, activa, onEdit, onDelete, onToggle, isReadOnly, withPhoto }) => {
  return (
    <div className={cn("bg-bg-sidebar border rounded-lg overflow-hidden hover:border-brand-500/40 transition-all group",
      activa ? "border-border-dim" : "border-border-dim/60 opacity-70")}>
      {withPhoto && (
        <div className="h-28 bg-bg-accent flex items-center justify-center overflow-hidden relative">
          {r.photo ? <img src={r.photo} alt={r.name} className={cn("w-full h-full object-cover", !activa && "grayscale")} />
            : <UtensilsCrossed size={26} className="text-text-dim/40" />}
          {!activa && <span className="absolute top-1.5 left-1.5 text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-text-dim text-white">Inactiva</span>}
        </div>
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 cursor-pointer" onClick={onEdit}>
            <div className="flex items-center gap-1.5">
              {!withPhoto && (
                <span className={cn("text-[7px] font-black uppercase px-1.5 py-0.5 rounded shrink-0",
                  activa ? "bg-emerald-500/15 text-emerald-600" : "bg-text-dim/15 text-text-dim")}>
                  {activa ? 'Activa' : 'Inactiva'}
                </span>
              )}
              <p className="text-[11px] font-black uppercase text-text-main leading-tight truncate">{r.name}</p>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {r.code && <span className="text-[8px] font-mono font-bold text-text-dim">{r.code}</span>}
              {r.unit && <span className="text-[8px] font-black uppercase text-text-dim">{r.unit}</span>}
              <span className="text-[8px] font-black uppercase text-brand-500">{nItems} insumo(s)</span>
              {costo > 0 && <span className="text-[8px] font-mono font-black text-emerald-500">${costo.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span>}
            </div>
          </div>
          {!isReadOnly && (
            <div className="flex flex-col gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
              <button onClick={onEdit} title="Editar" className="text-text-dim hover:text-brand-500"><Pencil size={13} /></button>
              <button onClick={onToggle} title={activa ? 'Inactivar' : 'Activar'}
                className={cn("transition-colors", activa ? "text-text-dim hover:text-text-main" : "text-emerald-500 hover:text-emerald-600")}>
                {activa ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
              </button>
              <button onClick={onDelete} title="Eliminar" className="text-text-dim hover:text-red-500"><Trash2 size={13} /></button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
