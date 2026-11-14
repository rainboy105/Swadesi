#!/usr/bin/env bash
# One-time ACCOUNT provisioning for Swadesi, run from the laptop with an admin profile.
# Creates: deploy S3 bucket, EC2 instance role (SSM + read deploy bucket), security group
# (80/443), a t3.small on Amazon Linux 2023, an Elastic IP, and a scoped CI user.
# Mirrors the Chhaon setup. Idempotent-ish: safe to re-run pieces by hand if one step fails.
set -euo pipefail

PROFILE="${AWS_PROFILE_NAME:-swadesi}"
REGION="${AWS_REGION:-ap-south-1}"
NAME=swadesi
ACCOUNT_ID=$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text)
BUCKET="${NAME}-deploys-${ACCOUNT_ID}"

echo "Account $ACCOUNT_ID, region $REGION, bucket $BUCKET"

# --- S3 deploy bucket ---
aws s3api create-bucket --profile "$PROFILE" --region "$REGION" --bucket "$BUCKET" \
  $( [ "$REGION" != "us-east-1" ] && echo --create-bucket-configuration LocationConstraint="$REGION" )
aws s3api put-public-access-block --profile "$PROFILE" --bucket "$BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# --- Instance role: SSM + read the deploy bucket ---
aws iam create-role --profile "$PROFILE" --role-name ${NAME}-ec2-role \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --profile "$PROFILE" --role-name ${NAME}-ec2-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam put-role-policy --profile "$PROFILE" --role-name ${NAME}-ec2-role --policy-name s3-deploy-read \
  --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\"],\"Resource\":\"arn:aws:s3:::${BUCKET}/*\"}]}"
aws iam create-instance-profile --profile "$PROFILE" --instance-profile-name ${NAME}-ec2-profile
aws iam add-role-to-instance-profile --profile "$PROFILE" --instance-profile-name ${NAME}-ec2-profile --role-name ${NAME}-ec2-role
sleep 10  # IAM propagation

# --- Security group: inbound 80 + 443 only (SSM needs no inbound SSH) ---
VPC=$(aws ec2 describe-vpcs --profile "$PROFILE" --region "$REGION" --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
SG=$(aws ec2 create-security-group --profile "$PROFILE" --region "$REGION" \
  --group-name ${NAME}-web --description "Swadesi web (80/443)" --vpc-id "$VPC" --query GroupId --output text)
aws ec2 authorize-security-group-ingress --profile "$PROFILE" --region "$REGION" --group-id "$SG" --protocol tcp --port 80  --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --profile "$PROFILE" --region "$REGION" --group-id "$SG" --protocol tcp --port 443 --cidr 0.0.0.0/0

# --- Instance: t3.small, Amazon Linux 2023, 16 GB gp3 ---
AMI=$(aws ssm get-parameter --profile "$PROFILE" --region "$REGION" \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 --query Parameter.Value --output text)
INSTANCE=$(aws ec2 run-instances --profile "$PROFILE" --region "$REGION" \
  --image-id "$AMI" --instance-type t3.small --security-group-ids "$SG" \
  --iam-instance-profile Name=${NAME}-ec2-profile \
  --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":16,"VolumeType":"gp3"}}]' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${NAME}-backend}]" \
  --query 'Instances[0].InstanceId' --output text)
echo "Instance: $INSTANCE — waiting for running state"
aws ec2 wait instance-running --profile "$PROFILE" --region "$REGION" --instance-ids "$INSTANCE"

# --- Elastic IP (stable across stop/start) ---
EIP_ALLOC=$(aws ec2 allocate-address --profile "$PROFILE" --region "$REGION" --domain vpc --query AllocationId --output text)
aws ec2 associate-address --profile "$PROFILE" --region "$REGION" --instance-id "$INSTANCE" --allocation-id "$EIP_ALLOC"
EIP=$(aws ec2 describe-addresses --profile "$PROFILE" --region "$REGION" --allocation-ids "$EIP_ALLOC" --query 'Addresses[0].PublicIp' --output text)

# --- Scoped CI user (its access key becomes the GitHub AWS_* secrets) ---
aws iam create-user --profile "$PROFILE" --user-name ${NAME}-ci
aws iam put-user-policy --profile "$PROFILE" --user-name ${NAME}-ci --policy-name ci-deploy --policy-document "{
  \"Version\":\"2012-10-17\",
  \"Statement\":[
    {\"Effect\":\"Allow\",\"Action\":[\"s3:PutObject\"],\"Resource\":\"arn:aws:s3:::${BUCKET}/*\"},
    {\"Effect\":\"Allow\",\"Action\":[\"ssm:SendCommand\"],\"Resource\":[
      \"arn:aws:ec2:${REGION}:${ACCOUNT_ID}:instance/${INSTANCE}\",
      \"arn:aws:ssm:${REGION}::document/AWS-RunShellScript\"]},
    {\"Effect\":\"Allow\",\"Action\":[\"ssm:GetCommandInvocation\"],\"Resource\":\"*\"}
  ]}"
echo "CI access key (store as GitHub secrets, then forget):"
aws iam create-access-key --profile "$PROFILE" --user-name ${NAME}-ci \
  --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text

cat <<DONE

== Provisioned ==
Region:        $REGION
Instance:      $INSTANCE (t3.small)
Elastic IP:    $EIP
S3 bucket:     $BUCKET
Security grp:  $SG

Next steps:
1. Wait ~2 min for SSM agent, then run on-box provisioning via SSM (installs JRE/nginx/systemd):
   see INFRA.md "On-box provisioning".
2. Set GitHub secrets: AWS_ACCESS_KEY_ID/SECRET (the ci user key above), S3_BUCKET=$BUCKET,
   S3_JAR_KEY=swadesi-backend.jar, EC2_INSTANCE_ID=$INSTANCE, SPRING_DATASOURCE_* (Supabase
   POOLER url — the box is IPv4-only), APP_JWT_SECRET, HEALTH_CHECK_URL=http://$EIP/actuator/health
3. Push to main (or run the Backend Deploy workflow) — it builds, uploads, swaps, health-checks.
DONE
