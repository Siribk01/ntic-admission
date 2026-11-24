// src/server.js
// Entry point: checks the database, starts the HTTP server, handles shutdown.

const app = require('./app');
const env = require('./config/env');
const { checkConnection, closePool } = require('./db/pool');
const notificationWorker = require('./modules/notifications/notifications.worker');
const jobsScheduler = require('./modules/jobs/jobs.scheduler');

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

async function start() {
  // 1. Fail fast if the database is not reachable
  try {
    const { database } = await checkConnection();
    console.log(`Database connected: ${database}`);
  } catch (err) {
    console.error('Cannot connect to the database:', err.message);
    process.exit(1);
  }

  // 2. Start listening
  const server = app.listen(env.port, () => {
    console.log(`NTIC API running on http://localhost:${env.port} (${env.nodeEnv})`);
    notificationWorker.start();
    jobsScheduler.start();
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${env.port} is already in use. Stop the other server or change PORT in .env.`);
    } else {
      console.error('Server error:', err.message);
    }
    process.exit(1);
  });

  // 3. Graceful shutdown
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received: shutting down...`);

    const force = setTimeout(() => {
      console.error('Shutdown took too long, forcing exit.');
      process.exit(1);
    }, 10000);
    force.unref(); // do not let this timer keep the process alive by itself

    server.close(async () => {
  await jobsScheduler.stop();
  await notificationWorker.stop();
  await closePool();
  console.log('Shutdown complete.');
  process.exit(0);
});
  };

  process.on('SIGINT', () => shutdown('SIGINT'));   // Ctrl + C
  process.on('SIGTERM', () => shutdown('SIGTERM')); // hosting platforms
}

start();