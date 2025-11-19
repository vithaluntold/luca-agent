import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import MemoryStore from "memorystore";
import connectPg from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { VirusScanService } from "./services/virusScanService";

const app = express();

// Session secret (export for WebSocket authentication)
export const SESSION_SECRET = process.env.SESSION_SECRET || 'luca-session-secret-change-in-production';

// Create session store based on environment
// Development: Use MemoryStore (fast, simple)
// Production: Use PostgreSQL (persistent, works with autoscaling)
const createSessionStore = () => {
  if (process.env.NODE_ENV === 'production' && process.env.DATABASE_URL) {
    const PgStore = connectPg(session);
    return new PgStore({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
      ttl: 30 * 24 * 60 * 60, // 30 days in seconds
      tableName: 'sessions',
    });
  } else {
    const MemoryStoreSession = MemoryStore(session);
    return new MemoryStoreSession({
      checkPeriod: 86400000 // Prune expired entries every 24h
    });
  }
};

export const sessionStore = createSessionStore();

// Session configuration with hardened security
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: 'luca.sid', // Custom session name (hides tech stack)
  cookie: {
    httpOnly: true, // Prevents client-side JavaScript access
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: 'lax', // Good CSRF protection while allowing normal navigation
  },
  store: sessionStore,
  rolling: true, // Reset maxAge on every request (keeps active sessions alive)
}));

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  limit: '10mb', // Increased from default 100kb to handle file metadata and long messages
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    
    // Start periodic virus scanning for uploaded tax files
    const scanIntervalMinutes = parseInt(process.env.VIRUS_SCAN_INTERVAL || '5', 10);
    VirusScanService.startPeriodicScanning(scanIntervalMinutes);
    log(`Virus scanning enabled (provider: ${process.env.VIRUS_SCAN_PROVIDER || 'clamav'}, interval: ${scanIntervalMinutes}min)`);
  });
})();
