import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";
import { TrendingUp, MessageSquare, Target, BarChart3, Brain, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

interface AnalyticsData {
  behavior: {
    totalConversations: number;
    averageConversationLength: number;
    averageSessionDuration: number;
    topTopics: Array<{ topic: string; count: number }>;
    averageQualityScore: number | null;
    satisfactionTrend: 'improving' | 'declining' | 'stable';
    churnRisk: 'low' | 'medium' | 'high';
    churnRiskScore: number;
    frustrationFrequency: number;
    abandonmentRate: number;
    nextLikelyTopic: string;
    engagementScore: number;
    potentialUpsellCandidate: boolean;
  } | null;
  conversations: Array<{
    id: string;
    qualityScore: number | null;
    totalMessages: number;
    createdAt: string;
    topicsDiscussed: string[] | null;
    wasAbandoned: boolean;
  }>;
  sentimentTrends: Array<{
    date: string;
    averageSentimentScore: number | null;
    positiveMessageCount: number;
    neutralMessageCount: number;
    negativeMessageCount: number;
    frustratedMessageCount: number;
    averageQualityScore: number | null;
  }>;
  messageStats: Array<{
    userSentiment: string | null;
    responseQuality: number | null;
    createdAt: string;
  }>;
  summary: {
    totalConversations: number;
    averageQualityScore: number | null;
    topTopics: Array<{ topic: string; count: number }>;
  };
}

export default function Analytics() {
  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>No Analytics Data</CardTitle>
            <CardDescription>
              Start using Luca to generate analytics insights about your conversations and usage patterns.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { behavior, conversations, sentimentTrends, summary } = data;

  // Prepare sentiment trend chart data
  const sentimentChartData = sentimentTrends
    .slice()
    .reverse()
    .map(trend => ({
      date: format(new Date(trend.date), 'MMM d'),
      sentiment: trend.averageSentimentScore || 0,
      quality: trend.averageQualityScore || 0,
      positive: trend.positiveMessageCount,
      negative: trend.negativeMessageCount + trend.frustratedMessageCount,
    }));

  // Prepare quality trend chart data
  const qualityChartData = conversations
    .filter(c => c.qualityScore !== null)
    .slice()
    .reverse()
    .slice(-15)
    .map((conv, idx) => ({
      conversation: `#${idx + 1}`,
      quality: conv.qualityScore || 0,
      messages: conv.totalMessages,
    }));

  // Prepare topics bar chart data
  const topicsChartData = summary.topTopics.slice(0, 8);

  const getChurnRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'text-green-600 dark:text-green-400';
      case 'medium': return 'text-yellow-600 dark:text-yellow-400';
      case 'high': return 'text-red-600 dark:text-red-400';
      default: return 'text-muted-foreground';
    }
  };

  const getSatisfactionTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return '📈';
      case 'declining': return '📉';
      default: return '➡️';
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Insights about your conversations, sentiment trends, and usage patterns
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card data-testid="card-total-conversations">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Conversations</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-conversation-count">
                {summary.totalConversations}
              </div>
              {behavior && (
                <p className="text-xs text-muted-foreground">
                  Avg {behavior.averageConversationLength} messages per conversation
                </p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-quality-score">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Quality Score</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-quality-score">
                {summary.averageQualityScore || 'N/A'}
                {summary.averageQualityScore && '/100'}
              </div>
              {behavior && (
                <p className="text-xs text-muted-foreground">
                  {getSatisfactionTrendIcon(behavior.satisfactionTrend)} {behavior.satisfactionTrend}
                </p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-engagement">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Engagement Score</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-engagement-score">
                {behavior?.engagementScore || 'N/A'}
                {behavior?.engagementScore && '/100'}
              </div>
              {behavior && (
                <p className="text-xs text-muted-foreground">
                  Avg {behavior.averageSessionDuration} min per session
                </p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-churn-risk">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Retention Status</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold capitalize ${behavior ? getChurnRiskColor(behavior.churnRisk) : ''}`} data-testid="text-churn-risk">
                {behavior?.churnRisk || 'Unknown'}
              </div>
              {behavior && (
                <p className="text-xs text-muted-foreground">
                  Risk score: {behavior.churnRiskScore}/100
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quality Trend Chart */}
          <Card data-testid="card-quality-trend">
            <CardHeader>
              <CardTitle>Quality Score Trend</CardTitle>
              <CardDescription>Conversation quality over your recent sessions</CardDescription>
            </CardHeader>
            <CardContent>
              {qualityChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={qualityChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="conversation" className="text-xs" />
                    <YAxis domain={[0, 100]} className="text-xs" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px'
                      }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="quality" stroke="#8b5cf6" strokeWidth={2} name="Quality Score" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  No quality data available yet
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sentiment Trend Chart */}
          <Card data-testid="card-sentiment-trend">
            <CardHeader>
              <CardTitle>Sentiment Trend</CardTitle>
              <CardDescription>Your sentiment and quality patterns over time</CardDescription>
            </CardHeader>
            <CardContent>
              {sentimentChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={sentimentChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis domain={[-100, 100]} className="text-xs" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px'
                      }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="sentiment" stroke="#10b981" strokeWidth={2} name="Sentiment" />
                    <Line type="monotone" dataKey="quality" stroke="#d946ef" strokeWidth={2} name="Quality" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  No sentiment data available yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Topics Bar Chart */}
          <Card data-testid="card-topics">
            <CardHeader>
              <CardTitle>Top Discussion Topics</CardTitle>
              <CardDescription>Most frequently discussed accounting topics</CardDescription>
            </CardHeader>
            <CardContent>
              {topicsChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={topicsChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" />
                    <YAxis dataKey="topic" type="category" width={120} className="text-xs" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px'
                      }}
                    />
                    <Bar dataKey="count" fill="#f97316" name="Conversations" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  No topic data available yet
                </div>
              )}
            </CardContent>
          </Card>

          {/* Behavior Insights */}
          <Card data-testid="card-insights">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                AI-Powered Insights
              </CardTitle>
              <CardDescription>Personalized recommendations and predictions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {behavior ? (
                <>
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Next Likely Topic</h4>
                    <Badge variant="secondary" data-testid="badge-next-topic">{behavior.nextLikelyTopic}</Badge>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold mb-2">Usage Patterns</h4>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li data-testid="text-abandonment-rate">Abandonment rate: {behavior.abandonmentRate}%</li>
                      <li data-testid="text-frustration-frequency">Frustration events: {behavior.frustrationFrequency}</li>
                    </ul>
                  </div>

                  {behavior.potentialUpsellCandidate && (
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <h4 className="text-sm font-semibold mb-1">Pro Tip</h4>
                      <p className="text-sm text-muted-foreground">
                        Your usage patterns suggest you might benefit from premium features! Upgrade for unlimited queries and advanced tools.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Continue using Luca to generate personalized insights and recommendations
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
