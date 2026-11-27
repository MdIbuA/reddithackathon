# Trailer renderer

Renders the 60s pitch video from the **real built client** with a scripted demo room
(clearly labeled "demo data" on screen), plus an original synthesized score.

```bash
npm run build                                  # from repo root
node tools/trailer/server.cjs &                # demo server on :5190
node tools/trailer/record.cjs /tmp/trailer     # needs Playwright + Chromium
# then: assemble frames (see concat step in commit history), and
python3 tools/trailer/audio.py /tmp/trailer <duration>   # needs numpy
```

Output: 1920x1080, 30fps H.264 + AAC. Requires ffmpeg.
