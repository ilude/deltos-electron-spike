import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";

interface ShellInfo {
	name: string;
	path: string;
}

interface DirEntry {
	name: string;
	type: "file" | "directory";
}

declare const electronAPI: {
	minimize: () => void;
	maximize: () => void;
	close: () => void;
	platform: string;
	appStartTime: number;
	cliDirectory: string | null;
	cliFile: string | null;
	listShells: () => Promise<ShellInfo[]>;
	spawnTerminal: (shellPath: string) => Promise<number>;
	writeTerminal: (id: number, data: string) => void;
	resizeTerminal: (id: number, cols: number, rows: number) => void;
	killTerminal: (id: number) => void;
	onTerminalData: (callback: (id: number, data: string) => void) => () => void;
	onTerminalExit: (callback: (id: number) => void) => () => void;
	readDirectory: (dirPath: string) => Promise<DirEntry[]>;
	readFile: (filePath: string) => Promise<{ content: string | null; isBinary: boolean }>;
	writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
};

// ── Startup Timing ──
const PERF: Record<string, number> = {};
function perfMark(label: string): void {
	PERF[label] = Date.now() - electronAPI.appStartTime;
}

function logStartupTimings(): void {
	const entries = Object.entries(PERF)
		.map(([label, ms]) => `${label}: ${ms}ms`)
		.join(", ");
	console.log(`[Deltos Startup] ${entries}`);
}

perfMark("renderer-start");

// ── Path Helpers ──
const isWindows = electronAPI.platform === "win32";
const pathSep = isWindows ? "\\" : "/";

function joinPath(base: string, name: string): string {
	if (base.endsWith("/") || base.endsWith("\\")) return base + name;
	return base + pathSep + name;
}

function baseName(fullPath: string): string {
	const parts = fullPath.split(/[\\/]/);
	return parts[parts.length - 1] || fullPath;
}

// ── Root Directory ──
const rootDirectory = electronAPI.cliDirectory || ".";

// ── File Tree ──

interface TreeNode {
	name: string;
	fullPath: string;
	type: "directory" | "file";
	loaded: boolean;
	children?: TreeNode[];
}

const fileTreeEl = document.getElementById("fileTree") as HTMLElement;

const langColors: Record<string, string> = {
	tsx: "#519aba",
	ts: "#519aba",
	js: "#cbcb41",
	jsx: "#cbcb41",
	json: "#cbcb41",
	md: "#519aba",
	html: "#e37933",
	css: "#563d7c",
	svg: "#a074c4",
};

async function loadDirectory(dirPath: string): Promise<TreeNode[]> {
	const entries = await electronAPI.readDirectory(dirPath);
	return entries.map((entry) => ({
		name: entry.name,
		fullPath: joinPath(dirPath, entry.name),
		type: entry.type,
		loaded: false,
		children: entry.type === "directory" ? [] : undefined,
	}));
}

function renderTreeNodes(
	nodes: TreeNode[],
	container: HTMLElement,
	depth: number,
): void {
	for (const node of nodes) {
		const el = document.createElement("div");

		if (node.type === "directory") {
			el.className = "tree-item folder";
			el.style.paddingLeft = `${12 + depth * 16}px`;
			el.innerHTML = `<span class="tree-icon">\u25B8</span><span class="tree-label">${node.name}</span>`;
			container.appendChild(el);

			const children = document.createElement("div");
			children.className = "tree-children";
			container.appendChild(children);

			el.addEventListener("click", async (e) => {
				e.stopPropagation();
				const isOpen = children.classList.contains("open");

				if (!isOpen && !node.loaded) {
					node.children = await loadDirectory(node.fullPath);
					node.loaded = true;
					children.innerHTML = "";
					renderTreeNodes(node.children, children, depth + 1);
				}

				children.classList.toggle("open");
				const icon = el.querySelector(".tree-icon");
				if (icon) icon.textContent = isOpen ? "\u25B8" : "\u25BE";
			});
		} else {
			el.className = "tree-item file";
			el.style.paddingLeft = `${12 + depth * 16}px`;
			const ext = node.name.split(".").pop() ?? "";
			const colorClass = langColors[ext] ? `file-${ext}` : "";
			el.innerHTML = `<span class="tree-icon ${colorClass}">\u25CF</span><span class="tree-label">${node.name}</span>`;
			el.dataset.fullpath = node.fullPath;

			el.addEventListener("click", (e) => {
				e.stopPropagation();
				openFile(node.fullPath, node.name);
			});

			container.appendChild(el);
		}
	}
}

