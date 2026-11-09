import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Next.js 16: proxy.ts replaces middleware.ts. Redirects "/" to the best locale (cookie, Accept-Language).
export default createMiddleware(routing);

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
