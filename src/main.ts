import { Plugin, MarkdownView, TFile } from "obsidian";
import { TaskPomodoroSettings, DEFAULT_SETTINGS } from "./types";
import { TaskParser } from "./task-parser";
import { TimerService } from "./timer-service";
import { TaskRenderer } from "./task-renderer";
import { ReadingViewRenderer } from "./reading-view";
import { createLivePreviewExtension } from "./live-preview";
import { TaskPomodoroSettingTab } from "./settings-tab";

export default class TaskPomodoroPlugin extends Plugin {
	settings!: TaskPomodoroSettings;
	timerService!: TimerService;
	private taskParser!: TaskParser;
	private renderer!: TaskRenderer;
	private readingViewRenderer!: ReadingViewRenderer;
	private statusBarItem!: HTMLDivElement;
	private statusBarUpdateInterval: number | null = null;

	async onload() {
		await this.loadSettings();

		this.taskParser = new TaskParser(this.settings);
		this.renderer = new TaskRenderer(this.settings.pomodoroEmoji);
		this.timerService = new TimerService(this.app, this.settings, this.taskParser);

		// Callback: pomodoro count update during active timer
		this.timerService.setPomodoroCompleteCallback(
			async (filePath: string, lineNumber: number, newCount: number) => {
				await this.persistPomodoro(filePath, lineNumber, newCount);
			}
		);

		// Callback: task finished (user checked off a task with active timer)
		this.timerService.setTaskFinishCallback(
			async (filePath: string, lineNumber: number, result) => {
				await this.persistTaskFinish(filePath, lineNumber, result);
			}
		);

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

		// Status bar — structured DOM like PomoBar
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

		// Commands
		this.addCommand({
			id: "toggle-pomo",
			name: "开始/暂停光标所在任务的番茄钟",
			callback: () => this.togglePomoUnderCursor(),
		});
		this.addCommand({
			id: "stop-pomo",
			name: "停止光标所在任务的番茄钟",
			callback: () => this.stopPomoUnderCursor(),
		});
		this.addCommand({
			id: "reset-pomo",
			name: "重置光标所在任务的番茄钟",
			callback: () => this.resetPomoUnderCursor(),
		});
		this.addCommand({
			id: "reset-session",
			name: "重置整个番茄钟会话",
			callback: () => this.timerService.resetSession(),
		});
		this.addCommand({
			id: "toggle-sound",
			name: "切换音效开关",
			callback: () => {
				this.settings.soundEnabled = !this.settings.soundEnabled;
				this.saveSettings();
			},
		});
		this.addCommand({
			id: "toggle-statusbar",
			name: "切换状态栏显示",
			callback: () => {
				this.settings.showInStatusBar = !this.settings.showInStatusBar;
				this.saveSettings();
			},
		});

		console.log("Task Pomodoro plugin loaded");
	}

	onunload() {
		this.timerService.cleanup();
		if (this.statusBarUpdateInterval) {
			window.clearInterval(this.statusBarUpdateInterval);
		}
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.taskParser.updateSettings(this.settings);
		this.renderer.updateEmoji(this.settings.pomodoroEmoji);
		this.timerService.updateSettings(this.settings);
	}

	resetSession() {
		this.timerService.resetSession();
	}

	private getActiveFilePath(): string {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		return view?.file?.path ?? "";
	}

	/**
	 * Detect checkbox changes: when a line changes from - [ ] to - [x],
	 * finish the active timer for that task.
	 */
	private previousLines: Map<string, string[]> = new Map();

	private handleFileChange(filePath: string) {
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
				const wasUnchecked = prevLine.match(/^\s*- \[ \]/);
				const isNowChecked = currLine.match(/^\s*- \[x\]/);

				if (wasUnchecked && isNowChecked) {
					// Finish the timer for this task if active
					this.timerService.finishTaskIfActive(filePath, i);
				}
			}
		}

		this.previousLines.set(filePath, currentLines);
	}

	/** Persist a 🍅 count update (during active pomodoro) */
	private async persistPomodoro(filePath: string, lineNumber: number, newCount: number) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view && view.file?.path === filePath) {
			const line = view.editor.getLine(lineNumber);
			if (this.taskParser.isTaskLine(line)) {
				const updated = this.taskParser.updatePomodoroCount(line, newCount);
				view.editor.setLine(lineNumber, updated);
				return;
			}
		}

		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			const content = await this.app.vault.read(file);
			const lines = content.split("\n");
			if (lineNumber < lines.length && this.taskParser.isTaskLine(lines[lineNumber])) {
				lines[lineNumber] = this.taskParser.updatePomodoroCount(lines[lineNumber], newCount);
				await this.app.vault.modify(file, lines.join("\n"));
			}
		}
	}

	/** Persist final time tracking when a task is completed */
	private async persistTaskFinish(
		filePath: string,
		lineNumber: number,
		result: { pomodoroCount: number; totalHours: number }
	) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view && view.file?.path === filePath) {
			const line = view.editor.getLine(lineNumber);
			if (this.taskParser.isTaskLine(line)) {
				const updated = this.taskParser.updateTimeTracking(
					line, result.pomodoroCount, result.totalHours
				);
				view.editor.setLine(lineNumber, updated);
				return;
			}
		}

		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			const content = await this.app.vault.read(file);
			const lines = content.split("\n");
			if (lineNumber < lines.length && this.taskParser.isTaskLine(lines[lineNumber])) {
				lines[lineNumber] = this.taskParser.updateTimeTracking(
					lines[lineNumber], result.pomodoroCount, result.totalHours
				);
				await this.app.vault.modify(file, lines.join("\n"));
			}
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
		}, 1000);
	}
}
