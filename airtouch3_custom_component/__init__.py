"""Platform for AirTouch 3."""
import asyncio
import logging

from homeassistant.config_entries import SOURCE_IMPORT, ConfigEntry
from homeassistant.const import CONF_HOST, CONF_PORT
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady

from .airtouch_client import AirTouch3Device
from .coordinator import AirTouch3Coordinator
from .const import DEFAULT_PORT, DOMAIN, TIMEOUT
from . import config_flow  # noqa: F401

_LOGGER = logging.getLogger(__name__)

COMPONENT_TYPES = ["climate", "sensor", "switch", "fan"]


async def async_setup(hass, config):
    """Connect to AirTouch 3 unit via YAML import."""
    if DOMAIN not in config:
        return True

    host = config[DOMAIN][CONF_HOST]
    if not host:
        hass.async_create_task(
            hass.config_entries.flow.async_init(
                DOMAIN, context={"source": SOURCE_IMPORT}
            )
        )

    hass.async_create_task(
        hass.config_entries.flow.async_init(
            DOMAIN, context={"source": SOURCE_IMPORT}, data={CONF_HOST: host}
        )
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry):
    """Connect to AirTouch 3 unit."""
    conf = entry.data

    device = await api_init(
        conf[CONF_HOST],
        conf.get(CONF_PORT),
    )
    if not device:
        return False

    coordinator = AirTouch3Coordinator(hass, device)
    await coordinator.async_config_entry_first_refresh()

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, COMPONENT_TYPES)

    return True


async def async_unload_entry(hass, config_entry):
    """Unload a config entry."""
    await asyncio.wait(
        [
            hass.config_entries.async_forward_entry_unload(config_entry, component)
            for component in COMPONENT_TYPES
        ]
    )
    coordinator = hass.data[DOMAIN].pop(config_entry.entry_id)
    await coordinator.device.async_close()
    if not hass.data[DOMAIN]:
        hass.data.pop(DOMAIN)
    return True


async def api_init(host, port, timeout=TIMEOUT):
    """Init the AirTouch unit over TCP."""
    port = port or DEFAULT_PORT

    try:
        _LOGGER.debug("Connecting to AirTouch at %s:%s", host, port)
        device = AirTouch3Device(host, port, timeout)
        if not await device.async_refresh(notify=False):
            _LOGGER.error("AirTouch at %s:%s returned no data", host, port)
            raise ConfigEntryNotReady
    except asyncio.TimeoutError:
        _LOGGER.debug("Connection to %s timed out", host)
        raise ConfigEntryNotReady from None
    except OSError as err:
        _LOGGER.debug("Connection to %s failed: %s", host, err)
        raise ConfigEntryNotReady from err
    except ConfigEntryNotReady:
        raise
    except Exception:  # pylint: disable=broad-except
        _LOGGER.exception("Unexpected error creating device %s", host)
        return None

    return device