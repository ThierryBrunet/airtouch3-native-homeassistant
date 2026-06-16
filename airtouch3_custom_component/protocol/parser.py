"""Parse AirTouch 3 binary responses into domain models."""

from __future__ import annotations

from . import constants as mc
from .models import Aircon, Sensor, Zone


def _substring(value: str, begin: int, end: int) -> str:
    return value[begin:end]


def _parse_binary_field(content: list[str], index: int, begin: int, end: int) -> int:
    return int(_substring(content[index], begin, end), 2)


class MessageResponseParser:
    """Convert a parsed AirTouch response into an Aircon model."""

    def parse(self, content: list[str] | None) -> Aircon | None:
        """Parse response tokens into a single-aircon snapshot."""
        if not content:
            return None

        aircon = Aircon()
        aircon.id = int(content[mc.AIRCON_ID], 2)
        aircon.brand_id = int(content[mc.AIRCON_BRAND_ID], 2)
        aircon.power_status = (
            1 if _substring(content[mc.AIRCON_STATUS], 0, 1) == "1" else 0
        )
        aircon.status = (
            "ERROR" if _substring(content[mc.AIRCON_STATUS], 1, 2) == "1" else "OK"
        )
        aircon.name = self._system_name(content)
        aircon.sensors = self._sensors(content)
        aircon.mode = self._ac_mode(content)
        aircon.fan_mode = self._fan_speed(content)
        aircon.airtouch_id = self._airtouch_id(content)
        aircon.touch_pad_group_id = int(content[mc.TOUCHPAD_GROUP_ID], 2)
        aircon.touch_pad_temperature = _parse_binary_field(
            content, mc.TOUCHPAD_TEMPERATURE, 1, 8
        )
        aircon.desired_temperature = _parse_binary_field(
            content, mc.DESIRED_TEMPERATURE, 1, 8
        )
        aircon.room_temperature = int(content[mc.ROOM_TEMPERATURE], 2)
        aircon.thermostat_mode = int(content[mc.THERMOSTAT_MODE], 2)
        aircon.zones = self._zones(
            content,
            aircon.touch_pad_group_id,
            aircon.touch_pad_temperature,
            aircon.sensors,
        )
        aircon.number_of_zones_with_sensors = sum(
            1
            for zone in aircon.zones
            if zone.sensors and any(sensor.is_available for sensor in zone.sensors)
        )
        return aircon

    def _system_name(self, content: list[str]) -> str:
        chars: list[str] = []
        for offset in range(16):
            value = int(content[mc.SYSTEM_NAME_START + offset], 2)
            chars.append(chr(value))
        name = "".join(char for char in chars if char not in "\x00" and char.isprintable())
        return name.strip()

    def _sensors(self, content: list[str]) -> list[Sensor]:
        sensors: list[Sensor] = []
        for sensor_id in range(32):
            token = content[mc.SENSOR_DATA_START + sensor_id]
            sensors.append(
                Sensor(
                    id=sensor_id,
                    is_available=_substring(token, 0, 1) == "1",
                    is_low_battery=_substring(token, 1, 2) == "1",
                    temperature=int(_substring(token, 2, 8), 2),
                )
            )
        return sensors

    def _ac_mode(self, content: list[str]) -> int:
        ac_mode = _parse_binary_field(content, mc.AIRCON_MODE, 1, 8)
        mapping = {0: 0, 1: 1, 2: 2, 3: 3, 4: 4}
        return mapping.get(ac_mode, 0)

    def _fan_speed(self, content: list[str]) -> int:
        fanspeed = _parse_binary_field(content, mc.FAN_SPEED, 4, 8)
        mapping = {0: 5, 1: 1, 2: 2, 3: 3, 4: 5}
        return mapping.get(fanspeed, 5)

    def _airtouch_id(self, content: list[str]) -> str:
        parts: list[str] = []
        for offset in range(8):
            parts.append(
                str(_parse_binary_field(content, mc.AIRTOUCH_ID_START + offset, 4, 8))
            )
        return "".join(parts)

    def _zones(
        self,
        content: list[str],
        touch_pad_group_id: int,
        touch_pad_temperature: int,
        sensors: list[Sensor],
    ) -> list[Zone]:
        zone_data = [content[mc.ZONE_DATA_START + i] for i in range(16)]
        group_data = [content[mc.GROUP_DATA_START + i] for i in range(16)]
        group_percentage_data = [
            content[mc.GROUP_PERCENTAGE_DATA_START + i] for i in range(16)
        ]
        group_setting = [content[mc.GROUP_SETTING_START + i] for i in range(16)]
        group_name = [content[mc.GROUP_NAME_START + i] for i in range(128)]

        zone_names: list[str] = []
        for token in group_name:
            zone_names.append(chr(int(token, 2)))

        number_of_zones = int(content[mc.NUMBER_OF_ZONES], 2)
        zones: list[Zone] = []
        for zone_id in range(number_of_zones):
            name_chars: list[str] = []
            for char_index in range(zone_id * 8, (zone_id + 1) * 8):
                character = zone_names[char_index]
                if character.isprintable():
                    name_chars.append(character)
            name = "".join(name_chars).strip()

            start_zone = int(_substring(group_data[zone_id], 0, 4), 2)
            status = (
                1 if _substring(zone_data[start_zone], 0, 1) == "1" else 0
            )
            fan_value = (
                int(_substring(group_percentage_data[zone_id], 1, 8), 2) * 5
                if status == 1
                else 0
            )
            desired_temperature = (
                int(_substring(group_setting[zone_id], 3, 8), 2) + 1
            )
            is_spill = _substring(zone_data[zone_id], 1, 2) == "1"
            feedback = int(_substring(group_setting[zone_id], 0, 3), 2)

            zone = Zone(
                id=zone_id,
                name=name,
                status=status,
                fan_value=fan_value,
                is_spill=is_spill,
                desired_temperature=desired_temperature,
            )
            self._assign_zone_sensors(
                zone,
                zone_id,
                touch_pad_group_id,
                touch_pad_temperature,
                feedback,
                sensors,
            )
            zones.append(zone)
        return zones

    def _assign_zone_sensors(
        self,
        zone: Zone,
        zone_id: int,
        touch_pad_group_id: int,
        touch_pad_temperature: int,
        feedback: int,
        sensors: list[Sensor],
    ) -> None:
        """Map ITC sensors to a zone based on feedback mode."""
        if (touch_pad_group_id - 1) != zone_id:
            if feedback == 0:
                zone.zone_temperature_type = 0
            elif feedback == 1:
                sensor = self._first_available_sensor(sensors, zone_id * 2, zone_id * 2 + 1)
                if sensor:
                    zone.sensors.append(sensor)
                zone.zone_temperature_type = 1
            elif feedback == 2:
                sensor = self._first_available_sensor(sensors, zone_id * 2 + 1, zone_id * 2)
                if sensor:
                    zone.sensors.append(sensor)
                zone.zone_temperature_type = 1
            elif feedback == 3:
                zone.zone_temperature_type = 3
                zone.sensors.extend(
                    sensor
                    for sensor in sensors
                    if sensor.id in (zone_id * 2, zone_id * 2 + 1) and sensor.is_available
                )
            return

        if feedback == 0:
            zone.zone_temperature_type = 0
        elif feedback == 1:
            zone.zone_temperature_type = 2
        elif feedback == 2:
            sensor = self._first_available_sensor(sensors, zone_id * 2, zone_id * 2 + 1)
            if sensor:
                zone.sensors.append(sensor)
            zone.zone_temperature_type = 1
        elif feedback == 3:
            sensor = self._first_available_sensor(sensors, zone_id * 2 + 1, zone_id * 2)
            if sensor:
                zone.sensors.append(sensor)
            zone.zone_temperature_type = 1
        elif feedback == 4:
            zone.zone_temperature_type = 3
            zone.sensors.extend(
                sensor
                for sensor in sensors
                if sensor.id in (zone_id * 2, zone_id * 2 + 1) and sensor.is_available
            )

    @staticmethod
    def _first_available_sensor(
        sensors: list[Sensor], first_id: int, second_id: int
    ) -> Sensor | None:
        for sensor_id in (first_id, second_id):
            for sensor in sensors:
                if sensor.id == sensor_id and sensor.is_available:
                    return sensor
        return None