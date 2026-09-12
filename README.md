# OpenRouter Free Model Proxy for Cline

A lightweight, zero-dependency Node.js proxy server that routes OpenAI-compatible requests from **Cline** (or any AI coding assistant) to **OpenRouter's free-tier models** with automatic failover and multi-batch recovery.

---

## Why Use This?

When using free models on OpenRouter with autonomous coding agents like Cline:
- Free models have per-minute rate limits (`429 Too Many Requests`) or occasional provider overloads (`503 Service temporarily overloaded`).
- Cline's UI only allows selecting a single model, so an upstream error halts your entire task.
- **OpenRouter Constraint**: OpenRouter's native `models` fallback array enforces a **maximum of 3 models per request**.
- **The Solution**: This proxy chunks your exact priority model list into batches of $\le 3$ models, sends the primary batch to OpenRouter, and if a provider is overloaded or rate-limited, it automatically retries with the next batch in priority order before Cline ever sees an error.

---

## Configured Priority Sequence

The proxy evaluates models in your exact order:

### Batch 1 (Primary - Up to 3 models per OpenRouter API limit)
1. `minimax/minimax-m3:free` *(Priority 1: 1M context, strong general reasoning & tool use)*
2. `nvidia/nemotron-3-ultra-550b-a55b:free` *(Priority 2: Massive 550B parameter coding model)*
3. `nvidia/nemotron-3.5-lightning:free` *(Priority 3: Fast, low-latency reasoning)*

### Batch 2 (Secondary Fallback)
4. `thinkingmachines/inkling:free` *(Priority 4: Agentic reasoning & multi-step execution)*
5. `thinkingmachines/inkling-small:free` *(Priority 5: Lightweight agentic fallback)*

---

## Quick Start

### 1. Prerequisites
- **Node.js** v18+ (uses built-in `fetch` and `node:http`, no `npm install` needed).

### 2. Setup Configuration
Copy `.env.example` to `.env` and add your OpenRouter API key:

```bash
# In Git Bash / Linux / macOS:
cp .env.example .env
cp router.template.mjs router.mjs

# In PowerShell:
Copy-Item .env.example .env
Copy-Item router.template.mjs router.mjs
```

Edit `.env` and paste your key:
```env
OPENROUTER_API_KEY=sk-or-v1-your-key-here
PORT=8081
```

> [!NOTE]
> Both `.env`, `router.mjs`, and `*.log` are ignored by `.gitignore` so your private credentials and logs are never committed.

### 3. Run the Proxy
```powershell
node router.mjs
```

The server will start listening at:
```text
http://localhost:8081/v1
```

---

## Configuring Cline

Open your **Cline Settings** in VS Code and configure:

| Setting | Value |
| :--- | :--- |
| **API Provider** | `OpenAI Compatible` |
| **Base URL** | `http://localhost:8081/v1` |
| **API Key** | `dummy` *(the proxy attaches your real OpenRouter key)* |
| **Model ID** | `free-router` |

---

## Useful Commands

### Test Health & Model Discovery
```bash
curl http://localhost:8081/v1/models
```
*Expected response:*
```json
{"data":[{"id":"free-router"}]}
```

### Test Chat Completions Directly
```bash
curl -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"free-router","messages":[{"role":"user","content":"Say hello in 3 words"}]}'
```

---

## Customizing Models
Edit the `FALLBACK_MODELS` array inside `router.mjs` to add, remove, or change priority order. The proxy will automatically chunk them into batches of 3 and handle failover sequentially. Check active free models anytime on [openrouter.ai/models?max_price=0](https://openrouter.ai/models?max_price=0).

---

## Windows Background Management (Survives Reboots)

To run the proxy permanently in the background without keeping a terminal open:

- **Start in Background**: Double-click `start-proxy.cmd`
- **Check Status & Health**: Double-click `status-proxy.cmd`
- **Stop Proxy**: Double-click `stop-proxy.cmd`
- **Auto-Start on Windows Login**: Double-click `install-autostart.cmd` (registers in Windows Startup)
- **Disable Auto-Start**: Double-click `uninstall-autostart.cmd`

Logs are automatically written to `proxy.log` (ignored by git).
