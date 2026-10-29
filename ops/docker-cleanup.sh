#!/bin/sh
# Weekly: stop docker's build cache and old images from filling the disk (the cache alone reached 15 GB on LP-Group).
# Keeps the 6 GB of build cache used most recently (so the next build is still fast), and removes images that no container
# uses and that are over a week old. Running containers, their images and volumes are never touched.
set -eu
echo "before: $(df -h / | tail -1 | awk '{print $3 " used of " $2 " (" $5 ")"}')"
docker builder prune --force --keep-storage 6GB >/dev/null
docker image prune --all --force --filter "until=168h" >/dev/null
journalctl --vacuum-size=200M >/dev/null 2>&1 || true
echo "after:  $(df -h / | tail -1 | awk '{print $3 " used of " $2 " (" $5 ")"}')"
