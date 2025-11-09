# Luca - Accounting Superintelligence

## Overview
Luca is a pan-global accounting superintelligence platform designed to surpass traditional tax and accounting software. It integrates specialized AI models with advanced financial solvers to offer comprehensive expertise across tax, audit, financial reporting, compliance, and financial analysis. The platform provides actual calculations, multi-domain expertise, global coverage, advanced financial modeling, and real-time processing, aiming to be a superior alternative to tools like Blue J Tax.

## User Preferences
I prefer that you communicate in a clear and concise manner. When providing explanations, please prioritize simplicity and avoid overly technical jargon where possible. I value an iterative development approach, so please propose changes and discuss them with me before implementing major modifications to the codebase. Ensure that any changes you make are well-documented and align with the existing code style. Please do not make changes to files in the `server/services` directory.

## System Architecture

### AI Analytics & Insights System (NEW - December 2024)
Luca now includes a comprehensive analytics system that tracks response quality, analyzes user sentiment, and predicts behavior patterns:
- **Sentiment Analysis**: Real-time analysis of user messages using Gemini AI (3-second timeout with heuristic fallback)
- **Quality Assessment**: AI-powered evaluation of response accuracy, helpfulness, and clarity
- **Conversation Insights**: Deep analysis using Claude for topic extraction and resolution tracking
- **Behavior Prediction**: Churn risk scoring, engagement metrics, and upsell candidate identification
- **Async Processing**: Analytics run in background (fire-and-forget) to avoid blocking chat responses
- **Database Tables**: conversation_analytics, message_analytics, user_behavior_patterns, sentiment_trends

### UI/UX Decisions
The user interface features a 3-pane resizable layout: a left pane for conversations, a middle chat interface with markdown rendering, and a right output pane for professional features like formatted views, search, and export options. It includes a multi-profile system for managing business, personal, and family accounting contexts. The conversations sidebar includes a profile filter dropdown that allows users to view conversations by profile context ("All Profiles", "No Profile", or specific profiles). When users switch profile filters, the active conversation is cleared to ensure each profile context maintains separate conversation threads. A persistent "Powered by FinACEverse" badge is displayed at the bottom-center of the screen. The design uses a pink-to-purple brand gradient theme.

### Technical Implementations

#### Multi-Provider AI Architecture
Luca implements a provider abstraction layer (`server/services/aiProviders/`) for flexible LLM integration. The architecture includes:
- **Provider Abstraction Layer**: Base AIProvider class with standardized interfaces for completion requests, streaming, token usage, and cost estimation
- **Provider Registry**: Singleton factory pattern (`aiProviderRegistry`) for dynamic provider selection and initialization
- **OpenAI Provider Adapter**: Primary provider wrapping OpenAI SDK with unified error handling and usage tracking
- **Extensibility**: Designed to support future integrations with Claude 3.5 Sonnet, Google Gemini 2.0 Flash, Perplexity AI, and Azure AI Search
- **Cost Optimization**: Multi-provider routing can achieve 51% cost savings vs OpenAI-only architecture

The system enables intelligent provider selection based on query complexity, cost considerations, and specialized capabilities (document analysis, real-time data, reasoning).

#### Query Processing Pipeline
Luca employs an Intelligent Query Triage System (`server/services/queryTriage.ts`) to classify accounting questions by domain, jurisdiction, and complexity, routing them to optimal AI models and financial solvers. A Multi-Model Router Architecture uses `gpt-4o` as primary, with specialized models and a fallback to `gpt-4o-mini`. Advanced Financial Solvers (`server/services/financialSolvers.ts`) handle tax calculations, NPV, IRR, depreciation, amortization, and financial ratios. An AI Orchestration Layer (`server/services/aiOrchestrator.ts`) coordinates these components, synthesizes responses, and tracks performance.

### Feature Specifications
The platform supports full conversation history, token usage tracking, and a subscription tier system (Free, Professional, Enterprise). It includes API endpoints for authentication, chat interactions, conversation management, profile management, and usage/subscription queries. The conversation system is profile-aware: conversations are linked to specific profiles (business, personal, or family) or can be unassociated (null profileId). Users can filter conversations by profile using the sidebar dropdown, and new conversations automatically inherit the selected profile context. The backend enforces security by validating that profileId values belong to the authenticated user before creating conversations.

### System Design Choices
The backend uses Express.js with a PostgreSQL database and Drizzle ORM. Security features include bcrypt for password hashing, AES-256-GCM encryption for sensitive data (API keys, OAuth tokens, and per-file encryption for uploads), Helmet middleware for HTTP security, and rate limiting. File uploads utilize a secure system with per-file encryption, key wrapping, SHA-256 checksums, virus scanning, and DOD 5220.22-M secure deletion.

The conversations table includes a `profileId` column (varchar, nullable) with a composite index on `(userId, profileId, updatedAt)` for efficient profile-based filtering. The backend validates profile ownership before creating conversations (returns 400 for invalid profileId, 403 for unauthorized access). The profile constraint system enforces that users can only create one Personal profile, while Business and Family profiles are unlimited.

## External Dependencies

Luca integrates with several third-party services:

-   **AI Providers** (All Active):
    -   **OpenAI API**: Primary provider for `gpt-4o`, `gpt-4o-mini` models, ultimate fallback
    -   **Anthropic Claude**: `claude-3-5-sonnet-20241022` for deep reasoning and expert-level analysis
    -   **Google Gemini**: `gemini-2.0-flash-exp` for cost-effective simple/moderate queries (51% cheaper)
    -   **Perplexity AI**: `llama-3.1-sonar-large-128k-online` for real-time research and current information
    -   **Azure Document Intelligence**: Specialized document analysis for invoices, receipts, tax forms (W-2, 1040, 1098, 1099), and financial statements using prebuilt models
-   **Accounting Software (OAuth 2.0)**:
    -   QuickBooks Online
    -   Xero
    -   Zoho Books
    -   ADP Workforce Now
-   **Tax Software (Secure File Upload)**:
    -   Drake Tax
    -   TurboTax
    -   H&R Block
-   **External Virus Scanning Service**: Required for file upload security.