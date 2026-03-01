import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
	minimize: () => ipcRenderer.send("window-minimize"),
	maximize: () => ipcRenderer.send("window-maximize"),
	close: () => ipcRenderer.send("window-close"),
	platform: process.platform,
	appStartTime: Number(process.env.DELTOS_APP_START),

	getCliArgs: () =>
		ipcRenderer.invoke("app:get-cli-args") as Promise<{
			directory: string | null;
			file: string | null;
		}>,

	// Terminal API
	listShells: () => ipcRenderer.invoke("terminal:list-shells"),
	spawnTerminal: (shellPath: string) =>
		ipcRenderer.invoke("terminal:spawn", shellPath),
	writeTerminal: (id: number, data: string) =>
		ipcRenderer.send("terminal:write", id, data),
	resizeTerminal: (id: number, cols: number, rows: number) =>
		ipcRenderer.send("terminal:resize", id, cols, rows),
	killTerminal: (id: number) => ipcRenderer.send("terminal:kill", id),
	onTerminalData: (callback: (id: number, data: string) => void) => {
		const listener = (
			_event: Electron.IpcRendererEvent,
			id: number,
			data: string,
		) => callback(id, data);
		ipcRenderer.on("terminal:data", listener);
		return () => ipcRenderer.removeListener("terminal:data", listener);
	},
	onTerminalExit: (callback: (id: number) => void) => {
		const listener = (_event: Electron.IpcRendererEvent, id: number) =>
			callback(id);
		ipcRenderer.on("terminal:exit", listener);
		return () => ipcRenderer.removeListener("terminal:exit", listener);
	},
});
