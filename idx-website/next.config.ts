import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.simplyrets.com" },
      { protocol: "https", hostname: "**.crea.ca" },
    ],
  },
};

export default nextConfig;
