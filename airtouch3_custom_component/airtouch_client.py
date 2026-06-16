"""Native AirTouch 3 client for Home Assistant (no vzduch-dotek dependency)."""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from .protocol import AirTouchMessages, AirTouchTcpClient
from .protocol.models import Aircon, Sensor, Zone
from .const import DOMAIN

if TYPE_CHECKING:
    from .coordinator import AirTouch3Coordinator

_LOGGER = logging.getLogger(__name__)

AC_MODE_AUTO = 0
AC_MODE_HEAT = 1
AC_MODE_DRY = 2
AC_MODE_FAN = 3
AC_MODE_COOL = 4

AC_MODE_NAMES = {
    AC_MODE_AUTO: "auto",
    AC_MODE_HEAT: "heat",
    AC_MODE_DRY: "dry",
    AC_MODE_FAN: "fan",
    AC_MODE_COOL: "cool",
}

AC_POWER_ON = 1
AC_POWER_OFF = 0

AC_FAN_MODE_QUIET = 0
AC_FAN_MODE_LOW = 1
AC_FAN_MODE_MEDIUM = 2
AC_FAN_MODE_HIGH = 3
AC_FAN_MODE_POWERFUL = 4
AC_FAN_MODE_AUTO = 5

AC_STATUS_OK = "OK"
AC_STATUS_ERROR = "ERROR"

ZONE_TEMPERATURE_TYPE_HIDE = 0
ZONE_TEMPERATURE_TYPE_USE_SENSOR = 1
ZONE_TEMPERATURE_TYPE_USE_TOUCH_PAD = 2
ZONE_TEMPERATURE_TYPE_USE_AVERAGE = 3

THERMOSTAT_MODE_AC = 0
THERMOSTAT_MODE_AVERAGE = 1
THERMOSTAT_MODE_AUTO = 2
THERMOSTAT_MODE_ZONE = 3

TEMPERATURE_INCREMENT = 1
TEMPERATURE_DECREMENT = -1


class AirTouch3Zone:
    """Zone facade for platform entities."""

    def __init__(self, zone: Zone) -> None:
        self._zone = zone

    def update(self, zone: Zone) -> None:
        """Refresh zone state from protocol model."""
        self._zone = zone

    @property
    def id(self) -> int:
        return self._zone.id

    @property
    def name(self) -> str:
        return self._zone.name

    @property
    def status(self) -> int:
        return self._zone.status

    @property
    def fan_value(self) -> int:
        return self._zone.fan_value

    @property
    def is_spill(self) -> bool:
        return self._zone.is_spill

    @property
    def desired_temperature(self) -> int:
        return self._zone.desired_temperature

    @property
    def zone_temperature_type(self) -> int:
        return self._zone.zone_temperature_type

    @property
    def sensors(self) -> list[AirTouch3Sensor]:
        return [AirTouch3Sensor(sensor) for sensor in self._zone.sensors]


class AirTouch3Sensor:
    """Sensor facade for platform entities."""

    def __init__(self, sensor: Sensor) -> None:
        self._sensor = sensor

    def update(self, sensor: Sensor) -> None:
        """Refresh sensor state from protocol model."""
        self._sensor = sensor

    @property
    def id(self) -> int:
        return self._sensor.id

    @property
    def is_available(self) -> bool:
        return self._sensor.is_available

    @property
    def is_low_battery(self) -> bool:
        return self._sensor.is_low_battery

    @property
    def temperature(self) -> int:
        return self._sensor.temperature


