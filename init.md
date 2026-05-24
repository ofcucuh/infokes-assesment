# Dot Traveler: Production-Grade System Architecture Specification

Dot Traveler is an enterprise-grade, high-concurrency, low-latency hierarchical file and directory management web system. This specification mandates a strict decoupled architecture, lazy-loaded tree traversals, materialized path indexing, and asynchronous resource pruning designed to support millions of nodes and high-frequency concurrent operations.

---

## 1. Core Technical Stack

### Runtime & Monorepo Infrastructure
- **Runtime Environment:** Node.js v20.x or later (LTS)
- **Monorepo Architecture:** Native `npm workspaces` for package and application isolation
- **Compilation Engine:** TypeScript (v5.x+) enforcing strict compiler parameters (`strict: true`, `noImplicitAny: true`, `exactOptionalPropertyTypes: true`)

### Service & API Layer (Backend)
- **Application Framework:** ElysiaJS v1.x running natively over Node.js via `@bogeychan/elysia-polyfill/node`
- **Process Supervision:** Hot-reloading managed via `tsx` watch mode in development
- **Global Middleware:** `@elysiajs/cors` integrated at the root HTTP router instance

### Persistence & Data Access
- **Object-Relational Mapping (ORM):** Prisma ORM (v5.x+)
- **Database Engine:** PostgreSQL (v15+ Alpine)

### User Interface Layer (Frontend)
- **Framework Core:** Vue 3 (Composition API using `<script setup lang="ts">`)
- **Build Toolchain:** Vite v5.x with native TypeScript compiler integration
- **Styling Paradigm:** Tailwind CSS v3.x utility engine for fluid layouts

---

## 2. Comprehensive Directory Layout

```text
vanguard-monorepo/
├── apps/
│   ├── backend/
│   │   ├── prisma/
│   │   │   ├── schema.prisma         # Multi-tenant optimized directory database schema
│   │   │   └── seed.ts               # Database seed loader script
│   │   ├── src/
│   │   │   ├── domain/               # Pure business entities, type structures, and exceptions
│   │   │   ├── infrastructure/       # Database client initializers and auth guard middleware
│   │   │   ├── repositories/         # Prisma-isolated data access layer
│   │   │   ├── services/             # Core business rules, validations, and tree math
│   │   │   ├── controllers/          # Elysia endpoints with type-safe schema definitions
│   │   │   └── index.ts              # Entry point, HTTP server configurations, and polyfills
│   │   ├── Dockerfile                # Docker building and orchestrating script for backend
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── frontend/
│       ├── src/
│       │   ├── assets/               # Tailwind directives and baseline CSS layout
│       │   ├── components/           # Custom recursive lazy trees and viewport grids
│       │   ├── App.vue               # Horizontal split-screen viewport orchestrator
│       │   └── main.ts               # Client application bootstrapper
│       ├── Dockerfile                # Multi-stage Docker builder script for frontend
│       ├── nginx.conf                # Nginx proxy and static asset server configuration
│       ├── index.html
│       ├── package.json
│       └── vite.config.ts
├── docker-compose.yml                # Docker orchestrator for postgres, backend, and frontend
├── package.json                      # Monorepo workspace configuration file
└── tsconfig.json                     # Root base TypeScript configurations
```

---

## 3. Production-Hardened Database Schema (Prisma)

To prevent deep recursive JOIN operations and stack overflows under heavy nested queries, this schema utilizes a **Materialized Path (Ancestry Path)** strategy combined with strict index parameters and soft-delete states.

The schema is configured and maintained directly inside the backend package at `apps/backend/prisma/schema.prisma`:

```prisma
enum NodeType {
  FOLDER
  FILE
}

enum Role {
  SUPER_ADMIN
  TENANT_ADMIN
  MEMBER
  VIEWER
}

model User {
  id         String   @id @default(uuid())
  email      String   @unique
  password   String   
  role       Role     @default(VIEWER)
  nodes      Node[]   @relation("UserOwnedNodes")
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
}

model Node {
  id        String   @id @default(uuid())
  name      String
  type      NodeType
  parent_id String?
  owner_id  String
  
  // Materialized Path: Stores the ancestry line (e.g., "rootId/folder1Id/folder2Id/")
  // This allows lightning fast sub-tree queries using a single indexed string lookup
  ancestry  String   @default("") @db.Text
  
  // Soft Delete Flag: Eliminates database locking and transaction timeouts during heavy cascades
  is_deleted Boolean   @default(false)
  deleted_at DateTime?

  // Relations
  parent     Node?     @relation("Hierarchy", fields: [parent_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  children   Node[]    @relation("Hierarchy")
  owner      User      @relation("UserOwnedNodes", fields: [owner_id], references: [id])
  
  created_at DateTime  @default(now())
  updated_at DateTime  @updatedAt

  // Performance Optimization & Conflict Resolution Indexing
  @@index([parent_id, is_deleted])
  @@index([owner_id, is_deleted])
  @@index([ancestry]) // Speeds up sub-tree deletions, size calculations, and deep searching
  @@unique([parent_id, name, owner_id, is_deleted]) // Enforces unique file/folder naming in the same directory context
}
```

