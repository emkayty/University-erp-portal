#!/bin/bash
# UniPortal ERP — EC2 app-tier bootstrap (spec §19.1)
# Environment: ${environment}
set -euxo pipefail

apt-get update -y
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs git awscli amazon-cloudwatch-agent

npm install -g pnpm@9 pm2

# CodeDeploy agent — required for the blue/green deployment group
apt-get install -y ruby-full wget
cd /tmp && wget https://aws-codedeploy-us-east-1.s3.us-east-1.amazonaws.com/latest/install
chmod +x ./install && ./install auto

mkdir -p /opt/uniportal
chown ubuntu:ubuntu /opt/uniportal

# App configuration is pulled from Secrets Manager at deploy time by the
# CodeDeploy ApplicationStart hook (scripts/deploy/fetch-secrets.sh, run as
# part of the CI/CD deploy job) — NOT baked into this AMI/user-data, per
# spec §7.5 ("NEVER static keys in code").

# CloudWatch agent — ships app + system logs per spec §17.2 alarms
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << 'CWCONFIG'
{
  "agent": { "metrics_collection_interval": 60 },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          { "file_path": "/opt/uniportal/logs/app.log", "log_group_name": "/uniportal/${environment}/app", "log_stream_name": "{instance_id}" }
        ]
      }
    }
  },
  "metrics": {
    "metrics_collected": {
      "disk": { "measurement": ["used_percent"], "resources": ["/"] },
      "mem":  { "measurement": ["mem_used_percent"] }
    }
  }
}
CWCONFIG
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s
