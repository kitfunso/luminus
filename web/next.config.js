const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  transpilePackages: ['maplibre-gl'],
};

module.exports = nextConfig;
