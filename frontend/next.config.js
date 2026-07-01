const path = require('path');
const webpack = require('webpack');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      '@react-native-async-storage/async-storage': false,
    };
    config.externals.push('pino-pretty', 'encoding');

    // The @zama-fhe/react-sdk/wagmi build uses renamed/removed wagmi/actions APIs.
    // Replace the import only when it originates inside the @zama-fhe package.
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^wagmi\/actions$/,
        (resource) => {
          if (resource.context && resource.context.includes('@zama-fhe')) {
            resource.request = path.resolve(__dirname, 'lib/wagmi-actions-shim.ts');
          }
        },
      ),
    );

    // The SDK does `import * as p from "wagmi"` and accesses p.useConnection.
    // Webpack validates named exports even for namespace imports in strict ESM mode.
    // Shim wagmi for @zama-fhe imports only to add the missing export.
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^wagmi$/,
        (resource) => {
          if (resource.context && resource.context.includes('@zama-fhe')) {
            resource.request = path.resolve(__dirname, 'lib/wagmi-shim.ts');
          }
        },
      ),
    );

    return config;
  },
};

module.exports = nextConfig;
