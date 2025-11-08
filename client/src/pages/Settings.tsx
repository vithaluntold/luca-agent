import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import ProfilesSection from "@/components/ProfilesSection";

export default function Settings() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [llmProvider, setLlmProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [modelName, setModelName] = useState("");
  const [customEndpoint, setCustomEndpoint] = useState("");
  const [enableCustomLLM, setEnableCustomLLM] = useState(false);

  const { data: llmConfig } = useQuery({
    queryKey: ['/api/llm-config'],
    enabled: !!user,
  });

  const saveLLMConfigMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch('/api/llm-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to save configuration');
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Settings Saved",
        description: "Your LLM configuration has been updated successfully."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/llm-config'] });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save LLM configuration"
      });
    }
  });

  const handleSaveLLMConfig = () => {
    saveLLMConfigMutation.mutate({
      provider: llmProvider,
      apiKey: apiKey || undefined,
      modelName: modelName || undefined,
      endpoint: customEndpoint || undefined,
      isEnabled: enableCustomLLM
    });
  };

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/gdpr/delete-account', {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to delete account');
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Account Deleted",
        description: "Your account and all data have been permanently deleted."
      });
      setLocation('/');
    }
  });

  const handleDeleteAccount = () => {
    if (confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
      deleteAccountMutation.mutate();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6">
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

        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-muted-foreground mb-8">
          Manage your account and preferences
        </p>

        <div className="space-y-6">
          {/* Account Information */}
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>
                Your Luca account details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={user?.email || ''} disabled />
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={user?.name || ''} disabled />
              </div>
              <div className="space-y-2">
                <Label>Subscription Tier</Label>
                <Input value={user?.subscriptionTier || 'free'} disabled className="capitalize" />
              </div>
            </CardContent>
          </Card>

          {/* Profiles Section */}
          <Card>
            <CardHeader>
              <CardTitle>Profiles</CardTitle>
              <CardDescription>
                Manage your business, personal, and family profiles
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProfilesSection />
            </CardContent>
          </Card>

          {/* Custom LLM Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Custom LLM Configuration</CardTitle>
              <CardDescription>
                Bring your own AI model (OpenAI, Anthropic, Google, or custom endpoint)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="enable-custom-llm">Enable Custom LLM</Label>
                <Switch
                  id="enable-custom-llm"
                  checked={enableCustomLLM}
                  onCheckedChange={setEnableCustomLLM}
                  data-testid="switch-enable-custom-llm"
                />
              </div>

              {enableCustomLLM && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label htmlFor="llm-provider">Provider</Label>
                    <Select value={llmProvider} onValueChange={setLlmProvider}>
                      <SelectTrigger id="llm-provider" data-testid="select-llm-provider">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="anthropic">Anthropic</SelectItem>
                        <SelectItem value="google">Google AI</SelectItem>
                        <SelectItem value="custom">Custom Endpoint</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="api-key">API Key</Label>
                    <Input
                      id="api-key"
                      type="password"
                      placeholder={(llmConfig as any)?.config?.apiKeyMasked || "sk-..."}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      data-testid="input-api-key"
                    />
                    <p className="text-xs text-muted-foreground">
                      Your API key is encrypted and stored securely
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="model-name">Model Name (Optional)</Label>
                    <Input
                      id="model-name"
                      placeholder="gpt-4o, claude-3-opus, gemini-pro..."
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      data-testid="input-model-name"
                    />
                  </div>

                  {llmProvider === 'custom' && (
                    <div className="space-y-2">
                      <Label htmlFor="custom-endpoint">Custom Endpoint</Label>
                      <Input
                        id="custom-endpoint"
                        placeholder="https://api.example.com/v1"
                        value={customEndpoint}
                        onChange={(e) => setCustomEndpoint(e.target.value)}
                        data-testid="input-custom-endpoint"
                      />
                    </div>
                  )}

                  <Button
                    onClick={handleSaveLLMConfig}
                    disabled={saveLLMConfigMutation.isPending}
                    data-testid="button-save-llm-config"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    Save LLM Configuration
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>
                Irreversible actions that affect your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Delete Account</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Permanently delete your account and all associated data. This action cannot be undone.
                  </p>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteAccount}
                    disabled={deleteAccountMutation.isPending}
                    data-testid="button-delete-account"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Account
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
