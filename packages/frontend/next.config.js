/** @type {import('next').NextConfig} */
const isStaticExport = process.env.STATIC_EXPORT === '1';
// GitHub Pages serves the site from /crypto-gaming/ — set BASE_PATH to match the repo name.
const basePath = process.env.BASE_PATH || '';

const nextConfig = {
  reactStrictMode: true,
  ...(isStaticExport ? { output: 'export' } : {}),
  ...(basePath ? { basePath } : {}),
  assetPrefix: basePath || undefined,
  transpilePackages: ['@crypto-gaming/shared'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  images: {
    unoptimized: isStaticExport,
    domains: ['localhost', 'api.cryptogaming.com'],
    formats: ['image/avif', 'image/webp'],
  },
  async rewrites() {
    if (isStaticExport) return [];
    return [
      {
        source: '/api/backend/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;