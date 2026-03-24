const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['maplibre-gl'],
  outputFileTracingRoot: path.join(__dirname, '..'),
};

module.exports = nextConfig;
