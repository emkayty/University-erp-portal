# ═══════════════════════════════════════════════════════════════════════════
# Data tier — RDS PostgreSQL 16 (Multi-AZ + read replica) & ElastiCache Redis 7
# spec §19.1 / §8.1
# ═══════════════════════════════════════════════════════════════════════════

resource "random_password" "db_master" {
  length  = 32
  special = false # avoid characters that need extra escaping in connection strings
}

resource "aws_db_subnet_group" "main" {
  name       = "uniportal-${var.environment}-db"
  subnet_ids = aws_subnet.private_data[*].id
  tags       = { Name = "uniportal-${var.environment}-db-subnet-group" }
}

resource "aws_db_parameter_group" "main" {
  name   = "uniportal-${var.environment}-pg16"
  family = "postgres16"

  parameter { name = "shared_preload_libraries", value = "pg_stat_statements,pgcrypto" }
  # PgBouncer (spec §8.1) sits in front — max_connections here is the ceiling
  # PgBouncer's own pool draws from, per spec §17.5: "PostgreSQL
  # max_connections = 200 (with PgBouncer managing pool)".
  parameter { name = "max_connections", value = "200", apply_method = "pending-reboot" }
}

resource "aws_db_instance" "primary" {
  identifier     = "uniportal-${var.environment}-primary"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.rds_instance_class

  allocated_storage     = 500 # spec §19.1: 500GB gp3
  max_allocated_storage = 1000
  storage_type          = "gp3"
  storage_encrypted     = true # spec §3.4: AES-256 at rest

  db_name  = "uniportal"
  username = var.db_master_username
  password = random_password.db_master.result
  port     = 5432

  multi_az                       = true # spec §19.1
  db_subnet_group_name           = aws_db_subnet_group.main.name
  parameter_group_name           = aws_db_parameter_group.main.name
  vpc_security_group_ids         = [aws_security_group.rds.id]
  backup_retention_period         = 35 # spec §21.2: PITR 35 days
  backup_window                   = "01:00-02:00" # UTC — 02:00-03:00 WAT
  maintenance_window               = "sun:03:00-sun:05:00"
  copy_tags_to_snapshot            = true
  deletion_protection              = var.environment == "production"
  skip_final_snapshot              = var.environment != "production"
  final_snapshot_identifier        = var.environment == "production" ? "uniportal-${var.environment}-final-${formatdate("YYYYMMDD", timestamp())}" : null
  performance_insights_enabled     = true
  enabled_cloudwatch_logs_exports  = ["postgresql", "upgrade"]

  tags = { Name = "uniportal-${var.environment}-rds-primary" }

  lifecycle {
    ignore_changes = [final_snapshot_identifier]
  }
}

# Read replica — spec §8.1 "Reporting module and analytics use separate read
# connection string" (PRISMA_REPORTING_URL, spec §19.4 / §17.5)
resource "aws_db_instance" "read_replica" {
  identifier             = "uniportal-${var.environment}-replica"
  replicate_source_db    = aws_db_instance.primary.identifier
  instance_class         = var.rds_instance_class
  vpc_security_group_ids = [aws_security_group.rds.id]
  storage_encrypted      = true
  skip_final_snapshot    = true
  tags                   = { Name = "uniportal-${var.environment}-rds-replica" }
}

# ── ElastiCache Redis 7 (Multi-AZ) — spec §19.1 ────────────────────────────────
resource "aws_elasticache_subnet_group" "main" {
  name       = "uniportal-${var.environment}-redis"
  subnet_ids = aws_subnet.private_data[*].id
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "uniportal-${var.environment}-redis"
  description                = "Sessions, BullMQ, rate limits, query cache (spec §19.1)"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.redis_node_type
  num_cache_clusters         = var.az_count # Multi-AZ
  automatic_failover_enabled = true
  multi_az_enabled           = true
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true # spec §3.4: TLS 1.3 in transit
  snapshot_retention_limit   = 1    # spec §21.2: "AOF every second, 1 day"

  tags = { Name = "uniportal-${var.environment}-redis" }
}

# ── Secrets Manager entries for DB/Redis credentials (spec §7.5) ──────────────
resource "aws_secretsmanager_secret" "db_credentials" {
  name                    = "/uniportal/${var.environment}/db/credentials"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username         = var.db_master_username
    password         = random_password.db_master.result
    databaseUrl      = "postgresql://${var.db_master_username}:${random_password.db_master.result}@${aws_db_instance.primary.address}:5432/uniportal?pgbouncer=true"
    directUrl        = "postgresql://${var.db_master_username}:${random_password.db_master.result}@${aws_db_instance.primary.address}:5432/uniportal"
    migrateDatabaseUrl = "postgresql://${var.db_master_username}:${random_password.db_master.result}@${aws_db_instance.primary.address}:5432/uniportal"
    reportingUrl     = "postgresql://${var.db_master_username}:${random_password.db_master.result}@${aws_db_instance.read_replica.address}:5432/uniportal"
  })
}

resource "aws_secretsmanager_secret" "redis_credentials" {
  name                    = "/uniportal/${var.environment}/redis/credentials"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "redis_credentials" {
  secret_id     = aws_secretsmanager_secret.redis_credentials.id
  secret_string = jsonencode({
    host = aws_elasticache_replication_group.main.primary_endpoint_address
    port = 6379
  })
}
