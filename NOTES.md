# Design notes — `airtouch3-native-homeassistant`

> **Provenance:** This project was **100% generated using Grok Build TUI** via Home Assistant’s **MCP local server** (`ha-mcp`). Tooling: **Grok Build 0.2.54** / **Composer 2.5 Fast** — **16 June 2026**.

Context for why this repository exists and which alternatives were evaluated before committing to a **software-only** native Home Assistant integration for an existing **AirTouch 3** installation.

---

## Home Assistant UI

The dashboard, custom Lovelace card, automations, helpers, and integration wiring were built entirely through Grok Build talking to the live Home Assistant instance over MCP — no manual YAML editing in the HA UI was required for the core deliverables.

![Daikin A/C dashboard in Home Assistant — unit modes, fan speed, and six zone cards with temperature and damper controls](docs/ha-dashboard-daikin-ac.jpg)

*Daikin A/C panel dashboard (`daikin-ac`): climate entity, per-zone switches/fans, target temperature and damper controls, 7-day temperature and damper history charts (in panel v11).*

---

## Approach taken here

This project talks to the AirTouch 3 wall controller over the **local TCP protocol** (default port **8899**) and exposes climate, zone, fan, and sensor entities directly in Home Assistant. No separate API container, no cloud dependency, and **no changes to roof-space hardware**.

The protocol work builds on the community reverse-engineering published by **ozczecho** (see [Acknowledgements](#acknowledgements)).

---

## Alternatives considered

### Faikin / Faikout (RevK) — excellent, but not chosen here

The [Faikin](https://www.faikin.au/) ecosystem (hardware and cable kits based on RevK’s open [ESP32-Faikout](https://codeberg.org/RevK/ESP32-Faikout) / [ESP32-Faikin](https://github.com/revk/ESP32-Faikin) designs) is a genuinely impressive path for **local Daikin ducted control** with Home Assistant. For many installs it is the right answer: mature ESPHome firmware, direct indoor-unit bus access (S21 and related wiring), strong community support, and Australian availability of pre-built boards and harnesses ([compatibility database](https://www.faikin.au/pages/compatibility-and-cable-selection-database)).

**Why it was abandoned for this home:**

1. **Roof-space access** — Installation, testing, and validation require repeated work in the ceiling cavity (main module, gateway, damper wiring, and indoor-unit connections). That is awkward, hot, and time-consuming compared with a configuration-only integration at the existing wall controller.
2. **Hardware replacement** — Faikin/Faikout replaces the **damper control path** with an **ESP32-based control board** (and associated cabling). That is a physical retrofit, not a reversible software experiment.
3. **Scope** — This repository optimises for **keeping the installed AirTouch 3 zoning hardware** and improving automation through HA only.

Faikin remains a recommended option if you are planning a **hardware upgrade** or a **full open-local replacement** of the zone controller and are willing to do the roof work once.

### Other options (brief)

| Option | Outcome |
|--------|---------|
| **ozczecho `vzduch-dotek` + HA component** | Worked; evolved into the native Python port in this repo (no .NET sidecar). |
| **AirTouch 4 / 5 upgrade** | Strong official HA story; rejected here on cost and full-system replacement. |
| **IFTTT / cloud** | Rejected — no reliable closed-loop feedback for automations. |

---

## Acknowledgements

Original local-control work for AirTouch 3 on Home Assistant:

| Project | Author | Role |
|---------|--------|------|
| [vzduch-dotek](https://github.com/ozczecho/vzduch-dotek) | [ozczecho](https://github.com/ozczecho) | .NET API; reverse-engineered TCP protocol to the panel |
| [airtouch3_custom_component](https://github.com/ozczecho/airtouch3_custom_component) | ozczecho | Original HA integration (REST client to vzduch-dotek) |
| [home-assistant-addons](https://github.com/ozczecho/home-assistant-addons) | ozczecho | HA add-on packaging for vzduch-dotek |

This native integration is a derivative/conversion of that published protocol and entity model, reimplemented in Python without a vzduch-dotek dependency. MIT-licensed upstream; attribution retained by reference and in this document.

Faikin/Faikout is **independent** work by [RevK](https://codeberg.org/RevK) — credited here as an alternative considered, not as source code for this repository.

---

## Planned public repository contents

Summary of what **`airtouch3-native-homeassistant`** will publish on GitHub:

| Area | Contents |
|------|----------|
| **Integration** | Native Python `custom_components/airtouch3/` — direct TCP to the panel (v1.0.5): climate, zones, fans, sensors, config flow, `airtouch3.set_zone_temperature` service |
| **Protocol** | `protocol/` package — messages, parser, client (derived from ozczecho’s published behaviour) |
| **Dashboard card** | `www/daikin-ac-panel-v11.js` — custom Lovelace panel with unit power, modes, fan row, zone controls, 7-day temperature + damper charts |
| **Deploy** | `scripts/Deploy-AirTouch3Component.ps1` — Samba deploy to HA `custom_components` and `www` |
| **Validation** | `scripts/Test-AirTouchConnection.ps1`, `scripts/validate_airtouch_protocol.py` |
| **Docs** | `NOTES.md` (this file), screenshot (`docs/ha-dashboard-daikin-ac.jpg`), rationale, Faikin alternative, Grok Build provenance, ozczecho credit |
| **License** | MIT (compatible with upstream vzduch-dotek) |

**Not included** in the public repo (local reference only, `.gitignore`d): cloned `vzduch-dotek` .NET tree, legacy HA add-on fork, and session misc notes.

**HA config created via MCP** (documented, not exported as YAML files): `daikin-ac` dashboard, `automation.daikin_ac_morning_start`, `binary_sensor.brunet_ac_power` helper — restore from HA backup or recreate using the integration README once published.