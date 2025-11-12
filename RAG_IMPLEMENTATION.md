# Luca RAG System Implementation Guide

## Overview

Building a custom RAG (Retrieval-Augmented Generation) system for Luca to provide authoritative, cited accounting and tax answers by combining AI with a curated knowledge base.

---

## Technology Stack

### Core Components

1. **Vector Database**: Pinecone or ChromaDB
   - **Pinecone** (Recommended for production): Cloud-hosted, highly scalable, 99.9% uptime SLA
   - **ChromaDB**: Open-source, self-hosted, great for development/testing
   
2. **Embedding Model**: OpenAI `text-embedding-3-large` or `text-embedding-3-small`
   - Dimensions: 1536 (small) or 3072 (large)
   - Cost: $0.00013 per 1K tokens (large), $0.00002 per 1K tokens (small)
   - Quality: State-of-the-art semantic understanding

3. **Document Processing**: LangChain or custom chunking
   - Intelligent text splitting (preserve context)
   - Metadata extraction (section numbers, dates, jurisdiction)
   - Table/formula preservation

4. **Knowledge Sources**:
   - IRS Publications (PDFs, HTML)
   - US Tax Code (Cornell LII, tax.gov)
   - FASB Accounting Standards Codification
   - Court cases (Tax Court, Circuit Courts)
   - State tax codes (50 states)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      User Query                              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│             Query Classification & Routing                   │
│  (Detect domain: tax, audit, financial reporting)           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Query Embedding Generation                      │
│  (OpenAI text-embedding-3-large)                            │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│            Vector Similarity Search                          │
│  Search relevant namespaces:                                │
│  - tax_code (IRC sections)                                  │
│  - irs_publications                                         │
│  - gaap_standards (FASB ASC)                                │
│  - court_cases (tax court rulings)                          │
│  Top K=5 most relevant chunks                               │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Re-ranking & Filtering                          │
│  - Score relevance (cosine similarity > 0.75)               │
│  - Filter by jurisdiction (if specified)                    │
│  - Filter by date (current law vs. historical)              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│           Context Assembly for LLM                           │
│  Format: "Based on these authoritative sources:             │
│           1. IRC §162(a) - Trade/Business Expenses          │
│           2. IRS Pub 535 - Home Office Deduction            │
│           3. Tax Court Case: Smith v. Commissioner"         │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              AI Model (GPT-4, Claude, etc.)                  │
│  Generate answer WITH citations from retrieved context      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Response to User                                │
│  "According to IRC §162(a), business expenses must be...    │
│   [Source: Internal Revenue Code §162(a)]"                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Infrastructure Setup (Week 1)

#### 1.1 Install Dependencies

```bash
npm install @pinecone-database/pinecone
npm install openai
npm install pdf-parse
npm install cheerio          # HTML parsing
npm install langchain
npm install @langchain/openai
npm install @langchain/pinecone
npm install @langchain/community
```

#### 1.2 Set up Pinecone Account

1. Sign up at https://www.pinecone.io/
2. Create index: `luca-knowledge-base`
   - Dimensions: 3072 (for text-embedding-3-large)
   - Metric: cosine
   - Pods: s1.x1 (starter)
3. Get API key → Add to Replit Secrets as `PINECONE_API_KEY`

#### 1.3 Database Schema

```typescript
// shared/schema.ts - Add RAG tables
export const knowledgeDocuments = pgTable('knowledge_documents', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  title: text('title').notNull(),
  source: varchar('source').notNull(), // 'irs', 'fasb', 'tax-court', etc.
  sourceUrl: text('source_url'),
  documentType: varchar('document_type'), // 'tax-code', 'publication', 'standard', 'case-law'
  jurisdiction: varchar('jurisdiction'), // 'us-federal', 'california', 'canada', etc.
  effectiveDate: date('effective_date'),
  content: text('content').notNull(),
  metadata: jsonb('metadata'),
  vectorId: varchar('vector_id'), // Pinecone vector ID
  chunkCount: integer('chunk_count').default(0),
  indexed: boolean('indexed').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const knowledgeChunks = pgTable('knowledge_chunks', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar('document_id').references(() => knowledgeDocuments.id),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  vectorId: varchar('vector_id').notNull(), // Pinecone vector ID
  metadata: jsonb('metadata'), // Section number, page, etc.
  createdAt: timestamp('created_at').defaultNow()
});

export const ragQueries = pgTable('rag_queries', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar('message_id').references(() => messages.id),
  query: text('query').notNull(),
  queryEmbedding: text('query_embedding'), // Stored for analysis
  retrievedChunks: jsonb('retrieved_chunks'), // Which chunks were used
  relevanceScores: jsonb('relevance_scores'),
  latencyMs: integer('latency_ms'),
  createdAt: timestamp('created_at').defaultNow()
});
```

