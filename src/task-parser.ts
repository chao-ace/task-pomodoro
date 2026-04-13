import { TaskPomodoroSettings } from "./types";

const TASK_LINE_REGEX = /^(\s*)- \[( |x)\] (.*)$/;

export class TaskParser {
	private emoji: string;

	constructor(settings: TaskPomodoroSettings) {
		this.emoji = settings.pomodoroEmoji;
	}

	updateSettings(settings: TaskPomodoroSettings) {
		this.emoji = settings.pomodoroEmoji;
	}

	isTaskLine(line: string): boolean {
		const match = line.match(TASK_LINE_REGEX);
		if (!match) return false;
		const content = match[3].trim();
		return content.length > 0;
	}

	isTaskComplete(line: string): boolean {
		const match = line.match(TASK_LINE_REGEX);
		return match !== null && match[2] === "x";
	}

	/** Extract current pomodoro count from a task line */
	extractPomodoroCount(line: string): number {
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

	/** Extract hours from task line, e.g. "0.8h" → 0.8 */
	extractHours(line: string): number {
		const match = line.match(/(\d+\.?\d*)h\s*$/);
		return match ? parseFloat(match[1]) : 0;
	}

	/** Format hours as x.xh (e.g. 0.3h, 1.5h) */
	formatHours(hours: number): string {
		if (!hours || hours <= 0) return "";
		
		// For very short durations, show 2 decimals
		if (hours < 0.1) {
			const val = parseFloat(hours.toFixed(2));
			return val > 0 ? `${val}h` : "0.01h";
		}
		
		return `${parseFloat(hours.toFixed(1))}h`;
	}

	/** Remove all trailing pomodoro emoji and hours from a line */
	private stripTracking(line: string): string {
		let result = line.trimEnd();
		// Strip hours like "0.8h" or "1.5h"
		result = result.replace(/\s*\d+\.?\d*h\s*$/, "").trimEnd();
		// Strip pomodoro emoji
		while (result.endsWith(this.emoji)) {
			result = result.slice(0, -this.emoji.length).trimEnd();
		}
		return result;
	}

	/** Update pomodoro count and hours on a task line (during active sessions) */
	updatePomodoroCount(line: string, count: number, hours: number = 0): string {
		return this.updateTimeTracking(line, count, hours);
	}

	/**
	 * Write final time tracking to a completed task line.
	 * Format: 🍅🍅🍅 1.2h (or just 🍅🍅 or just 0.3h)
	 */
	updateTimeTracking(line: string, pomodoroCount: number, totalHours: number): string {
		const cleaned = this.stripTracking(line).trimEnd();

		const parts: string[] = [];
		if (pomodoroCount > 0) {
			parts.push(this.emoji.repeat(pomodoroCount));
		}
		const hoursStr = this.formatHours(totalHours);
		if (hoursStr) {
			parts.push(hoursStr);
		}

		if (parts.length === 0) return cleaned;
		return cleaned + " " + parts.join(" ");
	}

	getTaskFingerprint(line: string): string {
		const match = line.match(TASK_LINE_REGEX);
		if (!match) return "";
		const content = match[3].trim();
		return content.slice(0, 50);
	}

	getTaskDisplayText(line: string): string {
		const match = line.match(TASK_LINE_REGEX);
		if (!match) return "";
		let content = match[3].trim();
		content = this.stripTracking(content).trim();
		content = content.replace(/\s*✅\s*\d{4}-\d{2}-\d{2}\s*$/, "").trim();
		const wikilinkMatch = content.match(/\[\[.*?\|(.*?)\]\]/);
		if (wikilinkMatch) return wikilinkMatch[1];
		const simpleMatch = content.match(/\[\[(.*?)\]\]/);
		if (simpleMatch) return simpleMatch[1];
		return content;
	}
}
