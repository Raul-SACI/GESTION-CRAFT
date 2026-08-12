/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pedidos Internos: el encargado de cada sucursal carga pedidos diarios que recibe
 * "Almacén y Producción" para preparar y enviar al día siguiente.
 *  - Tipo COMPRAS: insumos del almacén central.
 *  - Tipo PRODUCCIÓN: insumos elaborados por producción central.
 * Ambos se nutren del Maestro de Insumos (filtrable por categoría).
 * Al guardar, se registra en Supabase y se genera un PDF descargable.
 *
 * Regla de fechas: los pedidos son para el día siguiente, salvo el SÁBADO
 * (no se hacen pedidos porque el domingo no se trabaja en Almacén).
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, FileDown, Plus, Trash2, Save, Loader2, Search, AlertTriangle, History, Eye, X, PackageCheck, BarChart3 } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';
import { Branch, StockItem } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import InternalOrdersAnalyticsView from './InternalOrdersAnalyticsView';

interface OrderLine {
  itemId: string;
  itemName: string;
  code: string;
  category: string;
  unit: string;
  quantity: number;
  unitCost?: number;
  observations: string;
  received?: boolean;
  receivedQty?: number | null;
  receptionNote?: string;
}

interface SavedOrder {
  id: string;
  branch_id: string;
  order_type: string;
  order_date: string;
  delivery_date: string;
  created_by: string | null;
  notes: string | null;
  created_at: string;
  status?: string;
}

// Estados del pedido y su presentación
const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  pendiente:    { label: 'Pendiente de Recepción', color: 'text-amber-500 bg-amber-500/10' },
  preparacion:  { label: 'En preparación',         color: 'text-indigo-500 bg-indigo-500/10' },
  enviado:      { label: 'Enviado',                color: 'text-blue-500 bg-blue-500/10' },
  recibido:     { label: 'Recibido',               color: 'text-emerald-500 bg-emerald-500/10' },
};
const statusInfo = (s?: string) => ORDER_STATUS[s || 'pendiente'] || ORDER_STATUS.pendiente;