async function initFileTree(): Promise<void> {
	const nodes = await loadDirectory(rootDirectory);
	fileTreeEl.innerHTML = "";
	renderTreeNodes(nodes, fileTreeEl, 0);
	perfMark("file-tree-rendered");
}

initFileTree();

// ── CodeMirror Language Detection ──

function languageExtension(filename: string) {
	const ext = filename.split(".").pop()?.toLowerCase() ?? "";
	switch (ext) {
		case "ts":
		case "tsx":
			return javascript({ jsx: true, typescript: true });
		case "js":
		case "jsx":
			return javascript({ jsx: true });
		case "html":
		case "htm":
			return html();
		case "css":
			return css();
		case "json":
			return json();
		case "md":
		case "markdown":
			return markdown();
		default:
			return [];
	}
}

// ── Dark Theme (inline to avoid Bun bundling issue with @codemirror/theme-one-dark) ──
const darkTheme = EditorView.theme(
	{
		"&": { color: "#abb2bf", backgroundColor: "#1e1e1e" },
		".cm-content": { caretColor: "#528bff" },
		".cm-cursor, .cm-dropCursor": { borderLeftColor: "#528bff" },
		"&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
			{ backgroundColor: "#264f78" },
		".cm-panels": { backgroundColor: "#252526", color: "#abb2bf" },
		".cm-panels.cm-panels-top": { borderBottom: "1px solid #3e3e42" },
		".cm-panels.cm-panels-bottom": { borderTop: "1px solid #3e3e42" },
		".cm-searchMatch": { backgroundColor: "#72a1ff59", outline: "1px solid #457dff" },
		".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#6199ff2f" },
		".cm-activeLine": { backgroundColor: "#2c313c50" },
		".cm-selectionMatch": { backgroundColor: "#aafe661a" },
		"&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
			backgroundColor: "#bad0f847",
		},
		".cm-gutters": {
			backgroundColor: "#1e1e1e",
			color: "#858585",
			border: "none",
			borderRight: "1px solid #3e3e42",
		},
		".cm-activeLineGutter": { backgroundColor: "#2c313c50" },
		".cm-foldPlaceholder": {
			backgroundColor: "transparent",
			border: "none",
			color: "#ddd",
		},
		".cm-tooltip": { border: "none", backgroundColor: "#252526" },
		".cm-tooltip .cm-tooltip-arrow:before": { borderTopColor: "transparent", borderBottomColor: "transparent" },
		".cm-tooltip .cm-tooltip-arrow:after": { borderTopColor: "#252526", borderBottomColor: "#252526" },
		".cm-tooltip-autocomplete": { "& > ul > li[aria-selected]": { backgroundColor: "#094771", color: "#fff" } },
	},
	{ dark: true },
);

let _darkHighlight: ReturnType<typeof syntaxHighlighting> | null = null;
function getDarkHighlight() {
	if (!_darkHighlight) {
		_darkHighlight = syntaxHighlighting(
			HighlightStyle.define([
				{ tag: tags.keyword, color: "#c678dd" },
				{ tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName], color: "#e06c75" },
				{ tag: [tags.processingInstruction, tags.string, tags.inserted], color: "#98c379" },
				{ tag: [tags.variableName, tags.labelName], color: "#61afef" },
				{ tag: [tags.color, tags.separator], color: "#d19a66" },
				{ tag: [tags.typeName, tags.className, tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: "#e5c07b" },
				{ tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.link], color: "#56b6c2" },
				{ tag: [tags.meta, tags.comment], color: "#7d8799" },
				{ tag: tags.strong, fontWeight: "bold" },
				{ tag: tags.emphasis, fontStyle: "italic" },
				{ tag: tags.strikethrough, textDecoration: "line-through" },
				{ tag: tags.heading, fontWeight: "bold", color: "#e06c75" },
				{ tag: [tags.atom, tags.bool], color: "#d19a66" },
				{ tag: tags.invalid, color: "#ffffff" },
			]),
		);
	}
	return _darkHighlight;
}

