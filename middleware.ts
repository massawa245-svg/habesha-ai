// middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROJECT_ID = 'kkhrdxfdwjttplynzfqx'; // dein aktives Supabase Projekt

export async function middleware(request: NextRequest) {
  // Auth Callback IMMER zuerst durchlassen – ohne Auth-Check
  if (request.nextUrl.pathname === '/auth/callback') {
    return NextResponse.next({ request });
  }

  // Static/Chrome DevTools Paths ignorieren
  if (
    request.nextUrl.pathname.startsWith('/.well-known') ||
    request.nextUrl.pathname.startsWith('/_next') ||
    request.nextUrl.pathname.includes('favicon')
  ) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          // NUR Cookies des aktiven Projekts lesen
          return request.cookies.getAll().filter(c =>
            c.name.includes(PROJECT_ID) || !c.name.startsWith('sb-')
          );
        },
        setAll(cookiesToSet) {
          // 1. Zuerst in den Request setzen (wichtig für nachfolgende Server-Reads)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // 2. Neue Response mit aktualisierten Cookies
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              path: '/',
            })
          );
        },
      },
    }
  );

  // WICHTIG: getUser() statt getSession() – sicherer und aktueller
  const { data: { user }, error } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Eingeloggt + Login-Seite → App
  if (user && path === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Nicht eingeloggt + geschützte Seite → Login
  if (!user && path !== '/login') {
    // Alte Cookies löschen um Konflikte zu vermeiden
    const redirectResponse = NextResponse.redirect(new URL('/login', request.url));
    request.cookies.getAll().forEach(cookie => {
      if (cookie.name.startsWith('sb-') && !cookie.name.includes(PROJECT_ID)) {
        redirectResponse.cookies.delete(cookie.name);
      }
    });
    return redirectResponse;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};