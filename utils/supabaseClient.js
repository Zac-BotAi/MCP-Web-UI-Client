// utils/supabaseClient.js (CommonJS)
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

let supabase = null;

if (!supabaseUrl) {
  // console.warn('Warning: SUPABASE_URL environment variable is not set.'); // Reduced console noise for default state
}
if (!supabaseAnonKey) {
  // console.warn('Warning: SUPABASE_ANON_KEY environment variable is not set.'); // Reduced console noise
}

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      // autoRefreshToken: true, // Handled by Supabase client by default
      persistSession: false, // Server-side: typically don't persist session in client, rely on JWTs passed in headers
      detectSessionInUrl: false // Server-side: typically false, not relevant for URL-based session detection
    }
  });
  console.log('Supabase client initialized.');
} else {
  // This is an expected state if .env is not configured, so making it less alarming.
  console.log('Supabase client not initialized. SUPABASE_URL or SUPABASE_ANON_KEY are missing. This is normal if not using Supabase features.');
}

module.exports = { supabase };
