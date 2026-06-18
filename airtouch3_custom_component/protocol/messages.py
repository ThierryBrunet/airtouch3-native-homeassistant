"""AirTouch 3 outbound message builders."""

from __future__ import annotations


class AirTouchMessages:
    """Build 13-byte AirTouch protocol command frames."""

    def __init__(self) -> None:
        self._message = bytearray(13)

    def get_init_msg(self) -> bytes:
        """Poll current system state."""
        self._reset_contents()
        self._message[1] = 1
        self._message[12] = self._checksum()
        return bytes(self._message)

    def set_mode(self, ac_id: int, ac_brand_id: int, mode: int) -> bytes:
        """Set AC mode (auto/heat/cool/dry/fan)."""
        self._reset_contents()
        current_mode = mode
        if ac_id == 0 and ac_brand_id == 11:
            mapping = {0: 0, 1: 2, 2: 3, 3: 4, 4: 1}
            mode = mapping.get(current_mode, current_mode)
        if ac_id == 0 and ac_brand_id == 15:
            mapping = {0: 5, 1: 2, 2: 3, 3: 4, 4: 1}
            mode = mapping.get(current_mode, current_mode)
        self._message[1] = 0x86  # -122
        self._message[3] = ac_id & 0xFF
        self._message[4] = 0x81  # -127
        self._message[5] = mode & 0xFF
        self._message[12] = self._checksum()
        return bytes(self._message)

    def set_fan_speed(self, ac_id: int, ac_brand_id: int, mode: int) -> bytes:
        """Set AC fan speed."""
        self._reset_contents()
        current_mode = mode
        if ac_id == 0 and ac_brand_id == 15 and current_mode == 0:
            mode = 4
        if ac_id == 0 and ac_brand_id == 2:
            if current_mode == 0:
                mode = 0
            elif current_mode == 4:
                mode = 1
            else:
                mode = current_mode + 1
        self._message[1] = 0x86
        self._message[3] = ac_id & 0xFF
        self._message[4] = 0x82  # -126
        self._message[5] = mode & 0xFF
        self._message[12] = self._checksum()
        return bytes(self._message)

    def set_new_temperature(self, ac_id: int, inc_dec: int) -> bytes:
        """Increment or decrement AC setpoint."""
        self._reset_contents()
        self._message[1] = 0x86
        self._message[3] = ac_id & 0xFF
        self._message[4] = 0xA3 if inc_dec >= 0 else 0x93  # -93 / -109
        self._message[12] = self._checksum()
        return bytes(self._message)

    def toggle_ac_on_off(self, ac_id: int) -> bytes:
        """Toggle AC power."""
        self._reset_contents()
        self._message[1] = 0x86
        self._message[3] = ac_id & 0xFF
        self._message[4] = 0x80  # -128
        self._message[12] = self._checksum()
        return bytes(self._message)

    def toggle_zone(self, room: int) -> bytes:
        """Toggle zone on/off."""
        self._reset_contents()
        self._message[1] = 0x81  # -127
        self._message[3] = room & 0xFF
        self._message[4] = 0x80
        self._message[12] = self._checksum()
        return bytes(self._message)

    def set_fan(self, room: int, inc_dec: int) -> bytes:
        """Increment/decrement zone fan or setpoint step."""
        self._reset_contents()
        self._message[1] = 0x81
        self._message[3] = room & 0xFF
        self._message[4] = 2 if inc_dec >= 0 else 1
        self._message[5] = 1
        self._message[12] = self._checksum()
        return bytes(self._message)

    def toggle_zone_temperature_fan(self, room: int) -> bytes:
        """Toggle zone between ITC temperature control and manual damper mode."""
        self._reset_contents()
        self._message[1] = 0x81
        self._message[3] = room & 0xFF
        self._message[4] = 0x80
        self._message[5] = 1
        self._message[12] = self._checksum()
        return bytes(self._message)

    def _checksum(self) -> int:
        total = 0
        for index in range(12):
            value = self._message[index]
            if value >= 0:
                total += value
            elif value == -128:
                total += 128
            else:
                total += value + 256
        return total & 0xFF

    def _reset_contents(self) -> None:
        self._message = bytearray(13)
        self._message[0] = 85
        self._message[2] = 12