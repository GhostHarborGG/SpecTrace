/**
 * The security bridge (setup plan §3.2). Exposes exactly the {@link Api}
 * surface on `window.api` and nothing else — no `ipcRenderer`, no `require`.
 */
import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS, type Api } from "../shared/ipc.js";

const api: Api = {
  chooseVault: () => ipcRenderer.invoke(IPC_CHANNELS.chooseVault),
  openVault: (directory) => ipcRenderer.invoke(IPC_CHANNELS.openVault, directory),
  readFile: (root, relativePath) => ipcRenderer.invoke(IPC_CHANNELS.readFile, root, relativePath)
};

contextBridge.exposeInMainWorld("api", api);
