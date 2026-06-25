import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("voiceAssistant", {
  platform: process.platform,
  notifyRendererReady: () => ipcRenderer.send("renderer-ready")
});
