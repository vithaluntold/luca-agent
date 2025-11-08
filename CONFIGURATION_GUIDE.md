# Luca Configuration & Model Fine-tuning Guide

## ✅ Triage Architecture - READY

The intelligent query triage system (`server/services/queryTriage.ts`) automatically classifies every question into:

### 6 Core Accounting Domains

1. **Tax** - Tax law, deductions, credits, IRS/CRA/HMRC, VAT/GST
2. **Audit** - Assurance, verification, materiality, risk assessment, internal controls
3. **Financial Reporting** - GAAP, IFRS, financial statements, balance sheet, income statement
4. **Compliance** - Regulations, SOX, SEC filings, disclosure requirements
5. **General Accounting** - Basic accounting questions
6. **Advisory** - Strategic financial advice

### Sub-Domains Detected

**Tax Sub-domains:**
- International Tax (transfer pricing, treaties)
- Corporate Tax (C-Corp, S-Corp)
- Individual Tax (personal income)
- Indirect Tax (sales tax, VAT, GST)

**Financial Reporting Sub-domains:**
- US GAAP
- IFRS

### Jurisdiction Detection (20+ Countries)

Automatically detects: US, Canada, UK, EU, Australia, India, China, Singapore, Hong Kong, and more
- Defaults to US if no jurisdiction specified
- Supports multi-jurisdiction queries

### Complexity Assessment

- **Simple**: Basic questions, <100 chars
- **Moderate**: 100-200 chars, some technical terms
- **Complex**: 200+ chars, multiple questions, technical terms
- **Expert**: Multiple jurisdictions, advanced terms (consolidation, derivatives, transfer pricing)

### Special Detection

- **Requires Calculation**: Detects when to trigger financial solvers
- **Requires Research**: Case law, precedents, regulations
- **Requires Document Analysis**: For future OCR/document extraction features

---

## ✅ Model Router - READY

The router (`server/services/queryTriage.ts` lines 59-120) intelligently routes queries based on:

### Current Model Routing Logic

| Domain | Free/Professional Tier | Enterprise Tier | Solvers Engaged |
|--------|----------------------|-----------------|-----------------|
| **Tax** | gpt-4o | **luca-tax-expert** | tax-calculator, tax-case-law-search |
| **Audit** | gpt-4o | **luca-audit-expert** | risk-assessment, materiality-calculator |
| **Financial Reporting** | gpt-4o | gpt-4o | standards-lookup, financial-metrics |
| **Compliance** | gpt-4o | gpt-4o | regulatory-check, jurisdiction-rules |
| **General** | gpt-4o | gpt-4o | financial-calculator (as needed) |

### Fallback Strategy

All routes have `gpt-4o-mini` as fallback for:
- API rate limiting
- Cost optimization for simple queries
- Redundancy

---

## 🔑 Configuring API Keys

### 1. OpenAI API Key (Currently Active)

**Location**: Environment variable `OPENAI_API_KEY`

**Set it in Replit Secrets:**
1. Click on "Secrets" (lock icon) in left sidebar
2. Add key: `OPENAI_API_KEY`
3. Add value: `sk-...` (your OpenAI API key)
4. Restart the application

**Current Usage:**
- The system uses OpenAI's GPT-4o and GPT-4o-mini
- Model mapping in `server/services/aiOrchestrator.ts` line 188-196

### 2. Adding Fine-Tuned Model API Keys

When you create fine-tuned models, update the configuration:

**Step 1: Add API Keys to Environment**

```bash
# In Replit Secrets, add:
OPENAI_API_KEY=sk-...              # Main OpenAI key
LUCA_TAX_EXPERT_KEY=sk-...         # Fine-tuned tax model (if separate)
LUCA_AUDIT_EXPERT_KEY=sk-...       # Fine-tuned audit model (if separate)
```

**Step 2: Update Model Mapping**

Edit `server/services/aiOrchestrator.ts` line 188-196:

```typescript
const modelMap: Record<string, string> = {
  'luca-tax-expert': 'ft:gpt-4o-2024-08-06:your-org::model-id',      // ← Replace with your fine-tuned model ID
  'luca-audit-expert': 'ft:gpt-4o-2024-08-06:your-org::model-id',    // ← Replace with your fine-tuned model ID
  'luca-financial-expert': 'ft:gpt-4o-2024-08-06:your-org::model-id', // ← Replace with your fine-tuned model ID
  'gpt-4o': 'gpt-4o',
  'gpt-4o-mini': 'gpt-4o-mini'
};
```

