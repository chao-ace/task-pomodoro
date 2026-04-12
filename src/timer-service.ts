import { App, Notice } from "obsidian";
import { TaskKey, TaskTimerState, TaskPomodoroSettings } from "./types";
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
	// Track work intervals for long break
	private workIntervalCount: number = 0;
	// Timer mode: 0 = work, 1 = short break, 2 = long break
	private currentDurationIndex: number = 0;

	constructor(app: App, settings: TaskPomodoroSettings, taskParser: TaskParser) {
		this.app = app;
		this.settings = settings;
		this.taskParser = taskParser;
	}

	getSettings(): TaskPomodoroSettings {
		return this.settings;
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

		// Stop tick loop if no active timers
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

		// Determine if we should do a long break
		this.workIntervalCount++;
		const isLongBreak = this.workIntervalCount >= this.settings.intervalsBeforeLongBreak;

		state.state = "break";
		state.totalBreakSeconds = isLongBreak
			? this.settings.longBreakMinutes * 60
			: this.settings.shortBreakMinutes * 60;
		state.remainingSeconds = state.totalBreakSeconds;
		state.startedAt = Date.now();

		if (isLongBreak) {
			this.workIntervalCount = 0;
		}

		this.emit("work-complete", state.key);
		this.emit("state-change", state.key);

		// Persist 🍅 to markdown
		if (this.onPomodoroComplete) {
			await this.onPomodoroComplete(state.filePath, state.lineNumber, state.pomodoroCount);
		}

		// Notifications
		const breakType = isLongBreak ? "长休息" : "短休息";
		const breakDuration = isLongBreak ? this.settings.longBreakMinutes : this.settings.shortBreakMinutes;
		new Notice(`🍅 番茄钟完成！${breakType} ${breakDuration} 分钟`, 5000);
		this.playCompletionSound();

		// Auto-start break if enabled
		if (!this.settings.autoStartBreak) {
			// Stay in break state but don't count down
			// Actually, let's keep the countdown going but just notify
			// The break timer will count down and then go to idle
		}
	}

	private onBreakComplete(state: TaskTimerState) {
		state.state = "idle";
		state.remainingSeconds = state.totalWorkSeconds;
		state.startedAt = null;

		this.currentDurationIndex = 0; // Back to work

		this.emit("break-complete", state.key);
		this.emit("state-change", state.key);

		new Notice("☕ 休息结束！准备下一个番茄钟", 5000);
		this.playCompletionSound();

		// Auto-start next work session if enabled
		if (this.settings.autoProgressEnabled) {
			state.state = "working";
			state.remainingSeconds = state.totalWorkSeconds;
			state.startedAt = Date.now();
			this.ensureTickLoop();
			this.emit("state-change", state.key);
			new Notice("🍅 自动开始下一个番茄钟！", 3000);
		}
	}

	playCompletionSound() {
		if (!this.settings.soundEnabled) return;
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
			// Play a second tone for more noticeable alert
			setTimeout(() => {
				try {
					const osc2 = ctx.createOscillator();
					const gain2 = ctx.createGain();
					osc2.connect(gain2);
					gain2.connect(ctx.destination);
					gain2.gain.value = this.settings.soundVolume * 0.3;
					osc2.frequency.value = 1000;
					osc2.type = "sine";
					osc2.start();
					osc2.stop(ctx.currentTime + 0.3);
				} catch {}
			}, 400);
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

	/** Reset a timer to idle state */
	reset(key: TaskKey): TaskTimerState | null {
		const state = this.timers.get(key);
		if (!state) return null;
		state.state = "idle";
		state.remainingSeconds = state.totalWorkSeconds;
		state.startedAt = null;
		this.workIntervalCount = 0;
		this.emit("state-change", key);
		return state;
	}

	/** Reset entire pomodoro session (all work interval counts) */
	resetSession() {
		this.workIntervalCount = 0;
		this.currentDurationIndex = 0;
		// Stop all timers
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

	complete(key: TaskKey) {
		const state = this.timers.get(key);
		if (!state) return;
		state.state = "completed";
		state.startedAt = null;
		this.emit("state-change", key);
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
				if (state.remainingSeconds <= 0) {
					state.state = "idle";
					state.remainingSeconds = state.totalWorkSeconds;
				}
			}
			this.timers.set(state.key, state);
		}
	}
}
