# Beauty Bliss Sales Tracker

A web application for Beauty Bliss (Supergo Company Limited) to track daily sales across beauty counter locations, manage promotions, and view analytics.

## Features

- **BA Sales Entry** — Mobile-friendly daily sales entry by counter and brand
- **Dashboard** — Daily sales, brand analytics, counter analytics, monthly comparison
- **Promotion Management** — Create promotions or sync from Microsoft Lists (CSV import)
- **Settings** — Manage counters, brands, and counter-brand assignments

## Tech Stack

- **Frontend:** React + Vite + Tailwind CSS + shadcn/ui
- **Backend:** Express.js (Node.js)
- **Data:** In-memory storage (for demo/development)

## Getting Started

### Prerequisites

- Node.js 20+ (recommended: 22 LTS)
- npm

### Install & Run Locally

```bash
npm install
npm run dev
```

The app runs at `http://localhost:5000`.

### Build for Production

```bash
npm run build
npm start
```

## Deployment (Railway)

1. Push this repo to GitHub
2. Connect to Railway and deploy
3. Railway auto-detects Node.js and runs `npm run build` then `npm start`

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | Set to `production` |
| `PORT` | No | Railway sets this automatically |

## Project Structure

```
├── client/           # React frontend
│   ├── src/
│   │   ├── pages/    # BA entry, dashboard pages
│   │   └── components/
├── server/           # Express backend
│   ├── routes.ts     # API endpoints
│   └── storage.ts    # In-memory data storage
├── shared/           # Shared types (schema.ts)
└── dist/             # Built output (generated)
```

## Important Note

This version uses **in-memory storage** — data resets when the server restarts. For persistent data, a PostgreSQL database integration is needed.
