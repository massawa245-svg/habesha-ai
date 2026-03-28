// app/admin/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

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
  const [processingId, setProcessingId] = useState<string | null>(null);

  const supabase = createClient();

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
        .eq('user_id', user.id)
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

  // 🔥 NEU: Feedback freigeben (immer, auch bei schlecht mit Korrektur)
  async function approveFeedback(id: string) {
    setProcessingId(id);
    try {
      const feedback = feedbacks.find(f => f.id === id);
      if (!feedback) return;

      // Prüfen: Bei "schlecht" ohne Korrektur warnen
      if (feedback.user_feedback === 'schlecht' && !feedback.corrected_response) {
        const confirm = window.confirm(
          '⚠️ Dieses Feedback ist "schlecht" und hat KEINE Korrektur.\n\n' +
          'Ohne Korrektur kann die KI daraus nicht lernen.\n\n' +
          'Trotzdem freigeben? (Nur sinnvoll wenn die Antwort offensichtlich falsch ist)'
        );
        if (!confirm) {
          setProcessingId(null);
          return;
        }
      }

      // In user_feedback Tabelle kopieren (für Training)
      const { error: insertError } = await supabase
        .from('user_feedback')
        .insert({
          user_id: feedback.user_id,
          question: feedback.question,
          ai_response: feedback.ai_response,
          user_feedback: feedback.user_feedback,
          corrected_response: feedback.corrected_response,
          language: feedback.language,
          session_id: feedback.session_id,
        });

      if (insertError) throw insertError;

      // Aus temp Tabelle löschen
      const { error: deleteError } = await supabase
        .from('user_feedback_temp')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      const message = feedback.corrected_response 
        ? `✅ Feedback freigegeben!\n\n📝 Mit Korrektur: "${feedback.corrected_response}"\n→ Wird für KI-Training verwendet.`
        : `✅ Feedback freigegeben!\n\n→ Wird für KI-Training verwendet.`;
      
      alert(message);
      loadTempFeedback();
    } catch (error) {
      console.error('Fehler beim Freigeben:', error);
      alert('❌ Fehler beim Freigeben');
    } finally {
      setProcessingId(null);
    }
  }

  // Feedback löschen (ohne Training)
  async function deleteFeedback(id: string) {
    const feedback = feedbacks.find(f => f.id === id);
    let message = 'Bist du sicher? Dieses Feedback wird gelöscht und NICHT fürs Training verwendet.';
    
    if (feedback?.corrected_response) {
      message = '⚠️ Achtung! Dieses Feedback hat eine Korrektur.\n\n' +
                `Korrektur: "${feedback.corrected_response}"\n\n` +
                'Trotzdem löschen? (Die Korrektur geht dann verloren)';
    }
    
    if (!confirm(message)) return;

    setProcessingId(id);
    try {
      const { error } = await supabase
        .from('user_feedback_temp')
        .delete()
        .eq('id', id);

      if (error) throw error;

      alert('🗑️ Feedback gelöscht');
      loadTempFeedback();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('❌ Fehler beim Löschen');
    } finally {
      setProcessingId(null);
    }
  }

  // Korrektur aktualisieren
  async function updateCorrection(id: string, currentCorrection: string | null) {
    const newCorrection = prompt('Korrektur eingeben:', currentCorrection || '');
    if (newCorrection === null) return;

    setProcessingId(id);
    try {
      const { error } = await supabase
        .from('user_feedback_temp')
        .update({ corrected_response: newCorrection || null })
        .eq('id', id);

      if (error) throw error;

      alert('✅ Korrektur gespeichert');
      loadTempFeedback();
    } catch (error) {
      console.error('Fehler beim Aktualisieren:', error);
      alert('❌ Fehler beim Speichern');
    } finally {
      setProcessingId(null);
    }
  }

  async function addTester() {
    if (!newEmail) return;
    
    try {
      const { data: user } = await supabase
        .from('auth.users')
        .select('id')
        .eq('email', newEmail)
        .single();

      if (!user) {
        alert('❌ User mit dieser Email existiert nicht. Der User muss sich zuerst registrieren.');
        return;
      }

      const { error } = await supabase
        .from('trusted_users')
        .insert({
          email: newEmail,
          user_id: user.id,
          role: 'beta',
          active: true
        });

      if (error) throw error;

      setNewEmail('');
      loadTrustedUsers();
      alert('✅ Beta-Tester hinzugefügt!');
    } catch (error) {
      console.error('Fehler beim Hinzufügen:', error);
      alert('❌ Fehler beim Hinzufügen');
    }
  }

  async function removeTester(email: string) {
    if (!confirm(`Beta-Tester ${email} wirklich entfernen?`)) return;
    
    try {
      const { error } = await supabase
        .from('trusted_users')
        .delete()
        .eq('email', email);

      if (error) throw error;

      loadTrustedUsers();
      alert('✅ Beta-Tester entfernt');
    } catch (error) {
      console.error('Fehler beim Entfernen:', error);
      alert('❌ Fehler beim Entfernen');
    }
  }

  const getRatingBadge = (rating: string, hasCorrection: boolean) => {
    if (rating === 'gut') {
      return <span className="bg-green-600 text-white px-2 py-0.5 rounded-full text-xs">👍 Gut</span>;
    } else if (rating === 'schlecht') {
      if (hasCorrection) {
        return <span className="bg-yellow-600 text-white px-2 py-0.5 rounded-full text-xs">👎 Schlecht (mit Korrektur ✏️)</span>;
      }
      return <span className="bg-red-600 text-white px-2 py-0.5 rounded-full text-xs">👎 Schlecht (ohne Korrektur)</span>;
    }
    return <span className="bg-gray-600 text-white px-2 py-0.5 rounded-full text-xs">⚪ Neutral</span>;
  };

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
      
      {/* Beta-Tester Verwaltung */}
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
              <span>{user.email} <span className="text-emerald-400 text-sm">({user.role})</span></span>
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
      
      {/* Ungeprüftes Feedback */}
      <div className="bg-gray-800 p-4 sm:p-6 rounded-xl">
        <h2 className="text-xl font-bold mb-4">📝 Ungeprüftes Feedback ({feedbacks.length})</h2>
        
        {feedbacks.length === 0 ? (
          <p className="text-gray-400 text-center py-8">Keine ungeprüften Feedback-Einträge</p>
        ) : (
          <div className="space-y-4">
            {feedbacks.map((fb) => (
              <div key={fb.id} className={`bg-gray-700 p-4 rounded border ${
                fb.user_feedback === 'schlecht' && !fb.corrected_response 
                  ? 'border-red-500/50' 
                  : fb.user_feedback === 'schlecht' && fb.corrected_response
                  ? 'border-yellow-500/50'
                  : 'border-gray-600'
              }`}>
                <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                  <p className="text-sm text-gray-400">
                    {new Date(fb.created_at).toLocaleString()}
                  </p>
                  {getRatingBadge(fb.user_feedback, !!fb.corrected_response)}
                </div>
                
                <p className="mt-2 break-words">
                  <span className="text-emerald-400 font-medium">Frage:</span> {fb.question}
                </p>
                
                <p className="break-words">
                  <span className="text-blue-400 font-medium">KI:</span> {fb.ai_response}
                </p>
                
                {fb.corrected_response && (
                  <p className="break-words bg-green-900/30 p-2 rounded mt-1 border-l-4 border-green-500">
                    <span className="text-green-400 font-medium">✏️ Korrektur (wird für Training verwendet):</span> {fb.corrected_response}
                  </p>
                )}
                
                {fb.user_feedback === 'schlecht' && !fb.corrected_response && (
                  <p className="text-yellow-400 text-sm mt-1">
                    ⚠️ Ohne Korrektur kann die KI aus diesem Feedback nicht lernen.
                  </p>
                )}
                
                <div className="flex flex-col sm:flex-row gap-2 mt-3">
                  {/* Korrektur bearbeiten */}
                  <button
                    onClick={() => updateCorrection(fb.id, fb.corrected_response)}
                    disabled={processingId === fb.id}
                    className="bg-yellow-600 px-3 py-1.5 rounded hover:bg-yellow-700 text-sm disabled:opacity-50"
                  >
                    ✏️ {fb.corrected_response ? 'Korrektur bearbeiten' : 'Korrektur hinzufügen'}
                  </button>
                  
                  {/* Löschen Button */}
                  <button
                    onClick={() => deleteFeedback(fb.id)}
                    disabled={processingId === fb.id}
                    className="bg-red-600 px-3 py-1.5 rounded hover:bg-red-700 text-sm disabled:opacity-50"
                  >
                    🗑️ Löschen (nicht trainieren)
                  </button>
                  
                  {/* Freigeben Button */}
                  <button
                    onClick={() => approveFeedback(fb.id)}
                    disabled={processingId === fb.id}
                    className={`px-3 py-1.5 rounded text-sm disabled:opacity-50 ${
                      fb.user_feedback === 'schlecht' && !fb.corrected_response
                        ? 'bg-orange-600 hover:bg-orange-700'
                        : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    {fb.corrected_response 
                      ? '✅ Mit Korrektur freigeben' 
                      : fb.user_feedback === 'gut' 
                      ? '✅ Freigeben & Training'
                      : '⚠️ Trotzdem freigeben (ohne Korrektur)'}
                  </button>
                </div>
                
                {/* User Info */}
                {fb.user_id && (
                  <p className="text-xs text-gray-500 mt-2">User ID: {fb.user_id.slice(0, 8)}...</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}