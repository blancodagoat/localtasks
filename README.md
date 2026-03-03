# LocalTasks

**Privacy-first, offline-only task manager. Your data never leaves your device.**

## Why LocalTasks?

- 🔒 **No accounts** — No sign-up required
- 📴 **Fully offline** — Works without internet
- 🔐 **Your data stays local** — SQLite database on your device
- 📤 **You own your data** — Export anytime to JSON

## Features

- Create multiple task lists (Personal, Work, etc.)
- Add, complete, and delete tasks
- Progress tracking
- Export your data to JSON for backup
- Clean, minimal interface

## Privacy Guarantee

- No telemetry or analytics
- No cloud sync
- No data collection
- No internet required after installation

## Development

### Prerequisites

- Node.js 18+
- Rust (for Tauri)
- npm or yarn

### Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

### Build

```bash
# Build for production
npm run tauri build
```

## Tech Stack

- **Framework:** Tauri  + Web2.x (RustView)
- **Frontend:** React + TypeScript + TailwindCSS
- **Database:** SQLite (local, via tauri-plugin-sql)
- **Storage:** Device local only

## License

MIT
