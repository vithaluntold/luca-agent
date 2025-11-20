# Redis Cloud Setup Guide

## Quick Setup (5 minutes)

### Option 1: Redis Cloud (Free Tier - Recommended)

1. **Sign up for Redis Cloud**
   - Go to https://redis.io/cloud/
   - Create free account (30MB free - enough for 10K users)
   - No credit card required

2. **Create Database**
   - Click "New Database"
   - Select "Free" plan
   - Choose region closest to your server
   - Copy connection URL

3. **Set Environment Variable**
   ```bash
   # In your .env file
   REDIS_URL=redis://default:your-password@your-endpoint:port
   ```

4. **Test Connection**
   ```bash
   npm run dev
   # Look for: [Redis] Connected successfully
   ```

### Option 2: Local Redis (Development)

**macOS:**
```bash
brew install redis
brew services start redis
# REDIS_URL=redis://localhost:6379 (default)
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install redis-server
sudo systemctl start redis
sudo systemctl enable redis
```

**Docker:**
```bash
docker run -d -p 6379:6379 --name redis redis:alpine
```

### Option 3: Deploy to Production

**Render.com (Easy):**
1. Go to Render Dashboard
2. Click "New" → "Redis"
3. Select free tier
4. Copy "Internal Redis URL"
5. Add to environment variables

**Railway.app:**
1. Add Redis plugin to project
2. Copy REDIS_URL from plugin
3. Automatically added to environment

**Heroku:**
```bash
heroku addons:create heroku-redis:mini
# REDIS_URL automatically configured
```

**AWS ElastiCache:**
1. Create ElastiCache cluster
2. Select t4g.micro (free tier eligible)
3. Copy endpoint URL
4. Format: redis://endpoint:6379

---

## Database Migration

After setting up Redis, apply database indexes:

```bash
npm run db:push
```

This creates 4 new indexes:
- `conversations_metadata_idx` - Fast metadata search
- `conversations_user_created_idx` - Pagination
- `messages_conversation_created_idx` - Message history
- `messages_role_created_idx` - Analytics

---

## Verification

Check if everything is working:

```bash
# Start the app
npm run dev

# You should see:
# [Redis] Connected successfully
# [JobQueue] Title generation queue ready
# [JobQueue] Analytics queue ready
# [JobQueue] File processing queue ready
```

---

## Troubleshooting

### Connection Failed
- Check REDIS_URL format: `redis://[user]:[password]@[host]:[port]`
- Verify firewall allows port 6379
- Check Redis Cloud IP whitelist (add 0.0.0.0/0 for development)

### Memory Issues
- Free tier: 30MB limit
- Monitor usage in Redis Cloud dashboard
- Set shorter TTLs if needed (in cache.ts)

### Performance
- Redis Cloud free tier: ~10K requests/sec
- Upgrade to paid tier for production at scale
- Consider Redis Cluster for 100K+ users

---

## Cost Analysis

| Service | Free Tier | Paid (Production) |
|---------|-----------|-------------------|
| Redis Cloud | 30MB free | $5/mo for 250MB |
| Render Redis | 25MB free | $7/mo for 1GB |
| Railway Redis | 512MB free | $5/mo for 1GB |
| AWS ElastiCache | 750hrs/mo (1yr) | $13/mo for cache.t4g.micro |
| Heroku Redis | 25MB free | $15/mo for 100MB |

**Recommendation:** Redis Cloud for cost-effectiveness at scale.
