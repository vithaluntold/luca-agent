# Luca Integrations Architecture

## Overview
This document outlines the integration strategy, architecture, and implementation roadmap for Luca's accounting superintelligence platform. Our integration ecosystem enables seamless data exchange with accounting software, payment processors, banks, and business tools.

---

## Integration Categories

### 1. Accounting Software Integrations
**Priority: CRITICAL**

#### QuickBooks Online
- **Purpose**: Primary accounting software integration
- **Data Flow**: Bidirectional sync of transactions, invoices, expenses, customers
- **Authentication**: OAuth 2.0
- **API**: QuickBooks Online API v3
- **Key Features**:
  - Real-time transaction sync
  - Chart of accounts mapping
  - Invoice generation and tracking
  - Expense categorization
  - Multi-company support
- **Rate Limits**: 500 requests/minute per app
- **Webhooks**: Available for real-time updates

#### Xero
- **Purpose**: Secondary accounting platform (popular internationally)
- **Data Flow**: Bidirectional
- **Authentication**: OAuth 2.0
- **API**: Xero Accounting API
- **Key Features**:
  - Bank reconciliation
  - Invoice and bill management
  - Financial reporting
  - Multi-currency support
- **Rate Limits**: 60 requests/minute per organization

#### Zoho Books
- **Purpose**: Small business accounting
- **Data Flow**: Bidirectional
- **Authentication**: OAuth 2.0
- **API**: Zoho Books API v3

---

### 2. Banking & Financial Data
**Priority: CRITICAL**

#### Plaid
- **Purpose**: Bank account connections and transaction feeds
- **Data Flow**: Unidirectional (read-only)
- **Authentication**: Link Token + Access Token flow
- **Products**:
  - **Transactions**: Historical and real-time transaction data
  - **Auth**: Account and routing numbers for ACH
  - **Balance**: Real-time account balances
  - **Identity**: Account holder information
  - **Assets**: Asset reports for verification
- **Coverage**: 12,000+ financial institutions
- **Data Refresh**: Daily automatic sync
- **Security**: Bank-level encryption, SOC 2 Type II certified

**Implementation Strategy**:
```typescript
// Plaid Integration Flow
1. User clicks "Connect Bank Account"
2. Generate Link Token via /api/plaid/create_link_token
3. Launch Plaid Link UI (client-side)
4. User authenticates with bank
5. Exchange public_token for access_token
6. Store encrypted access_token in database
7. Fetch transactions via /api/plaid/transactions/get
8. Categorize and store in local database
9. Set up webhook for real-time updates
```

---

### 3. Payment Processing
**Priority: HIGH**

#### Stripe
- **Purpose**: Payment processing, revenue tracking, reconciliation
- **Data Flow**: Bidirectional
- **Authentication**: API Keys (publishable + secret)
- **Key Features**:
  - Payment intents and charges
  - Customer management
  - Subscription billing (already implemented for Luca subscriptions)
  - Payout tracking
  - Automatic reconciliation with bank deposits
- **Events via Webhooks**:
  - `payment_intent.succeeded`
  - `charge.refunded`
  - `payout.paid`
  - `invoice.payment_failed`

**Accounting Integration**:
- Auto-categorize Stripe fees as expenses
- Match deposits to bank transactions (via Plaid)
- Generate revenue reports by product/service

---

### 4. Document Management
**Priority: MEDIUM**

#### Google Drive
- **Purpose**: Secure storage for financial documents, receipts, tax forms
- **Authentication**: OAuth 2.0 (Google Sign-In)
- **API**: Google Drive API v3
- **Features**:
  - Auto-upload receipts and invoices
  - Organize by tax year and category
  - Share audit packages with CPAs
  - OCR integration with Google Cloud Vision
- **Folder Structure**:
  ```
  Luca Documents/
  ├── Tax Year 2025/
  │   ├── Receipts/
  │   ├── Invoices/
  │   ├── Bank Statements/
  │   └── Tax Returns/
  ├── Tax Year 2024/
  └── Audit Trail/
  ```

#### Dropbox Business
- **Purpose**: Alternative cloud storage
- **Authentication**: OAuth 2.0
- **API**: Dropbox API v2
- **Features**: Similar to Google Drive with enhanced team collaboration

---

### 5. Payroll Services
**Priority: MEDIUM**

#### ADP Workforce Now
- **Purpose**: Payroll data import for expense tracking
- **Data Flow**: Unidirectional (read-only)
- **Authentication**: OAuth 2.0 + API Credentials
- **Key Data**:
  - Employee wages and salaries
  - Tax withholdings
  - Benefits deductions
  - Employer tax obligations