// ── Editor State ──
const editorViews = new Map<string, EditorView>();
const modifiedFiles = new Set<string>();

// ── Tab & Editor Logic ──
const tabBar = document.getElementById("tabBar") as HTMLElement;
const editorContent = document.getElementById("editorContent") as HTMLElement;
const breadcrumb = document.getElementById("breadcrumb") as HTMLElement;
let openTabs: string[] = [];
let activeTab = "welcome";

async function openFile(fullPath: string, displayName?: string): Promise<void> {
	const name = displayName || baseName(fullPath);

	for (const el of document.querySelectorAll(".tree-item")) {
		el.classList.remove("selected");
	}
	const treeItem = document.querySelector(
		`.tree-item[data-fullpath="${CSS.escape(fullPath)}"]`,
	);
	if (treeItem) treeItem.classList.add("selected");

	if (!openTabs.includes(fullPath)) {
		openTabs.push(fullPath);
		createTab(fullPath, name);
		await createEditorPane(fullPath);
	}
	activateTab(fullPath);
}

function createTab(fullPath: string, displayName: string): void {
	const tab = document.createElement("div");
	tab.className = "tab";
	tab.dataset.file = fullPath;

	const ext = displayName.split(".").pop() ?? "";
	const iconColor = langColors[ext] || "#cccccc";

	tab.innerHTML = `<span class="tab-icon" style="color:${iconColor}">\u25CF</span><span>${displayName}</span><span class="tab-close">\u00D7</span>`;

	tab.addEventListener("click", (e) => {
		const target = e.target as HTMLElement;
		if (!target.classList.contains("tab-close")) {
			activateTab(fullPath);
		}
	});

	const closeBtn = tab.querySelector(".tab-close");
	if (closeBtn) {
		closeBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			closeTab(fullPath);
		});
	}

	tabBar.appendChild(tab);
}

async function createEditorPane(fullPath: string): Promise<void> {
	const pane = document.createElement("div");
	pane.className = "editor-pane";
	pane.dataset.file = fullPath;

	const result = await electronAPI.readFile(fullPath);

	if (result.isBinary || result.content === null) {
		pane.innerHTML = '<div class="binary-notice">Binary file not displayed</div>';
		editorContent.appendChild(pane);
		return;
	}

	editorContent.appendChild(pane);

	const extensions = [
		basicSetup,
		darkTheme,
		getDarkHighlight(),
		languageExtension(baseName(fullPath)),
		EditorView.theme({
			"&": { fontSize: "13px" },
			".cm-content": { fontFamily: "'Consolas', 'Courier New', monospace" },
			".cm-gutters": { fontFamily: "'Consolas', 'Courier New', monospace" },
		}),
		keymap.of([
			{
				key: "Mod-s",
				run: () => {
					saveFile(fullPath);
					return true;
				},
			},
		]),
		EditorView.updateListener.of((update) => {
			if (update.docChanged) {
				modifiedFiles.add(fullPath);
				const tab = document.querySelector(
					`.tab[data-file="${CSS.escape(fullPath)}"]`,
				);
				if (tab) tab.classList.add("modified");
			}
		}),
	];

	const state = EditorState.create({
		doc: result.content,
		extensions,
	});

	const view = new EditorView({
		state,
		parent: pane,
	});

	editorViews.set(fullPath, view);
}

function activateTab(fullPath: string): void {
	activeTab = fullPath;

	for (const t of document.querySelectorAll(".tab")) {
		t.classList.remove("active");
	}
	const tab = document.querySelector(
		`.tab[data-file="${CSS.escape(fullPath)}"]`,
	);
	if (tab) tab.classList.add("active");

	for (const p of document.querySelectorAll(".editor-pane")) {
		p.classList.remove("active");
	}
	const pane = document.querySelector(
		`.editor-pane[data-file="${CSS.escape(fullPath)}"]`,
	);
	if (pane) pane.classList.add("active");

	if (fullPath !== "welcome") {
		// Build breadcrumb from path relative to root
		let relativePath = fullPath;
		if (rootDirectory !== "." && fullPath.startsWith(rootDirectory)) {
			relativePath = fullPath.slice(rootDirectory.length).replace(/^[\\/]/, "");
		}
		const parts = relativePath.split(/[\\/]/);
		breadcrumb.innerHTML = parts
			.map((part, i) => {
				const sep = i > 0 ? '<span class="sep">\u203A</span>' : "";
				return `${sep}<span>${part}</span>`;
			})
			.join("");
		breadcrumb.classList.add("visible");
	} else {
		breadcrumb.classList.remove("visible");
	}

	// Trigger CodeMirror relayout
	const view = editorViews.get(fullPath);
	if (view) {
		requestAnimationFrame(() => view.requestMeasure());
	}
}

