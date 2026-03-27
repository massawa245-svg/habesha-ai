import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  // Client-seitiger HTML-Callback (ohne doppelte Deklaration)
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Habesha AI Login</title>
        <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
        <style>
          body {
            background: #111;
            color: white;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            font-family: system-ui, sans-serif;
            margin: 0;
          }
          .loader {
            text-align: center;
          }
          .spinner {
            width: 40px;
            height: 40px;
            border: 3px solid #2d3748;
            border-top-color: #10b981;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 16px;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="loader">
          <div class="spinner"></div>
          <div>Anmeldung wird verarbeitet...</div>
        </div>
        <script>
          (function() {
            const SUPABASE_URL = '${process.env.NEXT_PUBLIC_SUPABASE_URL}';
            const SUPABASE_KEY = '${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}';
            
            const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            
            async function handleAuth() {
              const params = new URLSearchParams(window.location.search);
              const code = params.get('code');
              
              if (code) {
                console.log('🔑 Code gefunden, tausche gegen Session...');
                const { error } = await supabaseClient.auth.exchangeCodeForSession(code);
                
                if (error) {
                  console.error('❌ Auth Fehler:', error);
                  window.location.href = '/login?error=' + encodeURIComponent(error.message);
                } else {
                  console.log('✅ Login erfolgreich');
                  window.location.href = '/';
                }
              } else {
                console.log('⚠️ Kein Code in URL');
                window.location.href = '/login';
              }
            }
            
            handleAuth();
          })();
        </script>
      </body>
    </html>
  `;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}