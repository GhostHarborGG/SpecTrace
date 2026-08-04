/**
 * Recall@k chart for the evaluation report — a self-contained SVG.
 *
 * Horizontal grouped bars: one group per stratum, one bar per retrieval
 * configuration. The reader's job is "tell the configurations apart and
 * compare their magnitude per stratum", which is the categorical-color case;
 * strata labels are long, so the bars run horizontally where the label has
 * room to sit unrotated.
 *
 * Palette: categorical slots 1–3 from the reference palette, validated with
 * the skill's checker for both surfaces at all pairs (light: worst CVD ΔE
 * 9.2, normal-vision 24.0; dark: 9.4 / 20.9). Light-mode aqua sits at 2.74:1
 * against the light surface, below the 3:1 bar, so the **relief rule**
 * applies and is discharged twice over: every bar carries a visible value
 * label, and the same comparison ships as Markdown and CSV tables.
 *
 * Three configurations is also the cap, not a coincidence — past three the
 * palette cannot clear the all-pairs floors, so a fourth would need faceting
 * rather than a fourth hue.
 *
 * Self-contained on purpose: no external fonts, no scripts, no network. The
 * figure has to survive being dropped into a report, a repository, or a PDF.
 */

import type { MetricsComparison } from "@spectrace/core";

/** Categorical slots 1–3, light and dark steps of the same hues. */
const SERIES_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a"] as const;
const SERIES_DARK = ["#3987e5", "#d95926", "#199e70"] as const;

export const MAX_CHARTED_CONFIGURATIONS = SERIES_LIGHT.length;

const BAR_HEIGHT = 14;
/** The surface gap that separates touching bars — white doing the separating, never a stroke. */
const BAR_GAP = 2;
const GROUP_GAP = 18;
const PLOT_WIDTH = 460;
const LABEL_GUTTER = 46;
const PAGE_PAD = 24;
const HEADER_HEIGHT = 52;
const LEGEND_HEIGHT = 26;
/** Bottom band holds the tick row (+18) and the axis title (+36), plus air below it. */
const MARGIN = { right: LABEL_GUTTER + 16, bottom: 52, left: 264 };
const FOOTNOTE_LINE = 15;
/** Clear air between the axis title and the first footnote — without it they collide. */
const FOOTNOTE_TOP_GAP = 16;
const TICKS = [0, 0.25, 0.5, 0.75, 1];

/** Rounded to hundredths: SVG needs no more precision than that, and `681.6666666666666` is noise. */
const n = (value: number): string => String(Math.round(value * 100) / 100);

/** Rough advance width for system-ui sans — enough to lay out a legend and to check a label fits. */
const approxTextWidth = (text: string, fontSize: number): number => text.length * fontSize * 0.55;

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** A bar with a square baseline end and a 4px rounded data-end. */
function barPath(x: number, y: number, width: number, height: number, radius = 4): string {
  const r = Math.max(0, Math.min(radius, width, height / 2));
  if (width <= 0) return "";
  return [
    `M${n(x)} ${n(y)}`,
    `H${n(x + width - r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(x + width)} ${n(y + r)}`,
    `V${n(y + height - r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(x + width - r)} ${n(y + height)}`,
    `H${n(x)}`,
    "Z"
  ].join(" ");
}

export interface ChartOptions {
  /** Which k to chart; defaults to the largest k the comparison shares. */
  k?: number;
  title?: string;
  /** Rows to include; defaults to every row in the comparison. */
  strata?: readonly string[];
}

/**
 * Renders the comparison as an SVG figure.
 *
 * Configurations past the third are dropped rather than given a generated
 * hue, and the drop is stated in the figure's own footnote — the same rule
 * the comparison follows for unshared k values and strata: a figure that
 * quietly shows a subset reads as the whole picture.
 */
