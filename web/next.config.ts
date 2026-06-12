import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["htmlcollab-app"],
};

export default nextConfig;
