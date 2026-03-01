import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

interface ShellInfo {
	name: string;
	path: string;
}

declare const electronAPI: {
	minimize: () => void;
	maximize: () => void;
	close: () => void;
	platform: string;
	listShells: () => Promise<ShellInfo[]>;
	spawnTerminal: (shellPath: string) => Promise<number>;
	writeTerminal: (id: number, data: string) => void;
	resizeTerminal: (id: number, cols: number, rows: number) => void;
	killTerminal: (id: number) => void;
	onTerminalData: (callback: (id: number, data: string) => void) => () => void;
	onTerminalExit: (callback: (id: number) => void) => () => void;
};

interface TreeNode {
	name: string;
	type: "folder" | "file";
	lang?: string;
	children?: TreeNode[];
}

// ── File tree data ──
const fileTreeData: TreeNode[] = [
	{ name: ".git", type: "folder", children: [] },
	{
		name: "node_modules",
		type: "folder",
		children: [{ name: ".package-lock.json", type: "file", lang: "json" }],
	},
	{
		name: "src",
		type: "folder",
		children: [
			{
				name: "components",
				type: "folder",
				children: [
					{ name: "App.tsx", type: "file", lang: "ts" },
					{ name: "Editor.tsx", type: "file", lang: "ts" },
					{ name: "FileTree.tsx", type: "file", lang: "ts" },
					{ name: "StatusBar.tsx", type: "file", lang: "ts" },
					{ name: "Terminal.tsx", type: "file", lang: "ts" },
				],
			},
			{
				name: "styles",
				type: "folder",
				children: [
					{ name: "global.css", type: "file", lang: "css" },
					{ name: "theme.css", type: "file", lang: "css" },
				],
			},
			{ name: "index.ts", type: "file", lang: "ts" },
			{ name: "main.ts", type: "file", lang: "ts" },
		],
	},
	{ name: ".gitignore", type: "file", lang: "git" },
	{ name: "index.html", type: "file", lang: "html" },
	{ name: "package.json", type: "file", lang: "json" },
	{ name: "README.md", type: "file", lang: "md" },
	{ name: "tsconfig.json", type: "file", lang: "json" },
];

