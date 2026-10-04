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
  - **Strict Non-Streaming Envelope Validation**: Claude Code automatically retries failed streams using non-streaming requests (`stream: false`). The proxy validates that the response contains a genuine Anthropic Message envelope (`type === "message"`), automatically catching upstream errors disguised under HTTP 200 and cascading to the next fallback model.
  - **Auto Mode Fast-Path**: Intercepts Claude Code's background safety classifier calls (`querySource: "auto_mode"`) to prevent wasting free rate limits on repetitive bash permission checks.
  - Automatically recovers and falls back across active free models before your agent sees an error.

---

## Configured Priority Sequences (Tiered by SWE Benchmarks, Agent Reliability & Context)

The proxy strictly prioritizes **dedicated SWE agent specialists** (Terminal-Bench & DeepSWE leaders) first, followed by **1M-context frontier models** and fast fallback cascades:

### Anthropic Messages API (`/v1/messages` for Claude CLI)
- **Tier 1: Dedicated SWE Agent Specialists**
  1. `poolside/laguna-s-2.1:free` *(Priority 1: **SWE Leader**, 70.2% Terminal-Bench 2.1, 40.4% DeepSWE, 118B MoE, 262k context)*
  2. `cohere/north-mini-code:free` *(Priority 2: Cohere agentic code specialist, 30B MoE, 256k context)*
  3. `nvidia/nemotron-3-ultra-550b-a55b:free` *(Priority 3: **1,000,000 context**, 550B frontier MoE foundation model)*
- **Tier 2: 1M & 512k Context MoE Responders**
  4. `nvidia/nemotron-3.5-lightning:free` *(Priority 4: **1,000,000 context**, high-speed agentic MoE)*
  5. `dots-studio/dots-3-note-preview:free` *(Priority 5: **512,000 context**, 280B MoE)*
  6. `poolside/laguna-xs-2.1:free` *(Priority 6: Lightweight 33B MoE coder, 262k context)*
- **Tier 3: Lightweight & Syntax Specialists (262k Context)**
  7. `qwen/qwen3.8-27b:free` *(Priority 7: Dense syntax, reasoning & tool calling)*
  8. `nvidia/nemotron-3-super-120b-a12b:free` *(Priority 8: **120B parameter** MoE coder)*
  9. `inclusionai/ling-3.0-flash-sante:free` *(Priority 9: High-throughput fallback)*
- **Tier 4: Dynamic Auto Safety Net**
  10. `openrouter/free` *(Priority 10: Dynamic auto-router fallback)*

### OpenAI Chat Completions API (`/v1/chat/completions` for Cline)
- **TokenHarbor Free Models (Optional)**: `deepseek-v4.1-flash:free` (1M context), `deepseek-v4-flash:free`, `mimo-v2.5:free`
- **OpenRouter Free Batches (SWE Leaders -> 1M Responders -> Lightweight Fallbacks)**:
  - **Batch 1 (SWE Leaders & 1M Frontier)**: `poolside/laguna-s-2.1:free`, `cohere/north-mini-code:free`, `nvidia/nemotron-3-ultra-550b-a55b:free`
  - **Batch 2 (1M & 512k MoE Tier)**: `nvidia/nemotron-3.5-lightning:free`, `dots-studio/dots-3-note-preview:free`, `poolside/laguna-xs-2.1:free`
  - **Batch 3 (Lightweight & Syntax Tier)**: `qwen/qwen3.8-27b:free`, `nvidia/nemotron-3-super-120b-a12b:free`, `inclusionai/ling-3.0-flash-sante:free`
  - **Batch 4 (Safety Net)**: `google/gemma-4-31b-it:free`, `google/gemma-4-26b-a4b-it:free`, `openrouter/free`

---

## 🤖 1-Prompt Autonomous Agent Setup

If you use an AI coding agent (**Claude Code**, **Cline**, **Cursor**, **Antigravity**, **Roo Code**, or similar), copy and paste this single prompt directly into your agent to clone, install, configure, and launch the proxy automatically:

> **Copy & Paste Prompt for your Coding Agent:**
> 
> ```text
> Clone https://github.com/hissain/FreeModelsForCline.git, set up the .env file from .env.example, start the background proxy service, and configure my coding tool to use it.
> 
> Critical Decisions — Before proceeding, ask me:
> 1. What is my OpenRouter API Key (sk-or-v1-...)? (Required for OpenRouter free models; prompt me to input it so it can be saved to .env)
> 2. Which client should be configured: Claude Code, Cline, or both?
> 
> Once I provide those answers:
> - Save the API key to .env (and ensure PORT=8081).
> - Start the background proxy daemon using `node scripts/proxy.mjs start`.
> - Verify the service is healthy at http://localhost:8081/health.
> - Configure the requested client(s):
>   * Claude Code: Set ANTHROPIC_BASE_URL="http://localhost:8081" and ANTHROPIC_MODEL="free-router" in ~/.claude/settings.json or .claude/settings.local.json.
>   * Cline: Set Base URL to "http://localhost:8081/v1", Model ID to "free-router", and API Key to "dummy".
> - Run a test prompt through the client to confirm free-tier routing is functional.
> ```

---

## Manual Quick Start

### 1. Prerequisites
- **Node.js** v18+ (uses built-in `fetch`, `node:http`, and `WritableStream`; no `npm install` needed). Works the same on **Windows, macOS and Linux**.

