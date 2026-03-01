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

const PRE_SPAWN_BUFFER_MAX = 64 * 1024; // 64 KB cap

interface PreSpawnedTerminal {
	id: number;
	pty: pty.IPty;
	shellPath: string;
	bufferedData: string[];
	bufferedBytes: number;
	bufferDisposable: pty.IDisposable;
}
let preSpawnedTerminal: PreSpawnedTerminal | null = null;

// ── PTY Management ──

const terminals = new Map<number, pty.IPty>();
let nextTerminalId = 1;

const terminalCwd =
	cliDirectory || process.env.HOME || process.env.USERPROFILE || projectRoot;

function spawnPty(shellPath: string, cwd: string): pty.IPty {
	return pty.spawn(shellPath, [], {
		name: "xterm-256color",
		cols: 80,
		rows: 24,
		cwd,
		env: process.env as Record<string, string>,
	});
}

function wirePty(
	instance: pty.IPty,
	id: number,
	sender: Electron.WebContents,
): void {
	instance.onData((data) => {
		if (!sender.isDestroyed()) {
			sender.send("terminal:data", id, data);
		}
	});
	instance.onExit(() => {
		terminals.delete(id);
		if (!sender.isDestroyed()) {
			sender.send("terminal:exit", id);
		}
	});
}

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

	// Consume pre-spawned terminal if shell matches
	if (preSpawnedTerminal && preSpawnedTerminal.shellPath === shellPath) {
		const pre = preSpawnedTerminal;
		preSpawnedTerminal = null;

		pre.bufferDisposable.dispose();
		terminals.set(pre.id, pre.pty);
		wirePty(pre.pty, pre.id, sender);

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
	const shell = spawnPty(shellPath, terminalCwd);

	terminals.set(id, shell);
	wirePty(shell, id, sender);

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

// ── Filesystem IPC Handlers ──

const ALLOWED_DOTFILES = new Set([".gitignore", ".env.example", ".editorconfig", ".prettierrc", ".eslintrc"]);

ipcMain.handle("fs:readDirectory", async (_e, dirPath: string) => {
	const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
	const result: { name: string; type: "file" | "directory" }[] = [];

	for (const entry of entries) {
		if (entry.name.startsWith(".") && !ALLOWED_DOTFILES.has(entry.name)) continue;
		result.push({
			name: entry.name,
			type: entry.isDirectory() ? "directory" : "file",
		});
	}

	result.sort((a, b) => {
		if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
		return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
	});

	return result;
});

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

ipcMain.handle("fs:readFile", async (_e, filePath: string) => {
	try {
		const stat = await fs.promises.stat(filePath);
		if (stat.size > MAX_FILE_SIZE) {
			return { content: null, isBinary: true };
		}

		const buffer = await fs.promises.readFile(filePath);
		// Check first 8KB for null bytes (binary detection)
		const checkLength = Math.min(buffer.length, 8192);
		for (let i = 0; i < checkLength; i++) {
			if (buffer[i] === 0) {
				return { content: null, isBinary: true };
			}
		}

		return { content: buffer.toString("utf-8"), isBinary: false };
	} catch {
		return { content: null, isBinary: false };
	}
});

ipcMain.handle("fs:writeFile", async (_e, filePath: string, content: string) => {
	try {
		await fs.promises.writeFile(filePath, content, "utf-8");
		return { success: true };
	} catch (err: unknown) {
		return { success: false, error: err instanceof Error ? err.message : String(err) };
	}
});

app.whenReady().then(() => {
	process.env.DELTOS_APP_START = String(APP_START);
	process.env.DELTOS_CLI_DIR = cliDirectory ?? "";
	process.env.DELTOS_CLI_FILE = cliFile ?? "";
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
		const id = nextTerminalId++;
		const prePty = spawnPty(defaultShell.path, terminalCwd);

		const bufferedData: string[] = [];
		let bufferedBytes = 0;
		const bufferDisposable = prePty.onData((data) => {
			if (bufferedBytes < PRE_SPAWN_BUFFER_MAX) {
				bufferedData.push(data);
				bufferedBytes += data.length;
			}
		});

		// Clean up if shell exits before renderer consumes it
		prePty.onExit(() => {
			if (preSpawnedTerminal?.id === id) {
				preSpawnedTerminal = null;
			}
		});

		preSpawnedTerminal = {
			id,
			pty: prePty,
			shellPath: defaultShell.path,
			bufferedData,
			bufferedBytes,
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