// ── Sample file contents ──
const fileContents: Record<string, string[]> = {
	"App.tsx": [
		'<span class="syn-keyword">import</span> React <span class="syn-keyword">from</span> <span class="syn-string">\'react\'</span>;',
		'<span class="syn-keyword">import</span> { Editor } <span class="syn-keyword">from</span> <span class="syn-string">\'./Editor\'</span>;',
		'<span class="syn-keyword">import</span> { FileTree } <span class="syn-keyword">from</span> <span class="syn-string">\'./FileTree\'</span>;',
		'<span class="syn-keyword">import</span> { StatusBar } <span class="syn-keyword">from</span> <span class="syn-string">\'./StatusBar\'</span>;',
		'<span class="syn-keyword">import</span> { Terminal } <span class="syn-keyword">from</span> <span class="syn-string">\'./Terminal\'</span>;',
		"",
		'<span class="syn-keyword">interface</span> <span class="syn-type">AppProps</span> {',
		'  <span class="syn-attr">theme</span>: <span class="syn-string">\'dark\'</span> | <span class="syn-string">\'light\'</span>;',
		"}",
		"",
		'<span class="syn-keyword">export const</span> <span class="syn-function">App</span>: <span class="syn-type">React.FC</span>&lt;<span class="syn-type">AppProps</span>&gt; = ({ theme }) =&gt; {',
		'  <span class="syn-keyword">const</span> [activeFile, setActiveFile] = <span class="syn-function">useState</span>&lt;<span class="syn-type">string</span> | <span class="syn-type">null</span>&gt;(<span class="syn-keyword">null</span>);',
		'  <span class="syn-keyword">const</span> [openFiles, setOpenFiles] = <span class="syn-function">useState</span>&lt;<span class="syn-type">string</span>[]&gt;([]);',
		'  <span class="syn-keyword">const</span> [terminalOpen, setTerminalOpen] = <span class="syn-function">useState</span>(<span class="syn-keyword">false</span>);',
		"",
		'  <span class="syn-keyword">return</span> (',
		'    &lt;<span class="syn-tag">div</span> <span class="syn-attr">className</span>=<span class="syn-string">"app-container"</span>&gt;',
		'      &lt;<span class="syn-tag">FileTree</span> <span class="syn-attr">onSelect</span>={setActiveFile} /&gt;',
		'      &lt;<span class="syn-tag">Editor</span> <span class="syn-attr">file</span>={activeFile} /&gt;',
		'      {terminalOpen &amp;&amp; &lt;<span class="syn-tag">Terminal</span> /&gt;}',
		'      &lt;<span class="syn-tag">StatusBar</span> <span class="syn-attr">file</span>={activeFile} /&gt;',
		'    &lt;/<span class="syn-tag">div</span>&gt;',
		"  );",
		"};",
	],
	"Editor.tsx": [
		'<span class="syn-keyword">import</span> React <span class="syn-keyword">from</span> <span class="syn-string">\'react\'</span>;',
		"",
		'<span class="syn-keyword">interface</span> <span class="syn-type">EditorProps</span> {',
		'  <span class="syn-attr">file</span>: <span class="syn-type">string</span> | <span class="syn-type">null</span>;',
		'  <span class="syn-attr">content</span>?: <span class="syn-type">string</span>;',
		"}",
		"",
		'<span class="syn-keyword">export const</span> <span class="syn-function">Editor</span>: <span class="syn-type">React.FC</span>&lt;<span class="syn-type">EditorProps</span>&gt; = ({ file, content }) =&gt; {',
		'  <span class="syn-keyword">if</span> (!file) {',
		'    <span class="syn-keyword">return</span> &lt;<span class="syn-tag">div</span> <span class="syn-attr">className</span>=<span class="syn-string">"welcome"</span>&gt;Select a file&lt;/<span class="syn-tag">div</span>&gt;;',
		"  }",
		"",
		'  <span class="syn-keyword">return</span> (',
		'    &lt;<span class="syn-tag">div</span> <span class="syn-attr">className</span>=<span class="syn-string">"editor-pane"</span>&gt;',
		'      &lt;<span class="syn-tag">pre</span>&gt;{content}&lt;/<span class="syn-tag">pre</span>&gt;',
		'    &lt;/<span class="syn-tag">div</span>&gt;',
		"  );",
		"};",
	],
	"index.ts": [
		'<span class="syn-keyword">import</span> { <span class="syn-function">createRoot</span> } <span class="syn-keyword">from</span> <span class="syn-string">\'react-dom/client\'</span>;',
		'<span class="syn-keyword">import</span> { App } <span class="syn-keyword">from</span> <span class="syn-string">\'./components/App\'</span>;',
		"",
		'<span class="syn-keyword">const</span> root = <span class="syn-function">createRoot</span>(document.<span class="syn-function">getElementById</span>(<span class="syn-string">\'root\'</span>)!);',
		'root.<span class="syn-function">render</span>(&lt;<span class="syn-tag">App</span> <span class="syn-attr">theme</span>=<span class="syn-string">"dark"</span> /&gt;);',
	],
	"package.json": [
		"{",
		'  <span class="syn-attr">"name"</span>: <span class="syn-string">"deltos"</span>,',
		'  <span class="syn-attr">"version"</span>: <span class="syn-string">"0.1.0"</span>,',
		'  <span class="syn-attr">"private"</span>: <span class="syn-keyword">true</span>,',
		'  <span class="syn-attr">"scripts"</span>: {',
		'    <span class="syn-attr">"start"</span>: <span class="syn-string">"electron ."</span>,',
		'    <span class="syn-attr">"build"</span>: <span class="syn-string">"tsc && electron-builder"</span>',
		"  },",
		'  <span class="syn-attr">"dependencies"</span>: {',
		'    <span class="syn-attr">"electron"</span>: <span class="syn-string">"^40.6.1"</span>,',
		'    <span class="syn-attr">"react"</span>: <span class="syn-string">"^19.0.0"</span>',
		"  }",
		"}",
	],
	"README.md": [
		'<span class="syn-comment"># Deltos</span>',
		"",
		"An Electron-based editor application.",
		"",
		'<span class="syn-comment">## Getting Started</span>',
		"",
		"```bash",
		"bun install",
		"bun start",
		"```",
	],
};

