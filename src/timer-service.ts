import { App, MarkdownView, Notice, TFile } from "obsidian";
import { TaskKey, TaskTimerState, TaskPomodoroSettings, TimerState } from "./types";
import { TaskParser } from "./task-parser";

type TimerEventType = "tick" | "state-change" | "work-complete" | "break-complete";
type TimerCallback = (key: TaskKey, state: TaskTimerState) => void;

export class TimerService {
	private app: App;
	private settings: TaskPomodoroSettings;
	private taskParser: TaskParser;
	private timers: Map<TaskKey, TaskTimerState> = new Map();
	private tickInterval: number | null = null;
	private listeners: Map<TimerEventType, Set<TimerCallback>> = new Map();
	private onPomodoroComplete?: (filePath: string, lineNumber: number, newCount: number) => Promise<void>;

	constructor(app: App, settings: TaskPomodoroSettings, taskParser: TaskParser) {
		this.app = app;
		this.settings = settings;
		this.taskParser = taskParser;
	}

	updateSettings(settings: TaskPomodoroSettings) {
		this.settings = settings;
		this.taskParser.updateSettings(settings);
	}

	setPomodoroCompleteCallback(cb: (filePath: string, lineNumber: number, newCount: number) => Promise<void>) {
		this.onPomodoroComplete = cb;
	}

