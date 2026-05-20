-- SQL Schema for Supabase Setup
-- Run this in the SQL Editor of your Supabase project

-- 1. Insumos (Stock Items)
CREATE TABLE stock_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  cost NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Productos (Products)
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Recetas (Recipes)
CREATE TABLE recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  item_id UUID REFERENCES stock_items(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Ventas (Sales)
CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT NOT NULL,
  date DATE NOT NULL,
  type TEXT NOT NULL,
  pesos NUMERIC NOT NULL DEFAULT 0,
  net_sales NUMERIC NOT NULL DEFAULT 0,
  orders INTEGER DEFAULT 0,
  covers INTEGER DEFAULT 0,
  projection NUMERIC DEFAULT 0,
  week TEXT,
  day_name TEXT,
  cash NUMERIC DEFAULT 0,
  card NUMERIC DEFAULT 0,
  qr NUMERIC DEFAULT 0,
  iva NUMERIC DEFAULT 0,
  product_ranking JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Sucursales (Branches)
CREATE TABLE branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  is_active BOOLEAN DEFAULT true,
  google_maps_url TEXT,
  google_review_url TEXT,
  google_place_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Inventario Sucursal (Stock Inventory)
CREATE TABLE inventory_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT NOT NULL,
  item_id UUID REFERENCES stock_items(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  ei NUMERIC DEFAULT 0,
  ef NUMERIC DEFAULT 0,
  prestamos NUMERIC DEFAULT 0,
  consumo_personal NUMERIC DEFAULT 0,
  ventas_teorico NUMERIC DEFAULT 0,
  decomisos NUMERIC DEFAULT 0,
  compras NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(branch_id, item_id, date)
);

CREATE TABLE inventory_purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT NOT NULL,
  item_id UUID REFERENCES stock_items(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL, -- 'compra', 'movimiento'
  quantity NUMERIC NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Horas y Sueldos (Payroll)
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT NOT NULL,
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  hourly_rate NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE hour_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  position TEXT NOT NULL,
  date DATE NOT NULL,
  hours_planned NUMERIC DEFAULT 0,
  hours_actual NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Finanzas (Finance)
CREATE TABLE finance_projections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  month TEXT NOT NULL, -- YYYY-MM
  category TEXT NOT NULL,
  estimated_amount NUMERIC DEFAULT 0,
  actual_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE payment_schedule (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  provider TEXT NOT NULL,
  amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pendiente', -- 'pendiente', 'pagado'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Supervisión y Calidad
CREATE TABLE supervision_checklists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE supervision_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT NOT NULL,
  checklist_id UUID REFERENCES supervision_checklists(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_score NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. Vajilla
CREATE TABLE tableware_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  ideal_stock INTEGER DEFAULT 0,
  critical_stock INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE tableware_inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT NOT NULL,
  item_id UUID REFERENCES tableware_items(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  initial_stock INTEGER DEFAULT 0,
  final_stock INTEGER DEFAULT 0,
  breakages INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(branch_id, item_id, date)
);

-- 11. Centro de Producción
CREATE TABLE production_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  category TEXT DEFAULT 'GENERAL',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE production_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID REFERENCES production_items(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  batch_number TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(item_id, date)
);

-- 12. Control de Stock Producción (Deposito Central)
CREATE TABLE production_supplies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE production_stock_control (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supply_id UUID REFERENCES production_supplies(id) ON DELETE CASCADE,
  week_range TEXT NOT NULL, -- '1 al 7', '8 al 14', etc.
  month TEXT NOT NULL,      -- YYYY-MM
  initial_existence NUMERIC DEFAULT 0,
  production_purchases NUMERIC DEFAULT 0,
  internal_movements NUMERIC DEFAULT 0,
  wastage NUMERIC DEFAULT 0,
  personal_consumption NUMERIC DEFAULT 0,
  recovery NUMERIC DEFAULT 0,
  staff_purchases NUMERIC DEFAULT 0,
  final_existence NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(supply_id, week_range, month)
);

-- 13. Otros (Documents, News, Passwords, Recipes etc)
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT, -- Nullable for global docs
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE news (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  importance TEXT DEFAULT 'normal',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE passwords (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE menu_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_type TEXT NOT NULL, -- 'salon', 'celiacos', 'pedidosya'
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC DEFAULT 0,
  last_update DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 15. Perfiles (Users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  role TEXT NOT NULL, -- 'encargado', 'supervisor', 'administrativo', 'dueño'
  branch_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Realtime for everything
ALTER PUBLICATION supabase_realtime ADD TABLE menu_items;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE stock_items;
ALTER PUBLICATION supabase_realtime ADD TABLE products;
ALTER PUBLICATION supabase_realtime ADD TABLE recipes;
ALTER PUBLICATION supabase_realtime ADD TABLE sales;
ALTER PUBLICATION supabase_realtime ADD TABLE branches;
ALTER PUBLICATION supabase_realtime ADD TABLE inventory_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE inventory_purchases;
ALTER PUBLICATION supabase_realtime ADD TABLE hour_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE employees;
ALTER PUBLICATION supabase_realtime ADD TABLE finance_projections;
ALTER PUBLICATION supabase_realtime ADD TABLE payment_schedule;
ALTER PUBLICATION supabase_realtime ADD TABLE supervision_checklists;
ALTER PUBLICATION supabase_realtime ADD TABLE supervision_responses;
ALTER PUBLICATION supabase_realtime ADD TABLE tableware_items;
ALTER PUBLICATION supabase_realtime ADD TABLE tableware_inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE production_items;
ALTER PUBLICATION supabase_realtime ADD TABLE production_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE production_supplies;
ALTER PUBLICATION supabase_realtime ADD TABLE production_stock_control;
ALTER PUBLICATION supabase_realtime ADD TABLE documents;
ALTER PUBLICATION supabase_realtime ADD TABLE news;
ALTER PUBLICATION supabase_realtime ADD TABLE passwords;

-- 16. Disable RLS for all tables (Allow all operations for development)
ALTER TABLE stock_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE recipes DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales DISABLE ROW LEVEL SECURITY;
ALTER TABLE branches DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_purchases DISABLE ROW LEVEL SECURITY;
ALTER TABLE employees DISABLE ROW LEVEL SECURITY;
ALTER TABLE hour_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE finance_projections DISABLE ROW LEVEL SECURITY;
ALTER TABLE payment_schedule DISABLE ROW LEVEL SECURITY;
ALTER TABLE supervision_checklists DISABLE ROW LEVEL SECURITY;
ALTER TABLE supervision_responses DISABLE ROW LEVEL SECURITY;
ALTER TABLE tableware_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE tableware_inventory DISABLE ROW LEVEL SECURITY;
ALTER TABLE production_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE production_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE production_supplies DISABLE ROW LEVEL SECURITY;
ALTER TABLE production_stock_control DISABLE ROW LEVEL SECURITY;
ALTER TABLE documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE news DISABLE ROW LEVEL SECURITY;
ALTER TABLE passwords DISABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- 17. Monthly Controlled Items for Deviations
CREATE TABLE monthly_controlled_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT NOT NULL,
  month TEXT NOT NULL, -- YYYY-MM
  item_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(branch_id, month)
);

ALTER PUBLICATION supabase_realtime ADD TABLE monthly_controlled_items;
ALTER TABLE monthly_controlled_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access for monthly_controlled_items" ON monthly_controlled_items FOR ALL USING (true) WITH CHECK (true);

-- 18. Daily Stock Logs for granular control (Optional, keeping as legacy or extra)
CREATE TABLE daily_stock_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  date DATE NOT NULL,
  initial_stock DECIMAL DEFAULT 0,
  purchases DECIMAL DEFAULT 0,
  waste DECIMAL DEFAULT 0, -- Decomisos
  loans DECIMAL DEFAULT 0, -- Préstamos (negativo si presta out, positivo si recibe in)
  staff_consumption DECIMAL DEFAULT 0,
  theoretical_sales DECIMAL DEFAULT 0,
  final_stock DECIMAL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(branch_id, item_id, date)
);

ALTER PUBLICATION supabase_realtime ADD TABLE daily_stock_logs;
ALTER TABLE daily_stock_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access for daily_stock_logs" ON daily_stock_logs FOR ALL USING (true) WITH CHECK (true);

-- Ensure all columns exist in the sales table
ALTER TABLE sales ADD COLUMN IF NOT EXISTS projection NUMERIC DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cash NUMERIC DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS card NUMERIC DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS qr NUMERIC DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS iva NUMERIC DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS week TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS day_name TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS product_ranking JSONB DEFAULT '[]'::jsonb;

-- 19. Inventory Week Closures (Fijar tipos)
CREATE TABLE IF NOT EXISTS inventory_week_closures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT NOT NULL,
  month TEXT NOT NULL, -- YYYY-MM
  week_number INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(branch_id, month, week_number)
);

-- Publicación (Seguro)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'inventory_week_closures') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE inventory_week_closures;
    END IF;
END $$;

ALTER TABLE inventory_week_closures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public access for inventory_week_closures" ON inventory_week_closures;
CREATE POLICY "Allow public access for inventory_week_closures" ON inventory_week_closures FOR ALL USING (true) WITH CHECK (true);

-- 20. Product Rankings
CREATE TABLE IF NOT EXISTS product_rankings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT NOT NULL,
  date DATE NOT NULL,
  product_code TEXT,
  product_name TEXT NOT NULL,
  quantity NUMERIC DEFAULT 0,
  amount NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'product_rankings') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE product_rankings;
    END IF;
END $$;

-- also Ensure inventory_logs has public policy
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access for inventory_logs" ON inventory_logs FOR ALL USING (true) WITH CHECK (true);
