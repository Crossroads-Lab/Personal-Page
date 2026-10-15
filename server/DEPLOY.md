# Deploying the backend to EC2

> **This file is published on the public internet.** The repo is public and
> GitHub Pages serves it from the root, so this page is readable at
> `https://william-brendel.com/server/DEPLOY.md` — verified: `server/config.js`
> already returns 200 there. Keep real identifiers out of it. `<ACCOUNT_ID>`
> below is a placeholder; the real value lives in your `pp` AWS profile, not
> here. Never paste a key, an account number, an instance id or an IP into
> this file.

The battle plan for putting `server/` on AWS. Modelled on Nereus
(`Nereus/nereus-infra/README.md`) but scaled down hard: Nereus runs ECS
Fargate across two regions for ~$770/month, and this is one small box.

What carries over from Nereus is the *practice*, not the architecture:

| Nereus practice | Here |
|---|---|
| GitHub reaches AWS by OIDC, **no stored AWS keys** | same |
| Deploy role scoped to one repo + one branch | same |
| Identities created **once, by an admin**, separately from deploys | same |
| Secrets out of the repo, read at boot | same, but SSM Parameter Store (free) not Secrets Manager ($0.40/secret/mo) |
| Models committed so nothing downloads at boot | models come from S3 once at provision, then remote fetch is off |
| `/ready` + `/healthcheck` for the load balancer | `/health`, polled by CloudWatch |
| Rolling deploy, auto rollback | restart one systemd unit, roll back by re-running the previous artifact |

---

## 0. Read this first: what it actually costs

Earlier in this project we were working from "$3–5/month". That number is no
longer right, and the reason is worth knowing before you commit:

**Since 1 February 2024 AWS charges for every public IPv4 address**, whether
it is an Elastic IP or not — $0.005/hour, **$3.65/month**, on top of the
instance. That alone eats the old budget.

us-east-1, on-demand, approximate:

| Item | $/month |
|---|---|
| t4g.micro (2 vCPU ARM, 1 GB) | 6.13 |
| t4g.small (2 vCPU ARM, 2 GB) | 12.26 |
| EBS gp3, 8 GB | 0.64 |
| Public IPv4 | 3.65 |
| Data transfer out | ~0 (first 100 GB/month free) |
| **t4g.micro total** | **≈ $10.40** |
| **t4g.small total** | **≈ $16.55** |

Plus Anthropic usage. Measured today: **$0.00118/query**. `guard.js` caps the
world at 600 queries/day, so the absolute worst case is ~$0.71/day; realistic
traffic on a personal page is pennies.

### Decisions already taken, so they are not relitigated

**EC2, not Lightsail.** Lightsail is ~$5/month for the same workload because
the IP and disk are bundled. It was considered and rejected on reliability:
Lightsail does not expose instance auto-recovery or CloudWatch instance
actions, which EC2 does. (Both are one VM in one AZ — the difference is the
operational tooling, not the hardware.) Will's call, 2026-10-15.

**EC2, not Lambda.** Measured, not assumed: a genuinely cold process — node
start, config, Xenova ONNX load, all 28 bins, embed a query, score 3,787
vectors — takes **0.56–0.75 s** on an M-series Mac. On Lambda's slower vCPU
plus container-image init that becomes a realistic **3–6 s** cold start. The
blocker is not the number, it is the frequency: Lambda goes cold after
~5–15 minutes idle, and on a sparse personal page nearly every visitor is
the first visitor, so a cold start would be the normal case rather than the
exception. `guard.js` also keeps its rate-limit counters in memory, which
does not survive multiple concurrent instances.

**No free tier.** The account dates from 2013-10-14, so the 12-month free
tier is long gone and `freetier get-free-tier-usage` reports nothing active.
Every number here is on-demand.

**The public IPv4 charge is unavoidable.** It looks like it could be dodged
by putting the instance in a private subnet behind CloudFront, but the server
must reach the internet *outbound* to call the Anthropic API. That needs
either a public IP ($3.65/month) or a NAT Gateway (~$32/month). The public IP
is the cheap option.

### Getting it below $10

The only real lever left is commitment, and it should wait:

| | $/month |
|---|---|
| on-demand (start here) | 10.42 |
| 1-year Compute Savings Plan, no upfront (~28% off compute) | ≈ 8.70 |
| 3-year (~50% off compute) | ≈ 6.90 |

