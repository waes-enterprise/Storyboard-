---
Task ID: 1
Agent: main
Task: Convert Storyboard AI from single HTML file to full Next.js webapp

Work Log:
- Initialized fullstack dev environment (Next.js 16 + Turbopack)
- Found existing project already scaffolded from previous session with all components
- Verified all files: types, Zustand store, Prisma schema, API routes (generate, storyboards CRUD, PDF export), UI components (Sidebar, ShotCanvas, ShotCard, EditModal, ExportDropdown)
- Stored Anthropic API key in .env.local (server-side)
- Tested API key — returned "forbidden" (key was revoked after being shared in chat previously)
- Updated generate API route to support both server-side env var AND client-provided key (fallback pattern)
- Updated Sidebar component to include API key field with note that it's proxied through server
- Pushed Prisma schema to SQLite database
- Verified dev server compiles and serves HTTP 200 with full HTML including all storyboard components
- Server running via dev.sh on port 3000 with Caddy gateway on port 81

Stage Summary:
- Storyboard AI is fully built as a Next.js 16 webapp with:
  - Server-side Anthropic API proxy (secure key handling)
  - SQLite database via Prisma (persistent storyboard storage)
  - CRUD API routes for storyboards
  - AI shot generation via Claude (Anthropic)
  - Image generation via Pollinations AI (sequential loading)
  - Drag-to-reorder shots via @dnd-kit
  - Edit modal for shot customization
  - Export: PNG, PDF, CSV
  - Cinematic dark theme with gold (#E8C547) accents
  - Responsive design with mobile support
- The user's Anthropic API key was revoked and needs to be replaced with a fresh one
- App is live at the preview URL
