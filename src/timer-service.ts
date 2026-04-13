import { App, Notice } from "obsidian";
import { SoundManager } from "./sound-manager";
import { TaskKey, TaskTimerState, TaskPomodoroSettings } from "./types";
import { TaskParser } from "./task-parser";
import { tf } from "./i18n";

type TimerEventType = "tick" | "state-change" | "work-complete" | "break-complete" | "task-finished";
type TimerCallback = (key: TaskKey, state: TaskTimerState) => void;

export interface TaskFinishResult {
	pomodoroCount: number;
	totalHours: number; // actual total hours worked (e.g. 0.8)
}

export class TimerService {
	private app: App;
	private settings: TaskPomodoroSettings;
	private taskParser: TaskParser;
	private timers: Map<TaskKey, TaskTimerState> = new Map();
	private tickInterval: number | null = null;
	private listeners: Map<TimerEventType, Set<TimerCallback>> = new Map();
	private onPomodoroComplete?: (filePath: string, lineNumber: number, newCount: number, totalHours: number) => Promise<void>;
	private onTaskFinish?: (filePath: string, lineNumber: number, result: TaskFinishResult) => Promise<void>;
	private workIntervalCount: number = 0;
	private currentDurationIndex: number = 0;

	private soundManager: SoundManager;

	constructor(app: App, settings: TaskPomodoroSettings, taskParser: TaskParser, soundManager: SoundManager) {
		this.app = app;
		this.settings = settings;
		this.taskParser = taskParser;
		this.soundManager = soundManager;
	}

	getSettings(): TaskPomodoroSettings {
		return this.settings;
	}

	updateSettings(settings: TaskPomodoroSettings) {
		this.settings = settings;
		this.taskParser.updateSettings(settings);
	}

	setPomodoroCompleteCallback(cb: (filePath: string, lineNumber: number, newCount: number, totalHours: number) => Promise<void>) {
		this.onPomodoroComplete = cb;
	}

	setTaskFinishCallback(cb: (filePath: string, lineNumber: number, result: TaskFinishResult) => Promise<void>) {
		this.onTaskFinish = cb;
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
			if (state.state === "working") {
				state.remainingSeconds--;
				state.totalWorkedSeconds++; // accumulate actual work time

				if (state.remainingSeconds <= 0) {
					this.onWorkComplete(state);
				} else {
					this.emit("tick", key);
				}
			} else if (state.state === "break" && state.startedAt !== null) {
				state.remainingSeconds--;

				if (state.remainingSeconds <= 0) {
					this.onBreakComplete(state);
				} else {
					this.emit("tick", key);
				}
			}
		}

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
		this.workIntervalCount++;
		const isLongBreak = this.workIntervalCount >= this.settings.intervalsBeforeLongBreak;

		state.state = "break";
		state.totalBreakSeconds = isLongBreak
			? this.settings.longBreakMinutes * 60
			: this.settings.shortBreakMinutes * 60;
		state.remainingSeconds = state.totalBreakSeconds;
		
		if (this.settings.autoStartBreak) {
			state.startedAt = Date.now();
			this.ensureTickLoop();
		} else {
			state.startedAt = null;
		}

		if (isLongBreak) {
			this.workIntervalCount = 0;
		}

		this.emit("work-complete", state.key);
		this.emit("state-change", state.key);

		if (this.onPomodoroComplete) {
			const totalHours = (state.totalWorkedSeconds || 0) / 3600;
			await this.onPomodoroComplete(state.filePath, state.lineNumber, state.pomodoroCount, totalHours);
		}

		const breakType = isLongBreak ? "长休息" : "短休息";
		const breakDuration = isLongBreak ? this.settings.longBreakMinutes : this.settings.shortBreakMinutes;
		const suffix = this.settings.autoStartBreak ? "" : " (点击开始休息)";
		
