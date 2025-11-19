import { Request, Response, NextFunction } from 'express';

declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  console.log('[Auth] Session check:', {
    sessionExists: !!req.session,
    userId: req.session?.userId,
    sessionID: req.sessionID,
    cookies: req.headers.cookie?.substring(0, 50)
  });
  
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

export function getCurrentUserId(req: Request): string | null {
  return req.session.userId || null;
}
