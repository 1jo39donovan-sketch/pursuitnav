import { describe, expect, it, vi } from "vitest";

import type { TeamMessage } from "../messages";
import { routeToMessage } from "../routeToMessage";

// vi.mock is hoisted above the imports; the spy it uses must be too.
const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("expo-router", () => ({ router: { navigate: (...a: unknown[]) => navigate(...a) } }));

const msg = (o: Partial<TeamMessage>): TeamMessage =>
  ({ id: "m1", kind: "go", cs: "DESK1", to: "CREW1", at: 0, expiresAt: 1, mine: false, text: "", place: { lat: 51.5, lng: -0.1, label: "Caledonian Road" }, ...o }) as TeamMessage;

describe("Route here from a team message", () => {
  it("takes the sender's note along, to show with the route and while navigating", () => {
    routeToMessage(msg({ text: "Better location: rear entrance" }));
    expect(navigate.mock.calls.at(-1)![0].params).toMatchObject({ title: "Caledonian Road", note: "DESK1: Better location: rear entrance" });
  });

  it("sends no note when there wasn't one", () => {
    routeToMessage(msg({ text: "" }));
    expect(navigate.mock.calls.at(-1)![0].params.note).toBeUndefined();
  });
});
