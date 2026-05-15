/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The dashboard is meant to run only on localhost — never expose to the
  // public. It needs file-system access (for Chrome profile auto-extraction)
  // and arbitrary process spawn (for launching Chrome), so binding to a
  // remote interface would be a serious security regression.
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
};
export default nextConfig;
