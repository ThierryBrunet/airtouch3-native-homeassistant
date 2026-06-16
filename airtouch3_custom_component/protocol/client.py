"""Async TCP client for the AirTouch 3 local protocol."""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from .parser import MessageResponseParser

if TYPE_CHECKING:
    from .models import Aircon

_LOGGER = logging.getLogger(__name__)


def _to_full_binary_string(value: int) -> str:
    return format(value & 0xFFFFFFFF, "032b")


def format_received_message(raw: bytes) -> list[str] | None:
    """Decode a raw TCP payload into 32-bit binary string tokens."""
    if not raw:
        return None

    hex_tokens = [f"{byte:02X}" for byte in raw]
    msg_string = " ".join(hex_tokens).strip()
    if not msg_string:
        return None
    hex_tokens = msg_string.split(" ")
    if len(hex_tokens) < 395:
        return None
    if len(hex_tokens) == 790:
        hex_tokens = hex_tokens[395:790]

    response: list[str] = []
    for index in range(len(hex_tokens) - 1):
        response.append(_to_full_binary_string(int(hex_tokens[index], 16))[24:])
    return response


class AirTouchTcpClient:
    """Persistent TCP connection to the AirTouch ceiling module."""

    def __init__(self, host: str, port: int, timeout: float) -> None:
        self._host = host
        self._port = port
        self._timeout = timeout
        self._reader: asyncio.StreamReader | None = None
        self._writer: asyncio.StreamWriter | None = None
        self._lock = asyncio.Lock()
        self._parser = MessageResponseParser()

    async def close(self) -> None:
        """Close the TCP connection."""
        if self._writer is not None:
            self._writer.close()
            try:
                await self._writer.wait_closed()
            except OSError:
                pass
        self._reader = None
        self._writer = None

    async def connect_and_send(self, message: bytes) -> list[str] | None:
        """Send a command frame and return parsed response tokens."""
        async with self._lock:
            try:
                if self._writer is None or self._writer.is_closing():
                    self._reader, self._writer = await asyncio.wait_for(
                        asyncio.open_connection(self._host, self._port),
                        timeout=self._timeout,
                    )
                    _LOGGER.debug("Connected to %s:%s", self._host, self._port)

                assert self._writer is not None
                assert self._reader is not None
                self._writer.write(message)
                await self._writer.drain()
                raw = await asyncio.wait_for(
                    self._reader.read(2048),
                    timeout=self._timeout,
                )
                return format_received_message(raw)
            except (TimeoutError, OSError, asyncio.IncompleteReadError) as err:
                _LOGGER.debug("AirTouch TCP error: %s", err)
                await self.close()
                return None

    async def fetch_aircon(self, message: bytes) -> Aircon | None:
        """Send a command and parse the aircon snapshot."""
        content = await self.connect_and_send(message)
        return self._parser.parse(content)