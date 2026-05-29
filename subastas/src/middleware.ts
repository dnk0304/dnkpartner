import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// LOGIN DISABLED: All paths are now public
// TODO: Re-enable authentication after auction system is fully working
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  
  // Add CSP headers to allow eval in development (for Next.js hot reload)
  if (process.env.NODE_ENV === 'development') {
    response.headers.set(
      'Content-Security-Policy',
      "script-src 'self' 'unsafe-eval' 'unsafe-inline';"
    );
  }
  
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes that handle their own auth)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
