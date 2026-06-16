import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server to accept requests (including Server Action POSTs
  // like login/register) from phones/tablets on the local network. Without
  // this, Next.js blocks cross-origin dev requests by default — the login
  // form would submit silently with no error and never authenticate.
  allowedDevOrigins: [
    '192.168.4.122',
    '192.168.4.*',
    '100.94.140.68',
  ],
  // The map feature was renamed to Live Map (route: /live-map). Keep old
  // /maps URLs (bookmarks, stale realtime-refreshed tabs) working.
  async redirects() {
    return [
      {
        source: '/campaigns/:id/maps/:path*',
        destination: '/campaigns/:id/live-map/:path*',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
