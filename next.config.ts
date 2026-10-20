import type { NextConfig } from "next";
import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots";

const nextConfig: NextConfig = {
  // Keep Next's full crawler list; Telegram also needs metadata in the initial HTML.
  htmlLimitedBots: new RegExp(`${HTML_LIMITED_BOT_UA_RE.source}|TelegramBot`, "i"),
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  output: "standalone",
  // Export files are runtime volume data. Dynamic filesystem paths can make
  // tracing include project sources; the server runs compiled .next code.
  outputFileTracingExcludes: {
    "/*": [
      "./src/**/*",
      "./tests/**/*",
      "./drizzle/**/*",
      "./docs/**/*",
      "./tools/**/*",
      "./deploy/**/*",
      "./openspec/**/*",
      "./.data/admin-exports/**/*",
      // Docker copies public separately into the runtime image.
      "./public/**/*",
    ],
  },
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
