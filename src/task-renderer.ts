import { TaskKey, TaskTimerState, TimerState } from "./types";

export class TaskRenderer {
	private emoji: string;

	constructor(emoji: string) {
		this.emoji = emoji;
	}

	updateEmoji(emoji: string) {
		this.emoji = emoji;
	}

	/** Format remaining seconds as MM:SS */
	formatTime(totalSeconds: number): string {
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, "0")}`;
	}

	/** Build the inline timer button for a task */
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

		switch (state) {
			case "idle":
				label.textContent = `▶ ${this.formatTime(totalWorkSeconds)}`;
				break;
			case "working":
				label.textContent = `⏱ ${this.formatTime(remainingSeconds)}`;
				break;
			case "paused":
				label.textContent = `⏸ ${this.formatTime(remainingSeconds)}`;
				break;
			case "break":
				label.textContent = `☕ ${this.formatTime(remainingSeconds)}`;
				break;
			case "completed":
				label.textContent = "✅ 已完成";
				break;
		}

		btn.appendChild(label);

		// Pomodoro count indicator
		if (pomodoroCount > 0) {
			const count = document.createElement("span");
			count.className = "task-pomo-count";
			count.textContent = " " + this.emoji.repeat(pomodoroCount);
			btn.appendChild(count);
		}

		if (state !== "completed") {
			btn.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				onClick();
			});
		}

		return btn;
	}

	/** Update an existing button's display (avoid DOM recreation) */
	updateButton(
		btn: HTMLSpanElement,
		state: TimerState,
		remainingSeconds: number,
		totalWorkSeconds: number,
		pomodoroCount: number
	) {
		const label = btn.querySelector(".task-pomo-label") as HTMLSpanElement;
		if (!label) return;

		// Update state class
		btn.className = `task-pomo-btn ${state}`;

		switch (state) {
			case "idle":
				label.textContent = `▶ ${this.formatTime(totalWorkSeconds)}`;
				break;
			case "working":
				label.textContent = `⏱ ${this.formatTime(remainingSeconds)}`;
				break;
			case "paused":
				label.textContent = `⏸ ${this.formatTime(remainingSeconds)}`;
				break;
			case "break":
				label.textContent = `☕ ${this.formatTime(remainingSeconds)}`;
				break;
			case "completed":
				label.textContent = "✅ 已完成";
				break;
		}

		// Update count
		let countEl = btn.querySelector(".task-pomo-count") as HTMLSpanElement;
		if (pomodoroCount > 0) {
			if (!countEl) {
				countEl = document.createElement("span");
				countEl.className = "task-pomo-count";
				btn.appendChild(countEl);
			}
			countEl.textContent = " " + this.emoji.repeat(pomodoroCount);
		} else if (countEl) {
			countEl.remove();
		}
	}
}
