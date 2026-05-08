import { createClient } from '@/lib/supabase/server';
import Sidebar from '@/components/sidebar';
import { redirect } from 'next/navigation';

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Profil laden
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, preferred_language')
    .eq('id', user.id)
    .single();

  // Premium Status
  const { isPremium, remaining } = await import('@/lib/premium')
    .then(m => m.checkPremium(user.id));

  // Chat History laden
  const { data: chatHistory } = await supabase
    .from('chats')
    .select('id, title, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  return (
    <div className="flex h-screen">
      <Sidebar
        user={{
          id: user.id,
          email: user.email!,
          full_name: profile?.full_name,
        }}
        profile={{
          preferred_language: (profile?.preferred_language || 'de') as any,
        }}
        premium={{ isPremium, remaining }}
        chatHistory={chatHistory || []}
      />
      <main className="flex-1 lg:ml-80">
        {children}
      </main>
    </div>
  );
}