**Step 3: (Optional) Use Different OpenAI Clients for Different Models**

If you have separate API keys per model:

```typescript
// server/services/aiOrchestrator.ts
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const taxExpertClient = new OpenAI({ apiKey: process.env.LUCA_TAX_EXPERT_KEY });
const auditExpertClient = new OpenAI({ apiKey: process.env.LUCA_AUDIT_EXPERT_KEY });

// Then in callAIModel method, use appropriate client based on model
```

---

## 🎓 Fine-Tuning Models - Complete Guide

### Overview

Fine-tuning creates specialized models that understand accounting-specific context better than base GPT-4o.

### What Data to Use for Fine-Tuning

#### 1. **Tax Model (luca-tax-expert)**

**Training Data Sources:**
- Historical tax rulings and case law
- IRS/CRA/HMRC guidance documents
- Tax code interpretations
- Common tax scenarios with correct calculations
- Multi-jurisdiction tax questions with answers

**Example Training Format (JSONL):**

```jsonl
{"messages": [{"role": "system", "content": "You are a tax expert specializing in US corporate tax law."}, {"role": "user", "content": "What is the federal tax rate for a C-Corp with $500,000 taxable income in 2024?"}, {"role": "assistant", "content": "For a C-Corp in 2024, the federal corporate tax rate is a flat 21% under the Tax Cuts and Jobs Act. On $500,000 of taxable income:\n\nFederal Tax: $500,000 × 21% = $105,000\n\nThis is before any state taxes, which vary by jurisdiction. Additionally, the corporation may be eligible for various credits that could reduce this liability."}]}
{"messages": [{"role": "system", "content": "You are a tax expert specializing in international tax."}, {"role": "user", "content": "How does transfer pricing work between a US parent and Canadian subsidiary?"}, {"role": "assistant", "content": "Transfer pricing requires arm's length transactions between related entities across borders...[detailed answer with IRS Section 482 and Canadian guidance]"}]}
```

**Recommended Dataset Size:**
- Minimum: 500 examples
- Optimal: 2,000-5,000 examples
- Include edge cases and complex scenarios

#### 2. **Audit Model (luca-audit-expert)**

**Training Data:**
- Audit risk assessments
- Materiality calculations (qualitative & quantitative)
- Internal control evaluations
- PCAOB standards interpretations
- ISA (International Standards on Auditing) guidance

**Key Topics:**
- Planning materiality calculations
- Sampling methodologies
- Substantive procedures
- Control testing
- Going concern assessments

#### 3. **Financial Reporting Model (luca-financial-expert)**

**Training Data:**
- FASB Codification examples
- IFRS standards applications
- Revenue recognition scenarios (ASC 606)
- Lease accounting (ASC 842)
- Complex consolidation scenarios
- Fair value measurements

### How to Fine-Tune

#### Step 1: Prepare Training Data

Create a JSONL file with conversation examples:

```bash
# Create training data file
nano tax_training_data.jsonl
```

Each line should be a JSON object with this structure:

```json
{
  "messages": [
    {"role": "system", "content": "You are Luca, a tax expert with deep knowledge of global tax law..."},
    {"role": "user", "content": "User's question here"},
    {"role": "assistant", "content": "Expert answer with calculations and citations"}
  ]
}
```

**Important Guidelines:**
- Include system prompts that match your Luca personality
- Provide detailed, accurate answers with calculations
- Cite relevant tax codes, standards, or regulations
- Include multi-turn conversations
- Cover edge cases and exceptions

#### Step 2: Upload Training Data to OpenAI

```bash
# Using OpenAI CLI
openai api files.create \
  -f tax_training_data.jsonl \
  -p fine-tune

# Or using Python SDK
from openai import OpenAI
client = OpenAI(api_key="your-api-key")

file = client.files.create(
  file=open("tax_training_data.jsonl", "rb"),
  purpose="fine-tune"
)
print(f"File ID: {file.id}")
```

#### Step 3: Create Fine-Tuning Job

```bash
# CLI
openai api fine_tuning.jobs.create \
  -t file-abc123 \
  -m gpt-4o-2024-08-06 \
  --suffix "luca-tax-expert"

# Python
fine_tune_job = client.fine_tuning.jobs.create(
  training_file="file-abc123",
  model="gpt-4o-2024-08-06",
  suffix="luca-tax-expert",
  hyperparameters={
    "n_epochs": 3  # Adjust based on dataset size
  }
)
print(f"Job ID: {fine_tune_job.id}")
```

#### Step 4: Monitor Training

