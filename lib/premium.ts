// lib/premium.ts

import { createClient } from '@/lib/supabase/server';

export async function checkPremium(userId: string): Promise<{ isPremium: boolean, remaining: number, limit: number }> {
  const FREE_LIMIT = 5;
  
  if (!userId) {
    return { isPremium: false, remaining: FREE_LIMIT, limit: FREE_LIMIT };
  }
  
  // 🔥 HIER: Supabase Client erstellen
  const supabase = await createClient();
  
  // Hole oder erstelle User Limit
  let { data: limit } = await supabase
    .from('user_limits')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  
  // Wenn kein Eintrag, erstelle neuen
  if (!limit) {
    const today = new Date().toISOString().split('T')[0];
    const { data: newLimit } = await supabase
      .from('user_limits')
      .insert({ 
        user_id: userId, 
        requests_today: 0, 
        last_reset: today,
        premium: false
      })
      .select()
      .single();
    limit = newLimit;
  }
  
  // Prüfe ob Reset nötig (neuer Tag)
  const today = new Date().toISOString().split('T')[0];
  if (limit && limit.last_reset !== today) {
    await supabase
      .from('user_limits')
      .update({ requests_today: 0, last_reset: today })
      .eq('user_id', userId);
    limit.requests_today = 0;
  }
  
  const isPremium = limit?.premium || (limit?.premium_until && new Date(limit.premium_until) > new Date());
  const currentRequests = limit?.requests_today || 0;
  const remaining = isPremium ? Infinity : FREE_LIMIT - currentRequests;
  
  return { isPremium, remaining, limit: FREE_LIMIT };
}

export async function incrementUsage(userId: string, isPremium: boolean): Promise<void> {
  if (isPremium || !userId) return;
  
  // 🔥 HIER: Supabase Client erstellen
  const supabase = await createClient();
  
  try {
    // Hole aktuellen Stand
    const { data: limit } = await supabase
      .from('user_limits')
      .select('requests_today')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (limit) {
      await supabase
        .from('user_limits')
        .update({ requests_today: (limit.requests_today || 0) + 1 })
        .eq('user_id', userId);
    } else {
      // Falls kein Eintrag, erstelle einen
      const today = new Date().toISOString().split('T')[0];
      await supabase
        .from('user_limits')
        .insert({ 
          user_id: userId, 
          requests_today: 1, 
          last_reset: today 
        });
    }
  } catch (error) {
    console.error('Fehler bei incrementUsage:', error);
  }
}