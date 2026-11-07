#!/usr/bin/env python3
"""Render demo/transcript.txt as a terminal-typing GIF (PIL, DejaVuSansMono).
The transcript is generated from real CLI runs (see scripts/record-demo.sh);
this script only renders it, never edits the content.

The screen clears at each "$" command line (like a real terminal's clear),
so every command's output stays whole on one screen — the verdict tables
are never split across screens. Target duration ~30s.

Note: PIL's GIF writer drops identical consecutive frames, so holds use a
blinking cursor (alternating frames) to stay real time instead of
collapsing to a single frame.
"""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1080, 620
BG = (18, 18, 24)
FG = (220, 220, 220)
DIM = (150, 150, 160)
GREEN = (120, 220, 130)
YELLOW = (235, 200, 100)
RED = (240, 110, 110)
CYAN = (120, 200, 230)

font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 12)
bold = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", 12)
LINE_H = 17
DURATION_MS = 70

lines = open("demo/transcript.txt").read().splitlines()

def color_for(line: str):
    if line.startswith("$"):
        return GREEN
    if "CONTRADICTED" in line:
        return RED
    if "UNVERIFIED" in line:
        return YELLOW
    if "VERIFIED" in line and "0 UNVERIFIED" in line:
        return GREEN
    if "VERIFIED" in line and line.startswith("Reviewed"):
        return GREEN
    if line.startswith("12 VERIFIED"):
        return YELLOW
    if line.startswith("14 VERIFIED"):
        return GREEN
    if line.startswith("exit: 1"):
        return RED
    if line.startswith("exit: 0"):
        return GREEN
    if line.startswith("note:"):
        return YELLOW
    if line.startswith("UNPARSED"):
        return YELLOW
    if line.startswith("CLAIM"):
        return DIM
    if line.startswith("---"):
        return DIM
    if line.startswith("claimtrace verify"):
        return CYAN
    if "transcript:" in line and "VERIFIED" in line:
        return GREEN
    return FG

frames = []
canvas: list[tuple[str, tuple]] = []
_tick = [0]

def render(canvas_tmp, cursor_on=True):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    y = 14
    for text, color in canvas_tmp:
        f = bold if text.startswith(("$", "12 VERIFIED", "14 VERIFIED", "exit:")) else font
        d.text((14, y), text, font=f, fill=color)
        y += LINE_H
        if y > H - 30:
            break
    if cursor_on:
        d.rectangle([14, H - 24, 22, H - 12], fill=GREEN)
    return img

def hold(n):
    """Append n frames of the current canvas with a blinking cursor."""
    for _ in range(n):
        _tick[0] += 1
        frames.append(render(canvas, cursor_on=(_tick[0] % 2 == 0)))

# Title card (~1s): what the demo shows
title_lines = [
    ("claimtrace — did the agent really do what its report says?", bold, GREEN),
    ("1. formats: four transcript formats, detected by line shape", font, FG),
    ("2. verify the overclaiming report — exit 1", font, FG),
    ("3. verify the honest report — exit 0", font, FG),
    ("zero-dep CLI · every claim gets a verdict + transcript line", font, DIM),
]
for _ in range(14):
    _tick[0] += 1
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.text((14, 150), title_lines[0][0], font=title_lines[0][1], fill=title_lines[0][2])
    d.text((14, 200), title_lines[1][0], font=title_lines[1][1], fill=title_lines[1][2])
    d.text((14, 230), title_lines[2][0], font=title_lines[2][1], fill=title_lines[2][2])
    d.text((14, 260), title_lines[3][0], font=title_lines[3][1], fill=title_lines[3][2])
    d.text((14, 360), title_lines[4][0], font=title_lines[4][1], fill=title_lines[4][2])
    if _tick[0] % 2 == 0:
        d.rectangle([14, H - 24, 22, H - 12], fill=GREEN)
    frames.append(img)

MAX_LINES = (H - 30 - 14) // LINE_H

for line in lines:
    # New command: clear the screen first so the previous output is gone
    # and this command's output stays whole (never split mid-table).
    if line.startswith("$") and canvas:
        canvas = []
        hold(3)
    color = color_for(line)
    step = max(3, len(line) // 4)
    for i in range(0, len(line), step):
        frames.append(render(canvas + [(line[:i], color)]))
    # Always finish with the full line — range() alone can stop short.
    frames.append(render(canvas + [(line, color)]))
    canvas.append((line, color))
    if line.startswith(("12 VERIFIED", "14 VERIFIED", "exit:")):
        hold(8)

hold(14)

frames[0].save(
    "demo/claimtrace-demo.gif",
    save_all=True,
    append_images=frames[1:],
    duration=DURATION_MS,
    loop=0,
)
print(f"frames={len(frames)} size={os.path.getsize('demo/claimtrace-demo.gif')} duration~{len(frames)*DURATION_MS/1000:.1f}s")
