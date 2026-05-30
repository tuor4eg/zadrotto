import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  output: "standalone",
  reactCompiler: true,
};

export default nextConfig;
