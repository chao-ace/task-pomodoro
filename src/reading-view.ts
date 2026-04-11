import { App, MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { TaskKey } from "./types";
import { TaskParser } from "./task-parser";
import { TimerService } from "./timer-service";
import { TaskRenderer } from "./task-renderer";

/**
 * MarkdownPostProcessor for Reading View.
 * Finds task list items and injects inline timer buttons.
 */
export class ReadingViewRenderer {
	private app: App;
	private timerService: TimerService;
	private taskParser: TaskParser;
	private renderer: TaskRenderer;

	constructor(app: App, timerService: TimerService, taskParser: TaskParser, renderer: TaskRenderer) {
		this.app = app;
		this.timerService = timerService;
		this.taskParser = taskParser;
		this.renderer = renderer;
	}

	/**
	 * The post-processor callback.
	 */
	process = (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
		const taskLists = el.findAll("ul.contains-task-list");
		for (const list of taskLists) {
			this.processTaskList(list, ctx);
		}
	};

	private processTaskList(list: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const items = list.findAll("li.task-list-item");
		if (items.length === 0) return;

		const sectionInfo = ctx.getSectionInfo(list);
		if (!sectionInfo) return;

		const filePath = ctx.sourcePath;

		// We determine task state from the rendered DOM (checkbox checked state)
		// rather than reading the raw markdown, since vault.read is async
		this.processTaskListWithContent(items, filePath, sectionInfo.lineStart, ctx);
	}

	private processTaskListWithContent(
		items: HTMLElement[],
		filePath: string,
		startLine: number,
		ctx: MarkdownPostProcessorContext
	) {
		for (let i = 0; i < items.length; i++) {
			const li = items[i];
			const lineNumber = startLine + i;

			// Determine if the task is complete from the checkbox
			const checkbox = li.querySelector("input.task-list-item-checkbox") as HTMLInputElement;
			if (!checkbox) continue;

			const isComplete = checkbox.checked;

			// Get the text content of the li (excluding nested lists)
			const textContent = this.getTaskText(li);
			if (!textContent.trim()) continue; // Skip empty tasks

			const key = `${filePath}:${lineNumber}`;

			// Create a MarkdownRenderChild to manage lifecycle
			const child = new TaskButtonRenderChild(
				li,
				key,
				filePath,
				lineNumber,
				isComplete,
				textContent.trim(),
				this.timerService,
				this.taskParser,
				this.renderer
			);
			ctx.addChild(child);
		}
	}

	/** Extract visible text content from a task list item, excluding nested lists */
	private getTaskText(li: HTMLElement): string {
		// Clone to avoid modifying the original
		const clone = li.cloneNode(true) as HTMLElement;
		// Remove nested lists
		clone.querySelectorAll("ul, ol").forEach(el => el.remove());
		// Remove checkbox
		clone.querySelector("input.task-list-item-checkbox")?.remove();
		return clone.textContent ?? "";
	}
}

/**
 * Manages the lifecycle of a single task's timer button in Reading View.
 */
class TaskButtonRenderChild extends MarkdownRenderChild {
	private key: TaskKey;
	private filePath: string;
	private lineNumber: number;
	private isComplete: boolean;
	private taskText: string;
	private timerService: TimerService;
	private taskParser: TaskParser;
	private renderer: TaskRenderer;
	private buttonEl: HTMLSpanElement | null = null;
	private onTick: (key: TaskKey) => void;
	private onStateChange: (key: TaskKey) => void;

	constructor(
		containerEl: HTMLElement,
		key: TaskKey,
		filePath: string,
		lineNumber: number,
		isComplete: boolean,
		taskText: string,
		timerService: TimerService,
		taskParser: TaskParser,
		renderer: TaskRenderer
	) {
		super(containerEl);
		this.key = key;
		this.filePath = filePath;
		this.lineNumber = lineNumber;
		this.isComplete = isComplete;
		this.taskText = taskText;
		this.timerService = timerService;
		this.taskParser = taskParser;
		this.renderer = renderer;
		this.onTick = this.handleTick.bind(this);
		this.onStateChange = this.handleStateChange.bind(this);
	}

	onload() {
		const existingState = this.timerService.getState(this.key);
		const pomodoroCount = existingState?.pomodoroCount ?? 0;
		const workSeconds = this.timerService["settings"].workMinutes * 60;

		const state = this.isComplete ? "completed" : (existingState?.state ?? "idle");
		const remaining = existingState?.remainingSeconds ?? workSeconds;
		const totalWork = existingState?.totalWorkSeconds ?? workSeconds;

		this.buttonEl = this.renderer.createButton(
			state,
			remaining,
			totalWork,
			pomodoroCount,
			() => this.handleClick()
		);

		this.containerEl.appendChild(this.buttonEl);

		this.timerService.on("tick", this.onTick);
		this.timerService.on("state-change", this.onStateChange);
	}

	onunload() {
		this.timerService.off("tick", this.onTick);
		this.timerService.off("state-change", this.onStateChange);
	}

	private handleClick() {
		if (this.isComplete) return;

		const existingState = this.timerService.getState(this.key);
		if (existingState) {
			this.timerService.toggle(this.key);
		} else {
			// Start a new timer — we need the raw line text
			// For now, use the task text as fingerprint
			this.timerService.start(this.filePath, this.lineNumber, `- [ ] ${this.taskText}`);
		}
	}

	private handleTick(key: TaskKey) {
		if (key !== this.key || !this.buttonEl) return;
		const state = this.timerService.getState(this.key);
		if (!state) return;

		this.renderer.updateButton(
			this.buttonEl,
			state.state,
			state.remainingSeconds,
			state.totalWorkSeconds,
			state.pomodoroCount
		);
	}

	private handleStateChange(key: TaskKey) {
		if (key !== this.key || !this.buttonEl) return;
		const state = this.timerService.getState(this.key);
		if (!state) return;

		this.renderer.updateButton(
			this.buttonEl,
			state.state,
			state.remainingSeconds,
			state.totalWorkSeconds,
			state.pomodoroCount
		);
	}
}
