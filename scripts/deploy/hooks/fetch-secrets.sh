#!/bin/bash
# Pulls this environment's secrets from AWS Secrets Manager (spec §7.5) into
# a .env.production file BeforeInstall — never baked into the AMI, never
# committed to the repo.
set -euo pipefail
ENV="${DEPLOY_ENV:-production}"

DB_SECRET=$(aws secretsmanager get-secret-value --secret-id "/uniportal/${ENV}/db/credentials" --query SecretString --output text)
JWT_SECRET=$(aws secretsmanager get-secret-value --secret-id "/uniportal/${ENV}/jwt/keypair" --query SecretString --output text)
ENC_SECRET=$(aws secretsmanager get-secret-value --secret-id "/uniportal/${ENV}/security/encryption-key" --query SecretString --output text)
PAY_SECRET=$(aws secretsmanager get-secret-value --secret-id "/uniportal/${ENV}/payments/gateways" --query SecretString --output text)

mkdir -p /opt/uniportal
{
  echo "DATABASE_URL=$(echo "$DB_SECRET" | jq -r .databaseUrl)"
  echo "DATABASE_DIRECT_URL=$(echo "$DB_SECRET" | jq -er .directUrl)"
  echo "MIGRATE_DATABASE_URL=$(echo "$DB_SECRET" | jq -er .migrateDatabaseUrl)"
  echo "PRISMA_REPORTING_URL=$(echo "$DB_SECRET" | jq -r .reportingUrl)"
  echo "JWT_PRIVATE_KEY_B64=$(echo "$JWT_SECRET" | jq -r .privateKeyB64)"
  echo "JWT_PUBLIC_KEY_B64=$(echo "$JWT_SECRET" | jq -r .publicKeyB64)"
  echo "ENCRYPTION_KEY_HEX=$(echo "$ENC_SECRET" | jq -r .encryptionKeyHex)"
  echo "REMITA_MERCHANT_ID=$(echo "$PAY_SECRET" | jq -r .remitaMerchantId)"
  echo "REMITA_API_KEY=$(echo "$PAY_SECRET" | jq -r .remitaApiKey)"
  echo "PAYSTACK_SECRET_KEY=$(echo "$PAY_SECRET" | jq -r .paystackSecretKey)"
  echo "NODE_ENV=${ENV}"
} > /opt/uniportal/.env.production
chmod 600 /opt/uniportal/.env.production