function closeTab(fullPath: string): void {
	openTabs = openTabs.filter((f) => f !== fullPath);

	const tab = document.querySelector(
		`.tab[data-file="${CSS.escape(fullPath)}"]`,
	);
	if (tab) tab.remove();

	const pane = document.querySelector(
		`.editor-pane[data-file="${CSS.escape(fullPath)}"]`,
	);
	if (pane) pane.remove();

	// Clean up CodeMirror
	const view = editorViews.get(fullPath);
	if (view) {
		view.destroy();
		editorViews.delete(fullPath);
	}
	modifiedFiles.delete(fullPath);

	if (activeTab === fullPath) {
		const next =
			openTabs.length > 0 ? openTabs[openTabs.length - 1] : "welcome";
		activateTab(next);
	}
}

// ── Save ──

async function saveFile(fullPath: string): Promise<void> {
	const view = editorViews.get(fullPath);
	if (!view) return;

	const content = view.state.doc.toString();
	const result = await electronAPI.writeFile(fullPath, content);

	if (result.success) {
		modifiedFiles.delete(fullPath);
		const tab = document.querySelector(
			`.tab[data-file="${CSS.escape(fullPath)}"]`,
		);
		if (tab) tab.classList.remove("modified");
	} else {
		console.error(`Failed to save ${fullPath}: ${result.error}`);
	}
}

// ── Activity Bar ──
for (const icon of document.querySelectorAll(".activitybar-icon")) {
	icon.addEventListener("click", () => {
		const main = document.getElementById("main") as HTMLElement;
		const wasActive = icon.classList.contains("active");

		for (const i of document.querySelectorAll(".activitybar-icon")) {
			i.classList.remove("active");
		}

		if (wasActive) {
			main.classList.add("sidebar-collapsed");
		} else {
			icon.classList.add("active");
			main.classList.remove("sidebar-collapsed");
		}
	});
}

// ── Terminal Management ──

interface SplitGroup {
	id: number;
	terminalIds: number[];
	containerEl: HTMLElement;
	sidebarGroupEl: HTMLElement;
}

interface TerminalInstance {
	id: number;
	splitGroupId: number;
	shellName: string;
	xterm: Terminal;
	fitAddon: FitAddon;
	sidebarItemEl: HTMLElement;
	containerEl: HTMLElement;
}

const panelContainer = document.getElementById("panelContainer") as HTMLElement;
const toggleTerminal = document.getElementById("toggleTerminal") as HTMLElement;
const closePanelBtn = document.getElementById("closePanelBtn") as HTMLElement;
const terminalContainer = document.getElementById("terminal") as HTMLElement;
const terminalListEl = document.getElementById("terminalList") as HTMLElement;
const shellSelect = document.getElementById("shellSelect") as HTMLSelectElement;
const newTermBtn = document.getElementById("newTermBtn") as HTMLElement;
const splitTermBtn = document.getElementById("splitTermBtn") as HTMLElement;

const terminalInstances = new Map<number, TerminalInstance>();
const splitGroups = new Map<number, SplitGroup>();
let activeSplitGroupId: number | null = null;
let nextSplitGroupId = 1;
let shellsLoaded = false;
let mouseFollowFocus =
	localStorage.getItem("deltos:mouseFollowFocus") !== "false";

async function loadShells(): Promise<void> {
	if (shellsLoaded) return;
	const shells: ShellInfo[] = await electronAPI.listShells();
	shellSelect.innerHTML = "";
	for (const shell of shells) {
		const opt = document.createElement("option");
		opt.value = shell.path;
		opt.textContent = shell.name;
		shellSelect.appendChild(opt);
	}
	shellsLoaded = true;
	perfMark("shells-loaded");
}