---

## 4. Architectural Layer Specifications

The implementation agent must enforce deterministic data flows across layers, adhering strictly to the constraints outlined below:

### Data Access & Repository Layer
- All write/read operations must explicitly verify the `is_deleted: false` condition.
- Node selection logic must be deeply scoped to the requesting tenant identifier (`owner_id`).
- Direct database mutations (such as folder deletions) are prohibited; operations must modify only local visibility indices (`is_deleted: true`).

### Core Business Service Layer

#### The Lazy-Loading Tree Strategy (Scale Pattern)
- Fetching the entire directory tree down into Node.js application memory is **strictly prohibited**.
- **Initial Load Operation:** The server must scan and return *only* nodes where `parent_id == null` (the root directory level).
- **Expansion Resolution:** When a user interacts with a collapsed tree node, the runtime must execute an isolation query targeting only records whose `parent_id` matches that specific node's ID.

#### Operations Validation (The Circular Reference Guard)
- Before executing a location transformation (`PATCH /nodes/:id/move`), the service must verify structural safety.
- It must fetch the target destination node's `ancestry` string. If the moving node's own `id` is present anywhere inside that string, the operational transaction must terminate instantly with a business conflict violation error. This prevents a folder from being moved inside its own subfolder network.

#### Metadata Abstract Handler (Future-Proof Hook)
- The service layer coordinates directory metadata inside PostgreSQL.
- File streaming payload logic must call mock integration interface methods. This isolates database rows cleanly, preparing the application for future cloud storage attachments (e.g., Amazon S3, MinIO buckets, or system disk drivers).

---

## 5. API Boundary Definitions

All endpoint schemas enforce structural type validation via `elysia/t` and require a valid cryptographically verified token block inside the `Authorization: Bearer <JWT>` header space.

### Identity Control Endpoints
- `POST /api/v1/auth/register` -> Processes account onboarding inputs; returns user identity properties.
- `POST /api/v1/auth/login` -> Authenticates parameters; returns bearer access token strings.

### Structural Directory Endpoints
- `GET /api/v1/nodes/roots` -> Resolves the caller's tenancy identity to fetch root nodes (`parent_id == null` and `type == FOLDER`).
- `GET /api/v1/nodes/:id/children` -> Fetches children nodes (`type == FOLDER`) belonging directly to the parameterized ID. Used for lazy-expanding the left panel tree.
- `GET /api/v1/nodes/:id/contents` -> Returns a combined collection array of both sub-folders and files nested immediately under the target node ID. Used to populate the right view pane.
- `PATCH /api/v1/nodes/:id/move` -> Modifies `parent_id` and rebuilds the node's local `ancestry` string. Requires a request payload schema containing `destinationFolderId`.
- `DELETE /api/v1/nodes/:id` -> Updates the node and all matching records prefixed with its `ancestry` string path to `is_deleted = true`.
- `GET /api/v1/nodes/search` -> Query params: `?q=...`. Executes indexed pattern-matching lookups on node names restricted to the caller's visibility context.

---

## 6. Frontend Presentation Specifications (Vue 3 Custom Engine)

### Viewport Shell Component (`App.vue`)
- Implements a horizontal side-by-side flexbox configuration (`flex flex-row h-screen overflow-hidden`).
- **State Store Architecture:** Dictates global references for the top-level tree array, selected node pointers, right-side detail arrays, and user interaction states.
- **Properties Toggle Control:** Mounts a toggle icon button at the top-right screen next to the Logout button to show or hide the sidebar properties details panel.
  - *Default Configuration:* The properties sidebar is disabled (hidden) by default upon startup.
  - *Side-by-side Alignment:* The panel aligns side-by-side with the grid/list content view and remains open even when no item is selected, showing a styled "No selection" placeholder to prevent dynamic layout shifts.
- **Keyboard Tree Navigation:** Listens to global Arrow keys for directory sidebar navigation:
  - `ArrowDown` & `ArrowUp`: Navigates selection down and up the visible tree nodes list.
  - `ArrowRight`: Expands the currently selected folder.
  - `ArrowLeft`: Collapses the currently selected folder (or jumps to its parent folder node if already collapsed).
