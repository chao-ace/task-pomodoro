import { App, MarkdownPostProcessorContext, MarkdownRenderChild, TFile } from "obsidian";
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

	process = (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
		// Try to find task list items directly — more robust than finding lists first
		const taskItems = el.findAll("li.task-list-item");
		if (taskItems.length === 0) return;

		const filePath = ctx.sourcePath;
		const sectionInfo = ctx.getSectionInfo(el);
		if (!sectionInfo) {
			// No section info — try to attach buttons without line number tracking
			// This can happen in some edge cases
			this.processItemsWithoutSection(taskItems, filePath, ctx);
			return;
		}

		// We have section info — compute line numbers
		// The section starts at lineStart. Task items within the section
		// are sequential lines (each <li> = one markdown line for flat lists).
		// But we need to account for non-task lines in the same section.

		// Strategy: count all <li> elements (task and non-task) to get correct line offsets
		const parentUl = taskItems[0]?.closest("ul");
		if (!parentUl) return;

		const allItems = parentUl.findAll(":scope > li");
		const taskItemSet = new Set(taskItems);

		let lineOffset = 0;
		for (let i = 0; i < allItems.length; i++) {
			const li = allItems[i];
			const lineNumber = sectionInfo.lineStart + lineOffset;

			if (taskItemSet.has(li)) {
				const checkbox = li.querySelector("input.task-list-item-checkbox") as HTMLInputElement;
				if (checkbox) {
					const isComplete = checkbox.checked;
					const textContent = this.getTaskText(li);

					if (textContent.trim()) {
						const key = `${filePath}:${lineNumber}`;
						const child = new TaskButtonRenderChild(
							li, key, filePath, lineNumber, isComplete, textContent.trim(),
							this.timerService, this.taskParser, this.renderer
						);
						ctx.addChild(child);
					}
				}
			}
			lineOffset++;
		}
	};

	private processItemsWithoutSection(
		items: HTMLElement[],
		filePath: string,
		ctx: MarkdownPostProcessorContext
	) {
		for (let i = 0; i < items.length; i++) {
			const li = items[i];
			const checkbox = li.querySelector("input.task-list-item-checkbox") as HTMLInputElement;
			if (!checkbox) continue;

			const isComplete = checkbox.checked;
			const textContent = this.getTaskText(li);
			if (!textContent.trim()) continue;

			// Use a DOM-based key when we don't have line numbers
			const key = `${filePath}:dom-${i}`;
			const child = new TaskButtonRenderChild(
				li, key, filePath, -1, isComplete, textContent.trim(),
				this.timerService, this.taskParser, this.renderer
			);
			ctx.addChild(child);
		}
	}

	private getTaskText(li: HTMLElement): string {
		const clone = li.cloneNode(true) as HTMLElement;
		clone.querySelectorAll("ul, ol").forEach(el => el.remove());
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
	private boundTick: (key: TaskKey) => void;
	private boundStateChange: (key: TaskKey) => void;

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
		this.boundTick = this.handleTimerEvent.bind(this);
		this.boundStateChange = this.handleTimerEvent.bind(this);
	}

	onload() {
		const workSeconds = this.timerService.getSettings().workMinutes * 60;

		if (this.isComplete) {
			// Completed task: time tracking already in markdown text, skip
			return;
		}

		// Active/incomplete task: show timer button
		const existingState = this.timerService.getState(this.key);
		const pomodoroCount = existingState?.pomodoroCount ?? 0;
		const state = existingState?.state ?? "idle";
		const remaining = existingState?.remainingSeconds ?? workSeconds;
		const totalWork = existingState?.totalWorkSeconds ?? workSeconds;

		this.buttonEl = this.renderer.createButton(
			state, remaining, totalWork, pomodoroCount,
			() => this.handleClick()
		);

		this.containerEl.appendChild(this.buttonEl);

		this.timerService.on("tick", this.boundTick);
		this.timerService.on("state-change", this.boundStateChange);
	}

	onunload() {
		this.timerService.off("tick", this.boundTick);
		this.timerService.off("state-change", this.boundStateChange);
	}

	private handleClick() {
		if (this.isComplete) return;

		const existingState = this.timerService.getState(this.key);
		if (existingState) {
			this.timerService.toggle(this.key);
		} else {
			this.timerService.start(this.filePath, this.lineNumber, `- [ ] ${this.taskText}`);
		}
	}

	private handleTimerEvent(key: TaskKey) {
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
