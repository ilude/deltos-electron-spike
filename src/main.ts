import path from "node:path";

import { app, BrowserWindow, ipcMain } from "electron";

const projectRoot = app.getAppPath();
const distDir = path.join(projectRoot, "dist");
const isMac = process.platform === "darwin";

function createWindow(): void {
	const win = new BrowserWindow({
		width: 1200,
		height: 800,
		frame: false,
		titleBarStyle: isMac ? "hiddenInset" : "hidden",
		trafficLightPosition: isMac ? { x: 12, y: 8 } : undefined,
		webPreferences: {
			preload: path.join(distDir, "preload.js"),
		},
	});

	win.loadFile(path.join(projectRoot, "index.html"));
}

ipcMain.on("window-minimize", (e) => {
	BrowserWindow.fromWebContents(e.sender)?.minimize();
});
ipcMain.on("window-maximize", (e) => {
	const win = BrowserWindow.fromWebContents(e.sender);
	if (win?.isMaximized()) {
		win.unmaximize();
	} else {
		win?.maximize();
	}
});
ipcMain.on("window-close", (e) => {
	BrowserWindow.fromWebContents(e.sender)?.hide();
	app.quit();
});

app.whenReady().then(() => {
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});
