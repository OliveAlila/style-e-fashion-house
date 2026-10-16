# STYLE E-Fashion House - Quick Start Guide

Get STYLE E-Fashion House running locally or in production in minutes.

---

## 🚀 Local Development (5 Minutes)

### Step 1: Prerequisites
```bash
# Verify installations
docker --version        # Docker 20.10+
docker-compose --version  # Docker Compose 2.0+
node --version          # Node.js 18+
```

### Step 2: Clone & Setup
```bash
# Clone repository
git clone <repository-url>
cd style-e-fashion-house

# Create environment file
cp .env.production.example .env

# Edit .env with your local values (use defaults for development)
# Minimum required changes:
# - Generate ADMIN_TOKEN: openssl rand -base64 32
# - Generate MARKETPLACE_AUTH_SECRET: openssl rand -base64 48
```

### Step 3: Start Services
```bash
# Start PostgreSQL and API with Docker
docker-compose up -d

# View logs
docker-compose logs -f

# Wait for "STYLE API listening on 4000" message
```

### Step 4: Verify
```bash
# Check API health
curl http://localhost:4000/api/health

# Expected: {"ok":true,"service":"STYLE E-Fashion API"}

# Check products
curl http://localhost:4000/api/products

# Optional: Access pgAdmin at http://localhost:5050
docker-compose --profile tools up -d pgadmin
```

### Step 5: Create Admin Account
```bash
# Replace YOUR_ADMIN_TOKEN with the value from your .env file
curl -X POST http://localhost:4000/api/marketplace/admin/bootstrap-super-admin \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "fullName": "Admin User",
    "email": "admin@test.com",
    "password": "TestPassword123!"
  }'
```

**✅ Done! Your API is running at http://localhost:4000**

---

## 🌐 Production Deployment (Coolify - 10 Minutes)

### Step 1: Prepare VPS
```bash
# SSH into your Contabo VPS
ssh root@your-vps-ip

# Install Coolify (one-command install)
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash

# Access Coolify at http://your-vps-ip:3000
```

### Step 2: Setup Project in Coolify

1. **Create New Project** → "style-fashion-house"
2. **Add Git Repository** → Connect your repo
3. **Configure Build**:
   - Build Pack: `Docker`
   - Docker Compose File: `docker-compose.prod.yml`

### Step 3: Configure Environment

Add these environment variables in Coolify:

```bash
# Database (generate secure password)
POSTGRES_USER=root
POSTGRES_PASSWORD=<generate-secure-password>
POSTGRES_DB=style_fashion_db

# Tokens (generate with: openssl rand -base64 48)
ADMIN_TOKEN=<your-secure-token-32-chars>
MARKETPLACE_AUTH_SECRET=<your-jwt-secret-48-chars>

# Paystack (get from dashboard.paystack.com)
PAYSTACK_SECRET_KEY=sk_live_your_key_here

# Cloudinary (get from console.cloudinary.com)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Domain
CLIENT_URL=https://your-domain.com
```

### Step 4: Configure Domain

1. **Add Domain** in Coolify: `api.yourdomain.com`
2. **Enable SSL**: Auto-configured with Let's Encrypt
3. **Update DNS**: Point A record to VPS IP

### Step 5: Deploy

1. Click **Deploy** button in Coolify
2. Monitor build logs (3-5 minutes)
3. Wait for health check ✅
4. Access API at `https://api.yourdomain.com/api/health`

### Step 6: Initialize Production

```bash
# Create super admin
curl -X POST https://api.yourdomain.com/api/marketplace/admin/bootstrap-super-admin \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "fullName": "Super Admin",
    "email": "admin@yourdomain.com",
    "password": "SecurePassword14Chars!"
  }'

# Configure Paystack webhook:
# URL: https://api.yourdomain.com/api/paystack/webhook
```

**✅ Production Ready! API at https://api.yourdomain.com**

---

## 📋 Essential API Endpoints

### Public Endpoints
```bash
# Health check
GET /api/health

# Products
GET /api/products
GET /api/products/:id
GET /api/products?category=STYLE%20WOMAN
GET /api/products?search=dress

# Orders
GET /api/orders/:reference
POST /api/checkout

# Payment verification
GET /api/paystack/verify/:reference

# Marketplace stores
GET /api/marketplace/stores
GET /api/marketplace/stores/:slug
```

