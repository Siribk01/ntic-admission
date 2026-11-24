# Hosting NTIC for testing (Render, one address for everything)

## The idea
Today the browser talks to Vite (port 5173), and Vite forwards `/api` to the backend (port 5000).
On the host there is no Vite. Instead the backend serves the built portal files AND the API, so the browser
talks to one address (`https://ntic-test.onrender.com`). The front end already calls `/api/v1/...` with no host name,
so it needs no change.

## 1. Code changes (3 small ones, backend)
**a) Add `src/serveFrontend.js`** (from this zip).

**b) In your Express app file (the one that creates `app` and mounts `routes/index.js`)**, add near the top:
```js
const { serveFrontend } = require('./serveFrontend');
```
and call it AFTER your API routes are mounted but BEFORE the error-handling middleware:
```js
app.use('/api/v1', routes);      // your existing line
serveFrontend(app);              // NEW
// app.use(errorHandler);        // your existing error handler stays last
```
Also add, near the top after `const app = express();`:
```js
app.set('trust proxy', 1);       // Render sits in front of the app; this lets rate limits see real visitor addresses
```

**c) Listen on the host's port.** Your listen line must read the PORT variable:
```js
app.listen(process.env.PORT || 5000);
```

**d) `package.json` (backend) scripts** (check `start` exists; add `migrate:up` if it is not there):
```json
"start": "node src/server.js",
"migrate:up": "node-pg-migrate up"
```
(Use your real entry file instead of `src/server.js`.)
`node-pg-migrate` must be under `dependencies`, not `devDependencies`, because the host installs only dependencies in production.

## 2. Put the code on GitHub
Private repository with two folders: `backend/` and `frontend/` (the portal). Do NOT commit `.env`, `node_modules`, `uploads/`.

## 3. Database on Render
New > PostgreSQL > Free. Copy the **Internal Database URL** (used by the web service in the same region).
Run your migrations against it once from your computer to create the tables: in `backend/`:
```
set DATABASE_URL=<External Database URL>?sslmode=require
npm run migrate:up
```
(PowerShell: `$env:DATABASE_URL="..."`.) Also run your seed/setup SQL, then create the first `central_admin` account the same way you did locally.

## 4. Web service on Render
New > Web Service > connect the repo.
| Setting | Value |
|---|---|
| Root Directory | (leave empty, repo root) |
| Build Command | `cd frontend && npm ci && npm run build && cd ../backend && npm ci` |
| Start Command | `cd backend && npm start` |
| Instance type | Free (sleeps when idle) |

Environment variables:
| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Internal Database URL from step 3 |
| `JWT_SECRET` | long random text (30+ characters) |
| `PORTAL_URL` | `https://<your-service>.onrender.com` (set after the first deploy shows the address, then redeploy) |
| `BANK_NAME`, `BANK_ACCOUNT_NAME`, `BANK_ACCOUNT_NUMBER`, `BANK_INSTRUCTIONS` | the school's bank details (use test values if unsure) |
| SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM | optional for testing; without SMTP_HOST emails are only queued |
| `PAYMENT_PROVIDER` | leave unset |

If the database needs SSL, your `db/pool.js` may need `ssl: { rejectUnauthorized: false }` when `NODE_ENV=production`;
only add that if the app logs an SSL error on start. (Render's Internal URL normally needs none.)

## 5. Test
1. Open `https://<service>.onrender.com/api/v1/health` style route you already have (or the home page). The first visit after idle takes up to a minute.
2. Open the address in the browser: the login page appears. Refresh on `/staff/interviews`: the page still loads (this is what `serveFrontend` does).
3. Sign in as the admin, check Setup, create a parent account, submit a test application.
4. Thunder Client: set the base URL to the live address, e.g. `POST https://<service>.onrender.com/api/v1/auth/login`, body `{ "email": "...", "password": "..." }`.

## 6. Know these limits (testing only)
- **Uploaded documents are lost** on every redeploy or restart on the free tier (the disk is temporary). Fine for testing; before real use mount a Render Disk (paid) and set `UPLOAD_DIR` to its path, or use object storage.
- The free database is deleted after a period. Do not store real applicant data there.
- Free service sleeps: background jobs (reminders, expiry) only run while it is awake.
- Send the testers the address only; tell them it is a test and data may be wiped.
