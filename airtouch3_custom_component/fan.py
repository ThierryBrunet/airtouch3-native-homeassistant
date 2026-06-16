"""Support for AirTouch3 zone Dampers."""

import logging

from homeassistant.components.fan import FanEntity, FanEntityFeature
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import DOMAIN as AT3_DOMAIN
from .coordinator import AirTouch3Coordinator

_LOGGER = logging.getLogger(__name__)

FAN_ICON = "mdi:fan"

ZONE_ON = 1
ZONE_OFF = 0

SUPPORTED_FEATURES = (
    FanEntityFeature.SET_SPEED
    | FanEntityFeature.TURN_OFF
    | FanEntityFeature.TURN_ON
)


async def async_setup_entry(hass, entry, async_add_entities):
    """Set up AirTouch3 Dampers."""
    coordinator: AirTouch3Coordinator = hass.data[AT3_DOMAIN][entry.entry_id]
    _LOGGER.debug("[AT3Fan] Init %s", coordinator.device.name)
    zones = coordinator.device.zones
    if zones:
        async_add_entities(
            [ZoneFan(coordinator, zone.id) for zone in zones],
            update_before_add=True,
        )


class ZoneFan(CoordinatorEntity, FanEntity):
    """AirTouch3 Damper."""

    _attr_icon = FAN_ICON
    _attr_supported_features = SUPPORTED_FEATURES
    _attr_percentage_step = 1.0

    def __init__(self, coordinator: AirTouch3Coordinator, zone_id: int) -> None:
        super().__init__(coordinator)
        self._zone_id = zone_id
        _LOGGER.debug("[AT3Fan] Zone ID Is %s", zone_id)

    @property
    def _api(self):
        return self.coordinator.device

    def _get_zone(self):
        for zone in self._api.zones:
            if zone.id == self._zone_id:
                return zone
        return None

    @property
    def unique_id(self):
        zone = self._get_zone()
        if zone is None:
            return None
        return f"{self._api.airtouch_id}-{zone.id}-fan"

    @property
    def name(self):
        zone = self._get_zone()
        return zone.name if zone else None

    @property
    def is_on(self):
        zone = self._get_zone()
        return zone is not None and zone.status == ZONE_ON

    @property
    def percentage(self):
        zone = self._get_zone()
        return zone.fan_value if zone else 0

    @property
    def extra_state_attributes(self):
        zone = self._get_zone()
        if zone is None:
            return {}
        current_temperature = self._api.get_zone_current_temperature(zone.id)
        attrs = {
            "fan_value": zone.fan_value,
            "id": zone.id,
            "desired_temperature": zone.desired_temperature,
        }
        if current_temperature is not None:
            attrs["current_temperature"] = current_temperature
        return attrs

    async def async_turn_on(self, **kwargs):
        _LOGGER.debug("[AT3Fan] async_turn_on")
        await self._api.zone_switch(self._zone_id, ZONE_ON)
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs):
        _LOGGER.debug("[AT3Fan] async_turn_off")
        await self._api.zone_switch(self._zone_id, ZONE_OFF)
        self.async_write_ha_state()

    async def async_toggle(self, **kwargs):
        _LOGGER.debug("[AT3Fan] async_toggle")
        await self._api.zone_toggle(self._zone_id)
        self.async_write_ha_state()

    async def async_set_percentage(self, percentage):
        _LOGGER.debug("[AT3Fan] async_set_percentage")
        await self._api.set_zone_damper(self._zone_id, percentage)
        self.async_write_ha_state()