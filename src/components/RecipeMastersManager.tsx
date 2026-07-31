/**
 * Maestro simple de "recetas" (Producción o Sucursal) — lista de elaborados/preparaciones
 * (ej. BOLLO DE PIZZA) que después se pueden elegir al armar recetas.
 * Tabla: recipe_masters (id, tipo, name, unit, code).
 */
import { useState, useEffect, useMemo, type ChangeEvent } from 'react';
import { Search, Upload, Download, Edit2, Trash2, Plus } from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

interface MasterRow { id: string; tipo: string; name: string; unit: string | null; code: string | null; }

export default function RecipeMastersManager({ tipo, title, color = 'purple', isReadOnly, simpleName = false }: {
  tipo: 'produccion' | 'sucursal' | 'seccion_carta';
  title: string;
  color?: 'purple' | 'orange' | 'sky';
  isReadOnly?: boolean;
  simpleName?: boolean; // solo campo Nombre (ej. secciones de la carta)
}) {
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [form, setForm] = useState<{ name: string; unit: string; code: string }>({ name: '', unit: '', code: '' });
  const [editing, setEditing] = useState<MasterRow | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const c = color === 'orange'
    ? { text: 'text-orange-500', border: 'border-orange-500', bg: 'bg-orange-500', bgSoft: 'bg-orange-500/5', borderSoft: 'border-orange-500/20', hover: 'hover:bg-orange-600' }
    : color === 'sky'
    ? { text: 'text-sky-500', border: 'border-sky-500', bg: 'bg-sky-500', bgSoft: 'bg-sky-500/5', borderSoft: 'border-sky-500/20', hover: 'hover:bg-sky-600' }
    : { text: 'text-purple-500', border: 'border-purple-500', bg: 'bg-purple-500', bgSoft: 'bg-purple-500/5', borderSoft: 'border-purple-500/20', hover: 'hover:bg-purple-600' };

  const cargar = async () => {
    try {
      const { data } = await supabase.from('recipe_masters').select('*').eq('tipo', tipo).order('name');
      setRows((data as MasterRow[]) || []);
    } catch { setRows([]); }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [tipo]);

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => r.name.toLowerCase().includes(q) || String(r.code || '').toLowerCase().includes(q));
  }, [rows, search]);

  const guardar = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    if (!form.name.trim()) { alert('Poné el nombre.'); return; }
    setBusy(true);
    try {
      if (editing) {
        await supabase.from('recipe_masters').update({ name: form.name.trim().toUpperCase(), unit: form.unit.trim() || null, code: form.code.trim() || null }).eq('id', editing.id);
        setEditing(null);
      } else {
        // Evitar duplicados por nombre dentro del mismo tipo
        if (rows.some(r => r.name.trim().toUpperCase() === form.name.trim().toUpperCase())) {
          alert('Ya existe un registro con ese nombre.'); setBusy(false); return;
        }
        await supabase.from('recipe_masters').insert({
          id: `rm_${tipo.slice(0, 3)}_${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
          tipo, name: form.name.trim().toUpperCase(), unit: form.unit.trim() || null, code: form.code.trim() || null,
        });
      }
      setForm({ name: '', unit: '', code: '' });
      await cargar();
    } catch (e: any) { alert('Error al guardar: ' + (e.message || e)); }
    setBusy(false);
  };

  const borrar = async (r: MasterRow) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    if (!window.confirm(`¿Eliminar "${r.name}"?`)) return;
    await supabase.from('recipe_masters').delete().eq('id', r.id);
    await cargar();
  };

  const modelo = () => {
    const ws = XLSX.utils.aoa_to_sheet([['Nombre', 'Unidad', 'Codigo'], ['BOLLO DE PIZZA', 'UNIDAD', '']]);
    ws['!cols'] = [{ wch: 34 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Maestro');
    XLSX.writeFile(wb, `modelo_${tipo}.xlsx`);
  };

  const importar = async (e: ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const data: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const pick = (row: any, ...keys: string[]) => { for (const k of Object.keys(row)) { if (keys.some(x => k.trim().toLowerCase() === x)) return String(row[k] ?? '').trim(); } return ''; };
      const existentes = new Set(rows.map(r => r.name.trim().toUpperCase()));
      const nuevos: any[] = [];
      let seq = 0;
      data.forEach(row => {
        const name = pick(row, 'nombre', 'name', 'producto', 'plato', 'descripcion').toUpperCase();
        if (!name || existentes.has(name)) return;
        existentes.add(name);
        nuevos.push({
          id: `rm_${tipo.slice(0, 3)}_${Date.now()}${seq++}${Math.random().toString(36).slice(2, 4)}`,
          tipo, name, unit: pick(row, 'unidad', 'unit', 'um') || null, code: pick(row, 'codigo', 'código', 'code', 'cod') || null,
        });
      });
      if (nuevos.length === 0) { alert('No se encontraron registros nuevos para importar (revisá que haya columna NOMBRE).'); setBusy(false); if (e.target) e.target.value = ''; return; }
      for (let i = 0; i < nuevos.length; i += 200) { const { error } = await supabase.from('recipe_masters').insert(nuevos.slice(i, i + 200)); if (error) throw error; }
      alert(`Se importaron ${nuevos.length} registro(s) nuevo(s).`);
      await cargar();
    } catch (err: any) { alert('Error al importar: ' + (err.message || err)); }
    setBusy(false);
    if (e.target) e.target.value = '';
  };

  return (
    <div className="bg-bg-sidebar border border-border-dim rounded-lg p-6 shadow-xl space-y-6">
      <div className="flex items-center justify-between border-b border-border-dim pb-4">
        <h3 className={cn("text-sm font-black uppercase tracking-widest", c.text)}>{title}</h3>
        {!isReadOnly && (
          <div className="flex gap-2">
            <button onClick={modelo} className="flex items-center gap-2 px-3 py-1.5 bg-bg-accent border border-border-dim rounded hover:border-brand-500 transition-all text-text-dim hover:text-brand-500 text-[9px] font-black uppercase">
              <Download size={14} /> Modelo
            </button>
            <label className={cn("flex items-center gap-2 px-3 py-1.5 bg-bg-accent border rounded cursor-pointer transition-all text-[9px] font-black uppercase", c.borderSoft, c.text, busy && 'opacity-60 pointer-events-none')}>
              <Upload size={14} /> Importar
              <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={importar} />
            </label>
          </div>
        )}
      </div>

      {!isReadOnly && (
        <div className={cn("p-4 rounded border space-y-3", c.bgSoft, c.borderSoft)}>
          <div className="grid grid-cols-6 gap-3">
            <div className={cn("space-y-1", simpleName ? "col-span-6" : "col-span-3")}>
              <label className="text-[9px] font-black text-text-dim uppercase">Nombre</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className={cn("w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none uppercase font-black focus:" + c.border)}
                placeholder={simpleName ? 'PIZZAS CLÁSICAS…' : 'BOLLO DE PIZZA…'} />
            </div>
            {!simpleName && (
              <>
                <div className="col-span-2 space-y-1">
                  <label className="text-[9px] font-black text-text-dim uppercase">Unidad</label>
                  <input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}
                    className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none font-black uppercase" placeholder="UNIDAD / KG…" />
                </div>
                <div className="col-span-1 space-y-1">
                  <label className="text-[9px] font-black text-text-dim uppercase">Código</label>
                  <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })}
                    className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[10px] font-mono text-text-main outline-none font-black uppercase" placeholder="—" />
                </div>
              </>
            )}
          </div>
          <button onClick={guardar} disabled={busy}
            className={cn("w-full text-white py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50", c.bg, c.hover)}>
            <Plus size={14} /> {editing ? 'Guardar cambios' : 'Agregar'}
          </button>
          {editing && (
            <button onClick={() => { setEditing(null); setForm({ name: '', unit: '', code: '' }); }} className="w-full text-[9px] font-bold text-text-dim uppercase underline">Cancelar edición</button>
          )}
        </div>
      )}

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o código…"
          className="w-full bg-bg-card border border-border-dim rounded pl-9 pr-3 py-2 text-[10px] text-text-main outline-none uppercase font-bold" />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-text-dim uppercase">{filtradas.length}</span>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
        {filtradas.length === 0 ? (
          <p className="text-center text-[10px] font-bold uppercase text-text-dim py-6">Sin registros. {!isReadOnly && 'Agregá arriba o importá.'}</p>
        ) : filtradas.map(r => (
          <div key={r.id} className="flex items-center justify-between p-3.5 rounded border bg-bg-accent/40 border-border-dim hover:border-brand-500/30 transition-all">
            <div className="min-w-0">
              <p className="text-[11px] font-black text-text-main uppercase truncate">{r.name}</p>
              {!simpleName && <p className="text-[9px] text-text-dim font-bold uppercase mt-0.5">{r.unit || 'sin unidad'}{r.code ? ` · ${r.code}` : ''}</p>}
            </div>
            {!isReadOnly && (
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => { setEditing(r); setForm({ name: r.name, unit: r.unit || '', code: r.code || '' }); }} className="p-2 text-text-dim hover:text-brand-500 transition-colors"><Edit2 size={14} /></button>
                <button onClick={() => borrar(r)} className="p-2 text-text-dim hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
