# Luca - Accounting Superintelligence

## Overview
Luca is a pan-global accounting superintelligence platform designed to surpass traditional tax and accounting software. It integrates specialized AI models with advanced financial solvers to offer comprehensive expertise across tax, audit, financial reporting, compliance, and financial analysis. The platform provides actual calculations, multi-domain expertise, global coverage, advanced financial modeling, and real-time processing, aiming to be a superior alternative to existing tools.

## User Preferences
I prefer that you communicate in a clear and concise manner. When providing explanations, please prioritize simplicity and avoid overly technical jargon where possible. I value an iterative development approach, so please propose changes and discuss them with me before implementing major modifications to the codebase. Ensure that any changes you make are well-documented and align with the existing code style. Please do not make changes to files in the `server/services` directory.

## Recent Changes (November 9-10, 2025)
1. **Logo Implementation**: Restored the correct Luca logo by importing the provided logo file (`attached_assets/Luca Transparent symbol (2)_1762627959193.png`) instead of using a generic sparkles icon in ChatHeader.
2. **Password Validation Simplification**: Reduced password requirements from 12 characters with complex validation (uppercase, number, special character) to a simple 6-character minimum. This change was applied to both frontend (AuthCard.tsx) and backend (shared/schema.ts) to reduce user friction during sign-up.
3. **Rate Limiting Fix**: Added Express trust proxy configuration before rate limiters in security middleware to properly detect client IPs when behind a proxy, fixing 403 errors during sign-up.
4. **MVP Feature Navigation**: Added three navigation buttons to the Chat page sidebar for direct access to: Regulatory Scenario Simulator (/scenarios), Client Deliverable Composer (/deliverables), and Forensic Document Intelligence (/forensics). All buttons include proper data-testid attributes for testing.
5. **Auth Redirect Fix**: Fixed race condition in authentication flow where redirect to /chat would fail due to user state not being set before navigation. Implemented using useEffect that waits for user state to be set via shouldRedirect flag before triggering navigation.
6. **Session Cookie Fix**: Changed session cookie sameSite setting from 'strict' to 'lax' in server/index.ts to resolve "authentication required" errors. The strict setting was preventing session cookies from being sent during normal navigation. The lax setting maintains CSRF protection while allowing cookies to persist across page navigation.
7. **File Attachment Enhancement**: Enhanced handleSendMessage in Chat.tsx to support three scenarios: (1) file-only sends show `[Attached: filename]`, (2) text-only sends show the user's message, and (3) text+file sends show `message [Attached: filename]`. This ensures conversation history accurately reflects all attachments in both the UI and database, improving message traceability.
8. **PDF Text Extraction Fallback**: Added robust PDF text extraction fallback to OpenAI and Claude providers using pdf-parse library. When Azure Document Intelligence fails or is unavailable, the system now extracts text from PDFs (up to 8000 characters) and appends it to the user's message before sending to the LLM. This ensures document content is always processed rather than returning "I can't view files" messages. Implementation uses dynamic import to handle CommonJS module compatibility and includes comprehensive error handling and logging.

## System Architecture

### UI/UX Decisions
The user interface features a 3-pane resizable layout: a left pane for conversations, a middle chat interface with markdown rendering, and a right output pane for professional features like formatted views, search, and export options. It includes a multi-profile system for managing business, personal, and family accounting contexts, with a profile filter dropdown in the conversations sidebar. A persistent "Powered by FinACEverse" badge is displayed, and the design uses a pink-to-purple brand gradient theme.

### Technical Implementations
Luca employs a multi-provider AI architecture with a provider abstraction layer and a health monitoring system for dynamic selection and intelligent failover among LLMs. A Professional Requirement Clarification System ensures tailored, jurisdiction-specific advice by detecting context, analyzing missing details, and recognizing accounting nuances, guiding the AI to ask clarifying questions or provide partial answers when necessary. The Query Processing Pipeline uses an Intelligent Query Triage System to classify questions and route them to optimal AI models and advanced financial solvers. WebSocket support enables real-time streaming chat responses. The platform includes file upload capabilities with a robust document processing pipeline: Azure Document Intelligence (primary) for structured data extraction, with automatic fallback to pdf-parse text extraction when Azure is unavailable or fails. This ensures reliable document analysis across all supported file types (PDF, JPEG, PNG, TIFF).

### Feature Specifications
Luca offers three unique features:
1.  **Regulatory Scenario Simulator**: For "what-if" stress-testing of tax and audit positions across jurisdictions and time periods, with side-by-side comparisons.
2.  **Client Deliverable Composer**: One-click generation of professional-grade documents (e.g., audit plans, tax memos) with AI assistance, template variables, and export options.
3.  **Forensic Document Intelligence**: Proactive anomaly detection and cross-document reconciliation for financial discrepancies, providing risk scoring and supporting evidence extraction.

The platform supports full conversation history, token usage tracking, and a subscription tier system (Free, Professional, Enterprise). Conversations are profile-aware, linked to specific profiles, and new conversations inherit the selected profile context. API endpoints handle authentication, chat, conversation management, and usage queries.

### System Design Choices
The backend uses Express.js with a PostgreSQL database and Drizzle ORM. Security features include bcrypt for password hashing (minimum 6 characters), AES-256-GCM encryption for sensitive data, Helmet middleware, and rate limiting with trust proxy enabled. Session cookies use sameSite 'lax' setting to balance security with usability. File uploads utilize a secure system with per-file encryption, key wrapping, SHA-256 checksums, and virus scanning. The `conversations` table includes a `profileId` column for efficient profile-based filtering, and the system enforces profile ownership and constraints. Authentication flow uses a two-step redirect pattern (shouldRedirect flag + useEffect) to prevent race conditions with user state propagation.

## External Dependencies

-   **AI Providers**:
    -   Anthropic Claude (`claude-3-5-sonnet-20241022`)
    -   Google Gemini (`gemini-2.0-flash-exp`)
    -   Perplexity AI (`llama-3.1-sonar-large-128k-online`)
    -   Azure OpenAI (`gpt-4o`)
    -   OpenAI API (`gpt-4o`, `gpt-4o-mini`)
    -   Azure Document Intelligence (for document analysis)
-   **Accounting Software (OAuth 2.0)**:
    -   QuickBooks Online
    -   Xero
    -   Zoho Books
    -   ADP Workforce Now
-   **Tax Software (Secure File Upload)**:
    -   Drake Tax
    -   TurboTax
    -   H&R Block
-   **External Virus Scanning Service**