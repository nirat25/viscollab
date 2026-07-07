import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["htmlcollab-app"],
  webpack: (config) => {
    const originalIgnored = config.watchOptions?.ignored;
    if (originalIgnored instanceof RegExp) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: new RegExp(originalIgnored.source + "|data/"),
      };
    } else {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: /data/,
      };
    }
    return config;
  },
};

export default nextConfig;