function fitAllInGroup(groupId: number): void {
	const group = splitGroups.get(groupId);
	if (!group) return;
	for (const termId of group.terminalIds) {
		const inst = terminalInstances.get(termId);
		if (inst) {
			inst.fitAddon.fit();
		}
	}
}

function updateSidebarGroupStyle(groupId: number): void {
	const group = splitGroups.get(groupId);
	if (!group) return;
	group.sidebarGroupEl.classList.toggle("multi", group.terminalIds.length > 1);
}

function activateSplitGroup(groupId: number): void {
	activeSplitGroupId = groupId;

	// Toggle group visibility
	for (const [gId, g] of splitGroups) {
		g.containerEl.classList.toggle("active", gId === groupId);
	}

	// Toggle sidebar item highlighting
	for (const [, inst] of terminalInstances) {
		inst.sidebarItemEl.classList.toggle(
			"active",
			inst.splitGroupId === groupId,
		);
	}

	// Fit terminals after layout settles
	requestAnimationFrame(() => {
		fitAllInGroup(groupId);
		// Focus the first terminal in the group
		const group = splitGroups.get(groupId);
		if (group && group.terminalIds.length > 0) {
			const first = terminalInstances.get(group.terminalIds[0]);
			if (first) first.xterm.focus();
		}
	});
}

function activateTerminal(id: number): void {
	const inst = terminalInstances.get(id);
	if (!inst) return;
	activateSplitGroup(inst.splitGroupId);
}

async function createTerminalInstance(targetGroupId?: number): Promise<void> {
	await loadShells();
	const shellPath = shellSelect.value;
	const shellName =
		shellSelect.options[shellSelect.selectedIndex]?.textContent || "Terminal";

	const id = await electronAPI.spawnTerminal(shellPath);
	perfMark("terminal-spawned");

	const xterm = new Terminal({
		theme: {
			background: "#1e1e1e",
			foreground: "#cccccc",
			cursor: "#aeafad",
			selectionBackground: "#264f78",
			black: "#000000",
			red: "#cd3131",
			green: "#0dbc79",
			yellow: "#e5e510",
			blue: "#2472c8",
			magenta: "#bc3fbc",
			cyan: "#11a8cd",
			white: "#e5e5e5",
			brightBlack: "#666666",
			brightRed: "#f14c4c",
			brightGreen: "#23d18b",
			brightYellow: "#f5f543",
			brightBlue: "#3b8eea",
			brightMagenta: "#d670d6",
			brightCyan: "#29b8db",
			brightWhite: "#e5e5e5",
		},
		fontFamily: "'Consolas', 'Courier New', monospace",
		fontSize: 13,
		cursorBlink: true,
	});

	const fitAddon = new FitAddon();
	xterm.loadAddon(fitAddon);

	let groupId: number;
	let group: SplitGroup;

	if (targetGroupId != null && splitGroups.has(targetGroupId)) {
		// Add to existing group — insert divider then pane
		groupId = targetGroupId;
		group = splitGroups.get(groupId) as SplitGroup;

		const divider = document.createElement("div");
		divider.className = "split-divider";
		group.containerEl.appendChild(divider);
		setupSplitDividerDrag(divider, groupId);
	} else {
		// Create new group
		groupId = nextSplitGroupId++;
		const groupEl = document.createElement("div");
		groupEl.className = "split-group";
		groupEl.dataset.groupId = String(groupId);
		terminalContainer.appendChild(groupEl);

		const sidebarGroupEl = document.createElement("div");
		sidebarGroupEl.className = "terminal-list-group";
		sidebarGroupEl.dataset.groupId = String(groupId);
		terminalListEl.appendChild(sidebarGroupEl);

		group = {
			id: groupId,
			terminalIds: [],
			containerEl: groupEl,
			sidebarGroupEl,
		};
		splitGroups.set(groupId, group);
	}

	// Create xterm container
	const containerEl = document.createElement("div");
	containerEl.className = "xterm-instance";
	containerEl.dataset.termId = String(id);
	group.containerEl.appendChild(containerEl);

	xterm.open(containerEl);

	containerEl.addEventListener("mouseenter", () => {
		if (mouseFollowFocus) {
			xterm.focus();
		}
	});

	// Create sidebar list item
	const sidebarItemEl = document.createElement("div");
	sidebarItemEl.className = "terminal-list-item";
	sidebarItemEl.dataset.termId = String(id);
	sidebarItemEl.innerHTML = `<span class="terminal-list-item-icon">&#9638;</span><span class="terminal-list-item-label">${shellName}</span><span class="terminal-list-item-close">\u00D7</span>`;

	sidebarItemEl.addEventListener("click", (e) => {
		const target = e.target as HTMLElement;
		if (target.classList.contains("terminal-list-item-close")) {
			killTerminalInstance(id);
		} else {
			activateTerminal(id);
		}
	});

	group.sidebarGroupEl.appendChild(sidebarItemEl);

	// Wire IPC
	xterm.onData((data) => {
		electronAPI.writeTerminal(id, data);
	});

	// Wire resize to PTY
	xterm.onResize(({ cols, rows }) => {
		electronAPI.resizeTerminal(id, cols, rows);
	});

	const instance: TerminalInstance = {
		id,
		splitGroupId: groupId,
		shellName,
		xterm,
		fitAddon,
		sidebarItemEl,
		containerEl,
	};
	terminalInstances.set(id, instance);

	group.terminalIds.push(id);
	updateSidebarGroupStyle(groupId);
	activateSplitGroup(groupId);
}

