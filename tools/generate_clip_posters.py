#!/usr/bin/env python3
"""
Generate one JPEG poster per clip preview (CP2c).

Reads the 480p preview mp4s from --previews-dir and writes `<clip_id>.jpg` into
--posters-dir. The studio server serves those bytes from
`GET /api/library/clips/:id/poster.jpg` (see server/clipLibrary.ts), so the clip
grid can paint a real still frame per tile without fetching any video.

Frame choice
------------
Clips frequently open on a black or fading lead-in frame, so a naive frame-0
grab produces a wall of black tiles. We seek to `min(1.0s, duration * 0.1)`,
then measure the luma standard deviation of the extracted still. If it is
near-uniform (below --flat-threshold) we retry at `duration * 0.35` and keep
the retry frame. The count of retries is reported.

The uniformity check decodes the produced JPEG down to a 32x32 gray raw frame
through ffmpeg and computes the stddev in pure Python — no Pillow/numpy, so
this runs in any bare python+ffmpeg image.

Safety / operability
--------------------
* PID lock file in the output directory — a second concurrent run refuses to
  start rather than racing on the same temp files.
* Per-clip exception isolation: one bad mp4 can never kill the pool. Failures
  are counted and the first few are printed.
* Idempotent + resumable: a clip whose jpg already exists, is non-empty, and is
  not older than its mp4 is skipped. Safe to re-run exactly like the CP1
  importer.
* Atomic writes: encode to `<id>.jpg.tmp`, then os.replace().

Usage
-----
    python3 tools/generate_clip_posters.py \
        --previews-dir /data/clip-previews \
        --posters-dir  /data/clip-posters \
        --workers 6

    --force      regenerate even if an up-to-date jpg exists
    --limit N    only process the first N clips (smoke test)
    --dry-run    report what would be done, write nothing
"""

from __future__ import annotations

import argparse
import math
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

FFMPEG = os.environ.get("FFMPEG_BIN", "ffmpeg")
FFPROBE = os.environ.get("FFPROBE_BIN", "ffprobe")

# Tiles render ~320-400 px wide; 480 covers 2x DPR on mobile.
POSTER_WIDTH = 480
JPEG_QUALITY = "4"  # -q:v 4 → ~15-30 KB at this width

# Luma stddev below this is "effectively a flat frame" (black lead-in, white
# flash, hard cut to a title card). 8/255 is generous enough that a dim but
# real frame survives, tight enough that a true black frame does not.
FLAT_THRESHOLD = 8.0

PROBE_SIZE = 32  # 32x32 gray sample used for the uniformity test


# ─────────────────────────────────────────────────────────────────────────────
# Lock
# ─────────────────────────────────────────────────────────────────────────────
class PidLock:
    """Directory-scoped PID lock. Reclaims the lock if the holder is gone."""

    def __init__(self, path: str) -> None:
        self.path = path
        self.acquired = False

    def __enter__(self) -> "PidLock":
        if os.path.exists(self.path):
            try:
                with open(self.path, "r", encoding="utf-8") as fh:
                    holder = int(fh.read().strip() or "0")
            except (ValueError, OSError):
                holder = 0
            if holder and _pid_alive(holder):
                raise SystemExit(
                    f"[posters] another run holds {self.path} (pid {holder}); refusing to start"
                )
            print(f"[posters] reclaiming stale lock from pid {holder}")
        with open(self.path, "w", encoding="utf-8") as fh:
            fh.write(str(os.getpid()))
        self.acquired = True
        return self

    def __exit__(self, *_exc: object) -> None:
        if self.acquired:
            try:
                os.unlink(self.path)
            except OSError:
                pass


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False
    return True


# ─────────────────────────────────────────────────────────────────────────────
# ffmpeg helpers
# ─────────────────────────────────────────────────────────────────────────────
def _run(cmd: list[str], timeout: int = 60) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout
    )


