# Deltos PRD: Lessons from Theo's AI Editor Critique

**Source:** [Cursor, Claude Code and Codex all have a BIG problem](https://www.youtube.com/watch?v=73F6ZURl1MQ) — Theo (t3.gg), March 2026

## Executive Summary

Theo argues that Cursor, Claude Code, and Codex all suffer from the same root cause: they were built using AI models too early, creating codebases full of accumulated slop that gets exponentially worse over time. The core thesis is that **codebase quality peaks at ~6 months, bad patterns multiply faster than good ones, and AI agents accelerate this decay**. His critiques map directly to principles Deltos should adopt from day one.

---

## Key Critiques (with Deltos Application)

### 1. Codebase Inertia — Quality Peaks at 6 Months

**Critique:** Every codebase hits a quality ceiling around the 6-month mark. After that, the patterns established become permanent. If bad patterns exist at that point, they'll never be fixed.

**Deltos Application:**
- Establish strict architectural patterns now, during the spike phase, before they calcify
- Define canonical patterns for: terminal management, panel layout, IPC communication, state management
- Document these patterns in CLAUDE.md / AGENTS.md so both humans and AI agents follow them
- Treat the spike as throwaway — the real codebase should start clean with lessons learned

### 2. Bad Patterns Multiply Exponentially

**Critique:** AI agents copy patterns from the codebase. Bad patterns are often the most convenient to copy, so they spread faster than good ones. A junior dev (or agent) finding a bad example will replicate it everywhere.

**Deltos Application:**
- Zero tolerance for "temporary" solutions that touch core architecture
- Every pattern in the codebase should be one you'd want copied 100 times
- If a workaround exists (e.g., a `setTimeout` to fix a layout race), fix the root cause before it becomes the pattern agents copy
- Lint rules and biome config should enforce patterns mechanically, not advisorily

### 3. UI/UX Consistency is Non-Negotiable

**Critique:** Cursor's constant UI reshuffling (moving sidebars, removing the agent/editor toggle, leaking emails) destroys user trust. Claude Code's terminal input not blocking during image paste, failing to compact, losing entire conversation threads from one race condition — these are unforgivable in a dev tool.

**Deltos Application:**
- **Deterministic UI behavior** — clicking the same button should always produce the same result
- **No silent failures** — if an operation can't complete, show an error, don't silently drop it
- **Input blocking during async operations** — if the terminal is spawning, don't accept input that will be lost
- **State should be recoverable** — no single bug should destroy a session's worth of work
- Panel layouts, split configurations, and terminal state should persist across restarts

### 4. Feature Churn Without Purpose Destroys Trust

**Critique:** Cursor removed the agent/editor toggle (a beloved feature) and replaced it with a confusing customization system that broke existing workflows. Features should only be removed if something strictly better replaces them.

**Deltos Application:**
- Ship features incrementally but don't remove working functionality
- If a feature needs redesigning, keep the old behavior available (even as a hidden option) until the replacement is proven
- User-facing changes require explicit justification — "because we can" is not a reason

### 5. Terminal/CLI Performance is a Baseline Requirement

**Critique:** Claude Code uses 2GB+ of RAM for a CLI tool. Input lags on open. Characters are dropped. A CLI should be the most responsive interface possible, not the least.

**Deltos Application:**
- Terminal startup must be instant — xterm.open() + fitAddon.fit() should complete in <100ms
- No input lag — PTY data flow must be direct, no buffering that adds latency
- Memory budget: track renderer process memory, set alarms if it exceeds reasonable bounds
- Profile terminal rendering under load (e.g., `yes` command, build output) to ensure no dropped frames

### 6. Spend More Time Planning, Less Time Slopping

**Critique:** The best results come from spending significant time in plan mode before writing code. Read the plan. Actually review it. The model is better at planning conversations than ever before.

**Deltos Application:**
- Every non-trivial feature gets a plan file in `tasks/` before implementation
- Plans must include: problem statement, proposed solution, verification criteria
- AI-generated plans must be reviewed by a human before execution
- This is already in CLAUDE.md — reinforce it as a hard requirement

### 7. Sledgehammer Development is Now Viable

**Critique:** Historically, rewriting 5,000 lines of code took 50 developer-days. Now it takes hours. If something smells bad, delete it and rebuild it correctly instead of trying to patch it.

**Deltos Application:**
- This is a spike project — be willing to throw away any part of it
- When moving to production, selectively port only the patterns that work
- Don't try to "fix" the spike into a production app — use it as a reference implementation
- Track which patterns worked and which didn't in a lessons-learned doc

### 8. Keep Codebases Focused

**Critique:** Twitch story — don't put an admin-only permaban button in the public codebase. Don't stuff unrelated features into one repo. The cost of spinning up new projects has dropped to near-zero.

**Deltos Application:**
- Deltos should have clear module boundaries even within a single repo
- Terminal management, editor/tab management, file tree, and IPC should be separable
- If a feature doesn't serve the core editor/terminal experience, it belongs in a plugin or separate module
- Main process (main.ts), preload (preload.ts), and renderer (renderer.ts) are already well-separated — maintain this

### 9. Experiment-Driven Development — Build to Learn, Then Harden

**Critique:** Vampire Survivors maintains a Phaser.js prototype for rapid iteration and a C++ production build for shipping. The key insight: iterate fast to discover what works, then apply discipline to make it solid.

**Deltos Application:**
- Deltos IS the experimentation workbench — it exists to test UI design ideas and workflow hypotheses that address these exact problems
- The codebase evolves through experiments: prove an idea works (split terminals, panel layouts, workflow patterns), then harden it in place
- Each experiment should have a clear hypothesis ("side-by-side terminals improve multi-context workflows") and a way to evaluate it
- When an experiment succeeds, refactor it from prototype quality to production quality *in this repo* — don't defer to a future port
- When an experiment fails, delete it aggressively (sledgehammer principle) — don't leave dead code paths

---

## Derived Requirements for Deltos

### Architecture Principles
1. **Deterministic by default** — same input produces same output, always
2. **Zero tolerance for slop** — if it smells, fix it now, not later
3. **Small changes touch small surface area** — Tailwind-style colocation over GraphQL-style indirection
4. **Patterns are the product** — every code path should be one you'd want the AI to copy
5. **Recoverable state** — no single failure should destroy a session

### MUST-Have Features
- **Mouse follow focus** — hovering over a terminal pane focuses it automatically. Configurable via Terminal menu, on by default. Persisted in localStorage.

### Quality Gates
- [ ] Biome passes with zero errors/warnings on every commit
- [ ] No `setTimeout`/`requestAnimationFrame` hacks without a comment explaining why and a TODO to fix
- [ ] Terminal operations complete in <100ms (spawn, fit, resize)
- [ ] Memory stays under 200MB for renderer process with 5 terminals open
- [ ] All panel state (splits, sizes, active terminal) survives a window resize without glitches

### Proven Patterns (Harden in Place)
- Split terminal group model (SplitGroup + TerminalInstance)
- Panel resize handle pattern (mousedown/mousemove/mouseup with min/max constraints)
- IPC architecture (preload.ts bridge, per-terminal-ID channels)
- xterm.js + fitAddon integration pattern

### Technical Debt to Address as Experiments Mature
- Inline CSS in index.html (move to proper CSS modules or Tailwind)
- Hardcoded file tree data (replace with real filesystem access)
- Hardcoded file contents with HTML syntax highlighting (replace with real editor)
- Single monolithic renderer.ts (decompose into modules as complexity grows)

---

## Summary

Theo's core message: **the tools we use to build software are themselves poorly built because they bet on AI-assisted development too early, before the models or the codebases were ready.** The fix isn't to stop using AI — it's to be more disciplined about planning, pattern quality, and knowing when to throw code away and start fresh.

Deltos exists specifically to address these problems through experimentation. Each UI design idea and workflow hypothesis gets tested here, evaluated, and either hardened into production quality or deleted. The codebase evolves through this cycle — not by accumulating slop, but by proving ideas work and then making them solid. The 6-month inertia clock is ticking; the patterns established now are the patterns that will define Deltos long-term.
