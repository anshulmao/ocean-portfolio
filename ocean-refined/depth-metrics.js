// Depth is a calibrated reading. World coordinates, routes and geometry retain
// their original metre-sized units; the former 0–60 scale now reads 0–40.
export const WORLD_DEPTH_SCALE = 60;
export const DISPLAY_MAX_DEPTH = 40;
export const DEPTH_RATIO = DISPLAY_MAX_DEPTH / WORLD_DEPTH_SCALE;
export const toDisplayDepth = worldDepth => Math.min(DISPLAY_MAX_DEPTH, Math.max(0, Number(worldDepth) || 0) * DEPTH_RATIO);
export const toWorldDepth = reading => Math.max(0, Number(reading) || 0) / DEPTH_RATIO;
