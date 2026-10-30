import { beforeEach, describe, expect, it, vi } from "vitest";

import { rankVoices, say } from "../speaker";

const speech = vi.hoisted(() => ({
  speak: vi.fn(),
  stop: vi.fn(() => Promise.resolve()),
  // Safari's voice list can never arrive: speaking mustn't wait for it.
  getAvailableVoicesAsync: vi.fn(() => new Promise(() => {})),
}));
vi.mock("expo-speech", () => speech);
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

  it("offers a voice Safari lists twice only once", () => {
    const ranked = rankVoices([
      { identifier: "Daniel", name: "Daniel", language: "en-GB" },
      { identifier: "Daniel-2", name: "Daniel", language: "en-GB" },
    ]);
    expect(ranked).toHaveLength(1);
  });
});

describe("speaking", () => {
  beforeEach(() => speech.speak.mockClear());

  it("speaks at once, even when the phone never lists its voices", () => {
    say("Turn left onto Clapham Road.", "urgent");
    expect(speech.speak).toHaveBeenCalledTimes(1);
    expect(speech.speak.mock.calls[0][0]).toBe("Turn left onto Clapham Road.");
  });

  it("carries on if the phone never says a prompt finished", () => {
    vi.useFakeTimers();
    say("Re-routing.", "urgent");
    vi.advanceTimersByTime(12_000);
    say("In 200 yards, turn right.");
    expect(speech.speak).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
