const { getDefaultConfig } = require('expo/metro-config');

// Expo's default config already understands pnpm/npm workspaces (watch folders and node_modules resolution).
module.exports = getDefaultConfig(__dirname);
