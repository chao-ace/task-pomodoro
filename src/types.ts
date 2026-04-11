// Timer states for a single task
export type TimerState = "idle" | "working" | "paused" | "break" | "completed";

// Key to identify a specific task: "filePath:lineNumber"
export type TaskKey = string;

// State for one task's timer
export interface TaskTimerState {
	key: TaskKey;
	filePath: string;
	lineNumber: number;
	taskFingerprint: string; // first ~50 chars, for drift detection
	state: TimerState;
	remainingSeconds: number;
	totalWorkSeconds: number;
	totalBreakSeconds: number;
	pomodoroCount: number;
	startedAt: number | null; // Date.now()
}

// Plugin settings
export interface TaskPomodoroSettings {
	workMinutes: number;
	shortBreakMinutes: number;
	longBreakMinutes: number;
	pomodoroEmoji: string;
	soundEnabled: boolean;
	soundVolume: number;
	selectedSound: string;
	autoStartBreak: boolean;
	showInStatusBar: boolean;
}

export const DEFAULT_SETTINGS: TaskPomodoroSettings = {
	workMinutes: 25,
	shortBreakMinutes: 5,
	longBreakMinutes: 15,
	pomodoroEmoji: "\u{1F345}", // 🍅
	soundEnabled: true,
	soundVolume: 0.5,
	selectedSound: "chime",
	autoStartBreak: false,
	showInStatusBar: true,
};
