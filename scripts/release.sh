#!/bin/bash
# This script builds release packages.
set -euo pipefail

# Build release
bash scripts/build.sh prod

tar -cvzf release.tar.gz release/*
