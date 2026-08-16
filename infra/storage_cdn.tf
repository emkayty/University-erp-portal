# ═══════════════════════════════════════════════════════════════════════════
# Storage & CDN — 3 S3 buckets (spec §24.1), CloudFront, WAF (spec §19.1)
# ═══════════════════════════════════════════════════════════════════════════

locals {
  # spec §24.1 bucket layout: uniportal-{env}-uploads / -reports / -static
  bucket_uploads = "uniportal-${var.environment}-uploads"
  bucket_reports = "uniportal-${var.environment}-reports"
  bucket_static  = "uniportal-${var.environment}-static"
}

resource "aws_kms_key" "s3" {
  description             = "SSE-KMS key for uniportal S3 buckets (spec §3.4)"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}

# ── uploads (private) ──────────────────────────────────────────────────────────
resource "aws_s3_bucket" "uploads" {
  bucket = local.bucket_uploads
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "aws:kms", kms_master_key_id = aws_kms_key.s3.arn }
  }
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── reports (private, pre-signed URL access) ───────────────────────────────────
resource "aws_s3_bucket" "reports" {
  bucket = local.bucket_reports
}

resource "aws_s3_bucket_versioning" "reports" {
  bucket = aws_s3_bucket.reports.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "reports" {
  bucket = aws_s3_bucket.reports.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "aws:kms", kms_master_key_id = aws_kms_key.s3.arn }
  }
}

resource "aws_s3_bucket_public_access_block" "reports" {
  bucket                  = aws_s3_bucket.reports.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# spec §17.7 report-purge cron deletes DB rows after 72h; this lifecycle rule
# is the S3-side backstop so orphaned objects don't accumulate forever.
resource "aws_s3_bucket_lifecycle_configuration" "reports" {
  bucket = aws_s3_bucket.reports.id
  rule {
    id     = "expire-generated-reports"
    status = "Enabled"
    filter { prefix = "reports/" }
    expiration { days = 7 }
  }
}

# ── static (public via CloudFront only) ────────────────────────────────────────
resource "aws_s3_bucket" "static" {
  bucket = local.bucket_static
}

resource "aws_s3_bucket_public_access_block" "static" {
  bucket                  = aws_s3_bucket.static.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "static" {
  name                              = "uniportal-${var.environment}-static-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_s3_bucket_policy" "static" {
  bucket = aws_s3_bucket.static.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontOAC"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.static.arn}/*"
      Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.main.arn } }
    }]
  })
}

# ── WAF (spec §19.1: "Rate limiting rules, SQL injection, XSS rule groups; OWASP managed rules") ──
resource "aws_wafv2_web_acl" "main" {
  name  = "uniportal-${var.environment}-waf"
  scope = "CLOUDFRONT"
  provider = aws.us_east_1_for_cloudfront

  default_action { allow {} }

  rule {
    name     = "aws-managed-common"
    priority = 1
    override_action { none {} }
    statement {
      managed_rule_group_statement { name = "AWSManagedRulesCommonRuleSet", vendor_name = "AWS" }
    }
    visibility_config { cloudwatch_metrics_enabled = true, metric_name = "commonRuleSet", sampled_requests_enabled = true }
  }

  rule {
    name     = "aws-managed-sqli"
    priority = 2
    override_action { none {} }
    statement {
      managed_rule_group_statement { name = "AWSManagedRulesSQLiRuleSet", vendor_name = "AWS" }
    }
    visibility_config { cloudwatch_metrics_enabled = true, metric_name = "sqliRuleSet", sampled_requests_enabled = true }
  }

  rule {
    name     = "rate-limit-per-ip"
    priority = 3
    action { block {} }
    statement {
      rate_based_statement { limit = 2000, aggregate_key_type = "IP" } # generous CDN-level ceiling; spec §3.4's 5/min-auth & 100/min-api limits are enforced at the app layer (ThrottlerModule)
    }
    visibility_config { cloudwatch_metrics_enabled = true, metric_name = "rateLimitPerIp", sampled_requests_enabled = true }
  }

  visibility_config { cloudwatch_metrics_enabled = true, metric_name = "uniportalWaf", sampled_requests_enabled = true }
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  price_class         = "PriceClass_All" # includes af-south-1 edge, spec §3.6
  web_acl_id          = aws_wafv2_web_acl.main.arn
  aliases             = [replace(var.frontend_origin, "https://", "")]

  origin {
    domain_name              = aws_s3_bucket.static.bucket_regional_domain_name
    origin_id                = "s3-static"
    origin_access_control_id = aws_cloudfront_origin_access_control.static.id
  }

  origin {
    domain_name = aws_lb.main.dns_name
    origin_id   = "alb-api"
    custom_origin_config {
      http_port              = 80
      https_port              = 443
      origin_protocol_policy  = "https-only"
      origin_ssl_protocols    = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "s3-static"
    viewer_protocol_policy  = "redirect-to-https"
    allowed_methods         = ["GET", "HEAD"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }
  }

  ordered_cache_behavior {
    path_pattern            = "/api/*"
    target_origin_id        = "alb-api"
    viewer_protocol_policy   = "https-only"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    forwarded_values {
      query_string = true
      headers      = ["Authorization", "X-Idempotency-Key", "X-Request-ID", "Content-Type"]
      cookies { forward = "all" }
    }
    min_ttl     = 0
    default_ttl = 0 # API responses are not cached at CDN level — app sets its own Cache-Control/ETag (spec §17.5)
    max_ttl     = 0
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    acm_certificate_arn      = var.acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = { Name = "uniportal-${var.environment}-cdn" }
}

variable "acm_certificate_arn" {
  description = "ACM cert in us-east-1 for the CloudFront distribution (CloudFront requires us-east-1 regardless of aws_region)"
  type        = string
}

# CloudFront + its WAF association must live in us-east-1
provider "aws" {
  alias  = "us_east_1_for_cloudfront"
  region = "us-east-1"
}
