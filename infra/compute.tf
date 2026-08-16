# ═══════════════════════════════════════════════════════════════════════════
# Compute — EC2 ASG (spec §19.1), ALB, autoscaling policies (register M11:
# "Auto-scaling trigger policy absent"), and CodeDeploy for blue/green
# deploys (spec §3.3 "Zero downtime deployments via blue/green on AWS
# CodeDeploy"). The API target listens on 3001; the Next.js web tier requires
# a separately provisioned origin and is not silently treated as this target. See infra/README.md for how this relates to the existing
# SSH+pm2 deploy path already in .github/workflows/ci.yml.
# ═══════════════════════════════════════════════════════════════════════════

data "aws_ami" "app" {
  most_recent = true
  owners      = ["099720109477"] # Canonical
  filter { name = "name", values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"] }
  filter { name = "virtualization-type", values = ["hvm"] }
}

resource "aws_lb" "main" {
  name               = "uniportal-${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = var.environment == "production"
  tags = { Name = "uniportal-${var.environment}-alb" }
}

# Two target groups (blue/green) — CodeDeploy shifts traffic between them.
resource "aws_lb_target_group" "blue" {
  name     = "uniportal-${var.environment}-tg-blue"
  port     = 3001
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id
  health_check {
    path                = "/api/health/live"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
    matcher             = "200"
  }
}

resource "aws_lb_target_group" "green" {
  name     = "uniportal-${var.environment}-tg-green"
  port     = 3001
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id
  health_check {
    path                = "/api/health/live"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
    matcher             = "200"
  }
}

resource "aws_acm_certificate" "alb" {
  domain_name       = replace(var.frontend_origin, "https://", "")
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06" # spec §3.4: TLS 1.3 minimum
  certificate_arn   = aws_acm_certificate.alb.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.blue.arn # CodeDeploy repoints this during deploys
  }

  lifecycle {
    ignore_changes = [default_action] # CodeDeploy owns traffic-shifting after the first apply
  }
}

resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect { port = "443", protocol = "HTTPS", status_code = "HTTP_301" }
  }
}

resource "aws_launch_template" "app" {
  name_prefix   = "uniportal-${var.environment}-"
  image_id      = data.aws_ami.app.id
  instance_type = var.ec2_instance_type

  iam_instance_profile { arn = aws_iam_instance_profile.app.arn }
  vpc_security_group_ids = [aws_security_group.ec2_app.id]

  user_data = base64encode(templatefile("${path.module}/templates/user_data.sh.tpl", {
    environment = var.environment
  }))

  monitoring { enabled = true } # detailed CloudWatch metrics — needed for the CPU-based scaling policy below

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "uniportal-${var.environment}-app" }
  }
}

resource "aws_autoscaling_group" "app" {
  name                = "uniportal-${var.environment}-asg"
  min_size            = var.asg_min_size
  max_size            = var.asg_max_size
  desired_capacity    = var.asg_min_size
  vpc_zone_identifier = aws_subnet.private_app[*].id
  target_group_arns   = [aws_lb_target_group.blue.arn]
  health_check_type   = "ELB"
  health_check_grace_period = 90

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }

  # AZRebalance kept ON (default) for the <15-min AZ-failure RTO in spec §21.1
  tag {
    key = "Name", value = "uniportal-${var.environment}-app", propagate_at_launch = true
  }

  lifecycle {
    ignore_changes = [target_group_arns] # CodeDeploy manages this during blue/green cutovers
  }
}

# ── M11: Auto-scaling trigger policies (previously absent) ────────────────────
# Two independent target-tracking policies — CPU (the metric spec §3.6's
# Phase-3 trigger discussion is framed around) and ALB request count per
# target (catches I/O-bound load a pure-CPU policy would miss, e.g. a burst
# of slow external-API-bound admissions/payment requests that don't spike
# CPU much but do spike concurrency).
resource "aws_autoscaling_policy" "cpu_target_tracking" {
  name                   = "uniportal-${var.environment}-cpu-scaling"
  autoscaling_group_name = aws_autoscaling_group.app.name
  policy_type            = "TargetTrackingScaling"
  target_tracking_configuration {
    predefined_metric_specification { predefined_metric_type = "ASGAverageCPUUtilization" }
    target_value     = 60.0 # headroom below the spec §3.6 75% Phase-3 trigger — scale out BEFORE hitting that ceiling
    disable_scale_in = false
  }
}

