# Luca Design Guidelines
## Accounting Superintelligence Platform

### Design Approach: Professional Productivity System

**Selected Approach:** Design System - Inspired by Linear and Notion's clean, professional aesthetic combined with ChatGPT's conversational interface excellence.

**Key Principles:**
- Professional credibility through restrained, confident design
- Information density without overwhelming users
- Seamless chat experience as the core interaction model
- Clear visual hierarchy for complex financial data
- Trust-building through polished, production-grade UI

---

## Typography System

**Primary Font:** Inter (via Google Fonts)
**Accent Font:** JetBrains Mono (for numerical data, code, calculations)

**Hierarchy:**
- Page Titles: text-4xl font-semibold
- Section Headers: text-2xl font-semibold
- Chat Messages: text-base leading-relaxed
- Metadata/Labels: text-sm font-medium text-gray-600
- Financial Data: JetBrains Mono, text-base
- Small UI Text: text-xs

---

## Layout System

**Spacing Primitives:** Use Tailwind units of 2, 4, 6, and 8 consistently
- Component padding: p-4, p-6
- Section spacing: gap-6, gap-8
- Card margins: m-4, m-6
- Icon spacing: space-x-2, space-y-4

**Container Strategy:**
- Max-width wrapper: max-w-7xl mx-auto
- Chat container: max-w-4xl mx-auto
- Sidebar: fixed w-64 or w-72
- Dashboard cards: grid with controlled max-widths

---

## Core Layout Structure

### Landing Page (Marketing)
1. **Hero Section** (90vh)
   - Centered headline + subheadline
   - Primary CTA ("Start Free Trial") + Secondary CTA ("See Demo")
   - Animated screenshot or product preview showcasing chat interface
   - Trust indicators: "Trusted by 5,000+ accounting professionals"

2. **Intelligence Features Section** (2-column grid on desktop)
   - 4-6 feature cards with icons
   - Focus: Multi-model routing, Tax calculations, Global compliance, Document analysis
   - Each card: Icon + Title + 2-3 line description

3. **Capabilities Showcase** (Full-width with side-by-side comparison)
   - Left: Traditional accounting software limitations
   - Right: Luca's AI-powered advantages
   - Use checkmarks and visual contrasts

4. **Model Architecture Visual** (Diagram section)
   - Illustrate the intelligent triage and model routing
   - Show how queries flow through specialized models
   - Technical credibility for sophisticated users

5. **Pricing Tiers** (3-column grid)
   - Free, Professional, Enterprise
   - Feature comparison table
   - Clear CTA buttons per tier

6. **Social Proof** (2-3 column testimonials)
   - Accountant headshots with quotes
   - Company logos of firms using Luca

7. **Footer** (Rich multi-column)
   - Product links, Resources, Company, Legal
   - Newsletter signup
   - Social links

### Application Interface

**Main Chat View Layout:**
```
┌─────────────────────────────────────────────────────┐
│ Top Navigation Bar (h-16)                          │
│ Logo | Workspace | New Chat | User Menu            │
├───────────┬─────────────────────────────────────────┤
│           │                                         │
│ Sidebar   │      Main Chat Area                     │
│ (w-64)    │      (max-w-4xl mx-auto)               │
│           │                                         │
│ Recent    │  ┌─────────────────────────────┐       │
│ Chats     │  │ Chat Messages               │       │
│           │  │ (scrollable area)           │       │
│ Saved     │  └─────────────────────────────┘       │
│ Sessions  │                                         │
│           │  ┌─────────────────────────────┐       │
│ Settings  │  │ Input Area (fixed bottom)   │       │
│           │  │ Advanced Options Toggle     │       │
│           │  └─────────────────────────────┘       │
└───────────┴─────────────────────────────────────────┘
```

**Dashboard View:**
- 3-column grid for stats/metrics cards
- Recent activity timeline (left 2/3)
- Quick actions sidebar (right 1/3)
- Usage analytics with charts

---

## Component Library

### Navigation
- **Top Bar:** Sticky header with gradient underline accent, glass morphism effect (backdrop-blur-sm)
- **Sidebar:** Collapsible with icon-only compact mode, smooth transitions
- **Breadcrumbs:** For deep navigation in settings/admin areas

### Chat Components
- **Message Bubbles:** 
  - User messages: Aligned right, compact
  - AI responses: Aligned left, full-width with structured content
  - System messages: Centered, muted
- **Typing Indicators:** Animated dots in brand colors
- **Code Blocks:** Syntax highlighted with copy button
- **Financial Tables:** Zebra striping, sticky headers, sortable columns
- **Calculation Results:** Highlighted boxes with JetBrains Mono font

### Input Elements
- **Chat Input:** Multi-line with auto-expand (max 5 lines), attachment button, submit button
- **Advanced Query Options:** Collapsible panel with model selection, jurisdiction picker
- **Form Fields:** Clean borders with focus states, floating labels

### Cards & Containers
- **Pricing Cards:** Elevated with subtle shadow, hover lift effect
- **Feature Cards:** Icon top-left, minimal border, hover state
- **Dashboard Cards:** Metric cards with large numbers, trend indicators (↑↓)
- **Session Cards:** Preview last message, timestamp, saved/unsaved indicator

### Data Display
- **Financial Tables:** Sticky headers, right-aligned numbers, alternating rows
- **Tax Calculation Breakdown:** Nested accordion structure showing step-by-step math
- **Comparison Views:** Side-by-side scenarios with diff highlighting
- **Charts:** Use Chart.js for usage analytics, tax visualizations

### Overlays
- **Modals:** Centered with max-w-2xl, dark overlay
- **Subscription Upgrade:** Feature comparison in modal
- **Model Selection Drawer:** Slide from right with model descriptions

### Icons
**Library:** Heroicons (outline for navigation, solid for actions)
- Chat: ChatBubbleLeftRightIcon
- Finance: CurrencyDollarIcon, CalculatorIcon
- Settings: CogIcon
- User: UserCircleIcon
- Documents: DocumentTextIcon

---

## Images

**Hero Section Image:**
- **Type:** Product screenshot of chat interface in action
- **Placement:** Right side of hero (60% width on desktop), or floating above fold
- **Content:** Show actual conversation with Luca handling complex tax calculation
- **Treatment:** Subtle perspective tilt, soft shadow, screen glow effect

**Feature Section Images:**
- **Model Architecture:** Custom diagram illustration (can be SVG)
- **Dashboard Preview:** Screenshot showing analytics and metrics

---

## Animations (Minimal)

- **Page Transitions:** None - instant load
- **Chat Messages:** Fade-in from bottom (200ms)
- **Sidebar:** Slide transition when opening/closing (150ms)
- **Hover States:** Scale 1.02 on cards (100ms ease-out)
- **Loading States:** Subtle pulse on skeleton screens

---

## Accessibility

- High contrast ratios for all text (WCAG AAA for body text)
- Focus rings on all interactive elements
- Keyboard navigation for entire chat interface
- Screen reader labels for all icons
- ARIA live regions for chat messages