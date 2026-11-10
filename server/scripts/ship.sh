#!/usr/bin/env bash
# Deploy the personal-page API from this Mac, step for step what the GitHub
# workflow does (.github/workflows/deploy.yml). GitHub Actions stays the
# backup; this spends none of its minutes.
#
#   server/scripts/ship.sh                 build, upload, roll out, verify
#   server/scripts/ship.sh --check         every precondition, then stop
#   server/scripts/ship.sh --skip-health   roll out without waiting on DNS/TLS
#
#   AWS_PROFILE=pp         the identity to deploy with (default: pp)
#   LLMS_READ_TOKEN=...    read access to the private llms repo
#                          (default: `gh auth token`)
#
# What it does, in order. Any failure stops it, nothing half-done:
#   1. git:    working tree clean, and this commit is exactly origin/main —
#              so what ships is what is on GitHub, not what is on this Mac
#   2. corpus: npm run verify, because section ranges are byte offsets and a
#              corpus out of sync with its vectors returns misaligned text
#              rather than an error
#   3. build:  node_modules inside a linux/arm64 container
#   4. ship:   tarball to S3, SSM swaps a symlink and restarts, health check
#
# Why a container and not just `npm ci` here
# ------------------------------------------
# This Mac is darwin-arm64; the box is linux-arm64. onnxruntime-node (92 MB),
# sharp and @napi-rs ship per-platform binaries, so a node_modules built here
# installs Darwin binaries that fail at require() on the instance — after the
# deploy has reported success. linux/arm64 runs natively on Apple Silicon, so
# this costs no emulation.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # server/
REPO="$(cd "$HERE/.." && pwd)"
PROFILE="${AWS_PROFILE:-pp}"
REGION="${AWS_REGION:-us-east-1}"
NODE_IMAGE="node:24"
ONLY_CHECK=0
SKIP_HEALTH=0
WORK=""

for a in "$@"; do
  case "$a" in
    --check)        ONLY_CHECK=1 ;;
    --skip-health)  SKIP_HEALTH=1 ;;
    *) echo "Usage: server/scripts/ship.sh [--check] [--skip-health]"; exit 1 ;;
  esac
done

fail() { printf '\nSTOPPED: %s\n' "$*" >&2; exit 1; }
step() { printf '\n── %s\n' "$*"; }
cleanup() { [[ -n "$WORK" ]] && rm -rf "$WORK"; return 0; }
trap cleanup EXIT
trap 'exit 130' INT TERM

# ── 1. Preconditions ─────────────────────────────────────────────────────
step "checks"

command -v docker >/dev/null || fail "Docker isn't installed. It is how node_modules gets built for linux/arm64."
docker info >/dev/null 2>&1 || fail "Docker isn't running: start Docker Desktop (or 'colima start')."
command -v aws >/dev/null    || fail "The AWS CLI isn't installed."

aws sts get-caller-identity --profile "$PROFILE" >/dev/null 2>&1 \
  || fail "AWS profile '$PROFILE' doesn't work. Try: aws sts get-caller-identity --profile $PROFILE"

LLMS_READ_TOKEN="${LLMS_READ_TOKEN:-$(gh auth token 2>/dev/null || true)}"
[[ -n "$LLMS_READ_TOKEN" ]] \
  || fail "No LLMS_READ_TOKEN and 'gh auth token' gave nothing. llms is private; the build cannot install it without read access."
curl -sfS -H "Authorization: Bearer $LLMS_READ_TOKEN" \
  https://api.github.com/repos/williambrendel/llms >/dev/null 2>&1 \
  || fail "That token cannot read williambrendel/llms. Checked against the API, so this is the token, not git."

git -C "$REPO" diff --quiet && git -C "$REPO" diff --cached --quiet \
  || fail "Working tree isn't clean. What ships should be a commit, not a desk state."

git -C "$REPO" fetch -q origin main
SHA="$(git -C "$REPO" rev-parse HEAD)"
[[ "$SHA" == "$(git -C "$REPO" rev-parse origin/main)" ]] \
  || fail "This commit isn't origin/main. Push it, or check out main and pull — the box should run what GitHub has."

INSTANCE="$(aws ec2 describe-instances --profile "$PROFILE" --region "$REGION" \
  --filters "Name=tag:App,Values=personal-page" "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].InstanceId' --output text)"
[[ -n "$INSTANCE" ]] || fail "No running instance tagged App=personal-page."

BUCKET="personal-page-artifacts-$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text)"

echo "  commit    ${SHA:0:7}"
echo "  instance  $INSTANCE"
echo "  bucket    $BUCKET"
echo "  identity  $(aws sts get-caller-identity --profile "$PROFILE" --query Arn --output text)"

# ── 2. The corpus matches its vectors ────────────────────────────────────
step "corpus"
( cd "$HERE" && npm run verify --silent ) || fail "Corpus is out of sync with its vectors. Run: npm --prefix server run ingest"

