# Local Folder Browser — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user open a folder on their own machine from inside Notez, browse its tree, and read `.md` and plain-text files rendered correctly — with a clearly-labelled read-only fallback on browsers that cannot do it.

**Architecture:** Entirely frontend. A `lib/localFs/` layer wraps the File System Access API (capability detection, IndexedDB handle persistence, permission/reconnect, lazy directory listing, relative-path resolution) with no React in it, so it is unit-testable against a fake in-memory filesystem. A `components/localFiles/` layer renders it, dispatching file types through a viewer registry. A new `/files` route hosts the whole thing.

**Tech Stack:** React 19, TypeScript 5.9 (strict), Vite, Tailwind, Vitest + Testing Library, `marked` + `dompurify` (existing deps), `fake-indexeddb` (new dev dep).

**Spec:** `docs/specs/v1.30.0-local-folder-browser-tech-spec.md`

## Global Constraints

Every task's requirements implicitly include these.

- **Branch:** all work happens on `feature/local-folder-browser`. Never commit on `main`.
- **Never chain shell commands with `&&` or `||`.** Run them on separate lines.
- **`erasableSyntaxOnly` is on:** no `enum`, no `namespace`, no constructor parameter properties. Use `const` objects plus union types.
- **`verbatimModuleSyntax` is on:** type-only imports must be written `import type { X } from '...'`.
- **`noUnusedLocals` and `noUnusedParameters` are on:** an unused import or parameter fails the build.
- **`strict` is on.** No implicit `any`.
- Tests use Vitest with `globals: true` and jsdom; setup file is `src/test/setup.ts`.
- Run frontend tests with `npm test` from `frontend/`. Run type-checking with `npm run build`. Run lint with `npm run lint`.
- Tailwind styling must include `dark:` variants matching the existing components (see `src/components/AppHeader.tsx` for the house palette: `bg-white dark:bg-gray-800`, `text-gray-900 dark:text-white`, `border-gray-200 dark:border-gray-700`).
- **No file content, absolute path, or filename may be sent to the backend, logged to telemetry, or included in an error report.** Error reporting may record file extension and error class only.
- Phase 1 is **read-only**. Nothing in this plan calls `createWritable()`.

---

### Task 1: Ambient File System Access types + capability detection

TypeScript 5.9's `lib.dom` declares `FileSystemHandle`, `FileSystemDirectoryHandle` and `FileSystemFileHandle`, but **not** `window.showDirectoryPicker`, **not** the permission methods, and **not** async iteration over a directory. We augment rather than redeclare.

**Files:**
- Create: `frontend/src/types/fileSystemAccess.d.ts`
- Create: `frontend/src/lib/localFs/types.ts`
- Create: `frontend/src/lib/localFs/capability.ts`
- Test: `frontend/src/lib/localFs/capability.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces:
  - `type LocalFsMode = 'fsa' | 'legacy' | 'unsupported'`
  - `detectLocalFsMode(win?: Window): LocalFsMode`
  - `type LocalEntry = { kind: 'file'; name: string; handle: FileSystemFileHandle } | { kind: 'directory'; name: string; handle: FileSystemDirectoryHandle }`
  - `type PermissionState = 'granted' | 'prompt' | 'denied'`

- [ ] **Step 1: Write the ambient declarations**

Create `frontend/src/types/fileSystemAccess.d.ts`:

```typescript
// Augments TypeScript's lib.dom, which as of TS 5.9 declares the handle
// interfaces but omits directory iteration, the permission methods, and
// the picker entry point.
export {};

declare global {
  interface FileSystemHandlePermissionDescriptor {
    mode?: 'read' | 'readwrite';
  }

  interface FileSystemHandle {
    queryPermission(
      descriptor?: FileSystemHandlePermissionDescriptor,
    ): Promise<'granted' | 'denied' | 'prompt'>;
    requestPermission(
      descriptor?: FileSystemHandlePermissionDescriptor,
    ): Promise<'granted' | 'denied' | 'prompt'>;
  }

  interface FileSystemDirectoryHandle {
    keys(): AsyncIterableIterator<string>;
    values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>;
    entries(): AsyncIterableIterator<
      [string, FileSystemDirectoryHandle | FileSystemFileHandle]
    >;
    [Symbol.asyncIterator](): AsyncIterableIterator<
      [string, FileSystemDirectoryHandle | FileSystemFileHandle]
    >;
  }

  interface DirectoryPickerOptions {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: string | FileSystemHandle;
  }

  interface Window {
    showDirectoryPicker?: (
      options?: DirectoryPickerOptions,
    ) => Promise<FileSystemDirectoryHandle>;
  }
}
```

- [ ] **Step 2: Write the shared types**

Create `frontend/src/lib/localFs/types.ts`:

```typescript
export type LocalFsMode = 'fsa' | 'legacy' | 'unsupported';

export type PermissionState = 'granted' | 'prompt' | 'denied';

export type LocalEntry =
  | { kind: 'file'; name: string; handle: FileSystemFileHandle }
  | { kind: 'directory'; name: string; handle: FileSystemDirectoryHandle };
```

- [ ] **Step 3: Write the failing test**

Create `frontend/src/lib/localFs/capability.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectLocalFsMode } from './capability';

function fakeWindow(overrides: Partial<Window>): Window {
  return { isSecureContext: true, ...overrides } as unknown as Window;
}

