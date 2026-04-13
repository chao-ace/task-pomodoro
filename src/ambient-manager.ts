import { TaskPomodoroSettings } from "./types";

/**
 * Manages ambient soundscape playback using Web Audio API.
 * All soundscapes are synthesized — no external files or network requests.
 *
 * Soundscapes:
 *   whitenoise — Pure white noise
 *   rain       — Gentle rain with bandpass filtering
 *   fire       — Crackling fire with low rumble
 *   forest     — Bird chirps + soft wind
 *   ocean      — Rolling waves with slow amplitude modulation
 *   cafe       — Murmur of a coffee shop
 *   wind       — Howling wind with frequency sweeps
 *   brownnoise — Brown noise (deeper, softer than white)
 *   stream     — Babbling brook
 */

const SOUNDSCAPE_KEYS = [
	"whitenoise", "rain", "fire", "forest", "ocean", "cafe", "wind", "brownnoise", "stream", "summer", "library", "concentration", "train", "storm", "zen",
] as const;

export type SoundscapeKey = (typeof SOUNDSCAPE_KEYS)[number];

/** Human-readable labels for the settings dropdown */
const SOUNDSCAPE_LABELS: Record<SoundscapeKey, { en: string; zh: string }> = {
	whitenoise: { en: "White Noise", zh: "白噪音" },
	rain:       { en: "Rain",        zh: "雨声" },
	fire:       { en: "Fireplace",   zh: "壁炉" },
	forest:     { en: "Forest",      zh: "森林" },
	ocean:      { en: "Ocean",       zh: "海浪" },
	cafe:       { en: "Café",        zh: "咖啡厅" },
	wind:       { en: "Wind",        zh: "风声" },
	brownnoise: { en: "Brown Noise", zh: "棕色噪音" },
	stream:     { en: "Stream",      zh: "溪流" },
	summer:     { en: "Summer Night", zh: "夏夜" },
	library:    { en: "Library",     zh: "图书馆" },
	concentration: { en: "Focus Beats", zh: "专注音频" },
	train:      { en: "Train Ride",   zh: "火车旅程" },
	storm:      { en: "Stormy Rain", zh: "暴雨雷鸣" },
	zen:        { en: "Zen Bowl",    zh: "禅意钵音" },
};

export class AmbientManager {
	private settings: TaskPomodoroSettings;
	private ctx: AudioContext | null = null;
	private masterGain: GainNode | null = null;
	private bufferSources: AudioBufferSourceNode[] = [];
	private oscillators: OscillatorNode[] = [];
	private otherNodes: AudioNode[] = [];
	private currentSound: SoundscapeKey | null = null;
	private isPlaying = false;
	private noiseBuffer: AudioBuffer | null = null;
	private fadeTimeout: number | null = null;

	constructor(settings: TaskPomodoroSettings) {
		this.settings = settings;
	}

	updateSettings(settings: TaskPomodoroSettings) {
		this.settings = settings;
		if (this.masterGain) {
			this.masterGain.gain.linearRampToValueAtTime(
				this.settings.ambientVolume,
				(this.ctx?.currentTime ?? 0) + 0.1
			);
		}
	}

	getSoundscapeKeys(): string[] {
		return [...SOUNDSCAPE_KEYS];
	}

	/** Get a human-readable label for a soundscape key */
	getSoundscapeLabel(key: string): string {
		const isZh = this.settings.language === "zh-CN";
		const entry = SOUNDSCAPE_LABELS[key as SoundscapeKey];
		if (!entry) return key;
		return isZh ? entry.zh : entry.en;
	}

	private ensureContext(): AudioContext {
		if (!this.ctx) {
			this.ctx = new AudioContext();
			this.masterGain = this.ctx.createGain();
			this.masterGain.gain.value = 0; // start silent for fade-in
			this.masterGain.connect(this.ctx.destination);
		}
		if (this.ctx.state === "suspended") {
			this.ctx.resume();
		}
		return this.ctx;
	}