---

### Phase 2: Knowledge Ingestion Pipeline (Week 2)

#### 2.1 Document Scraper Service

```typescript
// server/services/rag/documentScraper.ts
import axios from 'axios';
import * as cheerio from 'cheerio';
import pdfParse from 'pdf-parse';

export class DocumentScraperService {
  /**
   * Scrape IRS publications from irs.gov
   */
  async scrapeIRSPublications(): Promise<ScrapedDocument[]> {
    const publications = [
      { id: 'pub17', url: 'https://www.irs.gov/pub/irs-pdf/p17.pdf', title: 'Your Federal Income Tax' },
      { id: 'pub535', url: 'https://www.irs.gov/pub/irs-pdf/p535.pdf', title: 'Business Expenses' },
      { id: 'pub587', url: 'https://www.irs.gov/pub/irs-pdf/p587.pdf', title: 'Business Use of Your Home' },
      // ... 100+ more publications
    ];
    
    const docs: ScrapedDocument[] = [];
    
    for (const pub of publications) {
      try {
        console.log(`[Scraper] Downloading ${pub.title}...`);
        
        const response = await axios.get(pub.url, {
          responseType: 'arraybuffer'
        });
        
        const pdfBuffer = Buffer.from(response.data);
        const parsed = await pdfParse(pdfBuffer);
        
        docs.push({
          id: pub.id,
          title: pub.title,
          source: 'irs',
          sourceUrl: pub.url,
          documentType: 'publication',
          jurisdiction: 'us-federal',
          content: parsed.text,
          metadata: {
            pages: parsed.numpages,
            version: new Date().getFullYear().toString()
          }
        });
        
        console.log(`[Scraper] ✓ ${pub.title} - ${parsed.numpages} pages`);
        
      } catch (error) {
        console.error(`[Scraper] ✗ Failed to scrape ${pub.title}:`, error);
      }
    }
    
    return docs;
  }
  
  /**
   * Scrape US Tax Code from Cornell Legal Information Institute
   */
  async scrapeTaxCode(): Promise<ScrapedDocument[]> {
    const baseUrl = 'https://www.law.cornell.edu/uscode/text/26';
    const docs: ScrapedDocument[] = [];
    
    // Scrape IRC sections 1-9834
    const sections = [
      { section: '1', title: 'Tax imposed' },
      { section: '11', title: 'Tax imposed on corporations' },
      { section: '61', title: 'Gross income defined' },
      { section: '162', title: 'Trade or business expenses' },
      { section: '179', title: 'Election to expense certain depreciable business assets' },
      // ... hundreds more
    ];
    
    for (const sec of sections) {
      try {
        const url = `${baseUrl}/${sec.section}`;
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        
        // Extract section content
        const content = $('.bodytext').text();
        
        docs.push({
          id: `irc-${sec.section}`,
          title: `IRC §${sec.section} - ${sec.title}`,
          source: 'cornell-lii',
          sourceUrl: url,
          documentType: 'tax-code',
          jurisdiction: 'us-federal',
          content: content,
          metadata: {
            section: sec.section,
            type: 'Internal Revenue Code'
          }
        });
        
        console.log(`[Scraper] ✓ IRC §${sec.section}`);
        
      } catch (error) {
        console.error(`[Scraper] ✗ Failed IRC §${sec.section}:`, error);
      }
    }
    
    return docs;
  }
  
  /**
   * Scrape FASB Accounting Standards (requires subscription or public excerpts)
   */
  async scrapeFASBStandards(): Promise<ScrapedDocument[]> {
    // Note: Full FASB ASC requires paid subscription
    // For MVP, use publicly available summaries and FASB.org news
    
    const docs: ScrapedDocument[] = [];
    
    // Example: Scrape FASB updates and summaries
    const updates = [
      { 
        topic: 'ASC 606', 
        title: 'Revenue from Contracts with Customers',
        url: 'https://www.fasb.org/jsp/FASB/Document_C/DocumentPage?cid=1176168316829'
      },
      // ... more standards
    ];
    
    for (const update of updates) {
      try {
        const response = await axios.get(update.url);
        const $ = cheerio.load(response.data);
        const content = $('.content').text();
        
        docs.push({
          id: update.topic.toLowerCase().replace(' ', '-'),
          title: update.title,
          source: 'fasb',
          sourceUrl: update.url,
          documentType: 'standard',
          jurisdiction: 'us-federal',
          content: content,
          metadata: {
            topic: update.topic
          }
        });
        
      } catch (error) {
        console.error(`[Scraper] ✗ Failed ${update.topic}:`, error);
      }
    }
    
    return docs;
  }
}

interface ScrapedDocument {
  id: string;
  title: string;
  source: string;
  sourceUrl: string;
  documentType: string;
  jurisdiction: string;
  content: string;
  metadata: any;
}
```

