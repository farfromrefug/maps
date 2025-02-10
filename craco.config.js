const path = require('path')

module.exports = {
  eslint: {
    enable: false,
  },
  webpack: {
    alias: {
      'mapbox-gl': path.resolve(__dirname, 'node_modules/maplibre-gl'),
    },
  },
}
