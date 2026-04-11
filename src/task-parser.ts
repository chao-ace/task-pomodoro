import { TaskPomodoroSettings } from "./types";

const TASK_LINE_REGEX = /^(\s*)- \[( |x)\] (.*)$/;
const POMODORO_REGEX = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*$/u;

export class TaskParser {
	private emoji: string;

	constructor(settings: TaskPomodoroSettings) {
		this.emoji = settings.pomodoroEmoji;
	}

	updateSettings(settings: TaskPomodoroSettings) {
		this.emoji = settings.pomodoroEmoji;
	}

	/** Check if a line is a valid (non-empty) task line */
	isTaskLine(line: string): boolean {
		const match = line.match(TASK_LINE_REGEX);
		if (!match) return false;
		// Skip empty tasks (only whitespace after the checkbox)
		const content = match[3].trim();
		// Allow tasks with just wikilinks or text
		return content.length > 0;
	}

	/** Check if the task is completed */
	isTaskComplete(line: string): boolean {
		const match = line.match(TASK_LINE_REGEX);
		return match !== null && match[2] === "x";
	}

	/** Extract current pomodoro count from a task line */
	extractPomodoroCount(line: string): number {
		// Count consecutive emoji at the end of the line
		let count = 0;
		let i = line.length;
		while (i >= this.emoji.length) {
			const slice = line.slice(i - this.emoji.length, i);
			if (slice === this.emoji) {
				count++;
				i -= this.emoji.length;
			} else {
				break;
			}
		}
		return count;
	}

	/** Remove all trailing pomodoro emoji from a line */
	private stripPomodoro(line: string): string {
		let result = line;
		while (result.endsWith(this.emoji)) {
			result = result.slice(0, -this.emoji.length).trimEnd();
		}
		return result;
	}

	/** Update the pomodoro count on a task line */
	updatePomodoroCount(line: string, count: number): string {
		const cleaned = this.stripPomodoro(line).trimEnd();
		if (count <= 0) return cleaned;
		return cleaned + " " + this.emoji.repeat(count);
	}

	/** Get a fingerprint for drift detection (first ~50 chars of task content) */
	getTaskFingerprint(line: string): string {
		const match = line.match(TASK_LINE_REGEX);
		if (!match) return "";
		const content = match[3].trim();
		return content.slice(0, 50);
	}

	/** Extract display text from a task line (strip wikilink syntax) */
	getTaskDisplayText(line: string): string {
		const match = line.match(TASK_LINE_REGEX);
		if (!match) return "";
		let content = match[3].trim();
		// Strip trailing pomodoro emoji
		content = this.stripPomodoro(content).trim();
		// Strip completion date marker
		content = content.replace(/\s*✅\s*\d{4}-\d{2}-\d{2}\s*$/, "").trim();
		// Extract wikilink display text: [[path|display]] → display
		const wikilinkMatch = content.match(/\[\[.*?\|(.*?)\]\]/);
		if (wikilinkMatch) return wikilinkMatch[1];
		// Extract simple wikilink: [[name]] → name
		const simpleMatch = content.match(/\[\[(.*?)\]\]/);
		if (simpleMatch) return simpleMatch[1];
		return content;
	}

	/** Get the indent level of a task line */
	getIndentLevel(line: string): number {
		const match = line.match(/^(\s*)/);
		return match ? Math.floor(match[1].length / 2) : 0;
	}
}