#### 2.2 Document Chunking Service

```typescript
// server/services/rag/documentChunker.ts
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

export class DocumentChunkerService {
  private splitter: RecursiveCharacterTextSplitter;
  
  constructor() {
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,        // 1000 characters per chunk
      chunkOverlap: 200,      // 200 character overlap for context
      separators: ['\n\n', '\n', '. ', ' ', ''],  // Split on paragraphs first
    });
  }
  
  /**
   * Chunk a document into smaller pieces for embedding
   */
  async chunkDocument(
    document: ScrapedDocument
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    
    // Split content into chunks
    const texts = await this.splitter.createDocuments([document.content]);
    
    for (let i = 0; i < texts.length; i++) {
      chunks.push({
        documentId: document.id,
        chunkIndex: i,
        content: texts[i].pageContent,
        metadata: {
          ...document.metadata,
          title: document.title,
          source: document.source,
          sourceUrl: document.sourceUrl,
          documentType: document.documentType,
          jurisdiction: document.jurisdiction,
          chunkIndex: i,
          totalChunks: texts.length
        }
      });
    }
    
    console.log(`[Chunker] Split ${document.title} into ${chunks.length} chunks`);
    
    return chunks;
  }
  
  /**
   * Smart chunking for structured documents (preserve sections)
   */
  chunkTaxCode(ircSection: string): DocumentChunk[] {
    // Tax code has clear structure: (a), (b), (c) subsections
    // Keep each subsection as its own chunk
    
    const subsections = this.extractSubsections(ircSection);
    
    return subsections.map((subsection, i) => ({
      documentId: `irc-section`,
      chunkIndex: i,
      content: subsection.content,
      metadata: {
        subsection: subsection.id,
        type: 'tax-code-subsection'
      }
    }));
  }
  
  private extractSubsections(text: string): Array<{id: string; content: string}> {
    // Regex to find (a), (b), (c) patterns
    const subsectionRegex = /\(([a-z])\)\s+(.*?)(?=\([a-z]\)|$)/gs;
    const subsections: Array<{id: string; content: string}> = [];
    
    let match;
    while ((match = subsectionRegex.exec(text)) !== null) {
      subsections.push({
        id: match[1],
        content: match[2].trim()
      });
    }
    
    return subsections;
  }
}

interface DocumentChunk {
  documentId: string;
  chunkIndex: number;
  content: string;
  metadata: any;
}
```

#### 2.3 Embedding & Vector Storage Service

