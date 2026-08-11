/**
 * Electron main process — the only Electron-aware code in the app.
 *
 * Handlers stay thin: they validate arguments and delegate to ./vault.ts (and,
 * from Phase 4, to `@spectrace/core`). Studio never reimplements engine
 * behavior, it calls it (SPEC-APP-000 §2).
 */
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createOpenAIRankingProvider } from "@spectrace/providers";
import { buildRequirementQueryText, loadConfig, type RankingProvider } from "@spectrace/core";
import {
  IPC_CHANNELS,
  type BufferOverride,
  type DecisionRequest,
  type QueueSnapshot,
  type ReviewOutcome,
  type RunAnalysisRequest,
  type TraceNeighbours,
  type RunResult,
  type VaultAnalysis,
  type VaultSummary
} from "../shared/ipc.js";
import { readVault, readVaultFile, writeVaultFile } from "./vault.js";
import { analyzeVault } from "./analysis.js";
import { coverageReport, linkQueries, readVaultLinkState } from "./coverage.js";
import { applyDecisions, reviewQueue } from "./review.js";
import { runAnalysis } from "./run-analysis.js";

const directory = join(fileURLToPath(import.meta.url), "..");

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    title: "SpecTrace Studio",
    webPreferences: {
      preload: join(directory, "../preload/index.mjs"),
      // Renderer gets no Node access; everything crosses the typed preload
      // bridge instead (setup plan §3.2).
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.on("ready-to-show", () => window.show());

  // External links open in the user's browser, never in an app window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devServerUrl) void window.loadURL(devServerUrl);
  else void window.loadFile(join(directory, "../renderer/index.html"));

  return window;
}

function registerHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.chooseVault, async (): Promise<VaultSummary | null> => {
    const result = await dialog.showOpenDialog({
      title: "Open vault",
      properties: ["openDirectory"]
    });
    const chosen = result.filePaths[0];
    if (result.canceled || !chosen) return null;
    return readVault(chosen);
  });

  ipcMain.handle(IPC_CHANNELS.openVault, (_event, directoryPath: string): VaultSummary => readVault(directoryPath));

  ipcMain.handle(IPC_CHANNELS.readFile, (_event, root: string, relativePath: string): string =>
    readVaultFile(root, relativePath)
  );

  ipcMain.handle(IPC_CHANNELS.writeFile, (_event, root: string, relativePath: string, content: string): void => {
    writeVaultFile(root, relativePath, content);
  });

  ipcMain.handle(
    IPC_CHANNELS.analyzeVault,
    (_event, root: string, overrides?: BufferOverride[]): VaultAnalysis =>
      analyzeVault({ root, ...(overrides ? { overrides } : {}) })
  );

  // The dashboard's data, built by core's shared envelope so it matches
  // `spectrace coverage --json` exactly (NFR-APP-007).
  ipcMain.handle(
    IPC_CHANNELS.coverage,
    (_event, root: string, symbolIndexPath?: string) =>
      coverageReport({ root, ...(symbolIndexPath ? { indexPath: symbolIndexPath } : {}) })
  );

  // One run at a time, tracked here so `cancelAnalysis` has something to
  // cancel. A second request is refused rather than queued: two runs writing
  // the same `.spectrace/` artifacts would interleave their checkpoints and
  // leave a state neither run describes (REQ-APP-012 AC3).
  let active: AbortController | null = null;

  ipcMain.handle(
    IPC_CHANNELS.runAnalysis,
    async (event, request: RunAnalysisRequest): Promise<RunResult> => {
      if (active !== null) throw new Error("An analysis run is already in progress.");
      const controller = new AbortController();
      active = controller;
      try {
        const providers = buildProviders(request.root);
        return await runAnalysis({
          root: request.root,
          queries: vaultQueries(request.root),
          ...(request.mode === undefined ? {} : { mode: request.mode }),
          ...(request.pricing === undefined ? {} : { pricing: request.pricing }),
          ...(providers.rankingProvider === undefined
            ? {}
            : { rankingProvider: providers.rankingProvider }),
          signal: controller.signal,
          onProgress: (progress) => {
            // The window can close mid-run; sending to a destroyed
            // webContents throws and would fail the whole run.
            if (!event.sender.isDestroyed()) {
              event.sender.send(IPC_CHANNELS.onRunProgress, progress);
            }
          }
        });
      } finally {
        active = null;
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.cancelAnalysis, (): boolean => {
    if (active === null) return false;
    active.abort();
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.reviewQueue, (_event, root: string): QueueSnapshot => reviewQueue(root));

  ipcMain.handle(
    IPC_CHANNELS.applyDecisions,
    (_event, request: DecisionRequest): ReviewOutcome => applyDecisions(request)
  );

  ipcMain.handle(
    IPC_CHANNELS.traceNeighbours,
    (_event, root: string, requirementId?: string, symbolId?: string): TraceNeighbours => {
      const queries = linkQueries({ root });
      return {
        symbols: requirementId ? queries.symbolsFor(requirementId) : [],
        requirements: symbolId ? queries.requirementsFor(symbolId) : [],
        unlinked: queries.unlinked()
      };
    }
  );

  // Identity is read, never guessed — the same rule `spectrace review`
  // enforces (REQ-CLI-005 AC2). Null means the UI must ask.
  ipcMain.handle(IPC_CHANNELS.defaultReviewer, (_event, root: string): string | null => {
    try {
      const name = execFileSync("git", ["-C", root, "config", "user.name"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      }).trim();
      return name.length > 0 ? name : null;
    } catch {
      return null;
    }
  });
}

/**
 * Retrieval queries from the vault's requirements.
 *
 * Title, statement, and acceptance criteria, joined by core's
 * `buildRequirementQueryText` — the same function and the same fields
 * `spectrace analyze` uses. REQ-CORE-001 gained `statement` on 2026-08-10
 * precisely so this could be true; before that a vault requirement had no
 * statement to offer and Studio retrieved on strictly less text than the CLI.
 *
 * A requirement with no `## Statement` section contributes an empty string
 * there, which is the same thing the CLI's loader would produce for it.
 */
function vaultQueries(root: string): Array<{ requirementId: string; text: string }> {
  const { requirements } = readVaultLinkState({ root });
  return requirements.map((requirement) => ({
    requirementId: requirement.id,
    text: buildRequirementQueryText({
      title: requirement.title,
      statement: requirement.statement ?? "",
      acceptanceCriteria: requirement.acceptanceCriteria
    })
  }));
}

/**
 * Builds the model providers from configuration and the environment, using the
 * same adapter the CLI uses (`@spectrace/providers`).
 *
 * Studio may read the environment; core may not (CLAUDE.md rule 2), which is
 * why providers are constructed at this boundary and injected inward. Either a
 * missing key or an unconfigured `model.ranking` yields no provider, and the
 * run stops after retrieval rather than failing — the same behaviour as
 * `analyze` with no model configured. The adapter has no default model on
 * purpose, so an unset one is a stop, never a guess.
 */
function buildProviders(root: string): { rankingProvider?: RankingProvider } {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (apiKey === undefined || apiKey.length === 0) return {};

  const model = loadConfig(root).config.model.ranking;
  if (!model) return {};

  return { rankingProvider: createOpenAIRankingProvider({ apiKey, model }) };
}

void app.whenReady().then(() => {
  registerHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
