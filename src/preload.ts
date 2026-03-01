import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
	minimize: () => ipcRenderer.send("window-minimize"),
	maximize: () => ipcRenderer.send("window-maximize"),
	close: () => ipcRenderer.send("window-close"),
	platform: process.platform,
	appStartTime: Number(process.env.DELTOS_APP_START),
	cliDirectory: process.env.DELTOS_CLI_DIR || null,
	cliFile: process.env.DELTOS_CLI_FILE || null,

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

	// Filesystem API
	readDirectory: (dirPath: string) =>
		ipcRenderer.invoke("fs:readDirectory", dirPath),
	readFile: (filePath: string) =>
		ipcRenderer.invoke("fs:readFile", filePath),
	writeFile: (filePath: string, content: string) =>
		ipcRenderer.invoke("fs:writeFile", filePath, content),
});
