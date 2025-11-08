import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Building2, CheckCircle2, XCircle, Trash2, Plus } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface Integration {
  id: string;
  provider: string;
  companyName: string | null;
  isActive: boolean;
  lastSync: string | null;
  createdAt: string;
}

export default function Integrations() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Check for OAuth callback success/error in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const error = params.get('error');
    const provider = params.get('provider');
    const message = params.get('message');

    if (success === 'true') {
      toast({
        title: "Integration Connected!",
        description: `Successfully connected to ${provider || 'the service'}.`
      });
      // Clean up URL
      window.history.replaceState({}, '', '/integrations');
    } else if (error === 'true') {
      toast({
        variant: "destructive",
        title: "Integration Failed",
        description: message || "Failed to connect. Please try again."
      });
      // Clean up URL
      window.history.replaceState({}, '', '/integrations');
    }
  }, [toast]);

  const { data: integrationsData } = useQuery({
    queryKey: ['/api/integrations'],
    enabled: !!user,
  });

  const deleteIntegrationMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/integrations/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete integration');
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Integration Removed",
        description: "The integration has been disconnected successfully."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/integrations'] });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to remove integration"
      });
    }
  });

  const connectIntegrationMutation = useMutation({
    mutationFn: async (providerId: string) => {
      const res = await fetch(`/api/integrations/${providerId}/initiate`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to initiate integration');
      return res.json();
    },
    onSuccess: (data: { authUrl: string; provider: string }) => {
      // Redirect to OAuth provider's authorization page
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to initiate integration. Please try again."
      });
    }
  });

  const handleConnect = (providerId: string) => {
    connectIntegrationMutation.mutate(providerId);
  };

  const handleDelete = (id: string, provider: string) => {
    if (confirm(`Are you sure you want to disconnect ${provider}?`)) {
      deleteIntegrationMutation.mutate(id);
    }
  };

  const integrations: Integration[] = (integrationsData as any)?.integrations || [];

  const providers = [
    {
      id: 'quickbooks',
      name: 'QuickBooks Online',
      description: 'Connect your QuickBooks account for automatic financial data sync',
      icon: Building2,
      color: 'bg-green-500',
    },
    {
      id: 'xero',
      name: 'Xero',
      description: 'Sync your Xero accounting data for comprehensive analysis',
      icon: Building2,
      color: 'bg-blue-500',
    },
    {
      id: 'zoho',
      name: 'Zoho Books',
      description: 'Integrate with Zoho Books for seamless data access',
      icon: Building2,
      color: 'bg-red-500',
    },
  ];

  const taxSoftware = [
    { id: 'turbotax', name: 'TurboTax', description: 'Import tax data from TurboTax' },
    { id: 'hrblock', name: 'H&R Block', description: 'Connect H&R Block tax files' },
    { id: 'drake', name: 'Drake Tax', description: 'Professional tax software integration' },
    { id: 'proseries', name: 'ProSeries', description: 'Intuit ProSeries integration' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => setLocation('/chat')}
            data-testid="button-back"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Chat
          </Button>
        </div>

        <h1 className="text-3xl font-bold mb-2">Integrations</h1>
        <p className="text-muted-foreground mb-8">
          Connect your accounting and tax software for comprehensive analysis
        </p>

        {/* Active Integrations */}
        {integrations.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Active Integrations</h2>
            <div className="grid gap-4">
              {integrations.map((integration) => (
                <Card key={integration.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Building2 className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold capitalize">{integration.provider}</h3>
                          <p className="text-sm text-muted-foreground">
                            {integration.companyName || 'Company not set'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {integration.isActive ? (
                          <Badge variant="default" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <XCircle className="h-3 w-3" />
                            Inactive
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(integration.id, integration.provider)}
                          disabled={deleteIntegrationMutation.isPending}
                          data-testid={`button-delete-${integration.provider}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <Separator className="my-8" />

        {/* Accounting Software */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Accounting Software</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {providers.map((provider) => {
              const isConnected = integrations.some(i => i.provider.toLowerCase() === provider.id);
              const Icon = provider.icon;
              
              return (
                <Card key={provider.id}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-lg ${provider.color} flex items-center justify-center`}>
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <CardTitle className="text-lg">{provider.name}</CardTitle>
                    </div>
                    <CardDescription>{provider.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isConnected ? (
                      <Badge variant="default" className="w-full justify-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Connected
                      </Badge>
                    ) : (
                      <Button
                        className="w-full"
                        onClick={() => handleConnect(provider.id)}
                        disabled={connectIntegrationMutation.isPending}
                        data-testid={`button-connect-${provider.id}`}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Connect
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        <Separator className="my-8" />

        {/* Tax Software */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Tax Software</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {taxSoftware.map((software) => (
              <Card key={software.id}>
                <CardHeader>
                  <CardTitle className="text-lg">{software.name}</CardTitle>
                  <CardDescription>{software.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleConnect(software.id)}
                    disabled={connectIntegrationMutation.isPending}
                    data-testid={`button-connect-${software.id}`}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Connect
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
