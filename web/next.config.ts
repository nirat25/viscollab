import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["htmlcollab-app"],
  // The persistence startup hook imports pg only in the Node runtime. Keep
  // the driver external so webpack does not attempt to browser-bundle its
  // Node-only fs/TLS connection handling.
  serverExternalPackages: ["pg"],
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
