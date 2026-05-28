/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isMissingCredentials = !supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder');

// --- INDEXEDDB STORAGE HELPER ---
const openIDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('supabase_offline_storage', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveFileToIDB = async (path: string, blob: Blob): Promise<void> => {
  const db = await openIDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('files', 'readwrite');
    const store = transaction.objectStore('files');
    const request = store.put(blob, path);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const getFileFromIDB = async (path: string): Promise<Blob> => {
  const db = await openIDB();
  return new Promise<Blob>((resolve, reject) => {
    const transaction = db.transaction('files', 'readonly');
    const store = transaction.objectStore('files');
    const request = store.get(path);
    request.onsuccess = () => {
      if (request.result) {
        resolve(request.result);
      } else {
        resolve(new Blob(['Simulated offline content for ' + path], { type: 'text/plain' }));
      }
    };
    request.onerror = () => reject(request.error);
  });
};

const deleteFileFromIDB = async (path: string): Promise<void> => {
  const db = await openIDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('files', 'readwrite');
    const store = transaction.objectStore('files');
    const request = store.delete(path);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// --- QUERY BUILDER FOR LOCALSTORAGE ---
class MockQueryBuilder {
  private table: string;
  private filters: Array<(item: any) => boolean> = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private sliceConfig?: { from: number; to: number };
  private action: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private actionData?: any;
  private singleRequested = false;
  private maybeSingleRequested = false;

  constructor(table: string) {
    this.table = table;
  }

  select(fields?: string) {
    this.action = 'select';
    return this;
  }

  single() {
    this.singleRequested = true;
    return this;
  }

  maybeSingle() {
    this.maybeSingleRequested = true;
    return this;
  }

  order(column: string, options?: { ascending: boolean }) {
    this.orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push(item => item[column] === value);
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push(item => item[column] !== value);
    return this;
  }

  in(column: string, values: any[]) {
    this.filters.push(item => values.includes(item[column]));
    return this;
  }

  gte(column: string, value: any) {
    this.filters.push(item => item[column] >= value);
    return this;
  }

  lte(column: string, value: any) {
    this.filters.push(item => item[column] <= value);
    return this;
  }

  gt(column: string, value: any) {
    this.filters.push(item => item[column] > value);
    return this;
  }

  lt(column: string, value: any) {
    this.filters.push(item => item[column] < value);
    return this;
  }

  like(column: string, pattern: string) {
    const escapedPattern = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regexPattern = '^' + escapedPattern.replace(/%/g, '.*') + '$';
    const regex = new RegExp(regexPattern, 'i');
    this.filters.push(item => {
      const val = item[column];
      if (val === undefined || val === null) return false;
      return regex.test(String(val));
    });
    return this;
  }

  range(from: number, to: number) {
    this.sliceConfig = { from, to };
    return this;
  }

  insert(values: any[], options?: any) {
    this.action = 'insert';
    this.actionData = values;
    return this;
  }

  update(values: any) {
    this.action = 'update';
    this.actionData = values;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  upsert(values: any, options?: any) {
    this.action = 'upsert';
    this.actionData = values;
    return this;
  }

  async then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    try {
      const result = await this.execute();
      if (onfulfilled) return onfulfilled(result);
      return result;
    } catch (err) {
      if (onrejected) return onrejected(err);
      throw err;
    }
  }

  private async execute() {
    const storageKey = `supabase_mock_${this.table}`;
    let items: any[] = [];
    let loadedFromServer = false;

    // Try fetching from server first
    try {
      const res = await fetch(`/api/mock-db/${this.table}`);
      if (res.ok) {
        const payload = await res.json();
        if (payload && Array.isArray(payload.data) && payload.data.length > 0) {
          let serverItems = payload.data;
          if (this.table === 'profiles') {
            const obsoleteIds = ['usr-patricio', 'usr-samuel', 'usr-marcela', 'usr-veronica', 'usr-franco', 'usr-manuel', 'usr-socio'];
            const obsoleteNames = ['PATRICIO BERNAT', 'SAMUEL RACEDO', 'MARCELA ROLDAN', 'VERONICA CREMONA', 'FRANCO LEON', 'MANUEL NOUGUES', 'SOCIO'];
            serverItems = serverItems.filter((u: any) => u && u.id && !obsoleteIds.includes(u.id) && !obsoleteNames.includes(u.name?.toUpperCase()));
          }
          items = serverItems;
          loadedFromServer = true;
          // Sync to localStorage as local cache
          try {
            localStorage.setItem(storageKey, JSON.stringify(items));
          } catch (e) {}
        }
      }
    } catch (e) {
      console.warn(`[Mock DB] Failed to fetch table '${this.table}' from server:`, e);
    }

    // Fallback to local storage if server didn't return any data (or request failed)
    if (!loadedFromServer) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          let cachedItems = JSON.parse(saved);
          if (this.table === 'profiles') {
            const obsoleteIds = ['usr-patricio', 'usr-samuel', 'usr-marcela', 'usr-veronica', 'usr-franco', 'usr-manuel', 'usr-socio'];
            const obsoleteNames = ['PATRICIO BERNAT', 'SAMUEL RACEDO', 'MARCELA ROLDAN', 'VERONICA CREMONA', 'FRANCO LEON', 'MANUEL NOUGUES', 'SOCIO'];
            cachedItems = cachedItems.filter((u: any) => u && u.id && !obsoleteIds.includes(u.id) && !obsoleteNames.includes(u.name?.toUpperCase()));
          }
          items = cachedItems;
        }
      } catch (e) {
        console.error(e);
      }
    }

    if (items.length === 0) {
      items = this.getDefaultSeeds();
      if (items.length > 0) {
        // Save seeds to server
        try {
          await fetch(`/api/mock-db/${this.table}/save`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: items }),
          });
        } catch (err) {}
        try {
          localStorage.setItem(storageKey, JSON.stringify(items));
        } catch (e) {}
      }
    } else if (this.table === 'roles_config') {
      const defaultSeeds = this.getDefaultSeeds();
      let changed = false;
      items = items.map(item => {
        const matchingSeed = defaultSeeds.find(s => s.id === item.id);
        if (matchingSeed) {
          const missingModules = matchingSeed.allowed_modules.filter(m => !item.allowed_modules.includes(m));
          const obsoleteModules = item.allowed_modules.filter(m => m === 'registro_visitas');
          if (missingModules.length > 0 || obsoleteModules.length > 0) {
            changed = true;
            return {
              ...item,
              allowed_modules: [
                ...item.allowed_modules.filter(m => m !== 'registro_visitas'),
                ...missingModules
              ]
            };
          }
        }
        return item;
      });
      if (changed) {
        try {
          await fetch(`/api/mock-db/${this.table}/save`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: items }),
          });
        } catch (err) {}
        try {
          localStorage.setItem(storageKey, JSON.stringify(items));
        } catch (e) {}
      }
    }

    if (this.action === 'select') {
      let filtered = [...items];
      for (const filter of this.filters) {
        filtered = filtered.filter(filter);
      }
      if (this.orders.length > 0) {
        filtered.sort((a, b) => {
          for (const ord of this.orders) {
            const { column, ascending } = ord;
            const valA = a[column];
            const valB = b[column];
            if (valA === undefined || valA === null) return 1;
            if (valB === undefined || valB === null) return -1;
            if (valA < valB) return ascending ? -1 : 1;
            if (valA > valB) return ascending ? 1 : -1;
          }
          return 0;
        });
      }
      if (this.sliceConfig) {
        const { from, to } = this.sliceConfig;
        filtered = filtered.slice(from, to + 1);
      }
      if (this.singleRequested) {
        if (filtered.length === 0) {
          return { data: null, error: { message: 'No rows found', code: 'PGRST116' } };
        }
        if (filtered.length > 1) {
          return { data: null, error: { message: 'More than one row returned', code: 'PGRST116' } };
        }
        return { data: filtered[0], error: null };
      }
      if (this.maybeSingleRequested) {
        if (filtered.length === 0) {
          return { data: null, error: null };
        }
        return { data: filtered[0], error: null };
      }
      return { data: filtered, error: null };
    }

    if (this.action === 'insert') {
      const newItems = Array.isArray(this.actionData) ? this.actionData : [this.actionData];
      const itemsToInsert = newItems.map((item: any) => ({
        id: item.id || crypto.randomUUID(),
        created_at: item.created_at || new Date().toISOString(),
        ...item
      }));
      items = [...items, ...itemsToInsert];
      
      try {
        await fetch(`/api/mock-db/${this.table}/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: items }),
        });
      } catch (err) {}
      try {
        localStorage.setItem(storageKey, JSON.stringify(items));
      } catch (e) {}
      
      return { data: itemsToInsert, error: null };
    }

    if (this.action === 'update') {
      let updatedCount = 0;
      items = items.map(item => {
        const matches = this.filters.every(filter => filter(item));
        if (matches) {
          updatedCount++;
          return { ...item, ...this.actionData, updated_at: new Date().toISOString() };
        }
        return item;
      });
      
      try {
        await fetch(`/api/mock-db/${this.table}/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: items }),
        });
      } catch (err) {}
      try {
        localStorage.setItem(storageKey, JSON.stringify(items));
      } catch (e) {}
      
      return { data: items, error: null, count: updatedCount };
    }

    if (this.action === 'delete') {
      const remaining: any[] = [];
      const deleted: any[] = [];
      for (const item of items) {
        const matches = this.filters.every(filter => filter(item));
        if (matches) {
          deleted.push(item);
        } else {
          remaining.push(item);
        }
      }
      
      try {
        await fetch(`/api/mock-db/${this.table}/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: remaining }),
        });
      } catch (err) {}
      try {
        localStorage.setItem(storageKey, JSON.stringify(remaining));
      } catch (e) {}
      
      return { data: deleted, error: null };
    }

    if (this.action === 'upsert') {
      const payload = Array.isArray(this.actionData) ? this.actionData : [this.actionData];
      const upserted: any[] = [];
      for (const item of payload) {
        const idx = item.id ? items.findIndex(x => x.id === item.id) : -1;
        if (idx !== -1) {
          items[idx] = { ...items[idx], ...item, updated_at: new Date().toISOString() };
          upserted.push(items[idx]);
        } else {
          const newItem = {
            id: item.id || crypto.randomUUID(),
            created_at: item.created_at || new Date().toISOString(),
            ...item
          };
          items.push(newItem);
          upserted.push(newItem);
        }
      }
      
      try {
        await fetch(`/api/mock-db/${this.table}/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: items }),
        });
      } catch (err) {}
      try {
        localStorage.setItem(storageKey, JSON.stringify(items));
      } catch (e) {}
      
      return { data: upserted, error: null };
    }

    return { data: null, error: 'Unknown action' };
  }

  private getDefaultSeeds(): any[] {
    if (this.table === 'branches') {
      return [
        { id: 'bn', name: 'CRAFT Barrio Norte', location: 'Av. Belgrano 123, Tucumán', is_active: true, google_maps_url: 'https://www.google.com/maps/place/CRAFT+Barrio+Norte/data=!4m2!3m1!1s0x0:0x1fdb8452ca845bc1?sa=X&ved=1t:2428&ictx=111', google_rating: 4.7, google_rating_count: 7399 },
        { id: 'bs', name: 'CRAFT Barrio Sur', location: 'Batalla de Chacabuco 688, Tucumán', is_active: true, google_rating: 4.9, google_rating_count: 778 },
        { id: 'mt', name: 'CRAFT Mercato', location: 'San Lorenzo 207, Yerba Buena, Tucumán', is_active: true, google_place_id: 'ChIJz3uE95S6U5YRMmP_V1kY9B0', google_rating: 4.5, google_rating_count: 3410 },
        { id: 'pn', name: 'CRAFT Perón', location: 'Av. Perón 1000, Yerba Buena', is_active: true, google_rating: 4.5, google_rating_count: 1890 },
        { id: 'ml', name: 'CRAFT Mate de Luna', location: 'Av. Mate de Luna 2000, Tucumán', is_active: true, google_rating: 4.4, google_rating_count: 2750 },
      ];
    }
    if (this.table === 'documents') {
      return [
        { id: 'fld-1', name: 'LIQUIDACIONES', type: 'folder', parent_id: null, branch_id: null, created_at: new Date().toISOString() },
        { id: 'fld-2', name: 'CONTRATOS', type: 'folder', parent_id: null, branch_id: null, created_at: new Date().toISOString() },
        { id: 'fld-3', name: 'PROVEEDORES', type: 'folder', parent_id: null, branch_id: null, created_at: new Date().toISOString() },
      ];
    }
    if (this.table === 'news') {
      return [
        { id: 'news-1', branch_id: 'bn', title: 'Bitácora - 22/5/2026', content: 'REVISIÓN DE REFRIGERADORES DE COCINA COMPLETADO. FUNCIÓN OK.', importance: 'normal', created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
        { id: 'news-2', branch_id: 'bs', title: 'Bitácora - 23/5/2026', content: 'MANTENIMIENTO DEL EXTRACTOR TERMINADO.', importance: 'normal', created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
      ];
    }
    if (this.table === 'roles_config') {
      return [
        {
          id: 'administrador',
          name: 'Administrador',
          description: 'Acceso total de lectura y edición. Único rol que accede a Configuración.',
          is_read_only: false,
          access_scope: 'all_branches',
          allowed_modules: ['socios_dashboard', 'dashboard', 'stock', 'desempeño', 'vajilla', 'horas', 'novedades', 'decomisos', 'papeles_sucursal', 'cuentas', 'control_horas', 'gestion_sueldos', 'presupuesto_horas', 'agenda', 'supervisiones_operativas', 'registro_supervision', 'produccion_mes', 'produccion_stock_control', 'bank_liabilities', 'tax_liabilities', 'cronograma_pagos', 'finanzas_mensual', 'ventas', 'consumo', 'control_desvios', 'supervision_banderas', 'papeles_administracion', 'aprobacion_presupuestos', 'finanzas_estimado', 'precios', 'p&l', 'performance_admin', 'sucursales', 'usuarios']
        },
        {
          id: 'socio',
          name: 'Socio',
          description: 'Acceso completo al sistema pero restringido a modo Solo Lectura.',
          is_read_only: true,
          access_scope: 'all_branches',
          allowed_modules: ['socios_dashboard', 'dashboard', 'stock', 'desempeño', 'vajilla', 'horas', 'novedades', 'decomisos', 'papeles_sucursal', 'cuentas', 'control_horas', 'gestion_sueldos', 'presupuesto_horas', 'agenda', 'supervisiones_operativas', 'registro_supervision', 'produccion_mes', 'produccion_stock_control', 'bank_liabilities', 'tax_liabilities', 'cronograma_pagos', 'finanzas_mensual', 'ventas', 'consumo', 'control_desvios', 'supervision_banderas', 'papeles_administracion', 'aprobacion_presupuestos', 'finanzas_estimado', 'precios', 'p&l', 'performance_admin']
        },
        {
          id: 'encargado',
          name: 'Encargado de Sucursal',
          description: 'Solo puede cargar y ver los módulos de su propia sucursal asignada.',
          is_read_only: false,
          access_scope: 'single_branch',
          allowed_modules: ['dashboard', 'stock', 'desempeño', 'vajilla', 'horas', 'novedades', 'decomisos', 'papeles_sucursal', 'cuentas']
        },
        {
          id: 'lider_operativo',
          name: 'Líder Operativo',
          description: 'Acceso a todas las sucursales, Agenda Supervisores, Supervisiones y Presupuesto.',
          is_read_only: false,
          access_scope: 'all_branches',
          allowed_modules: ['dashboard', 'stock', 'desempeño', 'vajilla', 'horas', 'novedades', 'decomisos', 'papeles_sucursal', 'presupuesto_horas', 'agenda', 'supervisiones_operativas', 'registro_supervision']
        },
        {
          id: 'lider_cocina',
          name: 'Líder de Cocina',
          description: 'Acceso a todas las sucursales, Agenda Supervisores, y Centro de Producción.',
          is_read_only: false,
          access_scope: 'all_branches',
          allowed_modules: ['dashboard', 'stock', 'desempeño', 'vajilla', 'horas', 'presupuesto_horas', 'agenda', 'supervisiones_operativas', 'registro_supervision', 'produccion_mes', 'produccion_stock_control']
        },
        {
          id: 'recursos_humanos',
          name: 'Recursos Humanos',
          description: 'Acceso completo a la sección de Recursos Humanos para todas las sucursales.',
          is_read_only: false,
          access_scope: 'all_branches',
          allowed_modules: ['control_horas', 'gestion_sueldos']
        }
      ];
    }
    if (this.table === 'profiles') {
      return [
        { id: 'usr-raul', name: 'RAUL DIAZ', role: 'administrador', branch_name: 'TODAS LAS SUCURSALES', permissions: [], password: '' }
      ];
    }
    return [];
  }
}

// --- MOCK STORAGE CLIENT ---
const mockStorageClient = {
  from: (bucket: string) => ({
    upload: async (path: string, file: File | Blob) => {
      try {
        await saveFileToIDB(path, file);
        return { data: { path }, error: null };
      } catch (err: any) {
        console.error('Offline storage upload error:', err);
        return { data: null, error: err };
      }
    },
    download: async (path: string) => {
      try {
        const data = await getFileFromIDB(path);
        return { data, error: null };
      } catch (err: any) {
        console.error('Offline storage download error:', err);
        return { data: null, error: err };
      }
    },
    remove: async (paths: string[]) => {
      try {
        for (const path of paths) {
          await deleteFileFromIDB(path);
        }
        return { data: paths, error: null };
      } catch (err: any) {
        console.error('Offline storage remove error:', err);
        return { data: null, error: err };
      }
    }
  })
};

// --- MOCK REALTIME CHANNEL ---
const mockChannel = {
  on: function() { return this; },
  subscribe: function(callback?: any) {
    if (callback) callback('SUBSCRIBED');
    return this;
  }
};

// --- EMULATED CLIENT CONTAINER ---
const localSupabaseEmulator = {
  from: (table: string) => new MockQueryBuilder(table),
  storage: mockStorageClient,
  channel: (name: string) => mockChannel,
  removeChannel: (channel: any) => {}
};

// --- SMART PROXY FOR HYBRID REMOTE/LOCAL FAILOVER ---
const failedRemoteTables = new Set<string>();
const LOADED_FAILED_TABLES_KEY = 'supabase_failed_remote_tables';

try {
  const loaded = localStorage.getItem(LOADED_FAILED_TABLES_KEY);
  if (loaded) {
    const list = JSON.parse(loaded);
    if (Array.isArray(list)) {
      list.forEach(t => failedRemoteTables.add(t));
    }
  }
} catch (e) {
  console.error('[Supabase Fallback] Error reading initially failed tables:', e);
}

const markTableAsFailed = (table: string) => {
  if (!failedRemoteTables.has(table)) {
    failedRemoteTables.add(table);
    try {
      localStorage.setItem(LOADED_FAILED_TABLES_KEY, JSON.stringify(Array.from(failedRemoteTables)));
    } catch (e) {
      console.error('[Supabase Fallback] Error saving failed tables list:', e);
    }
  }
};

class SmartQueryChain {
  constructor(
    public table: string,
    public realChain: any,
    public mockChain: any
  ) {}

  static create(table: string, realChain: any, mockChain?: any) {
    const actualMockChain = mockChain || new MockQueryBuilder(table);
    const instance = new SmartQueryChain(table, realChain, actualMockChain);
    return new Proxy(instance, {
      get(target, prop) {
        if (prop === 'then') {
          return async (onfulfilled?: any, onrejected?: any) => {
            if (failedRemoteTables.has(target.table)) {
              const mockRes = await target.mockChain;
              if (onfulfilled) return onfulfilled(mockRes);
              return mockRes;
            }
            try {
              let res = await target.realChain;
              if (res && res.error) {
                const errMsg = String(res.error.message || '');
                const errCode = String(res.error.code || '');
                if (
                  errMsg.includes('Could not find the table') ||
                  errMsg.includes('schema cache') ||
                  errMsg.includes('column') ||
                  errMsg.includes('relation') ||
                  errCode === '42P01' || // undefined_table
                  errCode === '42703' || // undefined_column
                  errCode === 'PGRST116' ||
                  errCode === 'PGRST114'
                ) {
                  console.warn(`[Supabase Fallback] Schema or validation error on table '${target.table}'. Marking as failed remote and falling back to Local Emulator.`);
                  markTableAsFailed(target.table);
                  const mockRes = await target.mockChain;
                  if (onfulfilled) return onfulfilled(mockRes);
                  return mockRes;
                }
              }
              // Intercept real Supabase query results to filter out obsolete profiles
              if (res && Array.isArray(res.data) && target.table === 'profiles') {
                const obsoleteIds = ['usr-patricio', 'usr-samuel', 'usr-marcela', 'usr-veronica', 'usr-franco', 'usr-manuel', 'usr-socio'];
                const obsoleteNames = ['PATRICIO BERNAT', 'SAMUEL RACEDO', 'MARCELA ROLDAN', 'VERONICA CREMONA', 'FRANCO LEON', 'MANUEL NOUGUES', 'SOCIO'];
                res.data = res.data.filter((u: any) => u && u.id && !obsoleteIds.includes(u.id) && !obsoleteNames.includes(u.name?.toUpperCase()));
              }
              if (onfulfilled) return onfulfilled(res);
              return res;
            } catch (err: any) {
              const errMsg = String(err?.message || '');
              const errCode = String(err?.code || err?.statusCode || '');
              if (
                errMsg.includes('Could not find the table') ||
                errMsg.includes('schema cache') ||
                errMsg.includes('column') ||
                errMsg.includes('relation') ||
                errCode === '42P01' ||
                errCode === '42703' ||
                errCode === 'PGRST116' ||
                errCode === 'PGRST114'
              ) {
                console.warn(`[Supabase Fallback] Executing query threw table/relation/column error on '${target.table}'. Marking as failed remote and falling back to Local Emulator.`, err);
                markTableAsFailed(target.table);
                const mockRes = await target.mockChain;
                if (onfulfilled) return onfulfilled(mockRes);
                return mockRes;
              }
              if (onrejected) return onrejected(err);
              throw err;
            }
          };
        }

        const realProp = target.realChain[prop];
        if (typeof realProp === 'function') {
          return (...args: any[]) => {
            const nextReal = realProp.apply(target.realChain, args);
            // Check if mockChain has this method, otherwise skip
            let nextMock = target.mockChain;
            if (target.mockChain && typeof target.mockChain[prop] === 'function') {
              nextMock = target.mockChain[prop].apply(target.mockChain, args);
            }
            return SmartQueryChain.create(target.table, nextReal, nextMock);
          };
        }

        return realProp;
      }
    }) as any;
  }
}

if (isMissingCredentials) {
  console.warn('Supabase credentials missing or invalid. Utilizing fully-functional client-side Local/Offline Emulator for seamless storage operations.');
}

const realSupabaseClient = isMissingCredentials
  ? localSupabaseEmulator
  : createClient(supabaseUrl, supabaseAnonKey);

export const supabase = new Proxy(realSupabaseClient, {
  get(target, prop) {
    if (prop === 'from') {
      return (table: string) => {
        if (isMissingCredentials || failedRemoteTables.has(table)) {
          return localSupabaseEmulator.from(table);
        }
        const realChain = target.from(table);
        return SmartQueryChain.create(table, realChain);
      };
    }
    return (target as any)[prop];
  }
}) as any;
