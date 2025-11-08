# Luca - Accounting Superintelligence

## Overview
Luca is a pan-global accounting superintelligence platform that surpasses traditional tax and accounting software like Blue J Tax. It combines multiple specialized AI models with advanced financial solvers to provide comprehensive expertise across:

- **Tax**: Multi-jurisdictional tax law, calculations, and compliance
- **Audit**: Risk assessment, materiality calculations, and assurance methodologies
- **Financial Reporting**: US GAAP, IFRS, and global standards
- **Compliance**: Regulatory requirements across jurisdictions
- **Financial Analysis**: Advanced calculations and modeling

## Core Architecture

### 1. Intelligent Query Triage System
Located in `server/services/queryTriage.ts`:
- Automatically classifies accounting questions by domain (tax, audit, financial reporting, compliance)
- Detects jurisdiction requirements (US, Canada, UK, EU, Australia, India, China, Singapore, etc.)
- Assesses complexity level (simple, moderate, complex, expert)
- Determines if calculations, research, or document analysis is needed
- Routes queries to optimal model and solver combinations

### 2. Multi-Model Router Architecture
- **Primary Models**: gpt-4o for comprehensive queries
- **Specialized Models**: Configurable endpoints for future fine-tuned models (luca-tax-expert, luca-audit-expert, etc.)
- **Fallback Strategy**: Graceful degradation to gpt-4o-mini for simpler queries
- **Context Enhancement**: Builds specialized prompts based on domain and classification

### 3. Advanced Financial Solvers
Located in `server/services/financialSolvers.ts`:

#### Tax Calculations
- Corporate tax calculations for US, Canada, UK, and other jurisdictions
- Federal, state/provincial tax breakdown
- Handles different entity types (C-Corp, S-Corp, etc.)

#### Financial Metrics
- **NPV** (Net Present Value): Discounted cash flow analysis
- **IRR** (Internal Rate of Return): Investment return calculations using Newton-Raphson method
- **Depreciation**: Straight-line, declining balance, sum-of-years methods
- **Amortization**: Loan payment schedules with principal/interest breakdown
- **Financial Ratios**: Current ratio, quick ratio, debt-to-equity, ROE, ROA

#### Beyond Blue J Tax
While Blue J focuses primarily on tax position prediction and case law, Luca provides:
1. **Actual Calculations**: Precise tax amounts, not just predictions
2. **Multi-Domain Expertise**: Tax, audit, financial reporting, and compliance
3. **Global Coverage**: Pan-jurisdictional support beyond North America
4. **Financial Modeling**: Advanced calculations that go beyond tax scenarios
5. **Real-Time Processing**: Immediate answers with calculation verification

### 4. AI Orchestration Layer
Located in `server/services/aiOrchestrator.ts`:
- Coordinates triage, model selection, and solver execution
- Extracts parameters from natural language queries
- Builds enhanced context with pre-calculated results
- Synthesizes comprehensive responses that combine AI insights with verified calculations
- Tracks model performance and routing decisions

## Database Schema

### Users Table
- Email/password authentication
- Subscription tier management (free, professional, enterprise)
- User profile information

### Conversations & Messages
- Full conversation history with persistence
- Tracking of which models were used for each response
- Storage of calculation results and routing decisions
- Token usage tracking per message

### Model Routing Logs
- Complete audit trail of classification and routing decisions
- Confidence scores and alternative model considerations
- Processing time metrics for optimization

### Usage Tracking
- Monthly query limits enforcement
- Document analysis tracking
- Token consumption monitoring
- Subscription tier-based access control

## Subscription Tiers

### Free Tier
- 100 queries per month
- Access to gpt-4o model
- Basic financial calculations
- Community support

### Professional Tier ($49/month)
- Unlimited queries
- Priority model routing
- Advanced tax calculations
- Multi-jurisdiction support
- 50 document analyses per month
- Email support
- API access

### Enterprise Tier (Custom)
- Everything in Professional
- Access to specialized fine-tuned models
- Unlimited document analysis
- Dedicated support team
- Custom model fine-tuning
- SSO & advanced security
- Audit trail & compliance features
- Multi-user workspaces

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration with email/password
- `POST /api/auth/login` - User authentication

