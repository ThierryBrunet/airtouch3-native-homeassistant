class DaikinAcPanel extends HTMLElement {
  static getStubConfig() {
    return {
      climate: "climate.brunet",
      zones: [
        {
          name: "KITCHEN",
          switch: "switch.kitchen",
          fan: "fan.kitchen",
        },
        {
          name: "FAMILY",
          switch: "switch.family",
          fan: "fan.family",
        },
        {
          name: "MASTER",
          switch: "switch.master",
          fan: "fan.master",
        },
        {
          name: "BED 2",
          switch: "switch.bed_2",
          fan: "fan.bed_2",
        },
        {
          name: "Angel",
          switch: "switch.angel",
          fan: "fan.angel",
        },
        {
          name: "Street",
          switch: "switch.street",
          fan: "fan.street",
        },
      ],
    };
  }

  setConfig(config) {
    if (!config.climate) {
      throw new Error("Set a climate entity");
    }
    this.config = {
      title: config.title || "Daikin A/C",
      climate: config.climate,
      zones: config.zones || [],
    };
  }

  _formatTemperature(value) {
    if (value === undefined || value === null || value === "") {
      return "—";
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "—";
    }
    return `${numeric}°C`;
  }

  _zoneTemperature(hass, zone) {
    const sw = zone.switch ? hass.states[zone.switch] : undefined;
    const fan = zone.fan ? hass.states[zone.fan] : undefined;
    const fromSwitch = sw?.attributes?.current_temperature;
    if (fromSwitch !== undefined && fromSwitch !== null) {
      return this._formatTemperature(fromSwitch);
    }
    const fromFan = fan?.attributes?.current_temperature;
    if (fromFan !== undefined && fromFan !== null) {
      return this._formatTemperature(fromFan);
    }
    return "—";
  }

  _zoneTargetValue(hass, zone) {
    const sw = zone.switch ? hass.states[zone.switch] : undefined;
    const fan = zone.fan ? hass.states[zone.fan] : undefined;
    const raw =
      sw?.attributes?.desired_temperature ??
      fan?.attributes?.desired_temperature;
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : null;
  }

  _zoneDamperLabel(hass, zone) {
    const fan = zone.fan ? hass.states[zone.fan] : undefined;
    if (!fan) {
      return "—";
    }
    const percentage = fan.attributes.percentage;
    if (percentage != null && Number.isFinite(Number(percentage))) {
      return `${percentage}% Damper`;
    }
    const fanValue = fan.attributes.fan_value;
    if (fanValue != null && Number.isFinite(Number(fanValue))) {
      return `${fanValue}% Damper`;
    }
    return "—";
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
    this.render();
  }

  getCardSize() {
    return 10;
  }

  render() {
    const hass = this._hass;
    const climate = hass.states[this.config.climate];
    if (!climate) {
      this.shadowRoot.innerHTML =
        "<ha-card header='Daikin A/C'><div style='padding:16px'>Climate entity not found</div></ha-card>";
      return;
    }

    const attrs = climate.attributes || {};
    const hvac = climate.state;
    const isOff = hvac === "off";
    const current = attrs.current_temperature ?? "—";
    const target = attrs.temperature ?? "—";
    const fanMode = attrs.fan_mode || "—";
    const action = attrs.hvac_action || hvac;

    const modes = [
      { id: "off", label: "off", icon: "mdi:power" },
      { id: "heat", label: "heat", icon: "mdi:fire" },
      { id: "cool", label: "cool", icon: "mdi:snowflake" },
      { id: "dry", label: "dry", icon: "mdi:water-percent" },
      { id: "fan_only", label: "fan", icon: "mdi:fan" },
    ];

    const fanModes = attrs.fan_modes || [
      "Quiet",
      "Low",
      "Medium",
      "High",
      "Powerful",
      "Auto",
    ];

    const zoneCards = this.config.zones
      .map((zone) => this.renderZone(hass, zone))
      .join("");

    const modeButtons = modes
      .map(
        (mode) => `
        <button class="mode-btn ${hvac === mode.id ? "active" : ""}"
          data-action="hvac" data-mode="${mode.id}">
          <ha-icon icon="${mode.icon}"></ha-icon>
          <span>${mode.label}</span>
        </button>`
      )
      .join("");

    const fanButtons = fanModes
      .map(
        (mode) => `
        <button class="fan-btn ${fanMode === mode ? "active" : ""}"
          data-action="fan" data-mode="${mode}">
          ${mode}
        </button>`
      )
      .join("");

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          --ha-card-background: #121212;
          --primary-text-color: #f5f5f5;
          --secondary-text-color: #bdbdbd;
          color: #f5f5f5;
          overflow: hidden;
        }
        .panel {
          padding: 12px 14px 16px;
          background: linear-gradient(180deg, #161616 0%, #0d0d0d 100%);
        }
        .header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
          font-size: 1.15rem;
          font-weight: 600;
        }
        .header ha-icon { color: #4ea3ff; }
        .status {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px 16px;
          margin-bottom: 14px;
          align-items: center;
        }
        .status-meta {
          font-size: 0.92rem;
          line-height: 1.55;
          color: #cfcfcf;
        }
        .status-meta strong { color: #fff; font-weight: 600; }
        .setpoint {
          font-size: 2.4rem;
          font-weight: 300;
          line-height: 1;
          text-align: right;
        }
        .modes {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
          margin-bottom: 14px;
        }
        .mode-btn, .fan-btn {
          border: 1px solid #333;
          background: #1f1f1f;
          color: #ddd;
          border-radius: 10px;
          padding: 10px 6px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          font-size: 0.78rem;
          text-transform: lowercase;
        }
        .mode-btn ha-icon, .fan-btn ha-icon { --mdc-icon-size: 22px; }
        .mode-btn.active {
          background: #e65100;
          border-color: #ff8f00;
          color: #fff;
        }
        .fan-btn.active {
          background: #1565c0;
          border-color: #42a5f5;
          color: #fff;
        }
        .zones {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          margin-bottom: 14px;
        }
        .zone {
          background: #1b1b1b;
          border: 1px solid #2a2a2a;
          border-radius: 12px;
          padding: 12px;
          min-height: 148px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 4px;
        }
        .zone.off { opacity: 0.72; }
        .zone-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          font-size: 0.9rem;
          font-weight: 600;
        }
        .zone-damper {
          font-size: 0.72rem;
          color: #9e9e9e;
          text-align: right;
        }
        .zone-readout {
          pointer-events: none;
          user-select: none;
        }
        .zone-temp {
          font-size: 2rem;
          font-weight: 300;
          text-align: center;
          margin: 4px 0;
        }
        .zone-target {
          font-size: 0.82rem;
          color: #bdbdbd;
          text-align: center;
        }
        .zone-power-btn {
          border: 1px solid #444;
          background: #222;
          color: #ddd;
          border-radius: 999px;
          padding: 4px 10px;
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.03em;
          cursor: pointer;
          min-width: 44px;
        }
        .zone-power-btn.on {
          background: #2e7d32;
          border-color: #66bb6a;
          color: #fff;
        }
        .zone-power-btn.off {
          background: #424242;
          border-color: #616161;
          color: #eee;
        }
        .zone-target-row {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 8px;
          align-items: center;
          margin-top: 2px;
        }
        .zone-target-btn {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: 1px solid #444;
          background: #222;
          color: #fff;
          font-size: 1rem;
          line-height: 1;
          cursor: pointer;
        }
        .zone-target-btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
        .zone-target-value {
          text-align: center;
          font-size: 0.82rem;
          color: #bdbdbd;
        }
        .other {
          background: #141414;
          border: 1px solid #2a2a2a;
          border-radius: 12px;
          padding: 12px;
        }
        .other h3 {
          margin: 0 0 10px;
          font-size: 0.95rem;
          font-weight: 600;
        }
        .fan-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 12px;
        }
        .target-row {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 10px;
          align-items: center;
        }
        .target-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 1px solid #444;
          background: #222;
          color: #fff;
          font-size: 1.2rem;
          cursor: pointer;
        }
        .target-value {
          text-align: center;
          font-size: 1.1rem;
        }
      </style>
      <ha-card>
        <div class="panel">
          <div class="header">
            <ha-icon icon="mdi:air-conditioner"></ha-icon>
            <span>${this.config.title}</span>
          </div>
          <div class="status">
            <div class="status-meta">
              <div><strong>Temperature:</strong> ${current}°C</div>
              <div><strong>State:</strong> ${isOff ? "off" : action}</div>
              <div><strong>Fan Mode:</strong> ${fanMode}</div>
            </div>
            <div class="setpoint">${target}°C</div>
          </div>
          <div class="modes">${modeButtons}</div>
          <div class="zones">${zoneCards}</div>
          <div class="other">
            <h3>System</h3>
            <div class="fan-row">${fanButtons}</div>
            <div class="target-row">
              <button class="target-btn" data-action="temp-down">−</button>
              <div class="target-value">Target ${target}°C</div>
              <button class="target-btn" data-action="temp-up">+</button>
            </div>
          </div>
        </div>
      </ha-card>
    `;

    this.bindEvents(climate);
  }

  renderZone(hass, zone) {
    const sw = hass.states[zone.switch];
    const isOn = sw && sw.state === "on";
    const targetValue = this._zoneTargetValue(hass, zone);
    const target =
      targetValue !== null ? targetValue : "—";
    const damper = this._zoneDamperLabel(hass, zone);
    const current = this._zoneTemperature(hass, zone);
    const canSetTarget = targetValue !== null;

    return `
      <div class="zone ${isOn ? "on" : "off"}">
        <div class="zone-top">
          <span>${zone.name}</span>
          <button
            class="zone-power-btn ${isOn ? "on" : "off"}"
            data-action="zone-power"
            data-switch="${zone.switch}"
            data-state="${isOn ? "on" : "off"}"
            aria-label="${isOn ? "Turn zone off" : "Turn zone on"}"
          >${isOn ? "ON" : "OFF"}</button>
        </div>
        <div class="zone-damper zone-readout">${damper}</div>
        <div class="zone-temp zone-readout">${current}</div>
        <div class="zone-target-row">
          <button
            class="zone-target-btn"
            data-action="zone-temp-down"
            data-switch="${zone.switch}"
            data-target="${targetValue ?? ""}"
            ${canSetTarget ? "" : "disabled"}
          >−</button>
          <div class="zone-target zone-readout">Target ${target}°C</div>
          <button
            class="zone-target-btn"
            data-action="zone-temp-up"
            data-switch="${zone.switch}"
            data-target="${targetValue ?? ""}"
            ${canSetTarget ? "" : "disabled"}
          >+</button>
        </div>
      </div>`;
  }

  bindEvents(climate) {
    const root = this.shadowRoot;
    root.querySelectorAll("[data-action='hvac']").forEach((btn) => {
      btn.onclick = (event) => {
        event.stopPropagation();
        this._hass.callService("climate", "set_hvac_mode", {
          entity_id: this.config.climate,
          hvac_mode: btn.dataset.mode,
        });
      };
    });
    root.querySelectorAll("[data-action='fan']").forEach((btn) => {
      btn.onclick = (event) => {
        event.stopPropagation();
        this._hass.callService("climate", "set_fan_mode", {
          entity_id: this.config.climate,
          fan_mode: btn.dataset.mode,
        });
      };
    });
    root.querySelectorAll("[data-action='zone-power']").forEach((btn) => {
      btn.onclick = (event) => {
        event.stopPropagation();
        const service = btn.dataset.state === "on" ? "turn_off" : "turn_on";
        this._hass.callService("switch", service, {
          entity_id: btn.dataset.switch,
        });
      };
    });
    root.querySelectorAll("[data-action='zone-temp-down']").forEach((btn) => {
      btn.onclick = (event) => {
        event.stopPropagation();
        this._setZoneTemperature(btn.dataset.switch, btn.dataset.target, -1);
      };
    });
    root.querySelectorAll("[data-action='zone-temp-up']").forEach((btn) => {
      btn.onclick = (event) => {
        event.stopPropagation();
        this._setZoneTemperature(btn.dataset.switch, btn.dataset.target, 1);
      };
    });
    const temp = climate.attributes.temperature;
    const step = climate.attributes.target_temp_step || 1;
    const down = root.querySelector("[data-action='temp-down']");
    const up = root.querySelector("[data-action='temp-up']");
    if (down) {
      down.onclick = (event) => {
        event.stopPropagation();
        this._hass.callService("climate", "set_temperature", {
          entity_id: this.config.climate,
          temperature: Math.max(
            climate.attributes.min_temp || 16,
            temp - step
          ),
        });
      };
    }
    if (up) {
      up.onclick = (event) => {
        event.stopPropagation();
        this._hass.callService("climate", "set_temperature", {
          entity_id: this.config.climate,
          temperature: Math.min(
            climate.attributes.max_temp || 32,
            temp + step
          ),
        });
      };
    }
  }

  _setZoneTemperature(switchEntity, currentTarget, delta) {
    const current = Number(currentTarget);
    if (!Number.isFinite(current)) {
      return;
    }
    const next = Math.max(16, Math.min(32, current + delta));
    if (next === current) {
      return;
    }
    this._hass.callService("airtouch3", "set_zone_temperature", {
      entity_id: switchEntity,
      temperature: next,
    });
  }
}

customElements.define("daikin-ac-panel", DaikinAcPanel);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "daikin-ac-panel",
  name: "Daikin A/C Panel",
  description: "AirTouch-style Daikin AC control panel",
  preview: true,
});