const langColors: Record<string, string> = {
	tsx: "#519aba",
	ts: "#519aba",
	js: "#cbcb41",
	json: "#cbcb41",
	md: "#519aba",
	html: "#e37933",
	css: "#563d7c",
};

// ── Render file tree ──
const fileTreeEl = document.getElementById("fileTree") as HTMLElement;

function renderTree(
	items: TreeNode[],
	container: HTMLElement,
	depth = 0,
): void {
	for (const item of items) {
		const el = document.createElement("div");

		if (item.type === "folder") {
			el.className = "tree-item folder";
			el.style.paddingLeft = `${12 + depth * 16}px`;
			el.innerHTML = `<span class="tree-icon">\u25B8</span><span class="tree-label">${item.name}</span>`;

			container.appendChild(el);

			const children = document.createElement("div");
			children.className = "tree-children";
			container.appendChild(children);

			if (item.children && item.children.length > 0) {
				renderTree(item.children, children, depth + 1);
			}

			el.addEventListener("click", (e) => {
				e.stopPropagation();
				const isOpen = children.classList.contains("open");
				children.classList.toggle("open");
				const icon = el.querySelector(".tree-icon");
				if (icon) icon.textContent = isOpen ? "\u25B8" : "\u25BE";
			});

			// Auto-open src folder
			if (item.name === "src") {
				children.classList.add("open");
				const icon = el.querySelector(".tree-icon");
				if (icon) icon.textContent = "\u25BE";
			}
		} else {
			el.className = "tree-item file";
			el.style.paddingLeft = `${12 + depth * 16}px`;
			const colorClass = item.lang ? `file-${item.lang}` : "";
			el.innerHTML = `<span class="tree-icon ${colorClass}">\u25CF</span><span class="tree-label">${item.name}</span>`;
			el.dataset.filename = item.name;

			el.addEventListener("click", (e) => {
				e.stopPropagation();
				openFile(item.name);
			});

			container.appendChild(el);
		}
	}
}

renderTree(fileTreeData, fileTreeEl);

// Auto-open src/components
for (const tc of fileTreeEl.querySelectorAll(".tree-children")) {
	const folder = tc.previousElementSibling;
	const label = folder?.querySelector(".tree-label");
	if (label?.textContent === "components") {
		tc.classList.add("open");
		const icon = folder?.querySelector(".tree-icon");
		if (icon) icon.textContent = "\u25BE";
		break;
	}
}

// ── Tab & Editor Logic ──
const tabBar = document.getElementById("tabBar") as HTMLElement;
const editorContent = document.getElementById("editorContent") as HTMLElement;
const breadcrumb = document.getElementById("breadcrumb") as HTMLElement;
let openTabs: string[] = [];
let activeTab = "welcome";

function openFile(filename: string): void {
	for (const el of document.querySelectorAll(".tree-item")) {
		el.classList.remove("selected");
	}
	const treeItem = document.querySelector(
		`.tree-item[data-filename="${filename}"]`,
	);
	if (treeItem) treeItem.classList.add("selected");

	if (!openTabs.includes(filename)) {
		openTabs.push(filename);
		createTab(filename);
		createEditorPane(filename);
	}
	activateTab(filename);
}

function createTab(filename: string): void {
	const tab = document.createElement("div");
	tab.className = "tab";
	tab.dataset.file = filename;

	const ext = filename.split(".").pop() ?? "";
	const iconColor = langColors[ext] || "#cccccc";

	tab.innerHTML = `<span class="tab-icon" style="color:${iconColor}">\u25CF</span><span>${filename}</span><span class="tab-close">\u00D7</span>`;

	tab.addEventListener("click", (e) => {
		const target = e.target as HTMLElement;
		if (!target.classList.contains("tab-close")) {
			activateTab(filename);
		}
	});

	const closeBtn = tab.querySelector(".tab-close");
	if (closeBtn) {
		closeBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			closeTab(filename);
		});
	}

	tabBar.appendChild(tab);
}

