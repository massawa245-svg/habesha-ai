// lib/auth.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Service-Role Client fuer Server-Routen, die RLS umgehen muessen.
// Wird bewusst LAZY (erst beim Aufruf) erzeugt, da bei Vercel-Builds
// Env-Vars nicht verfuegbar sind und ein Modul-Level-Aufruf den Build crasht.
export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Supabase Admin Client: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt'
    );
  }

  return createClient(url, serviceRoleKey);
}
