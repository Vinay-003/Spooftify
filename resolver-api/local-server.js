const http = require('http');
const { URL } = require('url');

const resolveHandler = require('./api/resolve');
const healthHandler = require('./api/health');

const port = Number(process.env.PORT || 3000);

function buildResponse(res) {
  return {
    setHeader: (...args) => res.setHeader(...args),
    status(code) {
      res.statusCode = code;
      return this;
    },
    json(payload) {
      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json');
      }
      res.end(JSON.stringify(payload));
    },
    end(...args) {
      res.end(...args);
    },
  };
}

function parseBody(req) {
  return new Promise((resolve) => {
    if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
      resolve({});
      return;
    }

    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

const server = http.createServer(async (req, res) => {
  const response = buildResponse(res);

  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const query = Object.fromEntries(url.searchParams.entries());
    const body = await parseBody(req);

    req.query = query;
    req.body = body;

    if (url.pathname === '/api/health') {
      await healthHandler(req, response);
      return;
    }

    if (url.pathname === '/api/resolve') {
      await resolveHandler(req, response);
      return;
    }

    response.status(404).json({ ok: false, error: 'Not found' });
  } catch (error) {
    response.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[resolver-api] listening on http://0.0.0.0:${port}`);
});
