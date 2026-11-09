import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Avatar uploads accept up to 2 MB of image bytes (AUTH-04); the raw
      // multipart request adds boundary/header overhead on top, so leave
      // headroom. The 2 MB cap itself is still enforced in the action on the
      // file's `size` before the buffer is read (SEC-01/02).
      bodySizeLimit: '3mb',
    },
  },
};

export default nextConfig;
