## Nitan MCP

> **Project Homepage:** [https://nitan.ai/mcp](https://nitan.ai/mcp)

[论坛开发讨论贴](https://www.uscardforum.com/t/topic/450599)

This is a heavy modified version of [Discourse MCP](https://github.com/discourse/discourse-mcp). It will be a dedicated MCP client for https://www.uscardforum.com/

---

# Part 1: Using the published package (no pnpm needed)

Everything in this part runs the published npm package directly. You only need
Node.js (or Bun) and Python — **pnpm is not required**; it is only used to
develop this repo (see Part 2).

## Prerequisites

- **Node.js 26+** (or **Bun 1.4+** — both run all features; see `bunx` below)
- Python 3.10+ (required for Cloudflare bypass)
- pip (used via local `.venv` Python)

**Check your Node.js version:**
```bash
node --version  # Should be v26.0.0 or higher
```

**If you need to upgrade Node.js:**
```bash
# Using nvm (recommended)
nvm install 26
nvm use 26

# Or download from https://nodejs.org/
```

## Run with npx (recommended)

```bash
npx -y @needforspeed/nitan-mcp@latest
```

**What happens automatically:**
1. ✅ Downloads and caches the package
2. ✅ Installs Node.js dependencies
3. ✅ Runs `postinstall` script to check/install Python dependencies
4. ✅ On macOS, auto-installs `playwright` package and Chromium runtime for browser fallback
5. ✅ Checks Python dependencies at runtime and shows helpful warnings if missing

The server will start even if Python dependencies are missing, but Cloudflare bypass features won't work until you install them.

## Run with bunx (optional, same behavior)

```bash
bunx @needforspeed/nitan-mcp@latest
```

`bunx` works like `npx`. Bun 1.4+ runs nitan-mcp identically to Node 26+; one
platform caveat (Bun blocks `RSA_PKCS1_PADDING` for `privateDecrypt`) is handled
automatically in code. Check `doctor` output to see which runtime was detected
(`node: … (runtime: bun 1.4.3 …)`).

## Python dependency setup (all platforms)

Use a local venv to avoid system Python policy conflicts (PEP668 / externally managed environments):

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

`python_path` defaults to `.venv/bin/python` when available. The `postinstall`
script prefers a local `.venv` and installs requirements via its Python/pip.

**If Python dependencies aren't installed automatically:**
```bash
.venv/bin/python -m pip install cloudscraper curl-cffi nodriver
# Or install from requirements.txt (recommended)
.venv/bin/python -m pip install -r requirements.txt
```

**If Python is installed in a virtual environment, point the server at it:**
```bash
npx -y @needforspeed/nitan-mcp@latest --python_path /path/to/python_executable
```

## MCP Client Configuration

### API key setup (recommended)

If you want authenticated reads without storing forum login credentials in your MCP client config, generate a Discourse User API key once and save it to a profile file.

#### Generate and save the API key

```bash
npx -y @needforspeed/nitan-mcp@latest generate-user-api-key \
  --site https://www.uscardforum.com \
  --auth-mode url
```

Authorization launch modes:

- `--auth-mode url` (default): print the authorization URL in the terminal and let the user open it manually.
- `--auth-mode browser`: automatically open the authorization URL in the default browser, while still showing the URL in the terminal as a fallback.

### Resumable multi-step generation (recommended for agents)

If your MCP host launches a short-lived process that cannot wait for the user to paste the payload back immediately, use the resumable flow.

#### Step 1: start generation and persist pending state

```bash
npx -y @needforspeed/nitan-mcp@latest generate-user-api-key \
  --site https://www.uscardforum.com \
  --auth-mode browser \
  --state-file /absolute/path/nitan-user-api-key.json
```

This command:

1. Generates the RSA key pair and a unique client ID.
2. Prints the authorization URL.
3. Optionally opens the browser if `--auth-mode browser` is used.
4. Saves the pending private/public key state to `--state-file`.
5. Exits without waiting for the payload.

#### Step 2: complete later with the payload

```bash
npx -y @needforspeed/nitan-mcp@latest complete-user-api-key \
  --state-file /absolute/path/nitan-user-api-key.json \
  --payload "PASTE_THE_ENCRYPTED_PAYLOAD_HERE"
```

`complete-user-api-key` decrypts the payload using the saved pending state, writes the final `user_api_key` to the profile, and removes the state file on success.

#### Manual copy/paste flow details

Browser-launch example:

```bash
npx -y @needforspeed/nitan-mcp@latest generate-user-api-key \
  --site https://www.uscardforum.com \
  --auth-mode browser \
  --state-file /absolute/path/nitan-user-api-key.json
```

What happens:

1. The CLI generates a temporary RSA key pair.
2. It prints a Discourse authorization URL.
3. Open that URL, log into uscardforum, and authorize the application.
4. Discourse shows an encrypted payload on the page.
5. Copy that payload and paste it back into the terminal prompt.
6. The CLI decrypts it and saves `user_api_key` + `user_api_client_id` into the profile file.

The current flow uses the manual copy/paste payload path and requests `read` scope by default.

#### Default profile location

The CLI saves the API profile to a platform default location automatically:

- macOS: `~/Library/Application Support/NitanMCP/profile.json`
- Linux / Docker: `${XDG_CONFIG_HOME:-~/.config}/nitan-mcp/profile.json`
- Windows: `%APPDATA%\NitanMCP\profile.json`

Example saved profile:

```json
{
  "auth_pairs": [
    {
      "site": "https://www.uscardforum.com",
      "user_api_key": "YOUR_USER_API_KEY",
      "user_api_client_id": "nitan-mcp-550e8400-e29b-41d4-a716-446655440000"
    }
  ]
}
```

If you do not pass `--client-id`, the generator creates a unique `nitan-mcp-<uuid>` client ID by default.

### Use the saved API key in your MCP client

The server loads the default profile location automatically. No extra path flag is needed.

**For Claude Desktop (macOS/Windows), using npx:**
```json
{
  "mcpServers": {
    "nitan": {
      "command": "npx",
      "args": [
        "-y",
        "@needforspeed/nitan-mcp@latest"
      ],
      "env": {
        "TIMEZONE": "America/New_York"
      }
    }
  }
}
```

**Or with Bun instead (bunx):**
```json
{
  "mcpServers": {
    "nitan": {
      "command": "bunx",
      "args": [
        "@needforspeed/nitan-mcp@latest"
      ],
      "env": {
        "TIMEZONE": "America/New_York"
      }
    }
  }
}
```

If an API key exists for the selected site, the server uses that first.

#### Delete the current saved API key file

To remove the current default saved API profile file entirely:

```bash
npx -y @needforspeed/nitan-mcp@latest delete-user-api-key
```

### Login via environment variables (alternative to API key)

If you do not want to use an API key, you can provide login credentials instead.

```json
{
  "mcpServers": {
    "nitan": {
      "command": "npx",
      "args": [
        "-y",
        "@needforspeed/nitan-mcp@latest"
      ],
      "env": {
        "NITAN_USERNAME": "YOUR_USERNAME",
        "NITAN_PASSWORD": "YOUR_PASSWORD"
      }
    }
  }
}
```

Behavior summary:

- API key and login credentials are alternative auth setups.
- If an API key exists for the site, it is preferred.
- If no API key exists but `NITAN_USERNAME` / `NITAN_PASSWORD` are configured, login mode is used.
- If neither exists, public tools still work, but auth-required tools will ask you to set up an API key or provide `NITAN_USERNAME` / `NITAN_PASSWORD`.

Use optional env `"TIMEZONE": "America/New_York"` if you want a timezone different from your local clock.

**Configuration file location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

## Cloudflare Bypass

This server uses an intelligent **multi-layer Cloudflare bypass strategy**:
1. Tries `cloudscraper` first (mature, established)
2. Automatically falls back to `curl_cffi` if cloudscraper fails (better browser impersonation)
3. On CF 403, launches `nodriver` (headless Chrome) to solve the challenge and harvest cookies, then retries via `curl_cffi`
4. Remembers failures and uses the working method for subsequent requests

This provides maximum reliability against Cloudflare protection. See [CLOUDFLARE_BYPASS.md](CLOUDFLARE_BYPASS.md) for details.

## Browser Fallback (new)

When direct bypass still hits Cloudflare challenge (403/challenge page), browser fallback is enabled by default on macOS.

- Keeps current direct mode as default
- Triggers browser path only on challenge-like responses
- **macOS only**: default provider is Playwright persistent profile mode (`playwright`)
- **macOS only**: install auto-installs Playwright + Chromium runtime (both npx and pnpm/postinstall paths)
- Profile selection for Playwright fallback:
  - Reuse OpenClaw user-data-dir only when the selected profile directory exists
  - Otherwise use/create `~/Library/Application Support/NitanMCP/ChromeProfile`
  - If OpenClaw user-data-dir exists but the selected profile directory is missing, auto-fallback to Nitan profile dir
  - Never use the system default Chrome profile directory
- If fallback lands on login/not_logged_in and `NITAN_USERNAME` + `NITAN_PASSWORD` are set, Playwright auto-login is attempted and request is retried once
- Interactive login keeps working by opening a visible Chrome window with the selected profile
- Non-macOS: browser fallback is disabled automatically (direct bypass only), and Playwright is not auto-installed

CLI flags (or profile JSON fields):

- `--browser-fallback-enabled=true`
- `--browser-fallback-provider=playwright`
- `--browser-fallback-timeout-ms=45000`
- `--interactive-login-enabled=true`
- `--login-profile-name="nitan"`
- `--login-check-url="https://www.uscardforum.com/"`

Example:

```bash
npx -y @needforspeed/nitan-mcp@latest \
  --browser-fallback-enabled=true \
  --browser-fallback-provider=playwright \
  --interactive-login-enabled=true \
  --login-profile-name="nitan"
```

If you switch provider to `openclaw_proxy` and relay is unavailable, attach a tab with OpenClaw Browser Relay (badge `ON`) and retry.

If Playwright is missing on macOS, run:

```bash
# extra flags prevent npm from re-creating package-lock.json
npm install --no-save --package-lock=false playwright
npx playwright install chromium
```

## HTTP Transport (MCP 2.0 / 2026-07-28 Stateless)

By default the server uses stdio transport (for Claude Desktop, `npx` usage, etc.). You can also run it as a persistent HTTP server using the MCP 2.0 Streamable HTTP protocol with the 2026-07-28 stateless revision.

In stateless mode, every MCP request is served by a fresh server instance — no `initialize` handshake, no `Mcp-Session-Id`, and requests are self-describing. This makes the HTTP server horizontally scalable and compatible with load balancers.

```bash
# Start the HTTP server
npx -y @needforspeed/nitan-mcp@latest --transport http --port 3001

# Or with bunx
bunx @needforspeed/nitan-mcp@latest --transport http --port 3001
```

The MCP endpoint is available at `http://localhost:3001/mcp` (or `/`). Additional endpoints:

- `GET /health` — health check (JSON)
- `GET /auth` — auth page for Discourse User API key authorization
- `POST /auth/callback` — complete auth flow

Legacy 2025-era MCP clients are also served transparently (the handler falls back to a stateless 2025 lane automatically).

The stdio transport remains the default and supports both 2025-era and 2026-07-28 protocol clients via `serveStdio`.

---

# Part 2: Development

These sections only apply if you want to build nitan-mcp from this repository.
They assume `pnpm` is installed (`npm i -g pnpm`, or see pnpm.io/installation).

## Package manager: pnpm

This repo uses **pnpm** for everything dependency-related:

- `package.json` declares `"packageManager": "pnpm@10.14.0"`, so corepack/pnpm enforce the exact tool version
- CI (`.github/workflows/ci.yml`) runs `pnpm install`, `pnpm typecheck`, `pnpm build`, `pnpm test`
- `pnpm-lock.yaml` is the single source of truth for dependency versions

**Simplified setup by platform:**

### macOS
```bash
pnpm install
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

`pnpm install` will also auto-install `playwright` and the Chromium runtime on macOS for browser fallback.

### Linux
```bash
pnpm install
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

On non-macOS platforms, Playwright is not auto-installed.

### Windows (PowerShell)
```powershell
pnpm install
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Run health check from a local build:
```bash
pnpm build
node dist/index.js doctor
```

## Bun as an alternative runtime

Bun 1.4+ can run nitan-mcp as a drop-in alternative to Node.js 26+. One caveat is handled
automatically in code: Bun (like Node 22/23) blocks `RSA_PKCS1_PADDING` for
`privateDecrypt` when decrypting Discourse User API key payloads. nitan-mcp falls back to a
raw `RSA_NO_PADDING` decrypt plus manual PKCS#1 v1.5 unpadding, so the user API key flow
works identically on both runtimes. Check `doctor` output for the detected runtime
(`node: … (runtime: bun …)`).

Install Bun 1.4+ first (see https://bun.sh). Dependencies are still installed with pnpm
(the repo's package manager); Bun is just used to run the built code:

```bash
pnpm install
pnpm build

# Run the stdio server (default transport)
bun run dist/index.js

# Or run as an HTTP server
bun run dist/index.js --transport http --port 3001

# CLI subcommands work the same way
bun run dist/index.js doctor
bun run dist/index.js generate-user-api-key --site https://www.uscardforum.com

# Run the test suite (all 54 tests are expected to pass)
bun test dist/test/
```

> **Note:** Bun is a supported **runtime**, not this repo's package manager.
> `pnpm-lock.yaml` is the source of truth for dependency versions, so don't run
> `bun install` in this repo — it would ignore the pnpm lockfile and create a
> second `bun.lock`.

(`bun test` with no arguments also works: Bun compiles TypeScript directly, so
it picks up `src/test/*.ts` as well as the compiled `dist/test/*.js` — the same
54 tests twice.)

## Skill Distribution (OpenClaw AgentSkill)

This project also ships an **AgentSkill** (additive only, does **not** change MCP runtime behavior).

- Skill source: `skills/nitan/SKILL.md`
- Pack command:

```bash
pnpm skill:pack
# output: dist-skill/nitan.skill
```

### Install Skill in OpenClaw

Option A (recommended): install the packaged file

1. Build the skill package:

```bash
pnpm skill:pack
```

2. Import `dist-skill/nitan.skill` into OpenClaw Skill manager (or your skill distribution channel).

Option B: install from source folder (local development)

1. Copy `skills/nitan/` to your OpenClaw skills directory.
2. Restart/reload OpenClaw so it re-indexes skills.

Release-ready checklist:

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
pnpm skill:pack
```

Publish flow:
- npm package publish remains unchanged.
- Attach `dist-skill/nitan.skill` as a release artifact (or upload to your skill channel).

---

# Reference

## Original README
[Discourse MCP](https://github.com/discourse/discourse-mcp/blob/main/README.md)
