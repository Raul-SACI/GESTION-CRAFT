import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ClipboardCheck, Search, Calendar, Loader2, Check, Save, Lock, Unlock, FileText, FileSpreadsheet, Trash2, Plus } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Branch { id: string; name: string; }
interface MasterItem { id: string; name: string; unit: string; category: string | null; code: string | null; cost?: number; }
interface InvRow { item_id: string; item_name: string; unit: string; cantidad: number; code?: string | null; precio_unitario?: number; total?: number; }
interface Props {
  branches: Branch[];
  selectedBranchId: string;
  userRole?: string;
  fixedBranchId?: string;
  isReadOnly?: boolean;
}

const monthLabel = (m: string) => {
  const [y, mm] = m.split('-');
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${meses[parseInt(mm,10)-1]} ${y}`;
};

export default function MonthlyInventoryView({ branches, selectedBranchId, userRole, fixedBranchId, isReadOnly = false }: Props) {
  const isAdmin = userRole === 'administrador' || userRole === 'dueño';
  // Sucursales reales (excluye la opción 'all'/'todas')
  const realBranches = branches.filter(b => b.id && b.id !== 'all');
  const resolveInitialBranch = () => {
    if (fixedBranchId) return fixedBranchId;
    if (selectedBranchId && selectedBranchId !== 'all') return selectedBranchId;
    return realBranches[0]?.id || '';
  };
  const [branchId, setBranchId] = useState(resolveInitialBranch());
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [items, setItems] = useState<MasterItem[]>([]);
  const [rows, setRows] = useState<InvRow[]>([]);           // insumos ya inventariados
  const [status, setStatus] = useState<'borrador' | 'enviado_valorizar' | 'cerrado'>('borrador');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [search, setSearch] = useState('');
  const [pendingQty, setPendingQty] = useState<Record<string, string>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  const locked = status !== 'borrador' || isReadOnly;

  useEffect(() => { if (fixedBranchId) setBranchId(fixedBranchId); }, [fixedBranchId]);
  // Si la app cambia a una sucursal real, seguirla (salvo branch fijo)
  useEffect(() => {
    if (!fixedBranchId && selectedBranchId && selectedBranchId !== 'all') setBranchId(selectedBranchId);
  }, [selectedBranchId, fixedBranchId]);

  // Maestro de insumos
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('stock_items').select('id, name, unit, category, code, cost').order('name');
      if (data) setItems(data as MasterItem[]);
    })();
  }, []);

  // Cargar inventario + estado de la sucursal+mes
  useEffect(() => {
    if (!branchId || !month) return;
    setLoading(true);
    (async () => {
      const [{ data: invData }, { data: statusData }] = await Promise.all([
        supabase.from('monthly_inventory').select('item_id, item_name, unit, cantidad, precio_unitario, total').match({ branch_id: branchId, month }),
        supabase.from('monthly_inventory_status').select('status').match({ branch_id: branchId, month }).maybeSingle(),
      ]);
      const loaded: InvRow[] = (invData || [])
        .filter((r: any) => r.cantidad && r.cantidad !== 0)
        .map((r: any) => ({ item_id: r.item_id, item_name: r.item_name, unit: r.unit, cantidad: r.cantidad, precio_unitario: r.precio_unitario || 0, total: r.total || 0 }));
      setRows(loaded);
      setStatus((statusData?.status as any) || 'borrador');
      setLoading(false);
    })();
  }, [branchId, month]);

  const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Sugerencias del buscador (solo si hay texto). Excluye los ya agregados.
  const suggestions = useMemo(() => {
    const q = norm(search.trim());
    if (!q) return [];
    const yaIds = new Set(rows.map(r => r.item_id));
    return items
      .filter(i => !yaIds.has(i.id))
      .filter(i => norm(i.name).includes(q) || norm(i.code || '').includes(q) || norm(i.category || '').includes(q))
      .slice(0, 8);
  }, [items, search, rows]);

  const addItem = (item: MasterItem) => {
    if (locked) return;
    const qty = parseFloat(pendingQty[item.id] || '0') || 0;
    setRows(prev => [{ item_id: item.id, item_name: item.name, unit: item.unit, cantidad: qty, code: item.code }, ...prev]);
    setPendingQty(prev => { const n = { ...prev }; delete n[item.id]; return n; });
    setSearch('');
    searchRef.current?.focus();
  };

  const updateRowQty = (itemId: string, value: number) => {
    setRows(prev => prev.map(r => r.item_id === itemId ? { ...r, cantidad: value } : r));
  };
  const removeRow = async (itemId: string) => {
    if (locked) return;
    // Quitar de la pantalla
    setRows(prev => prev.filter(r => r.item_id !== itemId));
    // Borrar de la base al instante (solo esa fila), si la sucursal es válida
    if (branchId && branchId !== 'all') {
      const { error } = await supabase.from('monthly_inventory')
        .delete().match({ branch_id: branchId, month, item_id: itemId });
      if (error) alert('No se pudo eliminar de la base: ' + error.message);
    }
  };

  // Guardar borrador: reemplaza las filas guardadas de ese mes/sucursal por las actuales
  const saveDraft = async (silent = false) => {
    if (locked) return false;
    if (!branchId || branchId === 'all') {
      alert('Elegí una sucursal válida antes de guardar el inventario.');
      return false;
    }
    setSaving(true);
    try {
      // Borrar lo anterior y reinsertar (simple y consistente)
      const del = await supabase.from('monthly_inventory').delete().match({ branch_id: branchId, month });
      if (del.error) throw del.error;
      if (rows.length > 0) {
        const ins = await supabase.from('monthly_inventory').insert(
          rows.map(r => ({ branch_id: branchId, month, item_id: r.item_id, item_name: r.item_name, unit: r.unit, cantidad: r.cantidad, updated_at: new Date().toISOString() }))
        );
        if (ins.error) throw ins.error;
      }
      const st = await supabase.from('monthly_inventory_status').upsert(
        { branch_id: branchId, month, status: 'borrador', updated_at: new Date().toISOString() },
        { onConflict: 'branch_id,month' }
      );
      if (st.error) throw st.error;
      setSaving(false);
      if (!silent) { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1500); }
      return true;
    } catch (e: any) {
      setSaving(false);
      alert('No se pudo guardar el inventario.\n\nDetalle: ' + (e?.message || e?.hint || JSON.stringify(e)));
      return false;
    }
  };

  // Paso 1: el encargado envía el inventario para que el admin lo valorice
  const enviarValorizar = async () => {
    if (locked) return;
    if (rows.length === 0) { alert('Cargá al menos un insumo antes de enviar el inventario.'); return; }
    if (!confirm('¿Enviar el inventario para valorizar? Quedará bloqueado para carga de cantidades. El administrador cargará los costos y lo cerrará de forma definitiva.')) return;
    const ok = await saveDraft(true);
    if (!ok) return;
    const st = await supabase.from('monthly_inventory_status').upsert(
      { branch_id: branchId, month, status: 'enviado_valorizar', updated_at: new Date().toISOString() },
      { onConflict: 'branch_id,month' }
    );
    if (st.error) { alert('No se pudo enviar: ' + st.error.message); return; }
    setStatus('enviado_valorizar');
  };

  // Paso 2: SOLO ADMIN. Toma el costo del Maestro, calcula el total y cierra definitivo.
  const cerrarValorizar = async () => {
    if (!isAdmin) return;
    if (!confirm('¿Cerrar y valorizar el inventario de forma definitiva? Se tomarán los costos actuales del Maestro de Insumos para calcular los totales.')) return;
    // Calcular precio y total por insumo desde el Maestro
    const valorizadas = rows.map(r => {
      const cost = items.find(i => i.id === r.item_id)?.cost || 0;
      return { ...r, precio_unitario: cost, total: (r.cantidad || 0) * cost };
    });
    // Reescribir las filas con precio y total
    try {
      const del = await supabase.from('monthly_inventory').delete().match({ branch_id: branchId, month });
      if (del.error) throw del.error;
      if (valorizadas.length > 0) {
        const ins = await supabase.from('monthly_inventory').insert(
          valorizadas.map(r => ({ branch_id: branchId, month, item_id: r.item_id, item_name: r.item_name, unit: r.unit, cantidad: r.cantidad, precio_unitario: r.precio_unitario, total: r.total, updated_at: new Date().toISOString() }))
        );
        if (ins.error) throw ins.error;
      }
      const st = await supabase.from('monthly_inventory_status').upsert(
        { branch_id: branchId, month, status: 'cerrado', closed_at: new Date().toISOString(), closed_by: userRole || '', updated_at: new Date().toISOString() },
        { onConflict: 'branch_id,month' }
      );
      if (st.error) throw st.error;
      setRows(valorizadas);
      setStatus('cerrado');
    } catch (e: any) {
      alert('No se pudo cerrar y valorizar.\n\nDetalle: ' + (e?.message || JSON.stringify(e)));
    }
  };

  const reopenInventory = async () => {
    if (!isAdmin) return;
    if (!confirm('¿Reabrir el inventario para edición? Volverá a estado borrador.')) return;
    await supabase.from('monthly_inventory_status').upsert(
      { branch_id: branchId, month, status: 'borrador', updated_at: new Date().toISOString() },
      { onConflict: 'branch_id,month' }
    );
    setStatus('borrador');
  };

  const branchName = branches.find(b => b.id === branchId)?.name || branchId;
  // Devuelve el código del insumo (desde la fila o, si no, del Maestro por item_id)
  const codeOf = (r: InvRow) => r.code || items.find(i => i.id === r.item_id)?.code || '';
  const valorizado = status === 'cerrado';
  const totalGeneral = rows.reduce((a, r) => a + (r.total || 0), 0);
  const fmtMoney = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const exportExcel = () => {
    const data = rows.map(r => valorizado
      ? { 'Código': codeOf(r), 'Insumo': r.item_name, 'Cantidad': r.cantidad, 'Unidad': r.unit, 'Precio Unitario': r.precio_unitario || 0, 'Total': r.total || 0 }
      : { 'Código': codeOf(r), 'Insumo': r.item_name, 'Cantidad': r.cantidad, 'Unidad': r.unit });
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = valorizado
      ? [{ wch: 14 }, { wch: 40 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 16 }]
      : [{ wch: 14 }, { wch: 40 }, { wch: 12 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    XLSX.writeFile(wb, `Inventario_${branchName.replace(/\s+/g,'_')}_${month}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('Inventario Mensual', 14, 18);
    doc.setFontSize(10);
    doc.text(`Sucursal: ${branchName}`, 14, 26);
    doc.text(`Mes: ${monthLabel(month)}`, 14, 32);
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-AR')}`, 14, 38);
    if (valorizado) doc.text(`TOTAL VALORIZADO: $${fmtMoney(totalGeneral)}`, 14, 44);
    autoTable(doc, {
      startY: valorizado ? 50 : 44,
      head: [valorizado ? ['Código', 'Insumo', 'Cantidad', 'Unidad', 'P. Unitario', 'Total'] : ['Código', 'Insumo', 'Cantidad', 'Unidad']],
      body: rows.map(r => valorizado
        ? [codeOf(r), r.item_name, String(r.cantidad), r.unit, `$${fmtMoney(r.precio_unitario || 0)}`, `$${fmtMoney(r.total || 0)}`]
        : [codeOf(r), r.item_name, String(r.cantidad), r.unit]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [237, 28, 36] },
    });
    doc.save(`Inventario_${branchName.replace(/\s+/g,'_')}_${month}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-brand-500/10 p-2.5 rounded-lg"><ClipboardCheck size={20} className="text-brand-500" /></div>
          <div>
            <h2 className="text-lg font-black uppercase text-text-main tracking-tight">Inventario Mensual</h2>
            <p className="text-[10px] font-bold uppercase text-text-dim tracking-widest">Conteo físico de fin de mes · {branchName}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!fixedBranchId && isAdmin && (
            <select value={branchId} onChange={e => setBranchId(e.target.value)}
              className="bg-bg-sidebar border border-border-dim rounded-lg px-3 py-2 text-[10px] font-extrabold uppercase text-text-main outline-none cursor-pointer">
              {realBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <div className="bg-bg-sidebar border border-border-dim rounded-lg px-3 py-1.5 flex items-center gap-2 font-mono">
            <Calendar size={14} className="text-brand-500" />
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="bg-transparent border-none text-[10px] font-extrabold uppercase text-text-main outline-none cursor-pointer" />
          </div>
        </div>
      </div>

      {/* Estado + acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-bg-sidebar border border-border-dim rounded-xl p-4">
        <div className="flex items-center gap-2 flex-wrap">
          {status === 'cerrado'
            ? <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-500"><Lock size={13} /> Cerrado y Valorizado</span>
            : status === 'enviado_valorizar'
            ? <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-blue-500"><Lock size={13} /> Enviado para Valorizar</span>
            : <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-500"><Unlock size={13} /> Borrador</span>}
          <span className="text-[10px] font-bold text-text-dim">· {rows.length} insumo{rows.length !== 1 ? 's' : ''}</span>
          {valorizado && <span className="text-[10px] font-black text-emerald-500">· TOTAL: ${fmtMoney(totalGeneral)}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Borrador: guardar y enviar para valorizar */}
          {status === 'borrador' && !isReadOnly && (
            <>
              <button onClick={() => saveDraft(false)} disabled={saving}
                className="flex items-center gap-2 bg-bg-accent border border-border-dim text-text-main px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest hover:border-brand-500/50 transition-all disabled:opacity-60">
                {saving ? <Loader2 size={13} className="animate-spin" /> : savedFlash ? <Check size={13} className="text-emerald-500" /> : <Save size={13} />}
                {savedFlash ? 'Guardado' : 'Guardar Borrador'}
              </button>
              <button onClick={enviarValorizar} disabled={saving}
                className="flex items-center gap-2 bg-brand-500 text-black px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-lg disabled:opacity-60">
                <Lock size={13} /> Enviar para Valorizar
              </button>
            </>
          )}
          {/* Enviado para valorizar: exportar (sin precios), y el admin cierra/valoriza */}
          {(status === 'enviado_valorizar' || status === 'cerrado') && (
            <>
              <button onClick={exportPDF}
                className="flex items-center gap-2 bg-bg-accent border border-border-dim text-text-main px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest hover:border-brand-500/50 transition-all">
                <FileText size={13} /> PDF
              </button>
              <button onClick={exportExcel}
                className="flex items-center gap-2 bg-bg-accent border border-border-dim text-text-main px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest hover:border-brand-500/50 transition-all">
                <FileSpreadsheet size={13} /> Excel
              </button>
              {status === 'enviado_valorizar' && isAdmin && (
                <button onClick={cerrarValorizar}
                  className="flex items-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg">
                  <Lock size={13} /> Cerrar y Valorizar
                </button>
              )}
              {isAdmin && (
                <button onClick={reopenInventory}
                  className="flex items-center gap-2 bg-bg-accent border border-amber-500/40 text-amber-500 px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest hover:border-amber-500 transition-all">
                  <Unlock size={13} /> Reabrir
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Buscador con sugerencias (solo en borrador) */}
      {!locked && (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar insumo por nombre, código o categoría..."
            className="w-full bg-bg-sidebar border border-border-dim rounded-lg pl-9 pr-3 py-2.5 text-[12px] text-text-main placeholder:text-text-dim outline-none focus:border-brand-500/50" />
          {suggestions.length > 0 && (
            <div className="absolute z-30 mt-1 w-full bg-bg-sidebar border border-border-dim rounded-lg shadow-2xl max-h-80 overflow-y-auto divide-y divide-border-dim/40">
              {suggestions.map(item => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-bg-accent/40">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-black text-text-main truncate">{item.name}</p>
                    <p className="text-[8px] text-text-dim uppercase font-bold tracking-widest truncate">{item.code ? `${item.code} · ` : ''}{item.category || 'Sin categoría'} · {item.unit || '—'}</p>
                  </div>
                  <input
                    type="number" autoFocus={false}
                    value={pendingQty[item.id] || ''}
                    onChange={e => setPendingQty(prev => ({ ...prev, [item.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') addItem(item); }}
                    placeholder="Cant."
                    className="w-24 bg-bg-accent/40 border border-border-dim rounded px-2 py-1.5 text-[12px] font-mono font-black text-text-main text-right outline-none focus:border-brand-500"
                  />
                  <span className="w-10 text-[9px] font-black uppercase text-text-dim">{item.unit || '—'}</span>
                  <button onClick={() => addItem(item)} className="bg-brand-500 text-black p-1.5 rounded hover:bg-brand-600" title="Agregar">
                    <Plus size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lista de inventariados */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border-dim/40 flex items-center justify-between">
          <p className="text-[10px] font-black uppercase text-text-main tracking-widest">Insumos inventariados</p>
          <p className="text-[10px] font-bold text-text-dim">{rows.length}</p>
        </div>
        {loading ? (
          <div className="p-10 text-center text-text-dim"><Loader2 size={20} className="animate-spin mx-auto" /></div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-[11px] font-bold uppercase text-text-dim tracking-widest">
            {locked ? 'No hay insumos en este inventario' : 'Buscá un insumo arriba y agregalo con su cantidad'}
          </div>
        ) : (
          <div className="divide-y divide-border-dim/40">
            {rows.map(r => (
              <div key={r.item_id} className="flex items-center gap-4 px-5 py-3 hover:bg-bg-accent/20 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-black text-text-main truncate">{r.item_name}</p>
                  <p className="text-[8px] text-text-dim uppercase font-bold tracking-widest">{codeOf(r)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number"
                    value={r.cantidad}
                    disabled={locked}
                    onChange={e => updateRowQty(r.item_id, parseFloat(e.target.value) || 0)}
                    className="w-24 bg-bg-accent/40 border border-border-dim rounded px-3 py-2 text-[13px] font-mono font-black text-text-main text-right outline-none focus:border-brand-500 disabled:opacity-70"
                  />
                  <span className="w-10 text-[10px] font-black uppercase text-text-dim tracking-widest">{r.unit || '—'}</span>
                  {valorizado && (
                    <>
                      <span className="w-24 text-[11px] font-mono font-bold text-text-dim text-right">${fmtMoney(r.precio_unitario || 0)}</span>
                      <span className="w-28 text-[12px] font-mono font-black text-emerald-500 text-right">${fmtMoney(r.total || 0)}</span>
                    </>
                  )}
                  {!locked && (
                    <button onClick={() => removeRow(r.item_id)} className="text-text-dim hover:text-red-500 p-1" title="Quitar">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!locked && rows.length > 0 && (
        <p className="text-[9px] text-text-dim font-bold uppercase tracking-widest text-center">
          Recordá guardar el borrador o cerrar el inventario para no perder los cambios
        </p>
      )}
    </div>
  );
}