def probe_duration(mp4: str) -> float | None:
    res = _run(
        [
            FFPROBE, "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=nw=1:nk=1",
            mp4,
        ],
        timeout=30,
    )
    if res.returncode != 0:
        return None
    try:
        d = float(res.stdout.decode("ascii", "ignore").strip())
    except ValueError:
        return None
    return d if math.isfinite(d) and d > 0 else None


def has_video_stream(mp4: str) -> bool:
    """A truncated/audio-only preview has no frame to extract — say so clearly
    rather than letting ffmpeg fail with 'Output file does not contain any
    stream', which reads like a poster bug when it is a corrupt source file."""
    res = _run(
        [
            FFPROBE, "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=codec_type",
            "-of", "default=nw=1:nk=1",
            mp4,
        ],
        timeout=30,
    )
    return res.returncode == 0 and b"video" in res.stdout


def extract_frame(mp4: str, at: float, dest_tmp: str) -> None:
    """Encode a single JPEG at `at` seconds. Raises on ffmpeg failure."""
    res = _run(
        [
            FFMPEG, "-hide_banner", "-loglevel", "error", "-nostdin",
            "-ss", f"{at:.3f}",
            "-i", mp4,
            "-frames:v", "1",
            "-vf", f"scale={POSTER_WIDTH}:-2",
            "-q:v", JPEG_QUALITY,
            "-f", "image2", "-y", dest_tmp,
        ],
        timeout=90,
    )
    if res.returncode != 0 or not os.path.exists(dest_tmp) or os.path.getsize(dest_tmp) == 0:
        raise RuntimeError(
            f"ffmpeg failed at t={at:.2f}: {res.stderr.decode('utf-8', 'ignore').strip()[:200]}"
        )


def luma_stddev(jpg: str) -> float:
    """Std-dev of a 32x32 gray downsample of `jpg`, in 0..255 units."""
    res = _run(
        [
            FFMPEG, "-hide_banner", "-loglevel", "error", "-nostdin",
            "-i", jpg,
            "-vf", f"scale={PROBE_SIZE}:{PROBE_SIZE},format=gray",
            "-f", "rawvideo", "-",
        ],
        timeout=30,
    )
    data = res.stdout
    if res.returncode != 0 or not data:
        # Can't measure → assume it is fine rather than burning a retry.
        return FLAT_THRESHOLD + 1.0
    n = len(data)
    mean = sum(data) / n
    var = sum((b - mean) ** 2 for b in data) / n
    return math.sqrt(var)


# ─────────────────────────────────────────────────────────────────────────────
# Per-clip work
# ─────────────────────────────────────────────────────────────────────────────
@dataclass
class Outcome:
    clip_id: str
    status: str  # "generated" | "skipped" | "failed"
    retried: bool = False
    size: int = 0
    error: str = ""


