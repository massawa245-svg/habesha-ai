import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['10.152.14.133'],
  experimental: {
    turbo: {
      // Turbopack Konfiguration
    }
  }
};

export default nextConfig;