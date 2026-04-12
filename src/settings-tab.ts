import { App, PluginSettingTab, Setting } from "obsidian";
import type TaskPomodoroPlugin from "./main";

export class TaskPomodoroSettingTab extends PluginSettingTab {
	plugin: TaskPomodoroPlugin;

	constructor(app: App, plugin: TaskPomodoroPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Task Pomodoro").setHeading();

		// === Timer Settings ===
		new Setting(containerEl).setName("计时设置").setHeading();

		new Setting(containerEl)
			.setName("工作时长（分钟）")
			.setDesc("每个番茄钟的工作时长")
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
			.setName("短休息时长（分钟）")
			.setDesc("番茄钟后的短休息时长")
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
			.setName("长休息时长（分钟）")
			.setDesc("连续完成多个番茄钟后的长休息时长")
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
			.setName("长休息间隔")
			.setDesc("连续完成多少个番茄钟后触发长休息")
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
		new Setting(containerEl).setName("行为设置").setHeading();

		new Setting(containerEl)
			.setName("自动开始休息")
			.setDesc("番茄钟完成后自动开始休息倒计时")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoStartBreak)
					.onChange(async (value) => {
						this.plugin.settings.autoStartBreak = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("自动进行")
			.setDesc("休息结束后自动开始下一个番茄钟")
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
			.setName("持续提醒")
			.setDesc("番茄钟完成后持续提醒直到你手动操作（与自动进行互斥）")
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
		new Setting(containerEl).setName("显示设置").setHeading();

		new Setting(containerEl)
			.setName("番茄钟 Emoji")
			.setDesc("用于标记完成番茄钟的符号")
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
			.setName("在状态栏显示")
			.setDesc("当有任务正在计时时，在状态栏显示当前计时状态")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showInStatusBar)
					.onChange(async (value) => {
						this.plugin.settings.showInStatusBar = value;
						await this.plugin.saveSettings();
					})
			);

		// === Sound Settings ===
		new Setting(containerEl).setName("音效设置").setHeading();

		new Setting(containerEl)
			.setName("音效提醒")
			.setDesc("番茄钟完成时播放提示音")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.soundEnabled)
					.onChange(async (value) => {
						this.plugin.settings.soundEnabled = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("音效音量")
			.setDesc("调整提示音的音量")
			.addSlider((slider) =>
				slider
					.setLimits(0, 1, 0.1)
					.setValue(this.plugin.settings.soundVolume)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.soundVolume = value;
						await this.plugin.saveSettings();
					})
			);

		// === Reset ===
		new Setting(containerEl).setName("重置").setHeading();

		new Setting(containerEl)
			.setName("重置番茄钟会话")
			.setDesc("重置所有计时器和工作间隔计数")
			.addButton((button) =>
				button
					.setButtonText("重置")
					.setWarning()
					.onClick(() => {
						this.plugin.resetSession();
					})
			);
	}
}