```typescript
// server/services/rag/vectorStore.ts
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

export class VectorStoreService {
  private pinecone: Pinecone;
  private openai: OpenAI;
  private indexName = 'luca-knowledge-base';
  
  constructor() {
    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!
    });
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!
    });
  }
  
  /**
   * Generate embeddings for text chunks
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    console.log(`[VectorStore] Generating embeddings for ${texts.length} chunks...`);
    
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-large',  // 3072 dimensions
      input: texts,
    });
    
    return response.data.map(d => d.embedding);
  }
  
  /**
   * Upsert document chunks to Pinecone
   */
  async upsertChunks(chunks: DocumentChunk[]): Promise<void> {
    const index = this.pinecone.index(this.indexName);
    
    // Generate embeddings in batches of 100
    const batchSize = 100;
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      // Get embeddings
      const texts = batch.map(c => c.content);
      const embeddings = await this.generateEmbeddings(texts);
      
      // Prepare vectors for Pinecone
      const vectors = batch.map((chunk, idx) => ({
        id: `${chunk.documentId}-chunk-${chunk.chunkIndex}`,
        values: embeddings[idx],
        metadata: {
          content: chunk.content,
          ...chunk.metadata
        }
      }));
      
      // Upsert to Pinecone
      await index.upsert(vectors);
      
      console.log(`[VectorStore] Upserted batch ${i / batchSize + 1} (${vectors.length} vectors)`);
    }
  }
  
  /**
   * Search for relevant chunks
   */
  async search(
    query: string,
    options: {
      topK?: number;
      namespace?: string;
      filter?: any;
    } = {}
  ): Promise<SearchResult[]> {
    const { topK = 5, namespace, filter } = options;
    
    // Generate query embedding
    const queryEmbedding = await this.generateEmbeddings([query]);
    
    // Search Pinecone
    const index = this.pinecone.index(this.indexName);
    const results = await index.query({
      vector: queryEmbedding[0],
      topK,
      includeMetadata: true,
      namespace,
      filter
    });
    
    return results.matches?.map(match => ({
      id: match.id,
      score: match.score || 0,
      content: match.metadata?.content as string,
      metadata: match.metadata || {}
    })) || [];
  }
}

interface SearchResult {
  id: string;
  score: number;
  content: string;
  metadata: any;
}
```

---

### Phase 3: RAG Query Service (Week 3)

#### 3.1 Main RAG Service

```typescript
// server/services/rag/ragService.ts
import { VectorStoreService } from './vectorStore';
import { QueryClassification } from '../queryTriage';

export class RAGService {
  private vectorStore: VectorStoreService;
  
  constructor() {
    this.vectorStore = new VectorStoreService();
  }
  
  /**
   * Retrieve relevant context for a query
   */
  async retrieveContext(
    query: string,
    classification: QueryClassification
  ): Promise<RetrievedContext> {
    const startTime = Date.now();
    
    // Determine which namespaces to search based on classification
    const namespaces = this.selectNamespaces(classification);
    
    // Search across namespaces in parallel
    const results = await Promise.all(
      namespaces.map(namespace =>
        this.vectorStore.search(query, {
          topK: 3,  // Get top 3 from each namespace
          namespace,
          filter: this.buildFilter(classification)
        })
      )
    );
    
    // Flatten and sort by relevance score
    const allResults = results
      .flat()
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);  // Take top 5 overall
    
    // Filter by minimum relevance threshold
    const relevant = allResults.filter(r => r.score > 0.75);
    
    const latencyMs = Date.now() - startTime;
    
    console.log(`[RAG] Retrieved ${relevant.length} relevant chunks in ${latencyMs}ms`);
    
    return {
      chunks: relevant,
      latencyMs,
      query,
      namespaces
    };
  }
  
  /**
   * Format retrieved context for LLM prompt
   */
  formatContextForPrompt(context: RetrievedContext): string {
    if (context.chunks.length === 0) {
      return '';
    }
    
    return `
**Authoritative Sources:**

${context.chunks.map((chunk, i) => `
${i + 1}. **${chunk.metadata.title}** (${chunk.metadata.source})
   ${chunk.content.substring(0, 500)}...
   [Relevance: ${(chunk.score * 100).toFixed(1)}%]
   [Source: ${chunk.metadata.sourceUrl}]
`).join('\n')}

