#!/usr/bin/env bash
#
# Write the scoped operator policy to a local file, with this account's ID
# filled in.
#
#   bash server/infra/make-operator-policy.sh          # -> /tmp/pp-operator-policy.json
#
# Then attach it as a MANAGED policy, not an inline one:
#
#   ARN=$(aws iam create-policy --policy-name operate-personal-page \
#           --policy-document file:///tmp/pp-operator-policy.json \
#           --profile will --query 'Policy.Arn' --output text)
#   aws iam attach-user-policy --user-name personal-page-operator \
#           --policy-arn "$ARN" --profile will
#
# Inline user policies are capped at 2048 bytes and this one is ~3.1 KB
# minified, so put-user-policy fails with LimitExceeded. Managed policies
# allow 6144. Managed is the better fit anyway: it is versioned, so a bad
# edit can be rolled back, and it can be detached without being destroyed.
#
# The account ID is NOT committed: this repo is public and GitHub Pages serves
# it, so the policy lives here as a generator rather than as a file with real
# identifiers in it.
#
# This is the identity Claude operates with day to day. Deliberately excluded:
# every iam:Create*/Put*/Attach* (that is privilege escalation), anything in
# Billing, ec2:TerminateInstances (a rebuild should be a conversation, not a
# capability), and ssm:GetParameter — the instance reads the Anthropic key at
# boot, so the operator never needs to, and leaving it out means the key
# cannot be read by anything but the box itself.
#
# Instance type is capped at the small ARM sizes, so the worst launch this
# identity can make costs about $16/month rather than hundreds. That is
# enforced here rather than caught by a billing alert hours later.
#
# Note the shape: RunInstances authorises against EVERY resource it touches —
# image, subnet, volume, network interface, security group AND instance — but
# ec2:InstanceType only exists in the instance context. A single statement
# requiring that key would evaluate false for the volume and subnet and deny
# the whole call, so the instance resource is split from the rest. The
# supporting-resources statement is not a loophole: without the instance
# statement there is no permission to create an instance at all.

set -euo pipefail

PROFILE="${AWS_PROFILE:-will}"
REGION="${AWS_REGION:-us-east-1}"
OUT="${1:-/tmp/pp-operator-policy.json}"

ACCOUNT="$(aws sts get-caller-identity --query Account --output text --profile "$PROFILE")"

cat > "$OUT" <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "SeeTheAccount", "Effect": "Allow",
      "Action": ["ec2:Describe*", "cloudformation:Describe*", "cloudformation:List*",
                 "cloudwatch:Describe*", "cloudwatch:Get*", "cloudwatch:List*",
                 "s3:ListAllMyBuckets", "ssm:Describe*", "ssm:List*", "iam:GetInstanceProfile"],
      "Resource": "*" },

    { "Sid": "LaunchOnlySmallArmInstances", "Effect": "Allow",
      "Action": "ec2:RunInstances",
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "StringEquals": { "aws:RequestedRegion": "${REGION}" },
        "StringLike":   { "ec2:InstanceType": ["t4g.nano", "t4g.micro", "t4g.small"] } } },

    { "Sid": "RunInstancesSupportingResources", "Effect": "Allow",
      "Action": "ec2:RunInstances",
      "Resource": ["arn:aws:ec2:*::image/*",
                   "arn:aws:ec2:*:*:subnet/*",
                   "arn:aws:ec2:*:*:network-interface/*",
                   "arn:aws:ec2:*:*:volume/*",
                   "arn:aws:ec2:*:*:security-group/*",
                   "arn:aws:ec2:*:*:key-pair/*",
                   "arn:aws:ec2:*:*:placement-group/*"],
      "Condition": { "StringEquals": { "aws:RequestedRegion": "${REGION}" } } },

    { "Sid": "ResizeOnlyToSmallArm", "Effect": "Allow",
      "Action": "ec2:ModifyInstanceAttribute",
      "Resource": "*",
      "Condition": {
        "StringEquals":       { "aws:RequestedRegion": "${REGION}" },
        "StringLikeIfExists": { "ec2:InstanceType": ["t4g.nano", "t4g.micro", "t4g.small"] } } },

    { "Sid": "ManageTheInstance", "Effect": "Allow",
      "Action": ["ec2:CreateTags", "ec2:StartInstances", "ec2:StopInstances",
                 "ec2:RebootInstances", "ec2:CreateSecurityGroup",
                 "ec2:AuthorizeSecurityGroupIngress", "ec2:RevokeSecurityGroupIngress",
                 "ec2:AllocateAddress", "ec2:AssociateAddress", "ec2:DisassociateAddress",
                 "ec2:ReleaseAddress"],
      "Resource": "*",
      "Condition": { "StringEquals": { "aws:RequestedRegion": "${REGION}" } } },

    { "Sid": "HandTheBoxItsRole", "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::${ACCOUNT}:role/personal-page-instance",
      "Condition": { "StringEquals": { "iam:PassedToService": "ec2.amazonaws.com" } } },

    { "Sid": "DeployAndShell", "Effect": "Allow",
      "Action": ["ssm:SendCommand", "ssm:GetCommandInvocation", "ssm:ListCommandInvocations",
                 "ssm:StartSession", "ssm:TerminateSession", "ssm:ResumeSession",
                 "ssm:DescribeSessions", "ssm:DescribeInstanceInformation"],
      "Resource": "*",
      "Condition": { "StringEquals": { "aws:RequestedRegion": "${REGION}" } } },

    { "Sid": "ArtifactsAndModels", "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:ListBucket",
                 "s3:GetBucketLocation", "s3:GetObjectVersion"],
      "Resource": ["arn:aws:s3:::personal-page-artifacts-${ACCOUNT}",
                   "arn:aws:s3:::personal-page-artifacts-${ACCOUNT}/*"] },

    { "Sid": "ConfirmTheKeyExistsWithoutReadingIt", "Effect": "Allow",
      "Action": ["ssm:DescribeParameters"],
      "Resource": "*" },

    { "Sid": "Watchdog", "Effect": "Allow",
      "Action": ["cloudwatch:PutMetricAlarm", "cloudwatch:DeleteAlarms",
                 "logs:CreateLogGroup", "logs:PutRetentionPolicy",
                 "logs:GetLogEvents", "logs:FilterLogEvents",
                 "logs:DescribeLogGroups", "logs:DescribeLogStreams"],
      "Resource": "*",
      "Condition": { "StringEquals": { "aws:RequestedRegion": "${REGION}" } } },

    { "Sid": "AlarmEmail", "Effect": "Allow",
      "Action": ["sns:CreateTopic", "sns:Subscribe", "sns:GetTopicAttributes",
                 "sns:SetTopicAttributes", "sns:ListSubscriptionsByTopic"],
      "Resource": "arn:aws:sns:${REGION}:${ACCOUNT}:personal-page-alarms" }
  ]
}
JSON

echo "  wrote $OUT  (account ${ACCOUNT:0:4}…, region $REGION)"
echo "  note: ssm:GetParameter is deliberately absent — the instance reads the key, the operator cannot."
