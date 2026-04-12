import { TimerState } from "./types";

// Lucide SVG icons (same as PomoBar)
const SVG_PLAY = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>`;

const SVG_PAUSE = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/></svg>`;

const SVG_TIMER = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/></svg>`;

const SVG_COFFEE = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>`;

export class TaskRenderer {
	private emoji: string;

	constructor(emoji: string) {
		this.emoji = emoji;
	}

	updateEmoji(emoji: string) {
		this.emoji = emoji;
	}

	formatTime(totalSeconds: number): string {
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, "0")}`;
	}

	formatHours(hours: number): string {
		if (hours <= 0) return "";
		const rounded = Math.round(hours * 10) / 10;
		if (rounded === Math.floor(rounded)) {
			return `${rounded}h`;
		}
		return `${rounded}h`;
	}

	private getIconSvg(state: TimerState): string {
		switch (state) {
			case "working": return SVG_TIMER;
			case "paused": return SVG_PAUSE;
			case "break": return SVG_COFFEE;
			default: return SVG_PLAY;
		}
	}

	/**
	 * Build the inline timer button for an active (incomplete) task.
	 */
	createButton(
		state: TimerState,
		remainingSeconds: number,
		totalWorkSeconds: number,
		pomodoroCount: number,
		onClick: () => void
	): HTMLSpanElement {
		const btn = document.createElement("span");
		btn.className = `task-pomo-btn ${state}`;

		const label = document.createElement("span");
		label.className = "task-pomo-label";

		// Icon
		const iconWrap = document.createElement("span");
		iconWrap.className = "task-pomo-icon";
		iconWrap.innerHTML = this.getIconSvg(state);
		label.appendChild(iconWrap);

		// Time text
		const timeText = document.createElement("span");
		switch (state) {
			case "idle":
				timeText.textContent = this.formatTime(totalWorkSeconds);
				break;
			case "working":
			case "paused":
			case "break":
				timeText.textContent = this.formatTime(remainingSeconds);
				break;
		}
		label.appendChild(timeText);

		btn.appendChild(label);

		if (pomodoroCount > 0) {
			const count = document.createElement("span");
			count.className = "task-pomo-count";
			count.textContent = this.emoji.repeat(pomodoroCount);
			btn.appendChild(count);
		}

		btn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			onClick();
		});

		return btn;
	}

	/**
	 * Build the time summary for a completed task.
	 */
	createCompletedSummary(pomodoroCount: number, totalHours: number): HTMLSpanElement {
		const el = document.createElement("span");
		el.className = "task-pomo-summary";

		const parts: string[] = [];
		if (pomodoroCount > 0) {
			parts.push(this.emoji.repeat(pomodoroCount));
		}
		const hoursStr = this.formatHours(totalHours);
		if (hoursStr) {
			parts.push(hoursStr);
		}

		if (parts.length > 0) {
			el.textContent = parts.join(" ");
		}

		return el;
	}

	/** Update an existing button's display */
	updateButton(
		btn: HTMLSpanElement,
		state: TimerState,
		remainingSeconds: number,
		totalWorkSeconds: number,
		pomodoroCount: number
	) {
		if (state === "completed") {
			btn.className = "task-pomo-summary";
			btn.innerHTML = "";
			return;
		}

		btn.className = `task-pomo-btn ${state}`;

		// Update icon
		const iconWrap = btn.querySelector(".task-pomo-icon");
		if (iconWrap) {
			iconWrap.innerHTML = this.getIconSvg(state);
		}

		// Update time text
		const label = btn.querySelector(".task-pomo-label");
		if (label) {
			// Find the text node (after the icon)
			const timeEl = label.querySelector(".task-pomo-icon")?.nextSibling;
			if (timeEl) {
				switch (state) {
					case "idle":
						timeEl.textContent = this.formatTime(totalWorkSeconds);
						break;
					case "working":
					case "paused":
					case "break":
						timeEl.textContent = this.formatTime(remainingSeconds);
						break;
				}
			}
		}

		// Update count
		let countEl = btn.querySelector(".task-pomo-count") as HTMLSpanElement;
		if (pomodoroCount > 0) {
			if (!countEl) {
				countEl = document.createElement("span");
				countEl.className = "task-pomo-count";
				btn.appendChild(countEl);
			}
			countEl.textContent = this.emoji.repeat(pomodoroCount);
		} else if (countEl) {
			countEl.remove();
		}
	}

	// ========================================
	// Status bar helpers
	// ========================================

	/** Create the structured status bar element */
	createStatusBarItem(): HTMLDivElement {
		const container = document.createElement("div");
		container.className = "task-pomo-statusbar";

		const icon = document.createElement("span");
		icon.className = "task-pomo-sb-icon";
		icon.innerHTML = SVG_TIMER;
		container.appendChild(icon);

		const time = document.createElement("span");
		time.className = "task-pomo-sb-time";
		time.textContent = "25:00";
		container.appendChild(time);

		const sep = document.createElement("span");
		sep.className = "task-pomo-sb-sep";
		sep.textContent = "·";
		container.appendChild(sep);

		const count = document.createElement("span");
		count.className = "task-pomo-sb-count";
		count.textContent = "";
		container.appendChild(count);

		return container;
	}

	/** Update the status bar display */
	updateStatusBar(
		container: HTMLDivElement,
		state: TimerState,
		remainingSeconds: number,
		pomodoroCount: number
	) {
		const icon = container.querySelector(".task-pomo-sb-icon") as HTMLElement;
		const time = container.querySelector(".task-pomo-sb-time") as HTMLElement;
		const count = container.querySelector(".task-pomo-sb-count") as HTMLElement;
		const sep = container.querySelector(".task-pomo-sb-sep") as HTMLElement;

		if (!icon || !time) return;

		// Update state classes
		container.classList.remove("task-pomo-sb-active", "task-pomo-sb-paused", "task-pomo-sb-break");

		switch (state) {
			case "working":
				icon.innerHTML = SVG_TIMER;
				container.classList.add("task-pomo-sb-active");
				break;
			case "paused":
				icon.innerHTML = SVG_PAUSE;
				container.classList.add("task-pomo-sb-paused");
				break;
			case "break":
				icon.innerHTML = SVG_COFFEE;
				container.classList.add("task-pomo-sb-break");
				break;
			default:
				icon.innerHTML = SVG_TIMER;
				break;
		}

		time.textContent = this.formatTime(remainingSeconds);

		if (pomodoroCount > 0) {
			count.textContent = `${this.emoji} ${pomodoroCount}`;
			if (sep) sep.style.display = "";
		} else {
			count.textContent = "";
			if (sep) sep.style.display = "none";
		}
	}
}
