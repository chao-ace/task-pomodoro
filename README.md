# Task Pomodoro

A per-task Pomodoro timer plugin for [Obsidian](https://obsidian.md). Unlike global pomodoro timers, **Task Pomodoro** integrates directly with your markdown todo items (`- [ ]`), giving each task its own independent timer and visual progress tracking.

## Why Task Pomodoro?

Existing pomodoro plugins (like PomoBar) are **global timers** — they track time in the status bar but can't tell you *which task* you spent time on. Task Pomodoro is different:

| Feature | Global Plugins | **Task Pomodoro** |
|:--------|:---------------|:------------------|
| Timer target | "I'm working" | **"I'm working on THIS task"** |
| Time tracking | Cannot attribute time to tasks | **Automatic per-task time records** |
| Visual feedback | Status bar only | **Inline 🍅 on each task line** |
| Task completion | No integration | **Auto-finish timer on check-off** |

## Features

- **Per-task inline timers** — Each `- [ ]` item gets its own clickable timer button
- **Visual progress** — Completed pomodoros are appended as 🍅 directly in your markdown
- **Time tracking** — When you check off a task, actual time spent is recorded (e.g. `🍅🍅 0.8h`)
- **Partial pomodoros** — Even if you don't finish a full 25 min, time spent is tracked
- **Auto-finish on completion** — Checking off a task automatically stops its timer and records time
- **Reading View + Live Preview** — Works in both editing and viewing modes
- **Status bar integration** — Shows active timer with state-aware styling
- **Sound notifications** — Built-in chimes or custom audio files
- **Ambient Soundscapes** — High-fidelity, synthesized background sounds (Rain, Fire, Ocean, Café, etc.)
- **Scientific Focus Tracks** — Alpha, Beta, and Gamma brainwave beats with brown noise layering for deep work
- **Long break support** — Automatic long breaks after N pomodoros
- **Auto-progress mode** — Optionally chain work → break → work automatically

## Usage

### Starting a timer

Open any note with `- [ ]` task items. You'll see a timer button next to each task:

```markdown
- [ ] Complete code review  ▶ 25:00
- [ ] Fix login bug  ⏱ 12:45 🍅
```

Click the button to start/pause. Each click cycles through states:
- `▶ 25:00` → **Start** working
- `⏱ 22:15` → **Working** (click to pause)
- `⏸ 12:45` → **Paused** (click to resume)

### Completing a task

When you check off a task (`- [x]`), the timer auto-finishes and records your time:

```markdown
- [x] Completed a full pomodoro 🍅 0.4h
- [x] Did 3 full pomodoros 🍅🍅🍅 1.2h
- [x] Quick task, less than 25 min 0.2h
```

- **Full 🍅** = completed 25-minute work session
- **x.xh** = actual total hours spent (including partial sessions)

### Commands

| Command | Description |
|:--------|:------------|
| `开始/暂停光标所在任务的番茄钟` | Toggle timer for task under cursor |
| `停止光标所在任务的番茄钟` | Stop timer for task under cursor |
| `重置光标所在任务的番茄钟` | Reset timer for task under cursor |
| `重置整个番茄钟会话` | Reset all timers |
| `切换音效开关` | Toggle sound on/off |
| `切换环境音效开关` | Toggle ambient sound on/off |
| `切换状态栏显示` | Toggle status bar visibility |

## Settings

| Setting | Default | Description |
|:--------|:--------|:------------|
| Work duration | 25 min | Length of each work session |
| Short break | 5 min | Break after each pomodoro |
| Long break | 15 min | Break after N pomodoros |
| Long break interval | 4 | Trigger long break after this many 🍅 |
| Auto-start break | On | Automatically start break countdown |
| Auto-progress | Off | Chain work → break → work automatically |
| Pomodoro emoji | 🍅 | Emoji used for tracking |
| Sound | On + Chime | Built-in sounds or custom audio |
| Volume | 50% | Notification volume |
| Status bar | On | Show active timer in status bar |
| Ambient Sound | Off | Background soundscapes during work |
| Ambient Volume | 30% | Volume for background sounds |
| Auto-play Ambient | On | Start ambient sound automatically with timer |

## Ambient Soundscapes

Task Pomodoro includes a built-in, no-asset-required ambient sound engine. All sounds are synthesized locally using the Web Audio API — **no external files, no network requests, zero footprint.**

### 🌿 Classic Environments
- **Rain**: Layered pitter-patter, wash, and roof rumble.
- **Fireplace**: Realistic wood popping with irregular crackle synthesis.
- **Ocean**: Asymmetrical wave cycles with foam-hiss peaks.
- **Café**: Mid-range murmur with occasional distant dish clinks.
- **Forest**: Wind-blown leaves with rhythmic bird-call sequences.

### 🧠 Scientific Focus Tracks (Brainwave Entrainment)
Designed based on neuroscientific research, these tracks use **Binaural Beats** layered with soft **Brown Noise** to reduce fatigue and encourage specific brain states:
- **Alpha (10Hz)**: 心流模式 (Flow State) — For calm focus, reading, and creativity.
- **Beta (20Hz)**: 深度专注 (Deep Work) — For high-intensity coding, math, and analysis.
- **Gamma (40Hz)**: 极速处理 (Peak Performance) — For information processing and memory.

*Note: Head-to-head research suggests binaural beats are most effective when listened to with headphones.*

## Installation

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/chao-ace/task-pomodoro/releases)
2. Create folder `obsidian-task-pomodoro` in your vault's `.obsidian/plugins/`
3. Copy the three files into that folder
4. Enable in **Settings → Community Plugins**

### BRAT (Beta)

You can also install via [BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install BRAT from the community plugin store
2. Run `BRAT: Add a beta plugin for testing`
3. Enter: `chao-ace/task-pomodoro`

### Development

```bash
git clone https://github.com/chao-ace/task-pomodoro.git
cd obsidian-task-pomodoro
npm install
npm run dev    # Watch mode with hot reload
npm run build  # Production build
```

## How It Works

1. **Rendering**: The plugin uses Obsidian's `registerMarkdownPostProcessor` (Reading View) and CodeMirror 6 `ViewPlugin` (Live Preview) to inject inline timer buttons next to each task
2. **Timer state**: Managed per-task in a singleton `TimerService`, keyed by `filePath:lineNumber`
3. **Persistence**: Pomodoro counts and time tracking are written directly into the markdown text, so they're visible even without the plugin installed
4. **Task completion**: A vault modify listener detects when `- [ ]` becomes `- [x]` and auto-finishes the running timer

## License

MIT