function removeTerminalFromGroup(id: number): void {
	const inst = terminalInstances.get(id);
	if (!inst) return;

	const group = splitGroups.get(inst.splitGroupId);
	if (!group) return;

	// Dispose xterm and remove DOM
	inst.xterm.dispose();
	inst.sidebarItemEl.remove();

	// Remove the xterm container and adjacent divider
	const children = Array.from(group.containerEl.children);
	const idx = children.indexOf(inst.containerEl);
	if (idx > 0 && children[idx - 1]?.classList.contains("split-divider")) {
		children[idx - 1].remove();
	} else if (
		idx === 0 &&
		children[idx + 1]?.classList.contains("split-divider")
	) {
		children[idx + 1].remove();
	}
	inst.containerEl.remove();

	// Update group state
	group.terminalIds = group.terminalIds.filter((tid) => tid !== id);
	terminalInstances.delete(id);
	updateSidebarGroupStyle(group.id);

	// If group is empty, remove it entirely
	if (group.terminalIds.length === 0) {
		group.containerEl.remove();
		group.sidebarGroupEl.remove();
		splitGroups.delete(group.id);

		if (activeSplitGroupId === group.id) {
			const remaining = [...splitGroups.keys()];
			if (remaining.length > 0) {
				activateSplitGroup(remaining[remaining.length - 1]);
			} else {
				activeSplitGroupId = null;
			}
		}
	} else {
		// Re-fit remaining terminals
		if (activeSplitGroupId === group.id) {
			requestAnimationFrame(() => fitAllInGroup(group.id));
		}
	}
}

function killTerminalInstance(id: number): void {
	electronAPI.killTerminal(id);
	removeTerminalFromGroup(id);
}

// Listen for PTY output
let terminalReadyFired = false;
electronAPI.onTerminalData((id, data) => {
	if (!terminalReadyFired) {
		terminalReadyFired = true;
		perfMark("terminal-ready");
		logStartupTimings();
	}
	const inst = terminalInstances.get(id);
	if (inst) {
		inst.xterm.write(data);
	}
});

// Listen for PTY exit
electronAPI.onTerminalExit((id) => {
	removeTerminalFromGroup(id);
});

// Split divider drag
function setupSplitDividerDrag(divider: HTMLElement, groupId: number): void {
	let isDragging = false;
	let startX = 0;
	let leftPane: HTMLElement | null = null;
	let rightPane: HTMLElement | null = null;
	let leftStartWidth = 0;
	let rightStartWidth = 0;

	divider.addEventListener("mousedown", (e) => {
		isDragging = true;
		startX = e.clientX;

		leftPane = divider.previousElementSibling as HTMLElement | null;
		rightPane = divider.nextElementSibling as HTMLElement | null;

		if (leftPane) leftStartWidth = leftPane.getBoundingClientRect().width;
		if (rightPane) rightStartWidth = rightPane.getBoundingClientRect().width;

		document.body.style.cursor = "col-resize";
		e.preventDefault();
	});

	document.addEventListener("mousemove", (e) => {
		if (!isDragging) return;
		const delta = e.clientX - startX;

		if (leftPane && rightPane) {
			const newLeft = leftStartWidth + delta;
			const newRight = rightStartWidth - delta;

			if (newLeft >= 80 && newRight >= 80) {
				leftPane.style.flex = "none";
				rightPane.style.flex = "none";
				leftPane.style.width = `${newLeft}px`;
				rightPane.style.width = `${newRight}px`;
			}
		}
	});

	document.addEventListener("mouseup", () => {
		if (!isDragging) return;
		isDragging = false;
		document.body.style.cursor = "";
		fitAllInGroup(groupId);
	});
}

