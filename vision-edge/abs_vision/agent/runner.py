"""Runs every camera on this machine, reports health and follows changes made in ABS."""

import json
import logging
import os
import platform
import threading
import time

from . import AGENT_VERSION
from .api import ApiError, DeviceApi
from .config import agent_home
from .queue import EventQueue
from .worker import CameraWorker, send_backlog

log = logging.getLogger("abs_watch.runner")

# ABS refused the device (removed, Watch off, workspace suspended): check again this often
PAUSED_RETRY_SECONDS = 300.0
# Can't reach ABS and nothing to start from yet
OFFLINE_RETRY_SECONDS = 30.0
# Per heartbeat, so a long backlog never delays the next one
BACKLOG_SECONDS = 20.0
# After starting cameras, report again this soon so ABS shows them live instead of waiting a minute
FIRST_REPORT_SECONDS = 5.0
# How often agent.json is checked for `pair` / `camera add` run meanwhile, even while paused
LOCAL_CHECK_SECONDS = 10.0
CLOUD_CACHE_FILENAME = "cloud.json"


def platform_label():
    return f"{platform.system()} {platform.release()}".strip()[:60]


class AgentRunner:
    def __init__(self, config, api=None, tracker_factory=None, worker_factory=CameraWorker, queue=None):
        if not config.is_paired():
            raise RuntimeError("This agent is not paired yet. Run: abs_watch_agent.py pair <CODE>")
        self.config = config
        self._device_key = config.device_key
        self.api = api or DeviceApi(config.api_base, config.device_key)
        self.queue = queue or EventQueue(agent_home() / "queue.jsonl")
        self._tracker_factory = tracker_factory
        self._worker_factory = worker_factory
        self.workers = {}
        # Shared with the workers, so new settings from ABS reach cameras that are already running
        self.settings = {}
        self.config_version = None
        self.paused = None
        self._needs_sync = True
        self._just_started = False
        self._removed_in_abs = set()
        self._stop_event = threading.Event()
        self._wake = threading.Event()

    @property
    def heartbeat_seconds(self):
        return max(15.0, float(self.settings.get("heartbeatSeconds", 60)))

    # Settings from ABS -----------------------------------------------------------------------
    def _cache_path(self):
        return self.config.path.parent / CLOUD_CACHE_FILENAME

    def _save_cache(self, cloud):
        try:
            path = self._cache_path()
            path.parent.mkdir(parents=True, exist_ok=True)
            temp = path.with_suffix(".tmp")
            temp.write_text(json.dumps({"deviceId": self.config.device_id, "config": cloud}), encoding="utf-8")
            os.replace(temp, path)
        except OSError as exc:
            log.warning("Couldn't save ABS settings for offline use: %s", exc)

    def _load_cache(self):
        try:
            saved = json.loads(self._cache_path().read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        return saved.get("config") if saved.get("deviceId") == self.config.device_id else None

    def load_cloud_config(self):
        """Cameras and settings from ABS, or the copy it sent last time when it can't be reached.
        Returns (cameras by id, whether this came from ABS just now)."""
        live = True
        try:
            cloud = self.api.get_config() or {}
        except ApiError as exc:
            if exc.is_auth_error:
                raise
            cloud = self._load_cache()
            if cloud is None:
                raise
            live = False
            log.warning("Can't reach ABS (%s); using the settings it sent last time", exc)
        else:
            self._save_cache(cloud)
        self.settings.clear()
        self.settings.update(cloud.get("settings") or {})
        self.config_version = cloud.get("configVersion")
        cameras = {camera["id"]: camera for camera in cloud.get("cameras") or [] if camera.get("id")}
        return cameras, live

    def register_cameras(self):
        """Cameras added on this machine get a camera record in ABS (their stream address stays here)."""
        changed = False
        try:
            for camera in self.config.cameras:
                if camera.get("cameraId"):
                    continue
                registered = self.api.register_camera(camera["localId"], camera["name"], camera.get("role", "counter"))
                camera["cameraId"] = registered["id"]
                changed = True
                log.info("Camera %s registered with ABS", camera["name"])
        finally:
            if changed:
                self.config.save()

    # Cameras ---------------------------------------------------------------------------------
    def sync(self):
        """
        Run exactly the cameras that are on this machine and switched on in ABS, with the names and
        zones set in ABS. True when fully up to date; False if something has to be retried.
        """
        complete = True
        try:
            self.register_cameras()
        except ApiError as exc:
            if exc.is_auth_error:
                raise
            complete = False
            log.warning("Couldn't register new cameras with ABS yet (%s); will retry", exc)
        cloud_cameras, live = self.load_cloud_config()
        complete = complete and live

        wanted = {}
        for camera in self.config.cameras:
            camera_id = camera.get("cameraId")
            if not camera_id:
                continue
            cloud = cloud_cameras.get(camera_id)
            if cloud is None:
                if live and camera_id not in self._removed_in_abs:
                    self._removed_in_abs.add(camera_id)
                    log.warning(
                        "Camera %s was removed in ABS. Remove it here too: abs_watch_agent.py camera remove \"%s\"",
                        camera["name"], camera["name"],
                    )
                continue
            if cloud.get("isActive") is False:
                continue
            wanted[camera_id] = {**camera, "name": cloud.get("name") or camera["name"], "zones": cloud.get("zones") or []}

        for camera_id in [camera_id for camera_id in self.workers if camera_id not in wanted]:
            worker = self.workers.pop(camera_id)
            log.info("Stopping %s (removed here, or switched off in ABS)", worker.camera.get("name"))
            worker.stop()
        for camera_id, camera in wanted.items():
            worker = self.workers.get(camera_id)
            if worker:
                worker.set_zones(camera["zones"])
                continue
            worker = self._worker_factory(
                camera,
                self.api,
                self.queue,
                self.settings,
                self._tracker_factory,
                on_auth_error=self._on_auth_error,
            )
            self.workers[camera_id] = worker
            worker.start()
            self._just_started = True
            log.info("Watching %s", camera["name"])
        if not self.config.cameras:
            log.warning("No cameras yet. Add one: abs_watch_agent.py camera add --name Counter --source camera:0")
        elif not self.workers:
            log.warning("No cameras to watch: they're switched off in ABS or not registered yet")
        return complete

    def camera_statuses(self):
        return [worker.status() for worker in self.workers.values()]

    def stop_workers(self, wait=False):
        workers = list(self.workers.values())
        self.workers = {}
        for worker in workers:
            worker.stop()
        if wait:
            for worker in workers:
                worker.join(timeout=15)

    # Running ---------------------------------------------------------------------------------
    def _on_auth_error(self, _exc):
        # A camera was refused: check with ABS now rather than at the next heartbeat
        self._needs_sync = True
        self._wake.set()

    def _pause(self, reason):
        if self.paused != reason:
            log.error(
                "ABS refused this device: %s Watching is paused and resumes by itself once ABS allows it again. "
                "If the device was removed in ABS, pair it again: abs_watch_agent.py pair <CODE>",
                reason if reason.endswith(".") else f"{reason}.",
            )
        self.paused = reason
        self.stop_workers()
        self._needs_sync = True

    def _reload_local_config(self):
        """Pick up `camera add/remove` or `pair` run while the agent is running."""
        try:
            changed = self.config.reload_if_changed()
        except ValueError as exc:
            log.error("Can't read %s (%s); keeping the previous settings", self.config.path, exc)
            return
        if not changed:
            return
        self._needs_sync = True
        if self.config.device_key != self._device_key and self.config.is_paired():
            log.info("Paired again; restarting with the new device key")
            self.stop_workers()
            self._device_key = self.config.device_key
            self.api = DeviceApi(self.config.api_base, self.config.device_key)
            self.config_version = None
            self.paused = None
            self._removed_in_abs.clear()

    def tick(self):
        """One round: local changes, sync with ABS when needed, heartbeat. Returns seconds to the next."""
        self._reload_local_config()
        try:
            if self._needs_sync:
                self._needs_sync = not self.sync()
            result = self.api.heartbeat(AGENT_VERSION, platform_label(), self.camera_statuses()) or {}
            if result.get("configVersion") and result["configVersion"] != self.config_version:
                # Zones, names or on/off changed in ABS
                self._needs_sync = not self.sync()
            send_backlog(self.queue, self.api, max_seconds=BACKLOG_SECONDS)
        except ApiError as exc:
            if exc.is_auth_error:
                self._pause(str(exc))
                return PAUSED_RETRY_SECONDS
            log.warning("Can't reach ABS: %s", exc)
            return self.heartbeat_seconds if self.workers else OFFLINE_RETRY_SECONDS
        if self.paused:
            log.info("ABS accepts this device again; watching resumed")
            self.paused = None
        if self._just_started:
            self._just_started = False
            return FIRST_REPORT_SECONDS
        return self.heartbeat_seconds

    def run_forever(self):
        log.info("ABS Watch agent %s (%s) connected to %s", AGENT_VERSION, platform_label(), self.config.api_base)
        while not self._stop_event.is_set():
            self._sleep(self.tick())
        self.stop_workers(wait=True)

    def _sleep(self, seconds):
        """Until the next round, a stop request, or a change to agent.json (checked every few seconds)."""
        deadline = time.monotonic() + seconds
        while not self._stop_event.is_set():
            remaining = deadline - time.monotonic()
            if remaining <= 0 or self._wake.wait(min(LOCAL_CHECK_SECONDS, remaining)):
                break
            if self.config.changed_on_disk():
                break
        self._wake.clear()

    def request_stop(self):
        """Safe from a signal handler: the loop notices, then shuts the cameras down."""
        self._stop_event.set()
        self._wake.set()

    def stop(self):
        self.request_stop()
        self.stop_workers(wait=True)