describe('detectLocalFsMode', () => {
  it('returns fsa when showDirectoryPicker exists in a secure context', () => {
    const win = fakeWindow({ showDirectoryPicker: async () => ({}) as FileSystemDirectoryHandle });
    expect(detectLocalFsMode(win)).toBe('fsa');
  });

  it('returns legacy when the picker is absent but directory input is supported', () => {
    const win = fakeWindow({ document: { createElement: () => ({ webkitdirectory: false }) } as unknown as Document });
    expect(detectLocalFsMode(win)).toBe('legacy');
  });

  it('returns legacy when the picker exists but the context is insecure', () => {
    const win = fakeWindow({
      isSecureContext: false,
      showDirectoryPicker: async () => ({}) as FileSystemDirectoryHandle,
      document: { createElement: () => ({ webkitdirectory: false }) } as unknown as Document,
    });
    expect(detectLocalFsMode(win)).toBe('legacy');
  });

  it('returns unsupported when neither mechanism is available', () => {
    const win = fakeWindow({ document: { createElement: () => ({}) } as unknown as Document });
    expect(detectLocalFsMode(win)).toBe('unsupported');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- src/lib/localFs/capability.test.ts`
Expected: FAIL — cannot resolve `./capability`.

- [ ] **Step 5: Write the implementation**

Create `frontend/src/lib/localFs/capability.ts`:

```typescript
import type { LocalFsMode } from './types';

/**
 * Decides which local-filesystem mechanism this browser can offer.
 *
 * 'fsa'         — File System Access API: persistent handles and write access.
 * 'legacy'      — <input webkitdirectory>: one-shot read-only snapshot.
 * 'unsupported' — neither; typically a mobile browser.
 *
 * The picker requires a secure context, so an insecure origin falls back to
 * 'legacy' even in Chromium.
 */
export function detectLocalFsMode(win: Window = window): LocalFsMode {
  if (typeof win.showDirectoryPicker === 'function' && win.isSecureContext) {
    return 'fsa';
  }
  if ('webkitdirectory' in win.document.createElement('input')) {
    return 'legacy';
  }
  return 'unsupported';
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- src/lib/localFs/capability.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Verify types compile**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/types/fileSystemAccess.d.ts frontend/src/lib/localFs/types.ts frontend/src/lib/localFs/capability.ts frontend/src/lib/localFs/capability.test.ts
```

```bash
git commit -m "feat(files): add File System Access ambient types and capability detection"
```

---

### Task 2: Fake filesystem test double + lazy directory listing

**Files:**
- Create: `frontend/src/test/fakeFileSystem.ts`
- Create: `frontend/src/lib/localFs/tree.ts`
- Test: `frontend/src/lib/localFs/tree.test.ts`

**Interfaces:**
- Consumes: `LocalEntry` from Task 1
- Produces:
  - `makeFakeDirectory(name: string, contents: FakeContents): FileSystemDirectoryHandle`
  - `type FakeContents = { [name: string]: string | FakeContents }` — a string value is a file's text, a nested object is a subdirectory
  - `listDirectory(handle: FileSystemDirectoryHandle, options?: { showHidden?: boolean }): Promise<LocalEntry[]>`

- [ ] **Step 1: Write the fake filesystem helper**

Create `frontend/src/test/fakeFileSystem.ts`:

```typescript
export type FakeContents = { [name: string]: string | FakeContents };

/**
 * Builds an in-memory stand-in for FileSystemDirectoryHandle.
 *
 * Real handles are plain objects with async methods, so a hand-rolled fake is
 * enough to test the localFs layer without browser automation.
 */
export function makeFakeDirectory(
  name: string,
  contents: FakeContents,
): FileSystemDirectoryHandle {
  const children = new Map<string, FileSystemDirectoryHandle | FileSystemFileHandle>();

  for (const [childName, value] of Object.entries(contents)) {
    children.set(
      childName,
      typeof value === 'string'
        ? makeFakeFile(childName, value)
        : makeFakeDirectory(childName, value),
    );
  }

  const handle = {
    kind: 'directory' as const,
    name,
    async *entries() {
      for (const entry of children.entries()) yield entry;
    },
    async *values() {
      for (const value of children.values()) yield value;
    },
    async *keys() {
      for (const key of children.keys()) yield key;
    },
    async getDirectoryHandle(childName: string) {
      const child = children.get(childName);
      if (!child || child.kind !== 'directory') {
        throw new DOMException(`${childName} not found`, 'NotFoundError');
      }
      return child;
    },
    async getFileHandle(childName: string) {
      const child = children.get(childName);
      if (!child || child.kind !== 'file') {
        throw new DOMException(`${childName} not found`, 'NotFoundError');
      }
      return child;
    },
    async queryPermission() {
      return 'granted' as const;
    },
    async requestPermission() {
      return 'granted' as const;
    },
    async isSameEntry(other: FileSystemHandle) {
      return other === (handle as unknown as FileSystemHandle);
    },
  };

  return handle as unknown as FileSystemDirectoryHandle;
}

export function makeFakeFile(
  name: string,
  text: string,
  lastModified = 0,
): FileSystemFileHandle {
  const handle = {
    kind: 'file' as const,
    name,
    async getFile() {
      const file = new File([text], name, { lastModified });
      return file;
    },
    async queryPermission() {
      return 'granted' as const;
    },
    async requestPermission() {
      return 'granted' as const;
    },
    async isSameEntry(other: FileSystemHandle) {
      return other === (handle as unknown as FileSystemHandle);
    },
  };

  return handle as unknown as FileSystemFileHandle;
}
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/lib/localFs/tree.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { makeFakeDirectory } from '../../test/fakeFileSystem';
import { listDirectory } from './tree';

const vault = makeFakeDirectory('Cowork OS', {
  'zebra.md': '# Zebra',
  'Alpha.md': '# Alpha',
  '.obsidian': { 'config.json': '{}' },
  node_modules: { 'thing.js': '' },
  Projects: { 'plan.md': '# Plan' },
  archive: { 'old.md': '# Old' },
  '.env': 'SECRET=1',
});

describe('listDirectory', () => {
  it('sorts directories before files', async () => {
    const entries = await listDirectory(vault);
    const kinds = entries.map((e) => e.kind);
    expect(kinds.indexOf('file')).toBeGreaterThan(kinds.lastIndexOf('directory'));
  });

  it('sorts names case-insensitively within a kind', async () => {
    const entries = await listDirectory(vault);
    expect(entries.filter((e) => e.kind === 'directory').map((e) => e.name)).toEqual([
      'archive',
      'Projects',
    ]);
    expect(entries.filter((e) => e.kind === 'file').map((e) => e.name)).toEqual([
      'Alpha.md',
      'zebra.md',
    ]);
  });

  it('hides dot-entries and node_modules by default', async () => {
    const names = (await listDirectory(vault)).map((e) => e.name);
    expect(names).not.toContain('.obsidian');
    expect(names).not.toContain('.env');
    expect(names).not.toContain('node_modules');
  });

  it('includes hidden entries when asked, but never node_modules', async () => {
    const names = (await listDirectory(vault, { showHidden: true })).map((e) => e.name);
    expect(names).toContain('.obsidian');
    expect(names).toContain('.env');
    expect(names).not.toContain('node_modules');
  });

  it('returns an empty array for an empty directory', async () => {
    expect(await listDirectory(makeFakeDirectory('empty', {}))).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/lib/localFs/tree.test.ts`
Expected: FAIL — cannot resolve `./tree`.

- [ ] **Step 4: Write the implementation**

Create `frontend/src/lib/localFs/tree.ts`:

```typescript
import type { LocalEntry } from './types';

const ALWAYS_HIDDEN = new Set(['node_modules']);

/**
 * Lists one directory's immediate children. Deliberately NOT recursive: a large
 * vault would stall the tab if the whole tree were read on open, so callers
 * expand one level at a time.
 */
export async function listDirectory(
  handle: FileSystemDirectoryHandle,
  options: { showHidden?: boolean } = {},
): Promise<LocalEntry[]> {
  const entries: LocalEntry[] = [];

  for await (const [name, child] of handle.entries()) {
    if (ALWAYS_HIDDEN.has(name)) continue;
    if (!options.showHidden && name.startsWith('.')) continue;

    entries.push(
      child.kind === 'directory'
        ? { kind: 'directory', name, handle: child }
        : { kind: 'file', name, handle: child },
    );
  }

  return entries.sort(compareEntries);
}

function compareEntries(a: LocalEntry, b: LocalEntry): number {
  if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/lib/localFs/tree.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/test/fakeFileSystem.ts frontend/src/lib/localFs/tree.ts frontend/src/lib/localFs/tree.test.ts
```

```bash
git commit -m "feat(files): add lazy directory listing with fake-filesystem test double"
```

---

### Task 3: Persist directory handles in IndexedDB

Directory handles are structured-cloneable, so IndexedDB can store them directly. `localStorage` cannot — it is string-only. This is hand-rolled rather than pulling in a wrapper library; it is about fifty lines and avoids another dependency in a repo already carrying heavy Dependabot traffic.

**Files:**
- Create: `frontend/src/lib/localFs/handleStore.ts`
- Test: `frontend/src/lib/localFs/handleStore.test.ts`
- Modify: `frontend/package.json` (add `fake-indexeddb` devDependency)
- Modify: `frontend/src/test/setup.ts` (import the fake-indexeddb auto-setup)

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `type StoredFolder = { id: string; name: string; handle: FileSystemDirectoryHandle; lastOpenedAt: number }`
  - `saveFolder(handle: FileSystemDirectoryHandle): Promise<StoredFolder>`
  - `listFolders(): Promise<StoredFolder[]>` — newest `lastOpenedAt` first
  - `touchFolder(id: string): Promise<void>`
  - `removeFolder(id: string): Promise<void>`

- [ ] **Step 1: Add the test dependency**

jsdom has no IndexedDB implementation, so tests need one.

```bash
cd frontend
```

```bash
npm install --save-dev fake-indexeddb
```

- [ ] **Step 2: Register it in the test setup**

Add this line at the very top of `frontend/src/test/setup.ts`, above the existing `@testing-library/jest-dom` import:

```typescript
import 'fake-indexeddb/auto';
```

- [ ] **Step 3: Write the failing test**

Create `frontend/src/lib/localFs/handleStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { makeFakeDirectory } from '../../test/fakeFileSystem';
import { saveFolder, listFolders, touchFolder, removeFolder, resetForTests } from './handleStore';

describe('handleStore', () => {
  beforeEach(async () => {
    await resetForTests();
  });

  it('saves a folder and reads it back', async () => {
    const handle = makeFakeDirectory('Cowork OS', {});
    const saved = await saveFolder(handle);

    expect(saved.name).toBe('Cowork OS');
    const all = await listFolders();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(saved.id);
  });

  it('lists most-recently-opened first', async () => {
    const first = await saveFolder(makeFakeDirectory('First', {}));
    const second = await saveFolder(makeFakeDirectory('Second', {}));

    await touchFolder(first.id);

    expect((await listFolders()).map((f) => f.name)).toEqual(['First', 'Second']);
    expect(second.name).toBe('Second');
  });

  it('removes a folder', async () => {
    const saved = await saveFolder(makeFakeDirectory('Gone', {}));
    await removeFolder(saved.id);
    expect(await listFolders()).toEqual([]);
  });

  it('returns an empty list before anything is saved', async () => {
    expect(await listFolders()).toEqual([]);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- src/lib/localFs/handleStore.test.ts`
Expected: FAIL — cannot resolve `./handleStore`.

- [ ] **Step 5: Write the implementation**

Create `frontend/src/lib/localFs/handleStore.ts`:

```typescript
const DB_NAME = 'notez-local-folders';
const STORE = 'folders';
const DB_VERSION = 1;

export type StoredFolder = {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  lastOpenedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await fn(db.transaction(STORE, mode).objectStore(STORE));
  } finally {
    db.close();
  }
}

export async function saveFolder(
  handle: FileSystemDirectoryHandle,
): Promise<StoredFolder> {
  const record: StoredFolder = {
    id: crypto.randomUUID(),
    name: handle.name,
    handle,
    lastOpenedAt: Date.now(),
  };
  await withStore('readwrite', (store) => promisify(store.put(record)));
  return record;
}

export async function listFolders(): Promise<StoredFolder[]> {
  const all = await withStore('readonly', (store) =>
    promisify(store.getAll() as IDBRequest<StoredFolder[]>),
  );
  return all.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

export async function touchFolder(id: string): Promise<void> {
  await withStore('readwrite', async (store) => {
    const existing = await promisify(store.get(id) as IDBRequest<StoredFolder | undefined>);
    if (!existing) return;
    await promisify(store.put({ ...existing, lastOpenedAt: Date.now() }));
  });
}

export async function removeFolder(id: string): Promise<void> {
  await withStore('readwrite', (store) => promisify(store.delete(id)));
}

/** Test-only: drops the database so each test starts clean. */
export async function resetForTests(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}
```

Note on the `lastOpenedAt` test: `Date.now()` can return the same millisecond twice. If the "lists most-recently-opened first" test proves flaky, make `touchFolder` write `Math.max(Date.now(), existing.lastOpenedAt + 1)` rather than adding a sleep to the test.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- src/lib/localFs/handleStore.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/test/setup.ts frontend/src/lib/localFs/handleStore.ts frontend/src/lib/localFs/handleStore.test.ts
```

```bash
git commit -m "feat(files): persist local directory handles in IndexedDB"
```

---

### Task 4: Permission checking and reconnect

**Files:**
- Create: `frontend/src/lib/localFs/permissions.ts`
- Test: `frontend/src/lib/localFs/permissions.test.ts`

**Interfaces:**
- Consumes: `PermissionState` from Task 1
- Produces:
  - `checkPermission(handle: FileSystemDirectoryHandle): Promise<PermissionState>`
  - `requestAccess(handle: FileSystemDirectoryHandle): Promise<PermissionState>` — **must be called from inside a user gesture**

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/localFs/permissions.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { checkPermission, requestAccess } from './permissions';
import type { PermissionState } from './types';

function handleWith(
  query: PermissionState,
  request: PermissionState = 'granted',
): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name: 'Cowork OS',
    queryPermission: vi.fn().mockResolvedValue(query),
    requestPermission: vi.fn().mockResolvedValue(request),
  } as unknown as FileSystemDirectoryHandle;
}

describe('checkPermission', () => {
  it('reports granted', async () => {
    expect(await checkPermission(handleWith('granted'))).toBe('granted');
  });

  it('reports prompt', async () => {
    expect(await checkPermission(handleWith('prompt'))).toBe('prompt');
  });

  it('reports denied', async () => {
    expect(await checkPermission(handleWith('denied'))).toBe('denied');
  });

  it('treats a thrown query as denied rather than crashing', async () => {
    const handle = {
      queryPermission: vi.fn().mockRejectedValue(new Error('gone')),
    } as unknown as FileSystemDirectoryHandle;
    expect(await checkPermission(handle)).toBe('denied');
  });

  it('asks for read access, not readwrite, in phase 1', async () => {
    const handle = handleWith('granted');
    await checkPermission(handle);
    expect(handle.queryPermission).toHaveBeenCalledWith({ mode: 'read' });
  });
});

describe('requestAccess', () => {
  it('returns the granted result', async () => {
    expect(await requestAccess(handleWith('prompt', 'granted'))).toBe('granted');
  });

  it('returns denied when the user dismisses the prompt', async () => {
    expect(await requestAccess(handleWith('prompt', 'denied'))).toBe('denied');
  });

  it('treats a thrown request as denied', async () => {
    const handle = {
      requestPermission: vi.fn().mockRejectedValue(new Error('not a user gesture')),
    } as unknown as FileSystemDirectoryHandle;
    expect(await requestAccess(handle)).toBe('denied');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/localFs/permissions.test.ts`
Expected: FAIL — cannot resolve `./permissions`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/localFs/permissions.ts`:

```typescript
import type { PermissionState } from './types';

// Phase 1 is read-only. Phase 2 raises this to 'readwrite' when editing lands.
const MODE = { mode: 'read' } as const;

/**
 * Reports whether we still hold access to a stored handle.
 *
 * A stored handle usually comes back as 'prompt' on a new session — the handle
 * persists, the grant typically does not. Callers must render a button rather
 * than auto-calling requestAccess, which only works inside a user gesture.
 */
export async function checkPermission(
  handle: FileSystemDirectoryHandle,
): Promise<PermissionState> {
  try {
    return await handle.queryPermission(MODE);
  } catch {
    return 'denied';
  }
}

/** Must be called synchronously from a user gesture (a click handler). */
export async function requestAccess(
  handle: FileSystemDirectoryHandle,
): Promise<PermissionState> {
  try {
    return await handle.requestPermission(MODE);
  } catch {
    return 'denied';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/localFs/permissions.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/localFs/permissions.ts frontend/src/lib/localFs/permissions.test.ts
```

```bash
git commit -m "feat(files): add permission checking and reconnect helpers"
```

---

### Task 5: Resolve relative paths to blob URLs

Without this, every embedded image in a real markdown vault renders broken.

**Files:**
- Create: `frontend/src/lib/localFs/resolve.ts`
- Test: `frontend/src/lib/localFs/resolve.test.ts`

**Interfaces:**
- Consumes: `makeFakeDirectory` from Task 2
- Produces:
  - `resolveFile(root: FileSystemDirectoryHandle, dirSegments: string[], relativePath: string): Promise<File | null>`
  - `isRelativePath(path: string): boolean`

`dirSegments` is the path of the directory containing the markdown file, relative to `root` — e.g. `['Projects']` for `Cowork OS/Projects/plan.md`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/localFs/resolve.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { makeFakeDirectory } from '../../test/fakeFileSystem';
import { resolveFile, isRelativePath } from './resolve';

const root = makeFakeDirectory('Cowork OS', {
  'top.png': 'TOPBYTES',
  images: { 'shared.png': 'SHAREDBYTES' },
  Projects: {
    'plan.md': '# Plan',
    assets: { 'diagram.png': 'DIAGRAMBYTES' },
  },
});

describe('isRelativePath', () => {
  it('accepts relative paths', () => {
    expect(isRelativePath('./a.png')).toBe(true);
    expect(isRelativePath('assets/a.png')).toBe(true);
    expect(isRelativePath('../images/a.png')).toBe(true);
  });

  it('rejects absolute and remote references', () => {
    expect(isRelativePath('https://example.com/a.png')).toBe(false);
    expect(isRelativePath('/a.png')).toBe(false);
    expect(isRelativePath('data:image/png;base64,AAAA')).toBe(false);
    expect(isRelativePath('blob:http://x/y')).toBe(false);
  });
});

describe('resolveFile', () => {
  it('resolves a sibling file', async () => {
    const file = await resolveFile(root, ['Projects'], './assets/diagram.png');
    expect(await file?.text()).toBe('DIAGRAMBYTES');
  });

  it('resolves without a leading ./', async () => {
    const file = await resolveFile(root, ['Projects'], 'assets/diagram.png');
    expect(await file?.text()).toBe('DIAGRAMBYTES');
  });

  it('resolves a parent-relative path', async () => {
    const file = await resolveFile(root, ['Projects'], '../images/shared.png');
    expect(await file?.text()).toBe('SHAREDBYTES');
  });

  it('resolves from the root directory', async () => {
    const file = await resolveFile(root, [], 'top.png');
    expect(await file?.text()).toBe('TOPBYTES');
  });

  it('decodes percent-encoded names', async () => {
    const spaced = makeFakeDirectory('r', { 'my file.png': 'SPACED' });
    const file = await resolveFile(spaced, [], 'my%20file.png');
    expect(await file?.text()).toBe('SPACED');
  });

  it('returns null for a missing file instead of throwing', async () => {
    expect(await resolveFile(root, ['Projects'], './nope.png')).toBeNull();
  });

  it('returns null rather than escaping above the root', async () => {
    expect(await resolveFile(root, [], '../../etc/passwd')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/localFs/resolve.test.ts`
Expected: FAIL — cannot resolve `./resolve`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/localFs/resolve.ts`:

```typescript
/**
 * True for paths we should resolve against the picked directory. Absolute
 * paths, remote URLs, data: and blob: references are left alone.
 */
export function isRelativePath(path: string): boolean {
  if (path.startsWith('/')) return false;
  return !/^[a-z][a-z0-9+.-]*:/i.test(path);
}

/**
 * Walks a relative path from the directory containing a markdown file and
 * returns the File it names, or null if it does not resolve.
 *
 * Never escapes above `root`: the browser grants access to that tree only, and
 * a '..' that would climb past it returns null.
 */
export async function resolveFile(
  root: FileSystemDirectoryHandle,
  dirSegments: string[],
  relativePath: string,
): Promise<File | null> {
  const withoutQuery = relativePath.split(/[?#]/)[0];
  if (!withoutQuery || !isRelativePath(withoutQuery)) return null;

  const segments = [...dirSegments];

  for (const raw of withoutQuery.split('/')) {
    const segment = safeDecode(raw);
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  const fileName = segments.pop();
  if (!fileName) return null;

  try {
    let dir = root;
    for (const segment of segments) {
      dir = await dir.getDirectoryHandle(segment);
    }
    const fileHandle = await dir.getFileHandle(fileName);
    return await fileHandle.getFile();
  } catch {
    return null;
  }
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/localFs/resolve.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/localFs/resolve.ts frontend/src/lib/localFs/resolve.test.ts
```

```bash
git commit -m "feat(files): resolve relative asset paths within the picked directory"
```

---

### Task 6: Render markdown safely, with local images resolved

The sanitization test in this task is the highest-severity item in the spec. A local `.md` file can contain `<script>` or `<img onerror=...>`; rendering it unsanitized executes that script in the user's authenticated Notez origin.

**Files:**
- Create: `frontend/src/lib/localFs/renderMarkdown.ts`
- Test: `frontend/src/lib/localFs/renderMarkdown.test.ts`

**Interfaces:**
- Consumes: `resolveFile`, `isRelativePath` from Task 5
- Produces:
  - `renderLocalMarkdown(markdown: string, context: RenderContext): Promise<RenderedMarkdown>`
  - `type RenderContext = { root: FileSystemDirectoryHandle; dirSegments: string[] }`
  - `type RenderedMarkdown = { html: string; blobUrls: string[] }` — the caller revokes `blobUrls` on unmount

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/localFs/renderMarkdown.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { makeFakeDirectory } from '../../test/fakeFileSystem';
import { renderLocalMarkdown } from './renderMarkdown';

const root = makeFakeDirectory('Cowork OS', {
  'diagram.png': 'PNGBYTES',
  notes: { 'inner.png': 'INNERBYTES' },
});

const context = { root, dirSegments: [] };

beforeAll(() => {
  // jsdom implements neither of these.
  let counter = 0;
  URL.createObjectURL = () => `blob:test/${counter++}`;
  URL.revokeObjectURL = () => {};
});

describe('renderLocalMarkdown', () => {
  it('renders standard markdown', async () => {
    const { html } = await renderLocalMarkdown('# Title\n\nSome **bold** text.', context);
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('strips script tags', async () => {
    const { html } = await renderLocalMarkdown('Hi\n\n<script>alert(1)</script>', context);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
  });

  it('strips inline event handlers', async () => {
    const { html } = await renderLocalMarkdown('<img src="x" onerror="alert(1)">', context);
    expect(html).not.toContain('onerror');
  });

  it('strips javascript: hrefs', async () => {
    const { html } = await renderLocalMarkdown('[click](javascript:alert(1))', context);
    expect(html).not.toContain('javascript:');
  });

  it('rewrites a relative image to a blob URL', async () => {
    const { html, blobUrls } = await renderLocalMarkdown('![d](./diagram.png)', context);
    expect(html).toContain('blob:test/');
    expect(blobUrls).toHaveLength(1);
  });

  it('leaves remote images untouched', async () => {
    const { html, blobUrls } = await renderLocalMarkdown(
      '![d](https://example.com/a.png)',
      context,
    );
    expect(html).toContain('https://example.com/a.png');
    expect(blobUrls).toHaveLength(0);
  });

  it('leaves an unresolvable relative image without a blob URL', async () => {
    const { blobUrls } = await renderLocalMarkdown('![d](./missing.png)', context);
    expect(blobUrls).toHaveLength(0);
  });

  it('renders YAML frontmatter as content rather than crashing', async () => {
    const { html } = await renderLocalMarkdown('---\ntitle: X\n---\n\n# Body', context);
    expect(html).toContain('Body');
  });

  it('renders tables', async () => {
    const { html } = await renderLocalMarkdown('| a | b |\n|---|---|\n| 1 | 2 |', context);
    expect(html).toContain('<table>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/localFs/renderMarkdown.test.ts`
Expected: FAIL — cannot resolve `./renderMarkdown`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/localFs/renderMarkdown.ts`:

```typescript
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { resolveFile, isRelativePath } from './resolve';

export type RenderContext = {
  root: FileSystemDirectoryHandle;
  dirSegments: string[];
};

export type RenderedMarkdown = {
  html: string;
  /** Caller must revoke these when the rendered output is discarded. */
  blobUrls: string[];
};

/**
 * Markdown -> HTML -> DOMPurify -> local image resolution.
 *
 * Sanitization is not optional: local files are untrusted input, and rendering
 * one unsanitized would run its script inside the user's authenticated origin.
 */
export async function renderLocalMarkdown(
  markdown: string,
  context: RenderContext,
): Promise<RenderedMarkdown> {
  const rawHtml = await marked.parse(markdown, { async: true, gfm: true });
  const clean = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });

  const doc = new DOMParser().parseFromString(clean, 'text/html');
  const blobUrls: string[] = [];

  for (const img of Array.from(doc.querySelectorAll('img'))) {
    const src = img.getAttribute('src');
    if (!src || !isRelativePath(src)) continue;

    const file = await resolveFile(context.root, context.dirSegments, src);
    if (!file) {
      img.setAttribute('data-unresolved', 'true');
      continue;
    }

    const url = URL.createObjectURL(file);
    blobUrls.push(url);
    img.setAttribute('src', url);
  }

  return { html: doc.body.innerHTML, blobUrls };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/localFs/renderMarkdown.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/localFs/renderMarkdown.ts frontend/src/lib/localFs/renderMarkdown.test.ts
```

```bash
git commit -m "feat(files): render local markdown with sanitization and image resolution"
```

---

### Task 7: Viewer registry, markdown viewer, text viewer

**Files:**
- Create: `frontend/src/components/localFiles/viewerRegistry.ts`
- Create: `frontend/src/components/localFiles/viewers/MarkdownViewer.tsx`
- Create: `frontend/src/components/localFiles/viewers/MarkdownViewer.css`
- Create: `frontend/src/components/localFiles/viewers/TextViewer.tsx`
- Test: `frontend/src/components/localFiles/viewerRegistry.test.ts`
- Test: `frontend/src/components/localFiles/viewers/MarkdownViewer.test.tsx`

**Interfaces:**
- Consumes: `renderLocalMarkdown`, `RenderContext` from Task 6
- Produces:
  - `type ViewerKind = 'markdown' | 'text' | 'unsupported'`
  - `viewerKindFor(fileName: string): ViewerKind`
  - `<MarkdownViewer file={File} context={RenderContext} />`
  - `<TextViewer file={File} />`

Later phases add `'image' | 'pdf' | 'docx' | 'xlsx'` to `ViewerKind` and extend `viewerKindFor`. Nothing else changes.

- [ ] **Step 1: Write the failing registry test**

Create `frontend/src/components/localFiles/viewerRegistry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { viewerKindFor } from './viewerRegistry';

describe('viewerKindFor', () => {
  it('maps markdown extensions', () => {
    expect(viewerKindFor('notes.md')).toBe('markdown');
    expect(viewerKindFor('notes.markdown')).toBe('markdown');
    expect(viewerKindFor('NOTES.MD')).toBe('markdown');
  });

  it('maps plain-text extensions', () => {
    expect(viewerKindFor('log.txt')).toBe('text');
    expect(viewerKindFor('data.json')).toBe('text');
    expect(viewerKindFor('rows.csv')).toBe('text');
    expect(viewerKindFor('conf.yml')).toBe('text');
  });

  it('returns unsupported for types phase 1 does not handle', () => {
    expect(viewerKindFor('report.pdf')).toBe('unsupported');
    expect(viewerKindFor('photo.jpg')).toBe('unsupported');
    expect(viewerKindFor('sheet.xlsx')).toBe('unsupported');
  });

  it('returns unsupported for a file with no extension', () => {
    expect(viewerKindFor('LICENSE')).toBe('unsupported');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/localFiles/viewerRegistry.test.ts`
Expected: FAIL — cannot resolve `./viewerRegistry`.

- [ ] **Step 3: Write the registry**

Create `frontend/src/components/localFiles/viewerRegistry.ts`:

```typescript
export type ViewerKind = 'markdown' | 'text' | 'unsupported';

const MARKDOWN = new Set(['md', 'markdown', 'mdown', 'mkd']);

const TEXT = new Set([
  'txt', 'log', 'json', 'csv', 'tsv', 'yml', 'yaml', 'xml',
  'ini', 'toml', 'env', 'sh', 'js', 'ts', 'tsx', 'jsx',
  'css', 'html', 'py', 'rb', 'go', 'rs', 'sql',
]);

export function viewerKindFor(fileName: string): ViewerKind {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return 'unsupported';

  const ext = fileName.slice(dot + 1).toLowerCase();
  if (MARKDOWN.has(ext)) return 'markdown';
  if (TEXT.has(ext)) return 'text';
  return 'unsupported';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/localFiles/viewerRegistry.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing MarkdownViewer test**

Create `frontend/src/components/localFiles/viewers/MarkdownViewer.test.tsx`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { makeFakeDirectory } from '../../../test/fakeFileSystem';
import { MarkdownViewer } from './MarkdownViewer';

beforeAll(() => {
  let counter = 0;
  URL.createObjectURL = () => `blob:test/${counter++}`;
  URL.revokeObjectURL = () => {};
});

const context = { root: makeFakeDirectory('Cowork OS', {}), dirSegments: [] };

describe('MarkdownViewer', () => {
  it('renders headings from the file', async () => {
    const file = new File(['# Cowork OS'], 'index.md');
    render(<MarkdownViewer file={file} context={context} />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Cowork OS' })).toBeInTheDocument();
    });
  });

  it('does not inject script content from the file', async () => {
    const file = new File(['<script>window.__pwned = true</script>hello'], 'x.md');
    const { container } = render(<MarkdownViewer file={file} context={context} />);
    await waitFor(() => expect(container.textContent).toContain('hello'));
    expect(container.querySelector('script')).toBeNull();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- src/components/localFiles/viewers/MarkdownViewer.test.tsx`
Expected: FAIL — cannot resolve `./MarkdownViewer`.

- [ ] **Step 7: Write both viewer components**

Create `frontend/src/components/localFiles/viewers/MarkdownViewer.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { renderLocalMarkdown } from '../../../lib/localFs/renderMarkdown';
import type { RenderContext } from '../../../lib/localFs/renderMarkdown';
import './MarkdownViewer.css';

type Props = {
  file: File;
  context: RenderContext;
};

export function MarkdownViewer({ file, context }: Props) {
  const [html, setHtml] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let urls: string[] = [];

    async function run() {
      try {
        const text = await file.text();
        const rendered = await renderLocalMarkdown(text, context);
        if (cancelled) {
          rendered.blobUrls.forEach((url) => URL.revokeObjectURL(url));
          return;
        }
        urls = rendered.blobUrls;
        setHtml(rendered.html);
        setError(null);
      } catch {
        if (!cancelled) setError('This file could not be read.');
      }
    }

    void run();

    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [file, context]);

  if (error) {
    return <p className="p-6 text-sm text-red-600 dark:text-red-400">{error}</p>;
  }

  return (
    <article
      className="local-markdown max-w-none p-6"
      // Content is sanitized by renderLocalMarkdown via DOMPurify before it reaches here.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

Create `frontend/src/components/localFiles/viewers/TextViewer.tsx`:

```typescript
import { useEffect, useState } from 'react';

export function TextViewer({ file }: { file: File }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    file
      .text()
      .then((value) => {
        if (!cancelled) setText(value);
      })
      .catch(() => {
        if (!cancelled) setError('This file could not be read.');
      });

    return () => {
      cancelled = true;
    };
  }, [file]);

  if (error) {
    return <p className="p-6 text-sm text-red-600 dark:text-red-400">{error}</p>;
  }

  return (
    <pre className="p-6 text-sm font-mono whitespace-pre-wrap break-words text-gray-900 dark:text-gray-100">
      {text}
    </pre>
  );
}
```

Create `frontend/src/components/localFiles/viewers/MarkdownViewer.css`:

```css
/*
 * The repo does not use @tailwindcss/typography — tailwind.config.js has
 * `plugins: []`, and TiptapEditor.css hand-rolls its own `.tiptap-editor.prose`
 * rules. These mirror those values so local markdown matches note rendering,
 * plus table styles that the editor does not need.
 */
.local-markdown {
  color: #1f2937;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.dark .local-markdown {
  color: #f3f4f6;
}

.local-markdown h1 {
  font-size: 2em;
  font-weight: 700;
  margin-top: 0.5em;
  margin-bottom: 0.5em;
  line-height: 1.2;
}

.local-markdown h2 {
  font-size: 1.5em;
  font-weight: 600;
  margin-top: 0.75em;
  margin-bottom: 0.5em;
  line-height: 1.3;
}

.local-markdown h3 {
  font-size: 1.25em;
  font-weight: 600;
  margin-top: 0.75em;
  margin-bottom: 0.5em;
  line-height: 1.4;
}

.local-markdown h4 {
  font-size: 1.1em;
  font-weight: 600;
  margin-top: 0.5em;
  margin-bottom: 0.5em;
}

.local-markdown p {
  margin-top: 0.75em;
  margin-bottom: 0.75em;
}

.local-markdown strong {
  font-weight: 600;
}

.local-markdown em {
  font-style: italic;
}

.local-markdown a {
  color: #2563eb;
  text-decoration: underline;
}

.dark .local-markdown a {
  color: #60a5fa;
}

.local-markdown code {
  background-color: rgba(135, 131, 120, 0.15);
  border-radius: 3px;
  padding: 0.2em 0.4em;
  font-family: 'Monaco', 'Courier New', monospace;
  font-size: 0.9em;
}

.local-markdown pre {
  background-color: rgba(135, 131, 120, 0.15);
  border-radius: 5px;
  padding: 1em;
  overflow-x: auto;
  margin: 1em 0;
  max-width: 100%;
  white-space: pre-wrap;
}

.local-markdown pre code {
  background-color: transparent;
  padding: 0;
  font-size: 0.875em;
  white-space: pre-wrap;
}

.local-markdown ul,
.local-markdown ol {
  margin-top: 0.75em;
  margin-bottom: 0.75em;
  padding-left: 1.5em;
}

.local-markdown ul {
  list-style-type: disc;
}

.local-markdown ol {
  list-style-type: decimal;
}

.local-markdown li {
  margin-top: 0.25em;
  margin-bottom: 0.25em;
  display: list-item;
}

.local-markdown blockquote {
  border-left: 3px solid #d1d5db;
  padding-left: 1em;
  margin: 1em 0;
  font-style: italic;
  color: #6b7280;
}

.local-markdown hr {
  border: none;
  border-top: 2px solid #e5e7eb;
  margin: 2em 0;
}

.local-markdown img {
  max-width: 100%;
  height: auto;
}

.local-markdown img[data-unresolved='true'] {
  display: inline-block;
  min-width: 8rem;
  padding: 0.5rem;
  border: 1px dashed #d1d5db;
  border-radius: 4px;
}

/* Wide tables scroll inside their own container rather than the page. */
.local-markdown table {
  display: block;
  overflow-x: auto;
  border-collapse: collapse;
  margin: 1em 0;
  max-width: 100%;
}

.local-markdown th,
.local-markdown td {
  border: 1px solid #e5e7eb;
  padding: 0.4em 0.7em;
  text-align: left;
}

.dark .local-markdown th,
.dark .local-markdown td {
  border-color: #374151;
}

.local-markdown th {
  font-weight: 600;
  background-color: rgba(135, 131, 120, 0.1);
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- src/components/localFiles`
Expected: PASS, 6 tests.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/localFiles
```

```bash
git commit -m "feat(files): add viewer registry with markdown and text viewers"
```

---

### Task 8: File tree component

**Files:**
- Create: `frontend/src/components/localFiles/FileTree.tsx`
- Test: `frontend/src/components/localFiles/FileTree.test.tsx`

**Interfaces:**
- Consumes: `listDirectory` (Task 2), `LocalEntry` (Task 1)
- Produces: `<FileTree root={FileSystemDirectoryHandle} selectedPath={string[] | null} showHidden={boolean} onSelectFile={(handle, dirSegments) => void} />`

`showHidden` satisfies spec §6.3's requirement that hidden-entry filtering be toggleable. Task 11 supplies the control that drives it.

`dirSegments` passed to `onSelectFile` is the path of the file's containing directory relative to `root`, matching what `resolveFile` and `RenderContext` expect.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/localFiles/FileTree.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeFakeDirectory } from '../../test/fakeFileSystem';
import { FileTree } from './FileTree';

const root = makeFakeDirectory('Cowork OS', {
  'index.md': '# Index',
  Projects: { 'plan.md': '# Plan' },
});

describe('FileTree', () => {
  it('lists the root entries', async () => {
    render(<FileTree root={root} selectedPath={null} onSelectFile={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('index.md')).toBeInTheDocument());
    expect(screen.getByText('Projects')).toBeInTheDocument();
  });

  it('does not read a subdirectory until it is expanded', async () => {
    render(<FileTree root={root} selectedPath={null} onSelectFile={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Projects')).toBeInTheDocument());
    expect(screen.queryByText('plan.md')).not.toBeInTheDocument();
  });

  it('reveals children when a directory is expanded', async () => {
    const user = userEvent.setup();
    render(<FileTree root={root} selectedPath={null} onSelectFile={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Projects')).toBeInTheDocument());

    await user.click(screen.getByText('Projects'));
    await waitFor(() => expect(screen.getByText('plan.md')).toBeInTheDocument());
  });

  it('reports the containing directory when a nested file is chosen', async () => {
    const user = userEvent.setup();
    const onSelectFile = vi.fn();
    render(<FileTree root={root} selectedPath={null} onSelectFile={onSelectFile} />);
    await waitFor(() => expect(screen.getByText('Projects')).toBeInTheDocument());

    await user.click(screen.getByText('Projects'));
    await waitFor(() => expect(screen.getByText('plan.md')).toBeInTheDocument());
    await user.click(screen.getByText('plan.md'));

    expect(onSelectFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'plan.md' }), [
      'Projects',
    ]);
  });

  it('reports an empty directory path for a root-level file', async () => {
    const user = userEvent.setup();
    const onSelectFile = vi.fn();
    render(<FileTree root={root} selectedPath={null} onSelectFile={onSelectFile} />);
    await waitFor(() => expect(screen.getByText('index.md')).toBeInTheDocument());

    await user.click(screen.getByText('index.md'));
    expect(onSelectFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'index.md' }),
      [],
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/localFiles/FileTree.test.tsx`
Expected: FAIL — cannot resolve `./FileTree`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/localFiles/FileTree.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, File as FileIcon, Folder } from 'lucide-react';
import { listDirectory } from '../../lib/localFs/tree';
import type { LocalEntry } from '../../lib/localFs/types';

type Props = {
  root: FileSystemDirectoryHandle;
  selectedPath: string[] | null;
  showHidden?: boolean;
  onSelectFile: (handle: FileSystemFileHandle, dirSegments: string[]) => void;
};

export function FileTree({ root, selectedPath, showHidden = false, onSelectFile }: Props) {
  return (
    <DirectoryNode
      handle={root}
      dirSegments={[]}
      selectedPath={selectedPath}
      showHidden={showHidden}
      onSelectFile={onSelectFile}
    />
  );
}

type NodeProps = {
  handle: FileSystemDirectoryHandle;
  dirSegments: string[];
  selectedPath: string[] | null;
  showHidden: boolean;
  onSelectFile: Props['onSelectFile'];
};

function DirectoryNode({
  handle,
  dirSegments,
  selectedPath,
  showHidden,
  onSelectFile,
}: NodeProps) {
  const [entries, setEntries] = useState<LocalEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    listDirectory(handle, { showHidden })
      .then((result) => {
        if (!cancelled) setEntries(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [handle, showHidden]);

  if (error) {
    return <p className="px-2 py-1 text-xs text-red-600 dark:text-red-400">Could not read folder</p>;
  }

  if (entries === null) {
    return <p className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">Loading…</p>;
  }

  if (entries.length === 0) {
    return <p className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">Empty</p>;
  }

  return (
    <ul className="space-y-0.5">
      {entries.map((entry) =>
        entry.kind === 'directory' ? (
          <DirectoryBranch
            key={entry.name}
            entry={entry}
            dirSegments={dirSegments}
            selectedPath={selectedPath}
            showHidden={showHidden}
            onSelectFile={onSelectFile}
          />
        ) : (
          <li key={entry.name}>
            <button
              type="button"
              onClick={() => onSelectFile(entry.handle, dirSegments)}
              className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                isSelected(selectedPath, dirSegments, entry.name)
                  ? 'bg-gray-200 dark:bg-gray-700 font-medium'
                  : ''
              } text-gray-900 dark:text-gray-100`}
            >
              <FileIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
              <span className="truncate">{entry.name}</span>
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

function DirectoryBranch({
  entry,
  dirSegments,
  selectedPath,
  showHidden,
  onSelectFile,
}: {
  entry: Extract<LocalEntry, { kind: 'directory' }>;
  dirSegments: string[];
  selectedPath: string[] | null;
  showHidden: boolean;
  onSelectFile: Props['onSelectFile'];
}) {
  const [expanded, setExpanded] = useState(false);
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <li>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
      >
        <Chevron className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
        <Folder className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
        <span className="truncate">{entry.name}</span>
      </button>
      {expanded && (
        <div className="ml-4 border-l border-gray-200 pl-1 dark:border-gray-700">
          <DirectoryNode
            handle={entry.handle}
            dirSegments={[...dirSegments, entry.name]}
            selectedPath={selectedPath}
            showHidden={showHidden}
            onSelectFile={onSelectFile}
          />
        </div>
      )}
    </li>
  );
}

function isSelected(
  selectedPath: string[] | null,
  dirSegments: string[],
  fileName: string,
): boolean {
  if (!selectedPath) return false;
  const full = [...dirSegments, fileName];
  return selectedPath.length === full.length && selectedPath.every((s, i) => s === full[i]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/localFiles/FileTree.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/localFiles/FileTree.tsx frontend/src/components/localFiles/FileTree.test.tsx
```

```bash
git commit -m "feat(files): add lazily-expanding file tree component"
```

---

### Task 9: File viewer shell with breadcrumbs

**Files:**
- Create: `frontend/src/components/localFiles/FileViewer.tsx`
- Create: `frontend/src/components/localFiles/Breadcrumbs.tsx`
- Test: `frontend/src/components/localFiles/FileViewer.test.tsx`

**Interfaces:**
- Consumes: `viewerKindFor` (Task 7), `MarkdownViewer`, `TextViewer` (Task 7)
- Produces: `<FileViewer root={FileSystemDirectoryHandle} fileHandle={FileSystemFileHandle} dirSegments={string[]} />`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/localFiles/FileViewer.test.tsx`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { makeFakeDirectory, makeFakeFile } from '../../test/fakeFileSystem';
import { FileViewer } from './FileViewer';

beforeAll(() => {
  let counter = 0;
  URL.createObjectURL = () => `blob:test/${counter++}`;
  URL.revokeObjectURL = () => {};
});

const root = makeFakeDirectory('Cowork OS', {});

describe('FileViewer', () => {
  it('renders a markdown file through the markdown viewer', async () => {
    render(
      <FileViewer root={root} fileHandle={makeFakeFile('a.md', '# Heading')} dirSegments={[]} />,
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Heading' })).toBeInTheDocument(),
    );
  });

  it('renders a text file as plain text', async () => {
    render(
      <FileViewer root={root} fileHandle={makeFakeFile('a.txt', 'raw content')} dirSegments={[]} />,
    );
    await waitFor(() => expect(screen.getByText('raw content')).toBeInTheDocument());
  });

  it('explains that an unsupported type has no preview', async () => {
    render(
      <FileViewer root={root} fileHandle={makeFakeFile('a.pdf', 'x')} dirSegments={[]} />,
    );
    await waitFor(() => expect(screen.getByText(/no preview/i)).toBeInTheDocument());
  });

  it('shows the file path as breadcrumbs', async () => {
    render(
      <FileViewer
        root={root}
        fileHandle={makeFakeFile('plan.md', '# Plan')}
        dirSegments={['Projects']}
      />,
    );
    await waitFor(() => expect(screen.getByText('Projects')).toBeInTheDocument());
    expect(screen.getByText('plan.md')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/localFiles/FileViewer.test.tsx`
Expected: FAIL — cannot resolve `./FileViewer`.

- [ ] **Step 3: Write the breadcrumbs component**

Create `frontend/src/components/localFiles/Breadcrumbs.tsx`:

```typescript
export function Breadcrumbs({ segments }: { segments: string[] }) {
  return (
    <nav
      aria-label="File path"
      className="flex flex-wrap items-center gap-1 border-b border-gray-200 px-6 py-2 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-400"
    >
      {segments.map((segment, index) => (
        <span key={`${segment}-${index}`} className="flex items-center gap-1">
          {index > 0 && <span aria-hidden="true">/</span>}
          <span className={index === segments.length - 1 ? 'text-gray-900 dark:text-gray-100' : ''}>
            {segment}
          </span>
        </span>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: Write the viewer shell**

Create `frontend/src/components/localFiles/FileViewer.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { Breadcrumbs } from './Breadcrumbs';
import { viewerKindFor } from './viewerRegistry';
import { MarkdownViewer } from './viewers/MarkdownViewer';
import { TextViewer } from './viewers/TextViewer';

type Props = {
  root: FileSystemDirectoryHandle;
  fileHandle: FileSystemFileHandle;
  dirSegments: string[];
};

export function FileViewer({ root, fileHandle, dirSegments }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFile(null);
    setError(null);

    fileHandle
      .getFile()
      .then((value) => {
        if (!cancelled) setFile(value);
      })
      .catch(() => {
        if (!cancelled) setError('This file could not be opened. It may have been moved or deleted.');
      });

    return () => {
      cancelled = true;
    };
  }, [fileHandle]);

  const kind = viewerKindFor(fileHandle.name);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Breadcrumbs segments={[...dirSegments, fileHandle.name]} />
      <div className="flex-1 overflow-auto">
        {error && <p className="p-6 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {!error && !file && (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        )}
        {file && kind === 'markdown' && (
          <MarkdownViewer file={file} context={{ root, dirSegments }} />
        )}
        {file && kind === 'text' && <TextViewer file={file} />}
        {file && kind === 'unsupported' && (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">
            No preview available for this file type yet.
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/components/localFiles/FileViewer.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/localFiles/FileViewer.tsx frontend/src/components/localFiles/Breadcrumbs.tsx frontend/src/components/localFiles/FileViewer.test.tsx
```

```bash
git commit -m "feat(files): add file viewer shell with breadcrumbs and type dispatch"
```

---

### Task 10: Fallback and unsupported-browser notices

**Files:**
- Create: `frontend/src/components/localFiles/UnsupportedBrowserNotice.tsx`
- Create: `frontend/src/components/localFiles/LegacyFolderPicker.tsx`
- Test: `frontend/src/components/localFiles/LegacyFolderPicker.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `<UnsupportedBrowserNotice />`
  - `<LegacyFolderPicker onFilesPicked={(files: File[]) => void} />`

The legacy path yields a flat `File[]` with `webkitRelativePath` set, not handles. Phase 1 shows those files as a flat, filterable list rather than a tree — a deliberate simplification, since this path exists to be honest about the limitation rather than to match the primary experience.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/localFiles/LegacyFolderPicker.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LegacyFolderPicker } from './LegacyFolderPicker';

describe('LegacyFolderPicker', () => {
  it('explains that the browser cannot save changes', () => {
    render(<LegacyFolderPicker onFilesPicked={vi.fn()} />);
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
  });

  it('reports the picked files', async () => {
    const user = userEvent.setup();
    const onFilesPicked = vi.fn();
    render(<LegacyFolderPicker onFilesPicked={onFilesPicked} />);

    const input = screen.getByTestId('legacy-folder-input');
    await user.upload(input, [new File(['# A'], 'a.md', { type: 'text/markdown' })]);

    expect(onFilesPicked).toHaveBeenCalled();
    expect(onFilesPicked.mock.calls[0][0][0].name).toBe('a.md');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/localFiles/LegacyFolderPicker.test.tsx`
Expected: FAIL — cannot resolve `./LegacyFolderPicker`.

- [ ] **Step 3: Write both components**

Create `frontend/src/components/localFiles/UnsupportedBrowserNotice.tsx`:

```typescript
import { Monitor } from 'lucide-react';

export function UnsupportedBrowserNotice() {
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <Monitor className="mx-auto mb-4 h-10 w-10 text-gray-400" aria-hidden="true" />
      <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
        Local folders need a desktop browser
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        This browser cannot open folders from your device. Open Notez in desktop Chrome or
        Edge to browse and edit local files.
      </p>
    </div>
  );
}
```

Create `frontend/src/components/localFiles/LegacyFolderPicker.tsx`:

```typescript
import { useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

type Props = {
  onFilesPicked: (files: File[]) => void;
};

/**
 * Fallback for browsers without the File System Access API.
 *
 * <input webkitdirectory> reads a one-shot snapshot into memory: the folder
 * must be re-picked each session and nothing can be written back.
 */
export function LegacyFolderPicker({ onFilesPicked }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <div className="mb-4 flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-3 text-left text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          This browser can only open local folders as <strong>read-only</strong>, and you will
          need to pick the folder again each visit. Use desktop Chrome or Edge to edit files
          and have Notez remember the folder.
        </p>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Choose folder
      </button>

      <input
        ref={inputRef}
        data-testid="legacy-folder-input"
        type="file"
        multiple
        // Non-standard attributes React does not type; both are needed for
        // directory selection across Chromium and Firefox.
        {...{ webkitdirectory: '', directory: '' }}
        className="hidden"
        onChange={(event) => onFilesPicked(Array.from(event.target.files ?? []))}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/localFiles/LegacyFolderPicker.test.tsx`
Expected: PASS, 2 tests.

If TypeScript rejects the spread of `webkitdirectory`, add to `frontend/src/types/fileSystemAccess.d.ts`:

```typescript
declare module 'react' {
  interface HTMLAttributes<T> {
    webkitdirectory?: string;
    directory?: string;
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/localFiles/UnsupportedBrowserNotice.tsx frontend/src/components/localFiles/LegacyFolderPicker.tsx frontend/src/components/localFiles/LegacyFolderPicker.test.tsx frontend/src/types/fileSystemAccess.d.ts
```

```bash
git commit -m "feat(files): add read-only fallback and unsupported-browser notices"
```

---

### Task 11: FilesPage — picker, reconnect, recent folders, wiring

**Files:**
- Create: `frontend/src/pages/FilesPage.tsx`
- Create: `frontend/src/components/localFiles/ReconnectPrompt.tsx`
- Test: `frontend/src/pages/FilesPage.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–10
- Produces: `<FilesPage />`

- [ ] **Step 1: Write the reconnect prompt**

Create `frontend/src/components/localFiles/ReconnectPrompt.tsx`:

```typescript
import { FolderOpen } from 'lucide-react';

type Props = {
  folderName: string;
  onReconnect: () => void;
  onChooseDifferent: () => void;
  denied: boolean;
};

export function ReconnectPrompt({ folderName, onReconnect, onChooseDifferent, denied }: Props) {
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <FolderOpen className="mx-auto mb-4 h-10 w-10 text-gray-400" aria-hidden="true" />
      <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">{folderName}</h2>
      <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
        {denied
          ? 'Notez no longer has permission to read this folder.'
          : 'Your browser needs permission again before Notez can read this folder.'}
      </p>
      <div className="flex justify-center gap-2">
        {!denied && (
          <button
            type="button"
            onClick={onReconnect}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Reconnect
          </button>
        )}
        <button
          type="button"
          onClick={onChooseDifferent}
          className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          Choose a different folder
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/pages/FilesPage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeFakeDirectory } from '../test/fakeFileSystem';
import { resetForTests } from '../lib/localFs/handleStore';
import { FilesPage } from './FilesPage';

const originalPicker = window.showDirectoryPicker;

beforeEach(async () => {
  await resetForTests();
  let counter = 0;
  URL.createObjectURL = () => `blob:test/${counter++}`;
  URL.revokeObjectURL = () => {};
});

afterEach(() => {
  window.showDirectoryPicker = originalPicker;
});

function installPicker(handle: FileSystemDirectoryHandle) {
  const picker = vi.fn().mockResolvedValue(handle);
  window.showDirectoryPicker = picker;
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  return picker;
}

describe('FilesPage', () => {
  it('offers a folder picker when nothing has been opened', async () => {
    installPicker(makeFakeDirectory('Cowork OS', {}));
    render(<FilesPage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /open a folder/i })).toBeInTheDocument(),
    );
  });

  it('shows the folder contents after picking', async () => {
    const user = userEvent.setup();
    installPicker(makeFakeDirectory('Cowork OS', { 'index.md': '# Index' }));
    render(<FilesPage />);

    await user.click(await screen.findByRole('button', { name: /open a folder/i }));
    await waitFor(() => expect(screen.getByText('index.md')).toBeInTheDocument());
  });

  it('renders a file when it is selected', async () => {
    const user = userEvent.setup();
    installPicker(makeFakeDirectory('Cowork OS', { 'index.md': '# Cowork OS' }));
    render(<FilesPage />);

    await user.click(await screen.findByRole('button', { name: /open a folder/i }));
    await user.click(await screen.findByText('index.md'));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Cowork OS' })).toBeInTheDocument(),
    );
  });

  it('reveals dot-files only when the hidden-files toggle is on', async () => {
    const user = userEvent.setup();
    installPicker(
      makeFakeDirectory('Cowork OS', { 'index.md': '# Index', '.secret.md': '# Secret' }),
    );
    render(<FilesPage />);

    await user.click(await screen.findByRole('button', { name: /open a folder/i }));
    await waitFor(() => expect(screen.getByText('index.md')).toBeInTheDocument());
    expect(screen.queryByText('.secret.md')).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /hidden files/i }));
    await waitFor(() => expect(screen.getByText('.secret.md')).toBeInTheDocument());
  });

  it('stays usable when the user dismisses the picker', async () => {
    const user = userEvent.setup();
    window.showDirectoryPicker = vi
      .fn()
      .mockRejectedValue(new DOMException('The user aborted a request.', 'AbortError'));
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });

    render(<FilesPage />);
    await user.click(await screen.findByRole('button', { name: /open a folder/i }));

    expect(screen.getByRole('button', { name: /open a folder/i })).toBeInTheDocument();
  });

  it('shows the unsupported notice when no mechanism exists', async () => {
    // @ts-expect-error deliberately removing the picker for this test
    delete window.showDirectoryPicker;
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = createElement(tag);
      if (tag === 'input') Object.defineProperty(el, 'webkitdirectory', { value: undefined });
      return el;
    });

    render(<FilesPage />);
    await waitFor(() => expect(screen.getByText(/desktop browser/i)).toBeInTheDocument());
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/pages/FilesPage.test.tsx`
Expected: FAIL — cannot resolve `./FilesPage`.

- [ ] **Step 4: Write the page**

Create `frontend/src/pages/FilesPage.tsx`:

```typescript
import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, RefreshCw } from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { FileTree } from '../components/localFiles/FileTree';
import { FileViewer } from '../components/localFiles/FileViewer';
import { ReconnectPrompt } from '../components/localFiles/ReconnectPrompt';
import { LegacyFolderPicker } from '../components/localFiles/LegacyFolderPicker';
import { UnsupportedBrowserNotice } from '../components/localFiles/UnsupportedBrowserNotice';
import { detectLocalFsMode } from '../lib/localFs/capability';
import { checkPermission, requestAccess } from '../lib/localFs/permissions';
import { listFolders, saveFolder, touchFolder, removeFolder } from '../lib/localFs/handleStore';
import type { StoredFolder } from '../lib/localFs/handleStore';
import type { PermissionState } from '../lib/localFs/types';

type Selection = {
  handle: FileSystemFileHandle;
  dirSegments: string[];
};

export function FilesPage() {
  const [mode] = useState(() => detectLocalFsMode());
  const [folder, setFolder] = useState<StoredFolder | null>(null);
  const [permission, setPermission] = useState<PermissionState>('prompt');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [legacyFiles, setLegacyFiles] = useState<File[] | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  // Bumping this remounts the tree, which re-reads every open directory —
  // the manual refresh required by spec §6.3.
  const [treeKey, setTreeKey] = useState(0);

  // Restore the most recently used folder, but never auto-prompt: the
  // permission request only succeeds inside a user gesture.
  useEffect(() => {
    if (mode !== 'fsa') return;
    let cancelled = false;

    async function restore() {
      const stored = await listFolders();
      const latest = stored[0];
      if (!latest || cancelled) return;

      const state = await checkPermission(latest.handle);
      if (cancelled) return;

      setFolder(latest);
      setPermission(state);
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const pickFolder = useCallback(async () => {
    if (!window.showDirectoryPicker) return;
    try {
      const handle = await window.showDirectoryPicker({ id: 'notez-local', mode: 'read' });
      const saved = await saveFolder(handle);
      setFolder(saved);
      setPermission('granted');
      setSelection(null);
    } catch {
      // The user dismissed the picker. Leave the page as it was.
    }
  }, []);

  const reconnect = useCallback(async () => {
    if (!folder) return;
    const state = await requestAccess(folder.handle);
    setPermission(state);
    if (state === 'granted') await touchFolder(folder.id);
  }, [folder]);

  const chooseDifferent = useCallback(async () => {
    if (folder) await removeFolder(folder.id);
    setFolder(null);
    setSelection(null);
    await pickFolder();
  }, [folder, pickFolder]);

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-gray-900">
      <AppHeader />
      <main className="flex flex-1 overflow-hidden">
        {mode === 'unsupported' && <UnsupportedBrowserNotice />}

        {mode === 'legacy' && !legacyFiles && (
          <LegacyFolderPicker onFilesPicked={setLegacyFiles} />
        )}

        {mode === 'legacy' && legacyFiles && (
          <LegacyFileList files={legacyFiles} />
        )}

        {mode === 'fsa' && !folder && <EmptyState onOpen={pickFolder} />}

        {mode === 'fsa' && folder && permission !== 'granted' && (
          <ReconnectPrompt
            folderName={folder.name}
            denied={permission === 'denied'}
            onReconnect={reconnect}
            onChooseDifferent={chooseDifferent}
          />
        )}

        {mode === 'fsa' && folder && permission === 'granted' && (
          <>
            <aside className="w-64 shrink-0 overflow-auto border-r border-gray-200 p-2 dark:border-gray-700">
              <div className="mb-2 flex items-center justify-between px-2">
                <span className="truncate text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {folder.name}
                </span>
                <button
                  type="button"
                  onClick={chooseDifferent}
                  className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                  Change
                </button>
              </div>
              <div className="mb-2 flex items-center justify-between px-2">
                <button
                  type="button"
                  onClick={() => setTreeKey((value) => value + 1)}
                  className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  Refresh
                </button>
                <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={showHidden}
                    onChange={(event) => setShowHidden(event.target.checked)}
                    className="h-3 w-3"
                  />
                  Hidden files
                </label>
              </div>
              <FileTree
                key={`${folder.id}-${treeKey}-${String(showHidden)}`}
                root={folder.handle}
                showHidden={showHidden}
                selectedPath={
                  selection ? [...selection.dirSegments, selection.handle.name] : null
                }
                onSelectFile={(handle, dirSegments) => setSelection({ handle, dirSegments })}
              />
            </aside>
            <section className="flex-1 overflow-hidden">
              {selection ? (
                <FileViewer
                  root={folder.handle}
                  fileHandle={selection.handle}
                  dirSegments={selection.dirSegments}
                />
              ) : (
                <p className="p-6 text-sm text-gray-500 dark:text-gray-400">
                  Select a file to view it.
                </p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function EmptyState({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <FolderOpen className="mx-auto mb-4 h-10 w-10 text-gray-400" aria-hidden="true" />
      <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
        Browse a local folder
      </h2>
      <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
        Open a folder from this device to read its markdown and text files. Files stay on your
        machine — nothing is uploaded to Notez.
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Open a folder
      </button>
    </div>
  );
}

function LegacyFileList({ files }: { files: File[] }) {
  const [selected, setSelected] = useState<File | null>(null);

  return (
    <>
      <aside className="w-64 shrink-0 overflow-auto border-r border-gray-200 p-2 dark:border-gray-700">
        <ul className="space-y-0.5">
          {files.map((file) => (
            <li key={file.webkitRelativePath || file.name}>
              <button
                type="button"
                onClick={() => setSelected(file)}
                className="w-full truncate rounded px-2 py-1 text-left text-sm text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                {file.webkitRelativePath || file.name}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="flex-1 overflow-auto">
        {selected ? (
          <pre className="p-6 text-sm font-mono whitespace-pre-wrap break-words text-gray-900 dark:text-gray-100">
            <LegacyFileContents file={selected} />
          </pre>
        ) : (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">Select a file to view it.</p>
        )}
      </section>
    </>
  );
}

function LegacyFileContents({ file }: { file: File }) {
  const [text, setText] = useState('');

  useEffect(() => {
    let cancelled = false;
    file.text().then((value) => {
      if (!cancelled) setText(value);
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  return <>{text}</>;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/pages/FilesPage.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/FilesPage.tsx frontend/src/pages/FilesPage.test.tsx frontend/src/components/localFiles/ReconnectPrompt.tsx
```

```bash
git commit -m "feat(files): add FilesPage with picker, reconnect, and fallback modes"
```

---

### Task 12: Route, header link, documentation

**Files:**
- Modify: `frontend/src/App.tsx` (add the `/files` route)
- Modify: `frontend/src/components/AppHeader.tsx` (add a Files link)
- Modify: `CHANGELOG.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/USER-GUIDE.md`

**Interfaces:**
- Consumes: `FilesPage` from Task 11
- Produces: the `/files` route, reachable from the header

- [ ] **Step 1: Add the route**

In `frontend/src/App.tsx`, add the import beside the other page imports:

```typescript
import { FilesPage } from './pages/FilesPage';
```

Then add this route immediately before the `path="/"` route:

```tsx
<Route
  path="/files"
  element={
    <ProtectedRoute>
      <FilesPage />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 2: Add the header link**

In `frontend/src/components/AppHeader.tsx`, add the import:

```typescript
import { Link } from 'react-router-dom';
```

Then insert this immediately before `<div className="hidden sm:block">`:

```tsx
<Link
  to="/files"
  className="hidden md:block text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
>
  Files
</Link>
```

- [ ] **Step 3: Run the whole suite and the build**

Run: `npm test`
Expected: PASS, including all pre-existing tests.

Run: `npm run build`
Expected: exits 0.

Run: `npm run lint`
Expected: exits 0.

- [ ] **Step 4: Update the changelog**

In `CHANGELOG.md`, under `## [Unreleased]`, add:

```markdown
### Added

- **Local folder browsing** — open a folder from your own device and browse its markdown and
  text files inside Notez. Files stay on your machine; nothing is uploaded. Requires desktop
  Chrome or Edge for the full experience; other desktop browsers get a read-only view that
  must be re-opened each session, and mobile browsers are not supported. Reachable from
  "Files" in the header.
```

- [ ] **Step 5: Update the roadmap**

In `docs/roadmap.md`, add to the `## Backlog (Unscheduled)` list:

```markdown
- **Local folder browser** — browse and edit files on your own machine from Notez
  (spec: `docs/specs/v1.30.0-local-folder-browser-tech-spec.md`). Phase 1 (browse + read)
  shipped; phases 2–5 cover editing, PDF/images, docx/xlsx, and polish. Distinct from
  §3.3 Import/Export: this is a window onto the filesystem, not an ingestion path.
```

- [ ] **Step 6: Update the user guide**

Add a section to `docs/USER-GUIDE.md`:

```markdown
## Browsing local folders

Notez can open a folder from your own device and show its files. Your files stay on your
machine — nothing is uploaded to the server.

Click **Files** in the header, then **Open a folder** and pick the folder you want. Notez
remembers it, so on your next visit you only need to click **Reconnect** to grant access
again. Markdown and plain-text files are shown formatted; other file types will be added in
later releases.

**Browser support.** Full support requires desktop Chrome or Edge. Firefox and Safari on
desktop can show files read-only, but you will need to pick the folder again each visit.
Mobile browsers cannot open local folders at all.
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/AppHeader.tsx CHANGELOG.md docs/roadmap.md docs/USER-GUIDE.md
```

```bash
git commit -m "feat(files): add /files route, header link, and documentation"
```

- [ ] **Step 8: Push and open a pull request**

```bash
git push
```

```bash
gh pr create --base main --title "feat(files): local folder browser — phase 1 (browse and read)" --body "Implements phase 1 of docs/specs/v1.30.0-local-folder-browser-tech-spec.md. Browse a local folder and read its markdown and text files. Frontend only. Read-only; editing lands in phase 2."
```

---

## Verification checklist

Before considering phase 1 done, confirm by hand in a real browser (the automated tests
cannot cover these):

- [ ] In Chrome, open a folder containing a markdown file with a relative image. The image
      renders, not a broken-image icon.
- [ ] Reload the page. The folder is remembered and a **Reconnect** button appears (or the
      tree loads directly, if Chrome kept the grant).
- [ ] Expand a folder containing many subdirectories. Nothing freezes; children load on
      expand only.
- [ ] Switch to dark mode. Tree, breadcrumbs, and rendered markdown are all legible.
- [ ] Open the same page in Firefox. The read-only banner appears and explains why.
- [ ] Open a `.md` file containing `<script>alert(1)</script>`. No alert fires.
- [ ] Open DevTools' Network tab while browsing. No request carries file contents or paths.
