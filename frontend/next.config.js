/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Allow dynamic import(`./${id}/index`) for module UI auto-discovery (§9.2)
    config.module = config.module || {};
    // Avoid hard-fail on missing optional module UI barrels
    config.module.exprContextCritical = false;
    return config;
  },
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    return [
      {
        source: "/backend/:path*",
        destination: `${api}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
