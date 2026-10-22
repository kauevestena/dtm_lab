// Data locations and preset tiles. The deployed site serves the COPC and the products from data/
// (assembled by .github/workflows/pages.yml from release data-v1); `?copc=` and `?products=` override.
const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);

export const COPC_URL = q.get('copc') || 'data/cooper.copc.laz';
export const PRODUCTS_URL = q.get('products') || 'data/products/';

// 50 m tiles chosen from the zone raster (scripts/build_products.py): share of cells per zone.
export const PRESETS = [
  { id: 'urban', cx: 331086, cy: 7102224 },   // 88% building cells
  { id: 'forest', cx: 331141, cy: 7102069 },  // 99% vegetation cells
  { id: 'mixed', cx: 331031, cy: 7102199 },   // 22% vegetation, 36% building, 11.8 m relief
  { id: 'open', cx: 331061, cy: 7102094 },    // open ground, 9.4 m relief
];
