#!/usr/bin/env bash
#
# Upload the embedding model cache to the artifact bucket, once.
#
#   npm run push-models                 # uses profile "pp", region us-east-1
#   AWS_PROFILE=will npm run push-models
#
# Why this exists
# ---------------
# server/.model_cache is ~125 MB of ONNX weights (bge-small-en-v1.5, and the
# NLI model the classifier no longer loads). It is gitignored, so it is not in
# the repo the deploy builds from — and committing it is not an option: this
# repo is public and GitHub Pages serves everything in it, so the weights
# would be served from william-brendel.com.
#
# Nereus solves the same problem by committing the cache into a private repo
# and baking it into the container image. Here the bucket plays that role: the
# instance pulls it once at provision time, then runs with
# XENOVA_ALLOW_REMOTE_MODELS=false so nothing is fetched at boot. A box that
# downloads models on start is a box that fails to start when Hugging Face is
# having a bad day.
#
# This is deliberately not part of the deploy workflow. The weights change
# only when the model does, which is approximately never, and re-uploading
# 125 MB on every release would be waste.

set -euo pipefail

PROFILE="${AWS_PROFILE:-pp}"
REGION="${AWS_REGION:-us-east-1}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="$HERE/.model_cache"

if [ ! -d "$CACHE" ]; then
  echo "No $CACHE — run the server or 'npm run prewarm' once to populate it." >&2
  exit 1
fi

ACCOUNT="$(aws sts get-caller-identity --query Account --output text --profile "$PROFILE")"
BUCKET="personal-page-artifacts-${ACCOUNT}"
SIZE="$(du -sh "$CACHE" | cut -f1)"

echo "  from   $CACHE  ($SIZE)"
echo "  to     s3://$BUCKET/model-cache/"
echo "  as     $(aws sts get-caller-identity --query Arn --output text --profile "$PROFILE")"
echo

# --size-only: these files are immutable weights. Without it every run
# re-uploads on mtime alone, which is 125 MB of pointless transfer.
aws s3 sync "$CACHE" "s3://$BUCKET/model-cache/" \
  --profile "$PROFILE" --region "$REGION" \
  --size-only --no-progress

echo
echo "  done. The instance pulls this at provision time; see server/DEPLOY.md."
