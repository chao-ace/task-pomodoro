import { Plugin, MarkdownView, TFile } from "obsidian";
import { TaskPomodoroSettings, DEFAULT_SETTINGS } from "./types";
import { TaskParser } from "./task-parser";
import { TimerService } from "./timer-service";
import { TaskRenderer } from "./task-renderer";
import { ReadingViewRenderer } from "./reading-view";
import { createLivePreviewExtension } from "./live-preview";
import { TaskPomodoroSettingTab } from "./settings-tab";
import { SoundManager } from "./sound-manager";
import { AmbientManager } from "./ambient-manager";
import { setLocale, t } from "./i18n";
import { isWeeklyNote, updateStats } from "./stats";

export default class TaskPomodoroPlugin extends Plugin {
	settings!: TaskPomodoroSettings;
	timerService!: TimerService;
	private taskParser!: TaskParser;
	private renderer!: TaskRenderer;
	private readingViewRenderer!: ReadingViewRenderer;
	soundManager!: SoundManager;
	ambientManager!: AmbientManager;
	private statusBarItem!: HTMLDivElement;
	private statusBarUpdateInterval: number | null = null;
	private previousLines: Map<string, string[]> = new Map();

	async onload() {
		await this.loadSettings();
		setLocale(this.settings.language as any);

		this.soundManager = new SoundManager(this.app, this.settings);
		this.taskParser = new TaskParser(this.settings);
		this.renderer = new TaskRenderer(this.settings.pomodoroEmoji);
		this.timerService = new TimerService(this.app, this.settings, this.taskParser, this.soundManager);
		this.ambientManager = new AmbientManager(this.settings);

		// Register callbacks BEFORE restoring state so completed-during-downtime timers trigger them
		this.timerService.setPomodoroCompleteCallback(async (filePath, lineNumber, newCount, totalHours) => {
			await this.persistPomodoro(filePath, lineNumber, newCount, totalHours);
		});

		this.timerService.setTaskFinishCallback(
			async (filePath: string, lineNumber: number, result) => {
				await this.persistTaskFinish(filePath, lineNumber, result);
			}
		);

		// Restore timer state from previous session
		const savedData = await this.loadData();
		if (savedData && (savedData as any).timerState) {
			this.timerService.deserialize((savedData as any).timerState);
		}

		// Persist timer state on every state-change so crashes/force-quits don't lose data
		this.timerService.on("state-change", () => {
			this.saveTimerState();
		});

		// Reading View post-processor
		this.readingViewRenderer = new ReadingViewRenderer(
			this.app, this.timerService, this.taskParser, this.renderer
		);
		this.registerMarkdownPostProcessor(this.readingViewRenderer.process);

		// Live Preview extension
		const lpExtension = createLivePreviewExtension(
			this.timerService, this.taskParser, this.renderer,
			() => this.getActiveFilePath()
		);
		this.registerEditorExtension([lpExtension]);

		// Ambient auto-play: listen to timer state changes
		this.timerService.on("state-change", (_key, state) => {
			this.handleAmbientOnStateChange(state.state);
		});

		// Status bar
		const sbSlot = this.addStatusBarItem();
		this.statusBarItem = this.renderer.createStatusBarItem();
		sbSlot.appendChild(this.statusBarItem);
		sbSlot.style.padding = "0";
		sbSlot.style.cursor = "pointer";
		this.statusBarItem.style.display = "none";
		this.startStatusBarUpdater();

		// Settings tab
		this.addSettingTab(new TaskPomodoroSettingTab(this.app, this));

		// Listen for file changes to detect checkbox toggles
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile) {
					this.handleFileChange(file.path);
				}
			})
		);

		// Clean up previousLines cache on file close
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.prunePreviousLinesCache();
			})
		);

		// Commands
		this.addCommand({
			id: "toggle-pomo",
			name: t("CMD_TOGGLE"),
			callback: () => this.togglePomoUnderCursor(),
		});
		this.addCommand({
			id: "stop-pomo",
			name: t("CMD_STOP"),
			callback: () => this.stopPomoUnderCursor(),
		});
		this.addCommand({
			id: "reset-pomo",
			name: t("CMD_RESET"),
			callback: () => this.resetPomoUnderCursor(),
		});
		this.addCommand({
			id: "reset-session",
			name: t("CMD_RESET_SESSION"),
			callback: () => this.timerService.resetSession(),
		});
		this.addCommand({
			id: "toggle-sound",
			name: t("CMD_TOGGLE_SOUND"),
			callback: () => {
				this.settings.soundEnabled = !this.settings.soundEnabled;
				this.saveSettings();
			},
		});
		this.addCommand({
			id: "toggle-statusbar",
			name: t("CMD_TOGGLE_STATUSBAR"),
			callback: () => {
				this.settings.showInStatusBar = !this.settings.showInStatusBar;
				this.saveSettings();
			},
		});
		this.addCommand({
			id: "toggle-ambient",
			name: t("CMD_TOGGLE_AMBIENT"),
			callback: () => {
				this.settings.ambientEnabled = !this.settings.ambientEnabled;
				this.saveSettings();
				if (!this.settings.ambientEnabled) {
					this.ambientManager.stop();
				}
			},
		});

		this.addCommand({
			id: "update-pomo-stats",
			name: t("CMD_STATS"),
			callback: () => this.updatePomoStatsForActiveFile(),
		});

		console.log("Task Pomodoro plugin loaded");
	}

	onunload() {
		this.saveTimerState();
		this.timerService.cleanup();
		this.soundManager.cleanup();
		this.ambientManager.cleanup();
		if (this.statusBarUpdateInterval) {
			window.clearInterval(this.statusBarUpdateInterval);
		}
		this.previousLines.clear();
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings() {
		const data: any = { ...this.settings };
		// Preserve timer state when saving settings
		if (this.timerService) {
			const timerState = this.timerService.serialize();
			if (timerState.timers.length > 0) {
				data.timerState = timerState;
			}
		}
		await this.saveData(data);
		setLocale(this.settings.language as any);
		this.taskParser.updateSettings(this.settings);
		this.renderer.updateEmoji(this.settings.pomodoroEmoji);
		this.ambientManager.updateSettings(this.settings);
		this.timerService.updateSettings(this.settings);
		this.soundManager.updateSettings(this.settings);
	}

	resetSession() {
		this.timerService.resetSession();
	}

	/** Auto-play/stop ambient sound based on timer state */
	private handleAmbientOnStateChange(timerState: string) {
		if (!this.settings.ambientEnabled || !this.settings.ambientAutoPlay) return;

		const shouldPlay = (timerState === "working") || (timerState === "break" && this.settings.ambientPlayOnBreak);

		if (shouldPlay) {
			this.ambientManager.play(this.settings.ambientSound as any);
		} else {
			this.ambientManager.stop();
		}
	}

	private getActiveFilePath(): string {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		return view?.file?.path ?? "";
	}

	/**
	 * Detect checkbox changes: when a line changes from - [ ] to - [x],
	 * finish the active timer for that task.
	 */
	private handleFileChange(filePath: string) {
		try {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view || view.file?.path !== filePath) return;

			const content = view.editor.getValue();
			const currentLines = content.split("\n");
			const prevLines = this.previousLines.get(filePath);

			if (prevLines) {
				for (let i = 0; i < Math.min(currentLines.length, prevLines.length); i++) {
					const prevLine = prevLines[i];
					const currLine = currentLines[i];

					// Detect: was unchecked, now checked
					if (/^\s*- \[ \]/.test(prevLine) && /^\s*- \[x\]/.test(currLine)) {
						this.timerService.finishTaskIfActive(filePath, i);
					}
				}
			}

			this.previousLines.set(filePath, currentLines);
		} catch {
			// Silently ignore errors in change detection
		}
	}

	/** Keep only the current file's cache, prevent memory leak */
	private prunePreviousLinesCache() {
		const activePath = this.getActiveFilePath();
		for (const key of this.previousLines.keys()) {
			if (key !== activePath) {
				this.previousLines.delete(key);
			}
		}
	}

	/** Persist timer state to data.json (fire-and-forget, also called on state-change) */
	private saveTimerState() {
		const data: any = { ...this.settings };
		const timerState = this.timerService.serialize();
		if (timerState.timers.length > 0) {
			data.timerState = timerState;
		}
		this.saveData(data);
	}

	/** Persist a pomodoro count update (during active timer) */
	private async persistPomodoro(filePath: string, lineNumber: number, newCount: number, totalHours: number) {
		try {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view && view.file?.path === filePath) {
				const line = view.editor.getLine(lineNumber);
				if (this.taskParser.isTaskLine(line)) {
					const updated = this.taskParser.updatePomodoroCount(line, newCount, totalHours);
					view.editor.setLine(lineNumber, updated);
				}
			} else {
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (file instanceof TFile) {
					const content = await this.app.vault.read(file);
					const lines = content.split("\n");
					if (lineNumber >= 0 && lineNumber < lines.length && this.taskParser.isTaskLine(lines[lineNumber])) {
						lines[lineNumber] = this.taskParser.updatePomodoroCount(lines[lineNumber], newCount, totalHours);
						await this.app.vault.modify(file, lines.join("\n"));
					}
				}
			}
		} catch {
			// Silently ignore persistence errors
		}

		// Auto-update stats if this is a weekly note (always runs, not blocked by early return)
		if (isWeeklyNote(filePath.split("/").pop() ?? "")) {
			await updateStats(this.app, filePath, this.settings.pomodoroEmoji);
		}
	}

	/** Persist final time tracking when a task is completed */
	private async persistTaskFinish(
		filePath: string,
		lineNumber: number,
		result: { pomodoroCount: number; totalHours: number }
	) {
		try {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view && view.file?.path === filePath) {
				const line = view.editor.getLine(lineNumber);
				if (this.taskParser.isTaskLine(line)) {
					const updated = this.taskParser.updateTimeTracking(
						line, result.pomodoroCount, result.totalHours
					);
					view.editor.setLine(lineNumber, updated);
				}
			} else {
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (file instanceof TFile) {
					const content = await this.app.vault.read(file);
					const lines = content.split("\n");
					if (lineNumber >= 0 && lineNumber < lines.length && this.taskParser.isTaskLine(lines[lineNumber])) {
						lines[lineNumber] = this.taskParser.updateTimeTracking(
							lines[lineNumber], result.pomodoroCount, result.totalHours
						);
						await this.app.vault.modify(file, lines.join("\n"));
					}
				}
			}
		} catch {
			// Silently ignore persistence errors
		}

		// Auto-update stats if this is a weekly note
		if (isWeeklyNote(filePath.split("/").pop() ?? "")) {
			await updateStats(this.app, filePath, this.settings.pomodoroEmoji);
		}
	}

	private togglePomoUnderCursor() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || !view.file) return;

		const cursor = view.editor.getCursor();
		const lineNumber = cursor.line;
		const line = view.editor.getLine(lineNumber);

		if (!this.taskParser.isTaskLine(line)) return;
		if (this.taskParser.isTaskComplete(line)) return;

		const key = `${view.file.path}:${lineNumber}`;
		const existingState = this.timerService.getState(key);

		if (existingState) {
			this.timerService.toggle(key);
		} else {
			this.timerService.start(view.file.path, lineNumber, line);
		}
	}

	private stopPomoUnderCursor() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || !view.file) return;

		const cursor = view.editor.getCursor();
		const lineNumber = cursor.line;
		const key = `${view.file.path}:${lineNumber}`;
		this.timerService.stop(key);
	}

	private resetPomoUnderCursor() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || !view.file) return;

		const cursor = view.editor.getCursor();
		const lineNumber = cursor.line;
		const key = `${view.file.path}:${lineNumber}`;
		this.timerService.reset(key);
	}

	private startStatusBarUpdater() {
		this.statusBarUpdateInterval = window.setInterval(() => {
			try {
				const active = this.timerService.getActiveTimer();
				if (active && this.settings.showInStatusBar) {
					this.renderer.updateStatusBar(
						this.statusBarItem,
						active.state,
						active.remainingSeconds,
						active.pomodoroCount
					);
					this.statusBarItem.style.display = "";
				} else {
					this.statusBarItem.style.display = "none";
				}
			} catch {
				this.statusBarItem.style.display = "none";
			}
		}, 1000);
	}

	private async updatePomoStatsForActiveFile() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || !view.file) return;
		await updateStats(this.app, view.file.path, this.settings.pomodoroEmoji);
	}
}
