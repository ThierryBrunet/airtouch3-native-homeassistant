# AirTouch 3 + Home Assistant — Installation Guide

> **Start here** for the full install: Option A (Grok Build AI prompts) or Option B (hands-on manual). Overview and credits: [README.md](../README.md) · Design notes: [NOTES.md](../NOTES.md)

---

## Why this is exciting

You are about to do something most home owners never get to try: **let an AI coding agent wire your air conditioning into Home Assistant** — live, on your LAN, with verification at every step.

This project was first built in **12 hours** using **Grok Build** + the Home Assistant **MCP** server: integration, custom dashboard, automations, deploy scripts, and documentation — with the agent reading and writing your real HA instance. That is not science fiction; it is a practical experiment you can repeat on your own home.

**Option A (Grok Build)** is the recommended adventure: you describe goals in plain English; Grok executes, verifies, debugs, and explains. You learn by watching a capable agent work — and you stay in control at every checkpoint. Start with **[Phase 0.0 — Install Grok Build TUI](#phase-00--install-grok-build-tui-option-a)** (or use another coding AI — see [0.0.5](#005-substituting-another-coding-ai)).

**Option B (manual)** is equally valid if you prefer typing commands yourself, or if no AI assistant is on your machine yet. Same result, same verification gates — skip Phase 0.0 entirely.

**What you will install:** The native Python integration in this repository (`custom_components/airtouch3`), optional custom Lovelace dashboard card, helpers, and automations. No `vzduch-dotek` .NET sidecar is required for the main path (see [Legacy: vzduch-dotek route](#appendix--legacy-vzduch-dotek-route) if you want that older stack).

**Platforms supported:** Windows, macOS, and Linux for development/deploy; Home Assistant OS (or equivalent) on your HA host.

---

## How to use this guide

Two parallel paths, one finish line. Pick one and stay on it until every **Success checkpoint** is green.

| Path | Who does the work | Best when |
|------|-------------------|-----------|
| **Option A — Grok Build prompts** | You paste prompts; Grok Build executes, verifies, and debugs with enthusiasm and patience | You want the **AI pair-programming experiment** — fastest path with MCP |
| **Option B — Home owner manual** | You type commands and click through HA yourself | You prefer hands-on control, or Grok Build is not available yet |

**Rules for both paths**

1. **Do not skip Phase 0.** Home Assistant must be healthy before any AirTouch work.
2. **Every critical step has Verify → Debug.** If verification fails, fix that step before continuing — Grok will babysit you through it.
3. **Never paste secrets into chat, git, or screenshots.** Use the [Parameter worksheet](#parameter-worksheet) and a password manager or OS vault.
4. **Ask questions at any time.** Stuck for more than 15 minutes? That is normal. Stop and ask — Grok Build is here to debug with you until **100% success**.

When you are done, you will have: integration connected, entities visible, dashboard working, and live tests (zone on/off, mode change) confirmed in the HA UI. Celebrate — you will have local, cloud-free AC control.

---

## Parameter worksheet

Fill this in **before** Phase 1. Keep an encrypted copy; do not commit values to git.

| Parameter | Your value | How to find it | Verified? |
|-----------|------------|----------------|-----------|
| Home Assistant URL | e.g. `http://192.168.31.50:8123` | Browser; HA **Settings → System → Network** | ☐ |
| Home Assistant IP / hostname | e.g. `192.168.31.50` | Router DHCP; `ping` | ☐ |
| HA long-lived access token | *(vault only)* | Profile → Security → Long-lived access tokens | ☐ |
| AirTouch 3 wall controller IP | e.g. `192.168.31.144` | Router; AirTouch app; port scan (8899) | ☐ |
| AirTouch TCP port | `8899` (default) | Almost always 8899 | ☐ |
| Your PC OS | Windows / macOS / Linux | — | ☐ |
| Samba share reachable? | See [OS-specific paths](#03-enable-file-access-to-ha-config) | Explorer / Finder / `mount` | ☐ |
| SSH reachable? | `ssh root@<HA-IP>` | Terminal add-on on HA | ☐ |
| Deploy method chosen | Samba / SSH+rsync / Studio Code | Phase 0.3 + Phase 1.1 | ☐ |
| Python 3.13+ | `python3 --version` | MCP + validation script | ☐ |
| Grok Build installed (Option A) | `grok --version` | [Phase 0.0](#phase-00--install-grok-build-tui-option-a) | ☐ |
| Grok authenticated (Option A) | `grok` launches TUI | Browser login or `XAI_API_KEY` | ☐ |
| Climate entity ID (after setup) | e.g. `climate.brunet` | Developer tools → States | ☐ |
| Zone switch / fan / sensor IDs | e.g. `switch.kitchen` | Developer tools → States | ☐ |

---

# Phase 0.0 — Install Grok Build TUI (Option A)

> **Skip this entire section** if you chose **Option B (manual)** — you do not need an AI coding assistant on your PC.
>
> **Using a different AI?** Grok Build built this project in 12 hours, but **any capable coding AI can substitute** — as long as it can run shell commands, read/edit files in your workspace, and (ideally) connect to MCP servers. Examples: **Cursor** (Agent mode), **Claude Code**, **Windsurf**, **GitHub Copilot CLI**, or another terminal agent. The **Option A prompts** in this guide target Grok Build; paste them into your tool and adapt MCP setup to that product's docs. Option B always works without any AI.

This phase installs and authenticates the **Grok Build TUI** before Home Assistant MCP (Phase 0.6) and before AirTouch-specific prompts.

Official reference: [Grok Build — Getting Started](https://github.com/xai-org/grok) (local copy after install: `~/.grok/docs/user-guide/01-getting-started.md`).

---

## 0.0.1 Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Terminal** | PowerShell 7+ (Windows), Terminal.app or iTerm (macOS), modern Linux terminal |
| **Network** | Outbound HTTPS for install/auth; LAN to Home Assistant later |
| **Account or API key** | [grok.com](https://grok.com) (browser login) **or** [console.x.ai](https://console.x.ai) `XAI_API_KEY` |
| **Disk** | ~200 MB for binary + `~/.grok` |
| **Project folder** | This repo cloned/copied — `cd` into it before `grok` |
| **Later (Phase 0.4–0.6)** | `uv`/`uvx`, Python 3.13+, HA long-lived token |

### Option A — Grok Build prompt

```
I'm starting AirTouch 3 + Home Assistant with Grok Build (Option A).

On my <Windows|macOS|Linux> PC:
1. Check grok --version
2. If missing, install latest Grok Build TUI via the official installer for my OS
3. Verify PATH (new terminal if needed)
4. Walk me through first-time auth (browser login — I won't paste API keys in chat unless using env var locally)
5. Confirm grok works in: <path-to-Daikin_HA>

Don't proceed to HA MCP until grok --version passes and the TUI starts. Be encouraging!
```

### Option B — Install Grok Build yourself

#### Windows (PowerShell)

```powershell
irm https://x.ai/cli/install.ps1 | iex
```

Optional pinned version: `$env:GROK_VERSION = "0.2.54"; irm https://x.ai/cli/install.ps1 | iex`

Adds `%USERPROFILE%\.grok\bin` to User PATH — **open a new terminal** after install.

Also works: **Git Bash** or **WSL** with the bash script below.

#### macOS / Linux (bash)

```bash
curl -fsSL https://x.ai/cli/install.sh | bash
```

Optional: `curl -fsSL https://x.ai/cli/install.sh | bash -s 0.2.54`

#### Update later

```bash
grok update
```

---

## 0.0.2 Verify installation

```bash
grok --version
```

### Verify ✅

| Check | Pass criteria |
|-------|----------------|
| Version command | Prints version (e.g. `0.2.x`); not "command not found" |
| Binary on PATH | `which grok` / `Get-Command grok` → `~/.grok/bin/grok` |

### Debug 🔧

| Symptom | What to try |
|---------|-------------|
| Not found | New terminal; add `~/.grok/bin` to PATH |
| Script blocked (Windows) | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| WSL vs Windows | Separate installs — use the one matching your workflow |

**0.0.2 success:** `grok --version` works.

---

## 0.0.3 Authenticate (first launch)

### Browser login (recommended)

```bash
cd <path-to-Daikin_HA>
grok
```

First run opens the browser for grok.com sign-in. Session saved in `~/.grok/auth.json`.

| Command | Purpose |
|---------|---------|
| `grok login` | Re-authenticate / switch account |
| `grok logout` | Clear cached session |

### API key (no browser)

Key from [console.x.ai](https://console.x.ai) — set in **your** terminal only; never commit:

```bash
export XAI_API_KEY="xai-..."    # macOS/Linux
grok
```

```powershell
$env:XAI_API_KEY = 'xai-...'    # Windows
grok
```

Run `grok logout` first if browser session exists.

### Verify ✅

| Check | Pass criteria |
|-------|----------------|
| TUI opens | Prompt at bottom; scrollback above |
| No auth loop | Stable session after login |
| Project cwd | Started from `Daikin_HA` folder |

### Debug 🔧

| Symptom | What to try |
|---------|-------------|
| Browser won't open | `grok login --device-auth` (headless/SSH) |
| Stuck login | `grok logout`; remove `~/.grok/auth.json`; retry |

**0.0.3 success:** TUI runs; you can chat with the agent.

---

## 0.0.4 Smoke test

In TUI from `Daikin_HA`:

```
List top-level files in this project and summarize what airtouch3_custom_component does. Don't change anything yet.
```

CLI one-shot:

```bash
grok -p "What is this repository for? One paragraph." --output-format plain
```

### Verify ✅

| Check | Pass criteria |
|-------|----------------|
| Response | Mentions AirTouch 3 / Home Assistant |
| Tools | Agent can list files (approve if prompted) |

| TUI tip | Keys |
|---------|------|
| Send | `Enter` |
| Approve tools | On-screen, or `Ctrl+O` / `/always-approve` |
| Attach file | `@README.md` |
| MCP (after 0.6) | `/mcps` |

**Phase 0.0 success:** Grok Build ready in project folder.

---

## 0.0.5 Substituting another coding AI

| Tool | Fit | MCP |
|------|-----|-----|
| **Grok Build TUI** | **Best** — prompts written for it | Phase 0.6 |
| **Cursor** Agent | Excellent | Cursor MCP settings + same HA env vars |
| **Claude Code** | Excellent | `claude mcp` / project MCP config |
| **Windsurf / Copilot CLI** | Good | Product-specific MCP docs |
| **Chat-only (no tools)** | Use **Option B** manual | N/A |

Copy any Option A prompt into your tool. Keep **verify → debug → proceed** discipline.

---

# Phase 0 — Prerequisites (both paths)

Complete every subsection. **Do not proceed to Phase 1 until Phase 0 Success is true.**

---

## 0.1 Confirm Home Assistant is running correctly

### Option A — Grok Build prompt

```
I'm excited to set up AirTouch 3 in Home Assistant with your help — let's do this step by step!

Before any integration work:
1. Tell me how to confirm my Home Assistant instance is healthy (UI, logs, supervisor if applicable).
2. My HA URL is: <PASTE URL ONLY — NO TOKEN>
3. If Home Assistant MCP is connected, use it to read system info, core version, and confirm the instance responds.
4. If anything looks wrong (crash loop, disk full, empty states), stop and help me fix HA first — we'll get there together.
5. Summarise: HA version, install type, and whether we're clear to proceed. Be encouraging!
```

### Option B — Home owner steps

1. Open your Home Assistant URL in a browser (any OS).
2. Confirm **Overview** loads without certificate or login errors.
3. **Settings → System → About** — note Core version (**2024.1+** required).
4. **Settings → System → Logs** — no repeating fatal errors.
5. **Developer tools → States** — entities load (not empty).

### Verify ✅

| Check | Pass criteria |
|-------|----------------|
| UI loads | Overview within ~10 s |
| Core version | ≥ 2024.1 |
| Logs | No crash loop |
| States | Typical household entity count |

### Debug 🔧

| Symptom | What to try |
|---------|-------------|
| Page will not load | Ping HA IP; try `http://IP:8123` |
| Login loop | Incognito; check HA time sync |
| Supervisor errors | Apply updates; reboot |
| Disk full | **Settings → System → Storage** |
| Empty States | Wait 2 min; restart HA once |

**Phase 0.1 success:** UI healthy, version noted.

---

## 0.2 Capture network parameters

### Option A — Grok Build prompt

```
Help me discover and verify network parameters for AirTouch 3 + HA on my <Windows|macOS|Linux> PC.

Known values:
- HA URL: <URL>
- HA IP: <IP or hostname>
- LAN subnet: <e.g. 192.168.31.0/24>

Tasks:
1. Verify HA is reachable on port 8123 from this machine.
2. Find the AirTouch 3 wall controller IP (TCP 8899):
   - Windows: scripts/Test-AirTouchConnection.ps1 -Subnet <prefix>
   - macOS/Linux: nmap or bash loop on port 8899 (suggest exact commands)
3. Record results in a parameter table (no secrets).
4. If 8899 is closed, debug with me until we have the right IP. Explain each hypothesis.
```

### Option B — Home owner steps

#### All platforms — HA IP

Router admin → DHCP clients → find Home Assistant host.

#### Windows — scan AirTouch

```powershell
cd <path-to-repo>\scripts
.\Test-AirTouchConnection.ps1 -Subnet 192.168.31
.\Test-AirTouchConnection.ps1 -Host 192.168.31.144 -Port 8899
```

#### macOS / Linux — scan AirTouch

With [nmap](https://nmap.org/) installed:

```bash
nmap -p 8899 --open 192.168.31.0/24
```

Without nmap (bash, replace subnet prefix):

```bash
for i in $(seq 1 254); do
  (echo >/dev/tcp/192.168.31.$i/8899) 2>/dev/null && echo "192.168.31.$i:8899 open"
done
```

#### Python validation (all platforms)

```bash
cd <path-to-repo>
python3 scripts/validate_airtouch_protocol.py --host 192.168.31.144 --port 8899
```

Record IPs in the [Parameter worksheet](#parameter-worksheet).

### Verify ✅

| Check | Pass criteria |
|-------|----------------|
| HA reachable | Browser opens HA |
| AirTouch 8899 | One clear host responds |
| Same LAN | HA and AirTouch share typical home subnet |

### Debug 🔧

| Symptom | What to try |
|---------|-------------|
| No host on 8899 | Scan wall-panel subnet; power-cycle AirTouch; confirm ceiling module Wi‑Fi |
| Multiple hosts | Test each with panel UI responsive |
| VLAN isolation | Same VLAN or firewall rules for 8123 and 8899 |

**Phase 0.2 success:** Both IPs documented; port 8899 open.

---

## 0.3 Enable file access to HA `config`

You need read/write access to HA's `config` folder. Pick **at least one** method for your OS.

### Option A — Grok Build prompt

```
I need file access to my Home Assistant config folder on <Windows|macOS|Linux>.

HA IP: <IP>
Try Samba and SSH; recommend the best deploy path for my OS.

1. Guide me to install Samba share add-on on HA OS (if needed).
2. Guide me to install SSH / Terminal add-on on HA.
3. Test connectivity from this PC with OS-specific commands.
4. Samba credentials: tell me what to store in my vault (never print passwords in chat).
5. Confirm I can write a test file under config/ and delete it.
```

### Option B — Home owner steps

#### On Home Assistant (all platforms)

1. **Settings → Add-ons → Add-on store**
2. Install **Samba share** and/or **Advanced SSH & Web Terminal** (or **Terminal & SSH**).
3. Configure credentials; **Start** + **Start on boot**.

#### Windows — Samba

1. Explorer → `\\<HA-IP>\config` → enter Samba credentials.
2. Confirm `configuration.yaml` and `custom_components/` visible.

#### macOS — Samba

1. Finder → **Go → Connect to Server** → `smb://<HA-IP>/config`
2. Enter Samba username/password.
3. Share mounts on Desktop or `/Volumes/config`.

#### Linux — Samba

```bash
sudo apt install cifs-utils   # Debian/Ubuntu
sudo mkdir -p /mnt/ha-config
sudo mount -t cifs //<HA-IP>/config /mnt/ha-config -o username=<user>,uid=$(id -u),gid=$(id -g)
# Unmount when done: sudo umount /mnt/ha-config
```

Or use `smbclient //<HA-IP>/config -U <user>` for quick checks.

#### macOS / Windows / Linux — SSH (recommended for Linux deploy)

```bash
ssh root@<HA-IP> -p 22
ls /config
touch /config/www/_write_test.txt && rm /config/www/_write_test.txt
```

SSH keys (macOS/Linux): `ssh-copy-id root@<HA-IP>` for passwordless deploy.

#### Browser-only alternatives

- **Studio Code Server** add-on — edit in browser.
- **File editor** add-on — OK for small edits; tedious for full integration.

### Verify ✅

| Check | Pass criteria |
|-------|----------------|
| Samba | `custom_components/` visible via share |
| SSH | `ls /config/custom_components` works |
| Write test | Create and delete test file under `www/` |

### Debug 🔧

| Symptom | What to try |
|---------|-------------|
| Access denied | Re-check add-on username/password |
| Share not found | Use IP not hostname; confirm add-on running |
| SSH refused | Check mapped port in add-on config |
| Linux mount fails | Install `cifs-utils`; check `vers=2.0` in mount options |

**Phase 0.3 success:** Read/write under `/config`.

---

## 0.4 Install Python and Grok tooling

Required for protocol validation and (Option A) Home Assistant MCP.

### Option A — Grok Build prompt

```
Let's get my dev machine ready for the Grok Build + AirTouch experiment on <Windows|macOS|Linux>!

Install/check:
- Python 3.13+
- uv / uvx (for ha-mcp@latest)
- Grok Build CLI

Give me exact install commands for my OS. Run version checks.
Then run from repo root:
  python3 scripts/validate_airtouch_protocol.py --host <AIRTOUCH_IP> --port 8899
Interpret the result with me. If it fails, debug until we see a real protocol response.
```

### Option B — Home owner steps

| OS | Python | uv |
|----|--------|-----|
| **Windows** | [python.org](https://www.python.org/downloads/) — tick **Add to PATH** | `powershell -c "irm https://astral.sh/uv/install.ps1 \| iex"` |
| **macOS** | `brew install python@3.13` or python.org | `brew install uv` or Astral install script |
| **Linux** | `sudo apt install python3 python3-venv` or [deadsnakes PPA](https://launchpad.net/~deadsnakes/+archive/ubuntu/ppa) for 3.13 | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |

Verify:

```bash
python3 --version    # 3.10+ required; 3.13+ for MCP
uv --version         # optional but recommended for Option A
```

### Verify ✅

| Check | Pass criteria |
|-------|----------------|
| Python | ≥ 3.10 (3.13+ for MCP) |
| Protocol script | Exit 0; AC/zone data or clear response |

### Debug 🔧

| Symptom | What to try |
|---------|-------------|
| `python3` not found | Use OS package manager; check PATH |
| Connection error | Re-run Phase 0.2 |
| Garbled response | Wrong IP — must be wall controller |

**Phase 0.4 success:** Validation script passes.

---

## 0.5 Secrets — capture and safe storage

| Secret | Used for | Store as |
|--------|----------|----------|
| HA long-lived token | Grok MCP, REST | `HOMEASSISTANT_TOKEN` in vault |
| HA URL | MCP | `HOMEASSISTANT_URL` in vault |
| Samba user/password | Windows/macOS Samba deploy | Vault; use with `-Credential` |
| SSH key or password | Linux/macOS rsync deploy | `~/.ssh/` or vault |
| GitHub PAT (optional) | Publishing | `GITHUB_PERSONAL_ACCESS_TOKEN` |

### Option A — Grok Build prompt

```
Set up secure credential storage for my AirTouch / Home Assistant Grok Build project on <Windows|macOS|Linux>.

Store: HOMEASSISTANT_URL, HOMEASSISTANT_TOKEN, Samba credentials (if used).
- Windows: PowerShell SecretStore (myLocalSecretVault) + Load-McpSecrets.ps1 pattern
- macOS: Keychain or 1Password CLI — your recommendation
- Linux: pass, keyring, or 1Password CLI

Audit workspace: no tokens in git; .grok/config.toml uses ${ENV_VAR} only.
Never print secret values — confirm names and counts only.
I'm excited to use MCP safely — walk me through it!
```

### Option B — Home owner steps

1. HA: **Profile → Security → Long-lived access tokens → Create** (`Grok Build MCP`).
2. Save token in your password manager **once**.
3. Samba password: save when configuring add-on.
4. Test token (all platforms):

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer <TOKEN>" \
  "http://<HA-IP>:8123/api/"
# Expect: 200
```

5. **Never** commit `secrets.json`, `.env`, or raw tokens.

### Verify ✅

| Check | Pass criteria |
|-------|----------------|
| API | curl returns `200` |
| Repo | No raw tokens in tracked files |
| Vault | Reload without re-pasting into chat |

**Phase 0.5 success:** Secrets off-repo; API accepts token.

---

## 0.6 Install Home Assistant MCP in Grok Build (Option A only)

**Requires [Phase 0.0](#phase-00--install-grok-build-tui-option-a) complete** (`grok --version` works, TUI authenticated).

Skip if you chose **Option B only**. If you use **another coding AI**, configure its MCP client with the same `HOMEASSISTANT_URL` and `HOMEASSISTANT_TOKEN` — see [grok-build-home-assistant-mcp.md](grok-build-home-assistant-mcp.md) for the server definition (portable beyond Grok).

See also: [grok-build-home-assistant-mcp.md](grok-build-home-assistant-mcp.md).

### Option A — Grok Build prompts (run in order)

**0.6a — Install tooling**

```
I'm starting my Grok Build + Home Assistant experiment! Install/check on <OS>:
- Grok Build CLI
- uv / uvx
- Python 3.13

Report versions; install anything missing. This is going to be fun.
```

**0.6b — Configure MCP**

```
Configure home-assistant MCP for this AirTouch 3 project.

- HA URL: <worksheet — no token in chat>
- Token: from environment / vault only
- Project .grok/config.toml with HOMEASSISTANT_TOKEN = "${HOMEASSISTANT_TOKEN}"
- Run: grok mcp doctor home-assistant

Give me exact shell commands to load secrets and start grok on my OS (PowerShell vs bash).
Success = doctor handshake OK + HA tools listed.
```

**0.6c — Verify in TUI**

```
MCP doctor time! Confirm home-assistant is enabled:
- grok mcp doctor home-assistant
- TUI: /mcps → enable home-assistant → refresh
- Read my HA core version and entity count via MCP

If anything fails, debug with me until it works — explain each fix clearly.
```

### Verify ✅ (Option A)

| Check | Pass criteria |
|-------|----------------|
| `grok mcp doctor home-assistant` | Handshake OK |
| MCP | Agent can read HA states |
| Security | Token not in committed files |

**Phase 0 Success checkpoint**

- ☐ (Option A) Grok Build installed + authenticated (0.0)
- ☐ HA healthy (0.1)
- ☐ IPs + port 8899 (0.2)
- ☐ Config access (0.3)
- ☐ Python validation (0.4)
- ☐ Secrets safe (0.5)
- ☐ (Option A) MCP doctor OK (0.6)

---

# Phase 1 — Deploy the integration

---

## 1.1 Copy files to Home Assistant

### Option A — Grok Build prompt

```
Deploy the native AirTouch 3 integration to my Home Assistant — let's go!

Repo: <workspace>/Daikin_HA
HA IP: <IP>
My OS: <Windows|macOS|Linux>
Access: Samba and/or SSH

Tasks:
1. Copy airtouch3_custom_component/* → config/custom_components/airtouch3/
2. Copy latest www/daikin-ac-panel-v*.js → config/www/
3. Use the right script for my OS:
   - Windows: scripts/Deploy-AirTouch3Component.ps1 -SambaHost <IP> -Credential (from vault, not chat)
   - macOS/Linux: scripts/deploy-airtouch3.sh <IP> over SSH
4. Verify manifest.json, protocol/, and www card on HA.
5. Tell me when to full-restart HA.

Verify file list matches source before we continue — I'm watching and learning!
```

### Option B — Home owner steps

#### Windows — Samba + PowerShell

With credentials (recommended):

```powershell
cd <path-to-repo>\scripts
$cred = Get-Credential   # Samba add-on username + password
.\Deploy-AirTouch3Component.ps1 -SambaHost 192.168.31.50 -Credential $cred
```

If you already signed in via Explorer (`\\<HA-IP>\config`), credentials are optional:

```powershell
.\Deploy-AirTouch3Component.ps1 -SambaHost 192.168.31.50
```

#### macOS — Samba manual copy

1. Mount `smb://<HA-IP>/config` in Finder.
2. Copy `airtouch3_custom_component/` → `custom_components/airtouch3/` on the share.
3. Copy `airtouch3_custom_component/www/daikin-ac-panel-v11.js` → `www/`.
4. Exclude `__pycache__`, `.git`, `at3.PNG`.

#### macOS / Linux — SSH + rsync (recommended on Linux)

```bash
cd <path-to-repo>/scripts
chmod +x deploy-airtouch3.sh
./deploy-airtouch3.sh 192.168.31.50
# Optional: HA_USER=root HA_PORT=22 ./deploy-airtouch3.sh homeassistant.local
```

Requires `rsync` and SSH access (`openssh` on macOS, `rsync openssh-client` on Linux).

#### Manual copy (any OS)

Copy `airtouch3_custom_component/` → `config/custom_components/airtouch3/` and the latest `www/daikin-ac-panel-v*.js` → `config/www/`.

### Verify ✅

| Check | Pass criteria |
|-------|----------------|
| `manifest.json` | Under `custom_components/airtouch3/` |
| `protocol/` | Present |
| Card JS | Under `config/www/` |
| Version | Matches repo release (e.g. `1.0.5`) |

### Debug 🔧

| Symptom | What to try |
|---------|-------------|
| Samba auth fail (Windows) | Use `-Credential`; check add-on user |
| rsync permission denied | SSH as `root`; check `authorized_keys` |
| Partial copy | Delete `airtouch3` folder; redeploy entire tree |
| robocopy ≥ 8 | Share disconnected; re-mount or re-auth |

---

## 1.2 Restart Home Assistant

### Option A — Grok Build prompt

```
Full HA restart time — new Python integration needs it!

Use MCP if you can; otherwise guide me through Settings → System → Restart.
After restart: check logs for "airtouch3" errors; confirm UI is back (2–5 min).
No "Reload integration" for Python — full restart only. Stay with me until we're green.
```

### Option B — Home owner steps

1. **Settings → System → Restart**
2. Wait for UI
3. **Settings → System → Logs** → filter `airtouch3`

### Verify ✅

| Check | Pass criteria |
|-------|----------------|
| HA online | UI loads |
| Logs | No `ImportError` for airtouch3 |

**Phase 1 success:** Files deployed; restart clean.

---

# Phase 2 — Add the integration in HA UI

### Option A — Grok Build prompt

```
Add AirTouch 3 integration via config flow — the exciting moment!

Host: <AIRTOUCH_IP>  Port: 8899

Use MCP if possible; else exact UI clicks.
List every entity_id created (climate, switches, fans, sensors).
If connection fails, debug TCP/IP with me until the config flow succeeds.
```

### Option B — Home owner steps

1. **Settings → Devices & services → Add integration**
2. Search **AirTouch 3**
3. Host = AirTouch IP, Port = `8899`
4. **Developer tools → States** — note all `climate.*`, `switch.*`, `fan.*`, `sensor.airtouch3_*`
5. Toggle one zone — confirm response

### Verify ✅

| Check | Pass criteria |
|-------|----------------|
| Config flow | Success |
| Entities | Climate + zones + sensors |
| Live test | Zone switch works |

### Debug 🔧

| Symptom | What to try |
|---------|-------------|
| Cannot connect | Re-run port 8899 test |
| Wrong IP | Wall panel, not indoor unit |
| Missing entities | Full restart; re-add |

**Phase 2 success:** Integration live and controllable.

---

# Phase 3 — Dashboard and optional extras

## 3.1 Lovelace resource

**Option A prompt:**

```
Register /local/daikin-ac-panel-v11.js as a JavaScript module resource via MCP or UI steps.
Verify under Settings → Dashboards → Resources. Remind me: hard-refresh (Ctrl+Shift+R / Cmd+Shift+R).
```

**Option B:** **Settings → Dashboards → Resources → Add** → URL `/local/daikin-ac-panel-v11.js`, type **JavaScript module**.

## 3.2 Dashboard panel

![Daikin A/C dashboard — unit controls, zone cards with Auto/Manual/HA damper modes, and 7-day temperature chart](ha-dashboard-daikin-ac.jpg)

**Option A prompt:**

```
Build the Daikin A/C panel from docs/dashboard-daikin-ac.example.yaml using my real entity_ids:
<paste from worksheet>
Panel mode, live temps, no blank card. Use MCP — this is the fun visual payoff!
```

**Option B:** New view `daikin-ac`, panel mode, paste YAML from `docs/dashboard-daikin-ac.example.yaml`, replace all entity IDs.

## 3.3 Optional helper + automation

See `docs/helper-ac-power.example.yaml` and `docs/automation-morning-start.example.yaml`.

**Phase 3 success:** Dashboard renders; controls work.

---

# Phase 4 — Final acceptance test

| # | Test | Pass? |
|---|------|-------|
| 1 | HA Overview loads | ☐ |
| 2 | `climate.*` mode change | ☐ |
| 3 | Zone `switch.*` toggle | ☐ |
| 4 | Zone `fan.*` damper % | ☐ |
| 5 | `sensor.*` updates ≤ 5 min | ☐ |
| 6 | Dashboard matches Entities | ☐ |
| 7 | No `airtouch3` errors in logs | ☐ |
| 8 | Secrets not in git/chat | ☐ |

**Option A — final prompt:**

```
Final acceptance test — let's confirm 100% success on my AirTouch 3 + HA setup!

Use MCP to read entities and walk me through all 8 Phase 4 checks.
Any failure: debug until fixed, explain root cause, then re-test.
Don't mark done until all 8 pass. We did this!
```

**Project complete when all 8 are checked.** You now have a locally controlled, Grok-assisted smart AC setup.

---

# Babysitting — ask anything

No question is too small. Grok Build (Option A) or this guide (Option B) stays with you until every step passes.

| Question | Answer |
|----------|--------|
| Do I need vzduch-dotek? | **No** for the main path — see [Legacy appendix](#appendix--legacy-vzduch-dotek-route). |
| Which IP is AirTouch? | **Wall touchscreen** — verify port **8899**. |
| macOS without Samba? | Use `deploy-airtouch3.sh` over SSH. |
| Windows without Samba? | Use SSH add-on + WSL `deploy-airtouch3.sh`, or Studio Code Server. |
| Reload or restart? | **Full restart** after Python changes. |
| Token pasted in chat? | Revoke in HA → new token → vault only. |
| Grok made a mistake? | Redeploy from repo; restart HA; re-add integration. |

### Option A — babysitting prompt (copy anytime)

```
I'm the home owner on Phase <N> of AirTouch 3 + HA setup with Grok Build.

Status: <what I see>
Expected: <what should happen>
Errors: <logs — redact tokens>
My OS: <Windows|macOS|Linux>

Stay on this step until verification passes. Debug with me patiently. One question at a time. We've got this.
```

---

# Appendix — Prompt index (Option A)

| Phase | Summary |
|-------|---------|
| 0.0 | Install + auth Grok Build TUI (or substitute AI) |
| 0.1 | HA health |
| 0.2 | Network + OS-specific scan |
| 0.3 | Samba/SSH file access |
| 0.4 | Python + uv + validation |
| 0.5 | Secrets vault |
| 0.6a–c | Grok MCP install + doctor |
| 1.1 | OS-specific deploy |
| 1.2 | Full restart |
| 2.1 | Config flow |
| 3.1–3.3 | Dashboard + extras |
| 4 | 8-point acceptance |
| — | Babysit / debug |

---

# Appendix — Legacy: vzduch-dotek route

> **When to use this:** Historical interest, comparison, or if you already run ozczecho's .NET API and want the REST-based HA component instead of the native Python integration in this repo.
>
> **Recommendation:** New installs should use the **native Python path** (Phases 0–4 above). It is simpler — one less container, direct TCP to port 8899.

## What vzduch-dotek is

[vzduch-dotek](https://github.com/ozczecho/vzduch-dotek) is a .NET REST API that reverse-engineered the AirTouch 3 local protocol. A separate HA custom component (also by ozczecho) talks to **vzduch on port 5353**, not directly to AirTouch on 8899.

```
Home Assistant → vzduch-dotek API (:5353) → AirTouch 3 panel (:8899)
```

Cloned copies in this workspace (reference only): `vzduch-dotek/`, `home-assistant-addons/`.

## Legacy Option A — Grok Build prompts

```
I want the LEGACY vzduch-dotek route (not native Python). Walk me through:

1. Confirm AirTouch reachable on <IP>:8899
2. Configure vzduch-dotek appsettings.json (localHost, localPort 8899)
3. Build and run vzduch-dotek (.NET 8) — Docker or dotnet run
4. Verify http://<host>:5353/api/aircons returns JSON
5. Install ozczecho HA add-on OR copy legacy airtouch3 custom component
6. Add integration pointing at vzduch API host:5353 (NOT AirTouch 8899)
7. Verify entities; debug each layer if failing

Explain trade-offs vs native Python. Verify every step before continuing.
```

## Legacy Option B — Home owner steps

### L.1 Prerequisites

Same Phase 0.1–0.2 (HA healthy, AirTouch IP, port 8899 open). Install **[.NET 8 SDK](https://dotnet.microsoft.com/download)** (or use Docker).

### L.2 Configure vzduch-dotek

Edit `vzduch-dotek/appsettings.json`:

```json
"airTouch": {
  "localHost": "192.168.31.144",
  "localPort": 8899
}
```

### L.3 Run the API

**Docker:**

```bash
cd vzduch-dotek
docker build -f Dockerfile -t vzduch-dotek .
docker run -d --name vzduch-dotek -p 5353:5353 vzduch-dotek
```

**dotnet (Windows/macOS/Linux):**

```bash
cd vzduch-dotek
dotnet run
```

### L.4 Verify API ✅

```bash
curl http://localhost:5353/api/aircons
# Or: scripts/Test-AirTouchConnection.ps1 -Host <PC-IP> -ApiPort 5353
```

Pass: JSON with aircon state. Fail: check AirTouch IP, firewall, vzduch logs.

### L.5 Home Assistant add-on path

1. Add repo: `https://github.com/ozczecho/home-assistant-addons`
2. Install **Vzduch** add-on
3. Set `airtouch_host` / `airtouch_port` (8899) in add-on config
4. Start add-on; check logs

### L.6 Legacy custom component

Copy `airtouch3_custom_component/` (REST client variant) to `config/custom_components/airtouch3/`.

**Config flow:** enter **vzduch API** host and port **5353** — not the AirTouch panel port.

### L.7 Legacy vs native

| Aspect | vzduch-dotek (legacy) | Native Python (main path) |
|--------|----------------------|---------------------------|
| Processes | HA + .NET API container | HA only |
| Config flow target | vzduch :5353 | AirTouch :8899 |
| Maintenance | .NET + API updates | Single Python integration |
| Grok Build fit | Good | **Better** — fewer moving parts |

### L.8 Upgrade .NET (after legacy validation)

Once the legacy API is confirmed working, upgrade target framework:

**Option A prompt:**

```
vzduch-dotek legacy API is validated on my network. Upgrade it to the latest stable .NET (net9 or net10):
- Update VzduchDotek.Net.csproj TargetFramework
- Bump Microsoft.* package references
- dotnet build and test /api/aircons
- Update home-assistant-addons Dockerfile if we use the add-on path
Verify end-to-end after upgrade. Explain breaking changes if any.
```

---

*Installation guide — Windows, macOS, Linux · Grok Build TUI (0.0) · legacy vzduch appendix · June 2026*