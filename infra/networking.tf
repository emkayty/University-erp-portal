# ═══════════════════════════════════════════════════════════════════════════
# Networking — VPC, subnets, NAT, and security groups (spec §19.2)
# ═══════════════════════════════════════════════════════════════════════════

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags = { Name = "uniportal-${var.environment}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "uniportal-${var.environment}-igw" }
}

# Public subnets — ALB only
resource "aws_subnet" "public" {
  count                   = var.az_count
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
  tags = { Name = "uniportal-${var.environment}-public-${count.index + 1}", Tier = "public" }
}

# Private subnets — EC2 app tier
resource "aws_subnet" "private_app" {
  count             = var.az_count
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags = { Name = "uniportal-${var.environment}-private-app-${count.index + 1}", Tier = "private-app" }
}

# Private subnets — RDS/ElastiCache data tier (isolated further from app tier)
resource "aws_subnet" "private_data" {
  count             = var.az_count
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 20)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags = { Name = "uniportal-${var.environment}-private-data-${count.index + 1}", Tier = "private-data" }
}

resource "aws_eip" "nat" {
  count  = var.az_count
  domain = "vpc"
  tags   = { Name = "uniportal-${var.environment}-nat-eip-${count.index + 1}" }
}

resource "aws_nat_gateway" "main" {
  count         = var.az_count
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  tags          = { Name = "uniportal-${var.environment}-nat-${count.index + 1}" }
  depends_on    = [aws_internet_gateway.main]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route { cidr_block = "0.0.0.0/0", gateway_id = aws_internet_gateway.main.id }
  tags = { Name = "uniportal-${var.environment}-public-rt" }
}

resource "aws_route_table" "private" {
  count  = var.az_count
  vpc_id = aws_vpc.main.id
  route { cidr_block = "0.0.0.0/0", nat_gateway_id = aws_nat_gateway.main[count.index].id }
  tags = { Name = "uniportal-${var.environment}-private-rt-${count.index + 1}" }
}

resource "aws_route_table_association" "public" {
  count          = var.az_count
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private_app" {
  count          = var.az_count
  subnet_id      = aws_subnet.private_app[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

resource "aws_route_table_association" "private_data" {
  count          = var.az_count
  subnet_id      = aws_subnet.private_data[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# ── Security groups — spec §19.2 exactly ──────────────────────────────────────

resource "aws_security_group" "alb" {
  name_prefix = "uniportal-${var.environment}-alb-"
  vpc_id      = aws_vpc.main.id
  description = "ALB — spec §19.2: 443/80 from internet"

  ingress { description = "HTTPS from internet", from_port = 443, to_port = 443, protocol = "tcp", cidr_blocks = ["0.0.0.0/0"] }
  ingress { description = "HTTP -> redirect to 443", from_port = 80, to_port = 80, protocol = "tcp", cidr_blocks = ["0.0.0.0/0"] }
  egress  { description = "to EC2 API tier", from_port = 3001, to_port = 3001, protocol = "tcp", security_groups = [aws_security_group.ec2_app.id] }

  tags = { Name = "uniportal-${var.environment}-alb-sg" }
}

resource "aws_security_group" "ec2_app" {
  name_prefix = "uniportal-${var.environment}-ec2-"
  vpc_id      = aws_vpc.main.id
  description = "EC2 app tier — spec §19.2: 443 from ALB only, 22 from bastion/VPN only"

  ingress { description = "from ALB to API", from_port = 3001, to_port = 3001, protocol = "tcp", security_groups = [aws_security_group.alb.id] }
  ingress {
    description = "SSH from bastion/VPN only — NEVER 0.0.0.0/0"
    from_port   = 22, to_port = 22, protocol = "tcp"
    cidr_blocks = var.ssh_allowed_cidrs # P2-5 fix: was var.vpc_cidr (the whole VPC) — see versions.tf
  }
  egress { description = "to RDS", from_port = 5432, to_port = 5432, protocol = "tcp", security_groups = [aws_security_group.rds.id] }
  egress { description = "to ElastiCache", from_port = 6379, to_port = 6379, protocol = "tcp", security_groups = [aws_security_group.redis.id] }
  egress { description = "HTTPS to external APIs (JAMB/WAEC/Remita/Paystack) via NAT", from_port = 443, to_port = 443, protocol = "tcp", cidr_blocks = ["0.0.0.0/0"] }

  tags = { Name = "uniportal-${var.environment}-ec2-sg" }
}

resource "aws_security_group" "rds" {
  name_prefix = "uniportal-${var.environment}-rds-"
  vpc_id      = aws_vpc.main.id
  description = "RDS — spec §19.2: 5432 from EC2 SG + bastion/VPN for DBA access"

  ingress { description = "from EC2 app tier", from_port = 5432, to_port = 5432, protocol = "tcp", security_groups = [aws_security_group.ec2_app.id] }
  ingress { description = "DBA access from bastion/VPN", from_port = 5432, to_port = 5432, protocol = "tcp", cidr_blocks = [var.vpc_cidr] }

  tags = { Name = "uniportal-${var.environment}-rds-sg" }
}

resource "aws_security_group" "redis" {
  name_prefix = "uniportal-${var.environment}-redis-"
  vpc_id      = aws_vpc.main.id
  description = "ElastiCache — spec §19.2: 6379 from EC2 SG only"

  ingress { description = "from EC2 app tier", from_port = 6379, to_port = 6379, protocol = "tcp", security_groups = [aws_security_group.ec2_app.id] }

  tags = { Name = "uniportal-${var.environment}-redis-sg" }
}
