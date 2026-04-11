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
	private timerService!: TimerService;
	private taskParser!: TaskParser;
	private renderer!: TaskRenderer;
	private readingViewRenderer!: ReadingViewRenderer;
	private statusBarItem!: HTMLElement;
	private statusBarUpdateInterval: number | null = null;

	async onload() {
		await this.loadSettings();

		this.taskParser = new TaskParser(this.settings);
		this.renderer = new TaskRenderer(this.settings.pomodoroEmoji);
		this.timerService = new TimerService(this.app, this.settings, this.taskParser);

		// Set up pomodoro persistence callback
		this.timerService.setPomodoroCompleteCallback(
			async (filePath: string, lineNumber: number, newCount: number) => {
				await this.persistPomodoro(filePath, lineNumber, newCount);
			}
		);

		// Reading View post-processor
		this.readingViewRenderer = new ReadingViewRenderer(
			this.app,
			this.timerService,
			this.taskParser,
			this.renderer
		);
		this.registerMarkdownPostProcessor(this.readingViewRenderer.process);

		// Live Preview extension
		const lpExtension = createLivePreviewExtension(
			this.timerService,
			this.taskParser,
			this.renderer,
			() => this.getActiveFilePath()
		);
		this.registerEditorExtension([lpExtension]);

		// Status bar
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.className = "task-pomo-statusbar";
		this.statusBarItem.style.display = "none";
		this.startStatusBarUpdater();

		// Settings tab
		this.addSettingTab(new TaskPomodoroSettingTab(this.app, this));

		// Commands
		this.addCommand({
			id: "start-pomo-under-cursor",
			name: "开始/暂停光标所在任务的番茄钟",
			callback: () => this.togglePomoUnderCursor(),
		});

		this.addCommand({
			id: "stop-pomo-under-cursor",
			name: "停止光标所在任务的番茄钟",
			callback: () => this.stopPomoUnderCursor(),
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

	private getActiveFilePath(): string {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		return view?.file?.path ?? "";
	}

	/** Persist a 🍅 count update to the markdown file */
	private async persistPomodoro(filePath: string, lineNumber: number, newCount: number) {
		// Prefer editor API for active files (preserves unsaved edits)
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view && view.file?.path === filePath) {
			const line = view.editor.getLine(lineNumber);
			if (this.taskParser.isTaskLine(line)) {
				const updated = this.taskParser.updatePomodoroCount(line, newCount);
				view.editor.setLine(lineNumber, updated);
				return;
			}
		}

		// Fallback to vault API for non-active files
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

	/** Toggle the pomodoro timer for the task under the cursor */
	private togglePomoUnderCursor() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || !view.file) return;

		const cursor = view.editor.getCursor();
		const lineNumber = cursor.line;
		const line = view.editor.getLine(lineNumber);

		if (!this.taskParser.isTaskLine(line)) {
			return;
		}

		const key = `${view.file.path}:${lineNumber}`;
		const existingState = this.timerService.getState(key);

		if (existingState) {
			this.timerService.toggle(key);
		} else {
			this.timerService.start(view.file.path, lineNumber, line);
		}
	}

	/** Stop the pomodoro timer for the task under the cursor */
	private stopPomoUnderCursor() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || !view.file) return;

		const cursor = view.editor.getCursor();
		const lineNumber = cursor.line;
		const key = `${view.file.path}:${lineNumber}`;
		this.timerService.stop(key);
	}

	/** Start periodic status bar updates */
	private startStatusBarUpdater() {
		this.statusBarUpdateInterval = window.setInterval(() => {
			const active = this.timerService.getActiveTimer();
			if (active && this.settings.showInStatusBar) {
				const displayText = this.taskParser.getTaskDisplayText(
					// We don't have the raw line here, use fingerprint
					active.taskFingerprint
				);
				const time = this.renderer.formatTime(active.remainingSeconds);
				const stateIcon = active.state === "working" ? "⏱" : "☕";
				this.statusBarItem.textContent = `${stateIcon} ${time} — ${displayText}`;
				this.statusBarItem.style.display = "";
			} else {
				this.statusBarItem.style.display = "none";
			}
		}, 1000);
	}
}
