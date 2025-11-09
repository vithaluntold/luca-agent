import { aiProviderRegistry } from "./aiProviders/registry";
import { AIProviderName } from "./aiProviders/types";
import type { Message } from "@shared/schema";

/**
 * AI Analytics Service
 * 
 * Provides sentiment analysis, quality assessment, and behavioral insights
 * using existing AI providers (OpenAI, Claude, Gemini, Perplexity)
 */

export interface SentimentAnalysisResult {
  sentiment: 'positive' | 'neutral' | 'negative' | 'frustrated' | 'satisfied';
  sentimentScore: number; // -100 to 100
  emotionalTone: {
    anger?: number;
    joy?: number;
    sadness?: number;
    fear?: number;
    surprise?: number;
    frustration?: number;
    satisfaction?: number;
  };
  intent: string; // 'question', 'clarification', 'complaint', 'appreciation', etc.
  intentConfidence: number; // 0-100
}

export interface QualityAssessmentResult {
  responseQuality: number; // 0-100
  accuracyScore: number; // 0-100
  helpfulnessScore: number; // 0-100
  relevanceScore: number; // 0-100
  clarityScore: number; // 0-100
  completenessScore: number; // 0-100
  technicalComplexity: 'simple' | 'moderate' | 'advanced';
  containsCalculations: boolean;
  containsCitations: boolean;
}

export interface ConversationInsights {
  qualityScore: number; // 0-100
  complexityLevel: 'simple' | 'moderate' | 'complex' | 'expert';
  topicsDiscussed: string[];
  domainCategories: string[];
  followUpQuestionCount: number;
  clarificationRequestCount: number;
  userFrustrationDetected: boolean;
  resolutionAchieved: boolean;
}

export interface BehaviorPrediction {
  churnRisk: 'low' | 'medium' | 'high';
  churnRiskScore: number; // 0-100
  nextLikelyTopic: string;
  nextLikelyQuestion: string;
  predictedReturnDate: Date | null;
  engagementScore: number; // 0-100
  potentialUpsellCandidate: boolean;
}

export class AIAnalyticsService {
  