[[ "$ONLY_CHECK" == 1 ]] && { printf '\nchecks passed; stopping before the build (--check).\n'; exit 0; }

# ── 3. Build for linux/arm64 ─────────────────────────────────────────────
step "build (linux/arm64)"
WORK="$(mktemp -d)"
git -C "$REPO" archive --format=tar "$SHA" | tar -x -C "$WORK"
[[ -d "$WORK/server" ]] || fail "The archive has no server/ — wrong commit?"

docker run --rm --platform linux/arm64 \
  -v "$WORK/server:/app" -w /app \
  -e LLMS_READ_TOKEN="$LLMS_READ_TOKEN" \
  "$NODE_IMAGE" \
  bash -c '
    set -euo pipefail
    git config --global url."https://x-access-token:${LLMS_READ_TOKEN}@github.com/williambrendel/".insteadOf "ssh://git@github.com/williambrendel/"
    git config --global --add url."https://x-access-token:${LLMS_READ_TOKEN}@github.com/williambrendel/".insteadOf "git@github.com:williambrendel/"
    npm ci --no-audit --no-fund
  ' || fail "The container build failed."

# Belt and braces: a Darwin binary here means the wrong thing was built and
# it would fail at require() on the box, long after this script said success.
if find "$WORK/server/node_modules" -name '*.darwin-*' -o -name '*darwin*.node' 2>/dev/null | grep -q .; then
  fail "node_modules contains Darwin binaries — the container did not build for linux/arm64."
fi

# ── 4. Ship ──────────────────────────────────────────────────────────────
step "upload"
TARBALL="$WORK/$SHA.tar.gz"
tar --exclude='.env' --exclude='.model_cache' --exclude='node_modules/.cache' \
    -czf "$TARBALL" -C "$WORK" server
echo "  $(du -h "$TARBALL" | cut -f1)  ->  s3://$BUCKET/releases/$SHA.tar.gz"
aws s3 cp "$TARBALL" "s3://$BUCKET/releases/$SHA.tar.gz" \
  --profile "$PROFILE" --region "$REGION" --only-show-errors

step "roll out"
cat > "$WORK/params.json" <<JSON
{"commands":[
  "set -euo pipefail",
  "install -d -o app -g app /opt/personal-page/releases",
  "aws s3 cp s3://$BUCKET/releases/$SHA.tar.gz /tmp/$SHA.tar.gz --only-show-errors --region $REGION",
  "rm -rf /opt/personal-page/releases/$SHA",
  "install -d -o app -g app /opt/personal-page/releases/$SHA",
  "tar -xzf /tmp/$SHA.tar.gz -C /opt/personal-page/releases/$SHA --strip-components=1",
  "ln -sfn /opt/personal-page/.model_cache /opt/personal-page/releases/$SHA/.model_cache",
  "chown -R app:app /opt/personal-page/releases/$SHA",
  "ln -sfn /opt/personal-page/releases/$SHA /opt/personal-page/current",
  "systemctl restart personal-page",
  "rm -f /tmp/$SHA.tar.gz"
]}
JSON

CMD="$(aws ssm send-command --instance-ids "$INSTANCE" --document-name AWS-RunShellScript \
        --comment "ship ${SHA:0:7}" --parameters "file://$WORK/params.json" \
        --timeout-seconds 900 --profile "$PROFILE" --region "$REGION" \
        --query Command.CommandId --output text)"

for _ in $(seq 1 120); do
  STATUS="$(aws ssm get-command-invocation --command-id "$CMD" --instance-id "$INSTANCE" \
             --profile "$PROFILE" --region "$REGION" --query Status --output text 2>/dev/null || echo Pending)"
  case "$STATUS" in
    Success) echo "  rolled out"; break ;;
    Failed|Cancelled|TimedOut)
      aws ssm get-command-invocation --command-id "$CMD" --instance-id "$INSTANCE" \
        --profile "$PROFILE" --region "$REGION" --query StandardErrorContent --output text
      fail "Rollout $STATUS. The previous release is still linked at /opt/personal-page/current." ;;
    *) sleep 5 ;;
  esac
done

# ── 5. Does it actually answer ───────────────────────────────────────────
# systemd accepting a restart is not evidence the service works.
if [[ "$SKIP_HEALTH" == 1 ]]; then
  printf '\nshipped %s (health check skipped)\n' "${SHA:0:7}"; exit 0
fi

step "health"
for _ in $(seq 1 30); do
  if curl -fsS --max-time 10 https://api.william-brendel.com/health 2>/dev/null | grep -q '"ok":true'; then
    printf '\nshipped %s — https://api.william-brendel.com/health is answering\n' "${SHA:0:7}"
    exit 0
  fi
  sleep 5
done
fail "Rolled out, but /health did not answer within 150s. Check: aws ssm start-session --target $INSTANCE --profile $PROFILE"
