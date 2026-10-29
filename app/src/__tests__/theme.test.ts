import { describe, expect, it } from "vitest";

import { colors, lighten, lightColors, lightOf } from "../theme";

describe("light screens", () => {
  it("swaps every palette colour for its daylight version, and leaves sizes alone", () => {
    const styles = {
      card: { backgroundColor: colors.panel, borderColor: colors.line, padding: 12 },
      text: { color: colors.fg, fontSize: 16 },
    };
    const light = lighten(styles);
    expect(light.card).toEqual({ backgroundColor: lightColors.panel, borderColor: lightColors.line, padding: 12 });
    expect(light.text).toEqual({ color: lightColors.fg, fontSize: 16 });
    expect(lighten(styles)).toBe(light);
  });

  it("keeps colours that aren't the palette's, like the speed-limit roundel", () => {
    expect(lightOf("#d4232b")).toBe("#d4232b");
    expect(lightOf("#1A1200")).toBe("#ffffff");
  });
});
