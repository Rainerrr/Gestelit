# Project Structure & Deployment Guide

## 📁 Project Structure Explained (Beginner Level)

This is a **Next.js** project (a React framework for building web applications). Here's what each directory and file does:

### 🎯 Core Application Files (MUST DEPLOY)

#### `/app` - Your Application Pages & API Routes
- **What it is**: This is where all your web pages and API endpoints live
- **Contains**:
  - `(worker)/` - Pages for workers (login, station, work, job, checklist)
  - `admin/` - Admin dashboard pages
  - `api/` - Backend API routes (REST endpoints)
  - `layout.tsx` - Main layout wrapper for all pages
  - `page.tsx` - Home page
  - `globals.css` - Global styles
- **Deploy**: ✅ YES - This is your entire application

#### `/components` - Reusable UI Components
- **What it is**: React components you use across multiple pages
- **Contains**:
  - `ui/` - shadcn/ui components (buttons, dialogs, tables, etc.)
  - `forms/` - Form-related components
  - `layout/` - Layout components (headers, etc.)
  - `checklists/` - Checklist-specific components
- **Deploy**: ✅ YES - Needed for the UI to work

#### `/lib` - Shared Code & Utilities
- **What it is**: Helper functions, API clients, and business logic
- **Contains**:
  - `api/` - API client functions
  - `data/` - Data fetching functions
  - `i18n/` - Translation/internationalization
  - `supabase/` - Database client setup
  - `utils/` - Utility functions
  - `types.ts` - TypeScript type definitions
  - `status.ts` - Status-related logic
- **Deploy**: ✅ YES - Core business logic

#### `/contexts` - React Context Providers
- **What it is**: Global state management (language, worker sessions)
- **Deploy**: ✅ YES - Needed for app state

#### `/hooks` - Custom React Hooks
- **What it is**: Reusable React hooks (useTranslation, useSessionHeartbeat, etc.)
- **Deploy**: ✅ YES - Used by components

#### `/public` - Static Assets
- **What it is**: Images, icons, and files served directly to browsers
- **Contains**: SVG icons (file.svg, globe.svg, etc.)
- **Deploy**: ✅ YES - Static assets for the UI

### ⚙️ Configuration Files (MUST DEPLOY)

#### Root Configuration Files
- `package.json` - ✅ Lists all dependencies and scripts
- `package-lock.json` - ✅ Locks dependency versions (ensures consistent installs)
- `next.config.ts` - ✅ Next.js configuration
- `tsconfig.json` - ✅ TypeScript configuration
- `tailwind.config.ts` - ✅ Tailwind CSS configuration
- `postcss.config.mjs` - ✅ PostCSS configuration (for CSS processing)
- `components.json` - ✅ shadcn/ui configuration
- `eslint.config.mjs` - ✅ Code linting rules

### 🗄️ Database & Backend (DEPLOY IF USING SUPABASE)

#### `/supabase` - Supabase Configuration
- **What it is**: Database migrations and edge functions
- **Contains**:
  - `migrations/` - SQL migration files (database schema changes)
  - `functions/` - Edge functions (serverless functions)
  - `config.toml` - Supabase project configuration
  - `schema.sql` - Database schema
  - `seed.sql` - Seed data (test data)
- **Deploy**: ⚠️ **DEPENDS**:
  - If deploying to Supabase: ✅ YES (migrations, functions, config)
  - If using external database: ❌ NO (only needed for Supabase setup)

### 📝 Documentation (OPTIONAL - Usually NOT Deployed)

#### `/docs` - Documentation
- **What it is**: Project documentation and architecture notes
- **Deploy**: ❌ NO - Not needed for the app to run (but useful to keep in Git)

### 🛠️ Development Tools (DO NOT DEPLOY)

#### `/scripts` - Development Scripts
- **What it is**: Helper scripts for development (data seeding, CSV reading, etc.)
- **Contains**: `.cjs` files for generating test data
- **Deploy**: ❌ NO - Only used during development

#### `/lib/mocks` - Mock Data
- **What it is**: Fake data for testing during development
- **Contains**: CSV files and mock API responses
- **Deploy**: ❌ NO - Not needed in production

#### `/node_modules` - Dependencies
- **What it is**: All installed npm packages
- **Deploy**: ❌ NO - Rebuilt on server using `npm install`

#### `/.next` - Build Output
- **What it is**: Compiled/optimized code created by `npm run build`
- **Deploy**: ❌ NO - Rebuilt on server during deployment

#### `/.git` - Git Repository
- **What it is**: Version control history
- **Deploy**: ❌ NO - Never deploy Git folder

#### `/.cursor` - Editor Settings
- **What it is**: Cursor IDE configuration
- **Deploy**: ❌ NO - Editor-specific, not needed

#### `*.tsbuildinfo` - TypeScript Cache
- **What it is**: TypeScript compilation cache
- **Deploy**: ❌ NO - Regenerated during build

#### `next-env.d.ts` - Auto-generated Types
- **What it is**: Auto-generated TypeScript definitions
- **Deploy**: ❌ NO - Auto-generated during build

---

## 🚀 What to Deploy

### For Standard Next.js Deployment (Vercel, Netlify, etc.)

When deploying, you typically only need to push your code to Git. The deployment platform will:

1. Run `npm install` (installs dependencies)
2. Run `npm run build` (builds the app)
3. Run `npm start` (starts the server)

**What gets deployed automatically:**
- ✅ All files in `/app`
- ✅ All files in `/components`
- ✅ All files in `/lib` (except `/lib/mocks`)
- ✅ All files in `/contexts`
- ✅ All files in `/hooks`
- ✅ All files in `/public`
- ✅ All configuration files (package.json, next.config.ts, etc.)

**What should NOT be deployed (already in .gitignore):**
- ❌ `/node_modules` - Rebuilt on server
- ❌ `/.next` - Rebuilt on server
- ❌ `/.git` - Never deploy
- ❌ `*.tsbuildinfo` - Cache files
- ❌ `.env*` files - Environment variables (set separately on server)
- ❌ `/lib/mocks` - Development only
- ❌ `/scripts` - Development only
- ❌ `/.cursor` - Editor files

### 📦 Recommended Deployment Structure

If you need to manually package files for deployment, include:

```
✅ app/
✅ components/
✅ contexts/
✅ hooks/
✅ lib/ (EXCEPT lib/mocks/)
✅ public/
✅ supabase/ (if using Supabase)
✅ package.json
✅ package-lock.json
✅ next.config.ts
✅ tsconfig.json
✅ tailwind.config.ts
✅ postcss.config.mjs
✅ components.json
✅ eslint.config.mjs
```

### 🗑️ Clean Up Before Deployment

To ensure you're not deploying unnecessary files, your `.gitignore` should already exclude:
- Development files
- Build artifacts
- Cache files
- Environment files

**Current `.gitignore` looks good!** It already excludes:
- `node_modules/`
- `.next/`
- `*.tsbuildinfo`
- `.env*` files
- Build outputs

---

## 🎯 Summary

**For most Next.js deployments (Vercel, Netlify, Railway, etc.):**
- Just push your code to Git
- The platform handles the rest
- Don't worry about manually selecting files

**If manually deploying:**
- Deploy everything EXCEPT what's in `.gitignore`
- Don't deploy `/lib/mocks` or `/scripts` (development tools)
- Don't deploy `/docs` (documentation, unless you want it)

**The key directories to deploy are:**
1. `/app` - Your application
2. `/components` - UI components
3. `/lib` - Business logic (minus mocks)
4. `/public` - Static assets
5. `/contexts` & `/hooks` - React utilities
6. All config files in root

