"""Start the agent with the computer: launchd (macOS), systemd user service (Linux), Task Scheduler (Windows)."""

import os
import subprocess
import sys
from pathlib import Path
from xml.sax.saxutils import escape

from .config import agent_home

LABEL = "com.absghana.watch-agent"
WINDOWS_TASK = "ABS Watch Agent"


def _launchd_path():
    return Path.home() / "Library" / "LaunchAgents" / f"{LABEL}.plist"


def _systemd_path():
    return Path.home() / ".config" / "systemd" / "user" / "abs-watch-agent.service"


def service_path_env():
    """Services start with a bare PATH; keep the user's so ffmpeg (Homebrew etc.) is found for clips."""
    entries = [entry for entry in os.environ.get("PATH", "").split(os.pathsep) if entry]
    for extra in ("/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"):
        if extra not in entries:
            entries.append(extra)
    return os.pathsep.join(entries)


def launchd_plist(python, script, home, path_env):
    args = "".join(f"\n    <string>{escape(str(part))}</string>" for part in (python, script, "run"))
    log = escape(str(Path(home) / "agent.out.log"))
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{LABEL}</string>
  <key>ProgramArguments</key>
  <array>{args}
  </array>
  <key>WorkingDirectory</key>
  <string>{escape(str(home))}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ABS_WATCH_HOME</key>
    <string>{escape(str(home))}</string>
    <key>PATH</key>
    <string>{escape(path_env)}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>30</integer>
  <key>StandardOutPath</key>
  <string>{log}</string>
  <key>StandardErrorPath</key>
  <string>{log}</string>
</dict>
</plist>
"""


def systemd_unit(python, script, home, path_env):
    return f"""[Unit]
Description=ABS Watch agent
After=network-online.target

[Service]
Environment="ABS_WATCH_HOME={home}"
Environment="PATH={path_env}"
WorkingDirectory={home}
ExecStart="{python}" "{script}" run
Restart=always
RestartSec=30

[Install]
WantedBy=default.target
"""


def windows_task_command(python, script):
    return [
        "schtasks", "/Create", "/F", "/SC", "ONLOGON", "/RL", "LIMITED", "/TN", WINDOWS_TASK,
        "/TR", f'"{python}" "{script}" run',
    ]


def describe(system=None, python=None, script=None, home=None, path_env=None):
    """What install would do on this computer, without doing it."""
    system = system or sys.platform
    python = python or sys.executable
    script = script or str(Path(__file__).resolve().parents[2] / "abs_watch_agent.py")
    home = home or agent_home()
    path_env = path_env or service_path_env()
    if system == "darwin":
        content = launchd_plist(python, script, home, path_env)
        return {"kind": "launchd", "path": str(_launchd_path()), "content": content}
    if system.startswith("linux"):
        content = systemd_unit(python, script, home, path_env)
        return {"kind": "systemd", "path": str(_systemd_path()), "content": content}
    if system.startswith("win"):
        return {"kind": "schtasks", "command": windows_task_command(python, script)}
    raise RuntimeError(f"Running as a service isn't supported on {system} yet")


def is_installed():
    plan = describe()
    if plan["kind"] == "schtasks":
        found = subprocess.run(["schtasks", "/Query", "/TN", WINDOWS_TASK], check=False, capture_output=True)
        return found.returncode == 0
    return Path(plan["path"]).is_file()


def install():
    plan = describe()
    Path(agent_home()).mkdir(parents=True, exist_ok=True)
    if plan["kind"] == "schtasks":
        subprocess.run(plan["command"], check=True)
        subprocess.run(["schtasks", "/Run", "/TN", WINDOWS_TASK], check=False)
        return plan
    path = Path(plan["path"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(plan["content"], encoding="utf-8")
    if plan["kind"] == "launchd":
        subprocess.run(["launchctl", "unload", str(path)], check=False, capture_output=True)
        subprocess.run(["launchctl", "load", "-w", str(path)], check=True)
    else:
        subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
        subprocess.run(["systemctl", "--user", "enable", "--now", "abs-watch-agent.service"], check=True)
    return plan


def uninstall():
    plan = describe()
    if plan["kind"] == "schtasks":
        subprocess.run(["schtasks", "/Delete", "/F", "/TN", WINDOWS_TASK], check=False)
        return plan
    path = Path(plan["path"])
    if plan["kind"] == "launchd":
        subprocess.run(["launchctl", "unload", "-w", str(path)], check=False, capture_output=True)
    else:
        subprocess.run(["systemctl", "--user", "disable", "--now", "abs-watch-agent.service"], check=False)
    if path.exists():
        os.remove(path)
    return plan