- **Use Cases**:
  - Auto-categorize payroll expenses
  - Track quarterly tax payments
  - Generate payroll tax reports

#### Gusto
- **Purpose**: Small business payroll integration
- **API**: Gusto API v1
- **Features**:
  - Payroll run history
  - Contractor payments
  - Benefits administration
  - Tax filing status

---

### 6. E-commerce Platforms
**Priority: MEDIUM**

#### Shopify
- **Purpose**: E-commerce revenue and inventory tracking
- **Authentication**: OAuth 2.0
- **API**: Shopify Admin API (GraphQL + REST)
- **Key Data**:
  - Orders and refunds
  - Product costs and pricing
  - Shipping expenses
  - Payment gateway fees
  - Inventory valuation
- **Accounting Features**:
  - Revenue recognition by order date vs. fulfillment date
  - COGS calculation with inventory method (FIFO/LIFO/Weighted Average)
  - Sales tax collection by jurisdiction
  - Multi-currency revenue conversion

---

### 7. Communication & Notifications
**Priority: LOW**

#### Slack
- **Purpose**: Team collaboration and AI assistant bot
- **Authentication**: OAuth 2.0
- **API**: Slack Web API
- **Bot Features**:
  - `/luca query` - Ask accounting questions in Slack
  - Daily digest of financial metrics
  - Alert for unusual transactions (anomaly detection)
  - Tax deadline reminders
  - Expense approval workflows

#### Twilio
- **Purpose**: SMS alerts for critical events
- **Authentication**: API Key + Secret
- **Use Cases**:
  - Large transaction alerts (> $10,000)
  - Tax deadline reminders (7 days, 3 days, 1 day before)
  - Subscription payment failures
  - Security alerts (login from new device)

---

## Technical Architecture

### Integration Framework

```typescript
// server/integrations/base/IntegrationProvider.ts
export abstract class IntegrationProvider {
  abstract name: string;
  abstract authType: 'oauth2' | 'apikey' | 'basic';
  
  abstract connect(userId: string, credentials: any): Promise<Connection>;
  abstract disconnect(connectionId: string): Promise<void>;
  abstract refreshToken(connectionId: string): Promise<string>;
  abstract validateConnection(connectionId: string): Promise<boolean>;
  abstract fetchData(connectionId: string, params: any): Promise<any>;
  abstract syncData(connectionId: string): Promise<SyncResult>;
  
  // Webhook handling
  abstract handleWebhook(payload: any): Promise<void>;
}

// server/integrations/quickbooks/QuickBooksProvider.ts
export class QuickBooksProvider extends IntegrationProvider {
  name = 'quickbooks';
  authType = 'oauth2' as const;
  
  async connect(userId: string, authCode: string) {
    const tokens = await this.exchangeCodeForTokens(authCode);
    return db.insert(integrationConnections).values({
      userId,
      provider: 'quickbooks',
      accessToken: encrypt(tokens.access_token),
      refreshToken: encrypt(tokens.refresh_token),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      metadata: { realmId: tokens.realmId }
    });
  }
  
  async syncData(connectionId: string) {
    const connection = await this.getConnection(connectionId);
    const accessToken = decrypt(connection.accessToken);
    
    // Fetch transactions from QuickBooks
    const transactions = await this.fetchTransactions(accessToken);
    
    // Transform and store
    for (const txn of transactions) {
      await this.storeTransaction(txn, connectionId);
    }
    
    return { synced: transactions.length, errors: [] };
  }
}
```

### Database Schema

```typescript
// shared/schema.ts - Integration tables
export const integrationConnections = pgTable('integration_connections', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull().references(() => users.id),
  provider: varchar('provider').notNull(), // 'quickbooks', 'plaid', 'stripe'
  status: varchar('status').notNull().default('active'), // 'active', 'expired', 'error'
  accessToken: text('access_token'), // encrypted
  refreshToken: text('refresh_token'), // encrypted
  expiresAt: timestamp('expires_at'),
  lastSyncAt: timestamp('last_sync_at'),
  metadata: jsonb('metadata'), // provider-specific data
  createdAt: timestamp('created_at').defaultNow(),
});

export const syncLogs = pgTable('sync_logs', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  connectionId: varchar('connection_id').references(() => integrationConnections.id),
  status: varchar('status').notNull(), // 'success', 'partial', 'failed'
  recordsSynced: integer('records_synced').default(0),
  errors: jsonb('errors'),
  startedAt: timestamp('started_at').defaultNow(),
  completedAt: timestamp('completed_at'),
});

export const externalTransactions = pgTable('external_transactions', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  connectionId: varchar('connection_id').references(() => integrationConnections.id),
  externalId: varchar('external_id').notNull(), // ID from source system
  type: varchar('type').notNull(), // 'income', 'expense', 'transfer'
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  currency: varchar('currency').default('USD'),
  date: date('date').notNull(),
  description: text('description'),
  category: varchar('category'),
  accountName: varchar('account_name'),
  metadata: jsonb('metadata'),
  matched: boolean('matched').default(false), // matched to internal record
  createdAt: timestamp('created_at').defaultNow(),
});
```

