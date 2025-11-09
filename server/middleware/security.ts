import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { Express } from 'express';

/**
 * Military-grade security middleware
 * - Helmet for HTTP security headers
 * - Rate limiting to prevent abuse
 * - Content Security Policy
 * - HSTS
 * - XSS Protection
 */

export function setupSecurityMiddleware(app: Express) {
  // Trust proxy for rate limiting behind reverse proxy
  app.set('trust proxy', 1);
  
  // Helmet - Security headers
  app.use(helmet({
    // HTTP Strict Transport Security (HSTS)
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Vite requires unsafe-inline in dev
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    
    // X-Frame-Options: Prevent clickjacking
    frameguard: {
      action: 'deny'
    },
    
    // X-Content-Type-Options: Prevent MIME sniffing
    noSniff: true,
    
    // X-XSS-Protection
    xssFilter: true,
    
    // Referrer Policy
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin'
    },
    
    // Hide X-Powered-By header
    hidePoweredBy: true,
  }));
}

/**
 * Rate limiting configurations for different endpoints
 */

// General API rate limit: 100 requests per 15 minutes
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/api/health';
  }
});

// Auth endpoints: Stricter rate limiting
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts, please try again later.',
  skipSuccessfulRequests: true, // Don't count successful logins
});

// File upload rate limiter: Very strict
export const fileUploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 uploads per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Upload limit exceeded. Please try again later.',
});

// Chat/AI endpoints: Moderate rate limiting
export const chatRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 messages per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests. Please slow down.',
});

// OAuth integration rate limiter
export const integrationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 integration attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many integration attempts. Please try again later.',
});
