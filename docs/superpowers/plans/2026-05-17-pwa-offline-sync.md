# PWA com Suporte Offline Avançado (Offline-First) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the system into a PWA with advanced offline support using Dexie.js for local data persistence and @vite-pwa/nuxt for service worker management.

**Architecture:** We will implement a local-first architecture where the UI interacts with a local IndexedDB (via Dexie.js). A synchronization manager will handle data sync between the local DB and the backend API using an Outbox pattern.

**Tech Stack:** Nuxt 4, @vite-pwa/nuxt, Dexie.js, Pinia.

---

### Task 1: Setup Dependencies and PWA Configuration

**Files:**
- Modify: `package.json`
- Modify: `nuxt.config.ts`

- [ ] **Step 1: Install dependencies**

Run: `pnpm add @vite-pwa/nuxt dexie`

- [ ] **Step 2: Configure @vite-pwa/nuxt in nuxt.config.ts**

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  // ... existing config
  modules: [
    // ... existing modules
    "@vite-pwa/nuxt",
  ],
  pwa: {
    registerType: "autoUpdate",
    manifest: {
      name: "Comando",
      short_name: "Comando",
      theme_color: "#ffffff",
      icons: [
        {
          src: "comando-logo.png", // Ensure this exists in public/
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: "comando-logo.png",
          sizes: "512x512",
          type: "image/png",
        },
      ],
    },
    workbox: {
      navigateFallback: "/",
      globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
    },
    client: {
      installPrompt: true,
    },
    devOptions: {
      enabled: true,
      type: "module",
    },
  },
});
```

- [ ] **Step 3: Commit changes**

```bash
git add package.json pnpm-lock.yaml nuxt.config.ts
git commit -m "feat: setup PWA module and dexie dependency"
```

---

### Task 2: Implement Local Database Schema (Dexie)

**Files:**
- Create: `app/lib/db.ts`

- [ ] **Step 1: Define the Dexie database class**

```typescript
import Dexie, { type Table } from 'dexie';

export interface SyncQueueItem {
  id?: number;
  entity: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: any;
  timestamp: number;
}

export class ComandoDatabase extends Dexie {
  notes!: Table<any>;
  tasks!: Table<any>;
  projects!: Table<any>;
  syncQueue!: Table<SyncQueueItem>;

  constructor() {
    super('ComandoDB');
    this.version(1).stores({
      notes: 'id, updated_at',
      tasks: 'id, project_id, updated_at',
      projects: 'id, updated_at',
      syncQueue: '++id, entity, timestamp'
    });
  }
}

export const db = new ComandoDatabase();
```

- [ ] **Step 2: Commit changes**

```bash
git add app/lib/db.ts
git commit -m "feat: implement local database schema with Dexie"
```

---

### Task 3: Create Synchronization Manager

**Files:**
- Create: `app/composables/useSyncManager.ts`

- [ ] **Step 1: Implement the Sync Manager composable**

```typescript
import { db } from '~/lib/db';

export const useSyncManager = () => {
  const isSyncing = ref(false);

  const processQueue = async () => {
    if (isSyncing.value || !navigator.onLine) return;
    
    isSyncing.value = true;
    const items = await db.syncQueue.orderBy('timestamp').toArray();
    
    for (const item of items) {
      try {
        // Here we would call the corresponding API endpoint
        // Example: await $fetch(`/api/${item.entity}`, { method: 'POST', body: item.payload })
        console.log(`Syncing ${item.entity}...`, item.payload);
        
        await db.syncQueue.delete(item.id!);
      } catch (error) {
        console.error(`Failed to sync ${item.entity}`, error);
        break; // Stop processing if one fails
      }
    }
    isSyncing.value = false;
  };

  return { processQueue, isSyncing };
};
```

- [ ] **Step 2: Commit changes**

```bash
git add app/composables/useSyncManager.ts
git commit -m "feat: add basic synchronization manager"
```

---

### Task 4: Refactor a Store to Local-First (Example: Notes)

**Files:**
- Modify: `app/stores/notes.ts` (assuming it exists, otherwise create it)

- [ ] **Step 1: Adapt the store to use Dexie**

```typescript
import { defineStore } from 'pinia';
import { db } from '~/lib/db';

export const useNotesStore = defineStore('notes', () => {
  const notes = ref([]);

  const loadNotes = async () => {
    notes.value = await db.notes.toArray();
    // In background, fetch from API and update Dexie
  };

  const addNote = async (note: any) => {
    const newNote = { ...note, id: crypto.randomUUID(), updated_at: Date.now() };
    await db.notes.add(newNote);
    await db.syncQueue.add({
      entity: 'notes',
      operation: 'CREATE',
      payload: newNote,
      timestamp: Date.now()
    });
    notes.value.push(newNote);
  };

  return { notes, loadNotes, addNote };
});
```

- [ ] **Step 2: Commit changes**

```bash
git add app/stores/notes.ts
git commit -m "feat: refactor notes store to local-first"
```
