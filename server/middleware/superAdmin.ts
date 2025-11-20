import { Request, Response, NextFunction } from 'express';
import { storage } from '../pgStorage';

/**
 * Super Admin Middleware - Only for system-level operations
 * 
 * Super admins have access to:
 * - System monitoring dashboard
 * - Security threat logs
 * - APM metrics and alerts
 * - Deployment management
 * - Maintenance mode controls
 * 
 * Regular admins can only access:
 * - User management
 * - Subscription management
 * - Coupons
 * - Business analytics
 */
export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = req.session.userId;
  
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const user = await storage.getUser(userId);
  
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  
  // Super admin check: email must be in whitelist
  const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || '').split(',').map(e => e.trim());
  
  if (!SUPER_ADMIN_EMAILS.includes(user.email)) {
    console.warn(`[SuperAdmin] Access denied for admin user: ${user.email}`);
    return res.status(403).json({ 
      error: 'Super admin access required',
      message: 'Only super admins can access system monitoring. Contact your system administrator.'
    });
  }
  
  console.log(`[SuperAdmin] Access granted to ${user.email}`);
  next();
}