// New terminal button (new group)
newTermBtn.addEventListener("click", () => {
	createTerminalInstance();
});

// Split terminal button (add to current group)
splitTermBtn.addEventListener("click", () => {
	if (activeSplitGroupId != null) {
		createTerminalInstance(activeSplitGroupId);
	} else {
		createTerminalInstance();
	}
});

// ── Terminal Toggle ──

async function openTerminalPanel(): Promise<void> {
	perfMark("terminal-panel-open");
	panelContainer.classList.add("open");
	if (terminalInstances.size === 0) {
		await createTerminalInstance();
	} else if (activeSplitGroupId !== null) {
		const gId = activeSplitGroupId;
		requestAnimationFrame(() => {
			fitAllInGroup(gId);
			const group = splitGroups.get(gId);
			if (group && group.terminalIds.length > 0) {
				const first = terminalInstances.get(group.terminalIds[0]);
				if (first) first.xterm.focus();
			}
		});
	}
}

function closeTerminalPanel(): void {
	panelContainer.classList.remove("open");
}

toggleTerminal.addEventListener("click", () => {
	if (panelContainer.classList.contains("open")) {
		closeTerminalPanel();
	} else {
		openTerminalPanel();
	}
});

closePanelBtn.addEventListener("click", () => {
	closeTerminalPanel();
});

document.addEventListener("keydown", (e) => {
	if (e.ctrlKey && e.key === "`") {
		e.preventDefault();
		if (panelContainer.classList.contains("open")) {
			closeTerminalPanel();
		} else {
			openTerminalPanel();
		}
	}
	// Global Ctrl+S save
	if (e.ctrlKey && e.key === "s" && activeTab !== "welcome") {
		e.preventDefault();
		saveFile(activeTab);
	}
});

// ── Panel Resize ──
const resizeHandle = document.getElementById("resizeHandle") as HTMLElement;
let isResizing = false;

resizeHandle.addEventListener("mousedown", (e) => {
	isResizing = true;
	document.body.style.cursor = "ns-resize";
	e.preventDefault();
});

// ── Terminal Sidebar Resize ──
const termSidebarResize = document.getElementById(
	"termSidebarResize",
) as HTMLElement;
const terminalSidebar = document.getElementById(
	"terminalSidebar",
) as HTMLElement;
let isSidebarResizing = false;
let sidebarStartX = 0;
let sidebarStartWidth = 0;

termSidebarResize.addEventListener("mousedown", (e) => {
	isSidebarResizing = true;
	sidebarStartX = e.clientX;
	sidebarStartWidth = terminalSidebar.getBoundingClientRect().width;
	document.body.style.cursor = "col-resize";
	e.preventDefault();
});

document.addEventListener("mousemove", (e) => {
	if (isResizing) {
		const editorArea = document.querySelector(".editor-area") as HTMLElement;
		const rect = editorArea.getBoundingClientRect();
		const newHeight = rect.bottom - e.clientY;
		if (newHeight > 100 && newHeight < rect.height - 100) {
			panelContainer.style.height = `${newHeight}px`;
			if (activeSplitGroupId !== null) {
				fitAllInGroup(activeSplitGroupId);
			}
		}
	}
	if (isSidebarResizing) {
		// Dragging left makes sidebar wider (sidebar is on the right)
		const delta = sidebarStartX - e.clientX;
		const newWidth = sidebarStartWidth + delta;
		if (newWidth >= 60 && newWidth <= 400) {
			terminalSidebar.style.width = `${newWidth}px`;
		}
	}
});

