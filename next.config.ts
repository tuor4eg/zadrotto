import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  output: "standalone",
  reactCompiler: true,
  async redirects() {
    return [
      {
        source: "/series/:code/children",
        destination: "/archive?series=:code",
        permanent: true,
      },
      {
        source: "/series/:code",
        destination: "/archive?series=:code",
        permanent: true,
      },
      {
        source: "/franchises/:path*",
        destination: "/series/:path*",
        permanent: true,
      },
      {
        source: "/author/franchises/:path*",
        destination: "/author/series/:path*",
        permanent: true,
      },
      {
        source: "/admin/franchises/:path*",
        destination: "/admin/series/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