Run on-demand for a month first. A Savings Plan is a real commitment and the
discount applies to compute only — the IPv4 and the disk are unaffected
either way. Revisit once there is a month of actual usage to size it against.

**Sizing:** measured RSS of the running engine is 134–199 MB with the NLI
classifier disabled (`CLASSIFIER.thresholds` at 0, so DeBERTa never loads).
1 GB is genuinely enough with a swap file. Start at **t4g.micro**; it is one
`modify-instance-attribute` to move to small if memory alarms fire.

---

## 1. Gaps in the code to close before any of this

These are real and I found them while surveying. None are large.

1. **No graceful shutdown.** `app.js` only calls `app.listen`. A deploy
   restart kills in-flight requests. Nereus's container drains on SIGTERM for
   up to 25 s. Needs a `SIGTERM` handler that stops accepting, waits for
   in-flight queries, exits 0.
2. **`ALLOWED_ORIGIN` is `"*"`.** Fine locally, wrong in public. Must become
   `https://william-brendel.com`.
3. **`.model_cache` is gitignored** (125 MB, 0 files tracked). Nereus commits
   theirs so a container boots offline. We will not commit 125 MB to a repo
   that GitHub Pages serves; it goes to S3 instead (step 4).
4. **No CI.** There is no `.github/workflows/` in this repo at all.
5. **`server/` is publicly served.** GitHub Pages publishes from the repo
   root, so everything under `server/` is already readable at
   `https://william-brendel.com/server/...`. That is deliberate and fine for
   the corpus, but it means **no secret may ever land there** — the deploy
   must not write config files into `server/`.

---

## 2. What you do once, by hand (I should not do these)

These create identities. Giving an automated operator the power to create IAM
roles is the same as giving it admin, so — exactly as Nereus does with
`iam/nereus-iam.yml` ("run ONCE, by an admin") — you run these.

### 2a. Pick a region and set it on your profile

Your `will` profile has no region set.

```bash
aws configure set region us-east-1 --profile will
```

us-east-1: cheapest, and your default VPC `your default VPC` is already
there.

### 2b. Turn on a budget alarm before anything can cost money

In the console: **Billing → Budgets → Create budget → Zero spend budget**, or
a $25/month cost budget with alerts at 50/80/100%. Two budgets are free. Do
this first so nothing can surprise you.

### 2c. Store the Anthropic key in SSM Parameter Store

Not in the repo, not in a `.env` on the box. Standard parameters are free.

```bash
aws ssm put-parameter \
  --name /personal-page/anthropic-api-key \
  --type SecureString \
  --value 'sk-ant-...' \
  --profile will
```

Type the value yourself — I will not handle the key.

### 2d. Create a fine-grained GitHub token for the private `llms` dependency

`williambrendel/llms` is **private**, so `npm ci` needs read access. Nereus
solves this with `LLMS_READ_TOKEN` as a BuildKit secret.

GitHub → Settings → Developer settings → **Fine-grained personal access
token**: repository access = `williambrendel/llms` only, permission =
**Contents: Read-only**, expiry 1 year. Then add it to this repo:

```bash
gh secret set LLMS_READ_TOKEN --repo williambrendel/Personal-Page
```

The token is used **only inside the CI runner**, to build `node_modules`.
The EC2 box never sees it.

### 2e. Run the bootstrap stack (I will write it; you run it)

One CloudFormation stack, `personal-page-bootstrap`, creating:

- the **GitHub OIDC provider** (`token.actions.githubusercontent.com`) — your
  account has none yet, so this creates it
- **`personal-page-deploy`** — the role GitHub assumes, trusted *only* for
  `repo:williambrendel/Personal-Page:ref:refs/heads/main`
- **`personal-page-instance`** — the instance profile the box runs as
- the **artifact S3 bucket**, private, versioned, public access blocked

```bash
aws cloudformation deploy \
  --template-file server/infra/bootstrap.yml \
  --stack-name personal-page-bootstrap \
  --capabilities CAPABILITY_NAMED_IAM \
  --profile will
```

---

## 3. The architecture

```
Browser ──► william-brendel.com          GitHub Pages (unchanged)
   │
   └──────► api.william-brendel.com      A record at GoDaddy → Elastic IP
                      │
                      ▼
            ┌───────────────────────────────┐
            │ EC2 t4g.micro, us-east-1      │
            │                               │
            │  Caddy :443  ── TLS, auto     │  Let's Encrypt, auto-renew
            │     │                         │
            │     └─► node app.js :3002     │  systemd unit, restart on fail
            │           ├─ SSM Parameter    │  Anthropic key at boot
            │           └─ /opt/app/.model_cache
            │                               │
            │  SSM Agent  ◄─── deploys      │  no inbound SSH, no .pem
            └───────────────────────────────┘
```

