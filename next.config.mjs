/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: false,
  // devIndicators: false, // hide static route icon btm left
  devIndicators: {
    appIsrStatus: false,
  }, // old: hide static route icon btm left
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
