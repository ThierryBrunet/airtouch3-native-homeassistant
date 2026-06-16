import asyncio
import logging

import voluptuous as vol

from homeassistant import config_entries, core
from homeassistant.const import CONF_HOST, CONF_PORT

from .airtouch_client import AirTouch3Device
from .const import DEFAULT_PORT, DOMAIN, TIMEOUT

_LOGGER = logging.getLogger(__name__)


@config_entries.HANDLERS.register(DOMAIN)
class AirTouch3ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """AirTouch 3 config flow."""

    VERSION = 1
    CONNECTION_CLASS = config_entries.CONN_CLASS_LOCAL_POLL

    @core.callback
    def _async_get_entry(self, data):
        return self.async_create_entry(
            title=data[CONF_HOST],
            data={
                CONF_HOST: data[CONF_HOST],
                CONF_PORT: data.get(CONF_PORT, DEFAULT_PORT),
            },
        )

    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        _LOGGER.debug("async_step_user")
        if user_input is None:
            return self.async_show_form(step_id="user", data_schema=self.schema)

        host = user_input[CONF_HOST]
        port = user_input.get(CONF_PORT, DEFAULT_PORT)

        device = None
        try:
            _LOGGER.debug("Validating AirTouch at %s:%s", host, port)
            async with asyncio.timeout(TIMEOUT):
                device = AirTouch3Device(host, port, TIMEOUT)
                await device.async_update()
                if not device.available:
                    raise ConnectionError("No data received from AirTouch controller")
        except asyncio.TimeoutError:
            return self.async_show_form(
                step_id="user",
                data_schema=self.schema,
                errors={"base": "device_timeout"},
            )
        except (OSError, ConnectionError):
            _LOGGER.exception("Failed to connect to AirTouch at %s:%s", host, port)
            return self.async_show_form(
                step_id="user",
                data_schema=self.schema,
                errors={"base": "device_fail"},
            )
        except Exception:  # pylint: disable=broad-except
            _LOGGER.exception("Unexpected error creating device")
            return self.async_show_form(
                step_id="user",
                data_schema=self.schema,
                errors={"base": "device_fail"},
            )
        finally:
            if device is not None:
                try:
                    await device.async_close()
                except Exception:  # pylint: disable=broad-except
                    pass

        await self.async_set_unique_id(device.airtouch_id)
        self._abort_if_unique_id_configured()

        _LOGGER.debug("AirTouch %s validated", device.name)
        return self._async_get_entry(user_input)

    @property
    def schema(self):
        """Return current schema."""
        return vol.Schema(
            {
                vol.Required(CONF_HOST): str,
                vol.Optional(CONF_PORT, default=DEFAULT_PORT): int,
            }
        )