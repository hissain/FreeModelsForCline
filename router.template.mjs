import http from 'node:http';

const PORT = 8080;
// Pass via environment variable or replace the placeholder below
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "YOUR_OPENROUTER_API_KEY_HERE";

// Configured free model priority sequence.
// OpenRouter enforces a maximum of 3 models per request, so the router
// automatically chunks them into batches and falls over sequentially.
const FALLBACK_MODELS = [
  "minimax/minimax-m3:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3.5-lightning:free",
  "thinkingmachines/inkling:free",
  "thinkingmachines/inkling-small:free"
];

// Helper: Split array into chunks of up to 3 items
function chunkArray(array, size = 3) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  // Cline model discovery endpoint
  if (req.url.startsWith('/v1/models') || req.url.startsWith('/models')) {
    return res.writeHead(200, { 'Content-Type': 'application/json' })
              .end(JSON.stringify({ data: [{ id: "free-router" }] }));
  }

  // Chat completions endpoint
  if (req.method === 'POST' && req.url.includes('/chat/completions')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        delete payload.model;

        const modelBatches = chunkArray(FALLBACK_MODELS, 3);
        let lastErrorText = "No available models in fallback chain";
        let lastStatus = 500;

        // Iterate through batches in exact priority order
        for (let i = 0; i < modelBatches.length; i++) {
          const currentBatch = modelBatches[i];
          payload.models = currentBatch;

          console.log(`[Router] Attempting batch ${i + 1}/${modelBatches.length}: [${currentBatch.join(', ')}]`);

          try {
            const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/cline/cline",
                "X-Title": "Cline Free Router"
              },
              body: JSON.stringify(payload)
            });

            // If OpenRouter responded successfully (200 OK), pipe stream to Cline
            if (orRes.ok) {
              console.log(`[Router] Batch ${i + 1} succeeded (${orRes.status}). Streaming to client.`);
              res.writeHead(orRes.status, Object.fromEntries(orRes.headers.entries()));
              return orRes.body.pipeTo(new WritableStream({
                write(chunk) { res.write(chunk); },
                close() { res.end(); }
              }));
            }

            // If OpenRouter returned an error (e.g. 429, 503 Overloaded, 400), capture and retry next batch
            lastStatus = orRes.status;
            lastErrorText = await orRes.text();
            console.warn(`[Router] Batch ${i + 1} failed (${lastStatus}): ${lastErrorText.slice(0, 150)}...`);
          } catch (fetchErr) {
            console.warn(`[Router] Batch ${i + 1} network exception: ${fetchErr.message}`);
            lastErrorText = fetchErr.message;
          }
        }

        // If all batches failed, report to Cline
        console.error(`[Router] All ${modelBatches.length} batches exhausted.`);
        res.writeHead(lastStatus, { 'Content-Type': 'application/json' })
           .end(JSON.stringify({ error: { message: lastErrorText } }));

      } catch (err) {
        console.error(`[Router] Request parsing error: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' })
           .end(JSON.stringify({ error: { message: err.message } }));
      }
    });
    return;
  }

  res.writeHead(404).end();
});

server.listen(PORT, () => console.log(`Cline Router active on http://localhost:${PORT}/v1 (max 3 models per OpenRouter request with auto-retry)`));
