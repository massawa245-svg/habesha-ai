'use client';

import { useState, useRef } from 'react';

export default function ChatClient({ userId, userLanguage }: { userId: string; userLanguage: string }) {
  const [messages, setMessages] = useState<Array<{role: string; content: string}>>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const examples = [
    { icon: '🏢', title: 'Jobcenter Brief', desc: 'Arbeitslosmeldung, ALG II, Sanktionen' },
    { icon: '💰', title: 'Finanzamt Brief', desc: 'Steuerbescheid, Einkommensteuer' },
    { icon: '🏥', title: 'AOK / Krankenkasse', desc: 'Beitragsbescheid, Krankmeldung' },
    { icon: '🪪', title: 'Ausländerbehörde', desc: 'Aufenthaltstitel, Fiktionsbescheinigung' },
  ];

  async function sendMessage() {
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: input,
          history: messages,
          userId,
          language: userLanguage,
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (error) {
      console.error('Fehler:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function uploadDocument(file: File) {
    const reader = new FileReader();
    reader.onloadend = async () => {
      setIsLoading(true);
      const res = await fetch('/api/analyze-document', {
        method: 'POST',
        body: JSON.stringify({
          image: reader.result,
          userId,
          message: 'Erkläre diesen Brief',
          language: userLanguage,
        }),
      });
      const data = await res.json();
      setMessages(prev => [
        ...prev,
        { role: 'user', content: `📄 ${file.name}` },
        { role: 'assistant', content: data.response },
      ]);
      setIsLoading(false);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b p-4">
        <h1 className="text-xl font-semibold">HABESHA AI</h1>
        <p className="text-sm text-gray-500">
          Behördenbriefe verstehen – auf {userLanguage === 'de' ? 'Deutsch' : userLanguage === 'ti' ? 'Tigrinya' : userLanguage === 'am' ? 'Amharisch' : 'Englisch'}
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center mt-20">
            <p className="text-gray-500 mb-8">Wähle einen Brief-Typ oder lade ein Foto hoch:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
              {examples.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => setInput(`${ex.title} erklären`)}
                  className="p-4 text-left border rounded-xl hover:border-blue-500 transition"
                >
                  <div className="text-2xl mb-2">{ex.icon}</div>
                  <div className="font-semibold">{ex.title}</div>
                  <div className="text-sm text-gray-500">{ex.desc}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] p-3 rounded-xl ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 p-3 rounded-xl">🤔 Denke nach...</div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t p-4">
        <div className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && uploadDocument(e.target.files[0])}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-lg border hover:bg-gray-50"
          >
            📎
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Schreib hier oder lade Brief hoch..."
            className="flex-1 p-2 border rounded-lg"
          />
          <button
            onClick={sendMessage}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
          >
            Senden
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center">
          ⚡ Behördenbriefe werden in {userLanguage === 'ti' ? 'Tigrinya' : userLanguage === 'am' ? 'Amharisch' : userLanguage === 'en' ? 'Englisch' : 'Deutsch'} erklärt
        </p>
      </div>
    </div>
  );
}