- **Custom Global Alert Modal:** Intercepts the native `window.alert` routine during mounting, routing all alert messages to a reactive glassmorphic modal overlay.
- **Breadcrumb Ancestry Lookup:** Maps and resolves parent directory names from folder ancestry chains (via reactive maps) to display complete working paths (`My Drive` -> `Work Projects` -> `Project Alpha` -> `test` -> `est`) rather than skipping intermediate parent folders.

### Recursive Lazy Tree Component (`FolderTree.vue`)
- **Zero Third-Party Library Rule:** This component must be coded completely from scratch using custom Vue templates.
- Receives individual nodes via property attributes (`props`).
- **Internal Visibility State:** Tracks whether the folder node is expanded (`isOpen: boolean`).
- **On-Demand Expansion:** When `isOpen` toggles from `false` to `true`, if the current node's `children` array is empty, it must dispatch an asynchronous API request to `GET /api/v1/nodes/:id/children`, fetching its subfolders and reactive-rendering them inline.
- Emits clean selection payloads upward to update the active working path when the folder title text is clicked.
- **Double-Click Row Expansion:** Double-clicking anywhere on the folder node row expands or collapses its sub-tree.
- **Tree-Specific Right-Click Actions:** Listens to `@contextmenu` events on tree folder items to present context actions (Open, Rename, Delete) at the cursor coordinates.
- **Targeted Sync Refresh:** Injects a shared tree refresh trigger. Whenever a creation, delete, or rename event fires inside a folder, components listen and refetch sub-records reactively to keep the left sidebar tree in sync.
- **Empty Folder Validation Rule:** Only displays the "Empty folder" text if the directory is completely empty (`node.isEmpty == true`), meaning it contains neither subfolders nor files.

### Context Content Display Pane (`ContentView.vue`)
- Consumes a flat collection property array and displays items through an auto-responsive layout grid (`grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4`).
- Differentiates folders and files cleanly using visual layout nodes or icons based on the `type` attribute.
- Hooks into native user double-click events (`@dblclick`):
  - If the targeted node is a `FOLDER`, it navigates into its directory contents.
  - If the targeted node is a `FILE`, it launches the **File Preview Overlay**: opens images under `<img>` containers, plays video files in a native controls `<video>` wrapper, and displays all other files (code, JSON, logs, documents) as formatted plain text inside a scrollable preview console.
- **Explorer Right-Click Context Menu:** Blocks the browser context menu to render a custom explorer menu:
  - Right-clicking empty workspace space: shows actions to create a `New Folder`, `New File`, or `Refresh` directory.
  - Right-clicking item nodes: shows actions to `Open` (preview/navigate), `Rename`, or `Delete` the specific item.
- **Rename Input Control:** If the user renames an item and saves, the frontend checks if the name has changed at all. If the name is unchanged, it cancels the renaming mode silently without firing duplicate error warnings or network requests.

---

## 7. Operational & Bootstrap Commands

All orchestration scripts must execute from the repository workspace root via the system default package controller:

- **Dependency Installation Framework:**
  
  ```bash
  npm install
  ```

- **Prisma Client Generation & Database Alignment:**
  
  ```bash
  npm run db:push
  npm run db:generate
  npm run db:seed
  ```

- **Concurrent Development Environment Ignition:**
  
  ```bash
  npm run dev:backend
  npm run dev:frontend
  ```

- **Docker Compose Orchestration (Production/Testing):**
  
  To build and run all services concurrently (PostgreSQL database, Elysia backend, and Vue 3 frontend) via Docker:
  
  ```bash
  docker compose up --build
  ```
  
  This command orchestrates:
  1. **postgres** (Database service): Runs on PostgreSQL 15, storing data in volume `pgdata`, exposed externally on port `54321`.
  2. **backend** (API service): Runs ElysiaJS backend on port `3000`. The container waits until postgres is ready to accept connections, then executes `npx prisma db push` followed by seeding the data, before launching the node server.
  3. **frontend** (Client SPA): Compiles the Vue 3 application and serves the static assets on port `5173` using Nginx Alpine, proxying all `/api` calls to the backend container automatically.

---

## 8. Global Response & Error Wrapping Format

To enforce standardized communication interfaces, all backend API responses (success and error) are packaged within a uniform JSON envelope structure:

