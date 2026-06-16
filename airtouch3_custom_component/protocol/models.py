"""AirTouch 3 domain models."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Sensor:
    """Wireless temperature sensor (ITC puck)."""

    id: int
    is_available: bool = False
    is_low_battery: bool = False
    temperature: int = 0


@dataclass
class Zone:
    """AirTouch zone."""

    id: int
    name: str = ""
    status: int = 0
    fan_value: int = 0
    is_spill: bool = False
    desired_temperature: int = 0
    zone_temperature_type: int = 0
    sensors: list[Sensor] = field(default_factory=list)


@dataclass
class Aircon:
    """Ducted AC unit managed by AirTouch 3."""

    id: int = 0
    airtouch_id: str = ""
    mode: int = 0
    name: str = ""
    power_status: int = 0
    status: str = "OK"
    brand_id: int = 0
    touch_pad_group_id: int = 0
    touch_pad_temperature: int = 0
    desired_temperature: int = 0
    room_temperature: int = 0
    thermostat_mode: int = 0
    number_of_zones_with_sensors: int = 0
    fan_mode: int = 0
    zones: list[Zone] = field(default_factory=list)
    sensors: list[Sensor] = field(default_factory=list)

    def get_zone_by_id(self, zone_id: int) -> Zone | None:
        """Return zone by id."""
        for zone in self.zones:
            if zone.id == zone_id:
                return zone
        return None