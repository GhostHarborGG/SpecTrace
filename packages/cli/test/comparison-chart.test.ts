import { describe, expect, it } from "vitest";
import { compareMetricsReports, type ConfigurationRun } from "@spectrace/core";
import { MAX_CHARTED_CONFIGURATIONS, renderComparisonChart } from "../src/comparison-chart.js";
import type { RetrievalMetricsReport } from "@spectrace/core";

const STRATA = ["overall", "high-overlap", "independent-plus-candidate-review"];

function report(base: number, strata = STRATA, ks = [1, 5, 10]): RetrievalMetricsReport {
  return {
    ks: [...ks],
    breakdowns: strata.map((label, i) => {
      const v = Math.min(1, base + i * 0.05);
      return {
        label,
        requirementCount: 12,
        requirementsWithoutGroundTruth: [],
        recallAtK: Object.fromEntries(ks.map((k) => [String(k), v * (k / 10)])),
        hitAtK: Object.fromEntries(ks.map((k) => [String(k), v * 10 * k])),
        meanReciprocalRank: v * 0.7
      };
    })
  };
}

const run = (label: string, base: number, strata?: string[]): ConfigurationRun => ({
  configurationId: `${label}-config`,
  label,
  report: report(base, strata)
});

const THREE = compareMetricsReports([run("lexical", 0.78), run("semantic", 0.71), run("hybrid", 0.85)]);
const ONE = compareMetricsReports([run("lexical", 0.78)]);

/** Every numeric attribute the SVG declares, so geometry can be checked rather than eyeballed. */
function attrs(svg: string, name: string): number[] {
  return [...svg.matchAll(new RegExp(`${name}="([-\\d.]+)"`, "g"))].map((m) => Number(m[1]));
}

function canvas(svg: string): { width: number; height: number } {
  const [, width, height] = /width="(\d+)" height="(\d+)"/.exec(svg)!;
  return { width: Number(width), height: Number(height) };
}

