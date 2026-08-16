output "alb_dns_name" {
  value = aws_lb.main.dns_name
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.main.domain_name
}

output "rds_endpoint" {
  value     = aws_db_instance.primary.endpoint
  sensitive = true
}

output "rds_read_replica_endpoint" {
  value     = aws_db_instance.read_replica.endpoint
  sensitive = true
}

output "redis_primary_endpoint" {
  value     = aws_elasticache_replication_group.main.primary_endpoint_address
  sensitive = true
}

output "s3_uploads_bucket" {
  value = aws_s3_bucket.uploads.id
}

output "s3_reports_bucket" {
  value = aws_s3_bucket.reports.id
}

output "s3_static_bucket" {
  value = aws_s3_bucket.static.id
}

output "asg_name" {
  description = "Used by CI/CD (deploy-aws-codedeploy.yml) to target deployments"
  value       = aws_autoscaling_group.app.name
}

output "codedeploy_app_name" {
  value = aws_codedeploy_app.api.name
}

output "codedeploy_deployment_group_name" {
  value = aws_codedeploy_deployment_group.api.deployment_group_name
}

output "ses_dkim_tokens" {
  description = "Add these as CNAME records at the DNS provider to complete SES domain verification"
  value       = aws_ses_domain_dkim.main.dkim_tokens
}

output "phase3_extraction_signal_alarm_arn" {
  description = "CloudWatch alarm ARN tracking the spec §3.6 Phase-3 extraction trigger (sustained CPU>75%)"
  value       = aws_cloudwatch_metric_alarm.phase3_trigger_signal.arn
}
