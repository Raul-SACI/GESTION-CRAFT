/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Recepción de Pedidos Internos (Centro de Producción / Almacén).
 * Muestra los pedidos entrantes de TODAS las sucursales, separados por sucursal,
 * para que Almacén y Producción los prepare y envíe.
 * Permisos: ver detalle y descargar PDF. NO se pueden eliminar desde esta vista.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, FileDown, Loader2, Eye, X, Inbox } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';
import { Branch } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

interface OrderLine {
  category: string;
  itemName: string;
  unit: string;
  quantity: number;
  observations: string;
}

const fmtDMY = (iso: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

export default function InternalOrdersReceptionView({ branches }: { branches: Branch[] }) {
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [viewingOrder, setViewingOrder] = useState<{ order: SavedOrder; lines: OrderLine[] } | null>(null);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('internal_orders')
        .select('*')
        .order('delivery_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200);
      if (data) setOrders(data);
    } catch (e) {
      console.error('Error cargando pedidos:', e);
    }
    setLoading(false);
  };

  useEffect(() => { loadOrders(); }, []);

  const branchNameById = (id: string) => branches.find(b => b.id === id)?.name || id;

  const fetchOrderLines = async (orderId: string): Promise<OrderLine[]> => {
    const { data } = await supabase.from('internal_order_items').select('*').eq('order_id', orderId);
    return (data || []).map((d: any) => ({
      category: d.category || 'SIN CATEGORÍA',
      itemName: d.item_name,
      unit: d.unit || '',
      quantity: Number(d.quantity) || 0,
      observations: d.observations || ''
    }));
  };

  const viewOrder = async (o: SavedOrder) => {
    const lines = await fetchOrderLines(o.id);
    setViewingOrder({ order: o, lines });
  };

  const downloadOrder = async (o: SavedOrder) => {
    const pdfLines = await fetchOrderLines(o.id);
    if (pdfLines.length === 0) { alert('Este pedido no tiene insumos cargados.'); return; }
    const doc = new jsPDF();
    const typeLabel = o.order_type === 'compras' ? 'PEDIDO DE COMPRAS' : 'PEDIDO A PRODUCCIÓN';
    doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.text('CRAFT', 14, 18);
    doc.setFontSize(13); doc.text(typeLabel, 14, 27);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`Sucursal: ${branchNameById(o.branch_id)}`, 14, 37);
    doc.text(`Fecha de pedido: ${fmtDMY(o.order_date)}`, 14, 43);
    doc.text(`Fecha de entrega: ${fmtDMY(o.delivery_date)}`, 14, 49);
    if (o.created_by) doc.text(`Cargado por: ${o.created_by}`, 14, 55);
    autoTable(doc, {
      startY: 62,
      head: [['Categoría', 'Insumo', 'Unidad', 'Cantidad', 'Observaciones']],
      body: pdfLines.map(l => [l.category, l.itemName, l.unit, String(l.quantity), l.observations || '-']),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] }
    });
    if (o.notes && o.notes.trim()) {
      const finalY = (doc as any).lastAutoTable.finalY || 62;
      doc.setFontSize(9);
      doc.text(`Observaciones generales: ${o.notes.trim()}`, 14, finalY + 10);
    }
    doc.save(`${o.order_type}_${branchNameById(o.branch_id).replace(/\s+/g, '_')}_${o.order_date}.pdf`);
  };

  // Pedidos filtrados, agrupados por sucursal
  const grouped = useMemo(() => {
    const filtered = orders.filter(o => {
      if (branchFilter !== 'all' && o.branch_id !== branchFilter) return false;
      if (typeFilter !== 'all' && o.order_type !== typeFilter) return false;
      return true;
    });
    const groups: Record<string, SavedOrder[]> = {};
    filtered.forEach(o => {
      if (!groups[o.branch_id]) groups[o.branch_id] = [];
      groups[o.branch_id].push(o);
    });
    return Object.entries(groups).sort((a, b) => branchNameById(a[0]).localeCompare(branchNameById(b[0])));
  }, [orders, branchFilter, typeFilter, branches]);

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="bg-bg-card border border-border-dim rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-1">
          <Inbox size={20} className="text-brand-500" />
          <h2 className="text-base font-black uppercase text-text-main tracking-wide">Recepción de Pedidos Internos</h2>
        </div>
        <p className="text-[10px] text-text-dim font-bold uppercase">Pedidos entrantes de todas las sucursales para preparar y enviar</p>
      </div>

      {/* Filtros */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[9px] font-black text-text-dim uppercase tracking-widest block mb-1">Sucursal</label>
          <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
            className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none focus:border-brand-500 font-black uppercase">
            <option value="all">Todas las sucursales</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[9px] font-black text-text-dim uppercase tracking-widest block mb-1">Tipo de pedido</label>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none focus:border-brand-500 font-black uppercase">
            <option value="all">Todos los tipos</option>
            <option value="compras">Pedido de Compras</option>
            <option value="produccion">Pedido a Producción</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-8 flex items-center justify-center gap-3">
          <Loader2 className="animate-spin text-brand-500" size={16} />
          <span className="text-[10px] font-black uppercase tracking-widest text-text-dim">Cargando pedidos…</span>
        </div>
      ) : grouped.length === 0 ? (
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-8 text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-text-dim">No hay pedidos para mostrar.</p>
        </div>
      ) : (
        grouped.map(([branchId, list]) => (
          <div key={branchId} className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
            <div className="flex items-center justify-between mb-3 border-b border-border-dim pb-2">
              <h3 className="text-[11px] font-black uppercase text-brand-500 tracking-widest">{branchNameById(branchId)}</h3>
              <span className="text-[9px] font-mono font-black text-text-dim bg-bg-accent px-2 py-1 rounded border border-border-dim">{list.length} pedido(s)</span>
            </div>
            <div className="space-y-1.5">
              {list.map(o => (
                <div key={o.id} className="flex items-center justify-between gap-2 p-2.5 bg-bg-accent/30 rounded border border-border-dim text-[9px]">
                  <span className={cn("font-black uppercase px-2 py-0.5 rounded shrink-0", o.order_type === 'compras' ? "bg-brand-500/10 text-brand-500" : "bg-teal-500/10 text-teal-500")}>
                    {o.order_type === 'compras' ? 'Compras' : 'Producción'}
                  </span>
                  <span className="text-text-dim font-bold uppercase flex-1 truncate">Pedido {fmtDMY(o.order_date)} → entrega {fmtDMY(o.delivery_date)}</span>
                  <span className="text-text-dim font-mono hidden sm:block truncate max-w-[120px]">{o.created_by || '—'}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => viewOrder(o)} title="Ver detalle" className="p-1.5 text-text-dim hover:text-brand-500 transition-colors"><Eye size={14} /></button>
                    <button onClick={() => downloadOrder(o)} title="Descargar PDF" className="p-1.5 text-text-dim hover:text-emerald-500 transition-colors"><FileDown size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Modal de detalle */}
      {viewingOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setViewingOrder(null)}>
          <div className="bg-bg-card border border-border-dim rounded-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border-dim">
              <div>
                <h3 className="text-sm font-black uppercase text-text-main tracking-wide">
                  {viewingOrder.order.order_type === 'compras' ? 'Pedido de Compras' : 'Pedido a Producción'}
                </h3>
                <p className="text-[9px] text-text-dim font-bold uppercase mt-0.5">
                  {branchNameById(viewingOrder.order.branch_id)} · Pedido {fmtDMY(viewingOrder.order.order_date)} → entrega {fmtDMY(viewingOrder.order.delivery_date)}
                  {viewingOrder.order.created_by ? ` · ${viewingOrder.order.created_by}` : ''}
                </p>
              </div>
              <button onClick={() => setViewingOrder(null)} className="p-1.5 text-text-dim hover:text-text-main transition-colors"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto custom-scrollbar">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-text-dim uppercase font-black border-b border-border-dim">
                    <th className="text-left py-2">Categoría</th>
                    <th className="text-left py-2">Insumo</th>
                    <th className="text-center py-2">Unidad</th>
                    <th className="text-right py-2">Cantidad</th>
                    <th className="text-left py-2 pl-3">Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingOrder.lines.map((l, i) => (
                    <tr key={i} className="border-b border-border-dim/30">
                      <td className="py-1.5 text-text-dim uppercase">{l.category}</td>
                      <td className="py-1.5 font-black text-text-main uppercase">{l.itemName}</td>
                      <td className="py-1.5 text-center text-text-dim uppercase">{l.unit}</td>
                      <td className="py-1.5 text-right font-mono font-black text-text-main">{l.quantity}</td>
                      <td className="py-1.5 pl-3 text-text-dim">{l.observations || '-'}</td>
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
              <button onClick={() => downloadOrder(viewingOrder.order)} className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all">
                <FileDown size={14} /> Descargar PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
