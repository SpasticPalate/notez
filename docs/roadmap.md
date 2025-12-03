# Notez Development Roadmap

This document outlines planned features for Notez beyond the current MVP implementation.

Last Updated: 2025-12-03

---

## Current Status: v1.0.0-rc.2

MVP feature complete with comprehensive security hardening. Preparing for stable 1.0 release.

---

## Phase 1: Stability & Security ✅ MOSTLY COMPLETE

> **Goal:** Prepare for public release with security hardening and testing foundation

### 1.1 Security Hardening ✅ COMPLETE

- [x] Rate limiting via `@fastify/rate-limit`
  - Login endpoint: 5 attempts per 15 minutes
  - API endpoints: 100 requests per minute
  - Password reset: 3 attempts per 15 minutes
- [x] SQL injection prevention (parameterized queries)
- [x] Image content validation (Sharp-based)
- [x] Security headers (`X-Content-Type-Options: nosniff`)
- [x] Session invalidation on logout
- [x] Brute force protection (IP + username keying)
- [x] Production environment validation

### 1.2 Remaining 1.0 Tasks

**Status:** In Progress
**Tracking:** See issues labeled `1.0-hardening`

- [ ] Error boundary coverage (#69)
- [ ] Load testing with concurrent users (#67)
- [ ] Memory leak detection (#68)
- [ ] Edge case input testing (#70)
- [ ] Authentication edge cases (#64)
- [ ] Avatar loading after logout/login (#74)

---

## Phase 2: Enhanced Note Capabilities

> **Goal:** Add features that enhance daily note-taking workflow

### 2.1 MCP Server Integration (NEW)

**Status:** Planned
**Priority:** High
**Issue:** #87

Enable AI assistants (Claude, ChatGPT) to interact with Notez:
- API token system for authentication
- MCP server package (`notez-mcp`)
- Tools: create, search, append, get notes
- Persistent AI memory layer

### 2.2 Note Linking (Wiki-Style)

**Status:** Planned
**Priority:** High
**Issue:** #88

Enable `[[Note Title]]` syntax to link between notes:
- TipTap extension for `[[]]` syntax
- Autocomplete for note titles
- Backlinks panel showing incoming links
- Broken link indicators

### 2.3 Version History

**Status:** Planned
**Priority:** Medium
**Issue:** #89

Track note changes and enable restore:
- Capture snapshots on significant saves
- Keep last 10 versions per note
- Simple diff view
- One-click restore

### 2.4 Image Improvements

**Status:** Partially Complete
**Priority:** Medium

- [x] Image paste/upload support (v0.31.0)
- [x] Inline image resizing (v0.31.1)
- [ ] Image gallery view
- [ ] Bulk image management

---

## Phase 3: Organization & Scale

> **Goal:** Support larger note collections and advanced workflows

### 3.1 Multi-Workspace Support

**Status:** Planned
**Priority:** Medium

Separate workspaces for different contexts:
- Workspace switcher in navigation
- Isolated folders, notes, tasks per workspace
- Quick-switch keyboard shortcut

### 3.2 Advanced Search (Semantic)

**Status:** Planned
**Priority:** Medium

AI-powered semantic search:
- Generate embeddings for note content
- Store in pgvector
- Hybrid search: full-text + semantic
- "Find similar notes" feature

### 3.3 Import/Export

**Status:** Planned
**Priority:** Medium

Bulk data management:
- Export all notes as markdown (zip)
- Export to JSON for backup
- Import from markdown files
- Import from Obsidian/Notion format

### 3.4 API Documentation

**Status:** Planned
**Priority:** Low

- OpenAPI/Swagger specification
- Interactive documentation UI
- API versioning support

---

## Phase 4: Collaboration & Mobile

> **Goal:** Enable team usage and mobile access

### 4.1 Note Sharing

**Status:** Future

Share notes with read-only links:
- Generate shareable URLs
- Optional password protection
- Expiration dates

### 4.2 Mobile Apps

**Status:** Future

Native iOS/Android applications:
- React Native implementation
- Offline support with sync
- Quick capture widget

### 4.3 Real-Time Collaboration

**Status:** Future

Multi-user editing:
- Operational transformation or CRDT
- Presence indicators
- Comments and suggestions

---

## Backlog (Unscheduled)

These features are tracked but not yet prioritized:

- **Rich text toolbar** - Visual formatting buttons
- **Note templates** - Predefined structures
- **Browser extension** - Quick capture from web
- **Note encryption** - End-to-end encryption
- **Nested folders** - Multi-level folder hierarchy
- **Daily notes** - Auto-generated daily note template
- **Graph visualization** - Visual note connections
- **Webhooks** - Integration with external services

---

## Recently Completed

### v1.0.0-rc.2 (2025-12-03)
- Security hardening (rate limiting, SQL injection, image validation)
- Collapsed sidebar improvements

### v1.0.0-rc.1 (2025-12-02)
- MVP feature complete
- Self-service password reset
- Unified Settings Hub
- User avatars

### v0.31.x (2025-12)
- Image support with MinIO storage
- Inline image resizing

### v0.30.x (2025-11)
- Folder icons
- What's New modal

### v0.29.x (2025-11)
- Task management system
- Note organization improvements

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| v1.0.0-rc.2 | 2025-12-03 | Security hardening release |
| v1.0.0-rc.1 | 2025-12-02 | MVP feature complete, user avatars, dynamic AI models |
| v0.31.x | 2025-12 | Image support |
| v0.30.x | 2025-11 | Folder icons, What's New |
| v0.29.x | 2025-11 | Task management |
| v0.28.x | 2025-11 | Initial MVP |

---

## Contributing

Feature requests and bug reports are welcome! Please check the existing roadmap before suggesting new features.

Priority is given to:

1. Security and stability improvements
2. Features that improve daily workflow
3. Features requested by multiple users
4. Features aligned with self-hosted philosophy
