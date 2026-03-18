import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://qjbqsavyfsfanutlediy.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqYnFzYXZ5ZnNmYW51dGxlZGl5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjgxMzY5NSwiZXhwIjoyMDg4Mzg5Njk1fQ.j5-EDWfImSLyXa8aeU2vLMzVbjxGwObhF3NnRQZ5vxk');

async function main() {
  const { data, error } = await supabase
    .from('token_fees')
    .select('*')
    .ilike('token_symbol', '%WCITY%')
    .eq('platform', 'bags');
    
  if (error) console.error("Error:", error);
  else console.log(JSON.stringify(data, null, 2));
}

main();
