# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Task Manager — a lightweight web app for creating, viewing, and managing tasks with recurring schedule support.

## Tech Stack

- **Backend**: Node.js + Express, served from `server.js`
- **Database**: SQLite via `better-sqlite3` with WAL mode. Single `tasks` table in `tasks.db`
- **Frontend**: Vanilla HTML/CSS/JS in `public/` (no build step, no framework)

## Running

```
npm start        # starts Express server on port 3000
```

## Architecture

- `server.js` — Express server, SQLite setup with auto-migration, all API routes
- `public/index.html` — single-page HTML shell
- `public/app.js` — all client-side logic (fetch calls, DOM rendering, edit forms, recurrence UI)
- `public/style.css` — all styles

## Database Schema

`tasks` table columns:
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `title` TEXT NOT NULL
- `description` TEXT
- `due_date` TEXT (YYYY-MM-DD)
- `completed` INTEGER (0 or 1)
- `recurrence_type` TEXT (weekly, monthly, quarterly, or null)
- `recurrence_days` TEXT (JSON — `{"weekdays":[1,3,5]}` for weekly, `{"option":"first"|"last"|"15"}` for monthly/quarterly)
- `created_at` TEXT (datetime)

New columns are auto-migrated via PRAGMA table_info checks on startup.

## API Endpoints

- `GET /api/tasks?view=inbox|all|week|overdue` — fetch tasks (excludes completed)
- `POST /api/tasks` — create task (accepts recurrence_type, recurrence_days)
- `PUT /api/tasks/:id` — update description, due_date, and recurrence settings
- `POST /api/tasks/:id/complete` — mark done; if recurring, auto-creates next instance with computed due date

## Features

- Task creation with title, description, optional due date
- Click-to-edit inline editing for description and due date
- Tab-based filtering: Inbox (no due date), All, This Week, Overdue
- Recurring tasks: weekly (multi-day select), monthly, quarterly with toggle switch in create/edit forms
- Completion button on each task card; recurring tasks auto-generate next instance on completion
