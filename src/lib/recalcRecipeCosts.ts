/**
 * SPDX-License-Identifier: Apache-2.0
 * Recalcula y GUARDA el costo de todas las recetas y platos a partir de los costos
 * actuales del Maestro de Insumos, propagando de abajo hacia arriba:
 *   insumo → receta producción → receta sucursal → plato de carta.
 * Escribe el resultado en recipe_masters.cost (producción/sucursal) y products.cost (carta).
 * Devuelve un resumen para mostrar al usuario.
 */
import { supabase } from './supabase';

const parseQty = (v: any): number => {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const s = String(v).trim();
  if (s === '') return 0;
  const n = parseFloat(s.replace(/\./g, s.includes(',') ? '' : '.').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

export interface RecalcResult { recetas: number; platos: number; sinMatch: number; }

export async function recalcularCostosRecetas(): Promise<RecalcResult> {
  // 1) Costo base por código = insumos (stock_items)
  const cost: Record<string, number> = {};
  const { data: sitems } = await supabase.from('stock_items').select('code, cost');
  (sitems || []).forEach((i: any) => {
    if (i.code != null && String(i.code).trim() !== '') cost[String(i.code).trim()] = Number(i.cost) || 0;
  });

  // 2) Todas las recetas + sus insumos
  const { data: recs } = await supabase.from('op_recipes').select('id, tipo, name, code');
  const allRecs = (recs || []) as any[];
  const itemsBy: Record<string, any[]> = {};
  let from = 0; const page = 1000;
  while (allRecs.length > 0) {
    const { data } = await supabase.from('op_recipe_items').select('recipe_id, code, quantity').range(from, from + page - 1);
    const chunk = data || [];
    chunk.forEach((it: any) => { (itemsBy[it.recipe_id] = itemsBy[it.recipe_id] || []).push(it); });
    if (chunk.length < page) break;
    from += page;
  }

  // 3) Punto fijo: costo de cada receta = suma de (costo del código × cantidad),
  //    repetido hasta estabilizar (resuelve recetas dentro de recetas).
  const computed: Record<string, number> = {};
  for (let iter = 0; iter < 12; iter++) {
    let changed = false;
    allRecs.forEach(r => {
      const its = itemsBy[r.id] || [];
      const c = its.reduce((s: number, it: any) => s + (cost[String(it.code || '').trim()] || 0) * parseQty(it.quantity), 0);
      computed[r.id] = c;
      const key = String(r.code || '').trim();
      if (key && cost[key] !== c) { cost[key] = c; changed = true; }
    });
    if (!changed) break;
  }

  // 4) Escribir el costo en los maestros: recipe_masters (prod/suc) y products (carta)
  const [{ data: rmData }, { data: prData }] = await Promise.all([
    supabase.from('recipe_masters').select('id, tipo, name, code'),
    supabase.from('products').select('id, name, code'),
  ]);
  const norm = (s: any) => String(s || '').trim().toUpperCase();
  const rmByKey: Record<string, string> = {}; const rmByCode: Record<string, string> = {};
  (rmData || []).forEach((m: any) => { rmByKey[`${m.tipo}|${norm(m.name)}`] = m.id; if (m.code) rmByCode[String(m.code).trim()] = m.id; });
  const prByName: Record<string, string> = {}; const prByCode: Record<string, string> = {};
  (prData || []).forEach((p: any) => { prByName[norm(p.name)] = p.id; if (p.code) prByCode[String(p.code).trim()] = p.id; });

  const rmUpd: { id: string; cost: number }[] = [];
  const prUpd: { id: string; cost: number }[] = [];
  let sinMatch = 0;
  allRecs.forEach(r => {
    const c = Math.round((computed[r.id] || 0) * 100) / 100;
    if (r.tipo === 'carta') {
      const id = (r.code && prByCode[String(r.code).trim()]) || prByName[norm(r.name)];
      if (id) prUpd.push({ id, cost: c }); else sinMatch++;
    } else {
      const id = (r.code && rmByCode[String(r.code).trim()]) || rmByKey[`${r.tipo}|${norm(r.name)}`];
      if (id) rmUpd.push({ id, cost: c }); else sinMatch++;
    }
  });

  for (let i = 0; i < rmUpd.length; i += 25) {
    await Promise.all(rmUpd.slice(i, i + 25).map(u => supabase.from('recipe_masters').update({ cost: u.cost }).eq('id', u.id)));
  }
  for (let i = 0; i < prUpd.length; i += 25) {
    await Promise.all(prUpd.slice(i, i + 25).map(u => supabase.from('products').update({ cost: u.cost }).eq('id', u.id)));
  }

  return { recetas: rmUpd.length, platos: prUpd.length, sinMatch };
}
