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
import { ShoppingCart, Factory, FileDown, Plus, Trash2, Save, Loader2, Search, AlertTriangle, History } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';
import { Branch, StockItem } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface OrderLine {
  itemId: string;
  itemName: string;
  category: string;
  unit: string;
  quantity: number;
  observations: string;
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
}

// Helper de fecha local (evita corrimiento por UTC)
const toLocalISO = (d: Date) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtDMY = (iso: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
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
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [itemSearch, setItemSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [recentOrders, setRecentOrders] = useState<SavedOrder[]>([]);

  // Fecha de hoy y de entrega (día siguiente)
  const today = new Date();
  const todayISO = toLocalISO(today);
  const deliveryDate = new Date(today);
  deliveryDate.setDate(deliveryDate.getDate() + 1);
  const deliveryISO = toLocalISO(deliveryDate);

  // ¿Hoy es sábado? (getDay: 0=domingo, 6=sábado). El sábado no se hacen pedidos.
  const isSaturday = today.getDay() === 6;

  const branchName = branches.find(b => b.id === selectedBranchId)?.name || 'Sucursal';

  // Categorías disponibles del Maestro de Insumos
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => { if (i.category) set.add(i.category); });
    return Array.from(set).sort();
  }, [items]);

  // Insumos filtrados por categoría y búsqueda (que aún no estén en el pedido)
  const availableItems = useMemo(() => {
    const inOrder = new Set(lines.map(l => l.itemId));
    return items.filter(i => {
      if (inOrder.has(i.id)) return false;
      if (categoryFilter !== 'all' && (i.category || '') !== categoryFilter) return false;
      if (itemSearch && !i.name.toLowerCase().includes(itemSearch.toLowerCase())) return false;
      return true;
    });
  }, [items, lines, categoryFilter, itemSearch]);

  const loadRecentOrders = async () => {
    if (!selectedBranchId || selectedBranchId === 'all') { setRecentOrders([]); return; }
    try {
      const { data } = await supabase
        .from('internal_orders')
        .select('*')
        .eq('branch_id', selectedBranchId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) setRecentOrders(data);
    } catch (e) { console.error('Error cargando pedidos:', e); }
  };

  useEffect(() => { loadRecentOrders(); }, [selectedBranchId]);

  const addItem = (item: StockItem) => {
    setLines(prev => [...prev, {
      itemId: item.id,
      itemName: item.name,
      category: item.category || 'SIN CATEGORÍA',
      unit: item.unit || '',
      quantity: 1,
      observations: ''
    }]);
  };

  const updateLine = (itemId: string, field: 'quantity' | 'observations', value: any) => {
    setLines(prev => prev.map(l => l.itemId === itemId ? { ...l, [field]: value } : l));
  };

  const removeLine = (itemId: string) => {
    setLines(prev => prev.filter(l => l.itemId !== itemId));
  };

  const generatePDF = (orderDate: string, deliv: string) => {
    const doc = new jsPDF();
    const typeLabel = orderType === 'compras' ? 'PEDIDO DE COMPRAS' : 'PEDIDO A PRODUCCIÓN';

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('CRAFT', 14, 18);
    doc.setFontSize(13);
    doc.text(typeLabel, 14, 27);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Sucursal: ${branchName}`, 14, 37);
    doc.text(`Fecha de pedido: ${fmtDMY(orderDate)}`, 14, 43);
    doc.text(`Fecha de entrega: ${fmtDMY(deliv)}`, 14, 49);
    if (currentUser?.name) doc.text(`Cargado por: ${currentUser.name}`, 14, 55);

    const body = lines.map(l => [
      l.category,
      l.itemName,
      l.unit,
      String(l.quantity),
      l.observations || '-'
    ]);

    autoTable(doc, {
      startY: 62,
      head: [['Categoría', 'Insumo', 'Unidad', 'Cantidad', 'Observaciones']],
      body,
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] }
    });

    if (notes.trim()) {
      const finalY = (doc as any).lastAutoTable.finalY || 62;
      doc.setFontSize(9);
      doc.text(`Observaciones generales: ${notes.trim()}`, 14, finalY + 10);
    }

    const fileName = `${orderType}_${branchName.replace(/\s+/g, '_')}_${orderDate}.pdf`;
    doc.save(fileName);
  };

  const handleSave = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés cargar pedidos.'); return; }
    if (!selectedBranchId || selectedBranchId === 'all') { alert('Seleccioná una sucursal para cargar el pedido.'); return; }
    if (isSaturday) { alert('Los sábados no se cargan pedidos (el domingo no se trabaja en Almacén).'); return; }
    if (lines.length === 0) { alert('Agregá al menos un insumo al pedido.'); return; }
    if (lines.some(l => !l.quantity || l.quantity <= 0)) { alert('Todas las cantidades deben ser mayores a cero.'); return; }

    setSaving(true);
    try {
      const { data: order, error: orderErr } = await supabase
        .from('internal_orders')
        .insert({
          branch_id: selectedBranchId,
          order_type: orderType,
          order_date: todayISO,
          delivery_date: deliveryISO,
          created_by: currentUser?.name || currentUser?.username || null,
          notes: notes.trim() || null
        })
        .select()
        .single();
      if (orderErr) throw orderErr;

      const itemsToInsert = lines.map(l => ({
        order_id: order.id,
        item_id: l.itemId,
        item_name: l.itemName,
        category: l.category,
        unit: l.unit,
        quantity: l.quantity,
        observations: l.observations || null
      }));
      const { error: itemsErr } = await supabase.from('internal_order_items').insert(itemsToInsert);
      if (itemsErr) throw itemsErr;

      // Generar PDF y limpiar
      generatePDF(todayISO, deliveryISO);
      alert('Pedido guardado y PDF generado correctamente.');
      setLines([]);
      setNotes('');
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
      {/* Encabezado */}
      <div className="bg-bg-card border border-border-dim rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-1">
          <ShoppingCart size={20} className="text-brand-500" />
          <h2 className="text-base font-black uppercase text-text-main tracking-wide">Pedidos Internos</h2>
        </div>
        <p className="text-[10px] text-text-dim font-bold uppercase">
          {branchName} · Pedido del {fmtDMY(todayISO)} para entregar el {fmtDMY(deliveryISO)}
        </p>
      </div>

      {/* Aviso de sábado */}
      {isSaturday && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide leading-relaxed">
            Hoy es sábado: no se cargan pedidos porque el domingo no se trabaja en Almacén y Producción.
          </p>
        </div>
      )}

      {/* Selector de tipo de pedido */}
      <div className="flex gap-3">
        <button
          onClick={() => setOrderType('compras')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all",
            orderType === 'compras' ? "bg-brand-500 text-white border-brand-500 shadow-lg" : "bg-bg-sidebar text-text-dim border-border-dim hover:border-brand-500/40"
          )}
        >
          <ShoppingCart size={16} /> Pedido de Compras
        </button>
        <button
          onClick={() => setOrderType('produccion')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all",
            orderType === 'produccion' ? "bg-teal-500 text-white border-teal-500 shadow-lg" : "bg-bg-sidebar text-text-dim border-border-dim hover:border-teal-500/40"
          )}
        >
          <Factory size={16} /> Pedido a Producción
        </button>
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
                  <p className="text-[10px] font-black text-text-main uppercase">{item.name}</p>
                  <p className="text-[8px] text-text-dim font-bold uppercase">{item.category || 'SIN CATEGORÍA'} · {item.unit}</p>
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
                    <p className="text-[10px] font-black text-text-main uppercase">{l.itemName}</p>
                    <p className="text-[8px] text-text-dim font-bold uppercase">{l.category} · {l.unit}</p>
                  </div>
                  <button onClick={() => removeLine(l.itemId)} className="p-1.5 text-text-dim hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
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

      {/* Pedidos recientes */}
      {recentOrders.length > 0 && (
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <History size={15} className="text-brand-500" />
            <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest">Pedidos recientes</h3>
          </div>
          <div className="space-y-1.5">
            {recentOrders.map(o => (
              <div key={o.id} className="flex items-center justify-between p-2.5 bg-bg-accent/30 rounded border border-border-dim text-[9px]">
                <span className={cn("font-black uppercase px-2 py-0.5 rounded", o.order_type === 'compras' ? "bg-brand-500/10 text-brand-500" : "bg-teal-500/10 text-teal-500")}>
                  {o.order_type === 'compras' ? 'Compras' : 'Producción'}
                </span>
                <span className="text-text-dim font-bold uppercase">Pedido {fmtDMY(o.order_date)} → entrega {fmtDMY(o.delivery_date)}</span>
                <span className="text-text-dim font-mono">{o.created_by || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
