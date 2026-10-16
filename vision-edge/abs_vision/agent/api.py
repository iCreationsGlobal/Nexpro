"""Talks to the ABS Watch agent API with the device key (no owner email/password on the shop PC)."""

import base64
import json
import urllib.error
import urllib.request
import uuid

USER_AGENT = "ABS-Watch-Agent"


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status

    @property
    def is_auth_error(self):
        """ABS refuses this device: removed (401), or Watch is off / the workspace is suspended (403)."""
        return self.status in (401, 403)

    @property
    def is_retryable(self):
        """No connection, or ABS is busy / erroring: the same request can work later."""
        return self.status == 0 or self.status in (408, 425, 429) or self.status >= 500


def _request(method, url, *, json_body=None, data=None, headers=None, timeout=30):
    body = data
    request_headers = {"Accept": "application/json", "User-Agent": USER_AGENT, **(headers or {})}
    if json_body is not None:
        body = json.dumps(json_body).encode("utf-8")
        request_headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=body, method=method, headers=request_headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(detail)
            message = parsed.get("error") or parsed.get("message") or detail
        except ValueError:
            message = detail or exc.reason
        raise ApiError(exc.code, str(message)[:300]) from exc
    except urllib.error.URLError as exc:
        raise ApiError(0, f"Can't reach ABS ({exc.reason}). Check the internet connection.") from exc
    if not raw:
        return None
    try:
        payload = json.loads(raw.decode("utf-8"))
    except ValueError:
        return None
    return payload.get("data", payload) if isinstance(payload, dict) else payload


def pair(api_base, code, agent_version=None, platform=None, timeout=30):
    """Exchange the pairing code shown in ABS Watch for this agent's device key."""
    return _request(
        "POST",
        f"{api_base.rstrip('/')}/api/watch-agent/pair",
        json_body={"code": code, "agentVersion": agent_version, "platform": platform},
        timeout=timeout,
    )


class DeviceApi:
    def __init__(self, api_base, device_key, timeout=30):
        self.base = f"{api_base.rstrip('/')}/api/watch-agent"
        self.device_key = device_key
        self.timeout = timeout

    def _call(self, method, path, **kwargs):
        headers = {"Authorization": f"Bearer {self.device_key}", **kwargs.pop("headers", {})}
        return _request(method, f"{self.base}{path}", headers=headers, timeout=kwargs.pop("timeout", self.timeout), **kwargs)

    def get_config(self):
        return self._call("GET", "/config")

    def heartbeat(self, agent_version, platform, cameras):
        return self._call("POST", "/heartbeat", json_body={
            "agentVersion": agent_version,
            "platform": platform,
            "cameras": cameras,
        })

    def register_camera(self, local_id, name, role):
        return self._call("POST", "/cameras", json_body={"localId": local_id, "name": name, "role": role})

    def upload_snapshot(self, camera_id, jpeg_bytes, captured_at):
        return self._call("POST", f"/cameras/{camera_id}/snapshot", json_body={
            "image": base64.b64encode(jpeg_bytes).decode("ascii"),
            "capturedAt": captured_at,
        })

    def post_events(self, camera_id, events, clip_reference=None, match_window_minutes=5):
        return self._call("POST", "/events", json_body={
            "cameraId": camera_id,
            "events": events,
            "clipReference": clip_reference,
            "matchWindowMinutes": match_window_minutes,
        })

    def upload_clip(self, camera_id, clip_bytes, content_type="video/mp4", filename="clip.mp4"):
        """Upload an incident clip wherever ABS says (bucket, or the server itself). None if clips are off."""
        target = self._call("POST", "/clips/upload-url", json_body={
            "cameraId": camera_id,
            "contentType": content_type,
            "sizeBytes": len(clip_bytes),
        }) or {}
        mode = target.get("mode")
        if mode == "presigned":
            _request(
                target.get("method", "PUT"),
                target["uploadUrl"],
                data=clip_bytes,
                headers=target.get("headers") or {"Content-Type": content_type},
                timeout=max(self.timeout, 120),
            )
            return target.get("clipReference")
        if mode == "direct":
            boundary = uuid.uuid4().hex
            body = b"".join([
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode(),
                f"Content-Type: {content_type}\r\n\r\n".encode(),
                clip_bytes,
                f"\r\n--{boundary}--\r\n".encode(),
            ])
            result = self._call(
                "POST",
                "/clips",
                data=body,
                headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
                timeout=max(self.timeout, 120),
            ) or {}
            return result.get("clipReference") or result.get("clipUrl")
        return None