---

## Security & Compliance

### OAuth 2.0 Best Practices
1. **Token Storage**: All access tokens encrypted using AES-256-GCM
2. **Refresh Strategy**: Auto-refresh tokens 5 minutes before expiration
3. **Scope Minimization**: Request only necessary permissions
4. **PKCE**: Use Proof Key for Code Exchange for public clients
5. **State Parameter**: Prevent CSRF attacks on OAuth callbacks

### API Key Management
1. Store in Replit Secrets, never in code
2. Rotate keys quarterly
3. Use separate keys for dev/staging/production
4. Monitor for unauthorized usage

### Data Privacy
1. **PII Encryption**: All sensitive data encrypted at rest
2. **Data Retention**: Configurable per integration (default 7 years for financial data)
3. **Right to Deletion**: Support user data export and deletion
4. **SOC 2 Compliance**: Follow Type II controls

### Rate Limiting
```typescript
// Implement exponential backoff
async function apiCall(url: string, options: any, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
        await sleep(delay);
        continue;
      }
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
    }
  }
}
```

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
- [ ] Build base `IntegrationProvider` abstract class
- [ ] Create database schema for connections and sync logs
- [ ] Implement encryption service for tokens
- [ ] Build OAuth 2.0 callback handler
- [ ] Create integration management UI in Settings

### Phase 2: Banking (Weeks 3-4)
- [ ] Plaid integration
  - [ ] Link Token generation
  - [ ] Account connection flow
  - [ ] Transaction sync (daily)
  - [ ] Webhook handling
  - [ ] Auto-categorization with AI
- [ ] Bank reconciliation UI
- [ ] Transaction matching algorithm

### Phase 3: Accounting Software (Weeks 5-7)
- [ ] QuickBooks Online integration
  - [ ] OAuth flow
  - [ ] Chart of accounts mapping
  - [ ] Invoice sync
  - [ ] Expense sync
  - [ ] Journal entry creation
- [ ] Xero integration (similar features)
- [ ] Bidirectional sync conflict resolution

### Phase 4: Payments & E-commerce (Weeks 8-9)
- [ ] Stripe integration (enhance existing)
  - [ ] Revenue tracking
  - [ ] Fee categorization
  - [ ] Payout reconciliation
- [ ] Shopify integration
  - [ ] Order sync
  - [ ] Inventory tracking
  - [ ] COGS calculation
  - [ ] Multi-currency handling

### Phase 5: Document & Communication (Weeks 10-11)
- [ ] Google Drive integration
  - [ ] Document upload from Forensic Intelligence
  - [ ] Auto-organize by tax year
  - [ ] OCR for receipts
- [ ] Slack bot
  - [ ] Slash commands
  - [ ] Daily digests
  - [ ] Alerts

### Phase 6: Monitoring & Analytics (Week 12)
- [ ] Integration health dashboard (admin)
- [ ] Sync error tracking and retry logic
- [ ] Usage analytics per integration
- [ ] Cost tracking (API usage fees)

---

## Cost Analysis

### Per-User Monthly Costs (at scale)

| Integration | Cost Model | Estimated Cost/User |
|-------------|-----------|-------------------|
| Plaid | $0.25/item/month + $0.10/update | $1.50 |
| QuickBooks API | Free (OAuth app) | $0 |
| Xero API | Free (partner app) | $0 |
| Stripe | Included in payment fees | $0 |
| Google Drive API | Free tier (1B requests/day) | $0 |
| Slack API | Free tier | $0 |
| Twilio SMS | $0.0075/message × 10 msgs/mo | $0.075 |
| **Total** | | **~$1.58/user/month** |

**Revenue Impact**: Add $2-5/month integration fee to Pro+ plans to cover costs and provide value.

---

## Error Handling & Monitoring

### Common Error Scenarios

