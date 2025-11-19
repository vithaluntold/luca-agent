import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import type { Express } from 'express';

/**
 * Military-grade security middleware
 * - CORS for cross-origin requests
 * - Helmet for HTTP security headers
 * - Rate limiting to prevent abuse
 * - Content Security Policy
 * - HSTS
 * - XSS Protection
 */

export function setupSecurityMiddleware(app: Express) {
  // Trust proxy for rate limiting behind reverse proxy
  app.set('trust proxy', 1);
  
  // CORS - Environment-specific origin allowlists with wildcard support
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  app.use(cors({
    origin: (origin, callback) => {
      // Allow same-origin requests (no origin header)
      if (!origin) return callback(null, true);
      
      try {
        const originUrl = new URL(origin);
        const hostname = originUrl.hostname.toLowerCase(); // Normalize to lowercase
        
        // Development: Allow localhost and 127.0.0.1
        if (isDevelopment) {
          if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return callback(null, true);
          }
          // Still allow Replit domains in dev for testing deployed previews
          if (hostname.endsWith('.repl.co') || hostname.endsWith('.replit.dev')) {
            return callback(null, true);
          }
          // Unknown origin in dev: Allow but warn (helps local testing)
          console.warn('[CORS] Unknown origin in development:', origin);
          return callback(null, true);
        }
        
        // Production: Strict wildcard matching for Replit domains only
        if (hostname.endsWith('.repl.co') || hostname.endsWith('.replit.dev')) {
          return callback(null, true);
        }
        
        // Production: Block unknown origins
        console.warn('[CORS] Blocked origin in production:', origin);
        callback(new Error('CORS policy: Origin not allowed'));
        
      } catch (err) {
        // Invalid origin URL
        console.error('[CORS] Invalid origin URL:', origin);
        callback(new Error('Invalid origin'));
      }
    },
    credentials: true, // Allow cookies for authenticated origins
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Set-Cookie'],
    maxAge: isDevelopment ? 600 : 86400, // 10min dev, 24h prod
  }));
  
  // Helmet - Security headers (environment-specific CSP)
  const isDev = process.env.NODE_ENV !== 'production';
  
  app.use(helmet({
    // HTTP Strict Transport Security (HSTS) - production only
    hsts: isDev ? false : {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    
    // Content Security Policy - Split by environment
    contentSecurityPolicy: {
      directives: isDev ? {
        // Development: Relaxed for Vite HMR (including ws://)
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Vite needs eval
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: [
          "'self'",
          "ws://localhost:*",
          "ws://127.0.0.1:*",
          "wss://localhost:*",
          "http://localhost:*",
          "http://127.0.0.1:*",
          "https://*.repl.co",
          "https://*.replit.dev",
          "wss://*.repl.co",
          "wss://*.replit.dev"
        ],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      } : {
        // Production: Strict security
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // TODO: Replace with nonce/hash system
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: [
          "'self'",
          "https://*.repl.co",
          "https://*.replit.dev",
          "wss://*.repl.co",
          "wss://*.replit.dev"
        ],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        upgradeInsecureRequests: [],
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