  /**
   * Timeout wrapper for AI calls with fallback to heuristics
   */
  private static async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    fallback: T
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      )
    ]).catch(() => fallback);
  }

  /**
   * Simple heuristic-based sentiment analysis (fallback)
   */
  private static analyzeSentimentHeuristic(message: string): SentimentAnalysisResult {
    const lowerMessage = message.toLowerCase();
    
    // Frustration keywords
    const frustrationWords = ['frustrated', 'annoying', 'terrible', 'awful', 'hate', 'worst', 'useless'];
    const hasFrustration = frustrationWords.some(word => lowerMessage.includes(word));
    
    // Positive keywords
    const positiveWords = ['thank', 'great', 'perfect', 'excellent', 'helpful', 'appreciate'];
    const hasPositive = positiveWords.some(word => lowerMessage.includes(word));
    
    // Negative keywords
    const negativeWords = ['wrong', 'error', 'problem', 'issue', 'fail', 'broken'];
    const hasNegative = negativeWords.some(word => lowerMessage.includes(word));
    
    // Question indicators
    const hasQuestion = lowerMessage.includes('?') || 
                       lowerMessage.startsWith('what') || 
                       lowerMessage.startsWith('how') ||
                       lowerMessage.startsWith('can you');
    
    let sentiment: 'positive' | 'neutral' | 'negative' | 'frustrated' | 'satisfied' = 'neutral';
    let sentimentScore = 0;
    
    if (hasFrustration) {
      sentiment = 'frustrated';
      sentimentScore = -80;
    } else if (hasPositive) {
      sentiment = 'satisfied';
      sentimentScore = 70;
    } else if (hasNegative) {
      sentiment = 'negative';
      sentimentScore = -50;
    }
    
    return {
      sentiment,
      sentimentScore,
      emotionalTone: {},
      intent: hasQuestion ? 'question' : 'other',
      intentConfidence: 40 // Low confidence for heuristics
    };
  }
  
  /**
   * Analyze sentiment of a user message (with timeout and fallback)
   */
  static async analyzeSentiment(message: string): Promise<SentimentAnalysisResult> {
    try {
      // Use Gemini for cost-effective sentiment analysis
      const provider = aiProviderRegistry.getProvider(AIProviderName.GEMINI);
      
      const prompt = `Analyze the sentiment and intent of this message from a user asking accounting questions.
      
User message: "${message}"

Respond with a JSON object containing:
1. sentiment: one of 'positive', 'neutral', 'negative', 'frustrated', 'satisfied'
2. sentimentScore: number from -100 (very negative) to 100 (very positive)
3. emotionalTone: object with scores 0-1 for anger, joy, sadness, fear, surprise, frustration, satisfaction
4. intent: classify as 'question', 'clarification', 'complaint', 'appreciation', 'follow_up', 'confirmation', 'other'
5. intentConfidence: 0-100 confidence in intent classification

Only respond with valid JSON, no additional text.`;

      const aiAnalysis = provider.generateCompletion({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        maxTokens: 500
      }).then(response => {
        const result = JSON.parse(response.content);
        return {
          sentiment: result.sentiment || 'neutral',
          sentimentScore: result.sentimentScore || 0,
          emotionalTone: result.emotionalTone || {},
          intent: result.intent || 'question',
          intentConfidence: result.intentConfidence || 50
        };
      });

      // 3 second timeout - fallback to heuristics if too slow
      return await this.withTimeout(
        aiAnalysis,
        3000,
        this.analyzeSentimentHeuristic(message)
      );
    } catch (error) {
      console.error('Sentiment analysis error:', error);
      // Fallback to heuristics
      return this.analyzeSentimentHeuristic(message);
    }
  }

  /**
   * Assess quality of an AI response
   */
  static async assessResponseQuality(
    userQuestion: string,
    aiResponse: string
  ): Promise<QualityAssessmentResult> {
    try {
      // Use Gemini for cost-effective quality assessment
      const provider = aiProviderRegistry.getProvider(AIProviderName.GEMINI);
      
      const prompt = `Evaluate the quality of this AI response to an accounting question.

User Question: "${userQuestion}"

AI Response: "${aiResponse}"

Respond with a JSON object containing:
1. responseQuality: overall quality score 0-100
2. accuracyScore: how accurate/correct the response is 0-100
3. helpfulnessScore: how helpful for the user 0-100
4. relevanceScore: how relevant to the question 0-100
5. clarityScore: how clear and understandable 0-100
6. completenessScore: how complete/thorough 0-100
7. technicalComplexity: 'simple', 'moderate', or 'advanced'
8. containsCalculations: boolean - does it include calculations?
9. containsCitations: boolean - does it reference sources/laws/regulations?

Only respond with valid JSON, no additional text.`;

      const response = await provider.generateCompletion({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        maxTokens: 500
      });

      const result = JSON.parse(response.content);
      
      return {
        responseQuality: result.responseQuality || 50,
        accuracyScore: result.accuracyScore || 50,
        helpfulnessScore: result.helpfulnessScore || 50,
        relevanceScore: result.relevanceScore || 50,
        clarityScore: result.clarityScore || 50,
        completenessScore: result.completenessScore || 50,
        technicalComplexity: result.technicalComplexity || 'moderate',
        containsCalculations: result.containsCalculations || false,
        containsCitations: result.containsCitations || false
      };
    } catch (error) {
      console.error('Quality assessment error:', error);
      // Return moderate defaults if assessment fails
      return {
        responseQuality: 50,
        accuracyScore: 50,
        helpfulnessScore: 50,
        relevanceScore: 50,
        clarityScore: 50,
        completenessScore: 50,
        technicalComplexity: 'moderate',
        containsCalculations: false,
        containsCitations: false
      };
    }
  }

  /**
   * Analyze entire conversation to extract insights
   */
  static async analyzeConversation(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<ConversationInsights> {
    try {
      // Use Claude for deep reasoning about conversation patterns
      const provider = aiProviderRegistry.getProvider(AIProviderName.CLAUDE);
      
      const conversationText = messages.map((m, i) => 
        `${i + 1}. ${m.role.toUpperCase()}: ${m.content}`
      ).join('\n\n');

      const prompt = `Analyze this accounting conversation between a user and AI assistant.

Conversation:
${conversationText}

Respond with a JSON object containing:
1. qualityScore: overall conversation quality 0-100
2. complexityLevel: 'simple', 'moderate', 'complex', or 'expert'
3. topicsDiscussed: array of specific topics covered (e.g., ["LLC formation", "depreciation"])
4. domainCategories: array of accounting domains (e.g., ["tax", "compliance", "audit"])
5. followUpQuestionCount: number of follow-up questions user asked
6. clarificationRequestCount: number of times user asked for clarification
7. userFrustrationDetected: boolean - did user seem frustrated?
8. resolutionAchieved: boolean - was the user's question fully resolved?

Only respond with valid JSON, no additional text.`;

      const response = await provider.generateCompletion({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        maxTokens: 800
      });

      const result = JSON.parse(response.content);
      
      return {
        qualityScore: result.qualityScore || 50,
        complexityLevel: result.complexityLevel || 'moderate',
        topicsDiscussed: result.topicsDiscussed || [],
        domainCategories: result.domainCategories || [],
        followUpQuestionCount: result.followUpQuestionCount || 0,
        clarificationRequestCount: result.clarificationRequestCount || 0,
        userFrustrationDetected: result.userFrustrationDetected || false,
        resolutionAchieved: result.resolutionAchieved || false
      };
    } catch (error) {
      console.error('Conversation analysis error:', error);
      return {
        qualityScore: 50,
        complexityLevel: 'moderate',
        topicsDiscussed: [],
        domainCategories: [],
        followUpQuestionCount: 0,
        clarificationRequestCount: 0,
        userFrustrationDetected: false,
        resolutionAchieved: false
      };
    }
  }

  /**
   * Predict user behavior based on historical patterns
   */
  static async predictUserBehavior(
    userHistory: {
      totalConversations: number;
      averageQualityScore: number;
      frustrationFrequency: number;
      abandonmentRate: number;
      topTopics: Array<{ topic: string; count: number }>;
      recentSentiment: string[];
    }
  ): Promise<BehaviorPrediction> {
    try {
      // Use Claude for behavioral analysis and prediction
      const provider = aiProviderRegistry.getProvider(AIProviderName.CLAUDE);
      
      const prompt = `Analyze this user's behavior pattern and predict future behavior.

User Statistics:
- Total Conversations: ${userHistory.totalConversations}
- Average Quality Score: ${userHistory.averageQualityScore}/100
- Frustration Frequency: ${userHistory.frustrationFrequency}
- Abandonment Rate: ${userHistory.abandonmentRate}%
- Top Topics: ${JSON.stringify(userHistory.topTopics)}
- Recent Sentiment Trend: ${JSON.stringify(userHistory.recentSentiment)}

Respond with a JSON object containing:
1. churnRisk: 'low', 'medium', or 'high' - likelihood user will stop using the service
2. churnRiskScore: 0-100 numeric score
3. nextLikelyTopic: predicted next topic user will ask about
4. nextLikelyQuestion: predicted next question
5. predictedReturnDate: ISO date string when user likely to return (or null)
6. engagementScore: 0-100 how engaged is this user
7. potentialUpsellCandidate: boolean - good candidate for premium features?

Consider:
- High frustration + high abandonment = high churn risk
- Consistent engagement + diverse topics = good upsell candidate
- Quality score trends indicate satisfaction
- Topic patterns suggest expertise level

Only respond with valid JSON, no additional text.`;

      const response = await provider.generateCompletion({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        maxTokens: 600
      });

      const result = JSON.parse(response.content);
      
      return {
        churnRisk: result.churnRisk || 'medium',
        churnRiskScore: result.churnRiskScore || 50,
        nextLikelyTopic: result.nextLikelyTopic || 'General accounting',
        nextLikelyQuestion: result.nextLikelyQuestion || 'Follow-up question',
        predictedReturnDate: result.predictedReturnDate ? new Date(result.predictedReturnDate) : null,
        engagementScore: result.engagementScore || 50,
        potentialUpsellCandidate: result.potentialUpsellCandidate || false
      };
    } catch (error) {
      console.error('Behavior prediction error:', error);
      return {
        churnRisk: 'medium',
        churnRiskScore: 50,
        nextLikelyTopic: 'General accounting',
        nextLikelyQuestion: 'Follow-up question',
        predictedReturnDate: null,
        engagementScore: 50,
        potentialUpsellCandidate: false
      };
    }
  }

  /**
   * Batch analyze multiple messages efficiently
   */
  static async batchAnalyzeSentiment(messages: string[]): Promise<SentimentAnalysisResult[]> {
    // Process in parallel for efficiency
    const results = await Promise.allSettled(
      messages.map(msg => this.analyzeSentiment(msg))
    );

    return results.map(result => 
      result.status === 'fulfilled' ? result.value : {
        sentiment: 'neutral',
        sentimentScore: 0,
        emotionalTone: {},
        intent: 'question',
        intentConfidence: 0
      } as SentimentAnalysisResult
    );
  }
}
