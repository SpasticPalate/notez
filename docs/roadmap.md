# Notez Development Roadmap

This document outlines planned features for Notez beyond the current MVP implementation.

## Recently Completed (Current Release)

### Note Organization Improvements
- ✅ **Move notes to folders** - Dropdown selector in note editor
- ✅ **Drag-and-drop organization** - Drag notes to folders in sidebar
- ✅ **Auto-save cursor fix** - Fixed cursor jumping during typing when auto-save triggers

## Phase 2: Enhanced Note Capabilities

### Task Management
**Status:** Planned
**Priority:** High
**Description:** Add task/checklist functionality to notes

#### Approach A: In-Note Tasks (Initial Implementation)
- Use Tiptap's built-in task list extension for markdown-style checkboxes
- Add dedicated "Tasks" view that aggregates all unchecked tasks across notes
- Filter tasks by folder or show all tasks
- Simple and integrated with existing note structure

**Implementation Details:**
- Tiptap already supports task items via `@tiptap/extension-task-list` and `@tiptap/extension-task-item`
- Tasks remain part of note content (markdown format)
- Backend: Add query to extract unchecked tasks from note content
- Frontend: New "Tasks" sidebar item or view panel

#### Future Evolution: Standalone Task System (If needed)
- Add `Task` database model with:
  - Title, description, status (pending/completed)
  - Due date, priority level
  - Optional link to note
  - Folder/tag association
- Full task management UI with filtering, sorting, prioritization
- More complex but provides power-user features

**Acceptance Criteria:**
- [ ] User can create checkboxes/tasks within notes
- [ ] User can check/uncheck tasks in notes
- [ ] Dedicated view shows all outstanding tasks
- [ ] Tasks are filterable by folder or show all
- [ ] Task count badge visible in UI

---

### Image Paste Support
**Status:** Planned
**Priority:** Medium
**Description:** Allow users to paste images directly into notes

**Technical Requirements:**
- **Storage:** Local filesystem or cloud storage (S3/blob storage)
- **Database:** New `Attachment` or `Media` table with:
  - File path/URL
  - File type, size, dimensions
  - Associated note ID
  - Upload timestamp
- **Editor:** Tiptap already has image extension support (`@tiptap/extension-image`)
- **Security:**
  - File type validation (only allow images)
  - Size limits (e.g., 10MB per image, 100MB per note)
  - Virus scanning for uploads (optional but recommended)
- **Performance:**
  - Generate thumbnails for large images
  - Lazy loading for image rendering
  - Image optimization/compression

**Implementation Steps:**
1. Add `Media` table to Prisma schema
2. Create file upload endpoint with validation
3. Implement storage backend (start with local filesystem)
4. Integrate Tiptap image extension
5. Add paste event handler for images
6. Build image gallery/manager UI (optional)

**Acceptance Criteria:**
- [ ] User can paste images from clipboard into notes
- [ ] Images are uploaded and stored securely
- [ ] Images display correctly in note editor
- [ ] Images have reasonable size limits enforced
- [ ] Image management (delete, replace) works correctly

---

## Phase 3: Workspaces

### Multi-Workspace Support
**Status:** Planned
**Priority:** Medium
**Description:** Allow users to create separate workspaces for different contexts (Work, Home, Lab, Dev, etc.)

**Conceptual Model:**
- Workspace = isolated environment with its own folders, notes, tasks
- Quick workspace switcher in UI (similar to VS Code workspaces)
- Each workspace can have different settings (theme, AI config, etc.)
- User can switch between workspaces seamlessly

**Database Changes:**
```prisma
model Workspace {
  id          String   @id @default(cuid())
  name        String
  description String?
  color       String?  // For visual distinction
  icon        String?  // Emoji or icon identifier
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Relations
  folders     Folder[]
  notes       Note[]
  settings    Json?    // Workspace-specific settings

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([userId, name])
}

// Update existing models to add workspaceId:
// - Folder: add workspaceId
// - Note: add workspaceId
// - Task: add workspaceId (when implemented)
```

**UI/UX Considerations:**
- Workspace switcher dropdown in top navigation bar
- Quick-switch keyboard shortcut (e.g., Ctrl+K → workspace name)
- Visual indicators of current workspace (color coding, icon)
- Workspace settings page
- Default workspace for new users ("Personal" or "Main")

**Key Features:**
- Create/rename/delete workspaces
- Move folders/notes between workspaces
- Workspace-level search and filtering
- Workspace-specific AI settings (optional)
- Export/import workspace data

**Migration Strategy:**
- All existing notes/folders automatically assigned to default workspace
- User can reorganize after workspaces are enabled
- No data loss during migration

**Acceptance Criteria:**
- [ ] User can create multiple workspaces
- [ ] User can switch between workspaces seamlessly
- [ ] Each workspace has isolated folders and notes
- [ ] User can move notes/folders between workspaces
- [ ] Workspace switcher is easily accessible
- [ ] Visual distinction between workspaces (color/icon)
- [ ] Search/filter respects workspace boundaries
- [ ] Existing data migrates cleanly to default workspace

**Implementation Complexity:**
- **High** - Touches many parts of the application
- Requires database schema changes
- Affects routing, state management, API endpoints
- Needs careful UX design for workspace switching
- Testing across workspace boundaries is critical

**Recommendation:**
- Implement after core features are stable
- Conduct user research to validate demand
- Consider starting with a prototype/beta feature flag
- Plan rollout carefully to avoid breaking existing workflows

---

## Future Considerations

### Additional Ideas (Backlog)
- **Rich text formatting toolbar** - More prominent formatting options
- **Note templates** - Predefined note structures for common use cases
- **Note linking** - Wiki-style links between notes
- **Version history** - Track changes and restore previous versions
- **Collaborative editing** - Multi-user real-time collaboration
- **Mobile apps** - Native iOS/Android applications
- **Browser extensions** - Quick note capture from web
- **API access** - RESTful API for third-party integrations
- **Markdown export** - Bulk export notes as markdown files
- **Note encryption** - End-to-end encryption for sensitive notes

---

## Version History

- **v0.28.x** - Current MVP release
- **Phase 2** - Task management & image support (TBD)
- **Phase 3** - Workspaces (TBD)

---

*Last Updated: 2025-11-02*
