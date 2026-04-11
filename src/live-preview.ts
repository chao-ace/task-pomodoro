import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
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
		const existingState = this.timerService.getState(this.key);
		const pomodoroCount = existingState?.pomodoroCount
			?? this.taskParser.extractPomodoroCount(this.lineText);
		const state = this.isComplete ? "completed" : (existingState?.state ?? "idle");
		const remaining = existingState?.remainingSeconds ?? this.timerService["settings"].workMinutes * 60;
		const totalWork = existingState?.totalWorkSeconds ?? this.timerService["settings"].workMinutes * 60;

		const btn = this.renderer.createButton(
			state,
			remaining,
			totalWork,
			pomodoroCount,
			() => this.timerService.toggle(this.key)
		);

		// Store widget reference for updates
		(btn as any).__taskPomoKey = this.key;

		return btn;
	}

	eq(other: TaskPomodoroWidget): boolean {
		return this.key === other.key;
	}

	ignoreEvent(event: Event): boolean {
		// Allow click events on the button
		return event.type !== "click";
	}
}

export function createLivePreviewExtension(
	timerService: TimerService,
	taskParser: TaskParser,
	renderer: TaskRenderer,
	getFilePath: () => string
) {
	return ViewPlugin.fromClass(
		class {
			view: EditorView;
			decorations: DecorationSet;
			private timerService: TimerService;
			private taskParser: TaskParser;
			private renderer: TaskRenderer;
			private getFilePath: () => string;

			constructor(view: EditorView) {
				this.view = view;
				this.decorations = Decoration.none;
				this.timerService = timerService;
				this.taskParser = taskParser;
				this.renderer = renderer;
				this.getFilePath = getFilePath;

				// Subscribe to timer events to trigger re-decoration
				this.timerService.on("tick", this.handleTimerUpdate);
				this.timerService.on("state-change", this.handleTimerUpdate);
			}

			handleTimerUpdate = () => {
				// Force re-decoration by updating the decorations
				this.decorations = this.buildDecorations(this.view);
			};

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged) {
					this.decorations = this.buildDecorations(update.view);
				}
			}

			buildDecorations(view: EditorView): DecorationSet {
				const builder = new RangeSetBuilder<Decoration>();
				const filePath = this.getFilePath();

				for (const { from, to } of view.visibleRanges) {
					syntaxTree(view.state).iterate({
						from,
						to,
						enter: (node) => {
							// Look for list items that contain task markers
							if (node.name === "ListItem") {
								const lineFrom = view.state.doc.lineAt(node.from);
								const lineText = lineFrom.text;

								if (this.taskParser.isTaskLine(lineText)) {
									const lineNumber = lineFrom.number - 1; // 0-indexed
									const key = `${filePath}:${lineNumber}`;
									const isComplete = this.taskParser.isTaskComplete(lineText);

									const widget = Decoration.widget({
										widget: new TaskPomodoroWidget(
											key,
											filePath,
											lineNumber,
											lineText,
											isComplete,
											this.timerService,
											this.taskParser,
											this.renderer
										),
										side: 1, // Place after the line content
									});

									builder.add(node.to, node.to, widget);
								}
							}
						},
					});
				}

				return builder.finish();
			}

			destroy() {
				this.timerService.off("tick", this.handleTimerUpdate);
				this.timerService.off("state-change", this.handleTimerUpdate);
			}
		},
		{
			decorations: (v: any) => v.decorations,
		}
	);
}