	on(event: TimerEventType, callback: TimerCallback) {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)!.add(callback);
	}

	off(event: TimerEventType, callback: TimerCallback) {
		this.listeners.get(event)?.delete(callback);
	}

	private emit(event: TimerEventType, key: TaskKey) {
		const state = this.timers.get(key);
		if (!state) return;
		this.listeners.get(event)?.forEach(cb => cb(key, state));
		// Always emit state-change for any event
		if (event !== "state-change") {
			this.listeners.get("state-change")?.forEach(cb => cb(key, state));
		}
	}

	private ensureTickLoop() {
		if (this.tickInterval !== null) return;
		this.tickInterval = window.setInterval(() => this.tick(), 1000);
	}

	private stopTickLoop() {
		if (this.tickInterval !== null) {
			window.clearInterval(this.tickInterval);
			this.tickInterval = null;
		}
	}

	private tick() {
		for (const [key, state] of this.timers) {
			if (state.state === "working" || state.state === "break") {
				state.remainingSeconds--;

				if (state.remainingSeconds <= 0) {
					if (state.state === "working") {
						this.onWorkComplete(state);
					} else {
						this.onBreakComplete(state);
					}
				} else {
					this.emit("tick", key);
				}
			}
		}

		// Stop the tick loop if no active timers
		let hasActive = false;
		for (const state of this.timers.values()) {
			if (state.state === "working" || state.state === "break") {
				hasActive = true;
				break;
			}
		}
		if (!hasActive) {
			this.stopTickLoop();
		}
	}

	private async onWorkComplete(state: TaskTimerState) {
		state.pomodoroCount++;
		state.state = "break";
		state.remainingSeconds = state.totalBreakSeconds;
		state.startedAt = Date.now();

		this.emit("work-complete", state.key);
		this.emit("state-change", state.key);

		// Persist 🍅 to markdown
		if (this.onPomodoroComplete) {
			await this.onPomodoroComplete(state.filePath, state.lineNumber, state.pomodoroCount);
		}

		// Notification
		new Notice(`🍅 番茄钟完成！休息 ${this.settings.shortBreakMinutes} 分钟`, 5000);
		this.playCompletionSound();

		// Auto-start break if enabled
		if (!this.settings.autoStartBreak) {
			state.state = "idle";
			state.remainingSeconds = state.totalBreakSeconds;
			this.emit("state-change", state.key);
		}
	}

	private onBreakComplete(state: TaskTimerState) {
		state.state = "idle";
		state.remainingSeconds = state.totalWorkSeconds;
		state.startedAt = null;

		this.emit("break-complete", state.key);
		this.emit("state-change", state.key);

		new Notice("☕ 休息结束！准备下一个番茄钟", 5000);
		this.playCompletionSound();
	}

	private playCompletionSound() {
		// Simple audio beep using Web Audio API
		try {
			const ctx = new AudioContext();
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.connect(gain);
			gain.connect(ctx.destination);
			gain.gain.value = this.settings.soundVolume * 0.3;
			osc.frequency.value = 800;
			osc.type = "sine";
			osc.start();
			osc.stop(ctx.currentTime + 0.3);
		} catch {
			// Silently ignore audio errors
		}
	}

	private makeKey(filePath: string, lineNumber: number): TaskKey {
		return `${filePath}:${lineNumber}`;
	}

	start(filePath: string, lineNumber: number, lineText: string): TaskTimerState {
		const key = this.makeKey(filePath, lineNumber);
		const existing = this.timers.get(key);

		if (existing) {
			// Resume or start work
			if (existing.state === "paused") {
				existing.state = "working";
				existing.startedAt = Date.now();
				this.ensureTickLoop();
				this.emit("state-change", key);
				return existing;
			}
			if (existing.state === "idle") {
				existing.state = "working";
				existing.remainingSeconds = existing.totalWorkSeconds;
				existing.startedAt = Date.now();
				this.ensureTickLoop();
				this.emit("state-change", key);
				return existing;
			}
			// Already running, just return current state
			return existing;
		}

		// Create new timer
		const pomodoroCount = this.taskParser.extractPomodoroCount(lineText);
		const fingerprint = this.taskParser.getTaskFingerprint(lineText);

		const state: TaskTimerState = {
			key,
			filePath,
			lineNumber,
			taskFingerprint: fingerprint,
			state: "working",
			remainingSeconds: this.settings.workMinutes * 60,
			totalWorkSeconds: this.settings.workMinutes * 60,
			totalBreakSeconds: this.settings.shortBreakMinutes * 60,
			pomodoroCount,
			startedAt: Date.now(),
		};

		this.timers.set(key, state);
		this.ensureTickLoop();
		this.emit("state-change", key);
		return state;
	}

	pause(key: TaskKey): TaskTimerState | null {
		const state = this.timers.get(key);
		if (!state || state.state !== "working") return null;

		state.state = "paused";
		state.startedAt = null;
		this.emit("state-change", key);
		return state;
	}

	resume(key: TaskKey): TaskTimerState | null {
		const state = this.timers.get(key);
		if (!state || state.state !== "paused") return null;

		state.state = "working";
		state.startedAt = Date.now();
		this.ensureTickLoop();
		this.emit("state-change", key);
		return state;
	}

	stop(key: TaskKey): TaskTimerState | null {
		const state = this.timers.get(key);
		if (!state) return null;

		state.state = "idle";
		state.remainingSeconds = state.totalWorkSeconds;
		state.startedAt = null;
		this.emit("state-change", key);
		return state;
	}

	/** Toggle: idle→working, working→paused, paused→working, break→idle */
	toggle(key: TaskKey): TaskTimerState | null {
		const state = this.timers.get(key);
		if (!state) return null;

		switch (state.state) {
			case "idle":
				state.state = "working";
				state.remainingSeconds = state.totalWorkSeconds;
				state.startedAt = Date.now();
				this.ensureTickLoop();
				break;
			case "working":
				state.state = "paused";
				state.startedAt = null;
				break;
			case "paused":
				state.state = "working";
				state.startedAt = Date.now();
				this.ensureTickLoop();
				break;
			case "break":
				state.state = "idle";
				state.remainingSeconds = state.totalWorkSeconds;
				state.startedAt = null;
				break;
		}

		this.emit("state-change", key);
		return state;
	}

	getState(key: TaskKey): TaskTimerState | null {
		return this.timers.get(key) ?? null;
	}

	/** Remove a timer (e.g., when task line is deleted) */
	remove(key: TaskKey) {
		this.timers.delete(key);
	}

	/** Update line number for a timer (when lines shift) */
	updateLineNumber(oldKey: TaskKey, newLineNumber: number): TaskKey | null {
		const state = this.timers.get(oldKey);
		if (!state) return null;

		this.timers.delete(oldKey);
		state.lineNumber = newLineNumber;
		const newKey = this.makeKey(state.filePath, newLineNumber);
		state.key = newKey;
		this.timers.set(newKey, state);
		return newKey;
	}

	/** Mark a task as completed (disable timer) */
	complete(key: TaskKey) {
		const state = this.timers.get(key);
		if (!state) return;
		state.state = "completed";
		state.startedAt = null;
		this.emit("state-change", key);
	}

	/** Get the currently active (working) timer, if any */
	getActiveTimer(): TaskTimerState | null {
		for (const state of this.timers.values()) {
			if (state.state === "working" || state.state === "break") {
				return state;
			}
		}
		return null;
	}

	/** Cleanup on plugin unload */
	cleanup() {
		this.stopTickLoop();
		this.timers.clear();
		this.listeners.clear();
	}

	/** Save state for persistence across restarts */
	serialize(): TaskTimerState[] {
		return Array.from(this.timers.values()).filter(
			s => s.state !== "idle" && s.state !== "completed"
		);
	}

	/** Restore state from persistence */
	deserialize(states: TaskTimerState[]) {
		for (const state of states) {
			// Calculate how much time passed while Obsidian was closed
			if (state.state === "working" && state.startedAt) {
				const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
				state.remainingSeconds = Math.max(0, state.remainingSeconds - elapsed);
				if (state.remainingSeconds <= 0) {
					// Work completed while closed — we'll handle this on next tick
					state.state = "idle";
					state.remainingSeconds = state.totalWorkSeconds;
				}
			}
			this.timers.set(state.key, state);
		}
	}
}