class AirTouch3Device:
    """Talks directly to the AirTouch 3 controller over TCP."""

    def __init__(self, host: str, port: int, timeout: float) -> None:
        self._host = host
        self._port = port
        self._timeout = timeout
        self._available = False
        self._selected_ac = 0
        self._client = AirTouchTcpClient(host, port, timeout)
        self._messages = AirTouchMessages()
        self._aircon: Aircon | None = None
        self._zones: list[AirTouch3Zone] = []
        self._sensors: list[AirTouch3Sensor] = []
        self._coordinator: AirTouch3Coordinator | None = None
        _LOGGER.debug("AirTouch3Device init %s:%s", host, port)

    def set_coordinator(self, coordinator: AirTouch3Coordinator) -> None:
        """Attach the data coordinator for push updates after commands."""
        self._coordinator = coordinator

    def _notify_coordinator(self) -> None:
        if self._coordinator is not None:
            self._coordinator.async_set_updated_data(self)

    async def async_close(self) -> None:
        """Close the TCP session."""
        await self._client.close()

    async def _refresh(
        self, message: bytes | None = None, *, notify: bool = True
    ) -> bool:
        payload = message or self._messages.get_init_msg()
        aircon = await self._client.fetch_aircon(payload)
        if aircon is None:
            self._available = False
            return False
        self._apply_aircon(aircon)
        if notify:
            self._notify_coordinator()
        return True

    def _apply_aircon(self, aircon: Aircon) -> None:
        self._available = True
        self._aircon = aircon

        zones_by_id = {zone.id: zone for zone in self._zones}
        self._zones = []
        for zone in aircon.zones:
            if zone.id in zones_by_id:
                zones_by_id[zone.id].update(zone)
                self._zones.append(zones_by_id[zone.id])
            else:
                self._zones.append(AirTouch3Zone(zone))

        sensors_by_id = {sensor.id: sensor for sensor in self._sensors}
        self._sensors = []
        for sensor in aircon.sensors:
            if sensor.id in sensors_by_id:
                sensors_by_id[sensor.id].update(sensor)
                self._sensors.append(sensors_by_id[sensor.id])
            else:
                self._sensors.append(AirTouch3Sensor(sensor))

    async def async_refresh(self, *, notify: bool = True) -> bool:
        """Poll the AirTouch controller."""
        return await self._refresh(notify=notify)

    async def async_update(self, **kwargs) -> None:
        """Compatibility entry point used by config flow."""
        await self.async_refresh()

    @property
    def available(self) -> bool:
        return self._available

    @property
    def device_info(self) -> dict:
        return {
            "manufacturer": "Polyaire",
            "model": "AirTouch 3",
            "name": self.name,
            "identifiers": {(DOMAIN, self.airtouch_id)},
        }

    @property
    def host(self) -> str:
        return self._host

    @property
    def port(self) -> int:
        return self._port

    @property
    def timeout(self) -> float:
        return self._timeout

    @property
    def power(self) -> int:
        return self._aircon.power_status if self._aircon else AC_POWER_OFF

    @property
    def name(self) -> str:
        return self._aircon.name if self._aircon else ""

    @property
    def error_status(self) -> str:
        return self._aircon.status if self._aircon else AC_STATUS_ERROR

    @property
    def mode(self) -> int:
        return self._aircon.mode if self._aircon else AC_MODE_AUTO

    @property
    def ac_mode_name(self) -> str:
        return AC_MODE_NAMES.get(self.mode, "unknown")

    @property
    def fan_mode(self) -> int:
        return self._aircon.fan_mode if self._aircon else AC_FAN_MODE_AUTO

    @property
    def thermostat_mode(self) -> int:
        return self._aircon.thermostat_mode if self._aircon else 0

    @property
    def thermostat_mode_desc(self) -> int:
        if not self._aircon:
            return THERMOSTAT_MODE_AC
        if self.thermostat_mode == 0:
            return THERMOSTAT_MODE_AC
        if self.thermostat_mode == (1 + len(self.zones)):
            return THERMOSTAT_MODE_AVERAGE
        if self.thermostat_mode == (2 + len(self.zones)):
            return THERMOSTAT_MODE_AUTO
        temperature_zone = self.zones[self.thermostat_mode - 1]
        if temperature_zone.status == 1:
            return THERMOSTAT_MODE_ZONE
        return THERMOSTAT_MODE_AC

    @property
    def airtouch_id(self) -> str:
        return self._aircon.airtouch_id if self._aircon else ""

    @property
    def touch_pad_temperature(self) -> int:
        return self._aircon.touch_pad_temperature if self._aircon else 0

    @property
    def touch_pad_group_id(self) -> int:
        return self._aircon.touch_pad_group_id if self._aircon else 0

    @property
    def thermostat_mode_name(self) -> str:
        """Human-readable thermostat mode from the controller."""
        mode = self.thermostat_mode
        if mode == 0:
            return "ac"
        zone_count = len(self.zones)
        if mode == zone_count + 1:
            return "average"
        if mode == zone_count + 2:
            return "auto"
        if 1 <= mode <= zone_count:
            return f"zone:{self.zones[mode - 1].name}"
        return f"unknown({mode})"

    @property
    def active_temperature_source(self) -> str:
        """Best-effort label for what drives room_temperature."""
        mode_desc = self.thermostat_mode_desc
        if mode_desc == THERMOSTAT_MODE_AC:
            return "daikin_ac"
        if mode_desc == THERMOSTAT_MODE_AVERAGE:
            return "zone_average"
        if mode_desc == THERMOSTAT_MODE_AUTO:
            return "auto"
        if mode_desc == THERMOSTAT_MODE_ZONE:
            zone = self.zones[self.thermostat_mode - 1]
            source_by_type = {
                ZONE_TEMPERATURE_TYPE_HIDE: "hidden",
                ZONE_TEMPERATURE_TYPE_USE_SENSOR: "itc_sensor",
                ZONE_TEMPERATURE_TYPE_USE_TOUCH_PAD: "touch_pad",
                ZONE_TEMPERATURE_TYPE_USE_AVERAGE: "zone_average",
            }
            return source_by_type.get(zone.zone_temperature_type, "unknown")
        return "unknown"

    @property
    def room_temperature(self) -> int:
        return self._aircon.room_temperature if self._aircon else 0

    @property
    def desired_temperature(self) -> int:
        return self._aircon.desired_temperature if self._aircon else 0

    @property
    def zones(self) -> list[AirTouch3Zone]:
        return self._zones

    @property
    def sensors(self) -> list[AirTouch3Sensor]:
        return self._sensors

    def get_zone_current_temperature(self, zone_id: int) -> int | None:
        """Return the best available ITC temperature for a zone."""
        zone = next((item for item in self._zones if item.id == zone_id), None)
        if zone is not None:
            for sensor in zone.sensors:
                if sensor.is_available:
                    return sensor.temperature
        for sensor_id in (zone_id * 2, zone_id * 2 + 1):
            for sensor in self._sensors:
                if sensor.id == sensor_id and sensor.is_available:
                    return sensor.temperature
        return None

    async def power_switch(self, to_state: int) -> None:
        if self.power != to_state:
            await self._refresh(
                self._messages.toggle_ac_on_off(self._selected_ac)
            )

    async def set_mode(self, to_mode: int) -> None:
        if not self._aircon:
            return
        await self._refresh(
            self._messages.set_mode(
                self._selected_ac, self._aircon.brand_id, to_mode
            )
        )

    async def set_fan_mode(self, to_mode: int) -> None:
        if not self._aircon:
            return
        await self._refresh(
            self._messages.set_fan_speed(
                self._selected_ac, self._aircon.brand_id, to_mode
            )
        )

    async def set_temperature(self, to_temperature: int) -> None:
        inc_dec = (
            TEMPERATURE_INCREMENT
            if to_temperature >= self.desired_temperature
            else TEMPERATURE_DECREMENT
        )
        await self._refresh(
            self._messages.set_new_temperature(self._selected_ac, inc_dec)
        )

    async def set_temperature_thermostat_mode(self, to_temperature: int) -> None:
        if self.thermostat_mode_desc == THERMOSTAT_MODE_ZONE:
            zone = self.zones[self.thermostat_mode - 1]
            await self.set_zone_temperature(zone.id, to_temperature)
        else:
            await self.set_temperature(to_temperature)

    async def zone_toggle(self, zone_id: int) -> None:
        await self._refresh(self._messages.toggle_zone(zone_id))

    async def zone_switch(self, zone_id: int, to_state: int) -> None:
        zone = self._zones[zone_id] if zone_id < len(self._zones) else None
        if zone and zone.status != to_state:
            await self._refresh(self._messages.toggle_zone(zone_id))

    async def set_zone_temperature(self, zone_id: int, to_temperature: int) -> int:
        if zone_id >= len(self._zones):
            _LOGGER.warning("Zone %s not found", zone_id)
            return 0
        selected_zone = self._zones[zone_id]
        inc_dec = (
            TEMPERATURE_INCREMENT
            if to_temperature >= selected_zone.desired_temperature
            else TEMPERATURE_DECREMENT
        )
        await self._refresh(self._messages.set_fan(zone_id, inc_dec))
        return selected_zone.desired_temperature

    async def set_zone_damper(self, zone_id: int, percentage: int) -> int:
        if zone_id >= len(self._zones):
            _LOGGER.warning("Zone %s not found", zone_id)
            return 0
        if percentage < 0 or percentage > 100:
            raise ValueError("Damper percentage must be between 0 and 100")

        await self._refresh()
        if not self._aircon:
            return 0

        zone = self._aircon.get_zone_by_id(zone_id)
        if zone is None:
            return 0
        if zone.status == 0:
            await self.zone_toggle(zone_id)
            await self._refresh()

        requested = 5 * round(percentage / 5)
        current = zone.fan_value
        run_count = 0
        while current != requested and run_count < 21:
            inc_dec = (
                TEMPERATURE_DECREMENT if current > requested else TEMPERATURE_INCREMENT
            )
            await self._client.fetch_aircon(self._messages.set_fan(zone_id, inc_dec))
            await asyncio.sleep(0.5)
            await self._refresh()
            zone = self._aircon.get_zone_by_id(zone_id) if self._aircon else None
            current = zone.fan_value if zone else current
            run_count += 1

        return current