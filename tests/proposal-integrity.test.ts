import { describe, expect, it } from "vitest";
import { discoveryToSalesProposal } from "../src/workflow-mappers/workflows.js";
import { inferSummary } from "../src/workflow-mappers/incident-parse.js";

type Proposal = {
  client: { name: string; contact?: string; email?: string };
  executive_summary: string;
  pricing: { subtotal: string; total: string };
};

describe("sales proposal integrity (no fabrication)", () => {
  const northwind = () =>
    discoveryToSalesProposal(
      "Northwind wants a data warehouse migration and Looker dashboards. Tight Q3 deadline.",
      "Snowflake migration\nLooker dashboard build\nTeam training",
      [
        { item: "Migration", amount: "$80000" },
        { item: "Dashboards", amount: "$40000" },
      ],
    ) as Proposal;

  it("extracts the real client name, never a hardcoded fixture client", () => {
    const r = northwind();
    expect(r.client.name).toBe("Northwind");
    expect(r.client.name).not.toBe("Northstar Analytics");
  });

  it("never invents a contact name or email", () => {
    const r = northwind();
    expect(r.client.contact).toBeUndefined();
    expect(r.client.email).toBeUndefined();
  });

  it("applies NO markup — total equals the user-supplied subtotal", () => {
    const r = northwind();
    expect(r.pricing.subtotal).toBe("$120,000");
    expect(r.pricing.total).toBe("$120,000");
  });

  it("grounds the executive summary in the actual scope, not a canned line", () => {
    const r = northwind();
    expect(r.executive_summary).toContain("Northwind");
    expect(r.executive_summary.toLowerCase()).toContain("snowflake migration");
  });

  it("surfaces a contact/email only when genuinely present in discovery", () => {
    const r = discoveryToSalesProposal(
      "Globex needs onboarding automation. contact: Dana Wells, dana@globex.example",
      "Onboarding flow",
      [{ item: "Build", amount: "$10000" }],
    ) as Proposal;
    expect(r.client.name).toBe("Globex");
    expect(r.client.contact).toBe("Dana Wells");
    expect(r.client.email).toBe("dana@globex.example");
  });
});

describe("incident summary integrity", () => {
  it("does NOT claim resolution when the incident is unresolved", () => {
    const s = inferSummary("api errors spiking, still investigating, no fix yet", [
      { time: "10:00", event: "pager: api errors spiking" },
    ]);
    expect(s).toMatch(/not confirmed/i);
    expect(s).not.toMatch(/was resolved|restored/i);
  });

  it("claims resolution only when the transcript shows it", () => {
    const s = inferSummary("errors spiking… rollback deployed, all clear, recovered", [
      { time: "10:00", event: "pager: error rate high" },
    ]);
    expect(s).toMatch(/resolved/i);
  });
});
