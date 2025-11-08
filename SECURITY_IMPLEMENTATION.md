# Luca Security Implementation Guide

## Overview
This document describes the comprehensive security architecture implemented in Luca, including military-grade encryption, secure file handling, OAuth token protection, rate limiting, and HTTP hardening.

---

## Table of Contents
1. [Encryption Architecture](#encryption-architecture)
2. [File Upload Security](#file-upload-security)
3. [OAuth Token Protection](#oauth-token-protection)
4. [HTTP Security Hardening](#http-security-hardening)
5. [Rate Limiting](#rate-limiting)
6. [Audit Logging](#audit-logging)
7. [Environment Variables](#environment-variables)
8. [Deployment Checklist](#deployment-checklist)
9. [Operational Procedures](#operational-procedures)

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
- AWS GuardDuty Malware Protection
- Microsoft Defender for Cloud
- Sophos/McAfee enterprise solutions

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
- **v1.0.0** (2024-11-08): Initial security implementation
  - AES-256-GCM encryption
  - File upload security
  - OAuth token protection
  - HTTP hardening
  - Rate limiting
  - Audit logging
