import { db } from "../db";
import { forensicDocuments, forensicFindings, forensicCases } from "@shared/schema";
import { eq } from "drizzle-orm";
import { aiProviderRegistry, AIProviderName } from "./aiProviders";

/**
 * ForensicAnalyzer - Analyzes financial documents for anomalies and fraud indicators
 * 
 * This service uses Azure Document Intelligence to extract data from financial documents,
 * then applies forensic accounting heuristics and AI analysis to detect anomalies.
 */
export class ForensicAnalyzer {
  /**
   * Analyze a document for forensic findings
   */
  static async analyzeDocument(documentId: string, fileBuffer: Buffer, mimeType: string) {
    try {
      // Get Azure Document Intelligence provider
      const azureDocProvider = aiProviderRegistry.getProvider(AIProviderName.AZURE_DOCUMENT_INTELLIGENCE);
      
      if (!azureDocProvider) {
        throw new Error('Azure Document Intelligence provider not available');
      }
      
      // Analyze document
      const analysisResult = await azureDocProvider.analyzeDocument(fileBuffer, mimeType);
      
      // Update document with extracted data
      await db.update(forensicDocuments)
        .set({
          extractedData: analysisResult.fields,
          documentMetadata: {
            confidence: analysisResult.confidence,
            pageCount: analysisResult.pageCount
          },
          analysisStatus: 'analyzed'
        })
        .where(eq(forensicDocuments.id, documentId));
      
      // Get document and case
      const [document] = await db
        .select()
        .from(forensicDocuments)
        .where(eq(forensicDocuments.id, documentId))
        .limit(1);
      
      if (!document) {
        throw new Error('Document not found');
      }
      
      // Run forensic analysis heuristics
      const findings = await this.detectAnomalies(document, analysisResult.fields);
      
      // Store findings
      for (const finding of findings) {
        await db.insert(forensicFindings).values({
          caseId: document.caseId,
          documentId: document.id,
          ...finding
        });
      }
      
      // Update case statistics
      await this.updateCaseStats(document.caseId);
      
    } catch (error) {
      console.error(`[ForensicAnalyzer] Analysis failed for document ${documentId}:`, error);
      
      // Mark document as failed
      await db.update(forensicDocuments)
        .set({ analysisStatus: 'flagged' })
        .where(eq(forensicDocuments.id, documentId));
      
      throw error;
    }
  }
  
  /**
   * Detect anomalies using forensic accounting heuristics
   */
  private static async detectAnomalies(document: any, extractedData: any): Promise<any[]> {
    const findings: any[] = [];
    
    // Mock forensic analysis - In production, this would use sophisticated algorithms
    // and cross-document analysis
    
    // Anomaly 1: Large round numbers (fraud indicator)
    if (extractedData.totalAmount && typeof extractedData.totalAmount === 'number') {
      if (extractedData.totalAmount % 1000 === 0 && extractedData.totalAmount > 10000) {
        findings.push({
          findingType: 'anomaly',
          severity: 'medium',
          title: 'Suspicious Round Number',
          description: `Transaction amount of ${extractedData.totalAmount.toLocaleString()} is a suspicious round number, which may indicate fabricated transactions`,
          impactedMetrics: { totalAmount: extractedData.totalAmount },
          evidenceDetails: { field: 'totalAmount', value: extractedData.totalAmount },
          remediationJson: { action: 'verify_supporting_documentation', priority: 'medium' }
        });
      }
    }
    
    // Anomaly 2: Weekend transaction dates (unusual pattern)
    if (extractedData.transactionDate) {
      const date = new Date(extractedData.transactionDate);
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        findings.push({
          findingType: 'pattern_violation',
          severity: 'low',
          title: 'Weekend Transaction',
          description: `Transaction dated ${extractedData.transactionDate} occurred on a weekend, which may warrant investigation`,
          impactedMetrics: { transactionDate: extractedData.transactionDate },
          evidenceDetails: { field: 'transactionDate', value: extractedData.transactionDate },
          remediationJson: { action: 'verify_business_justification', priority: 'low' }
        });
      }
    }
    
    // Anomaly 3: Missing required fields
    const requiredFields = ['vendor', 'amount', 'date', 'description'];
    const missingFields = requiredFields.filter(field => !extractedData[field]);
    
    if (missingFields.length > 0) {
      findings.push({
        findingType: 'missing_data',
        severity: 'high',
        title: 'Missing Required Information',
        description: `Document is missing critical fields: ${missingFields.join(', ')}`,
        impactedMetrics: { missingFields },
        evidenceDetails: { missingFields },
        remediationJson: { action: 'request_complete_documentation', priority: 'high' }
      });
    }
    
    return findings;
  }
  
  /**
   * Update case-level statistics
   */
  private static async updateCaseStats(caseId: string) {
    // Get all findings for this case
    const findings = await db
      .select()
      .from(forensicFindings)
      .where(eq(forensicFindings.caseId, caseId));
    
    const totalFindings = findings.length;
    const criticalFindings = findings.filter(f => f.severity === 'critical' || f.severity === 'high').length;
    
    // Calculate overall risk score (0-100)
    let riskScore = 0;
    findings.forEach(finding => {
      switch (finding.severity) {
        case 'critical': riskScore += 25; break;
        case 'high': riskScore += 15; break;
        case 'medium': riskScore += 8; break;
        case 'low': riskScore += 3; break;
      }
    });
    
    riskScore = Math.min(riskScore, 100);
    
    // Determine severity level
    let severityLevel = 'low';
    if (riskScore >= 75) severityLevel = 'critical';
    else if (riskScore >= 50) severityLevel = 'high';
    else if (riskScore >= 25) severityLevel = 'medium';
    
    // Update case
    await db.update(forensicCases)
      .set({
        totalFindings,
        criticalFindings,
        overallRiskScore: riskScore,
        severityLevel
      })
      .where(eq(forensicCases.id, caseId));
  }
}
