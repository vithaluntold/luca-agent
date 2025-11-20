import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  Server,
  Shield,
  TrendingUp,
  XCircle,
  Cpu,
  HardDrive,
  Zap,
  Globe,
  RefreshCw,
  Bell,
  Calendar,
  GitBranch,
  Eye
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function SystemMonitoring() {
  const { toast } = useToast();
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
  const [deploymentDialogOpen, setDeploymentDialogOpen] = useState(false);

  // Fetch system metrics
  const { data: systemData, isLoading: systemLoading, refetch: refetchSystem } = useQuery({
    queryKey: ["/api/admin/system/health"],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Fetch threats
  const { data: threatsData, isLoading: threatsLoading } = useQuery({
    queryKey: ["/api/admin/system/threats"],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Fetch routes health
  const { data: routesData, isLoading: routesLoading } = useQuery({
    queryKey: ["/api/admin/system/routes"],
    refetchInterval: 15000,
  });

  // Fetch integrations health
  const { data: integrationsData, isLoading: integrationsLoading } = useQuery({
    queryKey: ["/api/admin/system/integrations"],
    refetchInterval: 30000,
  });

  // Fetch alerts
  const { data: alertsData, isLoading: alertsLoading } = useQuery({
    queryKey: ["/api/admin/system/alerts"],
    refetchInterval: 5000,
  });

  // Fetch maintenance schedules
  const { data: maintenanceData, refetch: refetchMaintenance } = useQuery({
    queryKey: ["/api/admin/system/maintenance"],
    refetchInterval: 30000,
  });

  // Fetch deployment history
  const { data: deploymentsData, refetch: refetchDeployments } = useQuery({
    queryKey: ["/api/admin/system/deployments"],
    refetchInterval: 30000,
  });

  // Fetch performance metrics
  const { data: perfData, isLoading: perfLoading } = useQuery({
    queryKey: ["/api/admin/system/performance"],
    refetchInterval: 10000,
  });

  const metrics = (systemData as any)?.metrics;
  const threats = (threatsData as any)?.threats || [];
  const threatStats = (threatsData as any)?.stats;
  const routes = (routesData as any)?.routes || [];
  const integrations = (integrationsData as any)?.integrations || [];
  const alerts = (alertsData as any)?.alerts || [];
  const alertStats = (alertsData as any)?.stats;
  const maintenances = (maintenanceData as any)?.maintenances || [];
  const deployments = (deploymentsData as any)?.deployments || [];
  const performance = (perfData as any)?.performance;

  const getHealthColor = (status: string) => {
    switch (status) {
      case "healthy":
      case "connected":
        return "text-green-500";
      case "degraded":
        return "text-yellow-500";
      case "unhealthy":
      case "error":
      case "disconnected":
        return "text-red-500";
      default:
        return "text-gray-500";
    }
  };

  const getHealthIcon = (status: string) => {
    switch (status) {
      case "healthy":
      case "connected":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "degraded":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "unhealthy":
      case "error":
      case "disconnected":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    const colors = {
      low: "bg-blue-500/10 text-blue-500",
      medium: "bg-yellow-500/10 text-yellow-500",
      high: "bg-orange-500/10 text-orange-500",
      critical: "bg-red-500/10 text-red-500",
    };
    return (
      <Badge className={colors[severity as keyof typeof colors] || "bg-gray-500/10"}>
        {severity}
      </Badge>
    );
  };

  const scheduleMaintenanceWindow = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    try {
      const response = await fetch("/api/admin/system/maintenance/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime: formData.get("startTime"),
          endTime: formData.get("endTime"),
          reason: formData.get("reason"),
          affectedServices: (formData.get("affectedServices") as string).split(",").map(s => s.trim()),
        }),
      });

      if (response.ok) {
        toast({ title: "Maintenance scheduled successfully" });
        setMaintenanceDialogOpen(false);
        refetchMaintenance();
      }
    } catch (error) {
      toast({ title: "Failed to schedule maintenance", variant: "destructive" });
    }
  };

  const startDeployment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    try {
      const response = await fetch("/api/admin/system/deployments/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: formData.get("version"),
          changes: (formData.get("changes") as string).split("\n").filter(c => c.trim()),
        }),
      });

      if (response.ok) {
        toast({ title: "Deployment started" });
        setDeploymentDialogOpen(false);
        refetchDeployments();
      }
    } catch (error) {
      toast({ title: "Failed to start deployment", variant: "destructive" });
    }
  };

  if (systemLoading) {
    return (
      <div className="p-8">
        <div className="mb-8">
          <Skeleton className="h-10 w-96 mb-2" />
          <Skeleton className="h-5 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1920px] mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent mb-2">
            System Monitoring
          </h1>
          <p className="text-muted-foreground">
            Real-time health monitoring and incident management
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetchSystem()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={maintenanceDialogOpen} onOpenChange={setMaintenanceDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Calendar className="h-4 w-4 mr-2" />
                Schedule Maintenance
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Schedule Maintenance Window</DialogTitle>
                <DialogDescription>
                  Plan system maintenance with zero downtime
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={scheduleMaintenanceWindow} className="space-y-4">
                <div>
                  <Label htmlFor="startTime">Start Time</Label>
                  <Input id="startTime" name="startTime" type="datetime-local" required />
                </div>
                <div>
                  <Label htmlFor="endTime">End Time</Label>
                  <Input id="endTime" name="endTime" type="datetime-local" required />
                </div>
                <div>
                  <Label htmlFor="reason">Reason</Label>
                  <Input id="reason" name="reason" placeholder="Database optimization" required />
                </div>
                <div>
                  <Label htmlFor="affectedServices">Affected Services (comma-separated)</Label>
                  <Input id="affectedServices" name="affectedServices" placeholder="database, cache" required />
                </div>
                <Button type="submit" className="w-full">Schedule Maintenance</Button>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog open={deploymentDialogOpen} onOpenChange={setDeploymentDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <GitBranch className="h-4 w-4 mr-2" />
                Deploy Update
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Deploy New Version</DialogTitle>
                <DialogDescription>
                  Deploy with automatic health checks and rollback capability
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={startDeployment} className="space-y-4">
                <div>
                  <Label htmlFor="version">Version</Label>
                  <Input id="version" name="version" placeholder="v1.2.3" required />
                </div>
                <div>
                  <Label htmlFor="changes">Changes (one per line)</Label>
                  <Textarea id="changes" name="changes" rows={5} placeholder="- Added new feature&#10;- Fixed bug" required />
                </div>
                <Button type="submit" className="w-full">Start Deployment</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Overall Health Score */}
      <Card className="mb-6 border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">System Health Score</CardTitle>
              <CardDescription>Overall system status based on all components</CardDescription>
            </div>
            <div className="text-right">
              <div className={`text-5xl font-bold ${getHealthColor(metrics?.health.overall || 'unknown')}`}>
                {metrics?.health.score || 0}/100
              </div>
              <Badge className={`mt-2 ${metrics?.health.overall === 'healthy' ? 'bg-green-500' : metrics?.health.overall === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'}`}>
                {metrics?.health.overall || 'Unknown'}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={metrics?.health.score || 0} className="h-4" />
        </CardContent>
      </Card>

      {/* System Resources */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.cpu.percentage || 0}%</div>
            <Progress value={metrics?.cpu.percentage || 0} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {metrics?.cpu.cores || 0} cores · Load: {metrics?.cpu.loadAverage?.[0]?.toFixed(2) || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.memory.percentage || 0}%</div>
            <Progress value={metrics?.memory.percentage || 0} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {metrics?.memory.used || 0} MB / {metrics?.memory.total || 0} MB
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uptime</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.floor((metrics?.uptime || 0) / 3600)}h
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {Math.floor(((metrics?.uptime || 0) % 3600) / 60)} minutes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{alertStats?.active || 0}</div>
            <p className="text-xs text-muted-foreground mt-2">
              {alertStats?.total || 0} total alerts
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Component Health Status */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Component Health</CardTitle>
          <CardDescription>Status of critical system components</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {metrics?.health.components && Object.entries(metrics.health.components).map(([name, component]: [string, any]) => (
              <Card key={name} className="border-2">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium capitalize">{name.replace(/([A-Z])/g, ' $1').trim()}</div>
                    {getHealthIcon(component.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <Badge className={getHealthColor(component.status) + " bg-opacity-10"}>
                    {component.status}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-2">{component.message}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Security Threats */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Security Threats (Last 24h)</CardTitle>
              <CardDescription>Detected attacks and suspicious activity</CardDescription>
            </div>
            <Shield className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <div className="text-2xl font-bold">{threatStats?.total || 0}</div>
              <p className="text-xs text-muted-foreground">Total Threats</p>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-500">{threatStats?.blocked || 0}</div>
              <p className="text-xs text-muted-foreground">Blocked</p>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-500">
                {(threatStats?.bySeverity?.high || 0) + (threatStats?.bySeverity?.critical || 0)}
              </div>
              <p className="text-xs text-muted-foreground">High/Critical</p>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {threatStats?.byType?.brute_force || 0}
              </div>
              <p className="text-xs text-muted-foreground">Brute Force</p>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {threats.slice(0, 10).map((threat: any) => (
                <TableRow key={threat.id}>
                  <TableCell className="font-medium">{threat.type.replace(/_/g, ' ')}</TableCell>
                  <TableCell>{getSeverityBadge(threat.severity)}</TableCell>
                  <TableCell className="font-mono text-sm">{threat.ipAddress}</TableCell>
                  <TableCell className="max-w-md truncate">{threat.description}</TableCell>
                  <TableCell>{format(new Date(threat.timestamp), 'HH:mm:ss')}</TableCell>
                  <TableCell>
                    {threat.blocked ? (
                      <Badge className="bg-red-500">Blocked</Badge>
                    ) : (
                      <Badge variant="outline">Detected</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* API Routes Health */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>API Routes Health</CardTitle>
              <CardDescription>Performance and error rates for top endpoints</CardDescription>
            </div>
            <Globe className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Route</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Avg Response</TableHead>
                <TableHead>Requests</TableHead>
                <TableHead>Error Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {routes.map((route: any) => (
                <TableRow key={`${route.method}:${route.path}`}>
                  <TableCell className="font-mono text-sm">{route.path}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{route.method}</Badge>
                  </TableCell>
                  <TableCell>{getHealthIcon(route.status)}</TableCell>
                  <TableCell>{route.avgResponseTime}ms</TableCell>
                  <TableCell>{route.requestCount.toLocaleString()}</TableCell>
                  <TableCell>
                    <span className={route.errorRate > 0.1 ? 'text-red-500' : 'text-green-500'}>
                      {(route.errorRate * 100).toFixed(2)}%
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Integrations Health */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>External Integrations</CardTitle>
          <CardDescription>Status of third-party services</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {integrations.map((integration: any) => (
              <Card key={integration.name} className="border-2">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{integration.name}</div>
                    {getHealthIcon(integration.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <Badge className={getHealthColor(integration.status) + " bg-opacity-10 mb-2"}>
                    {integration.status}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    Type: {integration.type.replace(/_/g, ' ')}
                  </p>
                  {integration.latency && (
                    <p className="text-xs text-muted-foreground">
                      Latency: {integration.latency}ms
                    </p>
                  )}
                  {integration.errorMessage && (
                    <p className="text-xs text-red-500 mt-1">{integration.errorMessage}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <Card className="mb-6 border-red-500 border-2">
          <CardHeader>
            <CardTitle className="text-red-500">Active Alerts</CardTitle>
            <CardDescription>Issues requiring immediate attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {alerts.map((alert: any) => (
                <Card key={alert.id} className="border-2">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getSeverityBadge(alert.severity)}
                        <Badge variant="outline">{alert.type}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(alert.timestamp), 'MMM dd, HH:mm')}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="font-medium">{alert.message}</p>
                    {alert.metadata && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {JSON.stringify(alert.metadata)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Performance Metrics */}
      {performance && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Performance Metrics</CardTitle>
            <CardDescription>Request performance over the last hour</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Avg Response</div>
                <div className="text-2xl font-bold">{performance.avg}ms</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">P95</div>
                <div className="text-2xl font-bold">{performance.p95}ms</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">P99</div>
                <div className="text-2xl font-bold">{performance.p99}ms</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Requests</div>
                <div className="text-2xl font-bold">{performance.count.toLocaleString()}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Maintenance Schedule */}
      {maintenances.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Scheduled Maintenance</CardTitle>
            <CardDescription>Upcoming maintenance windows</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {maintenances.map((maintenance: any) => (
                <Card key={maintenance.id} className="border-2">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <Badge className={maintenance.status === 'active' ? 'bg-yellow-500' : 'bg-blue-500'}>
                          {maintenance.status}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(maintenance.startTime), 'MMM dd, HH:mm')} - {format(new Date(maintenance.endTime), 'HH:mm')}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="font-medium">{maintenance.reason}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Affected: {maintenance.affectedServices.join(', ')}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deployment History */}
      {deployments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Deployments</CardTitle>
            <CardDescription>Deployment history and status</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Health Checks</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Deployed By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deployments.map((deployment: any) => (
                  <TableRow key={deployment.id}>
                    <TableCell className="font-mono">{deployment.version}</TableCell>
                    <TableCell>
                      <Badge className={
                        deployment.status === 'completed' ? 'bg-green-500' :
                        deployment.status === 'failed' ? 'bg-red-500' :
                        deployment.status === 'rolled-back' ? 'bg-orange-500' :
                        'bg-blue-500'
                      }>
                        {deployment.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {deployment.healthChecksPassed ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </TableCell>
                    <TableCell>{format(new Date(deployment.startTime), 'MMM dd, HH:mm')}</TableCell>
                    <TableCell>
                      {deployment.endTime ? 
                        `${Math.round((new Date(deployment.endTime).getTime() - new Date(deployment.startTime).getTime()) / 1000)}s` :
                        'In progress'
                      }
                    </TableCell>
                    <TableCell>{deployment.deployedBy}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