document.addEventListener("mouseup", () => {
	if (isSidebarResizing) {
		isSidebarResizing = false;
		document.body.style.cursor = "";
		if (activeSplitGroupId !== null) {
			fitAllInGroup(activeSplitGroupId);
		}
	}
	if (isResizing) {
		isResizing = false;
		document.body.style.cursor = "";
	}
});

// Re-fit on window resize
window.addEventListener("resize", () => {
	if (activeSplitGroupId !== null) {
		fitAllInGroup(activeSplitGroupId);
	}
});

// ── Window Controls ──
document.getElementById("btnMinimize")?.addEventListener("click", () => {
	electronAPI.minimize();
});
document.getElementById("btnMaximize")?.addEventListener("click", () => {
	electronAPI.maximize();
});
document.getElementById("btnClose")?.addEventListener("click", () => {
	electronAPI.close();
});

// ── Platform-specific titlebar ──
const platform = electronAPI.platform;
document.documentElement.setAttribute("data-platform", platform);

if (platform === "darwin") {
	// macOS: hide custom window controls, native traffic lights are used
	const controls = document.querySelector(".titlebar-controls") as HTMLElement;
	if (controls) controls.style.display = "none";
	// Add left padding for traffic light buttons
	const menu = document.querySelector(".titlebar-menu") as HTMLElement;
	if (menu) menu.style.paddingLeft = "70px";
}

// ── Titlebar Dropdown Menus ──
let openMenu: HTMLElement | null = null;

function closeAllMenus(): void {
	if (openMenu) {
		openMenu.classList.remove("open");
		const dropdown = openMenu.querySelector(".menu-dropdown");
		if (dropdown) dropdown.classList.remove("open");
		openMenu = null;
	}
}

for (const menuItem of document.querySelectorAll(
	".titlebar-menu-item[data-menu]",
)) {
	menuItem.addEventListener("click", (e) => {
		e.stopPropagation();
		const item = menuItem as HTMLElement;
		const dropdown = item.querySelector(".menu-dropdown") as HTMLElement;
		if (!dropdown) return;

		if (openMenu === item) {
			closeAllMenus();
		} else {
			closeAllMenus();
			item.classList.add("open");
			dropdown.classList.add("open");
			openMenu = item;
		}
	});

	menuItem.addEventListener("mouseenter", () => {
		if (openMenu && openMenu !== menuItem) {
			closeAllMenus();
			const item = menuItem as HTMLElement;
			const dropdown = item.querySelector(".menu-dropdown") as HTMLElement;
			if (dropdown) {
				item.classList.add("open");
				dropdown.classList.add("open");
				openMenu = item;
			}
		}
	});
}

// Close menus when clicking outside
document.addEventListener("click", () => {
	closeAllMenus();
});

// Close menus on Escape
document.addEventListener("keydown", (e) => {
	if (e.key === "Escape") closeAllMenus();
});

// ── Menu actions ──
document.getElementById("menuNewTerminal")?.addEventListener("click", () => {
	closeAllMenus();
	openTerminalPanel();
	createTerminalInstance();
});

const focusFollowsCheck = document.getElementById(
	"focusFollowsCheck",
) as HTMLElement;
if (!mouseFollowFocus) focusFollowsCheck.style.visibility = "hidden";

document
	.getElementById("menuFocusFollowsMouse")
	?.addEventListener("click", () => {
		closeAllMenus();
		mouseFollowFocus = !mouseFollowFocus;
		localStorage.setItem("deltos:mouseFollowFocus", String(mouseFollowFocus));
		focusFollowsCheck.style.visibility = mouseFollowFocus
			? "visible"
			: "hidden";
	});

// ── Open CLI file if specified ──
if (electronAPI.cliFile) {
	openFile(electronAPI.cliFile);
}

// Apply CLI args to titlebar (synchronous — embedded via env vars in preload)
const titleEl = document.querySelector(".titlebar-title");
if (titleEl) {
	if (electronAPI.cliFile) {
		titleEl.textContent = electronAPI.cliFile;
	} else if (electronAPI.cliDirectory) {
		const dirName =
			electronAPI.cliDirectory.split(/[\\/]/).pop() || electronAPI.cliDirectory;
		titleEl.textContent = dirName;
	}
}

// Defer terminal panel open to allow first paint of the editor
requestAnimationFrame(() => {
	perfMark("first-paint");
	requestAnimationFrame(() => {
		openTerminalPanel();
	});
});
