// middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax', // 🔥 HIER GEÄNDERT von 'strict' zu 'lax'
              path: '/',
              maxAge: 60 * 60 * 24 * 7, // 7 Tage
            });
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Auth Callback immer erlauben
  if (request.nextUrl.pathname === '/auth/callback') {
    return response;
  }

  // Wenn eingeloggt und auf Login-Seite -> zur App
  if (user && request.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Wenn nicht eingeloggt und nicht auf Login-Seite -> zu Login
  if (!user && request.nextUrl.pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};