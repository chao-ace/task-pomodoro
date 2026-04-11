# Task Pomodoro

Per-task Pomodoro timers integrated with Obsidian markdown todo items.

## Features

- **Per-task timers**: Each `- [ ]` todo item gets its own inline Pomodoro timer
- **Visual progress**: Completed 25-minute work sessions are tracked with 🍅 emoji appended to the task line
- **Inline controls**: Click the timer button next to any task to start/pause/stop
- **Reading View + Live Preview**: Works in both viewing and editing modes
- **Status bar**: Shows active timer when working on a task

## Usage

1. Open any note with `- [ ]` task items
2. Click the `▶ 25:00` button next to any task to start a Pomodoro
3. Work for 25 minutes — the button shows a live countdown `⏱ 22:15`
4. When complete, a 🍅 is automatically appended to the task line
5. Start as many Pomodoros as needed for each task

### Task line format

```markdown
- [ ] Complete code review  ▶ 25:00
- [ ] Fix login bug  ⏱ 12:45 🍅
- [x] Write documentation  ✅ 已完成 🍅🍅🍅
```

### Commands

- **开始/暂停光标所在任务的番茄钟**: Toggle timer for the task under your cursor
- **停止光标所在任务的番茄钟**: Stop timer for the task under your cursor

## Settings

- Work duration (default: 25 minutes)
- Short break duration (default: 5 minutes)
- Pomodoro emoji (default: 🍅)
- Sound notifications
- Auto-start break
- Status bar visibility

## Installation

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/chao-ace/obsidian-task-pomodoro/releases)
2. Create a folder named `obsidian-task-pomodoro` in your vault's `.obsidian/plugins/` directory
3. Copy the three files into that folder
4. Enable the plugin in Obsidian Settings → Community Plugins

### Development

```bash
cd .obsidian/plugins/obsidian-task-pomodoro
npm install
npm run dev    # Watch mode
npm run build  # Production build
```

## License

MIT
