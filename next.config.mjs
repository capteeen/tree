/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // native module + heavy SDKs: load from node_modules at runtime instead of bundling
    serverComponentsExternalPackages: ['better-sqlite3', '@pump-fun/pump-sdk', '@pump-fun/pump-swap-sdk'],
  },
  webpack: (config) => {
    // wallet-adapter deps reference optional node-only modules
    config.externals.push('pino-pretty', 'encoding');
    return config;
  },
};
export default nextConfig;
