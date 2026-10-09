// Type declarations for non-code imports Metro bundles.

// CSS imports, which Metro bundles for web.
declare module "*.css";

// Bundled data files resolve to asset module IDs (see metro.config.js).
declare module "*.dat" {
  const assetId: number;
  export default assetId;
}
