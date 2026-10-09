const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT       = 3000;
const DIR        = __dirname;
const DATA_FILE  = path.join(DIR, 'data.json');
const HTML_FILE  = path.join(DIR, 'index.html');
const AUDIO_FILE = path.join(DIR, 'birds.wav');
const LIB_DIR    = path.join(DIR, 'audio-library');
const MAX_AUDIO  = 15 * 1024 * 1024;

if (!fs.existsSync(LIB_DIR)) fs.mkdirSync(LIB_DIR);

function safeId(id) {
  return /^[a-z0-9]+$/i.test(id || '') ? id : null;
}

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Audio-Name, X-Audio-Id');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const urlPath = decodeURIComponent((req.url || '').split('?')[0]);

  if (req.method === 'GET' && urlPath === '/') {
    fs.readFile(HTML_FILE, (err, data) => {
      if (err) { res.writeHead(500); return res.end('Could not read index.html'); }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });

  } else if (req.method === 'GET' && urlPath === '/data') {
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(err ? '{"hobbies":[]}' : data);
    });

  } else if (req.method === 'GET' && urlPath === '/birds.wav') {
    fs.readFile(AUDIO_FILE, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': 'audio/wav' });
      res.end(data);
    });

  } else if (req.method === 'GET' && urlPath.startsWith('/library-audio/')) {
    const id = safeId(urlPath.slice('/library-audio/'.length));
    if (!id) { res.writeHead(400); return res.end('bad id'); }
    const metaPath = path.join(LIB_DIR, id + '.json');
    const filePath = path.join(LIB_DIR, id + '.bin');
    fs.readFile(metaPath, 'utf8', (err, metaRaw) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      let meta;
      try { meta = JSON.parse(metaRaw); } catch { meta = {}; }
      fs.readFile(filePath, (err2, data) => {
        if (err2) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': meta.mime || 'audio/mpeg' });
        res.end(data);
      });
    });

  } else if (req.method === 'POST' && urlPath === '/library-audio') {
    const chunks = [];
    let total = 0;
    let aborted = false;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > MAX_AUDIO) {
        aborted = true;
        res.writeHead(413);
        res.end('file too large');
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (aborted) return;
      const id = safeId(req.headers['x-audio-id']);
      if (!id) { res.writeHead(400); return res.end('missing id'); }
      const buf = Buffer.concat(chunks);
      const mime = req.headers['content-type'] || 'audio/mpeg';
      const name = decodeURIComponent(req.headers['x-audio-name'] || 'audio');
      const filePath = path.join(LIB_DIR, id + '.bin');
      const metaPath = path.join(LIB_DIR, id + '.json');
      fs.writeFile(filePath, buf, err => {
        if (err) { res.writeHead(500); return res.end('write error'); }
        fs.writeFile(metaPath, JSON.stringify({ id, mime, name }), 'utf8', err2 => {
          res.writeHead(err2 ? 500 : 200);
          res.end(err2 ? 'meta error' : 'ok');
        });
      });
    });

  } else if (req.method === 'DELETE' && urlPath.startsWith('/library-audio/')) {
    const id = safeId(urlPath.slice('/library-audio/'.length));
    if (!id) { res.writeHead(400); return res.end('bad id'); }
    const filePath = path.join(LIB_DIR, id + '.bin');
    const metaPath = path.join(LIB_DIR, id + '.json');
    fs.unlink(filePath, () => {
      fs.unlink(metaPath, () => {
        res.writeHead(200);
        res.end('ok');
      });
    });

  } else if (req.method === 'POST' && urlPath === '/data') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      fs.writeFile(DATA_FILE, body, 'utf8', err => {
        res.writeHead(err ? 500 : 200);
        res.end(err ? 'write error' : 'ok');
      });
    });

  } else {
    res.writeHead(404);
    res.end('not found');
  }

}).listen(PORT, '127.0.0.1', () => {
  console.log(`\n🌸 Hobby Garden running at http://localhost:${PORT}\n`);
  console.log('   Data is saved to: ' + DATA_FILE);
  console.log('   Press Ctrl+C to stop.\n');
});
