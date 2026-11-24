// src/app.js
// Builds the Express app. Does NOT start listening (see server.js).

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const env = require('./config/env');
const apiRoutes = require('./routes');
const { checkConnection } = require('./db/pool');
const { serveFrontend } = require('./serveFrontend');


const app = express();
app.set('trust proxy', 1); // Render sits in front of the app, so rate limits need the real visitor address

// 1. Security and parsing (run on every request, in this order)
app.use(helmet());
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: '1mb' }));

// 2. Routes
app.get('/api/health', async (req, res) => {
  const base = {
    environment: env.nodeEnv,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };
  try {
    await checkConnection();
    res.status(200).json({ status: 'ok', database: 'connected', ...base });
  } catch (err) {
    console.error('Health check: database unreachable:', err.message);
    res.status(503).json({ status: 'degraded', database: 'unreachable', ...base });
  }
});
app.use('/api/v1', apiRoutes);

serveFrontend(app);

// 3. Unknown route (must come after all real routes)
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: `Route not found: ${req.method} ${req.originalUrl}`,
      code: 'NOT_FOUND',
    },
  });
});

// 4. Error handler (must be last, and must have exactly 4 parameters)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Malformed JSON in the request body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { message: 'Request body is not valid JSON', code: 'BAD_REQUEST' },
    });
  }

    // Expected errors we threw ourselves (AppError): send their own status and message
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
        ...(err.details && { details: err.details }),
      },
    });
  }

  // Anything else is a bug or an outage: log the details, hide them from the user
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: {
      message: env.isProduction ? 'Internal server error' : err.message,
      code: 'INTERNAL_ERROR',
    },
  });
});

module.exports = app;