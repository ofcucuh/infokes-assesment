# Dot Traveler: Setup & Running Instructions

This monorepo contains the **Dot Traveler** system explorer, featuring an ElysiaJS backend, a Vue 3/Vite frontend, and a PostgreSQL database with Prisma ORM.

Follow the instructions below to run the application using either **Docker** or a **native local environment (non-docker)**.

---

## Prerequisites

- **Node.js** v20.x or later (LTS recommended)
- **npm** v10.x or later
- **Docker & Docker Compose** (if running via Docker)
- **PostgreSQL v15+** (if running the database locally without Docker)

---

## Option 1: Running with Docker (Recommended)

This is the fastest way to get the entire stack (Database, Backend API, Frontend client) up and running without manually configuring Node or PostgreSQL.

1. **Start all services:**
   From the repository root directory, run:
   ```bash
   docker compose up --build
   ```

2. **Access the application:**
   - **Frontend UI:** [http://localhost:5173](http://localhost:5173)
   - **Backend API:** [http://localhost:3000](http://localhost:3000)
   - **Database Connection:** `postgresql://postgres:postgres@localhost:54321/dottraveler`

3. **Setup the database:**
   Once the containers are running, exec into the backend container to push the schema and seed the database:
   ```bash
   docker exec -it dot-traveler-backend /bin/sh
   ```
   Inside the container shell, run:
   ```sh
   npm install -D tsx
   npm run db:push
   npm run db:seed
   exit
   ```

4. **Stop the services:**
   ```bash
   docker compose down -v
   ```

---

## Option 2: Running without Docker (Locally)

To run the application locally without Docker, you will need a running PostgreSQL database. 

### Step 1: Run the Database
You can either run a local PostgreSQL instance on your system, or spin up **only the database** container from Docker Compose:

```bash
# Spin up only the PostgreSQL container in the background
docker compose up postgres -d
```

### Step 2: Configure Environment Variables
Verify or update the connection string in the backend environment file.
- Location: [apps/backend/.env]
- Ensure the `DATABASE_URL` matches your running database credentials and port (e.g., `54321` if using the Docker PostgreSQL database, or `5432` if using a native installation):
  ```env
  DATABASE_URL="postgresql://postgres:postgres@localhost:54321/dottraveler?schema=public"
  JWT_SECRET="dot-traveler-super-secure-jwt-key-2026"
  PORT=3000
  ```

### Step 3: Install Dependencies
From the repository root directory, run:
```bash
npm install
```

### Step 4: Setup Database (Prisma)
Generate the Prisma Client, push the schema to PostgreSQL, and seed the database with initial records:
```bash
# Generate Prisma Client
npm run db:generate

# Push schema to database
npm run db:push

# Seed the database
npm run db:seed
```

### Step 5: Start Development Servers
You can start both the backend and frontend concurrently in watch mode using the root workspace scripts:

```bash
# In terminal 1: Start backend server (runs on port 3000)
npm run dev:backend

# In terminal 2: Start frontend dev server (runs on port 5173)
npm run dev:frontend
```

Once running, open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Default User Accounts (Seeded)

Use the following credentials to log in to the application:

| Role   | Email                        | Password      |
|--------|------------------------------|---------------|
| Member | `member@dottraveler.com`     | `password123` |
| Viewer | `viewer@dottraveler.com`     | `password123` |

> **Member** can create folders, upload files, and manage content.  
> **Viewer** can only access content via shared links created by a Member.