### Success Response Envelope
All successful API transactions return a 2xx HTTP status code with the following JSON payload:
```json
{
  "timestamp": "2026-05-24T12:49:00.000Z",
  "status": "Success",
  "message": "Success to load data",
  "data": [{}, {}]
}
```
*The `message` property is derived dynamically based on the HTTP method of the request (e.g. "Success to load data" for GET, "Success to create data" for POST, "Success to update data" for PATCH/PUT, and "Success to delete data" for DELETE) unless customized.*

### Error Response Envelope
All failed API transactions return the corresponding HTTP error code (e.g., 400, 401, 403, 404, 409, 500) with the following JSON payload:
```json
{
  "timestamp": "2026-05-24T12:49:00.000Z",
  "status": "Error",
  "message": "Detailed error message",
  "data": {
    "code": "ERROR_CODE"
  }
}
```
*Common error codes include `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BUSINESS_CONFLICT`, and `INTERNAL_SERVER_ERROR`.*

---

## 9. Persistent Blobs, Local Disk Connector, and Client-Side Search Caching

### 9.1 Persistent Blob Storage & Downloads
- **Physical Asset Storage:** Nodes of type `FILE` represent actual physical files uploaded via `multipart/form-data`. The file binaries are persisted inside the server's local directory `uploads/<node_id>` to ensure integrity.
- **Binary Download Streaming:** A dedicated binary endpoint `GET /api/v1/nodes/:id/download` accepts authorization tokens, sets the `Content-Disposition` header with the target file name, and streams the raw file buffer using Node `fs.readFileSync` (avoiding Bun-incompatible APIs).
- **Dynamic Preview & Download Engine:** 
  - For image (`.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`), video (`.mp4`, `.webm`, `.ogg`), and text (`.txt`, `.md`, `.json`, `.js`, etc.) file extensions, the frontend fetches the file blob from the download API, creates a localized object URL (`window.URL.createObjectURL(blob)`), and renders it dynamically in the preview console.
  - For all other non-previewable file extensions, the frontend initiates a browser download using a temporary `<a>` element and revokes the object URL afterward to prevent memory leaks.
  - "Download" buttons are fully integrated into grid/list item context menus and the properties pane.

### 9.2 Local Disk Connector
- **Directory Isolation:** A dedicated folder `local_disk/` is mapped as a host filesystem gateway. Users browse, upload, rename, move, and delete actual directory files on the server's filesystem side-by-side with the database workspace.
- **Base64 Node ID Encoding Schema:** To represent file paths on the local host without exposing raw path strings:
  - The root path is represented by the identifier `'local-root'`.
  - All subdirectories and files are identified by IDs prefixed with `'local://'`, followed by the base64-encoded relative path from `local_disk/` (e.g. `'local://TXkgRG9jdW1lbnRzL3dlbGNvbWUudHh0'`).
  - Standard directory endpoints (`/:id/children`, `/:id/contents`, `/:id/move`, `/:id/rename`, `/:id/delete`, `/search`) intercept identifiers matching this schema, resolving them using Node `fs` and returning standard `FileNode` interfaces for a seamless UI experience.

### 9.3 Client-Side Search Caching & Debouncing
- **Search Caching:** An in-memory cache Map (`searchCache`) stores responses keyed by the search term and the active mode (`db` vs `local`) to avoid duplicate API requests when the user deletes characters or repeats queries.
- **Search Debouncing:** User input changes on the search bar are debounced by `250ms` using a timer reference to prevent firing API calls on every keystroke.
- **Cache Eviction Policy:** The search cache is completely cleared (`searchCache.clear()`) after any creation, deletion, renaming, or movement event to guarantee search accuracy and prevent serving stale results.

### 9.4 Multiple Selection
- **Selection State:** The content pane maintains a list of selected node IDs (`selectedItemIds`). An individual item is highlighted if its ID is present in the selection array.
- **Mouse Selection Controls:**
  - Clicking an item selects it as the single active item.
  - Clicking an item with `Ctrl` (or `Cmd`) key toggles its selection state.
  - Clicking an item with `Shift` key selects a range of items from the last selected item to the clicked item.
- **Checkmark Overlay:** Hovering over items in the grid card or list row reveals a checkbox overlay. Clicking this checkbox toggles selection for that item without clearing other selections.
- **Explorer Header Select All Checkbox:** The list view header features a master checkbox. Clicking it toggles selection for all items currently rendered in the active directory view.
- **Batch Actions:**
  - If multiple items are selected, right-clicking reveals a custom context menu displaying "Download Selected" and "Delete Selected" options.
  - The properties panel displays a summary card detailing the number of selected items, a scrollable list of their names, a button to download all selected files, and a button to delete all selected items.