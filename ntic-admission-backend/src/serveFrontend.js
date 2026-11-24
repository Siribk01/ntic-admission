// src/serveFrontend.js
// Lets the backend also serve the built React portal, so the whole system lives at ONE address.
// In development nothing changes: if the built folder does not exist this does nothing.
const fs = require('fs');
const path = require('path');
const express = require('express');

function serveFrontend(app) {
  // Where "npm run build" in the front end puts its files. Override with FRONTEND_DIST if your folders differ.
    // path.resolve makes the path absolute, because res.sendFile refuses relative paths like ../ntic-portal/dist
  const dist = path.resolve(process.env.FRONTEND_DIST || path.join(process.cwd(), '..', 'frontend', 'dist'));
  if (!fs.existsSync(path.join(dist, 'index.html'))) return;

  // Built files carry a hash in their name, so they can be kept by the browser for a long time
  app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(dist, { index: false }));

  // Any other page address (for example /apply or /staff/interviews) belongs to React Router, so give it index.html.
  // API and webhook paths are never answered with a web page: they keep their normal JSON "not found".
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/webhooks/') || req.path.startsWith('/assets/')) return next();
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(dist, 'index.html'));
  });
}

module.exports = { serveFrontend };
