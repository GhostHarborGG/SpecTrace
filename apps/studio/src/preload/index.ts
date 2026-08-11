/**
 * The security bridge (setup plan §3.2). Exposes exactly the {@link Api}
 * surface on `window.api` and nothing else — no `ipcRenderer`, no `require`.
 */
import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS, type Api, type RunProgress } from "../shared/ipc.js";

const api: Api = {
  chooseVault: () => ipcRenderer.invoke(IPC_CHANNELS.chooseVault),
  openVault: (directory) => ipcRenderer.invoke(IPC_CHANNELS.openVault, directory),
  readFile: (root, relativePath) => ipcRenderer.invoke(IPC_CHANNELS.readFile, root, relativePath),
  writeFile: (root, relativePath, content) =>
    ipcRenderer.invoke(IPC_CHANNELS.writeFile, root, relativePath, content),
  analyzeVault: (root, overrides) => ipcRenderer.invoke(IPC_CHANNELS.analyzeVault, root, overrides),
  coverage: (root, symbolIndexPath) => ipcRenderer.invoke(IPC_CHANNELS.coverage, root, symbolIndexPath),
  runAnalysis: (request) => ipcRenderer.invoke(IPC_CHANNELS.runAnalysis, request),
  cancelAnalysis: () => ipcRenderer.invoke(IPC_CHANNELS.cancelAnalysis),
  onRunProgress: (listener) => {
    // The raw IpcRendererEvent stays on this side of the bridge — exposing it
    // would hand the renderer a `sender` it could post on, which is the whole
    // thing contextIsolation exists to prevent (setup plan §3.2).
    const handler = (_event: unknown, progress: RunProgress): void => listener(progress);
    ipcRenderer.on(IPC_CHANNELS.onRunProgress, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.onRunProgress, handler);
  },
  reviewQueue: (root) => ipcRenderer.invoke(IPC_CHANNELS.reviewQueue, root),
  applyDecisions: (request) => ipcRenderer.invoke(IPC_CHANNELS.applyDecisions, request),
  traceNeighbours: (root, requirementId, symbolId) =>
    ipcRenderer.invoke(IPC_CHANNELS.traceNeighbours, root, requirementId, symbolId),
  defaultReviewer: (root) => ipcRenderer.invoke(IPC_CHANNELS.defaultReviewer, root)
};

contextBridge.exposeInMainWorld("api", api);