### Admin Endpoints (Requires Authorization: Bearer YOUR_ADMIN_TOKEN)
```bash
# Products management
GET /api/admin/products
POST /api/admin/products
PATCH /api/admin/products/:id
POST /api/admin/products/:id/archive

# Orders management
GET /api/admin/orders
GET /api/admin/orders/:id
PATCH /api/admin/orders/:id

# Coupons
GET /api/admin/coupons
POST /api/admin/coupons
PATCH /api/admin/coupons/:id

# Settings
GET /api/admin/settings
PATCH /api/admin/settings

# Refunds
GET /api/admin/orders/:id/refunds
POST /api/admin/orders/:id/refunds
```

### Marketplace Endpoints
```bash
# Authentication
POST /api/marketplace/register
POST /api/marketplace/login
GET /api/marketplace/me

# Vendor Dashboard (requires auth token)
GET /api/marketplace/vendor/dashboard
GET /api/marketplace/vendor/products
POST /api/marketplace/vendor/products
PATCH /api/marketplace/vendor/products/:id

# Reviews
POST /api/marketplace/reviews
GET /api/marketplace/stores/:slug/reviews
```

---

## 🔑 Default Credentials

### Database (Development)
- **User**: `root`
- **Password**: `Hackifyoucan254` (change in .env)
- **Database**: `style_fashion_db`
- **Port**: `5432`

### pgAdmin (Development)
- **Email**: `admin@stylefashion.local`
- **Password**: `admin`
- **URL**: http://localhost:5050

---

## 🛠️ Common Commands

### Docker Management
```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f api
docker-compose logs -f db

# Restart a service
docker-compose restart api

# Rebuild after code changes
docker-compose up -d --build

# Clean everything (WARNING: deletes data)
docker-compose down -v
```

### Database Access
```bash
# Connect to PostgreSQL
docker exec -it style-fashion-db psql -U root -d style_fashion_db

# Backup database
docker exec style-fashion-db pg_dump -U root style_fashion_db > backup.sql

# Restore database
docker exec -i style-fashion-db psql -U root -d style_fashion_db < backup.sql
```

### Production Commands
```bash
# View production logs
docker logs -f style-fashion-api-prod

# Check production status
docker ps

# Restart production API
docker restart style-fashion-api-prod

# Update production (manual)
git pull origin main
docker-compose -f docker-compose.prod.yml up -d --build
```

---

## 📊 Testing Payments

### Paystack Test Cards

```
Success: 4084084084084081
Success (PIN): 5060666666666666666 (PIN: 1234, OTP: 123456)
Decline: 4084080000000409
Insufficient Funds: 4084000000000002
```

### Test Flow
1. Create order via `/api/checkout`
2. Use test card at Paystack checkout URL
3. Complete payment
4. Verify via `/api/paystack/verify/:reference`
5. Check order status updated to "processing"

---

## 🐛 Troubleshooting

### API Won't Start
```bash
# Check logs
docker-compose logs api

# Common issues:
# - Database not ready → wait 30s, restart
# - Port 4000 in use → change PORT in .env
# - Missing .env → copy from .env.production.example
```

### Database Connection Failed
```bash
# Check database is running
docker-compose ps db

# Verify credentials in .env match docker-compose.yml
# Restart both services
docker-compose restart db api
```

### Payment Not Working
```bash
# Verify environment variables set:
echo $PAYSTACK_SECRET_KEY

# Check Paystack dashboard for errors
# Ensure webhook URL is accessible from internet (production)
```

---

## 📚 Next Steps

1. **Read Full Documentation**: See [DEPLOYMENT.md](./DEPLOYMENT.md)
2. **Configure Frontend**: Update `client/.env` with API URL
3. **Setup Monitoring**: Configure logging and alerts
4. **Enable Backups**: Setup automated database backups
5. **Load Test**: Test with expected traffic volume

---

## 💡 Tips

- Use **test mode** Paystack keys during development
- Keep `.env` file secure and never commit it
- Run database backups before major changes
- Monitor logs regularly for errors
- Use **docker-compose.yml** for development
- Use **docker-compose.prod.yml** for production
- Enable pgAdmin only when needed (security)

---

## 📞 Need Help?

- **Documentation**: [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Admin Setup**: [ADMIN_SETUP.md](./ADMIN_SETUP.md)
- **Issues**: Create a GitHub issue
- **Support**: Contact development team

---

**Happy Deploying! 🚀**
