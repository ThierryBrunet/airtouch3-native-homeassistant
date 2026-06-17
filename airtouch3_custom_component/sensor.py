"""Support for AirTouch 3 sensors."""

import logging

from homeassistant.components.sensor import SensorEntity
from homeassistant.const import UnitOfTemperature
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import DOMAIN as AT3_DOMAIN
from .const import SENSOR_TYPE_TEMPERATURE
from .coordinator import AirTouch3Coordinator

SENSOR_ICON = "mdi:home-thermometer-outline"

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass, entry, async_add_entities):
    """Set up AirTouch 3 sensor based on config_entry."""
    coordinator: AirTouch3Coordinator = hass.data[AT3_DOMAIN][entry.entry_id]
    _LOGGER.debug("[AT3Sensor] Init %s", coordinator.device.name)
    sensors = coordinator.device.sensors
    if sensors:
        async_add_entities(
            [
                AT3Sensor(coordinator, sensor.id)
                for sensor in sensors
                if sensor.is_available
            ],
            update_before_add=True,
        )


class AT3Sensor(CoordinatorEntity, SensorEntity):
    """Representation of a AirTouch 3 temperature sensor."""

    _attr_device_class = SENSOR_TYPE_TEMPERATURE
    _attr_native_unit_of_measurement = UnitOfTemperature.CELSIUS
    _attr_icon = SENSOR_ICON

    def __init__(self, coordinator: AirTouch3Coordinator, sensor_id: int) -> None:
        super().__init__(coordinator)
        self._sensor_id = sensor_id
        self._attr_unique_id = (
            f"{coordinator.device.airtouch_id}-{sensor_id}"
        )

    @property
    def _api(self):
        return self.coordinator.device

    def _get_sensor(self):
        for sensor in self._api.sensors:
            if sensor.id == self._sensor_id:
                return sensor
        return None

    @property
    def available(self) -> bool:
        sensor = self._get_sensor()
        return (
            super().available
            and sensor is not None
            and sensor.is_available
        )

    @property
    def native_value(self):
        sensor = self._get_sensor()
        if sensor is None or not sensor.is_available:
            return None
        return sensor.temperature

    @property
    def extra_state_attributes(self):
        sensor = self._get_sensor()
        if sensor is None:
            return {}
        return {
            "is_available": sensor.is_available,
            "is_low_battery": sensor.is_low_battery,
        }