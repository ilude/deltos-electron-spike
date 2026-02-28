import path from "node:path";
import { app, BrowserWindow } from "electron";

// app.getAppPath() returns the project root at runtime,
// avoiding bun's compile-time __dirname replacement.
const projectRoot = app.getAppPath();
const distDir = path.join(projectRoot, "dist");

function createWindow(): void {
	const win = new BrowserWindow({
		width: 1200,
		height: 800,
		webPreferences: {
			preload: path.join(distDir, "preload.js"),
		},
	});

	win.loadFile(path.join(projectRoot, "index.html"));
}

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
