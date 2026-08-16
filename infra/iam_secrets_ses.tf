# ═══════════════════════════════════════════════════════════════════════════
# IAM — EC2 instance profile (spec §19.1: "IAM Instance Profile on EC2...
# NEVER static keys in code") and Secrets Manager entries (spec §7.5)
# ═══════════════════════════════════════════════════════════════════════════

resource "aws_iam_role" "app" {
  name = "uniportal-${var.environment}-app-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_instance_profile" "app" {
  name = "uniportal-${var.environment}-app-profile"
  role = aws_iam_role.app.name
}

# Scoped least-privilege policy — S3 (only this app's 3 buckets), Secrets
# Manager (only this app's /uniportal/{env}/* paths), SES send, CloudWatch/X-Ray.
resource "aws_iam_role_policy" "app" {
  name = "uniportal-${var.environment}-app-policy"
  role = aws_iam_role.app.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3Access"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = [
          "${aws_s3_bucket.uploads.arn}/*",
          "${aws_s3_bucket.reports.arn}/*",
        ]
      },
      {
        Sid      = "S3ListOwnBuckets"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = [aws_s3_bucket.uploads.arn, aws_s3_bucket.reports.arn, aws_s3_bucket.static.arn]
      },
      {
        Sid      = "SecretsManagerRead"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:*:secret:/uniportal/${var.environment}/*"
      },
      {
        Sid      = "SesSend"
        Effect   = "Allow"
        Action   = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource = "*"
      },
      {
        Sid    = "XRayTracing"
        Effect = "Allow"
        Action = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
        Resource = "*"
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:*:log-group:/uniportal/${var.environment}/*"
      },
    ]
  })
}

# ── Secrets Manager: JWT keys, payment gateway keys, external API keys ────────
# All auto-populated with PLACEHOLDER values — this is IaC for the secret
# *slots* (spec §7.5's path pattern), not the actual key material. Rotate
# these to real values out-of-band immediately after first apply; Terraform
# state should never be the durable home for live production secrets long-
# term (`ignore_changes` below prevents `terraform apply` from stomping on a
# manually-rotated value).
resource "aws_secretsmanager_secret" "jwt_keys" {
  name = "/uniportal/${var.environment}/jwt/keypair"
}
resource "aws_secretsmanager_secret_version" "jwt_keys" {
  secret_id     = aws_secretsmanager_secret.jwt_keys.id
  secret_string = jsonencode({ privateKeyB64 = "REPLACE_ME", publicKeyB64 = "REPLACE_ME" })
  lifecycle { ignore_changes = [secret_string] }
}

resource "aws_secretsmanager_secret" "payment_keys" {
  name = "/uniportal/${var.environment}/payments/gateways"
}
resource "aws_secretsmanager_secret_version" "payment_keys" {
  secret_id = aws_secretsmanager_secret.payment_keys.id
  secret_string = jsonencode({
    remitaMerchantId  = "REPLACE_ME"
    remitaApiKey      = "REPLACE_ME"
    paystackSecretKey = "REPLACE_ME"
  })
  lifecycle { ignore_changes = [secret_string] }
}

resource "aws_secretsmanager_secret" "external_api_keys" {
  name = "/uniportal/${var.environment}/external-apis/credentials"
}
resource "aws_secretsmanager_secret_version" "external_api_keys" {
  secret_id = aws_secretsmanager_secret.external_api_keys.id
  secret_string = jsonencode({
    jambApiKey  = "REPLACE_ME" # requires signed JAMB MOU — see docs/CHANGELOG.md admin items
    waecApiKey  = "REPLACE_ME"
    nimcApiKey  = "REPLACE_ME"
    nibssApiKey = "REPLACE_ME"
    termiiApiKey = "REPLACE_ME"
  })
  lifecycle { ignore_changes = [secret_string] }
}

resource "aws_secretsmanager_secret" "encryption_key" {
  name = "/uniportal/${var.environment}/security/encryption-key"
}
resource "aws_secretsmanager_secret_version" "encryption_key" {
  secret_id     = aws_secretsmanager_secret.encryption_key.id
  secret_string = jsonencode({ encryptionKeyHex = random_id.encryption_key_seed.hex })
  lifecycle { ignore_changes = [secret_string] } # rotate via the documented v1/v2 dual-key procedure (packages/utils/src/encryption.ts), not a fresh terraform apply
}

resource "random_id" "encryption_key_seed" {
  byte_length = 32 # 256 bits, matches AES-256 (spec §16.2) — this is a bootstrap value, not the rotation mechanism
}

# ── SES — spec §19.1: "Verified sending domain; DKIM + SPF" ───────────────────
resource "aws_ses_domain_identity" "main" {
  domain = replace(var.frontend_origin, "https://", "")
}

resource "aws_ses_domain_dkim" "main" {
  domain = aws_ses_domain_identity.main.domain
}

resource "aws_ses_domain_mail_from" "main" {
  domain           = aws_ses_domain_identity.main.domain
  mail_from_domain = "mail.${aws_ses_domain_identity.main.domain}"
}