```python
# Check status
job = client.fine_tuning.jobs.retrieve("ftjob-abc123")
print(f"Status: {job.status}")

# List events
events = client.fine_tuning.jobs.list_events(fine_tuning_job_id="ftjob-abc123")
for event in events:
    print(event.message)
```

#### Step 5: Use Fine-Tuned Model

Once complete, you'll get a model ID like:
```
ft:gpt-4o-2024-08-06:your-org:luca-tax-expert:abc123
```

Add this to your model mapping (see Configuration section above).

---

## 📊 Recommended Fine-Tuning Data Structure

### Tax Domain Training Data

**Coverage Areas:**
1. Corporate taxation (25% of dataset)
   - C-Corp, S-Corp, LLC calculations
   - Deductions and credits
   - Tax planning strategies

2. International tax (20%)
   - Transfer pricing
   - Tax treaties
   - Withholding requirements

3. Individual tax (15%)
   - Income calculations
   - Deductions
   - State tax considerations

4. Indirect tax (15%)
   - Sales tax nexus
   - VAT/GST calculations
   - Multi-jurisdiction compliance

5. Tax procedures (15%)
   - Audit responses
   - Appeals
   - Penalty calculations

6. Edge cases (10%)
   - Complex scenarios
   - Recent law changes
   - Ambiguous situations

### Audit Domain Training Data

**Coverage Areas:**
1. Risk assessment frameworks
2. Materiality thresholds (quantitative & qualitative)
3. Sampling techniques
4. Internal control evaluation
5. Substantive testing procedures
6. Audit report formulation

### Financial Reporting Training Data

**Coverage Areas:**
1. Revenue recognition (ASC 606)
2. Lease accounting (ASC 842)
3. Business combinations
4. Financial instruments
5. Impairment testing
6. Consolidations
7. GAAP vs IFRS differences

---

## 🎯 Testing Your Fine-Tuned Models

After fine-tuning, test with:

### Tax Model Tests:
```
- "Calculate corporate tax for US C-Corp with $1M income"
- "What are the transfer pricing requirements between US and Germany?"
- "Explain R&D tax credit eligibility"
```

### Audit Model Tests:
```
- "Calculate planning materiality for a company with $50M revenue"
- "What substantive procedures for accounts receivable?"
- "How to assess going concern risk?"
```

### Expected Improvements:
- ✅ More accurate technical terminology
- ✅ Better citation of specific codes/standards
- ✅ Faster response time
- ✅ More consistent quality
- ✅ Fewer hallucinations on edge cases

---

## 💡 Cost Considerations

**Fine-Tuning Costs (OpenAI gpt-4o):**
- Training: ~$25 per 1M tokens
- Usage: Same as base model + slight fine-tune fee

**When to Fine-Tune:**
- You have 500+ high-quality examples
- Enterprise customers require specialized expertise
- Base model accuracy isn't sufficient
- You need consistent domain-specific responses

**When NOT to Fine-Tune:**
- Limited training data (<500 examples)
- Base model + good prompting works well
- Cost constraints
- Rapidly changing regulations (fine-tuning takes time)

---

## 🔧 Current System Configuration

**Active Models:**
- `gpt-4o` - Used for all tiers currently
- `gpt-4o-mini` - Fallback model

**Ready for Fine-Tuned Models:**
- `luca-tax-expert` - Configured in router, needs fine-tuned model ID
- `luca-audit-expert` - Configured in router, needs fine-tuned model ID
- `luca-financial-expert` - Ready to add

**To Activate Fine-Tuned Models:**
1. Complete fine-tuning (see above)
2. Get model ID from OpenAI
3. Update model mapping in `server/services/aiOrchestrator.ts`
4. Test thoroughly
5. Deploy to production

---

## 📞 Next Steps

1. **Immediate**: Fix OpenAI API quota issue (upgrade billing)
2. **Short-term**: Collect training data from real user queries
3. **Medium-term**: Fine-tune tax model (highest value)
4. **Long-term**: Fine-tune audit and financial reporting models

---

## 🎓 Resources

- [OpenAI Fine-Tuning Guide](https://platform.openai.com/docs/guides/fine-tuning)
- [Best Practices for Fine-Tuning](https://platform.openai.com/docs/guides/fine-tuning/preparing-your-dataset)
- Tax Data Sources: IRS.gov, CRA.gc.ca, HMRC.gov.uk
- Audit Standards: PCAOB, AICPA, IAASB
- Financial Reporting: FASB.org, IFRS.org
