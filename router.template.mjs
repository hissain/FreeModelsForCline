import http from 'node:http';
import { existsSync } from 'node:fs';

// Automatically load .env if available
if (typeof process.loadEnvFile === 'function' && existsSync('.env')) {
  process.loadEnvFile('.env');
}

const PORT = process.env.PORT || 8081;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const TOKENHARBOR_API_KEY = process.env.TOKENHARBOR_API_KEY || '';

if (!OPENROUTER_API_KEY && !TOKENHARBOR_API_KEY) {
  console.error('[Router] ERROR: Neither OPENROUTER_API_KEY nor TOKENHARBOR_API_KEY is set.');
  console.error('[Router] Please configure at least one in .env or your environment variables.');
  process.exit(1);
}

// TokenHarbor free models sequence
const TOKENHARBOR_FREE_MODELS = [
  'deepseek-v4.1-flash:free',
  'deepseek-v4-flash:free',
  'mimo-v2.5:free'
];

// OpenRouter free models sequence
// OpenRouter free models sequence (OpenAI format for Cline)
const OPENROUTER_FALLBACK_MODELS = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'qwen/qwen3.8-27b:free',
  'nvidia/nemotron-3.5-lightning:free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free'
];

// OpenRouter free models sequence (Anthropic format for Claude CLI)
const ANTHROPIC_FALLBACK_MODELS = [
  'openrouter/free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'qwen/qwen3.8-27b:free',
  'nvidia/nemotron-3.5-lightning:free'
];

// Split array into chunks of up to 3 items (OpenRouter maximum)
function chunkArray(array, size = 3) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Catalog of models exposed to clients
const MODEL_CATALOG = [
  { id: 'free-router', name: '? Auto Free (TokenHarbor -> OpenRouter)', owned_by: 'unified-proxy', provider: 'Unified' },
  { id: 'deepseek-v4.1-flash:free', name: 'TokenHarbor: DeepSeek V4.1 Flash Free (1M Context)', owned_by: 'tokenharbor', provider: 'TokenHarbor' },
  { id: 'deepseek-v4-flash:free', name: 'TokenHarbor: DeepSeek V4 Flash Free', owned_by: 'tokenharbor', provider: 'TokenHarbor' },
  { id: 'mimo-v2.5:free', name: 'TokenHarbor: MiMo V2.5 Free', owned_by: 'tokenharbor', provider: 'TokenHarbor' },
  { id: 'minimax/minimax-m3:free', name: 'OpenRouter: MiniMax M3 Free (1M Context)', owned_by: 'openrouter', provider: 'OpenRouter' },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'OpenRouter: Nemotron 3 Ultra 550B Free', owned_by: 'openrouter', provider: 'OpenRouter' },
  { id: 'nvidia/nemotron-3.5-lightning:free', name: 'OpenRouter: Nemotron 3.5 Lightning Free', owned_by: 'openrouter', provider: 'OpenRouter' },
  { id: 'thinkingmachines/inkling:free', name: 'OpenRouter: Inkling Free', owned_by: 'openrouter', provider: 'OpenRouter' },
  { id: 'thinkingmachines/inkling-small:free', name: 'OpenRouter: Inkling Small Free', owned_by: 'openrouter', provider: 'OpenRouter' }
];

async function callTokenHarbor(model, payload) {
  const body = { ...payload, model };
  delete body.models;

  return await fetch('https://tokenharbor.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKENHARBOR_API_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Unified-AI-Proxy/1.0'
    },
    body: JSON.stringify(body)
  });
}

async function callOpenRouter(models, payload) {
  const body = { ...payload };
  delete body.model;
  body.models = Array.isArray(models) ? models : [models];

  return await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/cline/cline',
      'X-Title': 'Unified Free Model Proxy'
    },
    body: JSON.stringify(body)
  });
}

function pipeResponse(res, upstreamRes) {
  const headers = Object.fromEntries(upstreamRes.headers.entries());
  delete headers['content-encoding'];
  delete headers['content-length'];
  delete headers['transfer-encoding'];
  res.writeHead(upstreamRes.status, headers);
  return upstreamRes.body.pipeTo(new WritableStream({
    write(chunk) { res.write(chunk); },
    close() { res.end(); }
  }));
}

