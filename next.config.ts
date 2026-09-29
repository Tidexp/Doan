import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/CJS libs must stay outside the Next bundler (pdf parsers, graph/queue drivers).
  serverExternalPackages: [
    "pdf-parse",
    "mammoth",
    "neo4j-driver",
    "bullmq",
    "ioredis",
  ],
};

export default nextConfig;