**No load balancer.** An ALB is ~$16/month and would more than double the
bill to terminate TLS for one box. Caddy does it free, with automatic
Let's Encrypt renewal.

**Security group:** inbound 80 and 443 from anywhere, **nothing else**. No
port 22. Shell access is `aws ssm start-session`, which needs the Session
Manager plugin locally (not installed yet):

```bash
brew install --cask session-manager-plugin
```

**DNS stays at GoDaddy.** One A record `api` → the Elastic IP. No Route 53
needed, saves the hosted-zone fee and a migration.

**Reliability — the reason EC2 was chosen, so it must actually be wired up.**
Three layers, all free:

1. **Instance auto-recovery.** Modern Nitro instance types (t4g included)
   recover by default when the *underlying host* fails: the instance restarts
   on healthy hardware keeping its id, private IP and EBS volume. Confirm it
   is on rather than assume it — `aws ec2 describe-instance-attribute
   --attribute disableApiStop` and the instance's maintenance options.
   Because the Elastic IP is associated, it survives the move.
2. **systemd restarts the process.** `Restart=always` with `RestartSec=5` in
   the unit, so a crash or OOM-kill comes back without anyone watching.
3. **CloudWatch alarm on `StatusCheckFailed_Instance`** with an EC2 `recover`
   action, plus email. This covers the case where the instance is up but
   wedged, which auto-recovery alone does not catch.

What none of this covers is an AZ outage — that needs a second instance in
another AZ, which doubles the bill. Out of scope for a personal page; worth
recording so the limit is known rather than discovered.

---

## 4. Steps I can run, once 2a–2e are done

In order, each verifiable before the next.

| # | Step | How it is checked |
|---|---|---|
| 1 | Add SIGTERM drain, lock `ALLOWED_ORIGIN`, add the deploy workflow | local run + the existing suites |
| 2 | Upload `.model_cache` (125 MB) to the artifact bucket, once | `aws s3 ls` shows the objects |
| 3 | Launch the instance: Amazon Linux 2023 arm64, 8 GB gp3, the instance profile, the security group, a 1 GB swap file | `aws ssm start-session` opens a shell |
| 4 | Provision it: Node 24, Caddy, pull the model cache, install the systemd unit | `curl localhost:3002/health` on the box |
| 5 | Allocate + associate the Elastic IP | `aws ec2 describe-addresses` |
| 6 | **You** add the GoDaddy A record `api` → that IP | `dig api.william-brendel.com` |
| 7 | Caddy gets the certificate on first request | `curl https://api.william-brendel.com/health` from outside |
| 8 | Point `scripts/api.js` at the real host and ship the frontend | the live site answers a question |
| 9 | CloudWatch alarm on `StatusCheckFailed_Instance` → EC2 `recover` + your email; confirm auto-recovery is on | force it and see the mail |

Rollback at any point: previous artifacts stay in the versioned bucket, so a
redeploy is one SSM command with the older key.

---

## 5. The deploy workflow, once it exists

Same shape as Nereus's `deploy-containers.yml`, minus the container:

1. `workflow_dispatch`, main only, after the tests pass
2. OIDC into `personal-page-deploy` — no keys anywhere
3. `npm ci --omit=dev` using `LLMS_READ_TOKEN`, tar `server/` + `node_modules`
4. upload to `s3://<bucket>/releases/<sha>.tar.gz`
5. `aws ssm send-command` → the box downloads it, swaps the symlink,
   `systemctl restart personal-page`
6. poll `/health` until it answers, fail the run if it does not

The box needs no GitHub token and no AWS keys: its instance profile lets it
read that one bucket and that one parameter, nothing else.

---

## 6. Permissions I would need to operate this autonomously

**I do not want and should not have `AdministratorAccess`.** Your `William`
user has it; that is the right identity for section 2 and the wrong one for
day-to-day operation.

Create a second profile for me — an IAM user `personal-page-operator` or, better,
a role you let that user assume — with this policy and nothing more.

