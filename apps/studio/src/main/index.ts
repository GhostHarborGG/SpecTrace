/**
 * Electron main process — the only Electron-aware code in the app.
 *
 * Handlers stay thin: they validate arguments and delegate to ./vault.ts (and,
 * from Phase 4, to `@spectrace/core`). Studio never reimplements engine
 * behavior, it calls it (SPEC-APP-000 §2).
 */
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { IPC_CHANNELS, type BufferOverride, type VaultAnalysis, type VaultSummary } from "../shared/ipc.js";
import { readVault, readVaultFile, writeVaultFile } from "./vault.js";
import { analyzeVault } from "./analysis.js";

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
