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

  constructor(table: string) {
    this.table = table;
  }

  select(fields?: string) {
    this.action = 'select';
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
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) items = JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }

    if (items.length === 0) {
      items = this.getDefaultSeeds();
      if (items.length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(items));
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
      localStorage.setItem(storageKey, JSON.stringify(items));
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
      localStorage.setItem(storageKey, JSON.stringify(items));
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
      localStorage.setItem(storageKey, JSON.stringify(remaining));
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
      localStorage.setItem(storageKey, JSON.stringify(items));
      return { data: upserted, error: null };
    }

    return { data: null, error: 'Unknown action' };
  }

  private getDefaultSeeds(): any[] {
    if (this.table === 'branches') {
      return [
        { id: 'bn', name: 'Barrio Norte', location: 'Av. Belgrano 123, Tucumán', is_active: true, google_maps_url: 'https://www.google.com/maps/place/CRAFT+Barrio+Norte/data=!4m2!3m1!1s0x0:0x1fdb8452ca845bc1?sa=X&ved=1t:2428&ictx=111' },
        { id: 'bs', name: 'Barrio Sur', location: 'San Lorenzo 456, Tucumán', is_active: true },
        { id: 'mt', name: 'Casco Viejo', location: 'San Lorenzo 207, Yerba Buena, Tucumán', is_active: true, google_place_id: 'ChIJz3uE95S6U5YRMmP_V1kY9B0' },
        { id: 'pn', name: 'Perón', location: 'Av. Perón 1000, Yerba Buena', is_active: true },
        { id: 'ml', name: 'Mate de Luna', location: 'Av. Mate de Luna 2000, Tucumán', is_active: true },
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

if (isMissingCredentials) {
  console.warn('Supabase credentials missing or invalid. Utilizing fully-functional client-side Local/Offline Emulator for seamless storage operations.');
}

// Export emulated client when config is missing; otherwise use real Supabase client.
export const supabase = (isMissingCredentials ? localSupabaseEmulator : createClient(supabaseUrl, supabaseAnonKey)) as any;
