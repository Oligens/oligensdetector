import { createClient } from "@supabase/supabase-js";
const url=import.meta.env.VITE_SUPABASE_URL as string|undefined;
const anonKey=import.meta.env.VITE_SUPABASE_ANON_KEY as string|undefined;
export const supabase=url&&anonKey?createClient(url,anonKey):null;
export function requireSupabase(){if(!supabase)throw new Error("Supabase n'est pas configuré. Définissez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.");return supabase;}
