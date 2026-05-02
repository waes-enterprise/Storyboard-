import http from 'http';

const AI_BASE = 'http://172.25.136.193:8080/v1';
const API_KEY = 'Z.ai';
const CHAT_ID = 'chat-5a821abb-0b15-48f9-89b4-f4417510537c';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMTcwNWUxYTctYmEzMy00ZjcyLTkwZDMtMzA5MDU4M2UwOWMyIiwiY2hhdF9pZCI6ImNoYXQtNWE4MjFhYmItMGIxNS00OGY5LTg5YjQtZjQ0MTc1MTA1MzdjIiwicGxhdGZvcm0iOiJ6YWkifQ.mUtt8iJ9_0kK0pThYeYik930Fe1mtgGoagXZeM4YIbs';
const USER_ID = '1705e1a7-ba33-4f72-90d3-3090583e09c2';

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  let body = '';
  for await (const chunk of req) body += chunk;

  try {
    const aiRes = await fetch(`${AI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'x-chat-id': CHAT_ID,
        'x-token': TOKEN,
        'x-user-id': USER_ID,
      },
      body,
    });

    const text = await aiRes.text();
    res.writeHead(aiRes.status, { 'Content-Type': 'application/json' });
    res.end(text);
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'AI proxy failed' }));
  }
});

server.listen(4000, () => console.log('AI proxy running on port 4000'));
