#!/usr/bin/env bash

set -u

pkill -f -- "--user-data-dir=$HOME/.config/chromium-inch-park-score" 2>/dev/null || true
pkill -f -- "--user-data-dir=$HOME/.config/chromium-inch-park-overs" 2>/dev/null || true

