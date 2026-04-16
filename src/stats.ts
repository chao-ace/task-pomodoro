import { App, TFile, MarkdownView } from "obsidian";

const STATS_HEADING = "## 📊 番茄统计";

const DAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];

/** Check if a filename follows the weekly note pattern: `XXX-2026-16周.md` */
export function isWeeklyNote(filename: string): boolean {
	return /-\d{4}-\d{1,2}周\.md$/.test(filename);
}

/** Extract year and week number from weekly note filename */
function extractWeekInfo(filename: string): { year: number; week: number } {
	const match = filename.match(/-(\d{4})-(\d{1,2})周\.md$/);
	if (!match) return { year: 0, week: 0 };
	return { year: parseInt(match[1]), week: parseInt(match[2]) };
}

/** Get the 7 dates (Mon–Sun) for a given ISO week */
function getWeekDates(year: number, week: number): Date[] {
	// January 4 is always in ISO week 1
	const jan4 = new Date(year, 0, 4);
	// Find the Monday of ISO week 1
	const dayOfWeek = jan4.getDay(); // 0=Sun
	const mondayOfW1 = new Date(jan4);
	mondayOfW1.setDate(jan4.getDate() - ((dayOfWeek + 6) % 7));

	// Monday of the target week
	const targetMonday = new Date(mondayOfW1);
	targetMonday.setDate(mondayOfW1.getDate() + (week - 1) * 7);

	const dates: Date[] = [];
	for (let i = 0; i < 7; i++) {
		const d = new Date(targetMonday);
		d.setDate(targetMonday.getDate() + i);
		dates.push(d);
	}
	return dates;
}

/** Format a date as YYYY-MM-DD */
function formatDate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

interface DayStats {
	pomodoros: number;
	hours: number;
}

/** Parse all completed task lines, group stats by date */
function parseTaskStats(content: string, emoji: string): Map<string, DayStats> {
	const stats = new Map<string, DayStats>();
	const lines = content.split("\n");

	for (const line of lines) {
		// Look for completion marker with date
		const dateMatch = line.match(/✅\s*(\d{4}-\d{2}-\d{2})/);
		if (!dateMatch) continue;

		const date = dateMatch[1];

		// Count pomodoro emoji
		let pomoCount = 0;
		let idx = 0;
		while (true) {
			idx = line.indexOf(emoji, idx);
			if (idx === -1) break;
			pomoCount++;
			idx += emoji.length;
		}

		// Extract hours (e.g., "0.4h", "1.2h", "2h")
		const hoursMatch = line.match(/(\d+\.?\d*)h(?!\w)/);
		const hours = hoursMatch ? parseFloat(hoursMatch[1]) : 0;

		if (!stats.has(date)) {
			stats.set(date, { pomodoros: 0, hours: 0 });
		}
		const day = stats.get(date)!;
		day.pomodoros += pomoCount;
		day.hours += hours;
	}

	return stats;
}

/** Format pomodoro count as emoji display */
function formatPomodoros(count: number, emoji: string): string {
	if (count === 0) return "—";
	if (count <= 5) return emoji.repeat(count);
	return `${emoji}×${count}`;
}

/** Format hours display */
function formatHours(hours: number): string {
	if (hours === 0) return "—";
	if (hours < 0.1) return `${hours.toFixed(2)}h`;
	return `${parseFloat(hours.toFixed(1))}h`;
}

/** Generate the full stats markdown block */
export function generateStatsContent(content: string, filename: string, emoji: string): string {
	const { year, week } = extractWeekInfo(filename);
	if (!year || !week) return "";

	const weekDates = getWeekDates(year, week);
	const taskStats = parseTaskStats(content, emoji);

	// Build table
	const headerCells = [" "];
	const separatorCells = ["---"];
	const pomoCells = [emoji];
	const hoursCells = ["⏱️"];

	let totalPomos = 0;
	let totalHours = 0;

	for (const date of weekDates) {
		const dateStr = formatDate(date);
		const dayName = DAY_NAMES[date.getDay()];
		const monthDay = `${date.getMonth() + 1}/${date.getDate()}`;
		headerCells.push(`${dayName} ${monthDay}`);
		separatorCells.push("---");

		const dayStat = taskStats.get(dateStr);
		if (dayStat && (dayStat.pomodoros > 0 || dayStat.hours > 0)) {
			pomoCells.push(formatPomodoros(dayStat.pomodoros, emoji));
			hoursCells.push(formatHours(dayStat.hours));
			totalPomos += dayStat.pomodoros;
			totalHours += dayStat.hours;
		} else {
			pomoCells.push("—");
			hoursCells.push("—");
		}
	}

	// Build markdown
	const lines: string[] = [
		STATS_HEADING,
		"",
		`| ${headerCells.join(" | ")} |`,
		`| ${separatorCells.join(" | ")} |`,
		`| ${pomoCells.join(" | ")} |`,
		`| ${hoursCells.join(" | ")} |`,
		"",
		`**本周: ${formatPomodoros(totalPomos, emoji)} · ${formatHours(totalHours)}**`,
	];

	return lines.join("\n");
}

/** Update stats section in a file */
export async function updateStats(app: App, filePath: string, emoji: string): Promise<void> {
	const file = app.vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) return;
	if (!isWeeklyNote(file.name)) return;

	// Read from editor buffer when active (avoids stale vault reads after editor edits)
	const view = app.workspace.getActiveViewOfType(MarkdownView);
	const isActive = view && view.file?.path === filePath;
	const content = isActive ? view.editor.getValue() : await app.vault.read(file);

	const statsBlock = generateStatsContent(content, file.name, emoji);
	if (!statsBlock) return;

	let newContent: string;

	// Find existing stats section by heading
	const headingIdx = content.indexOf(STATS_HEADING);

	if (headingIdx !== -1) {
		// Replace existing stats: from heading to end of file
		newContent = content.substring(0, headingIdx).trimEnd() + "\n\n" + statsBlock + "\n";
	} else {
		// Append to end
		newContent = content.trimEnd() + "\n\n" + statsBlock + "\n";
	}

	if (isActive) {
		view.editor.setValue(newContent);
	} else {
		await app.vault.modify(file, newContent);
	}
}
