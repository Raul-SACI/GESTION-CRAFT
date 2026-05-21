import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log("Checking columns of 'sales' table");
  const { data, error } = await supabase
    .from('sales')
    .select('*')
    .limit(1);

  if (error) {
    console.error("Error:", error);
    return;
  }

  if (data && data.length > 0) {
    console.log("Keys in sales row:", Object.keys(data[0]));
  } else {
    console.log("No data in sales row to inspect keys.");
  }
}

run();
