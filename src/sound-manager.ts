import { App, Notice } from "obsidian";
import { TaskPomodoroSettings } from "./types";

// Built-in sound definitions (Web Audio API synthesized — no network requests)
const BUILT_IN_SOUNDS = ["chime", "ding", "pulse", "bell", "pop"] as const;

const MIME_MAP: Record<string, string> = {
	".wav": "audio/wav",
	".mp3": "audio/mpeg",
	".ogg": "audio/ogg",
	".m4a": "audio/mp4",
	".webm": "audio/webm",
};

export class SoundManager {
	private app: App;
	private settings: TaskPomodoroSettings;
	private currentAudio: HTMLAudioElement | null = null;
	private blobUrl: string | null = null;

	constructor(app: App, settings: TaskPomodoroSettings) {
		this.app = app;
		this.settings = settings;
	}

	updateSettings(settings: TaskPomodoroSettings) {
		this.settings = settings;
	}

	getBuiltInSounds(): string[] {
		return [...BUILT_IN_SOUNDS];
	}

	/** Play a built-in synthesized sound or custom audio */
	async play(): Promise<void> {
		if (!this.settings.soundEnabled) return;

		this.stopCurrentAudio();

		const selected = this.settings.selectedSound;

		// Custom sound
		if (selected === "custom") {
			await this.playCustomSound();
			return;
		}

		// Built-in synthesized sounds (no network requests)
		this.playSynthesized(selected);
	}

	private playSynthesized(type: string) {
		try {
			const ctx = new AudioContext();
			const volume = this.settings.soundVolume;

			switch (type) {
				case "chime":
					this.playChime(ctx, volume);
					break;
				case "ding":
					this.playDing(ctx, volume);
					break;
				case "pulse":
					this.playPulse(ctx, volume);
					break;
				case "bell":
					this.playBell(ctx, volume);
					break;
				case "pop":
					this.playPop(ctx, volume);
					break;
				default:
					this.playChime(ctx, volume);
					break;
			}
		} catch {
			// Web Audio API not available — silently ignore
		}
	}

	private createOsc(ctx: AudioContext, freq: number, type: OscillatorType, gainValue: number, startTime: number, duration: number) {
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.frequency.value = freq;
		osc.type = type;
		gain.gain.setValueAtTime(gainValue, startTime);
		gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
		osc.start(startTime);
		osc.stop(startTime + duration);
	}

	private playChime(ctx: AudioContext, vol: number) {
		const t = ctx.currentTime;
		this.createOsc(ctx, 800, "sine", vol * 0.3, t, 0.3);
		setTimeout(() => {
			try { this.createOsc(ctx, 1000, "sine", vol * 0.25, ctx.currentTime, 0.3); } catch {}
		}, 200);
		setTimeout(() => {
			try { this.createOsc(ctx, 1200, "sine", vol * 0.2, ctx.currentTime, 0.4); } catch {}
		}, 400);
	}

	private playDing(ctx: AudioContext, vol: number) {
		const t = ctx.currentTime;
		this.createOsc(ctx, 1200, "sine", vol * 0.3, t, 0.5);
	}

	private playPulse(ctx: AudioContext, vol: number) {
		const t = ctx.currentTime;
		this.createOsc(ctx, 600, "triangle", vol * 0.25, t, 0.15);
		setTimeout(() => {
			try { this.createOsc(ctx, 800, "triangle", vol * 0.2, ctx.currentTime, 0.2); } catch {}
		}, 180);
	}

	private playBell(ctx: AudioContext, vol: number) {
		const t = ctx.currentTime;
		this.createOsc(ctx, 523, "sine", vol * 0.25, t, 0.8);
		this.createOsc(ctx, 659, "sine", vol * 0.15, t, 0.6);
		this.createOsc(ctx, 784, "sine", vol * 0.1, t, 0.4);
	}

	private playPop(ctx: AudioContext, vol: number) {
		const t = ctx.currentTime;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.frequency.setValueAtTime(400, t);
		osc.frequency.exponentialRampToValueAtTime(150, t + 0.1);
		osc.type = "sine";
		gain.gain.setValueAtTime(vol * 0.3, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
		osc.start(t);
		osc.stop(t + 0.15);
	}

	private async playCustomSound() {
		const customPath = this.settings.customSoundUrl.trim();
		if (!customPath) return;

		let url: string | null = null;

		// External URL (user-initiated)
		if (customPath.startsWith("http://") || customPath.startsWith("https://")) {
			url = customPath;
		} else {
			// Vault file (local)
			try {
				const binary = await this.app.vault.adapter.readBinary(customPath);
				const ext = customPath.substring(customPath.lastIndexOf(".")).toLowerCase();
				const mimeType = MIME_MAP[ext] || "audio/wav";
				const blob = new Blob([binary], { type: mimeType });
				this.cleanupBlobUrl();
				this.blobUrl = URL.createObjectURL(blob);
				url = this.blobUrl;
			} catch {
				new Notice(`无法加载音效文件: ${customPath}`, 3000);
				return;
			}
		}

		try {
			const audio = new Audio();
			audio.volume = this.settings.soundVolume;
			audio.preload = "auto";

			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => {
					reject(new Error("Audio load timeout"));
				}, 5000);

				audio.addEventListener("canplaythrough", () => {
					clearTimeout(timeout);
					resolve();
				}, { once: true });

				audio.addEventListener("error", () => {
					clearTimeout(timeout);
					reject(new Error("Audio load error"));
				}, { once: true });

				audio.src = url!;
				audio.load();
			});

			this.currentAudio = audio;
			await audio.play();
		} catch {
			// Silently fail — audio is not critical
		}
	}

	stopCurrentAudio() {
		if (this.currentAudio) {
			this.currentAudio.pause();
			this.currentAudio.currentTime = 0;
			this.currentAudio = null;
		}
	}

	private cleanupBlobUrl() {
		if (this.blobUrl) {
			URL.revokeObjectURL(this.blobUrl);
			this.blobUrl = null;
		}
	}

	cleanup() {
		this.stopCurrentAudio();
		this.cleanupBlobUrl();
	}
}
