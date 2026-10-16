# STYLE E-Fashion House - Production Deployment Guide

Complete guide for deploying STYLE E-Fashion House on Contabo Coolify VPS or any Docker-enabled platform.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Database Setup](#database-setup)
4. [Deployment Options](#deployment-options)
5. [Coolify Deployment](#coolify-deployment)
6. [Manual Docker Deployment](#manual-docker-deployment)
7. [Post-Deployment Steps](#post-deployment-steps)
8. [Monitoring & Maintenance](#monitoring--maintenance)
9. [Troubleshooting](#troubleshooting)

---

## 🔧 Prerequisites

### Required Services
- **Docker** 20.10+ and **Docker Compose** 2.0+
- **PostgreSQL** 16+ (handled by Docker Compose)
- **Paystack Account** (for payments)
- **Cloudinary Account** (for image uploads)
- **Domain Name** (for production deployment)
- **SSL Certificate** (Coolify handles this automatically)

### System Requirements
- **CPU**: 2+ cores recommended
- **RAM**: 2GB minimum, 4GB recommended
- **Storage**: 20GB minimum
- **OS**: Ubuntu 20.04+, Debian 11+, or any Linux with Docker support

---

## 🔐 Environment Variables

### Required Environment Variables

Create a `.env` file in the project root with these variables:

```bash
# =====================================================
# DATABASE CONFIGURATION
# =====================================================
POSTGRES_USER=root
POSTGRES_PASSWORD=your-secure-database-password-here
POSTGRES_DB=style_fashion_db
DATABASE_URL=postgresql://root:your-secure-database-password-here@db:5432/style_fashion_db
PGSSL=false

# =====================================================
# AUTHENTICATION & SECURITY
# =====================================================
# Admin API token (minimum 32 characters)
ADMIN_TOKEN=your-secure-admin-token-minimum-32-characters-long

# Marketplace authentication secret (minimum 32 characters)
MARKETPLACE_AUTH_SECRET=your-marketplace-secret-minimum-32-characters-long

# =====================================================
# PAYSTACK PAYMENT GATEWAY
# =====================================================
# Get from: https://dashboard.paystack.com/#/settings/developers
PAYSTACK_SECRET_KEY=sk_live_your_paystack_secret_key_here

# =====================================================
# CLOUDINARY IMAGE UPLOADS
# =====================================================
# Get from: https://console.cloudinary.com/
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# =====================================================
# APPLICATION CONFIGURATION
# =====================================================
NODE_ENV=production
PORT=4000

# Your production domain (for CORS)
CLIENT_URL=https://your-domain.com

# =====================================================
# OPTIONAL: PGADMIN (for database management)
# =====================================================
PGADMIN_EMAIL=admin@yourdomain.com
PGADMIN_PASSWORD=your-pgadmin-password
```

### Generating Secure Tokens

Use these commands to generate secure random tokens:

```bash
# Generate ADMIN_TOKEN (32+ characters)
openssl rand -base64 32

# Generate MARKETPLACE_AUTH_SECRET (32+ characters)
openssl rand -base64 48
```

---

## 🗄️ Database Setup

### Automatic Initialization

The database schema is automatically initialized when the Docker container starts using the migration file:
- `server/migrations/000_init_complete_schema.sql`

This script creates:
- ✅ Products catalog tables
- ✅ Orders and payment tables
- ✅ Multi-vendor marketplace tables
- ✅ User authentication tables
- ✅ Commission and payout tables
- ✅ Reviews and ratings tables
- ✅ Admin features (coupons, refunds, audit log)

### Manual Database Initialization (if needed)

```bash
# Connect to PostgreSQL container
docker exec -it style-fashion-db-prod psql -U root -d style_fashion_db

# Run initialization script manually
\i /docker-entrypoint-initdb.d/000_init_complete_schema.sql

# Verify tables
\dt
```

---

## 🚀 Deployment Options

### Option 1: Coolify Deployment (Recommended)
Best for managed deployments with automatic SSL, monitoring, and easy updates.

### Option 2: Manual Docker Deployment
Direct Docker/Docker Compose deployment for full control.

---

## 🎯 Coolify Deployment

### Step 1: Install Coolify on Contabo VPS

```bash
# SSH into your Contabo VPS
ssh root@your-vps-ip

# Install Coolify
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash

# Access Coolify dashboard
# Navigate to: http://your-vps-ip:3000
```

### Step 2: Create New Project in Coolify

1. **Log into Coolify Dashboard**
2. **Create New Project**: `style-fashion-house`
3. **Add Git Repository**: Connect your GitHub/GitLab repository
4. **Select Branch**: `main` or `master`

### Step 3: Configure Build Settings

**Build Settings:**
- **Build Pack**: Docker
- **Dockerfile Path**: `./Dockerfile`
- **Docker Compose**: Use `docker-compose.prod.yml`

### Step 4: Configure Environment Variables

In Coolify Dashboard → Environment Variables, add all variables from the [Environment Variables](#environment-variables) section.

### Step 5: Configure Domain & SSL

1. **Add Domain**: `api.yourdomain.com` or `yourdomain.com`
2. **Enable SSL**: Coolify auto-generates Let's Encrypt certificates
3. **Configure DNS**: Point your domain A record to VPS IP

### Step 6: Deploy

1. Click **Deploy** button
2. Monitor build logs
3. Wait for health checks to pass
4. Access your application at `https://yourdomain.com`

---

## 🐳 Manual Docker Deployment

### Step 1: Clone Repository

```bash
git clone https://github.com/yourusername/style-e-fashion-house.git
cd style-e-fashion-house
```

### Step 2: Create Environment File

```bash
cp .env.example .env
nano .env  # Edit with your production values
```

### Step 3: Build and Start Services

```bash
# Build the Docker image
docker-compose -f docker-compose.prod.yml build

# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Check service status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

### Step 4: Verify Deployment

```bash
# Check API health
curl http://localhost:4000/api/health

# Expected response:
# {"ok":true,"service":"STYLE E-Fashion API"}

# Check database connection
docker exec style-fashion-db-prod psql -U root -d style_fashion_db -c "SELECT COUNT(*) FROM products;"
```

### Step 5: Setup Reverse Proxy (Nginx)

```nginx
# /etc/nginx/sites-available/style-fashion-house

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site and restart Nginx
sudo ln -s /etc/nginx/sites-available/style-fashion-house /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Install SSL with Certbot
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## ✅ Post-Deployment Steps

### 1. Create Super Admin Account

```bash
curl -X POST https://yourdomain.com/api/marketplace/admin/bootstrap-super-admin \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "fullName": "Admin User",
    "email": "admin@yourdomain.com",
    "password": "secure-admin-password-14-chars-minimum"
  }'
```

### 2. Configure Paystack Webhooks

1. Go to [Paystack Dashboard](https://dashboard.paystack.com/#/settings/webhooks)
2. Add webhook URL: `https://yourdomain.com/api/paystack/webhook`
3. Note down the webhook secret (already configured in env)

### 3. Test Payment Flow

1. Create a test order through the frontend
2. Use Paystack test cards to verify payment
3. Check order status updates in admin panel

### 4. Upload Product Images

Test Cloudinary integration:
1. Log into admin panel
2. Upload a product image
3. Verify image appears on product listing

### 5. Setup Database Backups

```bash
# Create backup script
cat > /opt/backup-style-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups/style-fashion"
mkdir -p $BACKUP_DIR
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker exec style-fashion-db-prod pg_dump -U root style_fashion_db | gzip > $BACKUP_DIR/backup_$TIMESTAMP.sql.gz
# Keep only last 7 days
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete
EOF

chmod +x /opt/backup-style-db.sh

# Add to crontab (daily at 2 AM)
echo "0 2 * * * /opt/backup-style-db.sh" | crontab -
```

---

## 📊 Monitoring & Maintenance

### Health Check Endpoint

```bash
# Check API health
curl https://yourdomain.com/api/health
```

### View Application Logs

```bash
# View API logs
docker logs -f style-fashion-api-prod

# View database logs
docker logs -f style-fashion-db-prod

# View last 100 lines
docker logs --tail 100 style-fashion-api-prod
```

### Monitor Container Resources

```bash
# Check container stats
docker stats style-fashion-api-prod style-fashion-db-prod

# Check disk usage
docker system df
```

### Update Application

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# Or with Coolify - just push to git and it auto-deploys
```

---

## 🔧 Troubleshooting

### Database Connection Issues

```bash
# Check if database is running
docker ps | grep postgres

# Test database connection
docker exec style-fashion-db-prod psql -U root -d style_fashion_db -c "SELECT 1;"

# Check database logs
docker logs style-fashion-db-prod
```

### API Not Responding

```bash
# Check if container is running
docker ps | grep style-fashion-api

# Check API logs for errors
docker logs style-fashion-api-prod

# Restart API container
docker restart style-fashion-api-prod
```

### Payment Issues

1. Verify `PAYSTACK_SECRET_KEY` is set correctly
2. Check Paystack dashboard for failed transactions
3. Verify webhook URL is accessible from internet
4. Check webhook signature validation

### Image Upload Issues

1. Verify Cloudinary credentials
2. Check file size limits (5MB max)
3. Ensure API has internet access
4. Check CORS settings

### Port Already in Use

```bash
# Check what's using port 4000
sudo lsof -i :4000

# Kill the process if needed
sudo kill -9 <PID>

# Or change port in docker-compose
```

---

## 🔒 Security Checklist

- ✅ Use strong, unique passwords for all services
- ✅ Keep ADMIN_TOKEN and MARKETPLACE_AUTH_SECRET secret (32+ chars)
- ✅ Enable SSL/TLS (HTTPS) for production
- ✅ Configure firewall to only allow necessary ports
- ✅ Regular database backups
- ✅ Keep Docker and system packages updated
- ✅ Monitor logs for suspicious activity
- ✅ Use environment variables, never commit secrets
- ✅ Restrict database access to internal network only
- ✅ Enable fail2ban for SSH protection

---

## 📞 Support

For issues or questions:
- **Documentation**: This file
- **GitHub Issues**: Create an issue in the repository
- **Email**: support@yourdomain.com

---

## 📝 License

Copyright © 2024 STYLE E-Fashion House. All rights reserved.
