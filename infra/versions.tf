# ═══════════════════════════════════════════════════════════════════════════
# UniPortal ERP — Terraform root: providers, backend, shared variables
# Phase: P10 (spec §19.1). Covers spec Phase 1+2 architecture (EC2 monolith +
# BullMQ). EKS (spec Phase 3) is deliberately NOT provisioned here — spec
# §3.6 gates it behind "sustained CPU > 75% on EC2 monolith during peak
# hours despite vertical scaling", which has not been observed. See
# infra/README.md "Phase 3 readiness" for what IS prepared ahead of that.
# ═══════════════════════════════════════════════════════════════════════════

terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.50" }
  }

  # State: encrypted S3 + DynamoDB lock (spec §19.1 "State is stored in an
  # encrypted S3 bucket with DynamoDB state locking"). Bootstrap this bucket
  # + table ONCE by hand (or via infra/bootstrap/) before first `terraform
  # init` — a backend can't create its own storage.
  backend "s3" {
    bucket         = "uniportal-terraform-state"
    key            = "uniportal-erp/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "uniportal-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "uniportal-erp"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# ── Core variables ────────────────────────────────────────────────────────────
variable "aws_region" {
  description = "Primary AWS region. Spec §3.6 pins CloudFront edge to af-south-1 (Cape Town) for Nigerian latency; compute/DB stay in a standard region with mature multi-AZ/RDS support."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "dev | staging | production — mirrors NODE_ENV (spec §19.4)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "environment must be dev, staging, or production."
  }
}

variable "institution_slug" {
  description = "Short institution identifier used in resource names and FRONTEND_ORIGIN (spec §19.4: https://portal.{institution}.edu.ng)"
  type        = string
}

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

# P2-5 FIX (this pass — see docs/CHANGELOG.md): the ec2_app security
# group's SSH rule used to fall back to var.vpc_cidr — the entire VPC's
# address space, not a bastion/VPN-specific range — with only an inline
# comment flagging it as a placeholder "tighten at apply time." A dedicated
# variable with NO default forces every environment to make an explicit,
# deliberate choice (Terraform will refuse to plan/apply without a value
# supplied) rather than silently inheriting a range far wider than a real
# bastion or VPN endpoint should ever need.
variable "ssh_allowed_cidrs" {
  description = "CIDR blocks allowed to SSH into the EC2 app tier — scope this to your bastion host(s) or VPN endpoint's actual address range, never the full VPC CIDR and never 0.0.0.0/0. No default: every environment must set this explicitly."
  type        = list(string)
}

variable "az_count" {
  description = "Spec §19.1: Multi-AZ (us-east-1a, 1b) — 2 AZs for Phase 1/2"
  type        = number
  default     = 2
}

variable "ec2_instance_type" {
  description = "Spec §19.1: EC2 (t3.xlarge)"
  type        = string
  default     = "t3.xlarge"
}

variable "asg_min_size" {
  description = "Spec §19.1: Auto Scaling Group min 2"
  type        = number
  default     = 2
}

variable "asg_max_size" {
  description = "Spec §19.1: Auto Scaling Group max 8"
  type        = number
  default     = 8
}

variable "rds_instance_class" {
  description = "Spec §19.1: db.r6g.large"
  type        = string
  default     = "db.r6g.large"
}

variable "redis_node_type" {
  description = "Spec §19.1: cache.r6g.large"
  type        = string
  default     = "cache.r6g.large"
}

variable "db_master_username" {
  type      = string
  default   = "uniportal_admin"
  sensitive = true
}

variable "frontend_origin" {
  description = "spec §19.4 FRONTEND_ORIGIN — used for CORS + CloudFront alt domain"
  type        = string
}

variable "alert_pagerduty_topic_arn" {
  description = "SNS topic ARN that fans out to PagerDuty (spec §17.2 CloudWatch Alarms). Leave blank to skip alarm actions (e.g. first apply, before PagerDuty integration exists)."
  type        = string
  default     = ""
}