**Instructions:**
- Base your answer on these authoritative sources
- Cite specific sources using the format: [Source: IRC §162(a)]
- If sources conflict, explain the discrepancy
- If sources don't fully answer the question, state what's missing
    `.trim();
  }
  
  /**
   * Select appropriate namespaces based on query classification
   */
  private selectNamespaces(classification: QueryClassification): string[] {
    const namespaces: string[] = [];
    
    if (classification.domain === 'tax') {
      namespaces.push('tax-code', 'irs-publications');
    }
    
    if (classification.domain === 'audit') {
      namespaces.push('pcaob-standards', 'audit-guides');
    }
    
    if (classification.domain === 'financial-reporting') {
      namespaces.push('gaap-standards', 'ifrs-standards');
    }
    
    // Always include court cases for legal questions
    if (classification.requiresDeepReasoning) {
      namespaces.push('court-cases');
    }
    
    return namespaces;
  }
  
  /**
   * Build metadata filter based on query context
   */
  private buildFilter(classification: QueryClassification): any {
    const filter: any = {};
    
    // Filter by jurisdiction if specified
    if (classification.jurisdiction) {
      filter.jurisdiction = classification.jurisdiction;
    }
    
    // Filter by document type
    if (classification.requiresResearch) {
      filter.documentType = { $in: ['publication', 'court-case'] };
    }
    
    return filter;
  }
}

interface RetrievedContext {
  chunks: Array<{
    id: string;
    score: number;
    content: string;
    metadata: any;
  }>;
  latencyMs: number;
  query: string;
  namespaces: string[];
}
```

#### 3.2 Integrate RAG into AI Orchestrator

```typescript
// server/services/aiOrchestrator.ts - UPDATE
import { RAGService } from './rag/ragService';

export class AIOrchestrator {
  private ragService: RAGService;
  
  constructor() {
    // ... existing initialization
    this.ragService = new RAGService();
  }
  
  async processQuery(
    query: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    userTier: string,
    options?: ProcessQueryOptions
  ): Promise<OrchestrationResult> {
    // ... existing code (triage, clarification, etc.)
    
    // NEW: Retrieve authoritative context via RAG
    let retrievedContext: RetrievedContext | null = null;
    
    if (classification.requiresResearch || 
        classification.requiresDeepReasoning ||
        classification.domain === 'tax') {
      retrievedContext = await this.ragService.retrieveContext(
        query,
        classification
      );
      
      console.log(`[Orchestrator] RAG retrieved ${retrievedContext.chunks.length} sources`);
    }
    
    // Build enhanced context with RAG results
    const enhancedContext = this.buildEnhancedContext(
      classification,
      userTier,
      clarificationAnalysis,
      calculationResults,
      options?.attachment,
      visualization,
      options?.chatMode,
      retrievedContext  // NEW: Include RAG context
    );
    
    // ... rest of existing code
  }
  
  private buildEnhancedContext(
    // ... existing params
    retrievedContext: RetrievedContext | null
  ): string {
    let context = '';
    
    // Add RAG context at the beginning
    if (retrievedContext && retrievedContext.chunks.length > 0) {
      context += this.ragService.formatContextForPrompt(retrievedContext);
      context += '\n\n---\n\n';
    }
    
    // ... rest of existing context building
    
    return context;
  }
}
```

---

### Phase 4: Knowledge Base Population (Week 4)

#### 4.1 Ingestion Script

