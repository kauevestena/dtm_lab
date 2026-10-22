// Static server for local work and the browser test. Unlike `python3 -m http.server`
// it answers HTTP Range requests, which COPC streaming needs.
// Usage: node scripts/serve.mjs [port] [root]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif',
  '.laz': 'application/octet-stream', '.f32': 'application/octet-stream', '.tif': 'image/tiff',
  '.md': 'text/markdown; charset=utf-8',
};

export function createServer(root) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    fs.stat(file, (err, st) => {
      if (!err && st.isDirectory()) { file = path.join(file, 'index.html'); st = fs.existsSync(file) && fs.statSync(file); }
      if (err || !st) { res.writeHead(404).end('not found'); return; }
      const headers = {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache',
      };
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (m) {
        let start = m[1] === '' ? st.size - Number(m[2]) : Number(m[1]);
        let end = m[1] !== '' && m[2] !== '' ? Number(m[2]) : st.size - 1;
        end = Math.min(end, st.size - 1);
        if (start > end || start < 0) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end(); return; }
        res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
        if (req.method === 'HEAD') { res.end(); return; }
        fs.createReadStream(file, { start, end }).pipe(res);
        return;
      }
      res.writeHead(200, { ...headers, 'Content-Length': st.size });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(file).pipe(res);
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] || 5510);
  const root = path.resolve(process.argv[3] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  createServer(root).listen(port, () => console.log(`serving ${root} on http://localhost:${port}/`));
}