### Chat Interface
- `POST /api/chat` - Main intelligence endpoint
  - Handles query triage and classification
  - Routes to appropriate models and solvers
  - Executes financial calculations
  - Returns comprehensive responses with metadata
  - Tracks usage and enforces limits

### Conversation Management
- `GET /api/conversations?userId={id}` - List user conversations
- `POST /api/conversations` - Create new conversation
- `GET /api/conversations/:id/messages` - Get conversation history

### Usage & Subscription
- `GET /api/usage?userId={id}` - Check usage limits
- `POST /api/subscription/upgrade` - Upgrade subscription tier

## User Interface

### 3-Pane Resizable Layout
- **Left Pane**: Conversations list with search, new chat, collapse/expand
- **Middle Pane**: Chat interface with markdown rendering for assistant responses
- **Right Pane**: Output pane with professional features:
  - Formatted/code view toggle
  - Search and filter functionality
  - Export to multiple formats (TXT, CSV, Word, PDF, PPT, Excel)
  - Pagination with page numbers
  - Copy to clipboard
  - Collapse/expand controls
- All panes are resizable using drag handles

### Pages
- **Chat**: Main 3-pane interface for conversations
- **Settings**: LLM configuration, account management, GDPR controls
- **Integrations**: Connect QuickBooks, Xero, Zoho, and tax software
- **Landing**: Marketing page with features and pricing
- **Auth**: Login and registration

## Technical Stack

### Frontend
- React with TypeScript
- Wouter for routing
- TanStack Query for state management
- Shadcn UI with resizable panels component
- ReactMarkdown with syntax highlighting
- Pink-to-purple brand gradient theme

### Backend
- Express.js server
- OpenAI API integration
- Custom query triage and routing system
- Advanced financial calculation engines
- PostgreSQL database with Drizzle ORM
- AES-256-GCM encryption for API keys and OAuth tokens

## Key Differentiators from Blue J Tax

1. **Multi-Domain Coverage**: Not just tax - covers audit, financial reporting, and compliance
2. **Global Reach**: Pan-jurisdictional expertise vs. limited geographic focus
3. **Actionable Calculations**: Provides actual tax amounts and financial metrics, not just predictions
4. **Real-Time Intelligence**: Immediate responses with verified calculations
5. **Flexible Architecture**: Extensible model routing supports continuous improvement
6. **Comprehensive Platform**: Full-stack solution with conversation history, usage tracking, and subscription management

## Accounting Software Integrations (In Progress)

### Supported Platforms
- **QuickBooks Online**: OAuth 2.0 flow with encrypted token storage
- **Xero**: OAuth 2.0 flow with tenant management
- **Zoho Books**: OAuth 2.0 flow with data center location support

### Tax Software (Planned)
- TurboTax data import
- H&R Block file integration
- Drake Tax professional integration
- Intuit ProSeries connectivity

### Current Status
- Database schema and encryption service implemented
- Integration management UI complete
- OAuth initiation routes functional
- **Requires**: Provider OAuth credentials configuration and ENCRYPTION_KEY environment variable

## Future Enhancements

1. **Fine-Tuned Models**: Deploy specialized models for tax, audit, and financial reporting
2. **Document Processing**: OCR and intelligent extraction from financial statements and tax forms
3. **Case Law Integration**: Tax and legal precedent database for research capabilities
4. **Complete OAuth Flows**: Full callback handling and token refresh for accounting integrations
5. **Professional Document Exports**: True Word/PDF/Excel generation using docx/pdfkit/exceljs libraries
6. **Collaboration Features**: Multi-user workspaces for accounting firms
7. **Real-Time Updates**: Jurisdiction-specific tax law and regulation alerts
8. **Advanced Analytics**: Model performance optimization and user behavior insights

## Development Notes

- **Required Environment Variables**:
  - `ENCRYPTION_KEY`: 64-character hex string for AES-256-GCM encryption (required)
  - `OPENAI_API_KEY`: OpenAI API access
  - `DATABASE_URL`: PostgreSQL connection string
  - `SESSION_SECRET`: Express session encryption

- Authentication uses bcrypt for password hashing
- PostgreSQL database with Drizzle ORM
- All API keys and OAuth tokens encrypted with AES-256-GCM
- All financial calculations verified for accuracy
- Comprehensive error handling and logging
- Usage limits enforced at API level
- Complete audit trail for GDPR compliance
