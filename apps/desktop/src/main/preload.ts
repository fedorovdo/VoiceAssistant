import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("voiceAssistant", {
  platform: process.platform
});
