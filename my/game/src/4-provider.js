// 4-provider.js: PROVIDER. The active world provider slot and the ground and water queries every layer asks of it.
// Owns: providers ({ active, version }), _surf, groundAt, isWaterAt, baseAt, surfaceY, surfaceFor.
// May import: 1-config.js, 2-core.js. Set by main (the loads, teardown); read by collision, worlds, sim and render.
//
// PROVIDER CONTRACT (CityWorld, WildernessWorld, IntroWorld; what the engine and the other layers read):
//   kind ("city" | "wilderness" | "intro"), bounds { minX, maxX, minZ, maxZ }, wraps (torus wrap vs clamp at the edge),
//   flags: shadows, companion (the cat comes along), rays ("off" | "single" | ...), hud (false hides the HUD), city
//   (the CityWorld inside, or null), seed; cabins (wilderness), playerStart.
//   heightAt(x, z) ground height; isWater(x, z); surface(x, z, out) fills out.base (footing: floor, water surface or
//   ground), out.dip (bed below the base, negative in water) and out.float (swim depth); waterSources() [x, z, y]
//   points; population() [{ type, count, src }] where src.spawnPoint(type) gives [x, z] or null; regrow(ecosystem)
//   each tick; teardown() frees what the provider itself built; drive(ecosystem, dt), optional, replaces the sim.
//   providers.version: bump it whenever heights under existing entities change, so surfaceFor's memo refreshes.

// WORLD PROVIDER ACCESS: the engine's only view of terrain and water (see WORLD PROVIDERS).
export const providers = { active: null, version: 0 };
export const _surf = { base: 0, dip: 0, float: 1 };

export function groundAt(x, z) { return providers.active ? providers.active.heightAt(x, z) : 0; }
export function isWaterAt(x, z) { return providers.active ? providers.active.isWater(x, z) : false; }
// Footing: the floor indoors, the water surface over water, else the ground.
export function baseAt(x, z) { providers.active.surface(x, z, _surf); return _surf.base; }
// Where feet rest: the base, or the bed below it in water.
export function surfaceY(x, z) { providers.active.surface(x, z, _surf); return _surf.base + _surf.dip; }

// Per-entity footing memo, recomputed on move; returns the dip below the base, leaves _b (base) and _fd (float) on it.
export function surfaceFor(ent, x, z) {
  if (ent._hx === x && ent._hz === z && ent._hv === providers.version) return ent._h;
  providers.active.surface(x, z, _surf);
  ent._hx = x; ent._hz = z; ent._hv = providers.version;
  ent._h = _surf.dip; ent._b = _surf.base; ent._fd = _surf.float;
  return ent._h;
}
