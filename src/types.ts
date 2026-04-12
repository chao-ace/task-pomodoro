export type TimerState = "idle" | "working" | "paused" | "break" | "completed";
export type TaskKey = string;

export interface TaskTimerState {
	key: TaskKey;
	filePath: string;
	lineNumber: number;
	taskFingerprint: string;
	state: TimerState;
	remainingSeconds: number;
	totalWorkSeconds: number;
	totalBreakSeconds: number;
	pomodoroCount: number;
	startedAt: number | null;
}

export interface TaskPomodoroSettings {
	// Timer durations
	workMinutes: number;
	shortBreakMinutes: number;
	longBreakMinutes: number;
	intervalsBeforeLongBreak: number;

	// Display
	pomodoroEmoji: string;
	showInStatusBar: boolean;

	// Notifications
	soundEnabled: boolean;
	soundVolume: number;
	notificationEnabled: boolean;
	persistentNotification: boolean;

	// Behavior
	autoStartBreak: boolean;
	autoProgressEnabled: boolean;
}

export const DEFAULT_SETTINGS: TaskPomodoroSettings = {
	workMinutes: 25,
	shortBreakMinutes: 5,
	longBreakMinutes: 15,
	intervalsBeforeLongBreak: 4,
	pomodoroEmoji: "\u{1F345}",
	showInStatusBar: true,
	soundEnabled: true,
	soundVolume: 0.5,
	notificationEnabled: true,
	persistentNotification: false,
	autoStartBreak: true,
	autoProgressEnabled: false,
};