export function renderComparisonChart(comparison: MetricsComparison, options: ChartOptions = {}): string {
  const k = options.k ?? comparison.ks[comparison.ks.length - 1]!;
  if (!comparison.ks.includes(k)) {
    throw new Error(`This comparison has no k=${k}; it reports ${comparison.ks.join(", ")}.`);
  }

  const rows = comparison.rows.filter((row) => options.strata === undefined || options.strata.includes(row.stratum));
  if (rows.length === 0) throw new Error("No strata to chart.");

  const charted = comparison.configurations.slice(0, MAX_CHARTED_CONFIGURATIONS);
  const dropped = comparison.configurations.slice(MAX_CHARTED_CONFIGURATIONS);

  const groupHeight = charted.length * BAR_HEIGHT + (charted.length - 1) * BAR_GAP;
  const plotHeight = rows.length * groupHeight + (rows.length - 1) * GROUP_GAP;

  const footnotes: string[] = comparison.omitted.map((o) => o.message);
  if (dropped.length > 0) {
    footnotes.push(
      `Not charted: ${dropped.map((c) => c.label).join(", ")} — the palette seats three configurations; see the table for the rest.`
    );
  }
  const footnoteHeight =
    footnotes.length === 0 ? 0 : FOOTNOTE_TOP_GAP + footnotes.length * FOOTNOTE_LINE;

  // A single series carries no legend, so its band is not reserved either —
  // otherwise the figure opens with 26px of unexplained air.
  const hasLegend = charted.length > 1;
  const marginTop = HEADER_HEIGHT + (hasLegend ? LEGEND_HEIGHT : 0) + 20;

  const width = MARGIN.left + PLOT_WIDTH + MARGIN.right;
  const height = marginTop + plotHeight + MARGIN.bottom + footnoteHeight;
  const x = (value: number) => MARGIN.left + value * PLOT_WIDTH;

  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
      `viewBox="0 0 ${width} ${height}" role="img" ` +
      `aria-label="${escapeXml(`Recall at ${k} by requirement stratum, comparing ${charted.map((c) => c.label).join(", ")}`)}">`
  );

  // Dark mode is selected, not an automatic flip: the same three hues stepped
  // for the dark surface, validated as their own set.
  parts.push(`<style>
  svg { --surface: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781; --grid: #e1e0d9; --axis: #c3c2b7;
        --s1: ${SERIES_LIGHT[0]}; --s2: ${SERIES_LIGHT[1]}; --s3: ${SERIES_LIGHT[2]};
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  @media (prefers-color-scheme: dark) {
    svg { --surface: #1a1a19; --ink: #ffffff; --ink-2: #c3c2b7; --muted: #898781; --grid: #2c2c2a; --axis: #383835;
          --s1: ${SERIES_DARK[0]}; --s2: ${SERIES_DARK[1]}; --s3: ${SERIES_DARK[2]}; }
  }
  .surface { fill: var(--surface); }
  .title { fill: var(--ink); font-size: 15px; font-weight: 600; }
  .subtitle, .legend-label { fill: var(--ink-2); font-size: 12px; }
  .stratum { fill: var(--ink-2); font-size: 12px; }
  /* Values and ticks align in columns, so tabular figures earn their place here. */
  .value, .tick { fill: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .value { fill: var(--ink-2); }
  .foot { fill: var(--muted); font-size: 10.5px; }
  .grid { stroke: var(--grid); stroke-width: 1; }
  .axis { stroke: var(--axis); stroke-width: 1; }
</style>`);

  parts.push(`<rect class="surface" x="0" y="0" width="${width}" height="${height}"/>`);

  // Header sits at the figure's left edge, not the plot's: the subtitle is
  // longer than the plot is wide, and indenting it to the axis overflows.
  const title = options.title ?? `Recall@${k} by requirement stratum`;
  parts.push(`<text class="title" x="${PAGE_PAD}" y="28">${escapeXml(title)}</text>`);
  parts.push(
    `<text class="subtitle" x="${PAGE_PAD}" y="46">${escapeXml("Macro-averaged; higher is better.")}</text>`
  );

  // Legend — always present for two or more series; a single series is named
  // by the title instead, so a one-swatch box would only restate it.
  if (hasLegend) {
    let legendX = PAGE_PAD;
    parts.push(`<g>`);
    charted.forEach((configuration, i) => {
      parts.push(
        `<rect x="${n(legendX)}" y="${HEADER_HEIGHT + 10}" width="12" height="12" rx="2" fill="var(--s${i + 1})"/>` +
          `<text class="legend-label" x="${n(legendX + 18)}" y="${HEADER_HEIGHT + 20}">${escapeXml(configuration.label)}</text>`
      );
      legendX += 18 + approxTextWidth(configuration.label, 12) + 20;
    });
    parts.push(`</g>`);
  }

  // Gridlines: solid hairlines, one step off the surface, behind the data.
  for (const tick of TICKS) {
    parts.push(
      `<line class="${tick === 0 ? "axis" : "grid"}" x1="${n(x(tick))}" y1="${n(marginTop)}" x2="${n(x(tick))}" y2="${n(marginTop + plotHeight)}"/>`
    );
    parts.push(
      `<text class="tick" x="${n(x(tick))}" y="${n(marginTop + plotHeight + 18)}" text-anchor="middle">${tick.toFixed(2)}</text>`
    );
  }
  parts.push(
    `<text class="tick" x="${n(MARGIN.left + PLOT_WIDTH / 2)}" y="${n(marginTop + plotHeight + 36)}" text-anchor="middle">Recall@${k}</text>`
  );

  rows.forEach((row, rowIndex) => {
    const groupTop = marginTop + rowIndex * (groupHeight + GROUP_GAP);
    parts.push(
      `<text class="stratum" x="${n(MARGIN.left - 12)}" y="${n(groupTop + groupHeight / 2 + 4)}" text-anchor="end">${escapeXml(row.stratum)}</text>`
    );

    charted.forEach((configuration, i) => {
      const cell = row.cells.find((c) => c.label === configuration.label);
      const value = cell?.recallAtK?.[String(k)];
      const barTop = groupTop + i * (BAR_HEIGHT + BAR_GAP);
      // A cell with no value gets no bar; the footnote says which row is partial.
      if (value === undefined) return;

      const barWidth = value * PLOT_WIDTH;
      parts.push(
        `<path d="${barPath(MARGIN.left, barTop, barWidth, BAR_HEIGHT)}" fill="var(--s${i + 1})">` +
          `<title>${escapeXml(`${configuration.label} · ${row.stratum} · Recall@${k} ${value.toFixed(3)}`)}</title>` +
          `</path>`
      );
      // Value at the tip, outside the bar, so nothing is ever clipped by its
      // own mark — and it discharges the light-mode contrast relief rule.
      parts.push(
        `<text class="value" x="${n(MARGIN.left + barWidth + 6)}" y="${n(barTop + BAR_HEIGHT - 3)}">${value.toFixed(3)}</text>`
      );
    });
  });

  footnotes.forEach((note, i) => {
    parts.push(
      `<text class="foot" x="${PAGE_PAD}" y="${n(
        marginTop + plotHeight + MARGIN.bottom + FOOTNOTE_TOP_GAP + i * FOOTNOTE_LINE
      )}">${escapeXml(note)}</text>`
    );
  });

  parts.push(`</svg>`);
  return parts.join("\n") + "\n";
}
