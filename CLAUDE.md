# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Detailed framework patterns are in `.claude/skills/` — Claude Code reads these automatically when relevant. This file covers project-level conventions and cross-cutting concerns only.

## Key Instructions

- ALWAYS USE RELATIVE FILEPATHS from the current working directory (e.g. `app/models/user.ts`), NEVER absolute paths starting with `/`
- USE Context7 to determine AdonisJS / Lucid ORM usage — do not rely on outdated knowledge (v5 instead of v6)
- USE OOP wherever possible, ensuring maximum code reuse and testability
- ALWAYS write unit tests for your code — follow TDD (Red → Green → Refactor)
- NEVER run the full test suite without asking first — conserve tokens
- READ `.claude/skills/common-pitfalls/SKILL.md` before writing ANY AdonisJS code — it documents the most frequent AI mistakes with this framework

## Project Overview

<!-- Describe your project here -->

This is an AdonisJS v6 application with TypeScript.

## Technology Stack

- **Framework**: AdonisJS v6 with TypeScript
- **Database**: PostgreSQL (or SQLite for development) via Lucid ORM
- **Authentication**: Session-based auth via `@adonisjs/auth`
- **Frontend**: Edge.js templating with Vite and Pico CSS
- **Testing**: Japa test runner with unit and functional suites

## Code Formatting Rules

- **Line Length**: Max 100 characters
- **Quotes**: Single quotes for strings
- **Semicolons**: Do NOT use semicolons
- **Indentation**: 2 spaces, no tabs
- **Trailing Commas**: ES5-style trailing commas
- **Arrow Functions**: Always use parentheses around parameters
- **Bracket Spacing**: Include spaces in object literals `{ key: 'value' }`

## Import Aliases

Use `#` aliases for clean imports (configured in `package.json`):

- `#controllers/*` → `./app/controllers/*.js`
- `#models/*` → `./app/models/*.js`
- `#services/*` → `./app/services/*.js`
- `#middleware/*` → `./app/middleware/*.js`
- `#validators/*` → `./app/validators/*.js`
- `#config/*` → `./config/*.js`
- `#start/*` → `./start/*.js`

## Development Commands

```bash
# Development
npm install                    # Install dependencies
node ace serve --hmr           # Start dev server with hot reload
npm run build                  # Build for production
npm start                      # Start production server

# Code Quality
npm run lint                   # Run ESLint
npm run format                 # Format code with Prettier
npm run typecheck              # Run TypeScript type checking

# Database
node ace migration:run         # Run migrations
node ace migration:rollback    # Rollback last migration
node ace migration:fresh       # Drop all tables and re-run migrations
node ace db:seed               # Seed database

# Scaffolding
node ace make:model Post -m    # Model + migration together (preferred)
node ace make:controller Posts  # Controller
node ace make:middleware Auth   # Middleware

# Testing
npm test                       # Run all tests
node ace test unit             # Run unit tests only
node ace test functional       # Run functional tests only
```

## Context7 MCP Server

This project uses the [Context7 MCP server](https://github.com/upstash/context7) for fetching up-to-date framework documentation. The `.claude/skills/` files provide a baseline, but **always use Context7 to verify patterns or look up APIs not covered by the skills**.

Relevant documentation sources:

- **AdonisJS**: `context7-compatible-id: adonisjs`
- **Lucid ORM**: `context7-compatible-id: lucid_adonisjs`
- **VineJS**: `context7-compatible-id: /vinejs/vinejs.dev`
- **Japa**: `context7-compatible-id: japa_dev`
- **Edge.js**: `context7-compatible-id: edgejs_dev`

Use Context7 when: the skills don't cover a specific API, you need to confirm a pattern is still current for v6, or you're working with a package not covered by the skills (e.g. Ally, Bouncer, Drive).

## Git Workflow

Use short-lived feature branches off `master`. No gitflow — keep it simple.

```bash
git checkout -b feat/add-user-profiles   # new feature
git checkout -b fix/login-validation     # bug fix
git checkout -b chore/update-seed-data   # maintenance
```

- Branch names: `feat/`, `fix/`, or `chore/` prefix with a short kebab-case description
- Commit messages: imperative present tense, under 72 characters (e.g. `Add user profile routes and views`)
- Commit often — one logical change per commit, not one giant commit per feature
- Merge back to `master` when tests pass; delete the branch after merge
- Never commit directly to `master`

## Code Quality Standards

### Database Best Practices

- Use **database column names** (snake_case) in raw queries, not model property names (camelCase). Lucid handles camelCase→snake_case mapping automatically in model queries, but raw queries and validators require actual column names.
- Verify column names against actual migration files
- Use **bulk operations** (UPDATE, INSERT) instead of loops where possible
- Watch for and prevent **N+1 query problems** — use `preload()` for relationships
- Use `attach()` for creating many-to-many relationships; use `sync()` for updating them
- Use `findOrFail()` / `findByOrFail()` — let AdonisJS handle 404s automatically

### Security

- Validate and sanitise all inputs with VineJS validators
- Always include `{{ csrfField() }}` in forms
- Use `_method` in query string (not hidden field) for PUT/DELETE
- Use `silentAuth` middleware on public pages that show auth-dependent UI
- Test security controls with malicious inputs

### Production Readiness Checklist

Before claiming work is complete: all tests passing (100%), error handling tested, concurrency scenarios covered (if applicable), security controls in place, database queries optimised, and structured logging implemented.

## Entity Architecture Patterns

### Recommended: Base Controller for Simple Entities

If your project has several similar CRUD entities (e.g. name-only entities like Artists,
Genres, Tags), consider creating shared abstractions to eliminate boilerplate:

- **Controller**: An abstract `SimpleResourceController` base class — concrete controllers provide config only, no logic
- **Validators**: Factory functions (e.g. `createNameValidator(tableName)`) that generate validators for name-only entities with uniqueness checks
- **Views**: Shared templates driven by a `viewFields` config array
- **Tests**: A shared `testSimpleResource()` helper that generates the full CRUD test suite from configuration

See the `adonisjs-controllers` and `japa-testing` skills for skeleton examples.

### Complex Entities

Entities with complex relationships, search/filter, nested routes, or custom business logic should have standalone controllers, views, and tests — their logic doesn't fit a shared pattern.

### Adding a New Entity

1. Create model + migration: `node ace make:model MyEntity -m`
2. Create validator in `app/validators/`
3. Create controller in `app/controllers/`
4. Register route in `start/routes.ts`
5. Create tests
6. Run tests to verify

## File Structure

```
app/
├── controllers/        # HTTP controllers
├── models/             # Lucid ORM models
├── services/           # Business logic services
├── middleware/          # HTTP middleware
├── exceptions/         # Custom exceptions
└── validators/         # Request validation (VineJS)

database/
├── migrations/         # Database migrations
└── seeders/            # Database seeders

resources/
├── css/                # Stylesheets (processed by Vite)
├── js/                 # JavaScript (processed by Vite)
└── views/              # Edge.js templates
    ├── layouts/        # Layout templates
    ├── components/     # Reusable components
    └── pages/          # Standalone pages (home, etc.)

start/
├── routes.ts           # Route definitions
├── kernel.ts           # HTTP kernel configuration
├── env.ts              # Environment variable validation
└── validator.ts        # VineJS validator config (if present)

config/                 # Application configuration files

tests/
├── unit/               # Unit tests
└── functional/         # Functional (HTTP) tests
```
