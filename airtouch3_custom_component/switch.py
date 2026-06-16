"""Support for AirTouch3 zones."""

import logging

from homeassistant.helpers.entity import ToggleEntity
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import DOMAIN as AT3_DOMAIN
from .coordinator import AirTouch3Coordinator

_LOGGER = logging.getLogger(__name__)

ZONE_ICON = "mdi:map-marker"

ZONE_ON = 1
ZONE_OFF = 0


async def async_setup_entry(hass, entry, async_add_entities):
    """Set up AirTouch3 zones."""
    coordinator: AirTouch3Coordinator = hass.data[AT3_DOMAIN][entry.entry_id]
    _LOGGER.debug("[AT3Zone] Init %s", coordinator.device.name)
    zones = coordinator.device.zones
    if zones:
        async_add_entities(
            [ZoneSwitch(coordinator, zone.id) for zone in zones],
            update_before_add=True,
        )


class ZoneSwitch(CoordinatorEntity, ToggleEntity):
    """AirTouch3 zone."""

    _attr_icon = ZONE_ICON

    def __init__(self, coordinator: AirTouch3Coordinator, zone_id: int) -> None:
        super().__init__(coordinator)
        self._zone_id = zone_id
        _LOGGER.debug("[AT3Zone] Zone ID Is %s", zone_id)

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
        return f"{self._api.airtouch_id}-{zone.id}-switch"

    @property
    def name(self):
        zone = self._get_zone()
        return zone.name if zone else None

    @property
    def is_on(self):
        zone = self._get_zone()
        return zone is not None and zone.status == ZONE_ON

    @property
    def extra_state_attributes(self):
        zone = self._get_zone()
        if zone is None:
            return {}
        current_temperature = self._api.get_zone_current_temperature(zone.id)
        attrs = {
            "zone_temperature_type": zone.zone_temperature_type,
            "fan_value": zone.fan_value,
            "is_spill": zone.is_spill,
            "id": zone.id,
            "desired_temperature": zone.desired_temperature,
        }
        if current_temperature is not None:
            attrs["current_temperature"] = current_temperature
        return attrs

    async def async_turn_on(self, **kwargs):
        _LOGGER.debug("[AT3Zone] async_turn_on")
        await self._api.zone_switch(self._zone_id, ZONE_ON)
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs):
        _LOGGER.debug("[AT3Zone] async_turn_off")
        await self._api.zone_switch(self._zone_id, ZONE_OFF)
        self.async_write_ha_state()

    async def async_toggle(self, **kwargs):
        _LOGGER.debug("[AT3Zone] async_toggle")
        await self._api.zone_toggle(self._zone_id)
        self.async_write_ha_state()