1. **Token Expiration**
   - Auto-refresh before expiry
   - Notify user if refresh fails
   - Graceful degradation (show cached data)

2. **Rate Limiting**
   - Implement exponential backoff
   - Queue requests during high traffic
   - Display sync delay to user

3. **Data Inconsistencies**
   - Validate data schema on import
   - Flag conflicts for manual review
   - Maintain audit trail

4. **Network Failures**
   - Retry with exponential backoff (max 3 attempts)
   - Queue failed syncs for later retry
   - Alert on persistent failures

### Monitoring Dashboard
```typescript
// Key Metrics to Track
- Integration health status (by provider)
- Sync success rate (%)
- Average sync duration
- Error rate by error type
- Token refresh failures
- API quota usage
- User adoption rate per integration
```

---

## User Experience

### Integration Settings UI
```
Settings > Integrations

┌─────────────────────────────────────────┐
│ Connected Integrations                  │
├─────────────────────────────────────────┤
│ ✓ QuickBooks Online                     │
│   Last sync: 2 minutes ago              │
│   Status: Active                        │
│   [Disconnect] [Sync Now]               │
├─────────────────────────────────────────┤
│ ✓ Plaid - Chase Bank (...1234)         │
│   Last sync: 1 hour ago                 │
│   Status: Active                        │
│   [Disconnect] [Refresh]                │
├─────────────────────────────────────────┤
│ Available Integrations                  │
├─────────────────────────────────────────┤
│ [+] Xero                                │
│ [+] Google Drive                        │
│ [+] Slack                               │
└─────────────────────────────────────────┘
```

### Connection Flow
1. User clicks "Connect QuickBooks"
2. Redirect to QuickBooks OAuth consent screen
3. User authorizes Luca app
4. Redirect back to Luca with auth code
5. Exchange code for tokens (background)
6. Show "Connected successfully!" message
7. Trigger initial data sync
8. Display sync progress (e.g., "Importing 1,247 transactions...")

---

## API Endpoints

```typescript
// Integration Management
POST   /api/integrations/:provider/connect
DELETE /api/integrations/:connectionId/disconnect
POST   /api/integrations/:connectionId/sync
GET    /api/integrations/:connectionId/status
GET    /api/integrations/available

// OAuth Callbacks
GET    /api/integrations/:provider/callback

// Webhooks
POST   /api/webhooks/plaid
POST   /api/webhooks/quickbooks
POST   /api/webhooks/stripe

// Data Access
GET    /api/integrations/:connectionId/transactions
GET    /api/integrations/:connectionId/accounts
GET    /api/integrations/:connectionId/invoices
```

---

## Testing Strategy

### Unit Tests
- Token encryption/decryption
- OAuth flow components
- Data transformation functions
- Error handling logic

### Integration Tests
- OAuth callback handling
- API request/response mocking
- Webhook signature verification
- Sync job execution

### End-to-End Tests
- Complete connection flow (using sandbox accounts)
- Data sync and transformation
- Error recovery scenarios
- Multi-integration workflows

### Sandbox Environments
- Plaid: Use sandbox mode with test credentials
- QuickBooks: Use sandbox company
- Stripe: Use test mode
- All integrations: Never use production credentials in tests

---

## Success Metrics

### Adoption Metrics
- % of users with at least 1 integration
- Average integrations per user
- Most popular integration
- Integration abandonment rate

### Technical Metrics
- Sync success rate (target: >99%)
- Average sync duration (target: <30 seconds)
- Token refresh success rate (target: 100%)
- API error rate (target: <0.1%)

### Business Metrics
- Revenue from integration tier upgrades
- Cost per integration per user
- Support tickets related to integrations
- NPS score for integration users vs. non-users

---

## Appendix: Integration Priorities

### Tier 1 (Must-Have) - Launch with these
1. Plaid (banking)
2. QuickBooks Online (accounting)
3. Stripe (payments - already implemented)

### Tier 2 (Should-Have) - Add within 3 months
4. Xero (accounting)
5. Google Drive (documents)
6. Shopify (e-commerce)

### Tier 3 (Nice-to-Have) - Add within 6 months
7. ADP/Gusto (payroll)
8. Slack (notifications)
9. Expensify (expenses)
10. Square (payments)

### Tier 4 (Future) - Add based on demand
11. NetSuite (enterprise)
12. Salesforce (CRM)
13. WooCommerce (e-commerce)
14. Zoho suite
15. Custom API integrations

---

**Document Version**: 1.0  
**Last Updated**: November 12, 2025  
**Owner**: Luca Engineering Team
