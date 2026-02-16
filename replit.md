# HR Management Application

## Overview
A full-stack HR management application for workforce management including scheduling, time tracking, training, communications, and more. Built with React frontend and Express backend using PostgreSQL database.

## Recent Changes
- 2026-02-16: Initial project scaffolding from GitHub import. Created full-stack structure with client/server separation, stub pages for all routes, authentication system, and database schema.

## Project Architecture

### Tech Stack
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS v4, shadcn/ui components, wouter (routing), @tanstack/react-query
- **Backend**: Express.js, TypeScript, Passport.js (local strategy), bcrypt
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **Auth**: Email/password authentication with express-session and connect-pg-simple

### Directory Structure
```
client/                  # Frontend
  src/
    App.tsx             # Main app with routing
    main.tsx            # React entry point
    index.css           # Global styles with Tailwind
    pages/              # Page components (40+ pages)
    hooks/              # Custom React hooks
    contexts/           # React contexts
    components/         # Reusable components
    components/ui/      # shadcn/ui primitives
    lib/                # Utilities (queryClient, utils)
  index.html            # HTML entry point
server/                 # Backend
  index.ts              # Express server entry
  auth.ts               # Authentication setup
  db.ts                 # Database connection
  routes.ts             # API route registration
  storage.ts            # Database CRUD operations
  vite.ts               # Vite dev middleware
shared/                 # Shared between client/server
  schema.ts             # Drizzle ORM schema (all tables)
  video-types.ts        # Type definitions
  types/                # Additional type definitions
  config/               # Shared configuration
```

### Key Configuration
- Frontend dev server: Vite middleware mode through Express on port 5000
- Path aliases: `@/` maps to `client/src/`, `@shared/` maps to `shared/`
- Vite configured with `allowedHosts: true` for Replit proxy

### Scripts
- `npm run dev` - Start development server (tsx server/index.ts)
- `npm run build` - Build for production (vite build + esbuild server)
- `npm run start` - Start production server
- `npm run db:push` - Push schema changes to database

### Database
- Uses Drizzle ORM with Neon PostgreSQL
- Schema defined in `shared/schema.ts` (6000+ lines)
- Tables include: users, sessions, time_clock_entries, shifts, training modules, documents, communications, and many more

## User Preferences
- None recorded yet
