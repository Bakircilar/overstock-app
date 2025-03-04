// supabaseClient.js
import { createClient } from '@supabase/supabase-js';

// Supabase panelinden aldığın URL (https://SENIN_PROJE_ID.supabase.co gibi)
const supabaseUrl = 'https://ejcbyezbnxboapgjxxfn.supabase.co';

// Supabase panelinden aldığın "anon key"
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqY2J5ZXpibnhib2FwZ2p4eGZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDEwODEzNTYsImV4cCI6MjA1NjY1NzM1Nn0.M5eYPUscehLSoSs1DOXS6CZBBG9v4J15pQy59VnoSVE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
