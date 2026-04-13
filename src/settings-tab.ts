import { App, PluginSettingTab, Setting } from "obsidian";
import type TaskPomodoroPlugin from "./main";
import { t, AVAILABLE_LOCALES } from "./i18n";

export class TaskPomodoroSettingTab extends PluginSettingTab {
	plugin: TaskPomodoroPlugin;

	constructor(app: App, plugin: TaskPomodoroPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName(t("SETTINGS_HEADING")).setHeading();

		// === Language ===
		new Setting(containerEl)
			.setName(t("SETTINGS_LANGUAGE"))
			.setDesc("Plugin interface language / 插件界面语言")
			.addDropdown((dropdown) => {
				for (const loc of AVAILABLE_LOCALES) {
					dropdown.addOption(loc.value, loc.label);
				}
				dropdown
					.setValue(this.plugin.settings.language)
					.onChange(async (value) => {
						this.plugin.settings.language = value;
						await this.plugin.saveSettings();
						this.display(); // Re-render settings in new language
					});
			});

		// === Timer Settings ===
		new Setting(containerEl).setName(t("SETTINGS_TIMER")).setHeading();

		new Setting(containerEl)
			.setName(t("WORK_DURATION_NAME"))
			.setDesc(t("WORK_DURATION_DESC"))
			.addText((text) =>
				text
					.setValue(this.plugin.settings.workMinutes.toString())
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.workMinutes = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName(t("SHORT_BREAK_NAME"))
			.setDesc(t("SHORT_BREAK_DESC"))
			.addText((text) =>
				text
					.setValue(this.plugin.settings.shortBreakMinutes.toString())
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.shortBreakMinutes = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName(t("LONG_BREAK_NAME"))
			.setDesc(t("LONG_BREAK_DESC"))
			.addText((text) =>
				text
					.setValue(this.plugin.settings.longBreakMinutes.toString())
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.longBreakMinutes = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName(t("LONG_BREAK_INTERVAL_NAME"))
			.setDesc(t("LONG_BREAK_INTERVAL_DESC"))
			.addText((text) =>
				text
					.setValue(this.plugin.settings.intervalsBeforeLongBreak.toString())
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.intervalsBeforeLongBreak = num;
							await this.plugin.saveSettings();
						}
					})
			);

		// === Behavior Settings ===
		new Setting(containerEl).setName(t("SETTINGS_BEHAVIOR")).setHeading();

		new Setting(containerEl)
			.setName(t("AUTO_START_BREAK_NAME"))
			.setDesc(t("AUTO_START_BREAK_DESC"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoStartBreak)
					.onChange(async (value) => {
						this.plugin.settings.autoStartBreak = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t("AUTO_PROGRESS_NAME"))
			.setDesc(t("AUTO_PROGRESS_DESC"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoProgressEnabled)
					.onChange(async (value) => {
						this.plugin.settings.autoProgressEnabled = value;
						if (value) {
							this.plugin.settings.persistentNotification = false;
						}
						await this.plugin.saveSettings();
						this.display();
					})
			);

		new Setting(containerEl)
			.setName(t("PERSISTENT_NOTIFICATION_NAME"))
			.setDesc(t("PERSISTENT_NOTIFICATION_DESC"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.persistentNotification)
					.onChange(async (value) => {
						this.plugin.settings.persistentNotification = value;
						if (value) {
							this.plugin.settings.autoProgressEnabled = false;
						}
						await this.plugin.saveSettings();
						this.display();
					})
			);

		// === Display Settings ===
		new Setting(containerEl).setName(t("SETTINGS_DISPLAY")).setHeading();

		new Setting(containerEl)
			.setName(t("POMODORO_EMOJI_NAME"))
			.setDesc(t("POMODORO_EMOJI_DESC"))
			.addText((text) =>
				text
					.setValue(this.plugin.settings.pomodoroEmoji)
					.onChange(async (value) => {
						if (value.trim()) {
							this.plugin.settings.pomodoroEmoji = value.trim();
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName(t("STATUS_BAR_NAME"))
			.setDesc(t("STATUS_BAR_DESC"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showInStatusBar)
					.onChange(async (value) => {
						this.plugin.settings.showInStatusBar = value;
						await this.plugin.saveSettings();
					})
			);

		// === Sound Settings ===
		new Setting(containerEl).setName(t("SETTINGS_SOUND")).setHeading();

		new Setting(containerEl)
			.setName(t("SOUND_ENABLED_NAME"))
			.setDesc(t("SOUND_ENABLED_DESC"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.soundEnabled)
					.onChange(async (value) => {
						this.plugin.settings.soundEnabled = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.soundEnabled) {
			new Setting(containerEl)
				.setName(t("SOUND_SELECT_NAME"))
				.setDesc(t("SOUND_SELECT_DESC"))
				.addDropdown((dropdown) => {
					const sounds = this.plugin.soundManager.getBuiltInSounds();
					for (const key of sounds) {
						dropdown.addOption(key, key.charAt(0).toUpperCase() + key.slice(1));
					}
					dropdown.addOption("custom", "Custom...");
					dropdown
						.setValue(this.plugin.settings.selectedSound)
						.onChange(async (value) => {
							this.plugin.settings.selectedSound = value;
							await this.plugin.saveSettings();
							this.display();
						});
				})
				.addButton((button) =>
					button
						.setButtonText(t("SOUND_PREVIEW"))
						.onClick(() => {
							this.plugin.soundManager.play();
						})
				);

			if (this.plugin.settings.selectedSound === "custom") {
				new Setting(containerEl)
					.setName(t("SOUND_CUSTOM_NAME"))
					.setDesc(t("SOUND_CUSTOM_DESC"))
					.addText((text) =>
						text
							.setPlaceholder(t("SOUND_CUSTOM_PLACEHOLDER"))
							.setValue(this.plugin.settings.customSoundUrl)
							.onChange(async (value) => {
								this.plugin.settings.customSoundUrl = value;
								await this.plugin.saveSettings();
							})
					)
					.addButton((button) =>
						button
							.setButtonText(t("SOUND_PREVIEW"))
							.onClick(() => {
								this.plugin.soundManager.play();
							})
					);
			}

			new Setting(containerEl)
				.setName(t("SOUND_VOLUME_NAME"))
				.setDesc(t("SOUND_VOLUME_DESC"))
				.addSlider((slider) =>
					slider
						.setLimits(0, 1, 0.1)
						.setValue(this.plugin.settings.soundVolume)
						.setDynamicTooltip()
						.onChange(async (value) => {
							this.plugin.settings.soundVolume = value;
							await this.plugin.saveSettings();
						})
				)
				.addButton((button) =>
					button
						.setButtonText(t("SOUND_TEST"))
						.onClick(() => {
							this.plugin.soundManager.play();
						})
				);
		}

		// === Ambient Settings ===
		new Setting(containerEl).setName(t("SETTINGS_AMBIENT")).setHeading();

		new Setting(containerEl)
			.setName(t("AMBIENT_ENABLED_NAME"))
			.setDesc(t("AMBIENT_ENABLED_DESC"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.ambientEnabled)
					.onChange(async (value) => {
						this.plugin.settings.ambientEnabled = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.ambientEnabled) {
			new Setting(containerEl)
				.setName(t("AMBIENT_SELECT_NAME"))
				.setDesc(t("AMBIENT_SELECT_DESC"))
				.addDropdown((dropdown) => {
					const soundscapes = this.plugin.ambientManager.getSoundscapeKeys();
					for (const key of soundscapes) {
						const label = this.plugin.ambientManager.getSoundscapeLabel(key);
						dropdown.addOption(key, label);
					}
					dropdown
						.setValue(this.plugin.settings.ambientSound)
						.onChange(async (value) => {
							this.plugin.settings.ambientSound = value;
							await this.plugin.saveSettings();
							// If currently previewing, switch sound immediately
							const am = this.plugin.ambientManager;
							if (am.getIsPlaying()) {
								am.play(value as any);
							}
						});
				})
				.addButton((button) =>
					button
						.setButtonText(t("AMBIENT_PREVIEW"))
						.onClick(() => {
							const am = this.plugin.ambientManager;
							if (am.getIsPlaying()) {
								am.stop();
								button.setButtonText(t("AMBIENT_PREVIEW"));
							} else {
								am.play(this.plugin.settings.ambientSound as any);
								button.setButtonText(t("AMBIENT_STOP"));
							}
						})
				);

			new Setting(containerEl)
				.setName(t("AMBIENT_VOLUME_NAME"))
				.setDesc(t("AMBIENT_VOLUME_DESC"))
				.addSlider((slider) =>
					slider
						.setLimits(0, 1, 0.05)
						.setValue(this.plugin.settings.ambientVolume)
						.setDynamicTooltip()
						.onChange(async (value) => {
							this.plugin.settings.ambientVolume = value;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName(t("AMBIENT_AUTOPLAY_NAME"))
				.setDesc(t("AMBIENT_AUTOPLAY_DESC"))
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.ambientAutoPlay)
						.onChange(async (value) => {
							this.plugin.settings.ambientAutoPlay = value;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName(t("AMBIENT_PLAY_ON_BREAK_NAME"))
				.setDesc(t("AMBIENT_PLAY_ON_BREAK_DESC"))
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.ambientPlayOnBreak)
						.onChange(async (value) => {
							this.plugin.settings.ambientPlayOnBreak = value;
							await this.plugin.saveSettings();
						})
				);
		}

		// === Reset ===
		new Setting(containerEl).setName(t("SETTINGS_RESET")).setHeading();

		new Setting(containerEl)
			.setName(t("RESET_SESSION_NAME"))
			.setDesc(t("RESET_SESSION_DESC"))
			.addButton((button) =>
				button
					.setButtonText(t("RESET_BUTTON"))
					.setWarning()
					.onClick(() => {
						this.plugin.resetSession();
					})
			);
	}

	hide() {
		// Stop any ambient preview when the settings tab is closed
		if (this.plugin.ambientManager.getIsPlaying()) {
			this.plugin.ambientManager.stop();
		}
		super.hide();
	}
}
