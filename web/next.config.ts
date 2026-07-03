import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["htmlcollab-app"],
  basePath: "/viscollab",
};

export default nextConfig;
