class DaikinAcPanel extends HTMLElement {
  static getStubConfig() {
    return {
      climate: "climate.brunet",
      zones: [
        {
          name: "KITCHEN",
          switch: "switch.kitchen",
          fan: "fan.kitchen",
          sensor: "sensor.airtouch3_90681913_0",
        },
        {
          name: "FAMILY",
          switch: "switch.family",
          fan: "fan.family",
          sensor: "sensor.airtouch3_90681913_2",
        },
        {
          name: "MASTER",
          switch: "switch.master",
          fan: "fan.master",
          sensor: "sensor.airtouch3_90681913_4",
        },
        {
          name: "BED 2",
          switch: "switch.bed_2",
          fan: "fan.bed_2",
          sensor: "sensor.airtouch3_90681913_6",
        },
        {
          name: "Angel",
          switch: "switch.angel",
          fan: "fan.angel",
          sensor: "sensor.airtouch3_90681913_8",
        },
        {
          name: "Street",
          switch: "switch.street",
          fan: "fan.street",
          sensor: "sensor.airtouch3_90681913_10",
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
      entities: config.entities || [],
    };
  }

  _trackedEntities() {
    const entities = new Set([this.config.climate]);
    for (const zone of this.config.zones) {
      if (zone.switch) entities.add(zone.switch);
      if (zone.fan) entities.add(zone.fan);
      if (zone.sensor) entities.add(zone.sensor);
    }
    for (const entity of this.config.entities) {
      entities.add(entity);
    }
    return [...entities];
  }

  _readTemperature(hass, sensor) {
    if (!sensor) return "—";
    const value = sensor.state;
    if (
      value === undefined ||
      value === null ||
      value === "unknown" ||
      value === "unavailable" ||
      value === ""
    ) {
      return "—";
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return `${numeric}°C`;
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
      .map((zone, index) => this.renderZone(hass, zone, index))
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
          cursor: pointer;
          min-height: 118px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .zone.off { opacity: 0.72; }
        .zone-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 8px;
          font-size: 0.9rem;
          font-weight: 600;
        }
        .zone-damper {
          font-size: 0.72rem;
          color: #9e9e9e;
        }
        .zone-temp {
          font-size: 2rem;
          font-weight: 300;
          text-align: center;
          margin: 6px 0;
        }
        .zone-target {
          font-size: 0.82rem;
          color: #bdbdbd;
          text-align: center;
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

  renderZone(hass, zone, index) {
    const sw = hass.states[zone.switch];
    const fan = hass.states[zone.fan];
    const sensor = hass.states[zone.sensor];
    const isOn = sw && sw.state === "on";
    const target =
      (sw && sw.attributes.desired_temperature) ||
      (fan && fan.attributes.desired_temperature) ||
      "—";
    const damper =
      fan && fan.attributes.percentage != null
        ? `${fan.attributes.percentage}% Damper`
        : "";
    const current = this._readTemperature(hass, sensor);

    const statusLabel = isOn ? damper : "OFF";

    return `
      <div class="zone ${isOn ? "on" : "off"}" data-action="zone-toggle" data-switch="${zone.switch}">
        <div class="zone-top">
          <span>${zone.name}</span>
          <span class="zone-damper">${statusLabel}</span>
        </div>
        <div class="zone-temp">${current}</div>
        <div class="zone-target">Target ${target}°C</div>
      </div>`;
  }

  bindEvents(climate) {
    const root = this.shadowRoot;
    root.querySelectorAll("[data-action='hvac']").forEach((btn) => {
      btn.onclick = () => {
        this._hass.callService("climate", "set_hvac_mode", {
          entity_id: this.config.climate,
          hvac_mode: btn.dataset.mode,
        });
      };
    });
    root.querySelectorAll("[data-action='fan']").forEach((btn) => {
      btn.onclick = () => {
        this._hass.callService("climate", "set_fan_mode", {
          entity_id: this.config.climate,
          fan_mode: btn.dataset.mode,
        });
      };
    });
    root.querySelectorAll("[data-action='zone-toggle']").forEach((card) => {
      card.onclick = () => {
        this._hass.callService("switch", "toggle", {
          entity_id: card.dataset.switch,
        });
      };
    });
    const temp = climate.attributes.temperature;
    const step = climate.attributes.target_temp_step || 1;
    const down = root.querySelector("[data-action='temp-down']");
    const up = root.querySelector("[data-action='temp-up']");
    if (down) {
      down.onclick = () => {
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
      up.onclick = () => {
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
}

customElements.define("daikin-ac-panel", DaikinAcPanel);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "daikin-ac-panel",
  name: "Daikin A/C Panel",
  description: "AirTouch-style Daikin AC control panel",
  preview: true,
});