import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ['*.e2b.app', '*.e2b.dev'],
  experimental: { cpus: 2 },
  async headers() {
    return [
      { source: '/:path*', headers: [ { key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' } ] },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      ...['/s/:path*','/convite/:path*','/api/:path*','/auth/:path*'].map(source => ({ source, headers: [{ key: 'Cache-Control', value: 'private, no-store' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }))
    ];
  }
};
export default config;