// Helper de fecha local (evita corrimiento por UTC)
const toLocalISO = (d: Date) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtDMY = (iso: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
// Fecha + hora real de carga (created_at) para la leyenda "Pedido cargado el …"
const fmtCargado = (iso?: string) => {
  if (!iso) return '';
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return '';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  let h = dt.getHours();
  const min = String(dt.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12; if (h === 0) h = 12;
  return `${dd}/${mm} a las ${String(h).padStart(2, '0')}:${min} ${ampm}`;
};

export default function InternalOrdersView({
  branches,
  selectedBranchId,
  items,
  currentUser,
  isReadOnly
}: {
  branches: Branch[];
  selectedBranchId: string;
  items: StockItem[];
  currentUser?: { name?: string; username?: string } | null;
  isReadOnly?: boolean;
}) {
  const [orderType, setOrderType] = useState<'compras' | 'produccion'>('compras');
  // Artículos del "Maestro Recetas Producción" (recipe_masters, tipo=produccion),
  // que se ofrecen SOLO cuando el pedido es "a Producción".
  const [produccionItems, setProduccionItems] = useState<StockItem[]>([]);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [itemSearch, setItemSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [recentOrders, setRecentOrders] = useState<SavedOrder[]>([]);
  const [shortfalls, setShortfalls] = useState<Record<string, { name: string; detail: string }[]>>({});
  const [viewingOrder, setViewingOrder] = useState<{ order: SavedOrder; lines: OrderLine[] } | null>(null);
  // Modal de recepción ítem por ítem (al marcar como Recibido)
  const [receivingOrder, setReceivingOrder] = useState<SavedOrder | null>(null);
  const [receptionLines, setReceptionLines] = useState<any[]>([]);
  const [savingReception, setSavingReception] = useState(false);

  // Fecha del pedido: por defecto hoy, pero editable (ej. se carga pasada la medianoche
  // y corresponde al día anterior). El horario real de carga se guarda aparte en created_at.
  const today = new Date();
  const todayISO = toLocalISO(today);
  const [orderDateISO, setOrderDateISO] = useState(todayISO);

  // Entrega = día siguiente a la fecha del pedido elegida
  const deliveryISO = useMemo(() => {
    const [y, m, d] = orderDateISO.split('-').map(Number);
    return toLocalISO(new Date(y, m - 1, d + 1));
  }, [orderDateISO]);

  // ¿La fecha del pedido cae sábado? (getDay: 0=domingo, 6=sábado). El sábado no se hacen pedidos.
  const isSaturday = useMemo(() => {
    const [y, m, d] = orderDateISO.split('-').map(Number);
    return new Date(y, m - 1, d).getDay() === 6;
  }, [orderDateISO]);

  const branchName = branches.find(b => b.id === selectedBranchId)?.name || 'Sucursal';

  // Cargar los artículos del Maestro Recetas Producción una vez.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('recipe_masters')
        .select('*')
        .eq('tipo', 'produccion')
        .order('name');
      if (active && data) {
        setProduccionItems(data.map((r: any) => ({
          id: r.id, name: r.name, unit: r.unit || 'UN', code: r.code || '', category: '', cost: 0, is_active: r.is_active
        })));
      }
    })();
    return () => { active = false; };
  }, []);

  // Fuente de artículos según el tipo de pedido:
  //  - COMPRAS      -> Maestro de Insumos (stock_items, prop `items`)
  //  - PRODUCCIÓN   -> Maestro Recetas Producción (recipe_masters)
  // En ambos casos se excluyen los inhabilitados (is_active === false).
  const sourceItems = useMemo(
    () => (orderType === 'produccion' ? produccionItems : items).filter(i => (i as any).is_active !== false),
    [orderType, produccionItems, items]
  );

  // Categorías disponibles de la fuente activa
  const categories = useMemo(() => {
    const set = new Set<string>();
    sourceItems.forEach(i => { if (i.category) set.add(i.category); });
    return Array.from(set).sort();
  }, [sourceItems]);

  // Insumos filtrados por categoría y búsqueda (que aún no estén en el pedido)
  const availableItems = useMemo(() => {
    const inOrder = new Set(lines.map(l => l.itemId));
    return sourceItems.filter(i => {
      if (inOrder.has(i.id)) return false;
      if (categoryFilter !== 'all' && (i.category || '') !== categoryFilter) return false;
      if (itemSearch && !i.name.toLowerCase().includes(itemSearch.toLowerCase())) return false;
      return true;
    });
  }, [sourceItems, lines, categoryFilter, itemSearch]);

  const loadRecentOrders = async () => {
    if (!selectedBranchId || selectedBranchId === 'all') { setRecentOrders([]); setShortfalls({}); return; }
    try {
      const { data } = await supabase
        .from('internal_orders')
        .select('*')
        .eq('branch_id', selectedBranchId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) {
        setRecentOrders(data);
        // Detectar faltantes en los pedidos recibidos
        const recibidos = data.filter((o: any) => o.status === 'recibido').map((o: any) => o.id);
        if (recibidos.length > 0) {
          const { data: its } = await supabase
            .from('internal_order_items')
            .select('order_id, item_name, quantity, received, received_qty, reception_note')
            .in('order_id', recibidos);
          const sf: Record<string, { name: string; detail: string }[]> = {};
          (its || []).forEach((it: any) => {
            const noRecibido = it.received === false;
            const parcial = it.received !== false && it.received_qty != null && Number(it.received_qty) !== Number(it.quantity);
            if (noRecibido || parcial) {
              if (!sf[it.order_id]) sf[it.order_id] = [];
              sf[it.order_id].push({
                name: it.item_name,
                detail: noRecibido ? `no recibido${it.reception_note ? ` (${it.reception_note})` : ''}` : `parcial: ${it.received_qty}${it.reception_note ? ` (${it.reception_note})` : ''}`
              });
            }
          });
          setShortfalls(sf);
        } else {
          setShortfalls({});
        }
      }
    } catch (e) { console.error('Error cargando pedidos:', e); }
  };

  useEffect(() => { loadRecentOrders(); }, [selectedBranchId]);

  // Pedidos activos (en circuito) y cerrados (ya recibidos)
  const activeOrders = recentOrders.filter(o => o.status !== 'recibido');
  const closedOrders = recentOrders.filter(o => o.status === 'recibido');

  // Trae las líneas de un pedido guardado
  const fetchOrderLines = async (orderId: string) => {
    const { data } = await supabase
      .from('internal_order_items')
      .select('*')
      .eq('order_id', orderId);
    return (data || []).map((d: any) => ({
      category: d.category || 'SIN CATEGORÍA',
      code: d.code || '',
      itemName: d.item_name,
      unit: d.unit || '',
      quantity: Number(d.quantity) || 0,
      observations: d.observations || '',
      received: d.received,
      receivedQty: d.received_qty != null ? Number(d.received_qty) : null,
      receptionNote: d.reception_note || ''
    }));
  };

  // Volver a descargar el PDF de un pedido guardado
  const redownloadOrder = async (o: SavedOrder) => {
    const pdfLines = await fetchOrderLines(o.id);
    if (pdfLines.length === 0) { alert('Este pedido no tiene insumos cargados.'); return; }
    generatePDF({
      type: o.order_type,
      branch: branches.find(b => b.id === o.branch_id)?.name || branchName,
      orderDate: o.order_date,
      deliv: o.delivery_date,
      by: o.created_by,
      pdfLines,
      generalNotes: o.notes
    });
  };

  // Ver detalle de un pedido en un modal
  const viewOrder = async (o: SavedOrder) => {
    const detail = await fetchOrderLines(o.id);
    setViewingOrder({ order: o, lines: detail });
  };

  // Eliminar un pedido (cabecera + líneas)
  const deleteOrder = async (o: SavedOrder) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés eliminar pedidos.'); return; }
    if (!window.confirm(`¿Eliminar el pedido de ${o.order_type === 'compras' ? 'Compras' : 'Producción'} del ${fmtDMY(o.order_date)}? Esta acción no se puede deshacer.`)) return;
    try {
      await supabase.from('internal_order_items').delete().eq('order_id', o.id);
      const { error } = await supabase.from('internal_orders').delete().eq('id', o.id);
      if (error) throw error;
      await loadRecentOrders();
      if (viewingOrder?.order.id === o.id) setViewingOrder(null);
    } catch (e: any) {
      alert('Error al eliminar el pedido: ' + (e.message || e));
    }
  };

  // Abrir el modal de recepción ítem por ítem (paso a "Recibido")
  const openReception = async (o: SavedOrder) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    const { data } = await supabase.from('internal_order_items').select('*').eq('order_id', o.id);
    const lines = (data || []).map((d: any) => ({
      id: d.id,
      itemName: d.item_name,
      code: d.code || '',
      category: d.category || 'SIN CATEGORÍA',
      unit: d.unit || '',
      quantity: Number(d.quantity) || 0,
      unitCost: Number(d.unit_cost) || 0,
      received: d.received ?? true,                       // por defecto se asume recibido
      receivedQty: d.received_qty != null ? Number(d.received_qty) : Number(d.quantity) || 0,
      receptionNote: d.reception_note || ''
    }));
    setReceptionLines(lines);
    setReceivingOrder(o);
  };

  const updateReceptionLine = (id: string, field: string, value: any) => {
    setReceptionLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const next = { ...l, [field]: value };
      // Si se destilda "recibido", la cantidad recibida pasa a 0
      if (field === 'received' && value === false) next.receivedQty = 0;
      // Si se vuelve a tildar, restablece la cantidad pedida
      if (field === 'received' && value === true) next.receivedQty = l.quantity;
      return next;
    }));
  };

  const markAllReceived = () => {
    setReceptionLines(prev => prev.map(l => ({ ...l, received: true, receivedQty: l.quantity })));
  };

  const saveReception = async () => {
    if (!receivingOrder) return;
    setSavingReception(true);
    try {
      // RED DE SEGURIDAD: si un ítem quedó sin precio (unit_cost = 0) pero el insumo SÍ tiene
      // precio en el maestro, lo completamos al recibir. Evita que el gasto quede subestimado
      // por pedidos creados cuando el maestro no tenía el precio cargado.
      const norm = (s: string) => String(s || '').trim().toUpperCase();
      const precioMaestro = new Map<string, number>();
      (items || []).forEach((it: any) => {
        const c = Number(it.cost) || 0;
        if (c > 0) precioMaestro.set(norm(it.name), c);
      });

      let completados = 0;

      // Actualizar cada ítem con su estado de recepción
      for (const l of receptionLines) {
        const payload: any = {
          received: l.received,
          received_qty: l.received ? l.receivedQty : 0,
          reception_note: l.receptionNote || null
        };
        // Si no tiene precio congelado pero el maestro sí lo tiene, lo completamos
        if (!(Number(l.unitCost) > 0)) {
          const p = precioMaestro.get(norm(l.itemName));
          if (p && p > 0) {
            payload.unit_cost = p;
            completados++;
          }
        }
        await supabase.from('internal_order_items').update(payload).eq('id', l.id);
      }

      // Marcar el pedido como recibido
      const { error } = await supabase.from('internal_orders')
        .update({ status: 'recibido', received_at: new Date().toISOString() })
        .eq('id', receivingOrder.id);
      if (error) throw error;
      setReceivingOrder(null);
      setReceptionLines([]);
      await loadRecentOrders();
      alert(
        'Pedido marcado como recibido.' +
        (completados > 0 ? `\n\nSe completó el precio de ${completados} insumo(s) que no lo tenían, tomándolo del maestro.` : '')
      );
    } catch (e: any) {
      alert('Error al guardar la recepción: ' + (e.message || e));
    } finally {
      setSavingReception(false);
    }
  };

  const addItem = (item: StockItem) => {
    setLines(prev => [...prev, {
      itemId: item.id,
      itemName: item.name,
      code: item.code || '',
      category: item.category || 'SIN CATEGORÍA',
      unit: item.unit || '',
      quantity: 1,
      unitCost: Number((item as any).cost) || 0,
      observations: ''
    }]);
  };

  // Total valorizado del pedido en curso
  const orderTotal = lines.reduce((acc, l) => acc + (Number(l.unitCost) || 0) * (Number(l.quantity) || 0), 0);
  const fmtMoney = (n: number) => '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const updateLine = (itemId: string, field: 'quantity' | 'observations', value: any) => {
    setLines(prev => prev.map(l => l.itemId === itemId ? { ...l, [field]: value } : l));
  };

  const removeLine = (itemId: string) => {
    setLines(prev => prev.filter(l => l.itemId !== itemId));
  };

  const generatePDF = (params: {
    type: string;
    branch: string;
    orderDate: string;
    deliv: string;
    by?: string | null;
    pdfLines: { code: string; category: string; itemName: string; unit: string; quantity: number; observations: string }[];
    generalNotes?: string | null;
  }) => {
    const doc = new jsPDF();
    const typeLabel = params.type === 'compras' ? 'PEDIDO DE COMPRAS' : 'PEDIDO A PRODUCCIÓN';

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('CRAFT', 14, 18);
    doc.setFontSize(13);
    doc.text(typeLabel, 14, 27);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Sucursal: ${params.branch}`, 14, 37);
    doc.text(`Fecha de pedido: ${fmtDMY(params.orderDate)}`, 14, 43);
    doc.text(`Fecha de entrega: ${fmtDMY(params.deliv)}`, 14, 49);
    if (params.by) doc.text(`Cargado por: ${params.by}`, 14, 55);

    const body = params.pdfLines.map(l => [
      l.category,
      l.code || '-',
      l.itemName,
      l.unit,
      String(l.quantity),
      l.observations || '-'
    ]);

    autoTable(doc, {
      startY: 62,
      head: [['Categoría', 'Código', 'Insumo', 'Unidad', 'Cantidad', 'Observaciones']],
      body,
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] }
    });

    if (params.generalNotes && params.generalNotes.trim()) {
      const finalY = (doc as any).lastAutoTable.finalY || 62;
      doc.setFontSize(9);
      doc.text(`Observaciones generales: ${params.generalNotes.trim()}`, 14, finalY + 10);
    }

    const fileName = `${params.type}_${params.branch.replace(/\s+/g, '_')}_${params.orderDate}.pdf`;
    doc.save(fileName);
  };

  const handleSave = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés cargar pedidos.'); return; }
    if (!selectedBranchId || selectedBranchId === 'all') { alert('Seleccioná una sucursal para cargar el pedido.'); return; }
    const activeSameType = activeOrders.filter(o => o.type === orderType);
    if (activeSameType.length >= 2) {
      const tipoLabel = orderType === 'compras' ? 'Compras' : 'Producción';
      alert(`Ya tenés ${activeSameType.length} pedidos de ${tipoLabel} sin recibir.\n\nPara no acumular pedidos, primero marcá como RECIBIDOS los pedidos de ${tipoLabel} pendientes de esta sucursal y volvé a intentar.`);
      return;
    }
    if (orderDateISO > todayISO) { alert('La fecha del pedido no puede ser hacia adelante. Elegí hoy o un día anterior.'); return; }
    if (isSaturday) { alert('Los sábados no se cargan pedidos (el domingo no se trabaja en Almacén).'); return; }
    if (lines.length === 0) { alert('Agregá al menos un insumo al pedido.'); return; }
    if (lines.some(l => !l.quantity || l.quantity <= 0)) { alert('Todas las cantidades deben ser mayores a cero.'); return; }
    // Aviso preventivo: insumos sin precio en el maestro (el pedido no se va a poder valorizar bien)
    const sinPrecio = lines.filter(l => !(Number(l.unitCost) > 0));
    if (sinPrecio.length > 0) {
      const nombres = sinPrecio.slice(0, 5).map(l => `• ${l.itemName}`).join('\n');
      const ok = window.confirm(
        `Atención: ${sinPrecio.length} insumo(s) no tienen precio cargado en el maestro:\n\n` +
        `${nombres}${sinPrecio.length > 5 ? `\n… y ${sinPrecio.length - 5} más` : ''}\n\n` +
        `El pedido se puede generar igual, pero esos insumos no van a sumar al gasto hasta que cargues su precio en Maestros.\n\n` +
        `¿Generar el pedido de todas formas?`
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      const { data: order, error: orderErr } = await supabase
        .from('internal_orders')
        .insert({
          branch_id: selectedBranchId,
          order_type: orderType,
          order_date: orderDateISO,
          delivery_date: deliveryISO,
          created_by: currentUser?.name || currentUser?.username || null,
          notes: notes.trim() || null,
          status: 'pendiente',
          // Horario real de carga (independiente de la fecha del pedido elegida)
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      if (orderErr) throw orderErr;

      const itemsToInsert = lines.map(l => ({
        order_id: order.id,
        item_id: l.itemId,
        item_name: l.itemName,
        code: l.code || null,
        category: l.category,
        unit: l.unit,
        quantity: l.quantity,
        unit_cost: Number(l.unitCost) || 0,
        observations: l.observations || null
      }));
      const { error: itemsErr } = await supabase.from('internal_order_items').insert(itemsToInsert);
      if (itemsErr) throw itemsErr;

      // Generar PDF y limpiar
      generatePDF({
        type: orderType,
        branch: branchName,
        orderDate: orderDateISO,
        deliv: deliveryISO,
        by: currentUser?.name || currentUser?.username || null,
        pdfLines: lines,
        generalNotes: notes
      });
      alert('Pedido guardado y PDF generado correctamente.');
      setLines([]);
      setNotes('');
      setOrderDateISO(todayISO);
      await loadRecentOrders();
    } catch (e: any) {
      alert('Error al guardar el pedido: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  if (!selectedBranchId || selectedBranchId === 'all') {
    return (
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-8 text-center">
        <p className="text-[11px] font-black uppercase tracking-widest text-text-dim">Seleccioná una sucursal para cargar pedidos internos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {showAnalytics ? (
        <InternalOrdersAnalyticsView branches={branches} onBack={() => setShowAnalytics(false)} />
      ) : (
      <>
      {/* Encabezado */}
      <div className="bg-bg-card border border-border-dim rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-3">
            <ShoppingCart size={20} className="text-brand-500" />
            <h2 className="text-base font-black uppercase text-text-main tracking-wide">Pedidos Internos</h2>
          </div>
          <button onClick={() => setShowAnalytics(true)}
            className="flex items-center gap-2 bg-brand-500 text-black px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-lg">
            <BarChart3 size={14} /> Análisis de Pedidos
          </button>
        </div>
        <p className="text-[10px] text-text-dim font-bold uppercase">
          {branchName} · Pedido del {fmtDMY(orderDateISO)} para entregar el {fmtDMY(deliveryISO)}
        </p>
      </div>

      {/* Aviso de pedidos pendientes del mismo tipo */}
      {activeOrders.filter(o => o.type === orderType).length > 0 && (() => {
        const n = activeOrders.filter(o => o.type === orderType).length;
        const tipoLabel = orderType === 'compras' ? 'Compras' : 'Producción';
        const bloqueado = n >= 2;
        return (
          <div className={cn("border rounded-xl p-4", bloqueado ? "bg-red-500/10 border-red-500/40" : "bg-amber-500/10 border-amber-500/40")}>
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className={cn("shrink-0", bloqueado ? "text-red-500" : "text-amber-500")} />
              <p className={cn("text-[11px] font-black uppercase tracking-widest", bloqueado ? "text-red-600" : "text-amber-600")}>
                Tenés {n} pedido(s) de {tipoLabel} sin recibir
              </p>
            </div>
            <p className="text-[10px] font-bold text-text-dim mt-1">
              {bloqueado
                ? `No podés generar otro pedido de ${tipoLabel} hasta recibir alguno. Marcá como RECIBIDOS los pendientes en "Pedidos en curso".`
                : `Podés generar un pedido complementario de ${tipoLabel} si te olvidaste algo. Recordá marcar como recibidos los pendientes cuando lleguen.`}
            </p>
          </div>
        );
      })()}

      {/* Alerta de faltantes en pedidos recibidos */}
      {Object.keys(shortfalls).length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-red-500 shrink-0" />
            <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">
              {Object.keys(shortfalls).length} pedido(s) con faltantes
            </p>
          </div>
          <div className="space-y-1.5">
            {closedOrders.filter(o => shortfalls[o.id]).map(o => (
              <button key={o.id} onClick={() => viewOrder(o)}
                className="w-full text-left bg-bg-card border border-red-500/20 rounded-lg px-3 py-2 hover:border-red-500/50 transition-all">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-black text-text-main uppercase">
                    {o.order_type === 'compras' ? 'Compras' : 'Producción'} · {fmtDMY(o.order_date)}
                  </span>
                  <span className="text-[8px] font-black text-red-500 uppercase">Ver detalle →</span>
                </div>
                <p className="text-[9px] text-text-dim font-bold mt-1">
                  {shortfalls[o.id].map(s => `${s.name} (${s.detail})`).join(' · ')}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Aviso de sábado */}
      {isSaturday && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide leading-relaxed">
            Hoy es sábado: no se cargan pedidos porque el domingo no se trabaja en Almacén y Producción.
          </p>
        </div>
      )}

      {/* Pedidos activos (en circuito) — arriba, antes de cargar uno nuevo */}
      {activeOrders.length > 0 && (
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <History size={15} className="text-brand-500" />
            <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest">Pedidos en curso</h3>
          </div>
          <div className="space-y-1.5">
            {activeOrders.map(o => (
              <div key={o.id} className="flex items-center justify-between gap-2 p-2.5 bg-bg-accent/30 rounded border border-border-dim text-[9px]">
                <span className={cn("font-black uppercase px-2 py-0.5 rounded shrink-0", o.order_type === 'compras' ? "bg-brand-500/10 text-brand-500" : "bg-teal-500/10 text-teal-500")}>
                  {o.order_type === 'compras' ? 'Compras' : 'Producción'}
                </span>
                <span className={cn("font-black uppercase px-2 py-0.5 rounded shrink-0", statusInfo(o.status).color)}>
                  {statusInfo(o.status).label}
                </span>
                <div className="flex-1 min-w-0 hidden md:block">
                  <span className="text-text-dim font-bold uppercase truncate block">Pedido {fmtDMY(o.order_date)} → entrega {fmtDMY(o.delivery_date)}</span>
                  {o.created_at && (
                    <span className="text-[8px] font-bold uppercase text-text-dim opacity-60 block">Cargado el {fmtCargado(o.created_at)}</span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!isReadOnly && o.status === 'enviado' && (
                    <button onClick={() => openReception(o)} title="Marcar recibido" className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 rounded text-[8px] font-black uppercase hover:bg-emerald-500/20 transition-all">
                      <PackageCheck size={12} /> Recibir
                    </button>
                  )}
                  <button onClick={() => viewOrder(o)} title="Ver detalle" className="p-1.5 text-text-dim hover:text-brand-500 transition-colors"><Eye size={14} /></button>
                  <button onClick={() => redownloadOrder(o)} title="Descargar PDF" className="p-1.5 text-text-dim hover:text-emerald-500 transition-colors"><FileDown size={14} /></button>
                  {!isReadOnly && <button onClick={() => deleteOrder(o)} title="Eliminar" className="p-1.5 text-text-dim hover:text-red-500 transition-colors"><Trash2 size={14} /></button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selector de tipo de pedido + fecha del pedido */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <label className="text-[10px] font-black text-text-dim uppercase tracking-widest block mb-2">Tipo de Pedido</label>
          <select
            value={orderType}
            onChange={e => {
              const nuevo = e.target.value as 'compras' | 'produccion';
              if (nuevo === orderType) return;
              // Los artículos vienen de maestros distintos según el tipo, así que al
              // cambiar de tipo vaciamos el pedido en curso para no mezclar fuentes.
              if (lines.length > 0 && !window.confirm('Al cambiar el tipo de pedido se vacía lo que cargaste hasta ahora (los artículos son de maestros distintos). ¿Continuar?')) return;
              setOrderType(nuevo);
              setLines([]);
              setCategoryFilter('all');
              setItemSearch('');
            }}
            className={cn(
              "w-full bg-bg-card border rounded-lg px-4 py-3 text-[12px] font-black uppercase tracking-wide outline-none transition-all cursor-pointer",
              orderType === 'compras' ? "border-brand-500 text-brand-500 focus:border-brand-500" : "border-teal-500 text-teal-500 focus:border-teal-500"
            )}
          >
            <option value="compras">Pedido de Compras (Almacén Central)</option>
            <option value="produccion">Pedido a Producción (Elaborados)</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-black text-text-dim uppercase tracking-widest block mb-2">Fecha del pedido</label>
          <input
            type="date"
            value={orderDateISO}
            max={todayISO}
            onChange={e => {
              const v = e.target.value || todayISO;
              // No se permite una fecha hacia adelante: como máximo, hoy.
              setOrderDateISO(v > todayISO ? todayISO : v);
            }}
            className="w-full bg-bg-card border border-border-dim rounded-lg px-4 py-3 text-[12px] font-mono font-black text-text-main outline-none transition-all focus:border-brand-500 cursor-pointer"
          />
          <p className="text-[8px] font-bold uppercase text-text-dim opacity-70 mt-1 leading-tight">
            Ajustala si cargás pasada la medianoche (no se puede a futuro). Entrega: {fmtDMY(deliveryISO)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Columna izquierda: selección de insumos */}
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 space-y-3">
          <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest">Agregar insumos</h3>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none focus:border-brand-500 font-black uppercase"
          >
            <option value="all">Todas las categorías</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
            <input
              value={itemSearch}
              onChange={e => setItemSearch(e.target.value)}
              placeholder="Buscar insumo..."
              className="w-full bg-bg-card border border-border-dim rounded pl-9 pr-3 py-2 text-[10px] text-text-main outline-none focus:border-brand-500 uppercase font-bold"
            />
          </div>
          <div className="space-y-1.5 max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
            {availableItems.map(item => (
              <button
                key={item.id}
                onClick={() => addItem(item)}
                className="w-full flex items-center justify-between p-2.5 bg-bg-accent/40 rounded border border-border-dim hover:border-brand-500/40 transition-all text-left group"
              >
                <div>
                  <p className="text-[10px] font-black text-text-main uppercase">
                    {item.code ? <span className="text-brand-500 mr-1">{item.code}</span> : ''}{item.name}
                  </p>
                  <p className="text-[8px] text-text-dim font-bold uppercase">
                    {item.category || 'SIN CATEGORÍA'} · {item.unit}
                    {Number((item as any).cost) > 0 && (
                      <span className="text-emerald-600 ml-1">· {fmtMoney(Number((item as any).cost))}/{item.unit}</span>
                    )}
                  </p>
                </div>
                <Plus size={14} className="text-text-dim group-hover:text-brand-500" />
              </button>
            ))}
            {availableItems.length === 0 && (
              <p className="text-[9px] text-text-dim italic uppercase text-center py-4">No hay insumos para mostrar.</p>
            )}
          </div>
        </div>

        {/* Columna derecha: pedido actual */}
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 space-y-3">
          <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest">Pedido actual ({lines.length})</h3>
          <div className="space-y-2 max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
            {lines.map(l => (
              <div key={l.itemId} className="p-3 bg-bg-accent/40 rounded border border-border-dim space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-text-main uppercase">
                      {l.code ? <span className="text-brand-500 mr-1">{l.code}</span> : ''}{l.itemName}
                    </p>
                    <p className="text-[8px] text-text-dim font-bold uppercase">
                      {l.category} · {l.unit}
                      {Number(l.unitCost) > 0
                        ? <span className="text-emerald-600 ml-1">· {fmtMoney(Number(l.unitCost))}/{l.unit}</span>
                        : <span className="text-amber-500 ml-1">· sin precio en maestro</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {Number(l.unitCost) > 0 && Number(l.quantity) > 0 && (
                      <span className="text-[10px] font-mono font-black text-text-main">
                        {fmtMoney(Number(l.unitCost) * Number(l.quantity))}
                      </span>
                    )}
                    <button onClick={() => removeLine(l.itemId)} className="p-1.5 text-text-dim hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="w-24">
                    <label className="text-[7px] font-black text-text-dim uppercase block mb-0.5">Cantidad ({l.unit})</label>
                    <input
                      type="number"
                      value={l.quantity || ''}
                      onChange={e => updateLine(l.itemId, 'quantity', parseFloat(e.target.value) || 0)}
                      className="w-full bg-bg-card border border-border-dim rounded px-2 py-1 text-[10px] font-mono font-black text-text-main outline-none focus:border-brand-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[7px] font-black text-text-dim uppercase block mb-0.5">Observaciones</label>
                    <input
                      value={l.observations}
                      onChange={e => updateLine(l.itemId, 'observations', e.target.value)}
                      placeholder="Opcional..."
                      className="w-full bg-bg-card border border-border-dim rounded px-2 py-1 text-[10px] text-text-main outline-none focus:border-brand-500"
                    />
                  </div>
                </div>
              </div>
            ))}
            {lines.length === 0 && (
              <p className="text-[9px] text-text-dim italic uppercase text-center py-8">Agregá insumos desde la columna izquierda.</p>
            )}
          </div>

          {lines.length > 0 && (
            <div className="bg-brand-500/10 border border-brand-500/30 rounded-lg px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black uppercase text-text-dim tracking-widest">Total del pedido</p>
                {lines.some(l => !Number(l.unitCost)) && (
                  <p className="text-[7px] font-bold uppercase text-amber-500 mt-0.5">Hay insumos sin precio cargado en el maestro</p>
                )}
              </div>
              <span className="text-lg font-mono font-black text-brand-500">{fmtMoney(orderTotal)}</span>
            </div>
          )}

          <div>
            <label className="text-[8px] font-black text-text-dim uppercase block mb-1">Observaciones generales del pedido</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Opcional..."
              className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none focus:border-brand-500 resize-none"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving || isSaturday || lines.length === 0}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all",
              (saving || isSaturday || lines.length === 0)
                ? "bg-bg-accent text-text-dim cursor-not-allowed"
                : "bg-brand-500 text-white hover:bg-brand-600 shadow-lg"
            )}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <><Save size={16} /> Guardar y generar PDF</>}
          </button>
        </div>
      </div>

      {/* Pedidos cerrados (ya recibidos por la sucursal) */}
      {closedOrders.length > 0 && (
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <PackageCheck size={15} className="text-emerald-500" />
            <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest">Pedidos cerrados</h3>
            <span className="text-[8px] font-bold text-text-dim uppercase">(recibidos)</span>
          </div>
          <div className="space-y-1.5">
            {closedOrders.map(o => (
              <div key={o.id} className="flex items-center justify-between gap-2 p-2.5 bg-bg-accent/30 rounded border border-border-dim text-[9px]">
                <span className={cn("font-black uppercase px-2 py-0.5 rounded shrink-0", o.order_type === 'compras' ? "bg-brand-500/10 text-brand-500" : "bg-teal-500/10 text-teal-500")}>
                  {o.order_type === 'compras' ? 'Compras' : 'Producción'}
                </span>
                <span className={cn("font-black uppercase px-2 py-0.5 rounded shrink-0", statusInfo(o.status).color)}>
                  {statusInfo(o.status).label}
                </span>
                <div className="flex-1 min-w-0 hidden md:block">
                  <span className="text-text-dim font-bold uppercase truncate block">Pedido {fmtDMY(o.order_date)} → entrega {fmtDMY(o.delivery_date)}</span>
                  {o.created_at && (
                    <span className="text-[8px] font-bold uppercase text-text-dim opacity-60 block">Cargado el {fmtCargado(o.created_at)}</span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => viewOrder(o)} title="Ver detalle y recepción" className="p-1.5 text-text-dim hover:text-brand-500 transition-colors"><Eye size={14} /></button>
                  <button onClick={() => redownloadOrder(o)} title="Descargar PDF" className="p-1.5 text-text-dim hover:text-emerald-500 transition-colors"><FileDown size={14} /></button>
                  {!isReadOnly && <button onClick={() => deleteOrder(o)} title="Eliminar" className="p-1.5 text-text-dim hover:text-red-500 transition-colors"><Trash2 size={14} /></button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de detalle del pedido */}
      {viewingOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setViewingOrder(null)}>
          <div className="bg-bg-card border border-border-dim rounded-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border-dim">
              <div>
                <h3 className="text-sm font-black uppercase text-text-main tracking-wide">
                  {viewingOrder.order.order_type === 'compras' ? 'Pedido de Compras' : 'Pedido a Producción'}
                </h3>
                <p className="text-[9px] text-text-dim font-bold uppercase mt-0.5">
                  {branches.find(b => b.id === viewingOrder.order.branch_id)?.name || ''} · Pedido {fmtDMY(viewingOrder.order.order_date)} → entrega {fmtDMY(viewingOrder.order.delivery_date)}
                  {viewingOrder.order.created_by ? ` · ${viewingOrder.order.created_by}` : ''}
                </p>
                {viewingOrder.order.created_at && (
                  <p className="text-[8px] text-text-dim font-bold uppercase opacity-60 mt-0.5">Cargado el {fmtCargado(viewingOrder.order.created_at)}</p>
                )}
              </div>
              <button onClick={() => setViewingOrder(null)} className="p-1.5 text-text-dim hover:text-text-main transition-colors"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto custom-scrollbar">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-text-dim uppercase font-black border-b border-border-dim">
                    <th className="text-left py-2">Categoría</th>
                    <th className="text-left py-2">Código</th>
                    <th className="text-left py-2">Insumo</th>
                    <th className="text-center py-2">Unidad</th>
                    <th className="text-right py-2">Cantidad</th>
                    <th className="text-left py-2 pl-3">Observaciones</th>
                    {viewingOrder.order.status === 'recibido' && <th className="text-left py-2 pl-3">Recepción</th>}
                  </tr>
                </thead>
                <tbody>
                  {viewingOrder.lines.map((l, i) => (
                    <tr key={i} className="border-b border-border-dim/30">
                      <td className="py-1.5 text-text-dim uppercase">{l.category}</td>
                      <td className="py-1.5 font-mono text-brand-500 uppercase">{l.code || '-'}</td>
                      <td className="py-1.5 font-black text-text-main uppercase">{l.itemName}</td>
                      <td className="py-1.5 text-center text-text-dim uppercase">{l.unit}</td>
                      <td className="py-1.5 text-right font-mono font-black text-text-main">{l.quantity}</td>
                      <td className="py-1.5 pl-3 text-text-dim">{l.observations || '-'}</td>
                      {viewingOrder.order.status === 'recibido' && (
                        <td className="py-1.5 pl-3">
                          {l.received === false ? (
                            <span className="text-red-500 font-black uppercase text-[9px]">No recibido{l.receptionNote ? ` · ${l.receptionNote}` : ''}</span>
                          ) : l.receivedQty != null && l.receivedQty !== l.quantity ? (
                            <span className="text-amber-500 font-black uppercase text-[9px]">Parcial: {l.receivedQty}{l.receptionNote ? ` · ${l.receptionNote}` : ''}</span>
                          ) : (
                            <span className="text-emerald-500 font-black uppercase text-[9px]">OK</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {viewingOrder.order.notes && (
                <p className="text-[9px] text-text-dim font-bold uppercase mt-4 pt-3 border-t border-border-dim">
                  Observaciones generales: <span className="text-text-main">{viewingOrder.order.notes}</span>
                </p>
              )}
            </div>
            <div className="p-4 border-t border-border-dim flex gap-2 justify-end">
              <button onClick={() => redownloadOrder(viewingOrder.order)} className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all">
                <FileDown size={14} /> Descargar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de recepción ítem por ítem */}
      {receivingOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !savingReception && setReceivingOrder(null)}>
          <div className="bg-bg-card border border-border-dim rounded-xl max-w-2xl w-full max-h-[88vh] overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border-dim">
              <div>
                <h3 className="text-sm font-black uppercase text-text-main tracking-wide">Recepción del pedido</h3>
                <p className="text-[9px] text-text-dim font-bold uppercase mt-0.5">
                  Marcá lo que recibiste. Si llegó menos, ajustá la cantidad y dejá una nota.
                </p>
              </div>
              <button onClick={() => setReceivingOrder(null)} className="p-1.5 text-text-dim hover:text-text-main transition-colors"><X size={18} /></button>
            </div>

            <div className="px-5 py-3 border-b border-border-dim">
              <button onClick={markAllReceived} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 rounded text-[9px] font-black uppercase hover:bg-emerald-500/20 transition-all">
                <PackageCheck size={13} /> Marcar todos como recibidos
              </button>
            </div>

            <div className="p-5 overflow-y-auto custom-scrollbar space-y-2">
              {receptionLines.map(l => (
                <div key={l.id} className={cn("p-3 rounded border transition-all", l.received ? "bg-bg-accent/30 border-border-dim" : "bg-red-500/5 border-red-500/30")}>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={l.received} onChange={e => updateReceptionLine(l.id, 'received', e.target.checked)}
                      className="w-4 h-4 accent-emerald-500 cursor-pointer shrink-0" />
                    <div className="flex-1">
                      <p className="text-[10px] font-black text-text-main uppercase">
                        {l.code ? <span className="text-brand-500 mr-1">{l.code}</span> : ''}{l.itemName}
                      </p>
                      <p className="text-[8px] text-text-dim font-bold uppercase">{l.category} · pidió {l.quantity} {l.unit}</p>
                    </div>
                    {l.received && (
                      <div className="w-24 shrink-0">
                        <label className="text-[7px] font-black text-text-dim uppercase block mb-0.5">Cant. recibida</label>
                        <input type="number" value={l.receivedQty} onChange={e => updateReceptionLine(l.id, 'receivedQty', parseFloat(e.target.value) || 0)}
                          className="w-full bg-bg-card border border-border-dim rounded px-2 py-1 text-[10px] font-mono font-black text-text-main outline-none focus:border-emerald-500" />
                      </div>
                    )}
                  </div>
                  {/* Nota por ítem: visible si no se recibió o si la cantidad difiere */}
                  {(!l.received || l.receivedQty !== l.quantity) && (
                    <input value={l.receptionNote} onChange={e => updateReceptionLine(l.id, 'receptionNote', e.target.value)}
                      placeholder={l.received ? "Nota (ej. llegó menos, vino machucada...)" : "Nota (ej. no llegó)"}
                      className="w-full mt-2 bg-bg-card border border-border-dim rounded px-2 py-1.5 text-[9px] text-text-main outline-none focus:border-brand-500" />
                  )}
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-border-dim flex gap-2 justify-end">
              <button onClick={() => setReceivingOrder(null)} disabled={savingReception}
                className="px-4 py-2 bg-bg-accent text-text-dim rounded-lg text-[10px] font-black uppercase tracking-widest hover:text-text-main transition-all">
                Cancelar
              </button>
              <button onClick={saveReception} disabled={savingReception}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all disabled:opacity-60">
                {savingReception ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />} Confirmar recepción
              </button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