function createEditorPane(filename: string): void {
	const pane = document.createElement("div");
	pane.className = "editor-pane";
	pane.dataset.file = filename;

	const lines = fileContents[filename] || [
		`<span class="syn-comment">// ${filename}</span>`,
		"",
		'<span class="syn-comment">// File contents would appear here</span>',
	];

	const lineNums = lines.map((_, i) => i + 1).join("\n");
	const code = lines.join("\n");
	const minimapLines = lines
		.map(
			() =>
				"\u2588\u2588 \u2588\u2588\u2588 \u2588\u2588 \u2588\u2588\u2588\u2588 \u2588\u2588",
		)
		.join("\n");

	pane.innerHTML =
		`<div class="line-numbers">${lineNums}</div>` +
		`<div class="code-area">${code}</div>` +
		`<div class="minimap">${minimapLines}</div>`;

	editorContent.appendChild(pane);
}

function activateTab(filename: string): void {
	activeTab = filename;

	for (const t of document.querySelectorAll(".tab")) {
		t.classList.remove("active");
	}
	const tab = document.querySelector(`.tab[data-file="${filename}"]`);
	if (tab) tab.classList.add("active");

	for (const p of document.querySelectorAll(".editor-pane")) {
		p.classList.remove("active");
	}
	const pane = document.querySelector(`.editor-pane[data-file="${filename}"]`);
	if (pane) pane.classList.add("active");

	if (filename !== "welcome") {
		breadcrumb.innerHTML = `<span>src</span><span class="sep">\u203A</span><span>components</span><span class="sep">\u203A</span><span>${filename}</span>`;
		breadcrumb.classList.add("visible");
	} else {
		breadcrumb.classList.remove("visible");
	}
}

