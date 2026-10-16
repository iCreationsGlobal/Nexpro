"""
ABS Watch agent: shop cameras -> local person detection -> ABS Watch events.

Runs on a shop PC (or a Watch Box). Video stays in the shop; only events, a periodic still for
drawing zones, and short clips around till activity are sent to ABS. Camera logins never leave
this machine.
"""

AGENT_VERSION = "0.2.0"
