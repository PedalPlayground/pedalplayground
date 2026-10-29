// Builds catalog.json (the manifest the app loads) from catalog_items rows. Same shape as build.mjs writes,
// so the app doesn't change when it switches from the repo catalog to the Supabase one.

const PLURAL = { pedal: "pedals", pedalboard: "pedalboards" };

/**
 * rows: catalog_items rows ({ kind, key, brand, name, width_in, height_in, current_ma, voltage, type, status,
 * added_on, thumb_path, img_path }). Live items go in search; retired ones keep only their images, so saved
 * boards still draw them. Items with no built images yet are left out.
 */
export function manifestFromRows(rows, generatedAt = new Date().toISOString()) {
  const manifest = { schema: 1, generatedAt, pedals: [], pedalboards: [], assets: { pedals: {}, pedalboards: {} } };
  for (const r of rows) {
    const list = PLURAL[r.kind];
    if (!list || !r.thumb_path || !r.img_path) continue;
    manifest.assets[list][r.key] = { thumb: r.thumb_path, img: r.img_path };
    if (r.status !== "live") continue;
    manifest[list].push({
      brand: r.brand,
      name: r.name,
      width: Number(r.width_in),
      height: Number(r.height_in),
      image: r.key,
      ...(r.current_ma != null && { ma: r.current_ma }),
      ...(r.voltage != null && { voltage: r.voltage }),
      ...(r.type != null && { type: r.type }),
      ...(r.added_on != null && { added: String(r.added_on).slice(0, 10) }),
    });
  }
  return manifest;
}
