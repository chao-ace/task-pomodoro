import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { TaskKey } from "./types";
import { TaskParser } from "./task-parser";
import { TimerService } from "./timer-service";
import { TaskRenderer } from "./task-renderer";

class TaskPomodoroWidget extends WidgetType {
	private key: TaskKey;
	private filePath: string;
	private lineNumber: number;
	private lineText: string;
	private isComplete: boolean;
	private timerService: TimerService;
	private taskParser: TaskParser;
	private renderer: TaskRenderer;

	constructor(
		key: TaskKey,
		filePath: string,
		lineNumber: number,
		lineText: string,
		isComplete: boolean,
		timerService: TimerService,
		taskParser: TaskParser,
		renderer: TaskRenderer
	) {
		super();
		this.key = key;
		this.filePath = filePath;
		this.lineNumber = lineNumber;
		this.lineText = lineText;
		this.isComplete = isComplete;
		this.timerService = timerService;
		this.taskParser = taskParser;
		this.renderer = renderer;
	}

	toDOM(): HTMLElement {
		const workSeconds = this.timerService.getSettings().workMinutes * 60;
		const existingState = this.timerService.getState(this.key);
		const pomodoroCount = existingState?.pomodoroCount
			?? this.taskParser.extractPomodoroCount(this.lineText);
		const state = this.isComplete ? "completed" : (existingState?.state ?? "idle");
		const remaining = existingState?.remainingSeconds ?? workSeconds;
		const totalWork = existingState?.totalWorkSeconds ?? workSeconds;

		const btn = this.renderer.createButton(
			state, remaining, totalWork, pomodoroCount,
			() => {
				if (this.isComplete) return;
				const es = this.timerService.getState(this.key);
				if (es) {
					this.timerService.toggle(this.key);
				} else {
					this.timerService.start(this.filePath, this.lineNumber, this.lineText);
				}
			}
		);

		// Store key for DOM-based updates
		btn.setAttribute("data-task-pomo-key", this.key);
		return btn;
	}

	eq(other: TaskPomodoroWidget): boolean {
		return this.key === other.key && this.lineText === other.lineText;
	}

	ignoreEvent(event: Event): boolean {
		return false; // Allow all events (clicks need to work)
	}
}

export function createLivePreviewExtension(
	timerService: TimerService,
	taskParser: TaskParser,
	renderer: TaskRenderer,
	getFilePath: () => string
) {
	return ViewPlugin.fromClass(
		class TaskPomodoroViewPlugin {
			view: EditorView;
			decorations: DecorationSet;
			private timerService: TimerService;
			private taskParser: TaskParser;
			private renderer: TaskRenderer;
			private getFilePath: () => string;
			private needsRedraw = false;
			private refreshInterval: number | null = null;

			constructor(view: EditorView) {
				this.view = view;
				this.decorations = this.buildDecorations(this.view);
				this.timerService = timerService;
				this.taskParser = taskParser;
				this.renderer = renderer;
				this.getFilePath = getFilePath;

				// Subscribe to timer events — update DOM directly instead of rebuilding
				this.timerService.on("tick", this.handleTimerEvent);
				this.timerService.on("state-change", this.handleTimerEvent);

				// Periodic refresh for active timers (lightweight DOM update)
				this.refreshInterval = window.setInterval(() => {
					this.updateActiveWidgets();
				}, 1000);
			}

			// Called on every timer event — just mark for redraw, don't rebuild immediately
			handleTimerEvent = (key: TaskKey) => {
				this.updateWidgetForKey(key);
			};

			// Find the widget DOM element for a given key and update it directly
			private updateWidgetForKey(key: TaskKey) {
				const widgets = this.view.dom.querySelectorAll(`[data-task-pomo-key="${key}"]`);
				const state = this.timerService.getState(key);
				if (!state || widgets.length === 0) return;

				const workSeconds = this.timerService.getSettings().workMinutes * 60;
				widgets.forEach((widget) => {
					this.renderer.updateButton(
						widget as HTMLSpanElement,
						state.state,
						state.remainingSeconds,
						state.totalWorkSeconds,
						state.pomodoroCount
					);
				});
			}

			// Update all active timer widgets
			private updateActiveWidgets() {
				const allWidgets = this.view.dom.querySelectorAll("[data-task-pomo-key]");
				allWidgets.forEach((widget) => {
					const key = widget.getAttribute("data-task-pomo-key");
					if (!key) return;
					const state = this.timerService.getState(key);
					if (!state) return;
					if (state.state === "working" || state.state === "break" || state.state === "paused") {
						this.renderer.updateButton(
							widget as HTMLSpanElement,
							state.state,
							state.remainingSeconds,
							state.totalWorkSeconds,
							state.pomodoroCount
						);
					}
				});
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged) {
					this.decorations = this.buildDecorations(update.view);
				}
			}

			buildDecorations(view: EditorView): DecorationSet {
				const widgets: any[] = [];
				const filePath = this.getFilePath();
				if (!filePath) return Decoration.none;

				for (const { from, to } of view.visibleRanges) {
					try {
						const lineFrom = view.state.doc.lineAt(from);
						const lineTo = view.state.doc.lineAt(to);

						for (let i = lineFrom.number; i <= lineTo.number; i++) {
							const line = view.state.doc.line(i);
							const lineText = line.text;

							if (this.taskParser.isTaskLine(lineText)) {
								const lineNumber = i - 1; // 0-indexed
								const key = `${filePath}:${lineNumber}`;
								const isComplete = this.taskParser.isTaskComplete(lineText);

								const widget = Decoration.widget({
									widget: new TaskPomodoroWidget(
										key, filePath, lineNumber, lineText, isComplete,
										this.timerService, this.taskParser, this.renderer
									),
									side: 1,
								});

								widgets.push(widget.range(line.to));
							}
						}
					} catch {
						// Ignore errors in line iteration
					}
				}

				return Decoration.set(widgets, true);
			}

			destroy() {
				this.timerService.off("tick", this.handleTimerEvent);
				this.timerService.off("state-change", this.handleTimerEvent);
				if (this.refreshInterval) {
					window.clearInterval(this.refreshInterval);
				}
			}
		},
		{
			decorations: (v: any) => v.decorations,
		}
	);
}
