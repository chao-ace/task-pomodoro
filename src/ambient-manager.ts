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
	"whitenoise", "rain", "fire", "forest", "ocean", "cafe", "wind", "brownnoise", "stream", "summer", "library", "alpha", "beta", "gamma", "train", "storm", "zen",
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
	alpha:      { en: "Focus Beats (Alpha)", zh: "心流模式 (Alpha波)" },
	beta:       { en: "Deep Work (Beta)",    zh: "深度专注 (Beta波)" },
	gamma:      { en: "Peak Performance (Gamma)", zh: "极速处理 (Gamma波)" },
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

		// If disabled and playing, stop immediately
		if (!this.settings.ambientEnabled && this.isPlaying) {
			this.stop();
		}

		if (this.masterGain && this.settings.ambientEnabled) {
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
		if (!this.settings.ambientEnabled) return;
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
			case "alpha":
				this.buildConcentration(ctx, gain, 10, 200); // 10Hz Alpha
				break;
			case "beta":
				this.buildConcentration(ctx, gain, 20, 250); // 20Hz Beta
				break;
			case "gamma":
				this.buildConcentration(ctx, gain, 40, 300); // 40Hz Gamma
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
	// ========================================
	// Soundscape generators
	// ========================================

	private buildWhiteNoise(ctx: AudioContext, output: GainNode) {
		// Softer white noise (pink-ish filtering)
		const filter = ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = 4000;
		filter.connect(output);
		this.trackNode(filter);

		this.createLoopingSource(ctx, filter);
	}

	private buildRain(ctx: AudioContext, output: GainNode) {
		// 1. High-frequency pitter-patter (raindrops on surface)
		const patterFilter = ctx.createBiquadFilter();
		patterFilter.type = "bandpass";
		patterFilter.frequency.value = 5500;
		patterFilter.Q.value = 1.0;
		patterFilter.connect(output);
		this.trackNode(patterFilter);

		const patterGain = ctx.createGain();
		patterGain.gain.value = 0.12;
		patterGain.connect(patterFilter);
		this.trackNode(patterGain);

		this.createLoopingSource(ctx, patterGain);

		// Patter modulation (small variation)
		const patterLfo = this.createOsc(ctx, "sine", 2.0);
		const patterDepth = ctx.createGain();
		patterDepth.gain.value = 0.04;
		patterLfo.connect(patterDepth);
		patterDepth.connect(patterGain.gain);
		this.trackNode(patterDepth);

		// 2. Mid-frequency wash (distant rain)
		const washFilter = ctx.createBiquadFilter();
		washFilter.type = "bandpass";
		washFilter.frequency.value = 1800;
		washFilter.Q.value = 0.4;
		washFilter.connect(output);
		this.trackNode(washFilter);

		const washGain = ctx.createGain();
		washGain.gain.value = 0.45;
		washGain.connect(washFilter);
		this.trackNode(washGain);

		this.createLoopingSource(ctx, washGain, true); // use brown noise for warmer wash

		// 3. Low-frequency rumble (roof resonance)
		const rumbleFilter = ctx.createBiquadFilter();
		rumbleFilter.type = "lowpass";
		rumbleFilter.frequency.value = 400;
		rumbleFilter.connect(output);
		this.trackNode(rumbleFilter);

		const rumbleGain = ctx.createGain();
		rumbleGain.gain.value = 0.2;
		rumbleGain.connect(rumbleFilter);
		this.trackNode(rumbleGain);

		this.createLoopingSource(ctx, rumbleGain, true);
	}

	private buildFire(ctx: AudioContext, output: GainNode) {
		// 1. Deep rumble (the 'roar' of the flame)
		const roarFilter = ctx.createBiquadFilter();
		roarFilter.type = "lowpass";
		roarFilter.frequency.value = 250;
		roarFilter.connect(output);
		this.trackNode(roarFilter);

		const roarGain = ctx.createGain();
		roarGain.gain.value = 0.35;
		roarGain.connect(roarFilter);
		this.trackNode(roarGain);
		this.createLoopingSource(ctx, roarGain, true);

		// Roar modulation (slow intensity waves)
		const roarLfo = this.createOsc(ctx, "sine", 0.1);
		const roarDepth = ctx.createGain();
		roarDepth.gain.value = 0.1;
		roarLfo.connect(roarDepth);
		roarDepth.connect(roarGain.gain);
		this.trackNode(roarDepth);

		// 2. Crackling (irregular pops)
		const crackleTrigger = () => {
			if (!this.isPlaying || this.currentSound !== "fire") return;
			const now = ctx.currentTime;
			
			const osc = ctx.createOscillator();
			osc.type = "sawtooth";
			osc.frequency.value = 100 + Math.random() * 400;
			
			const bandpass = ctx.createBiquadFilter();
			bandpass.type = "bandpass";
			bandpass.frequency.value = 2000 + Math.random() * 3000;
			bandpass.Q.value = 5;
			
			const popGain = ctx.createGain();
			popGain.gain.setValueAtTime(0, now);
			popGain.gain.linearRampToValueAtTime(0.1 + Math.random() * 0.2, now + 0.002);
			popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
			
			osc.connect(bandpass);
			bandpass.connect(popGain);
			popGain.connect(output);
			
			osc.start(now);
			osc.stop(now + 0.1);
			this.trackNode(bandpass);
			this.trackNode(popGain);
			
			window.setTimeout(crackleTrigger, 50 + Math.random() * 800);
		};
		window.setTimeout(crackleTrigger, 200);

		// 3. Hissing (escaping gas)
		const hissFilter = ctx.createBiquadFilter();
		hissFilter.type = "highpass";
		hissFilter.frequency.value = 4500;
		hissFilter.connect(output);
		this.trackNode(hissFilter);

		const hissGain = ctx.createGain();
		hissGain.gain.value = 0.06;
		hissGain.connect(hissFilter);
		this.trackNode(hissGain);
		this.createLoopingSource(ctx, hissGain);
	}

	private buildForest(ctx: AudioContext, output: GainNode) {
		// 1. Bird chirps (rhythmic but natural pulses)
		const birdTrigger = () => {
			if (!this.isPlaying || this.currentSound !== "forest") return;
			const now = ctx.currentTime;
			
			const count = 1 + Math.floor(Math.random() * 3);
			for (let i = 0; i < count; i++) {
				const start = now + i * 0.15;
				const osc = ctx.createOscillator();
				osc.type = "sine";
				osc.frequency.setValueAtTime(3000 + Math.random() * 2000, start);
				osc.frequency.exponentialRampToValueAtTime(1000 + Math.random() * 1000, start + 0.1);
				
				const g = ctx.createGain();
				g.gain.setValueAtTime(0, start);
				g.gain.linearRampToValueAtTime(0.05, start + 0.01);
				g.gain.exponentialRampToValueAtTime(0.001, start + 0.1);
				
				osc.connect(g);
				g.connect(output);
				osc.start(start);
				osc.stop(start + 0.15);
				this.trackNode(g);
			}

			window.setTimeout(birdTrigger, 3000 + Math.random() * 8000);
		};
		window.setTimeout(birdTrigger, 2000);

		// 2. Distant wind/leaves
		const windFilter = ctx.createBiquadFilter();
		windFilter.type = "lowpass";
		windFilter.frequency.value = 400;
		windFilter.connect(output);
		this.trackNode(windFilter);

		const windGain = ctx.createGain();
		windGain.gain.value = 0.2;
		windGain.connect(windFilter);
		this.trackNode(windGain);
		this.createLoopingSource(ctx, windGain, true);
	}

	private buildOcean(ctx: AudioContext, output: GainNode) {
		// 1. Distant roar (foundation)
		const roarFilter = ctx.createBiquadFilter();
		roarFilter.type = "lowpass";
		roarFilter.frequency.value = 600;
		roarFilter.connect(output);
		this.trackNode(roarFilter);

		const roarGain = ctx.createGain();
		roarGain.gain.value = 0.4;
		roarGain.connect(roarFilter);
		this.trackNode(roarGain);
		this.createLoopingSource(ctx, roarGain, true);

		// 2. The main wave (wash in/out)
		const waveFilter = ctx.createBiquadFilter();
		waveFilter.type = "bandpass";
		waveFilter.frequency.value = 1000;
		waveFilter.Q.value = 0.5;
		waveFilter.connect(output);
		this.trackNode(waveFilter);

		const waveGain = ctx.createGain();
		waveGain.gain.value = 0;
		waveGain.connect(waveFilter);
		this.trackNode(waveGain);
		this.createLoopingSource(ctx, waveGain, true);

		// 3. Foam / Hisss (high frequency peak of the wave)
		const foamGain = ctx.createGain();
		foamGain.gain.value = 0;
		const foamFilter = ctx.createBiquadFilter();
		foamFilter.type = "highpass";
		foamFilter.frequency.value = 4000;
		foamFilter.connect(output);
		foamGain.connect(foamFilter);
		this.trackNode(foamGain);
		this.trackNode(foamFilter);
		this.createLoopingSource(ctx, foamGain);

		// Wave cycle controller
		const triggerWave = () => {
			if (!this.isPlaying || this.currentSound !== "ocean") return;
			const now = ctx.currentTime;
			const duration = 10 + Math.random() * 5; // 10-15 seconds per wave
			
			waveGain.gain.cancelScheduledValues(now);
			waveGain.gain.setValueAtTime(0, now);
			waveGain.gain.linearRampToValueAtTime(0.6, now + duration * 0.3);
			waveGain.gain.linearRampToValueAtTime(0, now + duration);

			foamGain.gain.cancelScheduledValues(now);
			foamGain.gain.setValueAtTime(0, now);
			foamGain.gain.linearRampToValueAtTime(0.08, now + duration * 0.35);
			foamGain.gain.linearRampToValueAtTime(0, now + duration * 0.8);

			window.setTimeout(triggerWave, duration * 1000 - 500);
		};
		window.setTimeout(triggerWave, 100);
	}

	private buildCafe(ctx: AudioContext, output: GainNode) {
		// 1. Mid-range murmur (crowd atmosphere)
		const murmurFilter = ctx.createBiquadFilter();
		murmurFilter.type = "bandpass";
		murmurFilter.frequency.value = 1200;
		murmurFilter.Q.value = 0.4;
		murmurFilter.connect(output);
		this.trackNode(murmurFilter);

		const murmurGain = ctx.createGain();
		murmurGain.gain.value = 0.5;
		murmurGain.connect(murmurFilter);
		this.trackNode(murmurGain);
		this.createLoopingSource(ctx, murmurGain, true);

		// Distant clinks (cups/spoons)
		const clinkTrigger = () => {
			if (!this.isPlaying || this.currentSound !== "cafe") return;
			const now = ctx.currentTime;
			
			const filter = ctx.createBiquadFilter();
			filter.type = "bandpass";
			filter.frequency.value = 4000 + Math.random() * 3000;
			filter.Q.value = 10;
			
			const g = ctx.createGain();
			g.gain.setValueAtTime(0, now);
			g.gain.linearRampToValueAtTime(0.02 + Math.random() * 0.03, now + 0.005);
			g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
			
			const noise = ctx.createBufferSource();
			noise.buffer = this.getNoiseBuffer(ctx);
			noise.connect(filter);
			filter.connect(g);
			g.connect(output);
			noise.start(now);
			noise.stop(now + 0.2);
			this.trackNode(filter);
			this.trackNode(g);
			
			window.setTimeout(clinkTrigger, 2000 + Math.random() * 10000);
		};
		window.setTimeout(clinkTrigger, 3000);
	}

	private buildWind(ctx: AudioContext, output: GainNode) {
		// Howling but subtle wind
		const filter = ctx.createBiquadFilter();
		filter.type = "bandpass";
		filter.frequency.value = 400;
		filter.Q.value = 0.8;
		filter.connect(output);
		this.trackNode(filter);

		const gain = ctx.createGain();
		gain.gain.value = 0.4;
		gain.connect(filter);
		this.trackNode(gain);
		this.createLoopingSource(ctx, gain, true);

		// Frequency sweep for howling effect
		const lfo = this.createOsc(ctx, "sine", 0.05);
		const depth = ctx.createGain();
		depth.gain.value = 150;
		lfo.connect(depth);
		depth.connect(filter.frequency);
		this.trackNode(depth);
	}

	private buildBrownNoise(ctx: AudioContext, output: GainNode) {
		const filter = ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = 500;
		filter.connect(output);
		this.trackNode(filter);
		this.createLoopingSource(ctx, filter, true);
	}

	private buildStream(ctx: AudioContext, output: GainNode) {
		const highFilter = ctx.createBiquadFilter();
		highFilter.type = "bandpass";
		highFilter.frequency.value = 2500;
		highFilter.Q.value = 1;
		highFilter.connect(output);
		this.trackNode(highFilter);

		const highGain = ctx.createGain();
		highGain.gain.value = 0.3;
		highGain.connect(highFilter);
		this.trackNode(highGain);
		this.createLoopingSource(ctx, highGain);

		const lowFilter = ctx.createBiquadFilter();
		lowFilter.type = "lowpass";
		lowFilter.frequency.value = 600;
		lowFilter.connect(output);
		this.trackNode(lowFilter);

		const lowGain = ctx.createGain();
		lowGain.gain.value = 0.2;
		lowGain.connect(lowFilter);
		this.trackNode(lowGain);
		this.createLoopingSource(ctx, lowGain, true);
	}

	private buildSummer(ctx: AudioContext, output: GainNode) {
		// 1. Soft night breeze
		const breezeFilter = ctx.createBiquadFilter();
		breezeFilter.type = "lowpass";
		breezeFilter.frequency.value = 200;
		breezeFilter.connect(output);
		this.trackNode(breezeFilter);

		const breezeGain = ctx.createGain();
		breezeGain.gain.value = 0.12;
		breezeGain.connect(breezeFilter);
		this.trackNode(breezeGain);
		this.createLoopingSource(ctx, breezeGain, true);

		// 2. Cricket chirps (rhythmic but natural pulses)
		const cricketTrigger = () => {
			if (!this.isPlaying || this.currentSound !== "summer") return;
			const now = ctx.currentTime;
			
			const count = 3 + Math.floor(Math.random() * 3);
			for (let i = 0; i < count; i++) {
				const start = now + i * 0.1;
				const osc = ctx.createOscillator();
				osc.type = "sine";
				osc.frequency.value = 4500 + Math.random() * 200;
				
				const g = ctx.createGain();
				g.gain.setValueAtTime(0, start);
				g.gain.linearRampToValueAtTime(0.04 * (1 - i * 0.2), start + 0.01);
				g.gain.exponentialRampToValueAtTime(0.001, start + 0.04);
				
				osc.connect(g);
				g.connect(output);
				osc.start(start);
				osc.stop(start + 0.1);
				this.trackNode(g);
			}

			window.setTimeout(cricketTrigger, 2000 + Math.random() * 4000);
		};
		window.setTimeout(cricketTrigger, 1000);
	}

	private buildLibrary(ctx: AudioContext, output: GainNode) {
		// 1. Soft brown noise foundation
		const foundation = ctx.createGain();
		foundation.gain.value = 0.1;
		foundation.connect(output);
		this.trackNode(foundation);
		this.createLoopingSource(ctx, foundation, true);

		// 2. Distant page rustle
		const rustleTrigger = () => {
			if (!this.isPlaying || this.currentSound !== "library") return;
			const now = ctx.currentTime;
			
			const filter = ctx.createBiquadFilter();
			filter.type = "bandpass";
			filter.frequency.value = 1000 + Math.random() * 1000;
			filter.Q.value = 0.5;
			
			const g = ctx.createGain();
			g.gain.setValueAtTime(0, now);
			g.gain.linearRampToValueAtTime(0.01 + Math.random() * 0.02, now + 0.05);
			g.gain.linearRampToValueAtTime(0, now + 0.3);
			
			const noise = ctx.createBufferSource();
			noise.buffer = this.getNoiseBuffer(ctx);
			noise.connect(filter);
			filter.connect(g);
			g.connect(output);
			noise.start(now);
			noise.stop(now + 0.4);
			this.trackNode(filter);
			this.trackNode(g);
			
			window.setTimeout(rustleTrigger, 5000 + Math.random() * 15000);
		};
		window.setTimeout(rustleTrigger, 4000);
	}

	private buildConcentration(ctx: AudioContext, output: GainNode, beatFreq: number, carrierFreq: number) {
		const merger = ctx.createChannelMerger(2);
		merger.connect(output);
		this.trackNode(merger);

		// Left channel: carrier frequency
		const oscL = ctx.createOscillator();
		oscL.type = "sine";
		oscL.frequency.value = carrierFreq;
		
		const gainL = ctx.createGain();
		gainL.gain.value = 0.4;
		
		oscL.connect(gainL);
		gainL.connect(merger, 0, 0);
		oscL.start();
		this.oscillators.push(oscL);
		this.trackNode(gainL);

		// Right channel: carrier frequency + beat frequency
		const oscR = ctx.createOscillator();
		oscR.type = "sine";
		oscR.frequency.value = carrierFreq + beatFreq;
		
		const gainR = ctx.createGain();
		gainR.gain.value = 0.4;
		
		oscR.connect(gainR);
		gainR.connect(merger, 0, 1);
		oscR.start();
		this.oscillators.push(oscR);
		this.trackNode(gainR);

		// Soft brown noise masking (essential for research-grade focus audio)
		// This makes the binaural effect less fatiguing and more effective.
		const noiseFilter = ctx.createBiquadFilter();
		noiseFilter.type = "lowpass";
		noiseFilter.frequency.value = 400;
		noiseFilter.connect(output);
		this.trackNode(noiseFilter);

		const noiseGain = ctx.createGain();
		noiseGain.gain.value = 0.15;
		noiseGain.connect(noiseFilter);
		this.trackNode(noiseGain);
		this.createLoopingSource(ctx, noiseGain, true);
	}

	private buildTrain(ctx: AudioContext, output: GainNode) {
		const rumbleFilter = ctx.createBiquadFilter();
		rumbleFilter.type = "lowpass";
		rumbleFilter.frequency.value = 120;
		rumbleFilter.connect(output);
		this.trackNode(rumbleFilter);
		this.createLoopingSource(ctx, rumbleFilter, true);

		const triggerClack = () => {
			if (!this.isPlaying || this.currentSound !== "train") return;
			const now = ctx.currentTime;
			const clacks = [0, 0.15];
			for (const offset of clacks) {
				const start = now + offset;
				const filter = ctx.createBiquadFilter();
				filter.type = "bandpass";
				filter.frequency.value = 700 + Math.random() * 100;
				filter.Q.value = 2;
				const g = ctx.createGain();
				g.gain.setValueAtTime(0, start);
				g.gain.linearRampToValueAtTime(offset === 0 ? 0.05 : 0.07, start + 0.01);
				g.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
				const noise = ctx.createBufferSource();
				noise.buffer = this.getNoiseBuffer(ctx);
				noise.connect(filter);
				filter.connect(g);
				g.connect(output);
				noise.start(start);
				noise.stop(start + 0.2);
				this.trackNode(filter);
				this.trackNode(g);
			}
			window.setTimeout(triggerClack, 1500 + Math.random() * 500);
		};
		window.setTimeout(triggerClack, 1000);
	}

	private buildStorm(ctx: AudioContext, output: GainNode) {
		this.buildRain(ctx, output);
		
		const thunderGain = ctx.createGain();
		thunderGain.gain.value = 0;
		thunderGain.connect(output);
		this.trackNode(thunderGain);

		const thunderFilter = ctx.createBiquadFilter();
		thunderFilter.type = "lowpass";
		thunderFilter.frequency.value = 60;
		thunderFilter.connect(thunderGain);
		this.trackNode(thunderFilter);
		this.createLoopingSource(ctx, thunderFilter, true);

		const triggerThunder = () => {
			if (!this.isPlaying || this.currentSound !== "storm") return;
			const now = ctx.currentTime;
			thunderGain.gain.cancelScheduledValues(now);
			thunderGain.gain.setValueAtTime(0, now);
			thunderGain.gain.linearRampToValueAtTime(0.4, now + 2);
			thunderGain.gain.linearRampToValueAtTime(0, now + 8);
			window.setTimeout(triggerThunder, 15000 + Math.random() * 20000);
		};
		window.setTimeout(triggerThunder, 5000);
	}

	private buildZen(ctx: AudioContext, output: GainNode) {
		const airFilter = ctx.createBiquadFilter();
		airFilter.type = "lowpass";
		airFilter.frequency.value = 800;
		airFilter.connect(output);
		this.trackNode(airFilter);

		const airGain = ctx.createGain();
		airGain.gain.value = 0.04;
		airGain.connect(airFilter);
		this.trackNode(airGain);
		this.createLoopingSource(ctx, airGain, true);

		const triggerBowl = () => {
			if (!this.isPlaying || this.currentSound !== "zen") return;
			const now = ctx.currentTime;
			const osc = ctx.createOscillator();
			osc.type = "sine";
			osc.frequency.value = 164.81; // E3
			const g = ctx.createGain();
			g.gain.setValueAtTime(0, now);
			g.gain.linearRampToValueAtTime(0.12, now + 0.1);
			g.gain.exponentialRampToValueAtTime(0.001, now + 12);
			osc.connect(g);
			g.connect(output);
			osc.start(now);
			osc.stop(now + 12);
			window.setTimeout(triggerBowl, 15000 + Math.random() * 10000);
		};
		window.setTimeout(triggerBowl, 1000);
	}
}
