// Serves only the exported index.html next to this file. No wiki or order data.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, 'index.html');
if (!fs.existsSync(file)) { console.error('Put index.html beside shop-server.cjs / Læg index.html ved siden af shop-server.cjs'); process.exit(1); }
http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, {Allow:'GET, HEAD'}); return res.end(); }
  if (!['/', '/index.html'].includes(req.url.split('?')[0])) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(503); return res.end('Shop unavailable'); }
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
    res.end(req.method === 'HEAD' ? undefined : body);
  });
}).listen(8787, '127.0.0.1', () => console.log('Shop: http://127.0.0.1:8787 — Ctrl+C stops / stopper'))
  .on('error', e => { console.error(e.code === 'EADDRINUSE' ? 'Port 8787 is in use / Port 8787 er optaget. Stop the other Shop server first.' : e.message); process.exitCode = 1; });
