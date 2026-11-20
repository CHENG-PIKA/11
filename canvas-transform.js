// Pointer deltas are in artboard pixels. The opposite corner stays fixed.
export function resizeFromCorner(rect, corner, dx, dy) {
  const left = corner.endsWith('w'), top = corner.startsWith('n');
  const vx = (left ? -1 : 1) * rect.w, vy = (top ? -1 : 1) * rect.h;
  const diagonal = Math.hypot(vx, vy);
  const scale = Math.max(0.001 / Math.min(rect.w, rect.h), 1 + (dx * (vx / diagonal) + dy * (vy / diagonal)) / diagonal);
  const w = rect.w * scale, h = rect.h * scale;
  return {x: left ? rect.x + rect.w - w : rect.x, y: top ? rect.y + rect.h - h : rect.y, w, h};
}

export function resizeAboutCenter(rect, width) {
  const height = width * rect.h / rect.w;
  return {x: rect.x + (rect.w - width) / 2, y: rect.y + (rect.h - height) / 2, w: width, h: height};
}

export function sourceTransformFromRect(settings, asset, rect) {
  const fitWidth = Math.min(settings.w / asset.w, settings.h / asset.h) * asset.w;
  return {sourceZoom: rect.w / fitWidth * 100, sourceX: (rect.x + rect.w / 2) / settings.w * 100, sourceY: (rect.y + rect.h / 2) / settings.h * 100};
}
