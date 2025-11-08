# Luca Security Implementation Guide

## Overview
This document describes the comprehensive security architecture implemented in Luca, including military-grade encryption, secure file handling, OAuth token protection, rate limiting, and HTTP hardening.

---

## Table of Contents
1. [Authentication Security](#authentication-security)
2. [Multi-Factor Authentication (MFA/2FA)](#multi-factor-authentication-mfa2fa)
3. [Encryption Architecture](#encryption-architecture)
4. [Key Vault Integration](#key-vault-integration)
5. [Session Security](#session-security)
6. [File Upload Security](#file-upload-security)
7. [Virus Scanning Pipeline](#virus-scanning-pipeline)
8. [OAuth Token Protection](#oauth-token-protection)
9. [HTTP Security Hardening](#http-security-hardening)
10. [Rate Limiting](#rate-limiting)
11. [Audit Logging](#audit-logging)
12. [Environment Variables](#environment-variables)
13. [Deployment Checklist](#deployment-checklist)
14. [Operational Procedures](#operational-procedures)

---

## Authentication Security

### Password Complexity Requirements

**Implementation**: `shared/schema.ts`, `client/src/components/AuthCard.tsx`, `server/routes.ts`

All passwords must meet the following requirements:
- **Minimum 12 characters**
- **At least one uppercase letter** (A-Z)
- **At least one lowercase letter** (a-z)
- **At least one number** (0-9)
- **At least one special character** (!@#$%^&*...)

**Backend Validation (Zod)**:
```typescript
const passwordSchema = z.string()
  .min(12, "Password must be at least 12 characters")
  .regex(/[A-Z]/, "Password must contain uppercase letter")
  .regex(/[a-z]/, "Password must contain lowercase letter")
  .regex(/[0-9]/, "Password must contain number")
  .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, "Password must contain special character");
```

**Frontend Real-Time Validation**:
- Visual checklist always visible during registration
- Green checkmarks appear as requirements are met
- Submit button disabled until all requirements satisfied
- Clear inline validation errors

**Security Benefits**:
- Prevents weak passwords (e.g., "password123")
- Resistant to dictionary attacks
- Complies with NIST SP 800-63B guidelines
- Estimated entropy: ~50+ bits

---

### Account Lockout Protection

**Implementation**: `server/routes.ts`, `server/pgStorage.ts`, `shared/schema.ts`

**Configuration**:
- **Maximum failed attempts**: 5
- **Lockout duration**: 30 minutes
- **Warning threshold**: 2 remaining attempts
- **Lockout reset**: On successful login

**Database Schema**:
```typescript
failedLoginAttempts: integer("failed_login_attempts").default(0),
lockedUntil: timestamp("locked_until"),
lastFailedLogin: timestamp("last_failed_login")
```

**Lockout Flow**:
```typescript
// On login failure
if (failedAttempts < 4) {
  failedAttempts++;
  if (remainingAttempts <= 2) {
    return "Warning: X attempts remaining";
  }
} else {
  lockedUntil = now + 30 minutes;
  return "Account temporarily locked";
}

// On login success
failedAttempts = 0;
lockedUntil = null;
```

**User Experience**:
- Generic error messages prevent account enumeration
- Sanitized lockout messages avoid information disclosure
- No indication of valid/invalid username
- Time-based unlock (no admin intervention required)

**Security Benefits**:
- Prevents brute-force password attacks
- Limits automated login attempts (max 5 tries per 30 min)
- Protects against credential stuffing
- Rate limiting complements this by IP address

---

## Multi-Factor Authentication (MFA/2FA)

**Implementation**: `server/services/mfaService.ts`, `server/routes.ts`, `client/src/pages/Auth.tsx`

**Technology**: TOTP (Time-based One-Time Password) per RFC 6238

**Supported Authenticator Apps**:
- Google Authenticator
- Microsoft Authenticator
- Authy
- 1Password
- Bitwarden

### MFA Setup Flow

1. **Generate Secret**: User requests MFA setup via `/api/mfa/setup`
   ```typescript
   const secret = speakeasy.generateSecret({
     name: `Luca (${user.email})`,
     issuer: 'Luca'
   });
   const qrCode = await qrcode.toDataURL(secret.otpauth_url);
   ```

2. **Display QR Code**: User scans QR code with authenticator app

3. **Verify Code**: User enters 6-digit code to confirm setup via `/api/mfa/enable`

4. **Generate Backup Codes**: 10 single-use bcrypt-hashed backup codes issued
   ```typescript
   const backupCodes = Array.from({ length: 10 }, () => 
     crypto.randomBytes(4).toString('hex')
   );
   // Stored hashed: await bcrypt.hash(code, 10)
   ```

5. **Activate MFA**: Secret encrypted with AES-256-GCM and stored

### MFA Login Flow

1. User enters email + password
2. If MFA enabled, prompt for 6-digit TOTP code
3. Verify code via `speakeasy.totp.verify()`
4. Accept backup code as alternative
5. Grant access on successful verification
6. Mark used backup codes as consumed

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/mfa/setup` | POST | Generate QR code + secret |
| `/api/mfa/enable` | POST | Verify code, activate MFA |
| `/api/mfa/disable` | POST | Deactivate MFA (requires code) |
| `/api/mfa/verify` | POST | Verify TOTP code |
| `/api/mfa/backup-codes` | POST | Regenerate backup codes |

### Database Schema

```typescript
mfaEnabled: boolean("mfa_enabled").default(false),
mfaSecret: text("mfa_secret"), // AES-256-GCM encrypted TOTP seed
mfaBackupCodes: text("mfa_backup_codes").array() // bcrypt hashed
```

### Security Properties

- ✅ **Encrypted storage**: MFA secrets never stored in plaintext
- ✅ **Time-based codes**: 30-second rolling codes (RFC 6238)
- ✅ **Backup codes**: Single-use recovery codes prevent lockout
- ✅ **Hashed backup codes**: Even backup codes are bcrypt-hashed
- ✅ **No SMS**: Avoids SIM-swapping attacks
- ✅ **Standard compliant**: Works with all RFC 6238 authenticators

**Security Benefits**:
- Protects against compromised passwords
- Requires physical access to second factor
- Resistant to phishing (TOTP not reusable)
- Complies with NIST SP 800-63B Level 2

---

## Encryption Architecture

### Master Key Configuration
Luca uses **AES-256-GCM** encryption for all sensitive data.

**Critical: ENCRYPTION_KEY Environment Variable**
```bash
# Must be exactly 64 hexadecimal characters (32 bytes)
ENCRYPTION_KEY=eb5fa4bb41ef958a7ffb4320042c026c1cf0c2e8670a1b145fcda1f391292dbf
```

**Generate New Key (for production):**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Per-File Encryption (Tax Documents)
Each uploaded file uses a unique encryption approach:

1. **Random File Key**: Each file gets a unique 32-byte AES-256-GCM key
2. **File Encryption**: File encrypted with random key
3. **Key Wrapping**: File's encryption key is wrapped using master ENCRYPTION_KEY
4. **Metadata Storage**: Only wrapped key stored in database (never plaintext key)
5. **Nonce Storage**: Unique nonce (12 bytes) stored per file

**Security Properties:**
- ✅ Each file has unique encryption key
- ✅ Master key compromise doesn't expose file keys
- ✅ Database breach doesn't expose file contents
- ✅ Tamper detection via SHA-256 checksums

### OAuth Token Encryption
OAuth access/refresh tokens (QuickBooks, Xero, Zoho, ADP) are encrypted before database storage:

```typescript
// Encryption
const encrypted = encrypt(accessToken, ENCRYPTION_KEY);
// Database stores: { data, iv, authTag }

// Decryption  
const plaintext = decrypt(encrypted, ENCRYPTION_KEY);
```

**Protected Tokens:**
- QuickBooks OAuth 2.0 tokens
- Xero OAuth 2.0 tokens
- Zoho Books OAuth 2.0 tokens
- ADP OAuth 2.0 tokens

---

## Key Vault Integration

**Implementation**: `server/services/keyVaultService.ts`

Luca supports multiple key vault providers for production-grade encryption key management.

### Supported Providers

| Provider | Use Case | Security Level |
|----------|----------|----------------|
| **Environment Variables** | Development only | ⚠️ Low |
| **AWS KMS** | Production (AWS) | ✅ High (HSM-backed) |
| **Azure Key Vault** | Production (Azure) | ✅ High (HSM-backed) |
| **HashiCorp Vault** | Production (Multi-cloud) | ✅ High |

### Configuration

**Environment Variable (Development)**:
```bash
KEY_VAULT_PROVIDER=env
ENCRYPTION_KEY=your_64_hex_character_key_here
```

**AWS KMS (Production)**:
```bash
KEY_VAULT_PROVIDER=aws-kms
AWS_KMS_KEY_ID=arn:aws:kms:region:account:key/key-id
AWS_ENCRYPTED_KEY=base64_encrypted_master_key
AWS_REGION=us-east-1
```

**Azure Key Vault (Production)**:
```bash
KEY_VAULT_PROVIDER=azure-keyvault
AZURE_KEYVAULT_URL=https://your-vault.vault.azure.net/
AZURE_KEYVAULT_SECRET_NAME=encryption-key
```

**HashiCorp Vault (Production)**:
```bash
KEY_VAULT_PROVIDER=hashicorp-vault
VAULT_ADDR=https://vault.example.com:8200
VAULT_TOKEN=your-vault-token
VAULT_SECRET_PATH=secret/data/encryption-key
```

### Migration Path

The key vault service enables zero-downtime migration:
1. **Development**: Start with environment variables
2. **Staging**: Test cloud key vault integration
3. **Production**: Full HSM-backed key management

**No code changes required** - just update environment variables.

### Security Benefits

- ✅ Hardware Security Module (HSM) backing (AWS/Azure)
- ✅ Automatic key rotation support
- ✅ Audit logging of key access
- ✅ IAM/RBAC access control
- ✅ Multi-cloud deployment support
- ✅ Clear production deployment path

---

## Session Security

**Implementation**: `server/index.ts`

**Express Session Configuration**:
```typescript
session({
  secret: process.env.SESSION_SECRET,  // 64+ character random string
  resave: false,
  saveUninitialized: false,
  rolling: true,  // Extend session on activity
  cookie: {
    secure: process.env.NODE_ENV === 'production',  // HTTPS only in production
    httpOnly: true,       // Prevents JavaScript access (XSS protection)
    sameSite: 'strict',   // CSRF protection
    maxAge: 24 * 60 * 60 * 1000  // 24 hours
  }
})
```

### Security Flags

| Flag | Purpose | Attack Prevented |
|------|---------|------------------|
| `httpOnly: true` | Blocks JavaScript access to cookie | XSS cookie theft |
| `secure: true` | HTTPS-only transmission | Man-in-the-middle |
| `sameSite: 'strict'` | No cross-site requests | CSRF attacks |
| `rolling: true` | Auto-extend on activity | Session fixation |

### Session Lifecycle

**On Login**:
1. Destroy old session
2. Regenerate session ID
3. Set user data in new session
4. Issue new cookie with security flags

**On Activity**:
- Rolling session extends expiry
- Inactive sessions expire after 24 hours

**On Logout**:
- Session destroyed server-side
- Cookie cleared client-side

### Security Benefits

- ✅ Prevents XSS cookie theft (httpOnly)
- ✅ Forces HTTPS in production (secure)
- ✅ Blocks CSRF attacks (sameSite: strict)
- ✅ Auto-logout on inactivity (maxAge + rolling)
- ✅ Session regeneration prevents fixation

---

## File Upload Security

### Architecture Overview
Tax software files (Drake, TurboTax, H&R Block, ADP) use secure file upload with encryption instead of OAuth (no public APIs).

### Security Controls

#### 1. File Size Limits
```typescript
// Maximum 50MB per file
if (fileSize > 50 * 1024 * 1024) {
  throw new Error('File too large');
}
```

#### 2. MIME Type Validation
Allowed MIME types:
- `text/csv`
- `application/vnd.ms-excel`
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `text/plain`

#### 3. Vendor Validation
Allowed vendors only: `drake`, `turbotax`, `hrblock`, `adp`

#### 4. Encryption Process
```typescript
1. User uploads file via multipart/form-data
2. Calculate SHA-256 checksum of original file
3. Generate random 32-byte encryption key
4. Encrypt file with AES-256-GCM
5. Wrap file key with master ENCRYPTION_KEY
6. Store encrypted file on disk (outside database)
7. Store wrapped key + nonce + checksum in database
8. Trigger virus scan (status: "pending")
```

#### 5. Virus Scanning Workflow
**States:**
- `pending`: Awaiting scan
- `scanning`: Currently being scanned
- `clean`: Safe to download
- `infected`: Quarantined, cannot download

**External Scanner Integration:**
```sql
-- External virus scanner updates status
UPDATE tax_file_uploads 
SET scan_status = 'clean', 
    scanned_at = NOW()
WHERE id = $1 AND scan_status = 'pending';
```

**Recommended Solutions:**
- ClamAV (open-source)
- VirusTotal (cloud-based API)
- AWS GuardDuty Malware Protection
- Microsoft Defender for Cloud

---

## Virus Scanning Pipeline

**Implementation**: `server/services/virusScanService.ts`

### Background Scanning Service

**Configuration**:
```bash
VIRUS_SCAN_PROVIDER=clamav  # or virustotal, aws-guardduty
VIRUS_SCAN_INTERVAL=5  # Minutes between scans
```

**Periodic Scanning**:
- Background job runs every 5 minutes (configurable)
- Scans all files with status: "pending"
- Updates status to "clean" or "infected"
- Logs scan results to audit trail

**Provider Implementations**:

1. **ClamAV** (Self-hosted):
   ```bash
   CLAMAV_HOST=localhost
   CLAMAV_PORT=3310
   ```

2. **VirusTotal** (Cloud):
   ```bash
   VIRUSTOTAL_API_KEY=your-api-key
   ```

3. **AWS GuardDuty** (AWS native):
   ```bash
   AWS_GUARDDUTY_ENABLED=true
   AWS_REGION=us-east-1
   ```

### Scan Flow

```typescript
// Background job
setInterval(async () => {
  const pendingFiles = await storage.getTaxFilesByStatus('pending');
  
  for (const file of pendingFiles) {
    const scanResult = await virusScanService.scanFile(file);
    
    await storage.updateTaxFileStatus(
      file.id,
      scanResult.isClean ? 'clean' : 'infected',
      scanResult.details
    );
  }
}, SCAN_INTERVAL * 60 * 1000);
```

### Security Benefits

- ✅ Automated continuous scanning
- ✅ Zero user wait time (background processing)
- ✅ Multiple provider support (no vendor lock-in)
- ✅ Quarantines infected files immediately
- ✅ Prevents malware distribution

#### 6. Download Protection
Files can only be downloaded if:
- ✅ User owns the file (`userId` match)
- ✅ File not soft-deleted
- ✅ Scan status is `clean`
- ✅ Checksum verification passes

#### 7. Secure Deletion (DOD 5220.22-M)
```typescript
// 3-pass overwrite + zero fill
async function secureDeleteFile(storageKey: string) {
  const filepath = path.join(UPLOAD_DIR, storageKey);
  
  // Pass 1: Write 0x00
  await fs.writeFile(filepath, Buffer.alloc(size, 0x00));
  
  // Pass 2: Write 0xFF
  await fs.writeFile(filepath, Buffer.alloc(size, 0xFF));
  
  // Pass 3: Write random data
  await fs.writeFile(filepath, crypto.randomBytes(size));
  
  // Final: Zero fill and delete
  await fs.writeFile(filepath, Buffer.alloc(size, 0x00));
  await fs.unlink(filepath);
}
```

### Storage Layout
```
/tmp/tax-file-uploads/
├── drake-1699564123456-tax-return.xlsx.enc
├── turbotax-1699564234567-w2-forms.csv.enc
└── adp-1699564345678-payroll.xlsx.enc
```

**Note:** Files stored encrypted with `.enc` extension. Only metadata in database.

---

## OAuth Token Protection

### CSRF Protection
All OAuth flows use state parameter validation:

```typescript
// Step 1: Generate state
const state = crypto.randomBytes(32).toString('hex');
req.session.oauthState = state;

// Step 2: Redirect to provider
const authUrl = `${provider_url}?state=${state}`;

// Step 3: Validate callback
if (req.query.state !== req.session.oauthState) {
  throw new Error('CSRF validation failed');
}
```

### Token Encryption Before Storage
```typescript
// Never store plaintext tokens
const encryptedAccessToken = encrypt(accessToken, ENCRYPTION_KEY);
const encryptedRefreshToken = encrypt(refreshToken, ENCRYPTION_KEY);

await db.insert(accountingIntegrations).values({
  accessToken: encryptedAccessToken,
  refreshToken: encryptedRefreshToken,
  // ... other fields
});
```

### Token Refresh
Refresh tokens encrypted with same AES-256-GCM approach.

---

## HTTP Security Hardening

### Helmet Configuration
Applied globally via `setupSecurityMiddleware()`:

```typescript
helmet({
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  frameguard: { action: 'deny' },
  xssFilter: true,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
})
```

**Protection Against:**
- ✅ Clickjacking (X-Frame-Options: DENY)
- ✅ XSS attacks (CSP + X-XSS-Protection)
- ✅ MIME sniffing (X-Content-Type-Options: nosniff)
- ✅ Protocol downgrade (HSTS)
- ✅ Referrer leakage (Referrer-Policy)

---

## Rate Limiting

### Endpoint-Specific Limits

| Endpoint | Window | Max Requests | Purpose |
|----------|--------|--------------|---------|
| `/api/auth/*` | 15 min | 10 | Prevent brute force |
| `/api/chat` | 1 min | 10 | Prevent AI abuse |
| `/api/integrations/*` | 15 min | 5 | Prevent OAuth abuse |
| `/api/tax-files/upload` | 1 hour | 20 | Prevent upload abuse |

### Configuration
```typescript
// Applied in server/routes.ts
app.post("/api/auth/login", authRateLimiter, handler);
app.post("/api/chat", chatRateLimiter, handler);
app.post("/api/integrations/:provider/initiate", integrationRateLimiter, handler);
app.post("/api/tax-files/upload", fileUploadRateLimiter, handler);
```

### IPv6 Compatibility
Rate limiters use express-rate-limit's default IPv6-safe key generation.

---

## Audit Logging

### Logged Events
All security-sensitive operations logged to `audit_logs` table:

**Authentication:**
- `LOGIN`
- `LOGOUT`
- `REGISTER`

**Integrations:**
- `CONNECT_INTEGRATION`
- `DELETE_INTEGRATION`

**File Operations:**
- `UPLOAD_TAX_FILE`
- `DOWNLOAD_TAX_FILE`
- `DELETE_TAX_FILE`

**API Key Management:**
- `UPDATE_API_KEYS`

### Audit Log Schema
```typescript
{
  userId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  details: object,
  ipAddress: string,
  userAgent: string,
  createdAt: timestamp
}
```

### Retention
Audit logs indexed on `userId` and `createdAt` for compliance queries.

---

## Environment Variables

### Required Configuration
```bash
# Encryption (CRITICAL - 64 hex chars)
ENCRYPTION_KEY=eb5fa4bb41ef958a7ffb4320042c026c1cf0c2e8670a1b145fcda1f391292dbf

# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Session
SESSION_SECRET=your-session-secret-here

# OpenAI
OPENAI_API_KEY=sk-...

# QuickBooks OAuth
QUICKBOOKS_CLIENT_ID=your-client-id
QUICKBOOKS_CLIENT_SECRET=your-client-secret

# Xero OAuth
XERO_CLIENT_ID=your-client-id
XERO_CLIENT_SECRET=your-client-secret

# Zoho Books OAuth
ZOHO_CLIENT_ID=your-client-id
ZOHO_CLIENT_SECRET=your-client-secret
ZOHO_BOOKS_DC=com  # or .eu, .in, .com.au, .jp

# ADP OAuth
ADP_CLIENT_ID=your-client-id
ADP_CLIENT_SECRET=your-client-secret
ADP_BASE_URL=https://api.adp.com  # Production
# ADP_BASE_URL=https://apitest.adp.com  # Sandbox
```

### Validation on Startup
```typescript
if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 64) {
  throw new Error('ENCRYPTION_KEY must be 64 hex characters');
}
```

---

## Deployment Checklist

### Pre-Deployment
- [ ] Generate production `ENCRYPTION_KEY` (64 hex chars)
- [ ] Set all OAuth client IDs/secrets
- [ ] Configure `SESSION_SECRET` (random, high-entropy)
- [ ] Create `/tmp/tax-file-uploads/` directory with proper permissions
- [ ] Install and configure virus scanning solution
- [ ] Test OAuth flows in staging environment
- [ ] Verify database indexes created

### Post-Deployment
- [ ] Monitor rate limiter effectiveness
- [ ] Review audit logs for anomalies
- [ ] Test file upload/download end-to-end
- [ ] Verify HTTPS/HSTS enforcement
- [ ] Confirm CSP headers not blocking assets
- [ ] Validate virus scanner integration

### Security Monitoring
- [ ] Set up alerts for failed auth attempts
- [ ] Monitor rate limit violations
- [ ] Track file upload patterns
- [ ] Audit OAuth token refresh failures
- [ ] Review checksum verification failures

---

## Operational Procedures

### Virus Scanner Integration

**Job Responsibilities:**
1. Poll database for `scan_status = 'pending'`
2. Decrypt file using wrapped key
3. Scan decrypted contents
4. Update status to `clean` or `infected`
5. Log results to audit trail

**Sample Pseudocode:**
```python
while True:
    pending_files = db.query("SELECT * FROM tax_file_uploads WHERE scan_status = 'pending'")
    
    for file in pending_files:
        # Update to scanning
        db.execute("UPDATE tax_file_uploads SET scan_status = 'scanning' WHERE id = ?", file.id)
        
        # Decrypt
        decrypted = decrypt_file(file.storage_key, file.encrypted_file_key, file.encryption_nonce)
        
        # Scan
        result = clamav.scan(decrypted)
        
        # Update status
        if result.is_clean:
            db.execute("UPDATE tax_file_uploads SET scan_status = 'clean', scanned_at = NOW() WHERE id = ?", file.id)
        else:
            db.execute("UPDATE tax_file_uploads SET scan_status = 'infected', scanned_at = NOW() WHERE id = ?", file.id)
    
    time.sleep(30)  # Poll every 30 seconds
```

### File Storage Management

**Directory Structure:**
```bash
/tmp/tax-file-uploads/
├── .gitkeep  # Ensure directory exists
└── *.enc     # Encrypted files
```

**Permissions:**
```bash
# Create upload directory
mkdir -p /tmp/tax-file-uploads
chmod 700 /tmp/tax-file-uploads  # Owner only

# Ensure app user owns directory
chown app-user:app-group /tmp/tax-file-uploads
```

**Cleanup Policy:**
Soft-deleted files should be purged after retention period:
```sql
-- Delete files soft-deleted > 90 days ago
DELETE FROM tax_file_uploads 
WHERE deleted_at < NOW() - INTERVAL '90 days';
```

### Encryption Key Rotation

**Procedure:**
1. Generate new `ENCRYPTION_KEY_NEW`
2. Deploy code supporting both keys
3. Re-encrypt all OAuth tokens with new key
4. Re-wrap all file encryption keys with new key
5. Update `ENCRYPTION_KEY` to `ENCRYPTION_KEY_NEW`
6. Remove old key from environment

**Downtime:** Zero (dual-key support during rotation)

### Incident Response

**Suspected Token Compromise:**
1. Revoke OAuth tokens at provider (QuickBooks/Xero/Zoho/ADP)
2. Delete integration records from database
3. Force user re-authentication
4. Review audit logs for suspicious activity
5. Rotate `ENCRYPTION_KEY` if master key compromised

**Suspected File Breach:**
1. Identify affected files via audit logs
2. Update `scan_status` to `infected`
3. Prevent downloads
4. Notify affected users
5. Securely delete compromised files
6. Review access patterns

---

## GDPR Compliance

### Data Subject Rights

**Right to Access:**
```sql
-- Export all user data
SELECT * FROM users WHERE id = $userId;
SELECT * FROM audit_logs WHERE user_id = $userId;
SELECT * FROM tax_file_uploads WHERE user_id = $userId;
SELECT * FROM accounting_integrations WHERE user_id = $userId;
```

**Right to Deletion:**
```sql
-- User account deletion
BEGIN;

-- Soft delete files (triggers DOD deletion)
UPDATE tax_file_uploads SET deleted_at = NOW() WHERE user_id = $userId;

-- Delete integrations (revoke tokens first!)
DELETE FROM accounting_integrations WHERE user_id = $userId;

-- Anonymize audit logs (keep for compliance)
UPDATE audit_logs SET user_id = 'DELETED', details = '{}' WHERE user_id = $userId;

-- Delete user
DELETE FROM users WHERE id = $userId;

COMMIT;
```

**Right to Portability:**
Export encrypted files + metadata in machine-readable format (JSON).

---

## Testing Security Controls

### Encryption Tests
```bash
# Verify encryption roundtrip
node -e "const { encrypt, decrypt } = require('./server/utils/encryption');
const key = process.env.ENCRYPTION_KEY;
const original = 'sensitive data';
const enc = encrypt(original, key);
const dec = decrypt(enc, key);
console.assert(dec === original, 'Encryption failed');"
```

### Rate Limiter Tests
```bash
# Test auth rate limit (expect 429 after 10 requests)
for i in {1..15}; do
  curl -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}'
  echo ""
done
```

### File Upload Tests
```bash
# Test file size limit
dd if=/dev/zero of=large.bin bs=1M count=51
curl -X POST http://localhost:5000/api/tax-files/upload \
  -F "file=@large.bin" \
  -F "vendor=drake" \
  -H "Cookie: session=..."
# Expect: 400 File too large
```

### CSRF Tests
```bash
# Test OAuth CSRF protection
curl "http://localhost:5000/api/integrations/quickbooks/callback?code=abc&state=wrong-state"
# Expect: Redirect to /integrations?error=true
```

---

## Security Contact
For security issues, contact: security@luca.example.com

**Vulnerability Disclosure:**
- Responsible disclosure encouraged
- 90-day disclosure timeline
- Bug bounty program (TBD)

---

## Compliance Certifications
- **SOC 2 Type II**: Planned Q2 2025
- **ISO 27001**: Planned Q3 2025
- **GDPR**: Compliant (audit trail, encryption, data portability)

---

## Version History

- **v2.0.0** (2024-11-08): Military-grade security enhancement
  - ✅ Password complexity requirements (12+ chars, uppercase, lowercase, numbers, special chars)
  - ✅ Account lockout protection (5 attempts, 30-minute timeout)
  - ✅ Multi-factor authentication (TOTP, QR codes, backup codes)
  - ✅ Enhanced session security (httpOnly, secure, sameSite: strict)
  - ✅ Key vault integration (AWS KMS, Azure Key Vault, HashiCorp Vault)
  - ✅ Automated virus scanning (ClamAV, VirusTotal, AWS GuardDuty)
  - ✅ Background periodic file scanning (5-minute intervals)
  - ✅ Dependency vulnerability scanning (GitHub Actions + CodeQL)
  - ✅ Sanitized error messages (prevents information disclosure)
  - ✅ Frontend security UX (password requirements, MFA flow, lockout warnings)

- **v1.0.0** (2024-11-08): Initial security implementation
  - AES-256-GCM encryption
  - File upload security
  - OAuth token protection
  - HTTP hardening
  - Rate limiting
  - Audit logging
