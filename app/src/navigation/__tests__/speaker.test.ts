import { describe, expect, it, vi } from "vitest";

import { rankVoices } from "../speaker";

vi.mock("expo-speech", () => ({}));
vi.mock("../../storage/store", () => ({ store: { getSetting: () => null, setSetting: () => {} } }));

describe("choosing a voice", () => {
  it("puts the phone's best British voices first and leaves out novelty voices", () => {
    const ranked = rankVoices([
      { identifier: "com.apple.voice.compact.en-GB.Daniel", name: "Daniel", language: "en-GB", quality: "Default" },
      { identifier: "com.apple.voice.premium.en-GB.Malcolm", name: "Malcolm (Premium)", language: "en-GB" },
      {
        identifier: "com.apple.voice.enhanced.en-GB.Serena",
        name: "Serena (Enhanced)",
        language: "en-GB",
        quality: "Enhanced",
      },
      { identifier: "com.apple.speech.synthesis.voice.Zarvox", name: "Zarvox", language: "en-GB" },
      { identifier: "com.apple.voice.compact.en-US.Samantha", name: "Samantha", language: "en-US" },
    ]);
    expect(ranked.map((v) => v.name)).toEqual(["Malcolm (Premium)", "Serena (Enhanced)", "Daniel"]);
  });

  it("falls back to other English when the phone has no British voice", () => {
    expect(rankVoices([{ identifier: "x", name: "Samantha", language: "en-US" }]).map((v) => v.name)).toEqual([
      "Samantha",
    ]);
  });
});
