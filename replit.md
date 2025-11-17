# Luca - Accounting Superintelligence

## Overview
Luca is a pan-global accounting superintelligence platform designed to surpass traditional tax and accounting software. It integrates specialized AI models with advanced financial solvers to offer comprehensive expertise across tax, audit, financial reporting, compliance, and financial analysis. The platform provides actual calculations, multi-domain expertise, global coverage, advanced financial modeling, and real-time processing, aiming to be a superior alternative to existing tools.

## Recent Changes (Nov 17, 2025)
- **Enhanced AI Response Accessibility**: Updated AI system prompts to balance expert-level technical depth with accessible explanations. Luca now maintains professional-grade quality while being more approachable by: (1) Starting responses with simple, plain-language summaries before diving into technical details, (2) Defining technical terms when first used, (3) Using analogies and concrete examples to clarify complex concepts, (4) Structuring information with clear headings and bullet points, (5) Highlighting key takeaways. This applies to all 6 chat modes (Standard, Research, Checklist, Workflow, Audit, Calculate) and ensures Luca educates intelligent non-experts without sacrificing accuracy or depth. Implementation in `server/services/aiOrchestrator.ts` via enhanced system prompts in `buildEnhancedContext` method.

## Recent Changes (Nov 13, 2025)
- **Enhanced Visualization System with Advanced Charts**: Major upgrade to Output Pane visualizations adding 5 new chart types powered by Apache ECharts: (1) Combo Chart for mixed line+bar visualizations with dual Y-axes, (2) Waterfall Chart for financial variance analysis with positive/negative/total coloring, (3) Gauge Chart for performance metrics with customizable thresholds, (4) KPI Card component with trend indicators and progress bars, (5) DataTable with TanStack Table featuring sorting, filtering, and pagination. Extended visualization schema (`shared/types/visualization.ts`) with type-safe discriminated unions: `LegacyVisualizationType` (line, bar, pie, area, workflow) vs `AdvancedVisualizationType` (combo, waterfall, gauge, table, kpi-card). Maintained full backwards compatibility with existing Recharts visualizations through type-based routing. VisualizationRenderer uses proper type guards to route legacy types to Recharts and advanced types to ECharts/custom components.

- **Updated Branding**: Replaced all logo references with new transparent AI brain logo (`Luca Transparent symbol (3)_1763135780054.png`) across ChatHeader, Chat page header, AuthCard, LandingNav, and Footer. New logo features beautiful pink-to-purple gradient representing Luca's AI superintelligence on a transparent background.

## Recent Changes (Nov 12, 2025)
- **Major UI/UX Redesign**: Surpassed Perplexity's design quality with glassmorphic design system, gradient mesh backgrounds, premium animations, and sophisticated glassmorphism effects.
- **Added ModeDockRibbon to Chat**: Prominent horizontal mode selector ribbon showcasing all 6 professional modes with glassmorphic styling.
- **Fixed Analytics Page**: Added authentication handling and navigation header.
- **Added User Analytics Dashboard**: Comprehensive analytics showing conversation quality trends, sentiment analysis, topic distribution, and AI-powered behavior insights.
- **Fixed Output Pane Display**: Professional modes now correctly display in the Output Pane.
- **Added Interactive Workflow Visualization**: Workflow mode generates interactive flowcharts using ReactFlow and dagre.
- **Added Thinking Indicator**: Animated "Luca is thinking..." indicator appears while processing queries.
- **Implemented Razorpay Payment System**: Complete subscription billing across 6 markets with regional PPP pricing.
- **Created Admin Module**: Comprehensive admin dashboard with subscription and coupon management.

## User Preferences
I prefer that you communicate in a clear and concise manner. When providing explanations, please prioritize simplicity and avoid overly technical jargon where possible. I value an iterative development approach, so please propose changes and discuss them with me before implementing major modifications to the codebase. Ensure that any changes you make are well-documented and align with the existing code style. Please do not make changes to files in the `server/services` directory.

## System Architecture

### UI/UX Decisions
The user interface features a 3-pane resizable layout: a left pane for conversations, a middle chat interface with markdown rendering, and a right output pane for professional features like formatted views, search, and export options. It includes a multi-profile system for managing business, personal, and family accounting contexts, with a profile filter dropdown in the conversations sidebar. A persistent "Powered by FinACEverse" badge is displayed, and the design uses a pink-to-purple brand gradient theme. Mathematical formulas are rendered using LaTeX. Chat messages include avatars for both assistant and user.

