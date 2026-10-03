# Unified Free Model Proxy for Cline & Claude CLI

A lightweight, zero-dependency Node.js proxy server that routes both OpenAI-compatible requests (e.g. **Cline**) and Anthropic Messages requests (e.g. **Claude CLI / Claude Code**) to **OpenRouter's free-tier models** with automatic failover and multi-batch recovery.

---

## Why Use This?

When using free models on OpenRouter with autonomous coding agents (Cline, Claude Code, etc.):

- Free models have per-minute rate limits (`429 Too Many Requests`) or occasional provider overloads (`503 Service temporarily overloaded`).

- Coding agent UIs typically expect a single model endpoint, so an upstream error halts your entire task.

- **OpenRouter Constraint**: OpenRouter's native `models` fallback array enforces a **maximum of 3 models per request**.

- **Protocol Gap**: Claude Code communicates strictly via the Anthropic Messages API (`POST /v1/messages`), while Cline and other tools use the OpenAI Chat Completions API (`POST /v1/chat/completions`).

- **The Solution**: This proxy handles **both protocols simultaneously**:

  - Exposes an OpenAI-compatible endpoint at `/v1/chat/completions` with automated batch chunking (<= 3 models).

  - Exposes an Anthropic Messages endpoint at `/v1/messages` with native Server-Sent Events (SSE) streaming, header normalization, and sequential model cascading.

  - Automatically recovers and falls back across active free models before your agent sees an error.

---

## Configured Priority Sequences (Long Context & Capability First)

The proxy strictly prioritizes **1,000,000 (1M) token context** and massive parameter models first, followed by high-context fallbacks:

### Anthropic Messages API (`/v1/messages` for Claude CLI)

1. `nvidia/nemotron-3-ultra-550b-a55b:free` *(Priority 1: **1,000,000 (1M) context**, massive 550B parameter coding foundation model)*

2. `nvidia/nemotron-3.5-lightning:free` *(Priority 2: **1,000,000 (1M) context**, fast low-latency reasoning)*

3. `dots-studio/dots-3-note-preview:free` *(Priority 3: **512,000 (512k) context**)*

4. `qwen/qwen3.8-27b:free` *(Priority 4: **262,144 (262k) context**, elite coding reasoning)*

5. `openrouter/free` *(Priority 5: Dynamic auto-router safety net fallback)*

### OpenAI Chat Completions API (`/v1/chat/completions` for Cline)

- **TokenHarbor Free Models (Optional)**: `deepseek-v4.1-flash:free` (1M context), `deepseek-v4-flash:free`, `mimo-v2.5:free`

- **OpenRouter Free Batches (1M -> 512k -> 262k)**:

  - **Batch 1 (1M & 512k Context Tier)**: `nvidia/nemotron-3-ultra-550b-a55b:free`, `nvidia/nemotron-3.5-lightning:free`, `dots-studio/dots-3-note-preview:free`

  - **Batch 2 (262k Context Tier)**: `qwen/qwen3.8-27b:free`, `google/gemma-4-31b-it:free`, `google/gemma-4-26b-a4b-it:free`

---

## Quick Start

### 1. Prerequisites

- **Node.js** v18+ (uses built-in `fetch`, `node:http`, and `WritableStream`, no `npm install` needed).

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

## Client Configurations

### 1. Configuring Claude CLI (Claude Code)

Configure Claude Code to route requests through the local proxy. You can configure this globally in `~/.claude/settings.json` (Windows: `%USERPROFILE%\.claude\settings.json`) or per-project in `.claude/settings.local.json`:

```json

{

  "env": {

    "ANTHROPIC_BASE_URL": "http://localhost:8081",

    "ANTHROPIC_AUTH_TOKEN": "dummy",

    "ANTHROPIC_API_KEY": "",

    "ANTHROPIC_MODEL": "free-router"

  }

}

```

* **Why `ANTHROPIC_API_KEY: ""`?** Keeping this empty prevents Claude Code from attempting official Anthropic web/console login.

* **Why `ANTHROPIC_AUTH_TOKEN: "dummy"`?** Satisfies Claude Code's internal authentication check; the local proxy injects your actual OpenRouter key upstream.

* **Why `ANTHROPIC_MODEL: "free-router"`?** Instructs the proxy to automatically cascade through active free models.

**Test Claude CLI:**

```bash

claude -p "Say hello in 3 words"

```

---

### 2. Configuring Cline (VS Code Extension)

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

### Test Chat Completions (OpenAI format)

```bash

curl -X POST http://localhost:8081/v1/chat/completions \

  -H "Content-Type: application/json" \

  -d '{"model":"free-router","messages":[{"role":"user","content":"Say hello in 3 words"}]}'

```

### Test Messages (Anthropic format)

```bash

curl -X POST http://localhost:8081/v1/messages \

  -H "Content-Type: application/json" \

  -H "anthropic-version: 2023-06-01" \

  -d '{"model":"free-router","max_tokens":30,"messages":[{"role":"user","content":"Say hello in 3 words"}]}'

```

---

## Windows Background Management (Survives Reboots)

To run the proxy permanently in the background without keeping a terminal open:

- **Start in Background**: Double-click `start-proxy.cmd`

- **Check Status & Health**: Double-click `status-proxy.cmd`

- **Stop Proxy**: Double-click `stop-proxy.cmd`

- **Auto-Start on Windows Login**: Double-click `install-autostart.cmd` (registers in Windows Startup)

- **Disable Auto-Start**: Double-click `uninstall-autostart.cmd`

Logs are automatically written to `proxy.log` (ignored by git).

