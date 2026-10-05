/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // wallet-adapter deps reference optional node-only modules
    config.externals.push('pino-pretty', 'encoding');
    return config;
  },
};
export default nextConfig;
