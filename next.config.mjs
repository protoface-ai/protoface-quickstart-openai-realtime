import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["protoface-client"],
  experimental: {
    externalDir: true
  },
  turbopack: {
    root
  }
};

export default nextConfig;