```typescript
// scripts/ingestKnowledge.ts
import { DocumentScraperService } from '../server/services/rag/documentScraper';
import { DocumentChunkerService } from '../server/services/rag/documentChunker';
import { VectorStoreService } from '../server/services/rag/vectorStore';
import { db } from '../server/db';
import { knowledgeDocuments, knowledgeChunks } from '../shared/schema';

async function ingestKnowledgeBase() {
  console.log('[Ingestion] Starting knowledge base ingestion...\n');
  
  const scraper = new DocumentScraperService();
  const chunker = new DocumentChunkerService();
  const vectorStore = new VectorStoreService();
  
  // Step 1: Scrape IRS publications
  console.log('[Step 1/4] Scraping IRS publications...');
  const irsDocs = await scraper.scrapeIRSPublications();
  console.log(`✓ Scraped ${irsDocs.length} IRS publications\n`);
  
  // Step 2: Scrape Tax Code
  console.log('[Step 2/4] Scraping US Tax Code...');
  const taxCodeDocs = await scraper.scrapeTaxCode();
  console.log(`✓ Scraped ${taxCodeDocs.length} IRC sections\n`);
  
  // Step 3: Scrape FASB standards
  console.log('[Step 3/4] Scraping FASB standards...');
  const fasbDocs = await scraper.scrapeFASBStandards();
  console.log(`✓ Scraped ${fasbDocs.length} FASB standards\n`);
  
  // Step 4: Process and store all documents
  console.log('[Step 4/4] Processing and storing documents...');
  
  const allDocs = [...irsDocs, ...taxCodeDocs, ...fasbDocs];
  let totalChunks = 0;
  
  for (const doc of allDocs) {
    // Save document to database
    const [savedDoc] = await db.insert(knowledgeDocuments).values({
      title: doc.title,
      source: doc.source,
      sourceUrl: doc.sourceUrl,
      documentType: doc.documentType,
      jurisdiction: doc.jurisdiction,
      content: doc.content,
      metadata: doc.metadata
    }).returning();
    
    // Chunk the document
    const chunks = await chunker.chunkDocument(doc);
    totalChunks += chunks.length;
    
    // Generate embeddings and store in Pinecone
    await vectorStore.upsertChunks(chunks.map(chunk => ({
      ...chunk,
      documentId: savedDoc.id
    })));
    
    // Save chunk metadata to database
    for (const chunk of chunks) {
      await db.insert(knowledgeChunks).values({
        documentId: savedDoc.id,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        vectorId: `${savedDoc.id}-chunk-${chunk.chunkIndex}`,
        metadata: chunk.metadata
      });
    }
    
    // Mark document as indexed
    await db.update(knowledgeDocuments)
      .set({ 
        indexed: true, 
        chunkCount: chunks.length,
        updatedAt: new Date()
      })
      .where(eq(knowledgeDocuments.id, savedDoc.id));
    
    console.log(`✓ ${doc.title} - ${chunks.length} chunks`);
  }
  
  console.log(`\n[Ingestion] Complete!`);
  console.log(`  Documents: ${allDocs.length}`);
  console.log(`  Total chunks: ${totalChunks}`);
  console.log(`  Vectors stored in Pinecone: ${totalChunks}`);
}

// Run ingestion
ingestKnowledge().then(() => {
  console.log('\n✓ Knowledge base ingestion successful!');
  process.exit(0);
}).catch(error => {
  console.error('\n✗ Ingestion failed:', error);
  process.exit(1);
});
```

---

## Cost Analysis

### Storage Costs

**Pinecone** (s1.x1 pod, 10M vectors):
- $70/month base
- Additional: $0.10 per 1M vectors

**Expected**: ~100K chunks → $70/month

### Embedding Costs

**OpenAI text-embedding-3-large**:
- $0.13 per 1M tokens
- Average document: 5,000 tokens
- 1,000 documents = 5M tokens = **$0.65 one-time**

**Ongoing** (user queries):
- Average query: 50 tokens
- 10,000 queries/month = 500K tokens = **$0.065/month**

### Total Monthly Cost: ~$70-80/month

---

## Success Metrics

1. **Retrieval Precision**: >85% (relevant docs in top 5)
2. **Citation Rate**: >80% (responses include source citations)
3. **Latency**: <500ms for retrieval
4. **Answer Quality**: >90/100 on expert evaluations
5. **User Satisfaction**: >75% thumbs up rate

---

## Next Steps

1. **Set up Pinecone account** and get API key
2. **Install dependencies** (`npm install` packages)
3. **Run database migrations** (`npm run db:push`)
4. **Execute ingestion script** (`tsx scripts/ingestKnowledge.ts`)
5. **Test RAG queries** in development
6. **Monitor quality metrics** and iterate

---

## Resources

- Pinecone Docs: https://docs.pinecone.io/
- OpenAI Embeddings: https://platform.openai.com/docs/guides/embeddings
- LangChain: https://js.langchain.com/docs/
- IRS Publications: https://www.irs.gov/forms-instructions-and-publications
- Cornell LII (Tax Code): https://www.law.cornell.edu/uscode/text/26

---

**Ready to build?** Let me know and I'll start implementing! 🚀
