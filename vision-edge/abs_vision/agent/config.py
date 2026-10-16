"""Local agent config: device key, ABS address and the cameras this machine can reach.

Kept in ~/.abs-watch/agent.json (override with ABS_WATCH_HOME) and readable only by the user,
because it holds the device key and camera logins inside stream addresses.
"""

import json
import os
import uuid
from pathlib import Path

DEFAULT_API_BASE = "https://api.africanbusinesssuite.com"
CAMERA_ROLES = ("counter", "entrance", "floor", "exit")
CONFIG_FILENAME = "agent.json"


def agent_home():
    return Path(os.environ.get("ABS_WATCH_HOME") or (Path.home() / ".abs-watch"))


class AgentConfig:
    def __init__(self, path, data=None):
        self.path = Path(path)
        self.data = data or {}
        self.data.setdefault("cameras", [])
        self._mtime = self._modified()

    def _modified(self):
        try:
            info = self.path.stat()
        except OSError:
            return None
        # Size and inode too: saves replace the file, and some filesystems keep whole-second times
        return (info.st_mtime_ns, info.st_size, info.st_ino)

    @classmethod
    def load(cls, path=None):
        target = Path(path) if path else agent_home() / CONFIG_FILENAME
        if target.is_file():
            with target.open(encoding="utf-8") as handle:
                return cls(target, json.load(handle))
        return cls(target)

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(self.path.parent, 0o700)
        except OSError:
            pass
        temp = self.path.with_suffix(".tmp")
        # Create with owner-only permissions before any secret is written
        fd = os.open(str(temp), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(self.data, handle, indent=2)
        os.replace(temp, self.path)
        try:
            os.chmod(self.path, 0o600)
        except OSError:
            pass
        self._mtime = self._modified()

    def changed_on_disk(self):
        """Cheap check (no read): has another process saved the file since we last did?"""
        modified = self._modified()
        return modified is not None and modified != self._mtime

    def reload_if_changed(self):
        """True when the file was changed by another process (e.g. `camera add` while running).
        Raises ValueError if it isn't valid JSON."""
        modified = self._modified()
        if modified is None or modified == self._mtime:
            return False
        with self.path.open(encoding="utf-8") as handle:
            data = json.load(handle)
        data.setdefault("cameras", [])
        self.data = data
        self._mtime = modified
        return True

    # Pairing ---------------------------------------------------------------------------------
    @property
    def api_base(self):
        return (self.data.get("apiBase") or DEFAULT_API_BASE).rstrip("/")

    @property
    def device_key(self):
        return self.data.get("deviceKey")

    @property
    def device_id(self):
        return self.data.get("deviceId")

    @property
    def device_name(self):
        return self.data.get("deviceName")

    def is_paired(self):
        return bool(self.device_key and self.device_id)

    def set_pairing(self, api_base, pairing):
        self.data.update({
            "apiBase": api_base.rstrip("/"),
            "deviceId": pairing["deviceId"],
            "deviceKey": pairing["deviceKey"],
            "deviceName": pairing.get("deviceName"),
            "tenantId": pairing.get("tenantId"),
            "shopId": pairing.get("shopId"),
        })
        # Cameras registered under a previous pairing belong to that device's workspace
        for camera in self.cameras:
            camera.pop("cameraId", None)

    # Cameras ---------------------------------------------------------------------------------
    @property
    def cameras(self):
        return self.data["cameras"]

    def add_camera(self, name, source, role="counter"):
        label = str(name or "").strip()
        if not label:
            raise ValueError("Give the camera a name, e.g. \"Counter\".")
        if role not in CAMERA_ROLES:
            raise ValueError(f"Role must be one of: {', '.join(CAMERA_ROLES)}")
        if not str(source or "").strip():
            raise ValueError("Give the camera's stream address, or camera:0 for this computer's camera.")
        camera = {"localId": uuid.uuid4().hex[:12], "name": label[:120], "role": role, "source": str(source).strip()}
        self.cameras.append(camera)
        return camera

    def find_camera(self, key):
        key = str(key or "").strip().lower()
        for camera in self.cameras:
            if key in (camera.get("localId", "").lower(), camera.get("name", "").lower()):
                return camera
        return None

    def remove_camera(self, key):
        camera = self.find_camera(key)
        if camera:
            self.cameras.remove(camera)
        return camera
