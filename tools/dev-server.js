const express = require('express');
const path = require('path');

const app = express();
const projectRoot = path.resolve(__dirname, '..');
const PORT = 3000;
const HOST = '0.0.0.0';

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Vercel serverless functions in api/
const accountHandler = require('../api/admin/account');
const dataHandler = require('../api/admin/data');
const profileHandler = require('../api/auth/profile');
const summaryHandler = require('../api/financial/summary');
const reportsHandler = require('../api/financial/reports');

app.all('/api/admin/account', (req, res) => accountHandler(req, res));
app.all('/api/admin/data', (req, res) => dataHandler(req, res));
app.all('/api/auth/profile', (req, res) => profileHandler(req, res));
app.all('/api/financial/summary', (req, res) => summaryHandler(req, res));
app.all('/api/financial/reports', (req, res) => reportsHandler(req, res));

// Dynamic runtime config from environment variables
app.get('/supabase-config.js', (_req, res) => {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(
    `window.SUPABASE_URL = window.SUPABASE_URL || ${JSON.stringify(url)};\n` +
    `window.SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || ${JSON.stringify(anonKey)};\n` +
    `window.MITALI_API_BASE = window.MITALI_API_BASE || "";\n` +
    `window.MITALI_IS_PROD = true;\n`
  );
});

// Static files
app.use(express.static(projectRoot, {
  index: 'index.html',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Service-Worker-Allowed', '/');
    } else if (filePath.endsWith('.webmanifest') || filePath.endsWith('manifest.json')) {
      res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    } else if (filePath.endsWith('.js') || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// SPA Fallback
app.use((req, res) => {
  res.sendFile(path.resolve(projectRoot, 'index.html'));
});

// Primary port 3000 for AI Studio dev proxy
const server = app.listen(PORT, HOST, () => {
  console.log(`Mitali Hospital dev server running on http://${HOST}:${PORT}`);
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is already in use, continuing.`);
  } else {
    console.error('Server error:', err);
  }
});

// If Cloud Run or deployed environment specifies a PORT (e.g. 8080), listen on it as well
const envPort = process.env.PORT ? parseInt(process.env.PORT, 10) : null;
if (envPort && envPort !== PORT) {
  const altServer = app.listen(envPort, HOST, () => {
    console.log(`Mitali Hospital server also listening on http://${HOST}:${envPort}`);
  });
  altServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${envPort} already bound, continuing on ${PORT}`);
    } else {
      console.error(`Alt port error:`, err.message);
    }
  });
}
