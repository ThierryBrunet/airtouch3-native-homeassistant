"""Data update coordinator for AirTouch 3."""

from __future__ import annotations

import logging
from datetime import timedelta

from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .airtouch_client import AirTouch3Device
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)
SCAN_INTERVAL = timedelta(seconds=60)


class AirTouch3Coordinator(DataUpdateCoordinator[AirTouch3Device]):
    """Poll the AirTouch controller once and fan out to all entities."""

    def __init__(self, hass: HomeAssistant, device: AirTouch3Device) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=SCAN_INTERVAL,
        )
        self.device = device
        device.set_coordinator(self)

    async def _async_update_data(self) -> AirTouch3Device:
        if not await self.device.async_refresh(notify=False):
            raise UpdateFailed("No response from AirTouch controller")
        return self.device