import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType } from "@codemirror/view";
import { TaskKey, TimerState } from "./types";
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
	// Snapshot of timer state at creation time — used by eq() to detect changes
	private snapshotState: TimerState | "none";
	private snapshotRemaining: number;

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

		const existingState = this.timerService.getState(this.key);
		this.snapshotState = existingState?.state ?? "none";
		this.snapshotRemaining = existingState?.remainingSeconds ?? -1;
	}

	toDOM(): HTMLElement {
		if (this.isComplete) {
			// Completed task: time tracking already in markdown, skip widget
			const placeholder = document.createElement("span");
			placeholder.style.display = "none";
			placeholder.setAttribute("data-task-pomo-key", this.key);
			return placeholder;
		}

		// Active task: show timer button with current state
		const workSeconds = this.timerService.getSettings().workMinutes * 60;
		const existingState = this.timerService.getState(this.key);
		const pomodoroCount = existingState?.pomodoroCount
			?? this.taskParser.extractPomodoroCount(this.lineText);
		const state = existingState?.state ?? "idle";
		const remaining = existingState?.remainingSeconds ?? workSeconds;
		const totalWork = existingState?.totalWorkSeconds ?? workSeconds;

		const btn = this.renderer.createButton(
			state, remaining, totalWork, pomodoroCount,
			() => {
				const es = this.timerService.getState(this.key);
				if (es) {
					this.timerService.toggle(this.key);
				} else {
					this.timerService.start(this.filePath, this.lineNumber, this.lineText);
				}
			}
		);

		btn.setAttribute("data-task-pomo-key", this.key);
		return btn;
	}

	eq(other: TaskPomodoroWidget): boolean {
		if (this.key !== other.key || this.lineText !== other.lineText) return false;
		// When timer state changes, force DOM recreation via toDOM()
		if (this.snapshotState !== other.snapshotState) return false;
		if (this.snapshotState !== "none" && this.snapshotRemaining !== other.snapshotRemaining) return false;
		return true;
	}

	ignoreEvent(event: Event): boolean {
		return false;
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
			private refreshInterval: number | null = null;

			constructor(view: EditorView) {
				this.view = view;
				this.timerService = timerService;
				this.taskParser = taskParser;
				this.renderer = renderer;
				this.getFilePath = getFilePath;
				this.decorations = this.buildDecorations(this.view);

				// Rebuild on state changes (start/stop/pause/complete)
				this.timerService.on("state-change", this.rebuild);

				// Refresh every second for countdown updates
				this.refreshInterval = window.setInterval(() => {
					if (this.timerService.getActiveTimer()) {
						this.decorations = this.buildDecorations(this.view);
					}
				}, 1000);
			}

			private rebuild = () => {
				this.decorations = this.buildDecorations(this.view);
			};

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
								const lineNumber = i - 1;
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
				this.timerService.off("state-change", this.rebuild);
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