		const noticeDuration = this.settings.persistentNotification ? 0 : 5000;
		new Notice(`🍅 番茄钟完成！${breakType} ${breakDuration} 分钟${suffix}`, noticeDuration);
		this.playCompletionSound();
	}

	private onBreakComplete(state: TaskTimerState) {
		state.state = "idle";
		state.remainingSeconds = state.totalWorkSeconds;
		state.startedAt = null;
		this.currentDurationIndex = 0;

		this.emit("break-complete", state.key);
		this.emit("state-change", state.key);

		const noticeDuration = (this.settings.persistentNotification && !this.settings.autoProgressEnabled) ? 0 : 5000;
		new Notice(tf("NOTICE_BREAK_COMPLETE"), noticeDuration);
		this.playCompletionSound();

		if (this.settings.autoProgressEnabled) {
			state.state = "working";
			state.remainingSeconds = state.totalWorkSeconds;
			state.startedAt = Date.now();
			this.ensureTickLoop();
			this.emit("state-change", state.key);
			new Notice(tf("NOTICE_AUTO_START"), 3000);
		}
	}

	playCompletionSound() {
		this.soundManager.play();
	}

	private makeKey(filePath: string, lineNumber: number): TaskKey {
		return `${filePath}:${lineNumber}`;
	}

	start(filePath: string, lineNumber: number, lineText: string): TaskTimerState {
		const key = this.makeKey(filePath, lineNumber);
		const existing = this.timers.get(key);

		if (existing) {
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
			return existing;
		}

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
			totalWorkedSeconds: 0,
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
				if (state.startedAt === null) {
					// Start the break
					state.startedAt = Date.now();
					this.ensureTickLoop();
				} else {
					// Skip/Stop the break
					state.state = "idle";
					state.remainingSeconds = state.totalWorkSeconds;
					state.startedAt = null;
				}
				break;
		}

		this.emit("state-change", key);
		return state;
	}

	reset(key: TaskKey): TaskTimerState | null {
		const state = this.timers.get(key);
		if (!state) return null;
		state.state = "idle";
		state.remainingSeconds = state.totalWorkSeconds;
		state.startedAt = null;
		state.totalWorkedSeconds = 0;
		this.workIntervalCount = 0;
		this.emit("state-change", key);
		return state;
	}

	/**
	 * Finish a task: stop timer, calculate actual time spent.
	 * Called when user checks off a task.
	 * Returns the final pomodoro count and total hours.
	 */
	finishTask(key: TaskKey): TaskFinishResult | null {
		const state = this.timers.get(key);
		if (!state) return null;

		// If currently working, count the partial work as worked time
		// (totalWorkedSeconds was already being accumulated in tick())
		// But if paused, we need to check if there's uncounted time
		if (state.state === "working" || state.state === "paused") {
			// totalWorkedSeconds is already accurate from tick()
		}

		// Calculate total hours from accumulated work time
		const totalHours = state.totalWorkedSeconds / 3600;
		const result: TaskFinishResult = {
			pomodoroCount: state.pomodoroCount,
			totalHours: Math.round(totalHours * 100) / 100, // round to 2 decimal places
		};

		// Stop the timer
		state.state = "completed";
		state.startedAt = null;
		this.emit("task-finished", key);
		this.emit("state-change", key);

		// Persist the finish result
		if (this.onTaskFinish) {
			this.onTaskFinish(state.filePath, state.lineNumber, result);
		}

		return result;
	}

	/**
	 * Called from main.ts when a checkbox changes from [ ] to [x].
	 * Checks if there's an active timer for this task and finishes it.
	 */
	finishTaskIfActive(filePath: string, lineNumber: number): TaskFinishResult | null {
		const key = this.makeKey(filePath, lineNumber);
		const state = this.timers.get(key);
		if (!state) return null;
		if (state.state === "completed") return null;
		return this.finishTask(key);
	}

	resetSession() {
		this.workIntervalCount = 0;
		this.currentDurationIndex = 0;
		for (const state of this.timers.values()) {
			if (state.state === "working" || state.state === "break") {
				state.state = "idle";
				state.remainingSeconds = state.totalWorkSeconds;
				state.startedAt = null;
				this.emit("state-change", state.key);
			}
		}
		this.stopTickLoop();
	}

	getState(key: TaskKey): TaskTimerState | null {
		return this.timers.get(key) ?? null;
	}

	remove(key: TaskKey) {
		this.timers.delete(key);
	}

	getActiveTimer(): TaskTimerState | null {
		for (const state of this.timers.values()) {
			if (state.state === "working" || state.state === "break") {
				return state;
			}
		}
		return null;
	}

	getWorkIntervalCount(): number {
		return this.workIntervalCount;
	}

	cleanup() {
		this.stopTickLoop();
		this.timers.clear();
		this.listeners.clear();
	}

	serialize(): TaskTimerState[] {
		return Array.from(this.timers.values()).filter(
			s => s.state !== "idle" && s.state !== "completed"
		);
	}

	deserialize(states: TaskTimerState[]) {
		for (const state of states) {
			if (state.state === "working" && state.startedAt) {
				const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
				state.remainingSeconds = Math.max(0, state.remainingSeconds - elapsed);
				state.totalWorkedSeconds += elapsed;
				if (state.remainingSeconds <= 0) {
					state.state = "idle";
					state.remainingSeconds = state.totalWorkSeconds;
				}
			}
			this.timers.set(state.key, state);
		}
	}
}
