# Grok Build + Home Assistant MCP

## Why this guide exists

This entire project — native Python integration (ported from ozczecho’s .NET stack), custom Lovelace card, live dashboard, automations, helpers, deploy scripts, and **every document in this repository** — was completed in **12 hours** from the decision to go native, to a working production Home Assistant system.

**The home owner did not write or edit a single line of code or YAML by hand.** Everything was produced through **Grok Build TUI** (Grok Build 0.2.54 / Composer 2.5 Fast, 16 June 2026) talking to a live HA instance via the **`ha-mcp`** MCP server. That makes this repo an outstanding example of **Grok Build’s phenomenal capabilities** for real-world home automation.

Use this guide to **install and configure** the Home Assistant MCP server in Grok Build so you can extend or replicate the same agent-driven workflow on your own instance.

---

## Quick start (install + configure)

| Step | Action |
|------|--------|
| 1 | Install [Grok Build](https://github.com/xai-org/grok) and [uv](https://docs.astral.sh/uv/getting-started/installation/) (`uvx` runs `ha-mcp`) |
| 2 | Create a Home Assistant **long-lived access token** (profile → Security) |
| 3 | Add the `home-assistant` MCP server — CLI or `.grok/config.toml` (sections below) |
| 4 | Export `HOMEASSISTANT_URL` and `HOMEASSISTANT_TOKEN` in your shell (never commit the token) |
| 5 | Start `grok`, run `grok mcp doctor home-assistant`, enable the server in `/mcps` |

---

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Grok Build** | TUI installed; project opened in your workspace folder |
| **Python 3.13+** | Required by `uvx` for `ha-mcp` |
| **`uv` / `uvx`** | [Install uv](https://docs.astral.sh/uv/getting-started/installation/) — provides `uvx` to run `ha-mcp` |
| **Home Assistant** | Running on LAN; long-lived access token |
| **Network** | Machine running Grok Build can reach `http://<ha-host>:8123` |

---

## 1. Create a Home Assistant long-lived token

1. Open Home Assistant in the browser.
2. Click your **profile** (bottom of the sidebar).
3. Under **Security**, open **Long-lived access tokens**.
4. **Create token** — name it e.g. `Grok Build MCP`.
5. Copy the token immediately (shown once). Store it in a password manager or SecretStore — **never commit it to git**.

---

## 2. Configure the MCP server in Grok Build

Grok reads MCP servers from `~/.grok/config.toml` (all projects) or **`<project>/.grok/config.toml`** (project-scoped).

### Option A — CLI (quick)

From your project directory (use your HA URL and token):

```bash
grok mcp add --scope project home-assistant \
  -e HOMEASSISTANT_URL=http://homeassistant.local:8123 \
  -e HOMEASSISTANT_TOKEN=your_token_here \
  -- uvx --python 3.13 --refresh ha-mcp@latest
```

### Option B — `config.toml` (recommended; token via env var)

Create or edit `.grok/config.toml` in the project root:

```toml
[mcp_servers.home-assistant]
command = "uvx"
args = ["--python", "3.13", "--refresh", "ha-mcp@latest"]
enabled = true
startup_timeout_sec = 30

[mcp_servers.home-assistant.env]
HOMEASSISTANT_URL = "http://homeassistant.local:8123"
HOMEASSISTANT_TOKEN = "${HOMEASSISTANT_TOKEN}"
```

Load the token into your shell before starting Grok (PowerShell example):

```powershell
$env:HOMEASSISTANT_URL = 'http://homeassistant.local:8123'
$env:HOMEASSISTANT_TOKEN = '<paste-token-or-load-from-secret-store>'
grok
```

**Windows — install `uv` if missing:**

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Grok expands `${HOMEASSISTANT_TOKEN}` from the environment at startup — the token does not belong in the committed config file.

**Optional — SecretStore loader** (keeps tokens out of chat and config files): create a small `Load-McpSecrets.ps1` beside `.grok/config.toml` that sets `HOMEASSISTANT_TOKEN` (and `GITHUB_PERSONAL_ACCESS_TOKEN` if you use GitHub MCP) from your local vault, then dot-source it before `grok`.

### Verify

```bash
grok mcp doctor home-assistant
```

Expect: handshake OK and a large set of HA tools (automations, dashboards, helpers, entities, etc.).

In the Grok TUI: `/mcps` → enable **home-assistant** → **`r`** to refresh.

---

## 3. What the HA MCP enables

With `ha-mcp` connected, Grok Build can directly:

- Add/update **integrations**, **automations**, **helpers**, **dashboards**
- Read entity states and history
- Deploy and validate configuration against best-practice checks
- Create **Lovelace** resources and panel views

That is how this repository’s live system (dashboard screenshot in `docs/ha-dashboard-daikin-ac.jpg`) was assembled without manual YAML editing.

---

## 4. Optional — GitHub MCP (for publishing this repo)

To create and push the public GitHub repository from Grok Build, configure GitHub’s hosted MCP (project-scoped example):

```toml
[mcp_servers.github]
url = "https://api.githubcopilot.com/mcp/"
enabled = true

[mcp_servers.github.headers]
Authorization = "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}"
```

Use a [GitHub PAT](https://github.com/settings/tokens) with **`repo`** scope. Load `GITHUB_PERSONAL_ACCESS_TOKEN` in the shell before `grok`, then run `grok mcp doctor github`.

See also: [Grok MCP documentation](https://github.com/xai-org/grok/blob/main/docs/user-guide/07-mcp-servers.md) (or `~/.grok/docs/user-guide/07-mcp-servers.md` on your machine).

---

## 5. Security notes

- Rotate tokens if exposed; never paste tokens into chat or commit them.
- Prefer environment variables or a local secret vault over hard-coding in `config.toml`.
- Restrict long-lived HA tokens to the minimum needed; revoke unused tokens in HA profile.

---

## 6. Typical Grok Build workflow for HA projects

1. Connect `ha-mcp` (this guide).
2. Describe the goal in natural language (integration, dashboard, automation).
3. Let Grok Build read/write via MCP; deploy Python/JS via Samba or file copy + HA restart.
4. Verify in the HA UI; iterate in Grok Build until complete.
5. Export/source-control the generated files into a git repository.

This AirTouch 3 project followed exactly that loop — **12 hours**, zero manual code or YAML, integration through documentation.