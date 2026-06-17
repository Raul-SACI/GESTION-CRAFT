/**
 * SPDX-License-Identifier: Apache-2.0
 * Vista pública del QR de Mantenimiento.
 * Se abre al escanear el QR de un bien (URL con ?bien=ID). No requiere login de CRAFT,
 * pero pide un código de acceso de mantenimiento antes de permitir cargar un arreglo.
 */
import React, { useState, useEffect } from 'react';
import { supabaseMant } from '../lib/supabase';

// Código de acceso para cargar arreglos desde el QR (compartido por el equipo de mantenimiento).
// Para cambiarlo, editar este valor.
const ACCESS_CODE = 'craft2026';

interface Asset {
  id: string; name: string; branch: string; category: string;
  asset_brand?: string; asset_model?: string; location?: string;
}
interface Repair {
  id: string; asset_id: string; branch: string; description: string; date: string; time: string;
  responsible: string; responsible_type: string; parts: string; labor_cost: string; parts_cost: string;
  total_cost: string; pay_type: string; source: string;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = (n: number | string) => (parseFloat(n as string) || 0).toLocaleString('es-AR');
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

const PAY_TYPES: Record<string, string> = {
  caja_chica: 'Caja Chica (Técnico interno)',
  sucursal: 'Cobro en Sucursal (Tercerizado)',
  tesoreria: 'Cobro en Tesorería (Administración)',
};

export default function PublicQRView({ bienId, onClose }: { bienId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [repairs, setRepairs] = useState<Repair[]>([]);

  const [unlocked, setUnlocked] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');

  const [view, setView] = useState<'menu' | 'form' | 'history'>('menu');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    responsible: '', responsibleType: 'interno', description: '',
    laborCost: '', partsCost: '', payType: 'caja_chica',
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: a } = await supabaseMant.from('activos').select('id, name, branch, category, asset_brand, asset_model, location').eq('id', bienId).maybeSingle();
        if (!a) { setNotFound(true); setLoading(false); return; }
        setAsset(a as Asset);
        const { data: r } = await supabaseMant.from('reparaciones').select('*').eq('asset_id', bienId);
        setRepairs((r as Repair[]) || []);
      } catch (e) {
        console.error('Error cargando bien del QR:', e);
        setNotFound(true);
      }
      setLoading(false);
    })();
  }, [bienId]);

  const labor = parseFloat(form.laborCost) || 0;
  const parts = parseFloat(form.partsCost) || 0;
  const total = labor + parts;

  const tryUnlock = () => {
    if (codeInput.trim() === ACCESS_CODE) { setUnlocked(true); setCodeError(''); }
    else setCodeError('Código incorrecto.');
  };

  const submit = async () => {
    if (!form.responsible || !form.description) { alert('Completá tu nombre y la descripción del trabajo.'); return; }
    if (!asset) return;
    setSaving(true);
    try {
      const payload: Repair = {
        id: uid(),
        asset_id: asset.id,
        branch: asset.branch || 'N/A',
        description: form.description,
        date: todayISO(),
        time: new Date().toTimeString().slice(0, 5),
        responsible: form.responsible,
        responsible_type: form.responsibleType,
        parts: '',
        labor_cost: form.laborCost || '0',
        parts_cost: form.partsCost || '0',
        total_cost: String(total),
        pay_type: form.payType,
        source: 'qr',
      };
      const { error } = await supabaseMant.from('reparaciones').insert(payload);
      if (error) throw error;
      setSubmitted(true);
    } catch (e: any) {
      alert('Error al guardar: ' + (e.message || e));
    }
    setSaving(false);
  };

  const wrap = (children: React.ReactNode) => (
    <div className="min-h-screen w-full bg-bg-main flex items-center justify-center p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );

  if (loading) return wrap(
    <div className="bg-bg-card border border-border-dim rounded-2xl p-10 text-center">
      <p className="text-[11px] font-black uppercase tracking-widest text-text-dim animate-pulse">Cargando…</p>
    </div>
  );

  if (notFound) return wrap(
    <div className="bg-bg-card border border-border-dim rounded-2xl p-8 text-center">
      <p className="text-2xl mb-3">⚠️</p>
      <h3 className="text-sm font-black text-red-500 uppercase mb-1">Equipo no encontrado</h3>
      <p className="text-[11px] text-text-dim mb-6">Este QR no corresponde a ningún bien registrado.</p>
      <button onClick={onClose} className="w-full py-3 bg-bg-accent text-text-main rounded-xl text-[11px] font-black uppercase tracking-widest">Volver</button>
    </div>
  );

  // Pantalla de código de acceso (dato previo)
  if (!unlocked) return wrap(
    <div className="bg-bg-card border border-border-dim rounded-2xl p-8">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-black italic tracking-tighter text-brand-500">CRAFT<span className="text-text-main">.</span></h1>
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-text-dim mt-1">Mantenimiento</p>
      </div>
      {asset && (
        <div className="bg-bg-accent/40 border border-border-dim rounded-xl p-4 mb-5 text-center">
          <p className="text-[14px] font-black text-text-main uppercase">{asset.name}</p>
          <p className="text-[10px] font-black text-brand-500 uppercase tracking-widest mt-1">{asset.branch}</p>
        </div>
      )}
      <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Código de acceso de mantenimiento</label>
      <input type="password" value={codeInput} onChange={e => setCodeInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && tryUnlock()}
        placeholder="Ingresá el código"
        className="w-full bg-bg-accent border border-border-dim rounded-xl px-4 py-3 text-[13px] text-text-main outline-none focus:border-brand-500" />
      {codeError && <p className="text-[10px] text-red-500 font-bold mt-2">{codeError}</p>}
      <button onClick={tryUnlock} className="w-full mt-4 py-3 bg-brand-500 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all">Ingresar</button>
      <button onClick={onClose} className="w-full mt-2 py-2 text-text-dim text-[10px] font-bold uppercase tracking-widest">Cancelar</button>
    </div>
  );

  if (submitted) return wrap(
    <div className="bg-bg-card border border-border-dim rounded-2xl p-8 text-center">
      <p className="text-3xl mb-3">✅</p>
      <h3 className="text-sm font-black text-emerald-500 uppercase mb-1">Arreglo registrado</h3>
      <p className="text-[11px] text-text-dim mb-6">El trabajo se guardó correctamente.</p>
      <button onClick={() => { setSubmitted(false); setForm({ responsible: '', responsibleType: 'interno', description: '', laborCost: '', partsCost: '', payType: 'caja_chica' }); setView('menu'); }}
        className="w-full py-3 bg-brand-500 text-white rounded-xl text-[11px] font-black uppercase tracking-widest mb-2">Cargar otro</button>
      <button onClick={onClose} className="w-full py-3 bg-bg-accent text-text-main rounded-xl text-[11px] font-black uppercase tracking-widest">Cerrar</button>
    </div>
  );

  const a = asset!;

  if (view === 'menu') return wrap(
    <div className="bg-bg-card border border-border-dim rounded-2xl p-8">
      <div className="text-center mb-6">
        <h2 className="text-lg font-black text-text-main uppercase">{a.name}</h2>
        <p className="text-[10px] font-black text-brand-500 uppercase tracking-widest mt-1">{a.branch}</p>
        {(a.asset_brand || a.asset_model) && <p className="text-[10px] text-text-dim font-bold mt-1">{[a.asset_brand, a.asset_model].filter(Boolean).join(' · ')}</p>}
      </div>
      <button onClick={() => setView('form')} className="w-full py-4 bg-brand-500 text-white rounded-xl text-[13px] font-black uppercase tracking-widest mb-3 hover:bg-brand-600 transition-all">Registrar arreglo</button>
      <button onClick={() => setView('history')} className="w-full py-4 bg-bg-accent text-text-main rounded-xl text-[12px] font-black uppercase tracking-widest border border-border-dim">Ver historial ({repairs.length})</button>
      <button onClick={onClose} className="w-full mt-4 py-2 text-text-dim text-[10px] font-bold uppercase tracking-widest">Cerrar</button>
    </div>
  );

  if (view === 'history') return wrap(
    <div className="bg-bg-card border border-border-dim rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-border-dim">
        <div>
          <h3 className="text-sm font-black text-text-main uppercase">Historial de Arreglos</h3>
          <p className="text-[10px] text-text-dim font-bold uppercase">{a.name}</p>
        </div>
        <button onClick={() => setView('menu')} className="text-text-dim text-xl">✕</button>
      </div>
      <div className="space-y-3 max-h-[60vh] overflow-y-auto">
        {repairs.length === 0 && <p className="py-10 text-center text-[11px] text-text-dim">No hay arreglos registrados.</p>}
        {repairs.slice().reverse().map(r => (
          <div key={r.id} className="bg-bg-accent/40 border border-border-dim rounded-xl p-3">
            <div className="flex justify-between items-start mb-1">
              <p className="text-[12px] font-bold text-text-main">{r.description}</p>
              <span className="text-[10px] font-black text-red-500 ml-2 whitespace-nowrap">${fmt(r.total_cost)}</span>
            </div>
            <p className="text-[10px] text-text-dim font-bold">{r.responsible} · {r.date}</p>
          </div>
        ))}
      </div>
      <button onClick={() => setView('form')} className="w-full mt-4 py-3 bg-brand-500 text-white rounded-xl text-[11px] font-black uppercase tracking-widest">Nuevo arreglo</button>
    </div>
  );

  // Formulario de carga de arreglo
  return wrap(
    <div className="bg-bg-card border border-border-dim rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-border-dim">
        <div>
          <p className="text-[14px] font-black text-text-main uppercase">{a.name}</p>
          <p className="text-[10px] font-black text-brand-500 uppercase tracking-widest">{a.branch}</p>
        </div>
        <button onClick={() => setView('menu')} className="text-text-dim text-xl">✕</button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Tipo de técnico</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button onClick={() => setForm({ ...form, responsibleType: 'interno' })}
              className={`py-2.5 rounded-xl text-[11px] font-black uppercase border transition-all ${form.responsibleType === 'interno' ? 'bg-brand-500/10 border-brand-500 text-brand-500' : 'bg-bg-accent border-border-dim text-text-dim'}`}>Interno</button>
            <button onClick={() => setForm({ ...form, responsibleType: 'tercerizado' })}
              className={`py-2.5 rounded-xl text-[11px] font-black uppercase border transition-all ${form.responsibleType === 'tercerizado' ? 'bg-brand-500/10 border-brand-500 text-brand-500' : 'bg-bg-accent border-border-dim text-text-dim'}`}>Tercerizado</button>
          </div>
        </div>
        <div>
          <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Nombre del responsable</label>
          <input value={form.responsible} onChange={e => setForm({ ...form, responsible: e.target.value })} placeholder="Ej: Juan Pérez"
            className="w-full mt-1 bg-bg-accent border border-border-dim rounded-xl px-3 py-2.5 text-[12px] text-text-main outline-none focus:border-brand-500" />
        </div>
        <div>
          <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Descripción del trabajo</label>
          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Ej: Cambio de pieza..."
            className="w-full mt-1 bg-bg-accent border border-border-dim rounded-xl px-3 py-2.5 text-[12px] text-text-main outline-none focus:border-brand-500 min-h-[70px]" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Mano de obra ($)</label>
            <input type="number" value={form.laborCost} onChange={e => setForm({ ...form, laborCost: e.target.value })} placeholder="0"
              className="w-full mt-1 bg-bg-accent border border-border-dim rounded-xl px-3 py-2.5 text-[12px] text-text-main outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Repuestos ($)</label>
            <input type="number" value={form.partsCost} onChange={e => setForm({ ...form, partsCost: e.target.value })} placeholder="0"
              className="w-full mt-1 bg-bg-accent border border-border-dim rounded-xl px-3 py-2.5 text-[12px] text-text-main outline-none focus:border-brand-500" />
          </div>
        </div>
        <div>
          <label className="text-[9px] font-black uppercase text-text-dim tracking-widest">Método de pago</label>
          <select value={form.payType} onChange={e => setForm({ ...form, payType: e.target.value })}
            className="w-full mt-1 bg-bg-accent border border-border-dim rounded-xl px-3 py-2.5 text-[12px] text-text-main outline-none focus:border-brand-500">
            {Object.entries(PAY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="bg-bg-accent/40 border border-border-dim rounded-xl p-3 flex justify-between items-center">
          <span className="text-[11px] font-black text-text-dim uppercase tracking-widest">Gasto total</span>
          <span className="text-xl font-black text-text-main">${fmt(total)}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button onClick={() => setView('menu')} className="py-3 bg-bg-accent text-text-dim rounded-xl text-[11px] font-black uppercase tracking-widest">Volver</button>
          <button onClick={submit} disabled={saving} className="py-3 bg-brand-500 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-brand-600 disabled:opacity-60">
            {saving ? 'Guardando…' : 'Guardar trabajo'}
          </button>
        </div>
      </div>
    </div>
  );
}
