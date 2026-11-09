import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

// The installable game's manifest: Late Winner, standalone from the home page, in the colours of piste A, with icons
// that exist, of the sizes and purposes the browsers ask for.
describe("the manifest", () => {
  const app = manifest();

  it("names the game and opens its home page as an app, in the game's colours", () => {
    expect(app).toMatchObject({
      id: "/",
      name: "Late Winner",
      short_name: "Late Winner",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#0B1340",
      theme_color: "#0B1340",
    });
  });

  it("gives a 192 and a 512 icon, a maskable one of each, every one a PNG of its size", () => {
    const icons = app.icons ?? [];
    expect(icons.map(({ sizes, purpose }) => `${sizes} ${purpose}`).sort()).toEqual([
      "192x192 any",
      "192x192 maskable",
      "512x512 any",
      "512x512 maskable",
    ]);
    for (const { src, sizes } of icons) {
      const file = `public${src}`;
      expect(existsSync(file), file).toBe(true);
      const png = readFileSync(file);
      // A PNG's width and height, in its IHDR chunk.
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, file).toBe(sizes);
    }
  });

  it("says nothing of a club, nor of anyone else's brand", () => {
    expect(JSON.stringify(app)).not.toMatch(/FIFA|EA FC|Football Manager/i);
  });
});