	/** Generate a reusable noise buffer */
	private getNoiseBuffer(ctx: AudioContext, duration = 2): AudioBuffer {
		if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
			return this.noiseBuffer;
		}
		const length = ctx.sampleRate * duration;
		const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < length; i++) {
			data[i] = Math.random() * 2 - 1;
		}
		this.noiseBuffer = buffer;
		return buffer;
	}

	/** Generate brown noise buffer (integrated white noise) */
	private getBrownNoiseBuffer(ctx: AudioContext, duration = 2): AudioBuffer {
		const length = ctx.sampleRate * duration;
		const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		let lastOut = 0;
		for (let i = 0; i < length; i++) {
			const white = Math.random() * 2 - 1;
			data[i] = (lastOut + (0.02 * white)) / 1.02;
			lastOut = data[i];
			data[i] *= 3.5; // compensate for gain loss
		}
		return buffer;
	}

	play(soundKey: SoundscapeKey) {
		if (this.isPlaying && this.currentSound === soundKey) return;
		this.stop();

		const ctx = this.ensureContext();
		const gain = this.masterGain!;

		switch (soundKey) {
			case "whitenoise":
				this.buildWhiteNoise(ctx, gain);
				break;
			case "rain":
				this.buildRain(ctx, gain);
				break;
			case "fire":
				this.buildFire(ctx, gain);
				break;
			case "forest":
				this.buildForest(ctx, gain);
				break;
			case "ocean":
				this.buildOcean(ctx, gain);
				break;
			case "cafe":
				this.buildCafe(ctx, gain);
				break;
			case "wind":
				this.buildWind(ctx, gain);
				break;
			case "brownnoise":
				this.buildBrownNoise(ctx, gain);
				break;
			case "stream":
				this.buildStream(ctx, gain);
				break;
			case "summer":
				this.buildSummer(ctx, gain);
				break;
			case "library":
				this.buildLibrary(ctx, gain);
				break;
			case "concentration":
				this.buildConcentration(ctx, gain);
				break;
			case "train":
				this.buildTrain(ctx, gain);
				break;
			case "storm":
				this.buildStorm(ctx, gain);
				break;
			case "zen":
				this.buildZen(ctx, gain);
				break;
		}

		this.currentSound = soundKey;
		this.isPlaying = true;

		// Fade in
		const now = ctx.currentTime;
		gain.gain.cancelScheduledValues(now);
		gain.gain.setValueAtTime(0, now);
		gain.gain.linearRampToValueAtTime(this.settings.ambientVolume, now + 1.5);
	}

	stop() {
		if (this.fadeTimeout) {
			window.clearTimeout(this.fadeTimeout);
			this.fadeTimeout = null;
		}

		const nodesToStop = [...this.bufferSources];
		const oscsToStop = [...this.oscillators];
		const nodesToDisconnect = [...this.otherNodes];

		// Clear references immediately so subsequent calls don't try to stop them again
		this.bufferSources = [];
		this.oscillators = [];
		this.otherNodes = [];
		this.currentSound = null;
		this.isPlaying = false;

		// Fade out before disconnecting
		if (this.ctx && this.masterGain && (nodesToStop.length > 0 || oscsToStop.length > 0)) {
			const now = this.ctx.currentTime;
			this.masterGain.gain.cancelScheduledValues(now);
			this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
			this.masterGain.gain.linearRampToValueAtTime(0, now + 0.4);

			// Schedule actual cleanup after fade
			this.fadeTimeout = window.setTimeout(() => {
				this.cleanupNodes(nodesToStop, oscsToStop, nodesToDisconnect);
				this.fadeTimeout = null;
			}, 500) as unknown as number;
		} else {
			this.cleanupNodes(nodesToStop, oscsToStop, nodesToDisconnect);
		}
	}

	private cleanupNodes(srcs: AudioBufferSourceNode[], oscs: OscillatorNode[], others: AudioNode[]) {
		for (const src of srcs) {
			try { src.stop(); src.disconnect(); } catch {}
		}
		for (const osc of oscs) {
			try { osc.stop(); osc.disconnect(); } catch {}
		}
		for (const node of others) {
			try { node.disconnect(); } catch {}
		}
	}

	getIsPlaying(): boolean {
		return this.isPlaying;
	}

	getCurrentSound(): string | null {
		return this.currentSound;
	}

	cleanup() {
		this.stop();
		if (this.ctx) {
			try { this.ctx.close(); } catch {}
			this.ctx = null;
			this.masterGain = null;
		}
		this.noiseBuffer = null;
	}

	// ========================================
	// Helpers for building audio graphs
	// ========================================

	private createLoopingSource(ctx: AudioContext, output: AudioNode, useBrownNoise = false): AudioBufferSourceNode {
		const source = ctx.createBufferSource();
		source.buffer = useBrownNoise ? this.getBrownNoiseBuffer(ctx) : this.getNoiseBuffer(ctx);
		source.loop = true;
		source.connect(output);
		source.start();
		this.bufferSources.push(source);
		return source;
	}

	private createOsc(ctx: AudioContext, type: OscillatorType, freq: number): OscillatorNode {
		const osc = ctx.createOscillator();
		osc.type = type;
		osc.frequency.value = freq;
		osc.start();
		this.oscillators.push(osc);
		return osc;
	}

	private trackNode(node: AudioNode): void {
		this.otherNodes.push(node);
	}

	// ========================================
	// Soundscape generators
	// ========================================

	private buildWhiteNoise(ctx: AudioContext, output: GainNode) {
		const filter = ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = 8000;
		filter.connect(output);
		this.trackNode(filter);

		this.createLoopingSource(ctx, filter);
	}

	private buildRain(ctx: AudioContext, output: GainNode) {
		// Main rain: bandpass 500–8000Hz
		const bandpass = ctx.createBiquadFilter();
		bandpass.type = "bandpass";
		bandpass.frequency.value = 3000;
		bandpass.Q.value = 0.5;
		bandpass.connect(output);
		this.trackNode(bandpass);

		// Remove low rumble
		const highpass = ctx.createBiquadFilter();
		highpass.type = "highpass";
		highpass.frequency.value = 500;
		highpass.connect(bandpass);
		this.trackNode(highpass);

		this.createLoopingSource(ctx, highpass);

		// Subtle drip layer: high-pitched occasional clicks
		const dripFilter = ctx.createBiquadFilter();
		dripFilter.type = "bandpass";
		dripFilter.frequency.value = 6000;
		dripFilter.Q.value = 5;
		dripFilter.connect(output);
		this.trackNode(dripFilter);

		const dripGain = ctx.createGain();
		dripGain.gain.value = 0.08;
		dripGain.connect(dripFilter);
		this.trackNode(dripGain);

		this.createLoopingSource(ctx, dripGain);

		// LFO for drip volume
		const dripLfo = this.createOsc(ctx, "sine", 0.3);
		const dripDepth = ctx.createGain();
		dripDepth.gain.value = 0.06;
		dripLfo.connect(dripDepth);
		dripDepth.connect(dripGain.gain);
		this.trackNode(dripDepth);
	}

	private buildFire(ctx: AudioContext, output: GainNode) {
		// Low rumble
		const lowpass = ctx.createBiquadFilter();
		lowpass.type = "lowpass";
		lowpass.frequency.value = 500;
		lowpass.connect(output);
		this.trackNode(lowpass);

		this.createLoopingSource(ctx, lowpass);

		// Crackle effect
		const crackleGain = ctx.createGain();
		crackleGain.gain.value = 0.25;
		crackleGain.connect(output);
		this.trackNode(crackleGain);

		const crackleOsc = this.createOsc(ctx, "sawtooth", 3);
		const crackleDepth = ctx.createGain();
		crackleDepth.gain.value = 0.15;
		crackleOsc.connect(crackleDepth);
		crackleDepth.connect(crackleGain.gain);
		this.trackNode(crackleDepth);

		// Hiss layer
		const hissFilter = ctx.createBiquadFilter();
		hissFilter.type = "highpass";
		hissFilter.frequency.value = 3000;
		hissFilter.connect(output);
		this.trackNode(hissFilter);

		const hissGain = ctx.createGain();
		hissGain.gain.value = 0.08;
		hissGain.connect(hissFilter);
		this.trackNode(hissGain);

		this.createLoopingSource(ctx, hissGain);

		const hissLfo = this.createOsc(ctx, "sine", 0.15);
		const hissDepth = ctx.createGain();
		hissDepth.gain.value = 0.05;
		hissLfo.connect(hissDepth);
		hissDepth.connect(hissGain.gain);
		this.trackNode(hissDepth);
	}

	private buildForest(ctx: AudioContext, output: GainNode) {
		// Bird chirps: high-frequency filtered noise
		const birdFilter = ctx.createBiquadFilter();
		birdFilter.type = "bandpass";
		birdFilter.frequency.value = 4000;
		birdFilter.Q.value = 2;
		birdFilter.connect(output);
		this.trackNode(birdFilter);

		const birdGain = ctx.createGain();
		birdGain.gain.value = 0.12;
		birdGain.connect(birdFilter);
		this.trackNode(birdGain);

		this.createLoopingSource(ctx, birdGain);

		// Bird chirp modulation: fast amplitude wobble
		const birdLfo = this.createOsc(ctx, "sine", 6);
		const birdDepth = ctx.createGain();
		birdDepth.gain.value = 0.1;
		birdLfo.connect(birdDepth);
		birdDepth.connect(birdGain.gain);
		this.trackNode(birdDepth);

		// Wind: low rumble
		const windFilter = ctx.createBiquadFilter();
		windFilter.type = "lowpass";
		windFilter.frequency.value = 300;
		windFilter.connect(output);
		this.trackNode(windFilter);

		const windGain = ctx.createGain();
		windGain.gain.value = 0.18;
		windGain.connect(windFilter);
		this.trackNode(windGain);

		this.createLoopingSource(ctx, windGain);

		// Slow wind modulation
		const windLfo = this.createOsc(ctx, "sine", 0.08);
		const windDepth = ctx.createGain();
		windDepth.gain.value = 0.1;
		windLfo.connect(windDepth);
		windDepth.connect(windGain.gain);
		this.trackNode(windDepth);
	}

	private buildOcean(ctx: AudioContext, output: GainNode) {
		// Wide-band filtered noise
		const filter = ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = 2000;
		filter.connect(output);
		this.trackNode(filter);

		// Amplitude modulated by slow wave (~0.1Hz = one wave every 10s)
		const waveGain = ctx.createGain();
		waveGain.gain.value = 0.5;
		waveGain.connect(filter);
		this.trackNode(waveGain);

		this.createLoopingSource(ctx, waveGain);

		const waveLfo = this.createOsc(ctx, "sine", 0.1);
		const waveDepth = ctx.createGain();
		waveDepth.gain.value = 0.4;
		waveLfo.connect(waveDepth);
		waveDepth.connect(waveGain.gain);
		this.trackNode(waveDepth);

		// Foam/hiss: high frequency layer
		const foamFilter = ctx.createBiquadFilter();
		foamFilter.type = "highpass";
		foamFilter.frequency.value = 4000;
		foamFilter.connect(output);
		this.trackNode(foamFilter);

		const foamGain = ctx.createGain();
		foamGain.gain.value = 0.06;
		foamGain.connect(foamFilter);
		this.trackNode(foamGain);

		this.createLoopingSource(ctx, foamGain);

		// Foam modulated at double wave frequency
		const foamLfo = this.createOsc(ctx, "sine", 0.2);
		const foamDepth = ctx.createGain();
		foamDepth.gain.value = 0.04;
		foamLfo.connect(foamDepth);
		foamDepth.connect(foamGain.gain);
		this.trackNode(foamDepth);
	}

	private buildCafe(ctx: AudioContext, output: GainNode) {
		// Mid-range murmur: 300–3000Hz
		const bandpass = ctx.createBiquadFilter();
		bandpass.type = "bandpass";
		bandpass.frequency.value = 1500;
		bandpass.Q.value = 0.3;
		bandpass.connect(output);
		this.trackNode(bandpass);

		const murmurGain = ctx.createGain();
		murmurGain.gain.value = 0.55;
		murmurGain.connect(bandpass);
		this.trackNode(murmurGain);

		this.createLoopingSource(ctx, murmurGain);

		// Amplitude variation (people talking in waves)
		const murmurLfo = this.createOsc(ctx, "sine", 0.15);
		const murmurDepth = ctx.createGain();
		murmurDepth.gain.value = 0.15;
		murmurLfo.connect(murmurDepth);
		murmurDepth.connect(murmurGain.gain);
		this.trackNode(murmurDepth);

		// Clink layer: subtle high-frequency
		const clinkFilter = ctx.createBiquadFilter();
		clinkFilter.type = "bandpass";
		clinkFilter.frequency.value = 5000;
		clinkFilter.Q.value = 3;
		clinkFilter.connect(output);
		this.trackNode(clinkFilter);

		const clinkGain = ctx.createGain();
		clinkGain.gain.value = 0.03;
		clinkGain.connect(clinkFilter);
		this.trackNode(clinkGain);

		this.createLoopingSource(ctx, clinkGain);

		const clinkLfo = this.createOsc(ctx, "sine", 0.05);
		const clinkDepth = ctx.createGain();
		clinkDepth.gain.value = 0.025;
		clinkLfo.connect(clinkDepth);
		clinkDepth.connect(clinkGain.gain);
		this.trackNode(clinkDepth);
	}

	private buildWind(ctx: AudioContext, output: GainNode) {
		// Bandpass with slow frequency sweep (howling)
		const bandpass = ctx.createBiquadFilter();
		bandpass.type = "bandpass";
		bandpass.frequency.value = 400;
		bandpass.Q.value = 1.0;
		bandpass.connect(output);
		this.trackNode(bandpass);

		const windGain = ctx.createGain();
		windGain.gain.value = 0.65;
		windGain.connect(bandpass);
		this.trackNode(windGain);

		this.createLoopingSource(ctx, windGain);

		// Frequency sweep
		const sweepOsc = this.createOsc(ctx, "sine", 0.05);
		const sweepDepth = ctx.createGain();
		sweepDepth.gain.value = 200;
		sweepOsc.connect(sweepDepth);
		sweepDepth.connect(bandpass.frequency);
		this.trackNode(sweepDepth);

		// Amplitude modulation
		const ampLfo = this.createOsc(ctx, "sine", 0.07);
		const ampDepth = ctx.createGain();
		ampDepth.gain.value = 0.2;
		ampLfo.connect(ampDepth);
		ampDepth.connect(windGain.gain);
		this.trackNode(ampDepth);
	}

	private buildBrownNoise(ctx: AudioContext, output: GainNode) {
		// Brown noise: deeper and softer than white noise
		const lowpass = ctx.createBiquadFilter();
		lowpass.type = "lowpass";
		lowpass.frequency.value = 500;
		lowpass.connect(output);
		this.trackNode(lowpass);

		this.createLoopingSource(ctx, lowpass, true); // use brown noise buffer

		// Subtle warmth variation
		const warmthLfo = this.createOsc(ctx, "sine", 0.03);
		const warmthDepth = ctx.createGain();
		warmthDepth.gain.value = 100;
		warmthLfo.connect(warmthDepth);
		warmthDepth.connect(lowpass.frequency);
		this.trackNode(warmthDepth);
	}

	private buildStream(ctx: AudioContext, output: GainNode) {
		// Higher-frequency babbling
		const babbleFilter = ctx.createBiquadFilter();
		babbleFilter.type = "bandpass";
		babbleFilter.frequency.value = 2500;
		babbleFilter.Q.value = 0.8;
		babbleFilter.connect(output);
		this.trackNode(babbleFilter);

		const babbleGain = ctx.createGain();
		babbleGain.gain.value = 0.4;
		babbleGain.connect(babbleFilter);
		this.trackNode(babbleGain);

		this.createLoopingSource(ctx, babbleGain);

		// Rapid babble modulation
		const babbleLfo = this.createOsc(ctx, "sine", 1.5);
		const babbleDepth = ctx.createGain();
		babbleDepth.gain.value = 0.2;
		babbleLfo.connect(babbleDepth);
		babbleDepth.connect(babbleGain.gain);
		this.trackNode(babbleDepth);

		// Low water rumble
		const waterFilter = ctx.createBiquadFilter();
		waterFilter.type = "lowpass";
		waterFilter.frequency.value = 600;
		waterFilter.connect(output);
		this.trackNode(waterFilter);

		const waterGain = ctx.createGain();
		waterGain.gain.value = 0.25;
		waterGain.connect(waterFilter);
		this.trackNode(waterGain);

		this.createLoopingSource(ctx, waterGain);

		// Slow water flow variation
		const waterLfo = this.createOsc(ctx, "sine", 0.12);
		const waterDepth = ctx.createGain();
		waterDepth.gain.value = 0.1;
		waterLfo.connect(waterDepth);
		waterDepth.connect(waterGain.gain);
		this.trackNode(waterDepth);
	}

	private buildSummer(ctx: AudioContext, output: GainNode) {
		// Soft night breeze (like forest wind but softer)
		const windFilter = ctx.createBiquadFilter();
		windFilter.type = "lowpass";
		windFilter.frequency.value = 250;
		windFilter.connect(output);
		this.trackNode(windFilter);

		const windGain = ctx.createGain();
		windGain.gain.value = 0.15;
		windGain.connect(windFilter);
		this.trackNode(windGain);

		this.createLoopingSource(ctx, windGain);

		// Cricket chirps: high frequency pulses
		const cricketFilter = ctx.createBiquadFilter();
		cricketFilter.type = "bandpass";
		cricketFilter.frequency.value = 4500;
		cricketFilter.Q.value = 10;
		cricketFilter.connect(output);
		this.trackNode(cricketFilter);

		const cricketGain = ctx.createGain();
		cricketGain.gain.value = 0.05;
		cricketGain.connect(cricketFilter);
		this.trackNode(cricketGain);

		this.createLoopingSource(ctx, cricketGain);

		// Rapid cricket chirp modulation
		const cricketLfo = this.createOsc(ctx, "square", 12);
		const cricketDepth = ctx.createGain();
		cricketDepth.gain.value = 0.04;
		cricketLfo.connect(cricketDepth);
		cricketDepth.connect(cricketGain.gain);
		this.trackNode(cricketDepth);

		// Slow irregular wave for cricket intensity
		const waveLfo = this.createOsc(ctx, "sine", 0.1);
		const waveDepth = ctx.createGain();
		waveDepth.gain.value = 0.02;
		waveLfo.connect(waveDepth);
		waveDepth.connect(cricketGain.gain);
		this.trackNode(waveDepth);
	}

	private buildLibrary(ctx: AudioContext, output: GainNode) {
		// Foundation: very soft brown noise
		const brownFilter = ctx.createBiquadFilter();
		brownFilter.type = "lowpass";
		brownFilter.frequency.value = 400;
		brownFilter.connect(output);
		this.trackNode(brownFilter);

		const brownGain = ctx.createGain();
		brownGain.gain.value = 0.08;
		brownGain.connect(brownFilter);
		this.trackNode(brownGain);

		this.createLoopingSource(ctx, brownGain, true);

		// Paper rustle layer: bandpass filtered noise peaks
		const paperFilter = ctx.createBiquadFilter();
		paperFilter.type = "bandpass";
		paperFilter.frequency.value = 1200;
		paperFilter.Q.value = 1.0;
		paperFilter.connect(output);
		this.trackNode(paperFilter);

		const paperGain = ctx.createGain();
		paperGain.gain.value = 0.02;
		paperGain.connect(paperFilter);
		this.trackNode(paperGain);

		this.createLoopingSource(ctx, paperGain);

		// Paper rustle LFO: slow irregular sweeps
		const paperLfo = this.createOsc(ctx, "sine", 0.05);
		const paperDepth = ctx.createGain();
		paperDepth.gain.value = 0.03;
		paperLfo.connect(paperDepth);
		paperDepth.connect(paperGain.gain);
		this.trackNode(paperDepth);

		// Subtle room tone echo / resonance
		const roomFilter = ctx.createBiquadFilter();
		roomFilter.type = "peaking";
		roomFilter.frequency.value = 150;
		roomFilter.Q.value = 2;
		roomFilter.gain.value = 5;
		roomFilter.connect(output);
		this.trackNode(roomFilter);
		this.createLoopingSource(ctx, roomFilter, true);
	}

	private buildConcentration(ctx: AudioContext, output: GainNode) {
		// Alpha wave binaural beats (approx 10Hz difference)
		const merger = ctx.createChannelMerger(2);
		merger.connect(output);
		this.trackNode(merger);

		// Left: 200Hz
		const oscL = ctx.createOscillator();
		oscL.type = "sine";
		oscL.frequency.value = 200;
		const gainL = ctx.createGain();
		gainL.gain.value = 0.5;
		oscL.connect(gainL);
		gainL.connect(merger, 0, 0);
		oscL.start();
		this.oscillators.push(oscL);
		this.trackNode(gainL);

		// Right: 210Hz (resulting in 10Hz beat)
		const oscR = ctx.createOscillator();
		oscR.type = "sine";
		oscR.frequency.value = 210;
		const gainR = ctx.createGain();
		gainR.gain.value = 0.5;
		oscR.connect(gainR);
		gainR.connect(merger, 0, 1);
		oscR.start();
		this.oscillators.push(oscR);
		this.trackNode(gainR);

		// Deep sub-hum for grounding
		const subFilter = ctx.createBiquadFilter();
		subFilter.type = "lowpass";
		subFilter.frequency.value = 60;
		subFilter.connect(output);
		this.trackNode(subFilter);
		this.createLoopingSource(ctx, subFilter, true);
	}

	private buildTrain(ctx: AudioContext, output: GainNode) {
		// Constant deep rumble
		const rumbleFilter = ctx.createBiquadFilter();
		rumbleFilter.type = "lowpass";
		rumbleFilter.frequency.value = 150;
		rumbleFilter.connect(output);
		this.trackNode(rumbleFilter);
		this.createLoopingSource(ctx, rumbleFilter, true);

		// Periodic tracks clack-clack (rhythmic pulses)
		const tracksGain = ctx.createGain();
		tracksGain.gain.value = 0.05;
		tracksGain.connect(output);
		this.trackNode(tracksGain);

		// Clack modulation: double pulse every ~2 seconds
		const clackSource = this.createLoopingSource(ctx, tracksGain);
		const clackFilter = ctx.createBiquadFilter();
		clackFilter.type = "bandpass";
		clackFilter.frequency.value = 800;
		clackSource.disconnect();
		clackSource.connect(clackFilter);
		clackFilter.connect(tracksGain);
		this.trackNode(clackFilter);

		// Slow irregular wave for track sound
		const clackLfo = this.createOsc(ctx, "sine", 0.5); // 0.5Hz = 2s
		const clackDepth = ctx.createGain();
		clackDepth.gain.value = 0.04;
		clackLfo.connect(clackDepth);
		clackDepth.connect(tracksGain.gain);
		this.trackNode(clackDepth);
	}

	private buildStorm(ctx: AudioContext, output: GainNode) {
		// Heavy rain foundation
		this.buildRain(ctx, output);
		
		// Add lower frequency layer
		const heavyFilter = ctx.createBiquadFilter();
		heavyFilter.type = "lowpass";
		heavyFilter.frequency.value = 400;
		heavyFilter.connect(output);
		this.trackNode(heavyFilter);
		this.createLoopingSource(ctx, heavyFilter, true);

		// Thunder: occasional very low frequency noise bursts
		const thunderGain = ctx.createGain();
		thunderGain.gain.value = 0;
		thunderGain.connect(output);
		this.trackNode(thunderGain);

		const thunderFilter = ctx.createBiquadFilter();
		thunderFilter.type = "lowpass";
		thunderFilter.frequency.value = 80;
		thunderFilter.connect(thunderGain);
		this.trackNode(thunderFilter);

		this.createLoopingSource(ctx, thunderFilter, true);

		// Random thunder trigger
		const triggerThunder = () => {
			if (!this.isPlaying || this.currentSound !== "storm") return;
			const now = ctx.currentTime;
			thunderGain.gain.cancelScheduledValues(now);
			thunderGain.gain.setValueAtTime(0, now);
			thunderGain.gain.linearRampToValueAtTime(0.4, now + 2);
			thunderGain.gain.linearRampToValueAtTime(0, now + 7);
			
			window.setTimeout(triggerThunder, 15000 + Math.random() * 20000);
		};
		window.setTimeout(triggerThunder, 5000);
	}

	private buildZen(ctx: AudioContext, output: GainNode) {
		// Soft air background
		const airFilter = ctx.createBiquadFilter();
		airFilter.type = "lowpass";
		airFilter.frequency.value = 1000;
		airFilter.connect(output);
		this.trackNode(airFilter);

		const airGain = ctx.createGain();
		airGain.gain.value = 0.05;
		airGain.connect(airFilter);
		this.trackNode(airGain);
		this.createLoopingSource(ctx, airGain);

		// Singing bowl: Pure sine harmonic
		const triggerBowl = () => {
			if (!this.isPlaying || this.currentSound !== "zen") return;
			const now = ctx.currentTime;
			
			const osc = ctx.createOscillator();
			osc.type = "sine";
			osc.frequency.value = 164.81; // E3
			
			const bowlGain = ctx.createGain();
			bowlGain.gain.setValueAtTime(0, now);
			bowlGain.gain.linearRampToValueAtTime(0.15, now + 0.1);
			bowlGain.gain.exponentialRampToValueAtTime(0.001, now + 10);
			
			osc.connect(bowlGain);
			bowlGain.connect(output);
			osc.start();
			osc.stop(now + 10);
			
			window.setTimeout(triggerBowl, 12000 + Math.random() * 5000);
		};
		window.setTimeout(triggerBowl, 1000);
	}
}
