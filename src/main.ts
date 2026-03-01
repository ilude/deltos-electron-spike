const APP_START = Date.now();

import fs from "node:fs";
import path from "node:path";

import { app, BrowserWindow, ipcMain } from "electron";
import * as pty from "node-pty";

const projectRoot = app.getAppPath();
const distDir = path.join(projectRoot, "dist");
const isMac = process.platform === "darwin";
const isWin = process.platform === "win32";

// ── CLI Argument Parsing ──

const cliArg =
	process.argv.find((arg, i) => i >= 2 && !arg.startsWith("--")) ?? null;
let cliDirectory: string | null = null;
let cliFile: string | null = null;
if (cliArg) {
	const resolved = path.resolve(cliArg);
	try {
		const stat = fs.statSync(resolved);
		if (stat.isDirectory()) {
			cliDirectory = resolved;
		} else if (stat.isFile()) {
			cliFile = resolved;
			cliDirectory = path.dirname(resolved);
		}
	} catch {
		/* invalid path, ignore */
	}
}

// ── Shell Detection ──

interface ShellInfo {
	name: string;
	path: string;
}

function detectShells(): ShellInfo[] {
	const shells: ShellInfo[] = [];

	if (isWin) {
		// PowerShell (Windows built-in) — always available
		shells.push({ name: "PowerShell", path: "powershell.exe" });

		// PowerShell Core (v7+)
		const pwshPath = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";
		if (fs.existsSync(pwshPath)) {
			shells.push({ name: "PowerShell 7", path: pwshPath });
		}

		// Git Bash
		const gitBashPath = "C:\\Program Files\\Git\\bin\\bash.exe";
		if (fs.existsSync(gitBashPath)) {
			shells.push({ name: "Git Bash", path: gitBashPath });
		}

		// WSL
		const wslPath = "C:\\Windows\\System32\\wsl.exe";
		if (fs.existsSync(wslPath)) {
			shells.push({ name: "WSL", path: wslPath });
		}

		// Command Prompt
		shells.push({ name: "Command Prompt", path: "cmd.exe" });
	} else {
		// Linux/macOS
		const unixShells: [string, string][] = [
			["Bash", "/bin/bash"],
			["Zsh", "/bin/zsh"],
			["Fish", "/usr/bin/fish"],
		];
		for (const [name, shellPath] of unixShells) {
			if (fs.existsSync(shellPath)) {
				shells.push({ name, path: shellPath });
			}
		}
	}

	return shells;
}

// ── Shell Cache ──

let cachedShells: ShellInfo[] | null = null;

// ── Pre-spawned Terminal ──

interface PreSpawnedTerminal {
	id: number;
	pty: pty.IPty;
	shellPath: string;
	bufferedData: string[];
	bufferDisposable: { dispose(): void };
}
let preSpawnedTerminal: PreSpawnedTerminal | null = null;

// ── PTY Management ──

const terminals = new Map<number, pty.IPty>();
let nextTerminalId = 1;

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

// ── Terminal IPC Handlers ──

ipcMain.handle("app:get-cli-args", () => ({
	directory: cliDirectory,
	file: cliFile,
}));

ipcMain.handle("terminal:list-shells", () => {
	return cachedShells ?? detectShells();
});

ipcMain.handle("terminal:spawn", (e, shellPath: string) => {
	const sender = e.sender;
	const terminalCwd =
		cliDirectory || process.env.HOME || process.env.USERPROFILE || projectRoot;

	// Consume pre-spawned terminal if shell matches
	if (preSpawnedTerminal && preSpawnedTerminal.shellPath === shellPath) {
		const pre = preSpawnedTerminal;
		preSpawnedTerminal = null;

		pre.bufferDisposable.dispose();
		terminals.set(pre.id, pre.pty);

		pre.pty.onData((data) => {
			if (!sender.isDestroyed()) {
				sender.send("terminal:data", pre.id, data);
			}
		});

		pre.pty.onExit(() => {
			terminals.delete(pre.id);
			if (!sender.isDestroyed()) {
				sender.send("terminal:exit", pre.id);
			}
		});

		// Replay buffered data
		for (const chunk of pre.bufferedData) {
			if (!sender.isDestroyed()) {
				sender.send("terminal:data", pre.id, chunk);
			}
		}

		return pre.id;
	}

	// Fresh spawn
	const id = nextTerminalId++;
	const shell = pty.spawn(shellPath, [], {
		name: "xterm-256color",
		cols: 80,
		rows: 24,
		cwd: terminalCwd,
		env: process.env as Record<string, string>,
	});

	terminals.set(id, shell);

	shell.onData((data) => {
		if (!sender.isDestroyed()) {
			sender.send("terminal:data", id, data);
		}
	});

	shell.onExit(() => {
		terminals.delete(id);
		if (!sender.isDestroyed()) {
			sender.send("terminal:exit", id);
		}
	});

	return id;
});

ipcMain.on("terminal:write", (_e, id: number, data: string) => {
	terminals.get(id)?.write(data);
});

ipcMain.on("terminal:resize", (_e, id: number, cols: number, rows: number) => {
	terminals.get(id)?.resize(cols, rows);
});

ipcMain.on("terminal:kill", (_e, id: number) => {
	const term = terminals.get(id);
	if (term) {
		term.kill();
		terminals.delete(id);
	}
});

app.whenReady().then(() => {
	process.env.DELTOS_APP_START = String(APP_START);
	const mainReady = Date.now() - APP_START;
	cachedShells = detectShells();
	createWindow();
	const windowCreated = Date.now() - APP_START;
	console.log(
		`[Deltos Main] main-ready: ${mainReady}ms, window-created: ${windowCreated}ms`,
	);

	// Pre-spawn default terminal using first cached shell
	if (cachedShells && cachedShells.length > 0) {
		const defaultShell = cachedShells[0];
		const terminalCwd =
			process.env.HOME || process.env.USERPROFILE || projectRoot;
		const id = nextTerminalId++;
		const prePty = pty.spawn(defaultShell.path, [], {
			name: "xterm-256color",
			cols: 80,
			rows: 24,
			cwd: terminalCwd,
			env: process.env as Record<string, string>,
		});

		const bufferedData: string[] = [];
		const bufferDisposable = prePty.onData((data) => {
			bufferedData.push(data);
		});

		preSpawnedTerminal = {
			id,
			pty: prePty,
			shellPath: defaultShell.path,
			bufferedData,
			bufferDisposable,
		};
	}

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

app.on("will-quit", () => {
	if (preSpawnedTerminal) {
		preSpawnedTerminal.pty.kill();
		preSpawnedTerminal = null;
	}
	for (const [id, term] of terminals) {
		term.kill();
		terminals.delete(id);
	}
});