resource "aws_autoscaling_policy" "request_count_target_tracking" {
  name                   = "uniportal-${var.environment}-request-count-scaling"
  autoscaling_group_name = aws_autoscaling_group.app.name
  policy_type            = "TargetTrackingScaling"
  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${aws_lb.main.arn_suffix}/${aws_lb_target_group.blue.arn_suffix}"
    }
    target_value     = 800 # requests/min/instance — sized for the spec §1.3/§3.1 read/write P95 targets
    disable_scale_in = false
  }
}

# Sustained-CPU>75% alarm feeding the Phase-3 extraction DECISION (spec
# §3.6) — this does NOT autoscale (that's the policy above); it's purely an
# operational signal that it may be time to plan the Results/Fees
# microservice extraction, per spec Phase Summary "Phase 3 — Scale".
resource "aws_cloudwatch_metric_alarm" "phase3_trigger_signal" {
  alarm_name          = "uniportal-${var.environment}-phase3-extraction-signal"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 12 # 12 x 5min = 1h "sustained", not a momentary spike
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 75
  dimensions          = { AutoScalingGroupName = aws_autoscaling_group.app.name }
  alarm_description   = "Sustained CPU > 75% despite autoscaling to max — spec §3.6 Phase 3 trigger. This is a planning signal, not an incident page."
  alarm_actions       = var.alert_pagerduty_topic_arn != "" ? [var.alert_pagerduty_topic_arn] : []
}

# ── CodeDeploy — blue/green, OneAtATime traffic control ───────────────────────
resource "aws_iam_role" "codedeploy" {
  name = "uniportal-${var.environment}-codedeploy-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "codedeploy.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "codedeploy" {
  role       = aws_iam_role.codedeploy.name
  # This is an EC2/Server deployment, not ECS. Use the CodeDeploy service-role
  # policy for EC2/on-premises deployments rather than the ECS-specific policy.
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSCodeDeployRole"
}

resource "aws_codedeploy_app" "api" {
  name             = "uniportal-${var.environment}-api"
  compute_platform = "Server"
}

resource "aws_codedeploy_deployment_group" "api" {
  app_name               = aws_codedeploy_app.api.name
  deployment_group_name  = "uniportal-${var.environment}-api-dg"
  service_role_arn       = aws_iam_role.codedeploy.arn
  deployment_config_name = "CodeDeployDefault.OneAtATime"

  autoscaling_groups = [aws_autoscaling_group.app.name]

  deployment_style {
    deployment_type   = "BLUE_GREEN"
    deployment_option = "WITH_TRAFFIC_CONTROL"
  }

  blue_green_deployment_config {
    terminate_blue_instances_on_deployment_success {
      action                           = "TERMINATE"
      termination_wait_time_in_minutes = 5
    }
    deployment_ready_option {
      action_on_timeout = "CONTINUE_DEPLOYMENT"
    }
  }

  load_balancer_info {
    target_group_pair_info {
      prod_traffic_route { listener_arns = [aws_lb_listener.https.arn] }
      target_group { name = aws_lb_target_group.blue.name }
      target_group { name = aws_lb_target_group.green.name }
    }
  }

  auto_rollback_configuration {
    enabled = true
    events  = ["DEPLOYMENT_FAILURE", "DEPLOYMENT_STOP_ON_ALARM"]
  }

  alarm_configuration {
    enabled = var.alert_pagerduty_topic_arn != ""
    alarms  = var.alert_pagerduty_topic_arn != "" ? [aws_cloudwatch_metric_alarm.api_error_rate.alarm_name] : []
  }
}

resource "aws_cloudwatch_metric_alarm" "api_error_rate" {
  alarm_name          = "uniportal-${var.environment}-api-error-rate-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = 10 # spec §17.2: >10/min sustained 2 min
  dimensions          = { LoadBalancer = aws_lb.main.arn_suffix }
  alarm_actions       = var.alert_pagerduty_topic_arn != "" ? [var.alert_pagerduty_topic_arn] : []
  treat_missing_data  = "notBreaching"
}
