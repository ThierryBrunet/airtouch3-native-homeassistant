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
    };
    this._pending = {
      power: {},
      target: {},
      damper: {},
      acPower: undefined,
      selectedMode: undefined,
    };
    this._chartSeries = [];
    this._damperChartSeries = [];
    this._powerSeries = [];
    this._chartLoadedAt = 0;
    this._chartLoading = false;
    this._chartColors = [
      "#ff6f00",
      "#42a5f5",
      "#ab47bc",
      "#26a69a",
      "#ec407a",
      "#8d6e63",
    ];
    this._powerEntity =
      config.power_entity ||
      (config.climate?.startsWith("climate.")
        ? `binary_sensor.${config.climate.slice("climate.".length)}_ac_power`
        : "binary_sensor.brunet_ac_power");
  }

  _powerEntityId() {
    return this._powerEntity || null;
  }

  _sensorEntityIds() {
    return this.config.zones.map((zone) => zone.sensor).filter(Boolean);
  }

  _normalizeHistoryMap(response, entityIds) {
    if (!response) {
      return {};
    }
    if (Array.isArray(response)) {
      const map = {};
      entityIds.forEach((entityId, index) => {
        map[entityId] = response[index] || [];
      });
      return map;
    }
    return response;
  }

  _historyTimeMs(row) {
    if (row.lu != null) {
      const lu = Number(row.lu);
      if (Number.isFinite(lu)) {
        return lu < 1e12 ? lu * 1000 : lu;
      }
    }
    if (row.lc != null) {
      const lc = Number(row.lc);
      if (Number.isFinite(lc)) {
        return lc < 1e12 ? lc * 1000 : lc;
      }
    }
    const raw = row.last_updated || row.last_changed;
    if (raw == null) {
      return NaN;
    }
    if (typeof raw === "number") {
      return raw < 1e12 ? raw * 1000 : raw;
    }
    return new Date(raw).getTime();
  }

  connectedCallback() {
    this._chartRefreshTimer = window.setInterval(() => {
      if (this._hass) {
        this._loadChartHistory();
      }
    }, 300000);
  }

  disconnectedCallback() {
    if (this._chartRefreshTimer) {
      window.clearInterval(this._chartRefreshTimer);
    }
    if (this._chartResizeObserver) {
      this._chartResizeObserver.disconnect();
      this._chartResizeObserver = undefined;
    }
    if (this._chartPaintRaf) {
      window.cancelAnimationFrame(this._chartPaintRaf);
      this._chartPaintRaf = 0;
    }
  }

  _scheduleChartPaint() {
    if (this._chartPaintRaf) {
      window.cancelAnimationFrame(this._chartPaintRaf);
    }
    this._chartPaintRaf = window.requestAnimationFrame(() => {
      this._chartPaintRaf = window.requestAnimationFrame(() => {
        this._chartPaintRaf = 0;
        if (this._chartSeries?.length) {
          this._drawChart();
        }
        if (this._damperChartSeries?.length) {
          this._drawDamperChart();
        }
      });
    });
  }

  _setupChartResizeObserver() {
    if (this._chartResizeObserver) {
      this._chartResizeObserver.disconnect();
    }
    const temp = this.shadowRoot?.querySelector("#temp-chart");
    const damper = this.shadowRoot?.querySelector("#damper-chart");
    if (!temp && !damper) {
      return;
    }
    this._chartResizeObserver = new ResizeObserver(() => {
      this._scheduleChartPaint();
    });
    if (temp) {
      this._chartResizeObserver.observe(temp);
    }
    if (damper) {
      this._chartResizeObserver.observe(damper);
    }
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

  _tempSourceLabel(source) {
    const labels = {
      daikin_ac: "AC unit",
      itc_sensor: "zone ITC",
      touch_pad: "wall pad",
      zone_average: "average",
      auto: "auto",
      hidden: "hidden",
    };
    return labels[source] || source || "unknown";
  }

  _actualUnitIsOn(climate) {
    const attrs = climate.attributes || {};
    if (attrs.ac_power === true) {
      return true;
    }
    if (attrs.ac_power === false) {
      return false;
    }
    if (attrs.hvac_action === "off") {
      return false;
    }
    return climate.state !== "off";
  }

  _unitIsOn(hass, climate) {
    if (this._pending.acPower !== undefined) {
      return this._pending.acPower;
    }
    return this._actualUnitIsOn(climate);
  }

  _normalizeHvacMode(mode) {
    if (!mode || mode === "auto") {
      return "heat_cool";
    }
    return mode;
  }

  _selectedHvacMode(hass, climate) {
    if (this._pending.selectedMode !== undefined) {
      return this._normalizeHvacMode(this._pending.selectedMode);
    }
    const attrs = climate.attributes || {};
    const raw =
      attrs.selected_hvac_mode ||
      attrs.hvac_mode ||
      (attrs.ac_mode_name === "auto" ? "heat_cool" : attrs.ac_mode_name) ||
      climate.state;
    return this._normalizeHvacMode(raw);
  }

  _modeDisplayLabel(mode) {
    const labels = {
      heat_cool: "auto",
      fan_only: "fan",
    };
    return labels[mode] || mode || "—";
  }

  _clearPendingIfConfirmed(hass, climate) {
    const attrs = climate.attributes || {};
    if (this._pending.acPower !== undefined) {
      if (this._actualUnitIsOn(climate) === this._pending.acPower) {
        this._pending.acPower = undefined;
      }
    }
    if (this._pending.selectedMode !== undefined) {
      const actualMode = this._normalizeHvacMode(
        attrs.selected_hvac_mode ||
          attrs.hvac_mode ||
          (attrs.ac_mode_name === "auto" ? "heat_cool" : attrs.ac_mode_name) ||
          climate.state
      );
      if (actualMode === this._normalizeHvacMode(this._pending.selectedMode)) {
        this._pending.selectedMode = undefined;
      }
    }

    for (const zone of this.config.zones) {
      const sw = zone.switch ? hass.states[zone.switch] : undefined;
      if (sw && this._pending.power[zone.switch] !== undefined) {
        const actualOn = sw.state === "on";
        if (actualOn === this._pending.power[zone.switch]) {
          delete this._pending.power[zone.switch];
        }
      }

      const target = this._zoneTargetValue(hass, zone, false);
      if (
        target !== null &&
        this._pending.target[zone.switch] !== undefined &&
        target === this._pending.target[zone.switch]
      ) {
        delete this._pending.target[zone.switch];
      }

      const damper = this._zoneDamperValue(hass, zone, false);
      if (
        damper !== null &&
        this._pending.damper[zone.fan] !== undefined &&
        damper === this._pending.damper[zone.fan]
      ) {
        delete this._pending.damper[zone.fan];
      }
    }
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

  _zoneTargetValue(hass, zone, usePending = true) {
    if (usePending && this._pending.target[zone.switch] !== undefined) {
      return this._pending.target[zone.switch];
    }
    const sw = zone.switch ? hass.states[zone.switch] : undefined;
    const fan = zone.fan ? hass.states[zone.fan] : undefined;
    const raw =
      sw?.attributes?.desired_temperature ??
      fan?.attributes?.desired_temperature;
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : null;
  }

  _zoneDamperValue(hass, zone, usePending = true) {
    if (usePending && this._pending.damper[zone.fan] !== undefined) {
      return this._pending.damper[zone.fan];
    }
    const fan = zone.fan ? hass.states[zone.fan] : undefined;
    if (!fan) {
      return null;
    }
    const percentage = fan.attributes.percentage;
    if (percentage != null && Number.isFinite(Number(percentage))) {
      return Number(percentage);
    }
    const fanValue = fan.attributes.fan_value;
    if (fanValue != null && Number.isFinite(Number(fanValue))) {
      return Number(fanValue);
    }
    return null;
  }

  _zoneIsOn(hass, zone) {
    if (this._pending.power[zone.switch] !== undefined) {
      return this._pending.power[zone.switch];
    }
    const sw = zone.switch ? hass.states[zone.switch] : undefined;
    return !!(sw && sw.state === "on");
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
    if (!this._pending) {
      this._pending = {
        power: {},
        target: {},
        damper: {},
        acPower: undefined,
        selectedMode: undefined,
      };
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

    this._clearPendingIfConfirmed(hass, climate);

    const attrs = climate.attributes || {};
    const isUnitOn = this._unitIsOn(hass, climate);
    const selectedMode = this._selectedHvacMode(hass, climate);
    const current = attrs.current_temperature ?? "—";
    const target = attrs.temperature ?? "—";
    const fanMode = attrs.fan_mode || "—";
    const action = isUnitOn
      ? this._modeDisplayLabel(attrs.hvac_action || selectedMode)
      : "off";
    const tempSource = attrs.active_temperature_source;
    const tempSourceText = this._tempSourceLabel(tempSource);
    const temperatureLine =
      tempSource && tempSource !== "—"
        ? `${current}°C (${tempSourceText})`
        : `${current}°C`;

    const modes = [
      { id: "heat", label: "heat", icon: "mdi:fire", cls: "mode-heat" },
      { id: "cool", label: "cool", icon: "mdi:snowflake", cls: "mode-cool" },
      { id: "dry", label: "dry", icon: "mdi:water-percent", cls: "mode-dry" },
      { id: "fan_only", label: "fan", icon: "mdi:fan", cls: "mode-fan" },
      {
        id: "heat_cool",
        label: "auto",
        icon: "mdi:autorenew",
        cls: "mode-auto",
      },
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
        <button class="mode-btn ${mode.cls} ${selectedMode === mode.id ? "active" : ""}"
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
          font-size: 1.35rem;
          font-weight: 600;
        }
        .header ha-icon { color: #4ea3ff; }
        .status {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px 16px;
          margin-bottom: 14px;
          align-items: start;
        }
        .status-meta {
          font-size: 1.05rem;
          line-height: 1.55;
          color: #cfcfcf;
        }
        .status-meta strong { color: #fff; font-weight: 600; }
        .setpoint-col {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
        }
        .setpoint {
          font-size: 2.8rem;
          font-weight: 300;
          line-height: 1;
          text-align: right;
        }
        .setpoint-target-row {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
        }
        .unit-power-row {
          margin-bottom: 12px;
        }
        .unit-power-btn {
          width: 100%;
          border: 1px solid #616161;
          background: #424242;
          color: #eee;
          border-radius: 12px;
          padding: 16px 20px;
          font-size: 1.2rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        .unit-power-btn.on {
          background: #d32f2f;
          border-color: #f44336;
          color: #fff;
        }
        .unit-power-btn ha-icon {
          --mdc-icon-size: 28px;
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
          padding: 12px 8px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          font-size: 0.98rem;
          text-transform: lowercase;
        }
        .mode-btn ha-icon, .fan-btn ha-icon { --mdc-icon-size: 26px; }
        .mode-btn.mode-heat.active {
          background: #e65100;
          border-color: #ff8f00;
          color: #fff;
        }
        .mode-btn.mode-cool.active {
          background: #2e7d32;
          border-color: #66bb6a;
          color: #fff;
        }
        .mode-btn.mode-dry.active {
          background: #ffffff;
          border-color: #e0e0e0;
          color: #111;
        }
        .mode-btn.mode-fan.active {
          background: #ffc107;
          border-color: #ffca28;
          color: #1a1a1a;
        }
        .mode-btn.mode-auto.active {
          background: #00838f;
          border-color: #4dd0e1;
          color: #fff;
        }
        .fan-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 14px;
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
          padding: 14px;
          min-height: 188px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 6px;
        }
        .zone.on {
          background: linear-gradient(180deg, #0d47a1 0%, #1565c0 100%);
          border-color: #42a5f5;
          opacity: 1;
        }
        .zone.off { opacity: 0.72; }
        .zone-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          font-size: 1.1rem;
          font-weight: 600;
        }
        .zone-readout {
          pointer-events: none;
          user-select: none;
        }
        .zone-temp {
          font-size: 2.5rem;
          font-weight: 300;
          text-align: center;
          margin: 4px 0;
        }
        .zone-control {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 4px;
        }
        .zone-target-value,
        .zone-damper-value {
          font-size: 1.05rem;
          color: #bdbdbd;
          white-space: nowrap;
          padding: 0 2px;
        }
        .zone.on .zone-target-value {
          color: #f44336;
          font-weight: 700;
        }
        .zone.on .zone-damper-value {
          color: #66bb6a;
          font-weight: 700;
        }
        .zone-control-btn {
          width: 36px;
          height: 36px;
          flex: 0 0 36px;
          border-radius: 50%;
          border: 1px solid #444;
          background: rgba(0, 0, 0, 0.25);
          color: #fff;
          font-size: 1.25rem;
          line-height: 1;
          cursor: pointer;
          padding: 0;
        }
        .zone.on .zone-control-btn {
          border-color: #90caf9;
          background: rgba(0, 0, 0, 0.2);
        }
        .zone-control-btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
        .zone-power-btn {
          border: 1px solid #616161;
          background: #424242;
          color: #eee;
          border-radius: 999px;
          padding: 6px 14px;
          font-size: 0.95rem;
          font-weight: 600;
          letter-spacing: 0.03em;
          cursor: pointer;
          min-width: 52px;
        }
        .zone-power-btn.on {
          background: #ffc107;
          border-color: #ffca28;
          color: #1a1a1a;
        }
        .target-btn {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          border: 1px solid #444;
          background: #222;
          color: #fff;
          font-size: 1.4rem;
          cursor: pointer;
        }
        .chart-section {
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid #2a2a2a;
        }
        .chart-title {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 8px;
          color: #e0e0e0;
        }
        .temp-chart {
          width: 100%;
          height: 240px;
          display: block;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 10px;
        }
        .chart-legend {
          display: flex;
          flex-wrap: wrap;
          gap: 10px 14px;
          margin-top: 8px;
          font-size: 0.82rem;
          color: #bdbdbd;
        }
        .chart-legend-item {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .chart-legend-swatch {
          width: 12px;
          height: 12px;
          border-radius: 2px;
          display: inline-block;
        }
        .chart-legend-power {
          background: rgba(102, 187, 106, 0.55);
          border: 1px solid #66bb6a;
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
              <div><strong>Temperature:</strong> ${temperatureLine}</div>
              <div><strong>State:</strong> ${isUnitOn ? action : "off"}</div>
              <div><strong>Fan Mode:</strong> ${fanMode}</div>
            </div>
            <div class="setpoint-col">
              <div class="setpoint">${target}°C</div>
              <div class="setpoint-target-row">
                <button class="target-btn" data-action="temp-down">−</button>
                <button class="target-btn" data-action="temp-up">+</button>
              </div>
            </div>
          </div>
          <div class="unit-power-row">
            <button
              class="unit-power-btn ${isUnitOn ? "on" : "off"}"
              data-action="unit-power"
              data-state="${isUnitOn ? "on" : "off"}"
            >
              <ha-icon icon="mdi:power"></ha-icon>
              <span>${isUnitOn ? "UNIT ON" : "UNIT OFF"}</span>
            </button>
          </div>
          <div class="modes">${modeButtons}</div>
          <div class="fan-row">${fanButtons}</div>
          <div class="zones">${zoneCards}</div>
          <div class="chart-section">
            <div class="chart-title">Zone temperatures · 7 days (green band = unit ON)</div>
            <canvas id="temp-chart" class="temp-chart"></canvas>
            <div class="chart-legend" id="chart-legend"></div>
          </div>
          <div class="chart-section">
            <div class="chart-title">Zone damper · 7 days (green band = unit ON)</div>
            <canvas id="damper-chart" class="temp-chart"></canvas>
            <div class="chart-legend" id="damper-chart-legend"></div>
          </div>
        </div>
      </ha-card>
    `;

    this.bindEvents(climate);
    this._setupChartResizeObserver();
    this._ensureChart();
    this._scheduleChartPaint();
  }

  _chartEntities() {
    const sensors = this._sensorEntityIds();
    const power = this._powerEntityId();
    if (power && this._hass?.states[power]) {
      return [...sensors, power];
    }
    return sensors;
  }

  _damperChartEntities() {
    return this.config.zones.map((zone) => zone.fan).filter(Boolean);
  }

  _ensureChart() {
    const canvas = this.shadowRoot?.querySelector("#temp-chart");
    if (!canvas) {
      return;
    }
    if (
      !this._chartLoading &&
      (!this._chartLoadedAt || Date.now() - this._chartLoadedAt > 300000)
    ) {
      this._loadChartHistory();
    }
  }

  _historyPeriod() {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    return {
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      significant_changes_only: false,
    };
  }

  async _loadTempChartHistory(period) {
    const entities = this._chartEntities();
    const sensorEntities = this._sensorEntityIds();
    const powerEntity = this._powerEntityId();
    const history = await this._hass.callWS({
      type: "history/history_during_period",
      ...period,
      entity_ids: entities,
      minimal_response: true,
      no_attributes: true,
    });
    const tempHistory = this._normalizeHistoryMap(history, entities);
    this._chartSeries = sensorEntities.map((entityId, index) => ({
      entityId,
      name: this.config.zones[index]?.name || entityId,
      color: this._chartColors[index % this._chartColors.length],
      points: this._historyPoints(tempHistory[entityId] || [], true),
    }));
    this._powerSeries =
      powerEntity && this._hass?.states[powerEntity]
        ? this._historyPoints(tempHistory[powerEntity] || [], false)
        : [];
  }

  async _loadDamperChartHistory(period) {
    const fanEntities = this._damperChartEntities();
    if (!fanEntities.length) {
      this._damperChartSeries = [];
      return;
    }
    const damperHistory = await this._hass.callWS({
      type: "history/history_during_period",
      ...period,
      entity_ids: fanEntities,
      minimal_response: true,
      no_attributes: false,
    });
    const damperHistoryMap = this._normalizeHistoryMap(
      damperHistory,
      fanEntities
    );
    this._damperChartSeries = fanEntities.map((entityId, index) => ({
      entityId,
      name: this.config.zones[index]?.name || entityId,
      color: this._chartColors[index % this._chartColors.length],
      points: this._historyDamperPoints(damperHistoryMap[entityId] || []),
    }));
  }

  async _loadChartHistory() {
    if (!this._hass || this._chartLoading) {
      return;
    }
    this._chartLoading = true;
    const period = this._historyPeriod();
    let loaded = false;
    try {
      await this._loadTempChartHistory(period);
      loaded = true;
    } catch (error) {
      console.warn("Daikin temperature chart history load failed", error);
    }
    try {
      await this._loadDamperChartHistory(period);
      loaded = true;
    } catch (error) {
      console.warn("Daikin damper chart history load failed", error);
    }
    if (loaded) {
      this._chartLoadedAt = Date.now();
    }
    this._chartLoading = false;
    this._scheduleChartPaint();
  }

  _historyPoints(rows, numeric) {
    return (rows || [])
      .map((row) => {
        const time = this._historyTimeMs(row);
        if (!Number.isFinite(time)) {
          return null;
        }
        const raw = row.s ?? row.state;
        if (raw === "unavailable" || raw === "unknown") {
          return null;
        }
        if (numeric) {
          const value = Number(raw);
          return Number.isFinite(value) ? { time, value } : null;
        }
        return { time, value: raw === "on" ? 1 : 0 };
      })
      .filter(Boolean)
      .sort((a, b) => a.time - b.time);
  }

  _historyDamperPoints(rows) {
    const points = [];
    let lastValue = null;
    for (const row of rows || []) {
      const attrs = row.a || row.attributes || {};
      const raw = attrs.percentage ?? attrs.fan_value;
      if (raw == null) {
        continue;
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        continue;
      }
      const time = this._historyTimeMs(row);
      if (!Number.isFinite(time)) {
        continue;
      }
      if (lastValue === null || value !== lastValue) {
        points.push({ time, value });
        lastValue = value;
      } else {
        points[points.length - 1].time = time;
      }
    }
    return points.sort((a, b) => a.time - b.time);
  }

  _renderLineChart(canvas, legend, options) {
    if (!canvas) {
      return;
    }
    const {
      series,
      powerSeries = null,
      minY,
      maxY,
      yStep,
      formatY = (value) => String(value),
    } = options;
    const width = canvas.clientWidth || 600;
    const height = 240;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const pad = { top: 14, right: 12, bottom: 28, left: 36 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const end = Date.now();
    const start = end - 7 * 24 * 60 * 60 * 1000;

    const xAt = (time) =>
      pad.left + ((time - start) / (end - start)) * plotW;
    const yAt = (value) =>
      pad.top + plotH - ((value - minY) / (maxY - minY)) * plotH;

    ctx.fillStyle = "#161616";
    ctx.fillRect(pad.left, pad.top, plotW, plotH);

    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    for (let tick = minY; tick <= maxY; tick += yStep) {
      const y = yAt(tick);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
      ctx.fillStyle = "#888";
      ctx.font = "11px sans-serif";
      ctx.fillText(formatY(tick), 4, y + 4);
    }

    if (powerSeries?.length) {
      let segmentStart = null;
      const flush = (segmentEnd) => {
        if (segmentStart === null || segmentEnd <= segmentStart) {
          return;
        }
        ctx.fillStyle = "rgba(102, 187, 106, 0.18)";
        ctx.fillRect(
          xAt(segmentStart),
          pad.top,
          Math.max(1, xAt(segmentEnd) - xAt(segmentStart)),
          plotH
        );
      };
      for (let i = 0; i < powerSeries.length; i += 1) {
        const point = powerSeries[i];
        const nextTime =
          i < powerSeries.length - 1 ? powerSeries[i + 1].time : end;
        if (point.value === 1) {
          if (segmentStart === null) {
            segmentStart = point.time;
          }
          flush(nextTime);
        } else {
          flush(point.time);
          segmentStart = null;
        }
      }
      if (segmentStart !== null) {
        flush(end);
      }
    }

    for (const line of series) {
      if (!line.points.length) {
        continue;
      }
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      line.points.forEach((point, index) => {
        const x = xAt(point.time);
        const y = yAt(point.value);
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    }

    ctx.fillStyle = "#888";
    ctx.font = "11px sans-serif";
    const dayMs = 24 * 60 * 60 * 1000;
    for (let day = 0; day <= 7; day += 1) {
      const time = start + day * dayMs;
      const x = xAt(time);
      const label = new Date(time).toLocaleDateString(undefined, {
        weekday: "short",
      });
      ctx.fillText(label, x - 12, height - 8);
    }

    if (legend) {
      const items = series
        .map(
          (line) =>
            `<span class="chart-legend-item"><span class="chart-legend-swatch" style="background:${line.color}"></span>${line.name}</span>`
        )
        .join("");
      const powerLegend = powerSeries
        ? `<span class="chart-legend-item"><span class="chart-legend-swatch chart-legend-power"></span>Unit ON</span>`
        : "";
      legend.innerHTML = `${items}${powerLegend}`;
    }
  }

  _drawChart() {
    let minTemp = 18;
    let maxTemp = 30;
    for (const series of this._chartSeries) {
      for (const point of series.points) {
        minTemp = Math.min(minTemp, point.value);
        maxTemp = Math.max(maxTemp, point.value);
      }
    }
    minTemp = Math.floor(minTemp - 1);
    maxTemp = Math.ceil(maxTemp + 1);
    if (maxTemp <= minTemp) {
      maxTemp = minTemp + 2;
    }
    this._renderLineChart(
      this.shadowRoot?.querySelector("#temp-chart"),
      this.shadowRoot?.querySelector("#chart-legend"),
      {
        series: this._chartSeries,
        powerSeries: this._powerSeries,
        minY: minTemp,
        maxY: maxTemp,
        yStep: 2,
        formatY: (value) => `${value}°`,
      }
    );
  }

  _drawDamperChart() {
    this._renderLineChart(
      this.shadowRoot?.querySelector("#damper-chart"),
      this.shadowRoot?.querySelector("#damper-chart-legend"),
      {
        series: this._damperChartSeries,
        powerSeries: this._powerSeries,
        minY: 0,
        maxY: 100,
        yStep: 20,
        formatY: (value) => `${value}%`,
      }
    );
  }

  renderZone(hass, zone) {
    const isOn = this._zoneIsOn(hass, zone);
    const targetValue = this._zoneTargetValue(hass, zone);
    const target = targetValue !== null ? targetValue : "—";
    const damperValue = this._zoneDamperValue(hass, zone);
    const damperLabel =
      damperValue !== null ? `${damperValue}% Damper` : "— Damper";
    const current = this._zoneTemperature(hass, zone);
    const canSetTarget = targetValue !== null;
    const canSetDamper = damperValue !== null;

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
        <div class="zone-temp zone-readout">${current}</div>
        <div class="zone-control">
          <button
            class="zone-control-btn"
            data-action="zone-temp-down"
            data-switch="${zone.switch}"
            data-target="${targetValue ?? ""}"
            ${canSetTarget ? "" : "disabled"}
          >−</button>
          <span class="zone-target-value">Target ${target}°C</span>
          <button
            class="zone-control-btn"
            data-action="zone-temp-up"
            data-switch="${zone.switch}"
            data-target="${targetValue ?? ""}"
            ${canSetTarget ? "" : "disabled"}
          >+</button>
        </div>
        <div class="zone-control">
          <button
            class="zone-control-btn"
            data-action="zone-damper-down"
            data-fan="${zone.fan}"
            data-damper="${damperValue ?? ""}"
            ${canSetDamper ? "" : "disabled"}
          >−</button>
          <span class="zone-damper-value">${damperLabel}</span>
          <button
            class="zone-control-btn"
            data-action="zone-damper-up"
            data-fan="${zone.fan}"
            data-damper="${damperValue ?? ""}"
            ${canSetDamper ? "" : "disabled"}
          >+</button>
        </div>
      </div>`;
  }

  bindEvents(climate) {
    const root = this.shadowRoot;
    root.querySelectorAll("[data-action='unit-power']").forEach((btn) => {
      btn.onclick = (event) => {
        event.stopPropagation();
        const wantOn = btn.dataset.state !== "on";
        this._pending.acPower = wantOn;
        this.render();
        const service = wantOn ? "turn_on" : "turn_off";
        this._hass.callService("climate", service, {
          entity_id: this.config.climate,
        });
      };
    });
    root.querySelectorAll("[data-action='hvac']").forEach((btn) => {
      btn.onclick = (event) => {
        event.stopPropagation();
        this._pending.selectedMode = btn.dataset.mode;
        this.render();
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
        const switchEntity = btn.dataset.switch;
        const wantOn = btn.dataset.state !== "on";
        this._pending.power[switchEntity] = wantOn;
        this.render();
        const service = wantOn ? "turn_on" : "turn_off";
        this._hass.callService("switch", service, {
          entity_id: switchEntity,
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
    root.querySelectorAll("[data-action='zone-damper-down']").forEach((btn) => {
      btn.onclick = (event) => {
        event.stopPropagation();
        this._setZoneDamper(btn.dataset.fan, btn.dataset.damper, -1);
      };
    });
    root.querySelectorAll("[data-action='zone-damper-up']").forEach((btn) => {
      btn.onclick = (event) => {
        event.stopPropagation();
        this._setZoneDamper(btn.dataset.fan, btn.dataset.damper, 1);
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
    const pending = this._pending.target[switchEntity];
    const current = Number(pending ?? currentTarget);
    if (!Number.isFinite(current)) {
      return;
    }
    const next = Math.max(16, Math.min(32, current + delta));
    if (next === current) {
      return;
    }
    this._pending.target[switchEntity] = next;
    this.render();
    this._hass.callService("airtouch3", "set_zone_temperature", {
      entity_id: switchEntity,
      temperature: next,
    });
  }

  _setZoneDamper(fanEntity, currentDamper, delta) {
    const pending = this._pending.damper[fanEntity];
    const current = Number(pending ?? currentDamper);
    if (!Number.isFinite(current)) {
      return;
    }
    const next = Math.max(0, Math.min(100, current + 5 * delta));
    if (next === current) {
      return;
    }
    this._pending.damper[fanEntity] = next;
    this.render();
    this._hass.callService("fan", "set_percentage", {
      entity_id: fanEntity,
      percentage: next,
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