### 2. Setup Configuration
Create your `.env` from the template (same command on every OS):

```bash
npm run init        # or: node scripts/proxy.mjs init
```

Edit `.env` and configure your settings:
```env
OPENROUTER_API_KEY=sk-or-v1-your-key-here
PORT=8081

# Safety Classifier for Claude Code Auto Mode ('auto-approve', 'qwen/qwen3.8-27b:free', 'default')
SAFETY_CLASSIFIER_MODEL=auto-approve
```

> [!NOTE]
> `.env` and `*.log` are ignored by `.gitignore` so your private credentials and logs are never committed. API keys live only in `.env`; `router.mjs` itself contains no secrets.

### 3. Run the Proxy
```bash
npm start           # or: node router.mjs
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
  },
  "permissions": {
    "allow": [
      "Bash(*)",
      "Read(*)",
      "Write(*)",
      "Edit(*)",
      "Glob(*)",
      "Grep(*)"
    ]
  },
  "allowDangerouslySkipPermissions": true
}
```

* **Why `ANTHROPIC_API_KEY: ""`?** Keeping this empty prevents Claude Code from attempting official Anthropic web/console login.
* **Why `ANTHROPIC_AUTH_TOKEN: "dummy"`?** Satisfies Claude Code's internal authentication check; the local proxy injects your actual OpenRouter key upstream.
* **Why `ANTHROPIC_MODEL: "free-router"`?** Instructs the proxy to automatically cascade through active free models.
* **Why `permissions`?** Pre-authorizes core tools with wildcard patterns so Claude Code runs file reads, edits, and terminal commands autonomously without blocking on interactive "dialog waiting" permission prompts.

#### Auto Mode & Safety Classifier Customization

Claude Code includes an **Auto Mode** (`⏵⏵ auto mode on`) where each tool execution (such as `Bash(...)`) is pre-screened by a safety classifier model (`claude-sonnet-5`). When using free tier models, these extra classification prompts can quickly exhaust per-minute rate limits (`free-models-per-min`), resulting in errors like:
```text
Error: claude-sonnet-5 is temporarily unavailable, so auto mode cannot determine the safety of Bash right now.
```

You can customize or optimize the safety classifier in two ways:

1. **Proxy-Level Optimization via `SAFETY_CLASSIFIER_MODEL` in `.env` (Recommended)**:
   The proxy intercepts all requests tagged with `querySource: "auto_mode"` or targeting `claude-sonnet-5`:
   - **`auto-approve`** *(Default)*: Instantly returns `<block>no</block>` in **<20ms** with **0 tokens** consumed. Commands execute immediately, saving 100% of classifier API calls and completely eliminating rate-limit halts while keeping Claude Code in Auto Mode.
   - **`qwen/qwen3.8-27b:free`** *(or any model ID)*: Routes the safety classifier prompt to a dedicated, fast, lightweight model instead of the heavy 550B Nemotron model.
   - **`default`**: Cascades through the standard tiered free models.

2. **Client-Level Customization (Claude CLI)**:
   - **`ANTHROPIC_DEFAULT_SONNET_MODEL`**: You can set this in `~/.claude/settings.json` under `"env"` to direct Claude Code to target a specific model name for the Sonnet/classifier tier.
   - **Toggle Auto Mode (`Shift+Tab`)**: Pressing `Shift+Tab` inside Claude CLI cycles Auto Mode off. When off, Claude Code relies directly on your `permissions.allow` wildcard configuration and runs commands without dispatching any classifier requests.

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

## Background Management (Windows, macOS, Linux)

One cross-platform Node CLI (`scripts/proxy.mjs`) manages the proxy; no PowerShell, cmd or bash scripts are required. It runs `router.mjs` under a small supervisor that restarts it 3 seconds after any crash, and writes logs to `proxy.log` (ignored by git).

| Command | What it does |
| :--- | :--- |
| `npm run proxy:start` | Start in the background (hidden, auto-restart) |
| `npm run proxy:stop` | Stop the proxy and its supervisor |
| `npm run proxy:restart` | Stop, then start |
| `npm run proxy:status` | Show running state, health check, and the last 15 log lines |
| `npm run proxy:run` | Run the supervisor in the foreground (useful for debugging) |
| `npm run autostart:install` | Start automatically at login/boot |
| `npm run autostart:uninstall` | Remove the autostart entry |

Without npm, call the CLI directly: `node scripts/proxy.mjs <start|stop|restart|status|run|install-autostart|uninstall-autostart>`.

The port is read from `.env` (`PORT`), so the CLI always matches the server.

### How autostart is registered per OS

| OS | Mechanism |
| :--- | :--- |
| Windows | `OpenRouterProxy.vbs` in your Startup folder (runs `proxy.mjs start` with no console window) |
| macOS | LaunchAgent `~/Library/LaunchAgents/com.openrouter.proxy.plist` (`RunAtLoad` + `KeepAlive`) |
| Linux | systemd user service `~/.config/systemd/user/openrouter-proxy.service` (run `loginctl enable-linger $USER` to start at boot); falls back to `~/.config/autostart/openrouter-proxy.desktop` when systemd is unavailable |

On macOS and Linux the OS service manager supervises the process itself, so `proxy:start`/`proxy:stop` and the service are two alternatives; use `autostart:uninstall` before managing it manually.