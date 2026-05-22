import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log("Checking if we can select 'week' and 'day_name' from sales table directly...");
  const { data, error } = await supabase
    .from('sales')
    .select('id, date, pesos, week, day_name')
    .limit(5);

  if (error) {
    console.error("Select error:", error);
  } else {
    console.log("Sample rows with week/day_name values in DB:", data);
  }

  // Let's insert a test row with week and day_name to see if it succeeds
  const testId = '00000000-0000-0000-0000-000000000001';
  console.log("\nTrying to insert a test row with week and day_name...");
  const { error: insertError } = await supabase
    .from('sales')
    .insert([{
      id: testId,
      branch_id: 'bn',
      date: '2026-04-30',
      type: 'Turno Mañana',
      pesos: 0,
      net_sales: 0,
      orders: 0,
      covers: 0,
      projection: 0,
      week: 'Semana 4',
      day_name: 'Jue'
    }]);

  if (insertError) {
    console.error("Insert error with week/day_name:", insertError);
  } else {
    console.log("Insert with week/day_name was SUCCESSFUL!");
    // Clean up
    await supabase.from('sales').delete().eq('id', testId);
  }
}

run();
