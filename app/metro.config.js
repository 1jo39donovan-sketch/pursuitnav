// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
// Bundled search data (assets/data/*.dat) ships as plain assets.
config.resolver.assetExts.push("dat");

module.exports = config;
