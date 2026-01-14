const http = require('http');
const { pathToFileURL } = require('url');

const PORT = Number(process.env.PORT || 4001);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const allowedOrigins = CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);

async function loadHandlers() {
  const analyticsUrl = pathToFileURL(require('path').join(__dirname, 'app', 'api', 'clientes', 'analytics', 'route.js'));
  const rebuildUrl = pathToFileURL(require('path').join(__dirname, 'app', 'api', 'analytics', 'rebuild', 'route.js'));
  const analyticsModule = await import(analyticsUrl.href);
  const rebuildModule = await import(rebuildUrl.href);
  return {
    getClientesAnalytics: analyticsModule.GET,
    rebuildAnalytics: rebuildModule.GET,
  };
}

function sendCors(req, res) {
  const origin = req.headers.origin;
  if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Analytics-Token');
}

async function handler(req, res, handlers) {
  sendCors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname.replace(/\/+$/, '');

  if (req.method === 'GET' && pathname === '/clientes/analytics') {
    const response = await handlers.getClientesAnalytics(new Request(url.toString(), { headers: req.headers }));
    const body = await response.text();
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(body);
    return;
  }

  if (req.method === 'GET' && pathname === '/analytics/rebuild') {
    const response = await handlers.rebuildAnalytics(new Request(url.toString(), { headers: req.headers }));
    const body = await response.text();
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(body);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

loadHandlers().then((handlers) => {
  const server = http.createServer((req, res) => {
    handler(req, res, handlers).catch((err) => {
      console.error('[analytics-server] err:', err);
      sendCors(req, res);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal error', detail: err?.message }));
    });
  });

  server.listen(PORT, () => {
    console.log(`[analytics-server] listening on ${PORT}`);
  });
}).catch((err) => {
  console.error('[analytics-server] failed to load handlers:', err);
  process.exit(1);
});
