const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname),
  transpilePackages: ['maplibre-gl'],
};

module.exports = nextConfig;