def make_poster(
    clip_id: str, mp4: str, posters_dir: str, force: bool, flat_threshold: float
) -> Outcome:
    dest = os.path.join(posters_dir, f"{clip_id}.jpg")

    if not force:
        try:
            jst = os.stat(dest)
            if jst.st_size > 0 and jst.st_mtime >= os.stat(mp4).st_mtime:
                return Outcome(clip_id, "skipped", size=jst.st_size)
        except FileNotFoundError:
            pass

    tmp = f"{dest}.tmp"
    try:
        if not has_video_stream(mp4):
            raise RuntimeError("source preview has no video stream (corrupt/audio-only mp4)")
        duration = probe_duration(mp4)
        first_at = min(1.0, duration * 0.1) if duration else 0.0

        extract_frame(mp4, first_at, tmp)
        retried = False

        if duration and duration > 0.5 and luma_stddev(tmp) < flat_threshold:
            # Near-uniform lead-in frame — try further into the clip.
            retry_at = min(duration * 0.35, max(0.0, duration - 0.1))
            try:
                extract_frame(mp4, retry_at, tmp)
                retried = True
            except Exception:
                # Retry failed → keep the first (flat but valid) frame.
                extract_frame(mp4, first_at, tmp)

        size = os.path.getsize(tmp)
        if size == 0:
            raise RuntimeError("encoded poster is zero bytes")
        os.replace(tmp, dest)
        return Outcome(clip_id, "generated", retried=retried, size=size)
    except Exception as exc:  # noqa: BLE001 — per-clip isolation is the point
        try:
            if os.path.exists(tmp):
                os.unlink(tmp)
        except OSError:
            pass
        return Outcome(clip_id, "failed", error=f"{type(exc).__name__}: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description="Generate clip poster JPEGs")
    ap.add_argument("--previews-dir", default=os.environ.get("CLIP_PREVIEWS_DIR", "data/clip-previews"))
    ap.add_argument("--posters-dir", default=os.environ.get("CLIP_POSTERS_DIR", "data/clip-posters"))
    ap.add_argument("--workers", type=int, default=min(6, (os.cpu_count() or 4)))
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--flat-threshold", type=float, default=FLAT_THRESHOLD)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    previews_dir = os.path.abspath(args.previews_dir)
    posters_dir = os.path.abspath(args.posters_dir)

    if not os.path.isdir(previews_dir):
        print(f"[posters] previews dir not found: {previews_dir}", file=sys.stderr)
        return 2

    for binary in (FFMPEG, FFPROBE):
        if _run([binary, "-version"], timeout=20).returncode != 0:
            print(f"[posters] {binary} is not usable", file=sys.stderr)
            return 2

    clips = sorted(f[:-4] for f in os.listdir(previews_dir) if f.endswith(".mp4"))
    if args.limit:
        clips = clips[: args.limit]

    print(f"[posters] previews={previews_dir}")
    print(f"[posters] posters ={posters_dir}")
    print(f"[posters] {len(clips)} mp4s, workers={args.workers}, force={args.force}")

    if args.dry_run:
        print("[posters] dry run — nothing written")
        return 0

    os.makedirs(posters_dir, exist_ok=True)

    generated = skipped = failed = retried = 0
    total_bytes = 0
    errors: list[str] = []
    started = time.time()

    with PidLock(os.path.join(posters_dir, ".generate_clip_posters.pid")):
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = {
                pool.submit(
                    make_poster,
                    cid,
                    os.path.join(previews_dir, f"{cid}.mp4"),
                    posters_dir,
                    args.force,
                    args.flat_threshold,
                ): cid
                for cid in clips
            }
            done = 0
            for fut in as_completed(futures):
                done += 1
                try:
                    out = fut.result()
                except Exception as exc:  # noqa: BLE001 — must never abort the pool
                    failed += 1
                    errors.append(f"{futures[fut]}: pool error {exc}")
                    continue
                if out.status == "generated":
                    generated += 1
                    total_bytes += out.size
                    if out.retried:
                        retried += 1
                elif out.status == "skipped":
                    skipped += 1
                    total_bytes += out.size
                else:
                    failed += 1
                    if len(errors) < 20:
                        errors.append(f"{out.clip_id}: {out.error}")
                if done % 250 == 0:
                    print(f"[posters] {done}/{len(clips)} …", flush=True)

    elapsed = time.time() - started
    print("─" * 60)
    print(f"[posters] generated : {generated}  (black-frame retry: {retried})")
    print(f"[posters] skipped   : {skipped}")
    print(f"[posters] failed    : {failed}")
    print(f"[posters] wall time : {elapsed:.1f}s")
    print(f"[posters] on disk   : {total_bytes} bytes ({total_bytes / 1048576:.1f} MiB)")
    if generated + skipped:
        print(f"[posters] avg size  : {total_bytes // (generated + skipped)} bytes")
    for line in errors:
        print(f"[posters] ERROR {line}", file=sys.stderr)

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
