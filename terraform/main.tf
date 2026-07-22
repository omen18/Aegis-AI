###############################################################################
# NEXUS AI — AWS infrastructure (starting point).
#
# This is a lean, honest skeleton that provisions the load-bearing pieces:
# a VPC, an EKS cluster (runs the k8s/ manifests), an RDS Postgres instance
# (enable the PostGIS extension post-create), and an ElastiCache Redis.
# Harden before production: private subnets only for data, KMS, IAM
# least-privilege, backups, WAF, and remote state with locking.
###############################################################################

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
  # backend "s3" { bucket = "nexus-tfstate" key = "prod/terraform.tfstate" region = "ap-south-1" dynamodb_table = "nexus-tf-lock" }
}

provider "aws" {
  region = var.region
}

variable "region"      { default = "ap-south-1" }
variable "cluster_name" { default = "nexus" }
variable "db_password"  { sensitive = true }

# --- Network ---------------------------------------------------------------
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"
  name    = "${var.cluster_name}-vpc"
  cidr    = "10.0.0.0/16"

  azs             = ["${var.region}a", "${var.region}b"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true
}

# --- EKS (runs the Kubernetes manifests) -----------------------------------
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = var.cluster_name
  cluster_version = "1.30"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnets

  eks_managed_node_groups = {
    default = {
      instance_types = ["t3.large"]
      min_size       = 3
      max_size       = 10
      desired_size   = 3
    }
    # GPU pool for YOLO/SAM inference (optional)
    # gpu = { instance_types = ["g5.xlarge"], min_size = 0, max_size = 4, desired_size = 0 }
  }
}

# --- Managed Postgres (enable PostGIS after create) ------------------------
resource "aws_db_instance" "postgres" {
  identifier           = "${var.cluster_name}-db"
  engine               = "postgres"
  engine_version       = "16.4"
  instance_class       = "db.t3.medium"
  allocated_storage    = 50
  db_name              = "nexus"
  username             = "nexus"
  password             = var.db_password
  db_subnet_group_name = aws_db_subnet_group.this.name
  skip_final_snapshot  = true
  storage_encrypted    = true
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.cluster_name}-db-subnets"
  subnet_ids = module.vpc.private_subnets
}

# --- Redis -----------------------------------------------------------------
resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${var.cluster_name}-redis"
  engine               = "redis"
  node_type            = "cache.t3.micro"
  num_cache_nodes      = 1
  subnet_group_name    = aws_elasticache_subnet_group.this.name
}

resource "aws_elasticache_subnet_group" "this" {
  name       = "${var.cluster_name}-redis-subnets"
  subnet_ids = module.vpc.private_subnets
}

output "cluster_endpoint" { value = module.eks.cluster_endpoint }
output "db_endpoint"      { value = aws_db_instance.postgres.endpoint }
output "redis_endpoint"   { value = aws_elasticache_cluster.redis.cache_nodes[0].address }