### Technical Implementations
Luca employs a multi-provider AI architecture with a provider abstraction layer and a health monitoring system for dynamic selection and intelligent failover among LLMs. A Professional Requirement Clarification System ensures tailored, jurisdiction-specific advice by detecting context, analyzing missing details, and recognizing accounting nuances. When a document is attached, the clarification phase is skipped entirely. The Query Processing Pipeline uses an Intelligent Query Triage System to classify questions and route them to optimal AI models and advanced financial solvers. WebSocket support enables real-time streaming chat responses. The platform includes file upload capabilities with a robust document processing pipeline: Azure Document Intelligence (primary) for structured data extraction via a dedicated Document Analyzer agent, with automatic fallback to pdf-parse text extraction.

The Output Pane features a comprehensive export system with industry-grade financial visualizations and document generation in six formats: TXT, CSV, DOCX, PDF, PPTX, and XLSX. The platform uses Recharts for professional data visualization (line charts, bar charts, pie charts, area charts) with responsive design, themed styling, and interactive tooltips. Visualization data is stored in `messages.metadata.visualization` and rendered alongside markdown content in the Output Pane. The DocumentExporter service converts both markdown content and chart data to exportable formats using specialized libraries (docx, pdfkit, pptxgenjs, exceljs). Charts are exported as data tables in all formats: CSV exports proper comma-separated values, TXT exports tab-separated tables, and rich formats (DOCX/PDF/PPTX/XLSX) embed markdown-formatted tables. Export controls are conditionally enabled when either content OR visualization data is present. The system includes search functionality, copy-to-clipboard (includes visualization as tab-separated text), and formatted/code view modes.

### Feature Specifications
Luca offers three unique features:
1.  **Regulatory Scenario Simulator**: For "what-if" stress-testing of tax and audit positions across jurisdictions and time periods, with side-by-side comparisons.
2.  **Client Deliverable Composer**: One-click generation of professional-grade documents (e.g., audit plans, tax memos) with AI assistance, template variables, and export options.
3.  **Forensic Document Intelligence**: Proactive anomaly detection and cross-document reconciliation for financial discrepancies, providing risk scoring and supporting evidence extraction.

The platform supports full conversation history, token usage tracking, and a comprehensive subscription tier system with Razorpay payment integration. There are 4 subscription tiers: Free (500 queries/month), Pay-as-you-go ($20/100 queries), Plus ($29/month for 2,500 queries), Professional ($49/month unlimited), and Enterprise ($499/month with multi-user support). Regional pricing is supported across 6 markets (USA, Canada, India, UAE, Indonesia, Turkey) with PPP-adjusted pricing (70% discount for India/Indonesia). The subscription system includes usage quota tracking, payment verification with HMAC SHA256 signatures, webhook handling for automated activation, and database-level idempotency constraints. Conversations are profile-aware, linked to specific profiles, and new conversations inherit the selected profile context. API endpoints handle authentication, chat, conversation management, payments, subscriptions, and usage queries.

### System Design Choices
The backend uses Express.js with a PostgreSQL database and Drizzle ORM. Security features include bcrypt for password hashing (minimum 6 characters), AES-256-GCM encryption for sensitive data, Helmet middleware, and rate limiting with trust proxy enabled. Session cookies use sameSite 'lax' setting. File uploads utilize a secure system with per-file encryption, key wrapping, SHA-256 checksums, and virus scanning. The `conversations` table includes a `profileId` column for efficient profile-based filtering, and the system enforces profile ownership and constraints. Authentication flow uses a two-step redirect pattern to prevent race conditions with user state propagation. Express body size limits are set to 10MB to handle large file metadata and messages. `chatMode` parameters are validated, falling back to 'standard' for invalid modes.

Payment processing uses Razorpay SDK with comprehensive security measures: payment signature validation using HMAC SHA256, webhook signature verification, unique constraints on `razorpay_payment_id` for idempotency, and parameterized database queries to prevent SQL injection. The subscription service (`server/services/subscriptionService.ts`) manages plan configurations, creates Razorpay orders, verifies payments, activates subscriptions, and enforces usage quotas. Database tables include `subscriptions` (user plans and billing), `payments` (transaction records with Razorpay IDs), and `usageQuotas` (query/document limits per user). The pricing page (`client/src/pages/Pricing.tsx`) features currency selection for 6 markets, monthly/annual billing toggle with 25% savings, Razorpay checkout integration, and current plan indicators.

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
-   **Payment Processing**:
    -   Razorpay (multi-currency, regional pricing across 6 markets)
-   **External Virus Scanning Service**