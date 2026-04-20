/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.simplyrets.com" },
      { protocol: "https", hostname: "**.crea.ca" },
    ],
  },
};
export default nextConfig;
