import { describe, expect, it } from "vitest";
import { routeIntent } from "../src/slack/router.js";

describe("router brand and template intents", () => {
  it("routes brand commands before workflows", () => {
    expect(routeIntent("@forge brand for Acme")).toEqual({
      kind: "brand",
      rawText: "brand for Acme",
    });
    expect(routeIntent("@forge brand use northstar")).toEqual({
      kind: "brand",
      rawText: "brand use northstar",
    });
  });

  it("routes template studio commands", () => {
    expect(routeIntent("@forge template list").kind).toBe("template");
    expect(routeIntent('@forge template scaffold x --name "X" --fields a,b').kind).toBe("template");
  });

  it("routes metrics to monthly_metrics document workflow", () => {
    expect(routeIntent("@forge metrics").kind).toBe("document");
    expect(routeIntent("@forge monthly metrics").kind).toBe("document");
  });
});
