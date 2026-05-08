'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('Nicht eingeloggt');

  const full_name = formData.get('full_name') as string;
  const preferred_language = formData.get('preferred_language') as string;

  // Profile upsert
  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      full_name,
      preferred_language,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error('Profile update error:', error);
    return { success: false, error: error.message };
  }
  
  // Auch in user_metadata speichern für schnellen Zugriff
  await supabase.auth.updateUser({
    data: { preferred_language, full_name }
  });
  
  revalidatePath('/profile');
  return { success: true };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/');
  return { success: true };
}