function closeTab(filename: string): void {
	openTabs = openTabs.filter((f) => f !== filename);

	const tab = document.querySelector(`.tab[data-file="${filename}"]`);
	if (tab) tab.remove();

	const pane = document.querySelector(`.editor-pane[data-file="${filename}"]`);
	if (pane) pane.remove();

	if (activeTab === filename) {
		const next =
			openTabs.length > 0 ? openTabs[openTabs.length - 1] : "welcome";
		activateTab(next);
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

interface TerminalInstance {
	id: number;
	shellName: string;
	xterm: Terminal;
	fitAddon: FitAddon;
	tabEl: HTMLElement;
	containerEl: HTMLElement;
}

const panelContainer = document.getElementById("panelContainer") as HTMLElement;
const toggleTerminal = document.getElementById("toggleTerminal") as HTMLElement;
const closePanelBtn = document.getElementById("closePanelBtn") as HTMLElement;
const terminalContainer = document.getElementById("terminal") as HTMLElement;
const terminalTabsEl = document.getElementById("terminalTabs") as HTMLElement;
const shellSelect = document.getElementById("shellSelect") as HTMLSelectElement;
const newTermBtn = document.getElementById("newTermBtn") as HTMLElement;

const terminalInstances = new Map<number, TerminalInstance>();
let activeTerminalId: number | null = null;
let shellsLoaded = false;

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
}

async function createTerminalInstance(): Promise<void> {
	await loadShells();
	const shellPath = shellSelect.value;
	const shellName =
		shellSelect.options[shellSelect.selectedIndex]?.textContent || "Terminal";

	const id = await electronAPI.spawnTerminal(shellPath);

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

	// Create terminal container div
	const containerEl = document.createElement("div");
	containerEl.className = "xterm-instance";
	containerEl.dataset.termId = String(id);
	terminalContainer.appendChild(containerEl);

	xterm.open(containerEl);
	fitAddon.fit();

	// Create terminal tab
	const tabEl = document.createElement("div");
	tabEl.className = "terminal-tab";
	tabEl.dataset.termId = String(id);
	tabEl.innerHTML = `<span class="terminal-tab-label">${shellName}</span><span class="terminal-tab-close">\u00D7</span>`;

	tabEl.addEventListener("click", (e) => {
		const target = e.target as HTMLElement;
		if (target.classList.contains("terminal-tab-close")) {
			killTerminalInstance(id);
		} else {
			activateTerminal(id);
		}
	});

	terminalTabsEl.appendChild(tabEl);

	// Wire IPC
	xterm.onData((data) => {
		electronAPI.writeTerminal(id, data);
	});

	const instance: TerminalInstance = {
		id,
		shellName,
		xterm,
		fitAddon,
		tabEl,
		containerEl,
	};
	terminalInstances.set(id, instance);
	activateTerminal(id);
}

function activateTerminal(id: number): void {
	activeTerminalId = id;

	for (const [instId, inst] of terminalInstances) {
		const isActive = instId === id;
		inst.containerEl.classList.toggle("active", isActive);
		inst.tabEl.classList.toggle("active", isActive);
		if (isActive) {
			inst.fitAddon.fit();
			inst.xterm.focus();
		}
	}
}

function killTerminalInstance(id: number): void {
	const inst = terminalInstances.get(id);
	if (!inst) return;

	electronAPI.killTerminal(id);
	inst.xterm.dispose();
	inst.tabEl.remove();
	inst.containerEl.remove();
	terminalInstances.delete(id);

	// Activate another terminal or clear
	if (activeTerminalId === id) {
		const remaining = [...terminalInstances.keys()];
		if (remaining.length > 0) {
			activateTerminal(remaining[remaining.length - 1]);
		} else {
			activeTerminalId = null;
		}
	}
}

// Listen for PTY output
electronAPI.onTerminalData((id, data) => {
	const inst = terminalInstances.get(id);
	if (inst) {
		inst.xterm.write(data);
	}
});

// Listen for PTY exit
electronAPI.onTerminalExit((id) => {
	const inst = terminalInstances.get(id);
	if (inst) {
		inst.xterm.dispose();
		inst.tabEl.remove();
		inst.containerEl.remove();
		terminalInstances.delete(id);

		if (activeTerminalId === id) {
			const remaining = [...terminalInstances.keys()];
			if (remaining.length > 0) {
				activateTerminal(remaining[remaining.length - 1]);
			} else {
				activeTerminalId = null;
			}
		}
	}
});

// New terminal button
newTermBtn.addEventListener("click", () => {
	createTerminalInstance();
});

// ── Terminal Toggle ──

async function openTerminalPanel(): Promise<void> {
	panelContainer.classList.add("open");
	if (terminalInstances.size === 0) {
		await createTerminalInstance();
	} else if (activeTerminalId !== null) {
		const inst = terminalInstances.get(activeTerminalId);
		if (inst) {
			inst.fitAddon.fit();
			inst.xterm.focus();
		}
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
});

// ── Panel Resize ──
const resizeHandle = document.getElementById("resizeHandle") as HTMLElement;
let isResizing = false;

resizeHandle.addEventListener("mousedown", (e) => {
	isResizing = true;
	document.body.style.cursor = "ns-resize";
	e.preventDefault();
});

document.addEventListener("mousemove", (e) => {
	if (!isResizing) return;
	const editorArea = document.querySelector(".editor-area") as HTMLElement;
	const rect = editorArea.getBoundingClientRect();
	const newHeight = rect.bottom - e.clientY;
	if (newHeight > 100 && newHeight < rect.height - 100) {
		panelContainer.style.height = `${newHeight}px`;
		// Re-fit active terminal on resize
		if (activeTerminalId !== null) {
			const inst = terminalInstances.get(activeTerminalId);
			if (inst) inst.fitAddon.fit();
		}
	}
});

document.addEventListener("mouseup", () => {
	isResizing = false;
	document.body.style.cursor = "";
});

// Re-fit on window resize
window.addEventListener("resize", () => {
	if (activeTerminalId !== null) {
		const inst = terminalInstances.get(activeTerminalId);
		if (inst) inst.fitAddon.fit();
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

// ── Open App.tsx by default ──
openFile("App.tsx");

// ── Auto-open terminal panel ──
openTerminalPanel();