async function callOpenRouterMessages(model, payload, anthropicVersion = "2023-06-01") {
  const body = { ...payload, model };
  delete body.models;

  return await fetch("https://openrouter.ai/api/v1/messages", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "anthropic-version": anthropicVersion,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/anthropics/claude-code",
      "X-Title": "Claude Code Free Proxy"
    },
    body: JSON.stringify(body)
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  // Health check endpoint
  if (req.url === '/health' || req.url === '/v1/health') {
    return res.writeHead(200, { 'Content-Type': 'application/json' })
              .end(JSON.stringify({
                status: 'ok',
                port: Number(PORT),
                providers: {
                  tokenharbor: Boolean(TOKENHARBOR_API_KEY),
                  openrouter: Boolean(OPENROUTER_API_KEY)
                },
                models_count: MODEL_CATALOG.length
              }));
  }

  // Model discovery endpoint
  if (req.url.startsWith('/v1/models') || req.url.startsWith('/models')) {
    return res.writeHead(200, { 'Content-Type': 'application/json' })
              .end(JSON.stringify({ object: 'list', data: MODEL_CATALOG }));
  }

  // -------------------------------------------------------------
  // 1. Anthropic Messages endpoint for Claude CLI / Claude Code
  // -------------------------------------------------------------
  if (req.method === "POST" && req.url.includes("/messages")) {
    let rawBody = "";
    req.on("data", chunk => rawBody += chunk);
    req.on("end", async () => {
      try {
        const payload = JSON.parse(rawBody);
        const requestedModel = (payload.model || "").trim();
        const anthropicVersion = req.headers["anthropic-version"] || "2023-06-01";

        // Direct explicit model
        const isExplicit = requestedModel &&
                           requestedModel !== "free-router" &&
                           requestedModel !== "default" &&
                           !requestedModel.startsWith("claude-");

        if (isExplicit && OPENROUTER_API_KEY) {
          console.log(`[Proxy-Messages] Routing directly to model: ${requestedModel}`);
          try {
            const upstreamRes = await callOpenRouterMessages(requestedModel, payload, anthropicVersion);
            return pipeResponse(res, upstreamRes);
          } catch (e) {
            console.error(`[Proxy-Messages] Error for ${requestedModel}: ${e.message}`);
            res.writeHead(502, { "Content-Type": "application/json" })
               .end(JSON.stringify({ type: "error", error: { type: "api_error", message: e.message } }));
            return;
          }
        }

        // Cascade through active free models for Claude CLI
        console.log(`[Proxy-Messages] Cascading Anthropic Messages for '${requestedModel || "free-router"}'`);
        let lastErrorText = "All fallback providers exhausted";
        let lastStatus = 503;

        for (const candidateModel of ANTHROPIC_FALLBACK_MODELS) {
          console.log(`[Proxy-Messages] Trying candidate model: ${candidateModel}`);
          try {
            const upstreamRes = await callOpenRouterMessages(candidateModel, payload, anthropicVersion);
            if (upstreamRes.ok) {
              console.log(`[Proxy-Messages] Model (${candidateModel}) SUCCEEDED (${upstreamRes.status}). Streaming response.`);
              return pipeResponse(res, upstreamRes);
            }
            lastStatus = upstreamRes.status;
            lastErrorText = await upstreamRes.text();
            console.warn(`[Proxy-Messages] Model (${candidateModel}) returned ${lastStatus}: ${lastErrorText.slice(0, 120)}`);
          } catch (netErr) {
            console.warn(`[Proxy-Messages] Model (${candidateModel}) network error: ${netErr.message}`);
            lastErrorText = netErr.message;
          }
        }

        res.writeHead(lastStatus, { "Content-Type": "application/json" })
           .end(JSON.stringify({ type: "error", error: { type: "api_error", message: lastErrorText } }));

      } catch (err) {
        console.error(`[Proxy-Messages] Request parsing exception: ${err.message}`);
        res.writeHead(500, { "Content-Type": "application/json" })
           .end(JSON.stringify({ type: "error", error: { type: "api_error", message: err.message } }));
      }
    });
    return;
  }

  // -------------------------------------------------------------
  // 2. Chat completions endpoint (OpenAI format for Cline)
  // -------------------------------------------------------------
  if (req.method === 'POST' && req.url.includes('/chat/completions')) {
    let rawBody = '';
    req.on('data', chunk => rawBody += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(rawBody);
        const requestedModel = (payload.model || '').trim();

        // -------------------------------------------------------------
        // Strategy 1: Targeted TokenHarbor Model
        // -------------------------------------------------------------
        const isExplicitTokenHarbor = TOKENHARBOR_FREE_MODELS.includes(requestedModel) ||
                                     requestedModel.startsWith('deepseek-') ||
                                     requestedModel.startsWith('mimo-');

        if (isExplicitTokenHarbor && TOKENHARBOR_API_KEY) {
          console.log(`[Proxy] Routing directly to TokenHarbor: ${requestedModel}`);
          try {
            const thRes = await callTokenHarbor(requestedModel, payload);
            if (thRes.ok) {
              console.log(`[Proxy] TokenHarbor (${requestedModel}) succeeded (${thRes.status}). Streaming response.`);
              res.writeHead(thRes.status, Object.fromEntries(thRes.headers.entries()));
              return thRes.body.pipeTo(new WritableStream({
                write(chunk) { res.write(chunk); },
                close() { res.end(); }
              }));
            }
            const errText = await thRes.text();
            console.warn(`[Proxy] TokenHarbor (${requestedModel}) error (${thRes.status}): ${errText.slice(0, 150)}`);
            // If explicit model failed and was rate-limited, attempt fallback to next TokenHarbor free model
            if ((thRes.status === 429 || thRes.status >= 500) && requestedModel !== 'deepseek-v4-flash:free') {
              console.log(`[Proxy] Retrying TokenHarbor fallback with deepseek-v4-flash:free...`);
              const fbRes = await callTokenHarbor('deepseek-v4-flash:free', payload);
              if (fbRes.ok) {
                res.writeHead(fbRes.status, Object.fromEntries(fbRes.headers.entries()));
                return fbRes.body.pipeTo(new WritableStream({
                  write(chunk) { res.write(chunk); },
                  close() { res.end(); }
                }));
              }
            }
            res.writeHead(thRes.status, { 'Content-Type': 'application/json' }).end(errText);
            return;
          } catch (e) {
            console.error(`[Proxy] TokenHarbor network error: ${e.message}`);
            res.writeHead(502, { 'Content-Type': 'application/json' })
               .end(JSON.stringify({ error: { message: `TokenHarbor error: ${e.message}` } }));
            return;
          }
        }

        // -------------------------------------------------------------
        // Strategy 2: Targeted OpenRouter Model (contains vendor '/' or matches list)
        // -------------------------------------------------------------
        const isExplicitOpenRouter = requestedModel.includes('/') ||
                                    OPENROUTER_FALLBACK_MODELS.includes(requestedModel);

        if (isExplicitOpenRouter && OPENROUTER_API_KEY) {
          console.log(`[Proxy] Routing directly to OpenRouter: ${requestedModel}`);
          try {
            const orRes = await callOpenRouter([requestedModel], payload);
            if (orRes.ok) {
              console.log(`[Proxy] OpenRouter (${requestedModel}) succeeded (${orRes.status}). Streaming response.`);
              res.writeHead(orRes.status, Object.fromEntries(orRes.headers.entries()));
              return orRes.body.pipeTo(new WritableStream({
                write(chunk) { res.write(chunk); },
                close() { res.end(); }
              }));
            }
            const errText = await orRes.text();
            console.warn(`[Proxy] OpenRouter (${requestedModel}) error (${orRes.status}): ${errText.slice(0, 150)}`);
            res.writeHead(orRes.status, { 'Content-Type': 'application/json' }).end(errText);
            return;
          } catch (e) {
            console.error(`[Proxy] OpenRouter network error: ${e.message}`);
            res.writeHead(502, { 'Content-Type': 'application/json' })
               .end(JSON.stringify({ error: { message: `OpenRouter error: ${e.message}` } }));
            return;
          }
        }

        // -------------------------------------------------------------
        // Strategy 3: Virtual 'free-router' / Auto Cascade (Default)
        // -------------------------------------------------------------
        console.log(`[Proxy] Initiating unified cascade for model '${requestedModel || 'free-router'}'`);
        let lastErrorText = 'All fallback providers exhausted';
        let lastStatus = 503;

        // Phase 1: Try TokenHarbor Free Models (if key present)
        if (TOKENHARBOR_API_KEY) {
          for (const thModel of TOKENHARBOR_FREE_MODELS) {
            console.log(`[Proxy] [Cascade 1/2] Attempting TokenHarbor: ${thModel}`);
            try {
              const thRes = await callTokenHarbor(thModel, payload);
              if (thRes.ok) {
                console.log(`[Proxy] [Cascade 1/2] TokenHarbor (${thModel}) SUCCEEDED (200).`);
                res.writeHead(thRes.status, Object.fromEntries(thRes.headers.entries()));
                return thRes.body.pipeTo(new WritableStream({
                  write(chunk) { res.write(chunk); },
                  close() { res.end(); }
                }));
              }
              lastStatus = thRes.status;
              lastErrorText = await thRes.text();
              console.warn(`[Proxy] TokenHarbor (${thModel}) returned ${lastStatus}: ${lastErrorText.slice(0, 120)}`);
            } catch (netErr) {
              console.warn(`[Proxy] TokenHarbor (${thModel}) connection failed: ${netErr.message}`);
              lastErrorText = netErr.message;
            }
          }
        }

        // Phase 2: Cascade to OpenRouter Free Batches (if key present)
        if (OPENROUTER_API_KEY) {
          const modelBatches = chunkArray(OPENROUTER_FALLBACK_MODELS, 3);
          for (let i = 0; i < modelBatches.length; i++) {
            const currentBatch = modelBatches[i];
            console.log(`[Proxy] [Cascade 2/2] Attempting OpenRouter Batch ${i + 1}/${modelBatches.length}: [${currentBatch.join(', ')}]`);
            try {
              const orRes = await callOpenRouter(currentBatch, payload);
              if (orRes.ok) {
                console.log(`[Proxy] [Cascade 2/2] OpenRouter Batch ${i + 1} SUCCEEDED (200).`);
                res.writeHead(orRes.status, Object.fromEntries(orRes.headers.entries()));
                return orRes.body.pipeTo(new WritableStream({
                  write(chunk) { res.write(chunk); },
                  close() { res.end(); }
                }));
              }
              lastStatus = orRes.status;
              lastErrorText = await orRes.text();
              console.warn(`[Proxy] OpenRouter Batch ${i + 1} returned ${lastStatus}: ${lastErrorText.slice(0, 120)}`);
            } catch (netErr) {
              console.warn(`[Proxy] OpenRouter Batch ${i + 1} connection failed: ${netErr.message}`);
              lastErrorText = netErr.message;
            }
          }
        }

        // Exhausted all models
        console.error(`[Proxy] All cascade providers failed.`);
        res.writeHead(lastStatus, { 'Content-Type': 'application/json' })
           .end(JSON.stringify({ error: { message: lastErrorText } }));

      } catch (err) {
        console.error(`[Proxy] Request parsing exception: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' })
           .end(JSON.stringify({ error: { message: err.message } }));
      }
    });
    return;
  }

  res.writeHead(404).end();
});

server.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`?? Unified Free AI Proxy active at http://localhost:${PORT}/v1`);
  console.log(`   - TokenHarbor: ${TOKENHARBOR_API_KEY ? 'CONNECTED (DeepSeek V4.1 Flash Free ready)' : 'DISABLED'}`);
  console.log(`   - OpenRouter:  ${OPENROUTER_API_KEY ? 'CONNECTED (5 models chunked in batches of 3)' : 'DISABLED'}`);
  console.log(`   - Master Virtual Model: 'free-router' (Auto-Cascade)`);
  console.log(`================================================================`);
});
