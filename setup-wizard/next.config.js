/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow large CSV uploads
  api: { bodyParser: { sizeLimit: "50mb" } },
};
export default nextConfig;
