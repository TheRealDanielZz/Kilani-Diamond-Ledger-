#!/bin/bash
set -euo pipefail

if [ -z "${ELEVENLABS_API_KEY:-}" ]; then
  echo "ELEVENLABS_API_KEY is required."
  exit 1
fi

node ./scripts/generate_demo_audio.mjs