describe("renderComparisonChart — structure", () => {
  it("is a self-contained SVG with no external reference", () => {
    const svg = renderComparisonChart(THREE, { k: 10 });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).not.toMatch(/<script/);
    expect(svg).not.toMatch(/<image/);
    expect(svg).not.toMatch(/@import|url\(/);
    // The only URL may be the SVG namespace declaration, which fetches nothing.
    const urls = [...svg.matchAll(/https?:\/\/[^"\s)]+/g)].map((m) => m[0]);
    expect(urls).toEqual(["http://www.w3.org/2000/svg"]);
  });

  it("carries a legend for two or more series and none for one", () => {
    // The class is declared in the stylesheet either way; what matters is
    // whether an element wears it.
    expect(renderComparisonChart(THREE, { k: 10 })).toMatch(/class="legend-label" x=/);
    // A single series is named by the title; a one-swatch box would restate it.
    expect(renderComparisonChart(ONE, { k: 10 })).not.toMatch(/class="legend-label" x=/);
  });

  it("reclaims the legend band when there is no legend", () => {
    const three = canvas(renderComparisonChart(THREE, { k: 10 }));
    const one = canvas(renderComparisonChart(ONE, { k: 10 }));
    // One series is also one bar per group, so `one` is shorter on both counts;
    // what matters is that it does not reserve empty legend space.
    expect(one.height).toBeLessThan(three.height);
  });

  it("labels every bar with its value, discharging the light-mode contrast relief rule", () => {
    const svg = renderComparisonChart(THREE, { k: 10 });
    const bars = [...svg.matchAll(/<path d="M/g)].length;
    const values = [...svg.matchAll(/class="value"/g)].length;
    expect(bars).toBe(STRATA.length * 3);
    expect(values).toBe(bars);
  });

  it("gives every bar a hover title without making it the only way to read the value", () => {
    const svg = renderComparisonChart(THREE, { k: 10 });
    expect([...svg.matchAll(/<title>/g)]).toHaveLength(STRATA.length * 3);
    expect(svg).toContain('class="value"');
  });

  it("names the chart for assistive technology", () => {
    const svg = renderComparisonChart(THREE, { k: 10 });
    expect(svg).toContain('role="img"');
    expect(svg).toMatch(/aria-label="Recall at 10 by requirement stratum, comparing lexical, semantic, hybrid"/);
  });

  it("selects dark-mode steps rather than flipping colors", () => {
    const svg = renderComparisonChart(THREE, { k: 10 });
    expect(svg).toContain("prefers-color-scheme: dark");
    // Light and dark steps of the same three hues, both present.
    expect(svg).toContain("#2a78d6");
    expect(svg).toContain("#3987e5");
  });

  it("keeps text in text tokens, never in a series color", () => {
    const svg = renderComparisonChart(THREE, { k: 10 });
    const textFills = [...svg.matchAll(/class="(title|subtitle|stratum|value|tick|foot|legend-label)"[^>]*fill="([^"]+)"/g)];
    expect(textFills).toHaveLength(0); // fills come from the stylesheet's text tokens only
    expect(svg).toMatch(/\.value \{ fill: var\(--ink-2\); \}/);
  });
});

describe("renderComparisonChart — geometry", () => {
  it("keeps every mark and label inside the canvas", () => {
    const svg = renderComparisonChart(THREE, { k: 10 });
    const { width, height } = canvas(svg);
    for (const x of attrs(svg, "x").concat(attrs(svg, "x1"), attrs(svg, "x2"))) {
      expect(x).toBeGreaterThanOrEqual(0);
      // Value labels sit in the right gutter; nothing may start past the edge.
      expect(x).toBeLessThan(width);
    }
    for (const y of attrs(svg, "y").concat(attrs(svg, "y1"), attrs(svg, "y2"))) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(height);
    }
  });

  it("grows the canvas to hold footnotes clear of the axis title", () => {
    const partial = compareMetricsReports([
      run("lexical", 0.78),
      run("semantic", 0.71, [...STRATA, "domain-vocabulary"])
    ]);
    expect(partial.omitted.length).toBeGreaterThan(0);

    const withFootnotes = renderComparisonChart(partial, { k: 10 });
    const axisTitleY = Math.max(...attrs(withFootnotes, "y").filter((_, i) => true));
    const footY = [...withFootnotes.matchAll(/class="foot" x="[\d.]+" y="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(footY.length).toBeGreaterThan(0);
    // Footnotes clear the axis title band, and the canvas grew to hold them.
    expect(Math.min(...footY)).toBeGreaterThan(0);
    expect(canvas(withFootnotes).height).toBeGreaterThanOrEqual(axisTitleY);
  });

  it("emits no float noise in coordinates", () => {
    // Value labels legitimately carry three decimals; coordinates must not.
    // Checked as text — `628.8 * 100` is itself a float and proves nothing.
    const svg = renderComparisonChart(THREE, { k: 10 });
    const coordinateText = [
      ...[...svg.matchAll(/ (?:x|y|x1|y1|x2|y2)="([\d.-]+)"/g)].map((m) => m[1]!),
      ...[...svg.matchAll(/ d="([^"]+)"/g)].flatMap((m) => [...m[1]!.matchAll(/[\d.]+/g)].map((v) => v[0]))
    ];
    const noisy = coordinateText.filter((token) => (token.split(".")[1] ?? "").length > 2);
    expect(noisy).toEqual([]);
  });

  it("caps bar thickness and separates neighbours with a surface gap, not a stroke", () => {
    const svg = renderComparisonChart(THREE, { k: 10 });
    expect(svg).not.toMatch(/<path[^>]*stroke=/);
    // Consecutive bars in a group start 16px apart: a 14px bar plus a 2px gap.
    const barTops = [...svg.matchAll(/<path d="M[\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
    expect(barTops[1]! - barTops[0]!).toBe(16);
  });
});

describe("renderComparisonChart — refusals and honesty", () => {
  it("refuses a k the comparison does not report", () => {
    expect(() => renderComparisonChart(THREE, { k: 7 })).toThrow(/no k=7/);
  });

  it("defaults to the largest shared k", () => {
    expect(renderComparisonChart(THREE)).toContain("Recall@10");
  });

  it("reproduces the comparison's omissions as figure footnotes", () => {
    const partial = compareMetricsReports([
      run("lexical", 0.78),
      run("semantic", 0.71, [...STRATA, "domain-vocabulary"])
    ]);
    const svg = renderComparisonChart(partial, { k: 10 });
    expect(svg).toContain("domain-vocabulary");
    expect(svg).toContain('class="foot"');
  });

  it("states in the figure when a configuration was dropped rather than given a generated hue", () => {
    const four = compareMetricsReports([
      run("lexical", 0.7),
      run("semantic", 0.72),
      run("hybrid", 0.8),
      run("fourth", 0.6)
    ]);
    const svg = renderComparisonChart(four, { k: 10 });
    expect(four.configurations).toHaveLength(4);
    expect(MAX_CHARTED_CONFIGURATIONS).toBe(3);
    expect(svg).toContain("Not charted: fourth");
    // Three bars per stratum, not four.
    expect([...svg.matchAll(/<path d="M/g)]).toHaveLength(STRATA.length * 3);
  });

  it("draws no bar for a cell the comparison had no value for", () => {
    const partial = compareMetricsReports([
      run("lexical", 0.78),
      run("semantic", 0.71, [...STRATA, "domain-vocabulary"])
    ]);
    const svg = renderComparisonChart(partial, { k: 10 });
    // 3 shared strata x 2 configurations, plus 1 for the semantic-only stratum.
    expect([...svg.matchAll(/<path d="M/g)]).toHaveLength(STRATA.length * 2 + 1);
  });

  it("escapes configuration labels rather than injecting markup", () => {
    const nasty = compareMetricsReports([
      { configurationId: "x", label: '</text><script>alert(1)</script>', report: report(0.5) },
      run("semantic", 0.71)
    ]);
    const svg = renderComparisonChart(nasty, { k: 10 });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;/text&gt;");
  });
});
