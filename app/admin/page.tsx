// app/admin/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type Feedback = {
  id: string;
  question: string;
  ai_response: string;
  user_feedback: string;
  corrected_response: string | null;
  language: string;
  user_id: string | null;
  session_id: string | null;
  created_at: string;
};

type TrustedUser = {
  id: string;
  email: string;
  role: string;
  active: boolean;
  created_at: string;
};

export default function AdminDashboard() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [trustedUsers, setTrustedUsers] = useState<TrustedUser[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        window.location.href = '/login';
        return;
      }
      
      const { data: trusted } = await supabase
        .from('trusted_users')
        .select('*')
        .eq('email', user.email)
        .eq('role', 'admin')
        .maybeSingle();
      
      if (!trusted) {
        window.location.href = '/';
        return;
      }
      
      setIsAuthorized(true);
      setLoading(false);
      
      loadTempFeedback();
      loadTrustedUsers();
    };
    
    checkAuth();
  }, []);

  async function loadTempFeedback() {
    const { data } = await supabase
      .from('user_feedback_temp')
      .select('*')
      .order('created_at', { ascending: false });
    setFeedbacks(data || []);
  }

  async function loadTrustedUsers() {
    const { data } = await supabase
      .from('trusted_users')
      .select('*')
      .eq('active', true);
    setTrustedUsers(data || []);
  }

  async function approveFeedback(id: string) {
    await supabase.rpc('approve_feedback', { feedback_id: id });
    loadTempFeedback();
    alert('✅ Feedback freigegeben und ins Training übernommen!');
  }

  async function addTester() {
    if (!newEmail) return;
    await supabase.rpc('add_beta_tester', { tester_email: newEmail });
    setNewEmail('');
    loadTrustedUsers();
    alert('✅ Beta-Tester hinzugefügt!');
  }

  async function removeTester(email: string) {
    await supabase.rpc('remove_beta_tester', { tester_email: email });
    loadTrustedUsers();
    alert('✅ Beta-Tester entfernt');
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Laden...</div>;
  }
  
  if (!isAuthorized) return null;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold">🇪🇷 Admin Dashboard</h1>
        <button
          onClick={() => supabase.auth.signOut().then(() => window.location.href = '/')}
          className="bg-red-600 px-4 py-2 rounded hover:bg-red-700"
        >
          Logout
        </button>
      </div>
      
      <div className="bg-gray-800 p-4 sm:p-6 rounded-xl mb-8">
        <h2 className="text-xl font-bold mb-4">👥 Beta-Tester verwalten</h2>
        
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Email eingeben..."
            className="flex-1 bg-gray-700 p-2 rounded text-white"
          />
          <button
            onClick={addTester}
            className="bg-emerald-600 px-4 py-2 rounded hover:bg-emerald-700"
          >
            Hinzufügen
          </button>
        </div>
        
        <div className="space-y-2">
          {trustedUsers.map((user) => (
            <div key={user.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-700 p-2 rounded gap-2">
              <span>{user.email} ({user.role})</span>
              <button
                onClick={() => removeTester(user.email)}
                className="text-red-400 hover:text-red-300 text-sm"
              >
                Entfernen
              </button>
            </div>
          ))}
        </div>
      </div>
      
      <div className="bg-gray-800 p-4 sm:p-6 rounded-xl">
        <h2 className="text-xl font-bold mb-4">📝 Ungeprüftes Feedback ({feedbacks.length})</h2>
        
        <div className="space-y-4">
          {feedbacks.map((fb) => (
            <div key={fb.id} className="bg-gray-700 p-4 rounded border border-gray-600">
              <p className="text-sm text-gray-400">
                {new Date(fb.created_at).toLocaleString()}
              </p>
              <p className="mt-2 break-words"><span className="text-emerald-400">Frage:</span> {fb.question}</p>
              <p className="break-words"><span className="text-blue-400">KI:</span> {fb.ai_response}</p>
              {fb.corrected_response && (
                <p className="break-words"><span className="text-yellow-400">Korrektur:</span> {fb.corrected_response}</p>
              )}
              <p><span className="text-purple-400">Bewertung:</span> {fb.user_feedback}</p>
              
              <button
                onClick={() => approveFeedback(fb.id)}
                className="mt-3 bg-emerald-600 px-4 py-2 rounded hover:bg-emerald-700 w-full sm:w-auto"
              >
                ✅ Freigeben & ins Training übernehmen
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}