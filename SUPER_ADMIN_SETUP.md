# Super Admin Access Setup

## Overview

The **System Monitoring Dashboard** is only accessible to **Super Admins** - not regular admins or users.

### Access Levels:

| Role | Can Access |
|------|------------|
| **Super Admin** | ✅ System Monitoring, Deployment Management, Security Threats, APM Metrics, Maintenance Mode + All admin features |
| **Regular Admin** | ✅ Users, Subscriptions, Coupons, Business Analytics |
| **Enterprise Users** | ❌ No admin access |
| **Regular Users** | ❌ No admin access |

---

## Setup Super Admin Access

### 1. Add Super Admin Emails to Environment

```bash
# In your .env file
SUPER_ADMIN_EMAILS=your-email@example.com,another-admin@example.com
```

**Multiple emails:** Separate with commas (no spaces)

### 2. Create Admin User in Database

First, register the user normally, then promote to admin:

```sql
-- Update user to admin status
UPDATE users 
SET "isAdmin" = true 
WHERE email = 'your-email@example.com';
```

Or use the existing admin user management:
1. Register account normally
2. Have another admin promote you via `/admin/users`
3. Add your email to `SUPER_ADMIN_EMAILS`

### 3. Verify Access

1. Login with your super admin email
2. Go to `/admin` - you should see "System Monitor" in navigation
3. Click "System Monitor" to access the dashboard
4. You should see: system health, security threats, API metrics, etc.

**Regular admins will NOT see the System Monitor link**

---

## Security Best Practices

### Production Configuration

```bash
# .env.production
SUPER_ADMIN_EMAILS=cto@company.com,devops@company.com

# Keep this list VERY small (1-3 people)
# These users can:
# - See all security threats
# - Deploy new versions
# - Enable maintenance mode
# - View sensitive system metrics
# - Rollback deployments
```

### Access Control Logic

**Super Admin Check:**
```typescript
// server/middleware/superAdmin.ts
const SUPER_ADMIN_EMAILS = process.env.SUPER_ADMIN_EMAILS.split(',');
if (!SUPER_ADMIN_EMAILS.includes(user.email)) {
  return res.status(403).json({ error: 'Super admin access required' });
}
```

**Frontend Navigation:**
```typescript
// client/src/components/AdminLayout.tsx
const isSuperAdmin = user?.email && SUPER_ADMIN_EMAILS.includes(user.email);
// System Monitor link only shown if isSuperAdmin === true
```

---

## What Regular Admins Can Do

Regular admins (`isAdmin = true` but NOT in `SUPER_ADMIN_EMAILS`) can access:

✅ **User Management** - `/admin/users`
- View all users
- Update subscription tiers
- Toggle admin status (for other users)
- View user analytics

✅ **Subscription Management** - `/admin/subscriptions`
- View all subscriptions
- Filter by status, tier, payment gateway
- Search by user email
- View payment history

✅ **Coupon Management** - `/admin/coupons`
- Create discount codes
- Set expiration dates
- Track usage statistics
- Deactivate coupons

✅ **Business Analytics** - `/admin/analytics`
- Revenue metrics
- User growth trends
- Churn analysis
- Feature usage statistics

❌ **System Monitoring** (Super Admin Only)
- System health dashboard
- Security threat logs
- APM metrics and alerts
- Deployment management
- Maintenance mode controls

---

## Testing Super Admin Access

### Development Mode

```bash
# .env.local
SUPER_ADMIN_EMAILS=dev@localhost,admin@localhost

# Start the app
npm run dev

# Login with dev@localhost
# Navigate to /admin/system-monitoring
# Should see full monitoring dashboard
```

### Check Access Denied

1. Login with regular admin (not in whitelist)
2. Try to access `/admin/system-monitoring`
3. Should see "System Monitor" link hidden
4. Direct URL access returns 403 error:
   ```json
   {
     "error": "Super admin access required",
     "message": "Only super admins can access system monitoring."
   }
   ```

---

## Production Deployment Checklist

Before deploying:

- [ ] Set `SUPER_ADMIN_EMAILS` in production environment
- [ ] Verify only 1-3 trusted emails are listed
- [ ] Test access with super admin account
- [ ] Test access denied with regular admin account
- [ ] Document who has super admin access
- [ ] Set up alerts for super admin actions (optional)

---

## Removing Super Admin Access

**Temporarily:**
```bash
# Remove email from environment variable
SUPER_ADMIN_EMAILS=remaining-admin@example.com
# Restart app
```

**Permanently:**
```sql
-- Remove admin status entirely
UPDATE users 
SET "isAdmin" = false 
WHERE email = 'former-admin@example.com';
```

---

## Audit Logging

All super admin actions are logged:

```typescript
// Example log output
[SuperAdmin] Access granted to cto@company.com
[SuperAdmin] Deployment started by cto@company.com: v1.2.3
[SuperAdmin] Maintenance mode enabled by devops@company.com
[SuperAdmin] Access denied for admin user: regular-admin@company.com
```

Check logs with:
```bash
# Find all super admin actions
grep "\[SuperAdmin\]" logs/*.log
```

---

## Troubleshooting

### "System Monitor" link not showing

**Cause:** User email not in `SUPER_ADMIN_EMAILS`

**Fix:**
1. Check `.env` file has correct email
2. Restart server after changing environment variables
3. Clear browser cache and re-login

### 403 Error when accessing `/admin/system-monitoring`

**Cause:** Email not in whitelist or not an admin

**Fix:**
1. Verify user has `isAdmin = true` in database
2. Verify user email is in `SUPER_ADMIN_EMAILS`
3. Check server logs for denial reason

### Frontend shows link but API returns 403

**Cause:** Frontend and backend environment mismatch

**Fix:**
```bash
# Ensure SUPER_ADMIN_EMAILS is set server-side
echo $SUPER_ADMIN_EMAILS

# Restart server
npm run dev
```

---

## Security Considerations

⚠️ **WARNING:** Super admins can:
- See all user data and system secrets
- Deploy code to production
- View security threat IPs and attack patterns
- Enable maintenance mode (disable the app)
- Rollback deployments (potential data loss)

**Only grant super admin access to:**
- CTO or VP of Engineering
- DevOps/Infrastructure lead
- Senior engineers responsible for production

**Never grant to:**
- Customer success team (use regular admin)
- Sales team (use regular admin)
- Temporary contractors (create time-limited accounts)
- Offshore developers (unless absolutely necessary)
