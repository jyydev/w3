/** @type {import('next').NextConfig} */

const nextConfig = {
  distDir: process.env.NODE_ENV == "development" ? ".next-dev" : ".next",
  reactStrictMode: false,
  devIndicators: false,
  experimental: {
    devtoolSegmentExplorer: false,
    serverComponentsHmrCache: false,
  },
  // webpack: (config, { dev, isServer }) => {
  //   if (dev && isServer) {
  //     config.watchOptions = {
  //       aggregateTimeout: 1000, // wait 10s after changes before rebuild
  //       // ignored: /node_modules/, //no update after edit
  //     };
  //   }
  //   return config;
  // }, //aggregate for isServer files
};

export default nextConfig;
