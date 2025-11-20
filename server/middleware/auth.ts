import { Request, Response, NextFunction } from 'express';

declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    console.log('[Auth] Authentication failed:', {
      sessionID: req.sessionID,
      hasSession: !!req.session,
      sessionUserId: req.session?.userId,
      cookies: req.headers.cookie ? 'present' : 'missing',
      path: req.path,
      method: req.method
    });
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

export function getCurrentUserId(req: Request): string | null {
  return req.session.userId || null;
}