**Deliberately excluded:** every `iam:Create*`/`iam:Put*`/`iam:Attach*` (that
is privilege escalation), anything in Billing, anything touching your other
accounts, and `ec2:TerminateInstances` (I will ask you to confirm a rebuild
rather than hold the power to delete the box).

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "SeeTheAccount", "Effect": "Allow",
      "Action": ["ec2:Describe*", "cloudformation:Describe*", "cloudformation:List*",
                 "cloudwatch:Describe*", "cloudwatch:Get*", "cloudwatch:List*",
                 "s3:ListAllMyBuckets", "ssm:Describe*", "ssm:List*"],
      "Resource": "*" },

    { "Sid": "RunTheOneInstance", "Effect": "Allow",
      "Action": ["ec2:RunInstances", "ec2:CreateTags", "ec2:StartInstances",
                 "ec2:StopInstances", "ec2:RebootInstances",
                 "ec2:ModifyInstanceAttribute", "ec2:CreateSecurityGroup",
                 "ec2:AuthorizeSecurityGroupIngress", "ec2:RevokeSecurityGroupIngress",
                 "ec2:AllocateAddress", "ec2:AssociateAddress", "ec2:DisassociateAddress"],
      "Resource": "*",
      "Condition": { "StringEquals": { "aws:RequestedRegion": "us-east-1" } } },

    { "Sid": "HandTheBoxItsRole", "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::<ACCOUNT_ID>:role/personal-page-instance",
      "Condition": { "StringEquals": { "iam:PassedToService": "ec2.amazonaws.com" } } },

    { "Sid": "DeployAndShell", "Effect": "Allow",
      "Action": ["ssm:SendCommand", "ssm:GetCommandInvocation",
                 "ssm:StartSession", "ssm:TerminateSession",
                 "ssm:DescribeSessions", "ssm:DescribeInstanceInformation"],
      "Resource": "*",
      "Condition": { "StringEquals": { "aws:RequestedRegion": "us-east-1" } } },

    { "Sid": "ArtifactsAndModels", "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:ListBucket",
                 "s3:GetBucketLocation", "s3:GetObjectVersion"],
      "Resource": ["arn:aws:s3:::personal-page-artifacts-<ACCOUNT_ID>",
                   "arn:aws:s3:::personal-page-artifacts-<ACCOUNT_ID>/*"] },

    { "Sid": "ReadConfigNotSecrets", "Effect": "Allow",
      "Action": ["ssm:GetParameter", "ssm:GetParameters"],
      "Resource": "arn:aws:ssm:us-east-1:<ACCOUNT_ID>:parameter/personal-page/*" },

    { "Sid": "Watchdog", "Effect": "Allow",
      "Action": ["cloudwatch:PutMetricAlarm", "cloudwatch:DeleteAlarms",
                 "logs:CreateLogGroup", "logs:PutRetentionPolicy",
                 "logs:GetLogEvents", "logs:FilterLogEvents",
                 "logs:DescribeLogGroups", "logs:DescribeLogStreams"],
      "Resource": "*",
      "Condition": { "StringEquals": { "aws:RequestedRegion": "us-east-1" } } }
  ]
}
```

Two notes on that policy:

- **`ssm:GetParameter` on `/personal-page/*` does include the Anthropic key.**
  If you would rather I never be able to read it, drop that statement — the
  instance profile reads it at boot, and I never need to. I have kept it only
  so I can verify the parameter *exists*; `ssm:DescribeParameters` under
  "SeeTheAccount" already does that without exposing values, so **dropping it
  costs nothing.** My recommendation is to drop it.
- `ec2:RunInstances` with `RequestedRegion` is still broad enough to launch an
  expensive instance. If you want that tightened, add a condition on
  `ec2:InstanceType`. Your budget alarm from 2b is the backstop either way.

Then:

```bash
aws configure --profile pp        # the new access key, region us-east-1
```

and every AWS command I run names `--profile pp` explicitly, so it is visible
in the transcript which identity did what, and nothing I do can touch the
`nereus` or `heali` profiles.

---

## 7. Order of play

1. You: 2a–2d (region, budget, key, GitHub token) — 15 minutes
2. Me: write `server/infra/bootstrap.yml`, the SIGTERM fix, the CORS lock, the workflow
3. You: run the bootstrap stack, create the `pp` profile
4. Me: steps 4.1–4.5, stopping at the DNS record
5. You: the GoDaddy A record
6. Me: steps 4.7–4.9, then a live end-to-end check
7. Both: watch the budget for a week before calling it done
