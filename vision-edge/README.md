# ABS Watch agent

Runs on a computer in the shop: the till computer, or any computer on the same network as the
cameras. It watches the cameras there and sends ABS:

- **events**: someone came in, someone spent time at the till, someone left
- **a picture** from each camera every 15 minutes, for drawing the till zone in ABS
- **short clips** (about 15 seconds) of till activity, for reviewing incidents

Video is analysed on the shop computer and is never streamed to ABS. Camera logins stay in
`~/.abs-watch/agent.json` on that computer, readable only by its user. The agent signs in with
its own device key, not an owner's email and password.

## Install

Python 3.9 or newer, then:

```bash
pip3 install -r requirements-agent.txt
brew install ffmpeg            # macOS. Without ffmpeg, clips may not play in the browser.
```

The person detector (YOLOv8n, about 6 MB) downloads to `~/.abs-watch/models` on the first run.

## Set up

1. In ABS, open **Watch → Add Watch device**, name the computer and copy the pairing code.
2. Pair this computer (the code works once, for 15 minutes):

   ```bash
   python3 abs_watch_agent.py pair K7P2-9QXM
   ```

   When testing against a local ABS, ABS shows the full command with `--api`.
3. Add a camera. `--role` is `counter`, `entrance`, `floor` or `exit`:

   ```bash
   python3 abs_watch_agent.py camera add --name Counter --role counter --source camera:0
   python3 abs_watch_agent.py camera add --name Door --role entrance \
     --source "rtsp://admin:password@192.168.1.20:554/Streaming/Channels/102"
   ```

4. Check what the camera sees. This saves a frame to `~/.abs-watch/test-counter.jpg`:

   ```bash
   python3 abs_watch_agent.py camera test Counter
   ```

5. Start watching:

   ```bash
   python3 abs_watch_agent.py run
   ```

6. Back in ABS, the camera's picture appears under **Till zone** within a minute. Draw the
   box around the till and save. The agent picks up zone changes within a minute.

To start the agent with the computer, run `python3 abs_watch_agent.py service install`.
This uses launchd on macOS, a systemd user service on Linux and Task Scheduler on Windows.
`service uninstall` removes it. Cameras added or removed while the agent runs are picked up
within a minute; you don't need to restart it.

## Camera sources

| Source | Example |
| --- | --- |
| This computer's camera | `camera:0`, `camera:1` |
| CCTV camera or recorder (RTSP) | `rtsp://user:pass@192.168.1.20:554/Streaming/Channels/102` |
| HTTP stream | `http://192.168.1.30:8080/video` |
| A video file (testing) | `videos/Counter.mp4` (loops) |

Use the camera's **sub-stream** (often channel `102` on Hikvision, `subtype=1` on Dahua) where
there is one. It is lighter to decode and is plenty for spotting people.

## Testing with an iPhone

**Continuity Camera** (macOS 13+, iOS 16+, same Apple ID, Wi-Fi and Bluetooth on). Mount the
iPhone near the Mac, then find which camera number it is:

```bash
python3 abs_watch_agent.py camera probe     # saves ~/.abs-watch/probe-camera-N.jpg for each camera
python3 abs_watch_agent.py camera add --name Counter --role counter --source camera:1
python3 abs_watch_agent.py run              # run it from Terminal, not as a service
```

macOS asks Terminal for camera permission the first time. A background service can't show that
prompt, so run the agent in Terminal when it reads the Mac's own cameras.

**iPhone as an IP camera** (closer to real CCTV). On the Mac:

```bash
brew install mediamtx && mediamtx
```

In **Larix Broadcaster** on the iPhone, add a connection to `rtmp://<Mac's IP>:1935/iphone`
and start streaming. Then:

```bash
python3 abs_watch_agent.py camera add --name Counter --role counter --source rtsp://127.0.0.1:8554/iphone
```

This path works as a service too.

## Checking on it

- `python3 abs_watch_agent.py status`: pairing, cameras and any events waiting to be sent.
- Log: `~/.abs-watch/agent.log`.
- ABS **Watch → Watch devices** shows each camera as Live, Slow or No video, with the reason.

If the internet drops, events wait in `~/.abs-watch/queue.jsonl` and are sent in order once ABS
is reachable again. The agent also starts with the last settings ABS sent if the internet is
down when the computer boots. Clips of till activity that happen while offline are not kept.

If a device is removed in ABS, the agent pauses. Pair it again with a new code
(`pair <CODE>`). A running agent switches to the new pairing by itself.

## Tests

```bash
python3 -m unittest discover -s tests
```
