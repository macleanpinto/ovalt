'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ProtectedRoute, useAuth } from '@/lib/auth-context';
import { apiClient, getApiBaseUrl, Run } from '@/lib/api-client';

interface DetectedTag {
  id: string;
  name: string;
  type: string;
  category: string;
  status: 'ready' | 'mapping' | 'needs_review';
  triggerSummary: string;
  parameters?: Record<string, string>;
  firingTriggerIds?: string[];
}

interface ContainerElement {
  id: string;
  name: string;
  type: string;
  elementType: 'tag' | 'trigger' | 'variable';
  details: any;
  status?: 'ready' | 'mapping' | 'needs_review';
}

interface MappingRecord {
  clientTagId: string;
  clientTagName: string;
  clientTagType: string;
  category: string;
  serverRecommendation: string;
  confidence: number;
  provisional: boolean;
  manualActions: string[];
  evidence?: {
    type: 'docs' | 'agent_web';
    ref: string;
    sources?: Array<{ title: string; url: string }>;
    searchQuery?: string;
  };
}

interface MigrationReport {
  runId: string;
  confidenceScore: number;
  summaryCounts: {
    mappings: number;
    warnings: number;
    manualActions: number;
    highRisk: number;
  };
  detectedTags: DetectedTag[];
  mappings: MappingRecord[];
  executiveSummary: string;
  containerSummary?: {
    totalTags: number;
    totalTriggers: number;
    totalVariables: number;
  };
  containerElements?: {
    triggers: Array<any>;
    variables: Array<any>;
  };
}

export default function MigrationWorkspace() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { organization } = useAuth();
  const runId = params.runId as string;

  const [run, setRun] = useState<Run | null>(null);
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<ContainerElement | null>(null);
  const [selectedMapping, setSelectedMapping] = useState<MappingRecord | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [filterText, setFilterText] = useState('');
  const [showGuide, setShowGuide] = useState(true);
  const [elementTypeFilter, setElementTypeFilter] = useState<'all' | 'tag' | 'trigger' | 'variable'>('tag');
  const [deploymentFilter, setDeploymentFilter] = useState<'active' | 'deployed'>('active');
  const [isEditing, setIsEditing] = useState(false);
  const [editedRecommendation, setEditedRecommendation] = useState('');
  const [skippedTags, setSkippedTags] = useState<Set<string>>(new Set());
  const [showSkipped, setShowSkipped] = useState(false);
  const [approvedTags, setApprovedTags] = useState<Set<string>>(new Set());
  const [deployedTags, setDeployedTags] = useState<Set<string>>(new Set());

  // Structured editing fields
  const [editServerTagName, setEditServerTagName] = useState('');
  const [editConfigSteps, setEditConfigSteps] = useState<string[]>([]);
  const [editValidationNotes, setEditValidationNotes] = useState<string[]>([]);

  // Deployment state
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentResult, setDeploymentResult] = useState<any>(null);
  const [serverContainerPath, setServerContainerPath] = useState('');
  const [serverContainers, setServerContainers] = useState<any[]>([]);
  const [loadingContainers, setLoadingContainers] = useState(false);
  const [containerMode, setContainerMode] = useState<'existing' | 'create' | null>(null);
  const [gtmAccounts, setGtmAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [newContainerName, setNewContainerName] = useState('');
  const [isCreatingContainer, setIsCreatingContainer] = useState(false);
  const [needsGtmReconnect, setNeedsGtmReconnect] = useState(false);

  // Helper to get GTM session
  const getGtmSession = () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('gtm_session');
  };

  // Helper to process deployment results and update deployed tags
  const processDeploymentResult = (result: any) => {
    setDeploymentResult(result);

    // Mark successfully deployed tags
    if (result.deployedTags && Array.isArray(result.deployedTags)) {
      const successfullyDeployed = result.deployedTags
        .filter((tag: any) => tag.status === 'deployed')
        .map((tag: any) => tag.clientTagId);

      if (successfullyDeployed.length > 0) {
        setDeployedTags(prev => {
          const next = new Set(prev);
          successfullyDeployed.forEach((id: string) => next.add(id));
          return next;
        });

        // Remove from approved tags (they're now deployed)
        setApprovedTags(prev => {
          const next = new Set(prev);
          successfullyDeployed.forEach((id: string) => next.delete(id));
          return next;
        });

        addLog(`✅ Moved ${successfullyDeployed.length} tag(s) to deployed list`);
      }
    }
  };

  console.log('Render state:', { isEditing, selectedElement: selectedElement?.name });

  // Handle GTM session from OAuth callback
  useEffect(() => {
    const gtmSession = searchParams.get('gtmSession');
    if (gtmSession) {
      localStorage.setItem('gtm_session', gtmSession);
      setNeedsGtmReconnect(false);
      // Remove the query parameter from the URL
      const url = new URL(window.location.href);
      url.searchParams.delete('gtmSession');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams]);

  useEffect(() => {
    const loadRunData = async () => {
      if (!runId) return;

      try {
        setIsLoading(true);
        const runData = await apiClient.getRun(runId);
        setRun(runData);

        addLog(`Connected to migration ${runId.slice(0, 8)}...`);
        addLog(`Status: ${runData.status.toUpperCase()}`);

        // Try to load report if available
        if (runData.status === 'completed' || runData.status === 'needs_review') {
          try {
            const reportData = await apiClient.getRunReport(runId);
            setReport(reportData);
            addLog(`Migration report loaded: ${reportData.detectedTags?.length || 0} tags detected`);

            // Select first tag by default
            if (reportData.detectedTags && reportData.detectedTags.length > 0) {
              const firstTag = reportData.detectedTags[0];
              setSelectedElement({
                id: firstTag.id,
                name: firstTag.name,
                type: firstTag.type,
                elementType: 'tag',
                details: firstTag,
                status: firstTag.status
              });

              // Find corresponding mapping
              const mapping = reportData.mappings?.find((m: MappingRecord) => m.clientTagId === firstTag.id);
              if (mapping) {
                setSelectedMapping(mapping);
              }
            }
          } catch (err: any) {
            addLog('Report not available yet');
          }
        } else {
          addLog(`Migration is ${runData.status}. Report will be available when completed.`);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load migration');
        addLog(`ERROR: ${err.message || 'Failed to load migration'}`);
      } finally {
        setIsLoading(false);
      }
    };

    loadRunData();

    // Poll for updates if running or queued
    const interval = setInterval(() => {
      if (run && (run.status === 'queued' || run.status === 'running')) {
        loadRunData();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [runId]);

  // Reset edit mode when selected element changes
  useEffect(() => {
    setIsEditing(false);
  }, [selectedElement]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  // Parse recommendation into structured fields
  const parseRecommendation = (text: string) => {
    const lines = text.split('\n');
    const tagName = lines[0] || '';

    const configSteps: string[] = [];
    const validationNotes: string[] = [];

    let currentSection = '';
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('Configuration:')) {
        currentSection = 'config';
      } else if (line.startsWith('Validation Notes:')) {
        currentSection = 'validation';
      } else if (line.startsWith('•') || line.startsWith('-')) {
        const item = line.replace(/^[•\-]\s*/, '').trim();
        if (item) {
          if (currentSection === 'config') {
            configSteps.push(item);
          } else if (currentSection === 'validation') {
            validationNotes.push(item);
          }
        }
      } else if (line.startsWith('⚠') || line.startsWith('✓') || line.startsWith('ℹ')) {
        if (currentSection === 'validation') {
          validationNotes.push(line);
        }
      }
    }

    return { tagName, configSteps, validationNotes };
  };

  // Rebuild recommendation from structured fields
  const buildRecommendation = (tagName: string, configSteps: string[], validationNotes: string[]) => {
    let text = tagName;

    if (configSteps.length > 0) {
      text += '\n\nConfiguration:';
      configSteps.forEach(step => {
        text += `\n• ${step}`;
      });
    }

    if (validationNotes.length > 0) {
      text += '\n\nValidation Notes:';
      validationNotes.forEach(note => {
        text += `\n${note}`;
      });
    }

    return text;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready':
        return 'bg-secondary/10 text-secondary border-secondary/20';
      case 'mapping':
        return 'bg-[#F63A22]/10 text-[#F63A22] border-[#F63A22]/20';
      case 'needs_review':
        return 'bg-[#ffb4a7]/10 text-[#ffb4a7] border-[#ffb4a7]/20';
      default:
        return 'bg-surface-container text-on-surface border-outline-variant';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ready':
        return 'READY';
      case 'mapping':
        return 'MAPPING';
      case 'needs_review':
        return 'REVIEW';
      default:
        return 'UNKNOWN';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready':
        return 'check_circle';
      case 'mapping':
        return 'error';
      case 'needs_review':
        return 'warning';
      default:
        return 'help';
    }
  };

  const getMigrationStatusBadge = () => {
    if (!run) return null;

    switch (run.status) {
      case 'completed':
        return (
          <span className="bg-secondary/10 text-secondary px-3 py-0.5 rounded-full text-[10px] font-label font-bold uppercase tracking-widest border border-secondary/20 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
            Completed
          </span>
        );
      case 'running':
        return (
          <span className="bg-[#F63A22]/10 text-[#F63A22] px-3 py-0.5 rounded-full text-[10px] font-label font-bold uppercase tracking-widest border border-[#F63A22]/20 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#F63A22] animate-pulse"></span>
            In Progress
          </span>
        );
      case 'queued':
        return (
          <span className="bg-[#ffb4a7]/10 text-[#ffb4a7] px-3 py-0.5 rounded-full text-[10px] font-label font-bold uppercase tracking-widest border border-[#ffb4a7]/20 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ffb4a7] animate-pulse"></span>
            Queued
          </span>
        );
      case 'failed':
        return (
          <span className="bg-error/10 text-error px-3 py-0.5 rounded-full text-[10px] font-label font-bold uppercase tracking-widest border border-error/20 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
            Failed
          </span>
        );
      default:
        return null;
    }
  };

  const getIconForTagType = (type: string): string => {
    const normalizedType = type.toLowerCase();
    if (normalizedType.includes('analytics') || normalizedType.includes('ga')) return 'analytics';
    if (normalizedType.includes('pixel') || normalizedType.includes('fb') || normalizedType.includes('meta')) return 'ads_click';
    if (normalizedType.includes('variable')) return 'data_object';
    if (normalizedType.includes('trigger')) return 'bolt';
    if (normalizedType.includes('html') || normalizedType.includes('script')) return 'code';
    return 'sell'; // default tag icon
  };

  // Build combined list of all container elements
  const allElements: ContainerElement[] = [
    // Tags
    ...(report?.detectedTags || []).map(tag => ({
      id: tag.id,
      name: tag.name,
      type: tag.type,
      elementType: 'tag' as const,
      details: tag,
      status: tag.status
    })),
    // Triggers
    ...(report?.containerElements?.triggers || []).map((trigger: any) => ({
      id: trigger.triggerId || trigger.name,
      name: trigger.name || 'Unnamed Trigger',
      type: trigger.type || 'Unknown',
      elementType: 'trigger' as const,
      details: trigger
    })),
    // Variables
    ...(report?.containerElements?.variables || []).map((variable: any) => ({
      id: variable.variableId || variable.name,
      name: variable.name || 'Unnamed Variable',
      type: variable.type || 'Unknown',
      elementType: 'variable' as const,
      details: variable
    }))
  ];

  const filteredElements = allElements.filter(element => {
    // Filter by deployment status
    if (deploymentFilter === 'active' && deployedTags.has(element.id)) {
      return false; // Hide deployed tags in active view
    }
    if (deploymentFilter === 'deployed' && !deployedTags.has(element.id)) {
      return false; // Hide non-deployed tags in deployed view
    }
    // Filter out skipped tags unless showSkipped is true
    if (!showSkipped && skippedTags.has(element.id)) {
      return false;
    }
    // Filter by type
    if (elementTypeFilter !== 'all' && element.elementType !== elementTypeFilter) {
      return false;
    }
    // Filter by search text
    if (filterText) {
      return element.name.toLowerCase().includes(filterText.toLowerCase()) ||
             element.type.toLowerCase().includes(filterText.toLowerCase());
    }
    return true;
  });

  const completedCount = (report?.detectedTags || []).filter(tag => tag.status === 'ready').length;
  const totalCount = report?.detectedTags?.length || 0;
  /** Footer bar + confidence: resolved = deployed to server or explicitly skipped */
  const deploymentResolvedCount = deployedTags.size + skippedTags.size;
  const deploymentProgressPercent =
    totalCount > 0 ? (deploymentResolvedCount / totalCount) * 100 : 0;
  const deploymentConfidenceScore =
    totalCount > 0
      ? Number(((deploymentResolvedCount / totalCount) * 10).toFixed(1))
      : 0;

  if (isLoading) {
    return (
      <ProtectedRoute>
        <main className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-on-surface-variant">Loading migration workspace...</p>
          </div>
        </main>
      </ProtectedRoute>
    );
  }

  if (error || !run) {
    return (
      <ProtectedRoute>
        <main className="min-h-screen p-8 bg-background">
          <div className="max-w-7xl mx-auto">
            <div className="p-6 bg-error-container/20 border border-error/20 rounded-xl">
              <h2 className="text-lg font-semibold text-error mb-2 headline-font">
                Failed to load migration
              </h2>
              <p className="text-error mb-4">{error || 'Migration not found'}</p>
              <Link
                href="/migrations"
                className="px-6 py-3 bg-primary text-on-primary rounded-xl font-semibold hover:brightness-110 transition-all inline-block"
              >
                Back to Migrations
              </Link>
            </div>
          </div>
        </main>
      </ProtectedRoute>
    );
  }

  // Show processing state if migration is not yet complete
  if (run.status === 'queued' || run.status === 'running') {
    return (
      <ProtectedRoute>
        <main className="min-h-screen bg-background flex items-center justify-center p-8">
          <div className="max-w-2xl mx-auto text-center space-y-6">
            <div className="bg-surface-container rounded-xl p-12 border border-outline-variant/10">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-6"></div>
              <h2 className="text-2xl font-bold text-white mb-2 headline-font">
                {run.status === 'queued' ? 'Migration Queued' : 'Processing Migration'}
              </h2>
              <p className="text-on-surface-variant mb-6">
                {run.status === 'queued'
                  ? 'Your migration is in the queue and will begin processing shortly.'
                  : 'Analyzing your GTM container and generating server-side configuration...'}
              </p>
              <div className="bg-surface-container-low rounded-lg p-4 text-left space-y-2">
                <p className="text-xs font-label text-on-surface-variant uppercase tracking-widest">Live Status</p>
                {logs.slice(-5).map((log, index) => (
                  <p key={index} className="text-xs font-mono text-on-surface-variant">
                    {log}
                  </p>
                ))}
              </div>
              <div className="mt-6">
                <Link
                  href="/migrations"
                  className="px-6 py-3 border border-outline-variant/30 text-white rounded-xl hover:bg-white/5 transition-colors inline-block"
                >
                  Back to Migrations
                </Link>
              </div>
            </div>
          </div>
        </main>
      </ProtectedRoute>
    );
  }

  // Show error if migration failed
  if (run.status === 'failed') {
    return (
      <ProtectedRoute>
        <main className="min-h-screen bg-background p-8">
          <div className="max-w-4xl mx-auto">
            <div className="bg-error-container/20 border border-error/20 rounded-xl p-8">
              <div className="flex items-start gap-4">
                <span className="material-symbols-outlined text-4xl text-error">error</span>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-error mb-2 headline-font">
                    Migration Failed
                  </h2>
                  <p className="text-error mb-4">
                    The migration process encountered an error and could not complete.
                  </p>
                  <div className="bg-surface-container-lowest rounded-lg p-4 mb-6">
                    <p className="text-xs font-label text-on-surface-variant uppercase tracking-widest mb-2">Error Logs</p>
                    <div className="space-y-1">
                      {logs.map((log, index) => (
                        <p key={index} className="text-xs font-mono text-on-surface-variant">
                          {log}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Link
                      href="/migrations"
                      className="px-6 py-3 bg-primary text-on-primary rounded-xl font-semibold hover:brightness-110 transition-all"
                    >
                      Back to Migrations
                    </Link>
                    <button
                      onClick={() => window.location.reload()}
                      className="px-6 py-3 border border-outline-variant/30 text-white rounded-xl hover:bg-white/5 transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </ProtectedRoute>
    );
  }

  // Main workspace view (only shown when completed or needs_review)
  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-background pb-24">
        {/* Header */}
        <header className="border-b border-outline-variant/10 bg-surface-container/50 backdrop-blur-xl">
          <div className="max-w-[1920px] mx-auto px-8 py-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-extrabold tracking-tighter font-headline text-white">
                    Migration Hub
                  </h1>
                  {getMigrationStatusBadge()}
                </div>
                <div className="flex items-center gap-2 text-on-surface-variant font-label text-sm">
                  <span className="material-symbols-outlined text-sm">settings_input_component</span>
                  <span>Run ID:</span>
                  <code className="text-primary font-medium font-mono text-xs">{runId.slice(0, 12)}</code>
                  <span className="mx-1 opacity-20">|</span>
                  <span className="material-symbols-outlined text-sm">history</span>
                  <span>Created {new Date(run.createdAt).toLocaleString()}</span>
                </div>
              </div>
              <div className="flex gap-3">
                <button className="bg-surface-container-highest px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-surface-bright transition-colors text-white">
                  <span className="material-symbols-outlined text-lg">download</span>
                  Export Blueprint
                </button>
                <Link
                  href="/migrations"
                  className="bg-surface-container-highest px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-surface-bright transition-colors text-white"
                >
                  <span className="material-symbols-outlined text-lg">arrow_back</span>
                  Back
                </Link>
              </div>
            </div>
          </div>
        </header>

        {/* Main Workspace */}
        <div className="max-w-[1920px] mx-auto px-8 py-6">
          {!report ? (
            <div className="text-center py-12">
              <p className="text-on-surface-variant">No report data available yet.</p>
            </div>
          ) : (
            <>
              {/* Quick Guide Banner */}
              {showGuide && (
                <div className="bg-gradient-to-r from-primary/5 to-secondary/5 border border-primary/10 rounded-xl p-4 mb-6">
                  <div className="flex items-start gap-4">
                    <div className="bg-primary/20 p-2 rounded-lg">
                      <span className="material-symbols-outlined text-primary text-2xl">lightbulb</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-bold text-white mb-1">How Migration Review Works</h3>
                      <p className="text-xs text-on-surface-variant leading-relaxed mb-2">
                        We&apos;ve analyzed your GTM container and created server-side recommendations for each tag using production rules and AI-enhanced web research.
                      </p>
                      <div className="flex gap-3 mb-3 text-[10px]">
                        <div className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs text-secondary">book</span>
                          <span className="text-on-surface-variant">Rule-based from official docs</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs text-[#ce93d8]">psychology</span>
                          <span className="text-on-surface-variant">AI-enhanced when needed</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="flex items-start gap-2">
                          <div className="bg-secondary/20 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px] font-bold text-secondary">1</span>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-white">Review Tags</p>
                            <p className="text-[9px] text-on-surface-variant">Click each tag on the left to see its server-side mapping</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="bg-secondary/20 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px] font-bold text-secondary">2</span>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-white">Take Action</p>
                            <p className="text-[9px] text-on-surface-variant">Approve ready tags, review medium-confidence ones, configure manual ones</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="bg-secondary/20 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px] font-bold text-secondary">3</span>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-white">Deploy</p>
                            <p className="text-[9px] text-on-surface-variant">Export the blueprint and follow the deployment guide</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowGuide(false)}
                      className="text-on-surface-variant hover:text-white transition-colors"
                    >
                      <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Container Overview */}
              <div className="bg-surface-container-high border border-outline-variant/10 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="bg-primary/20 p-2 rounded">
                    <span className="material-symbols-outlined text-primary text-lg">inventory_2</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-white mb-2">Container Elements Overview</h3>
                    <p className="text-[10px] text-on-surface-variant mb-3">
                      Your GTM container has {report.containerSummary?.totalTags || totalCount} tags, {report.containerSummary?.totalTriggers || 0} triggers,
                      and {report.containerSummary?.totalVariables || 0} variables. Here&apos;s how each type is handled in the migration:
                    </p>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-surface-container p-3 rounded-lg border-l-2 border-primary">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="material-symbols-outlined text-sm text-primary">sell</span>
                          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Tags</p>
                        </div>
                        <p className="text-2xl font-bold text-white mb-1">{totalCount}</p>
                        <p className="text-[9px] text-secondary font-bold mb-1">✓ MIGRATING</p>
                        <p className="text-[9px] text-on-surface-variant leading-snug">
                          Each tag is analyzed and mapped to server-side equivalents
                        </p>
                      </div>
                      <div className="bg-surface-container p-3 rounded-lg border-l-2 border-outline-variant">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="material-symbols-outlined text-sm text-on-surface-variant">bolt</span>
                          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Triggers</p>
                        </div>
                        <p className="text-2xl font-bold text-on-surface-variant mb-1">{report.containerSummary?.totalTriggers || 0}</p>
                        <p className="text-[9px] text-[#F63A22] font-bold mb-1">ℹ️ REFERENCE</p>
                        <p className="text-[9px] text-on-surface-variant leading-snug">
                          Shown in tag mappings to understand when tags fire
                        </p>
                      </div>
                      <div className="bg-surface-container p-3 rounded-lg border-l-2 border-outline-variant">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="material-symbols-outlined text-sm text-on-surface-variant">data_object</span>
                          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Variables</p>
                        </div>
                        <p className="text-2xl font-bold text-on-surface-variant mb-1">{report.containerSummary?.totalVariables || 0}</p>
                        <p className="text-[9px] text-[#F63A22] font-bold mb-1">⚙️ MANUAL</p>
                        <p className="text-[9px] text-on-surface-variant leading-snug">
                          Need to be recreated or mapped in server container
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Migration Progress Summary */}
              <div className="bg-surface-container-high border border-outline-variant/10 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="bg-secondary/20 p-2 rounded">
                    <span className="material-symbols-outlined text-secondary text-lg">task_alt</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-white mb-2">Migration Review Progress</h3>
                    <p className="text-[10px] text-on-surface-variant mb-3">
                      Track your review progress. Approve tags you&apos;ve reviewed and skip ones you&apos;re unsure about for later.
                    </p>
                    <div className="grid grid-cols-4 gap-3">
                      <div className="bg-surface-container p-3 rounded-lg border-l-2 border-secondary">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="material-symbols-outlined text-sm text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Approved</p>
                        </div>
                        <p className="text-2xl font-bold text-secondary">{approvedTags.size}</p>
                        <p className="text-[9px] text-on-surface-variant mt-1">
                          Ready for deployment
                        </p>
                      </div>
                      <div className="bg-surface-container p-3 rounded-lg border-l-2 border-[#F63A22]">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="material-symbols-outlined text-sm text-[#F63A22]">pending</span>
                          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Pending</p>
                        </div>
                        <p className="text-2xl font-bold text-white">{totalCount - approvedTags.size - skippedTags.size}</p>
                        <p className="text-[9px] text-on-surface-variant mt-1">
                          Needs review
                        </p>
                      </div>
                      <div className="bg-surface-container p-3 rounded-lg border-l-2 border-surface-variant">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="material-symbols-outlined text-sm text-on-surface-variant">visibility_off</span>
                          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Skipped</p>
                        </div>
                        <p className="text-2xl font-bold text-on-surface-variant">{skippedTags.size}</p>
                        <p className="text-[9px] text-on-surface-variant mt-1">
                          For later migration
                        </p>
                      </div>
                      <div className="bg-surface-container p-3 rounded-lg border-l-2 border-primary">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="material-symbols-outlined text-sm text-primary">sell</span>
                          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Total</p>
                        </div>
                        <p className="text-2xl font-bold text-white">{totalCount}</p>
                        <p className="text-[9px] text-on-surface-variant mt-1">
                          Tags in container
                        </p>
                      </div>
                    </div>

                    {/* Bulk Actions */}
                    {(totalCount - approvedTags.size - skippedTags.size) > 0 && (
                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() => {
                            const allTagIds = allElements
                              .filter(el => el.elementType === 'tag' && !skippedTags.has(el.id))
                              .map(el => el.id);
                            setApprovedTags(new Set(allTagIds));
                            addLog(`✅ Approved all ${allTagIds.length} non-skipped tags`);
                          }}
                          className="flex-1 px-4 py-2 bg-secondary text-on-primary rounded-lg text-xs font-bold hover:brightness-110 transition-all flex items-center justify-center gap-2"
                        >
                          <span className="material-symbols-outlined text-sm">done_all</span>
                          Approve All ({totalCount - approvedTags.size - skippedTags.size})
                        </button>

                        {approvedTags.size > 0 && (
                          <button
                            onClick={() => {
                              setApprovedTags(new Set());
                              addLog(`🔄 Cleared all approvals`);
                            }}
                            className="px-4 py-2 bg-surface-container-highest text-on-surface-variant rounded-lg text-xs font-bold hover:bg-surface-bright transition-all flex items-center gap-2"
                          >
                            <span className="material-symbols-outlined text-sm">clear_all</span>
                            Clear All
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* GTM Reconnect Modal */}
              {needsGtmReconnect && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-surface-container-high rounded-xl border border-outline-variant max-w-md w-full p-6">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="bg-[#F63A22]/20 p-3 rounded-lg">
                        <span className="material-symbols-outlined text-[#F63A22] text-2xl">sync_problem</span>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-white mb-2">Reconnect to Google Tag Manager</h3>
                        <p className="text-sm text-on-surface-variant">
                          Your Google Tag Manager session has expired. Please reconnect to continue with deployment.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={async () => {
                          try {
                            const returnUrl = `/migrations/${runId}`;
                            const { url } = await apiClient.startGtmOAuth(returnUrl);
                            window.location.href = url;
                          } catch (error: any) {
                            alert(`Failed to start OAuth: ${error.message}`);
                          }
                        }}
                        className="flex-1 px-4 py-3 bg-primary text-on-primary rounded-lg font-bold hover:brightness-110 transition-all flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-lg">account_circle</span>
                        Reconnect GTM
                      </button>

                      <button
                        onClick={() => setNeedsGtmReconnect(false)}
                        className="px-4 py-3 bg-surface-container-highest text-white rounded-lg font-bold hover:bg-surface-bright transition-all"
                      >
                        Cancel
                      </button>
                    </div>

                    <p className="text-[10px] text-on-surface-variant mt-4 text-center">
                      You&apos;ll be redirected to Google to authorize access, then return here automatically.
                    </p>
                  </div>
                </div>
              )}

              {/* Automated Deployment */}
              {approvedTags.size > 0 && !deploymentResult && (
                <div className="bg-gradient-to-r from-secondary/10 to-primary/10 border border-secondary/20 rounded-xl p-6 mb-6">
                  <div className="flex items-start gap-4">
                    <div className="bg-secondary/20 p-3 rounded-lg">
                      <span className="material-symbols-outlined text-secondary text-2xl">rocket_launch</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-white mb-2">Ready to Deploy</h3>
                      <p className="text-sm text-on-surface-variant mb-4">
                        You&apos;ve approved {approvedTags.size} tag{approvedTags.size !== 1 ? 's' : ''}. Deploy them automatically to your server-side GTM container.
                      </p>

                      {!serverContainerPath ? (
                        <div className="space-y-4">
                          {/* Step 1: Choose mode */}
                          {!containerMode ? (
                            <div>
                              <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-3">
                                Server Container Setup
                              </label>
                              <div className="grid grid-cols-2 gap-3">
                                <button
                                  onClick={async () => {
                                    setContainerMode('create');
                                    // Load accounts
                                    try {
                                      const gtmSessionId = getGtmSession();
                                      if (gtmSessionId) {
                                        const accountsRes = await apiClient.getGtmAccounts(gtmSessionId);
                                        setGtmAccounts(accountsRes.accounts || []);
                                        addLog(`Loaded ${accountsRes.accounts?.length || 0} GTM account(s)`);
                                      }
                                    } catch (err) {
                                      console.error('Error loading accounts:', err);
                                    }
                                  }}
                                  className="p-4 bg-primary/10 border-2 border-primary/30 rounded-lg text-left hover:bg-primary/20 transition-all group"
                                >
                                  <span className="material-symbols-outlined text-primary text-2xl mb-2 block">add_circle</span>
                                  <div className="text-sm font-bold text-white mb-1">Create New</div>
                                  <div className="text-[10px] text-on-surface-variant">Create a new server container</div>
                                </button>

                                <button
                                  onClick={async () => {
                                    const gtmSessionId = getGtmSession();
                                    if (!gtmSessionId) {
                                      setNeedsGtmReconnect(true);
                                      return;
                                    }

                                    setContainerMode('existing');
                                    setLoadingContainers(true);
                                    try {
                                      const accountsRes = await apiClient.getGtmAccounts(gtmSessionId);
                                      const accounts = accountsRes.accounts || [];

                                      const allContainers: any[] = [];
                                      for (const account of accounts) {
                                        try {
                                          const containersRes = await apiClient.getGtmContainers(gtmSessionId, account.path);
                                          const containers = containersRes.containers || [];
                                          const serverOnly = containers.filter((c: any) =>
                                            c.usageContext?.includes('server')
                                          );
                                          allContainers.push(...serverOnly);
                                        } catch (err) {
                                          console.error('Error loading containers:', err);
                                        }
                                      }

                                      setServerContainers(allContainers);
                                      if (allContainers.length === 0) {
                                        alert('No server-side containers found. Please create one first.');
                                        setContainerMode(null);
                                      } else {
                                        addLog(`Found ${allContainers.length} server container(s)`);
                                      }
                                    } catch (error: any) {
                                      if (error.message?.includes('401') || error.message?.includes('session')) {
                                        setNeedsGtmReconnect(true);
                                        setContainerMode(null);
                                      } else {
                                        alert(`Failed to load containers: ${error.message}`);
                                        setContainerMode(null);
                                      }
                                    } finally {
                                      setLoadingContainers(false);
                                    }
                                  }}
                                  className="p-4 bg-secondary/10 border-2 border-secondary/30 rounded-lg text-left hover:bg-secondary/20 transition-all group"
                                >
                                  <span className="material-symbols-outlined text-secondary text-2xl mb-2 block">inventory_2</span>
                                  <div className="text-sm font-bold text-white mb-1">Use Existing</div>
                                  <div className="text-[10px] text-on-surface-variant">Select an existing container</div>
                                </button>
                              </div>
                            </div>
                          ) : containerMode === 'create' ? (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
                                  Create Server Container
                                </label>
                                <button
                                  onClick={() => {
                                    setContainerMode(null);
                                    setSelectedAccount('');
                                    setNewContainerName('');
                                  }}
                                  className="text-xs text-on-surface-variant hover:text-white"
                                >
                                  Back
                                </button>
                              </div>

                              <div>
                                <label className="block text-[10px] text-on-surface-variant mb-1">GTM Account</label>
                                <select
                                  value={selectedAccount}
                                  onChange={(e) => setSelectedAccount(e.target.value)}
                                  className="w-full bg-surface-container text-white text-sm p-2 rounded border border-surface-bright focus:border-secondary focus:outline-none"
                                >
                                  <option value="">Select account...</option>
                                  {gtmAccounts.map((account) => (
                                    <option key={account.path} value={account.path}>
                                      {account.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-[10px] text-on-surface-variant mb-1">Container Name</label>
                                <input
                                  type="text"
                                  value={newContainerName}
                                  onChange={(e) => setNewContainerName(e.target.value)}
                                  placeholder="My Server Container"
                                  className="w-full bg-surface-container text-white text-sm p-2 rounded border border-surface-bright focus:border-secondary focus:outline-none"
                                />
                              </div>

                              <button
                                onClick={async () => {
                                  if (!selectedAccount || !newContainerName) {
                                    alert('Please select an account and enter a container name');
                                    return;
                                  }

                                  setIsCreatingContainer(true);
                                  addLog(`Creating server container: ${newContainerName}...`);

                                  try {
                                    const gtmSessionId = getGtmSession();
                                    if (!gtmSessionId) {
                                      throw new Error('No GTM session found');
                                    }

                                    const response = await fetch(`${getApiBaseUrl()}/gtm/create-server-container`, {
                                      method: 'POST',
                                      headers: {
                                        'Content-Type': 'application/json',
                                        'x-gtm-session': gtmSessionId
                                      },
                                      body: JSON.stringify({
                                        accountPath: selectedAccount,
                                        name: newContainerName,
                                        importId: run?.importId
                                      })
                                    });

                                    if (!response.ok) {
                                      const error = await response.json();
                                      throw new Error(error.message || 'Failed to create container');
                                    }

                                    const result = await response.json();
                                    setServerContainerPath(result.path);
                                    addLog(`✅ Created server container: ${result.publicId}`);
                                  } catch (error: any) {
                                    addLog(`❌ Failed to create container: ${error.message}`);
                                    alert(`Failed to create container: ${error.message}`);
                                  } finally {
                                    setIsCreatingContainer(false);
                                  }
                                }}
                                disabled={isCreatingContainer || !selectedAccount || !newContainerName}
                                className={`w-full p-3 rounded text-sm font-bold transition-all ${
                                  isCreatingContainer || !selectedAccount || !newContainerName
                                    ? 'bg-surface-container text-on-surface-variant cursor-not-allowed'
                                    : 'bg-primary text-on-primary hover:brightness-110'
                                }`}
                              >
                                {isCreatingContainer ? (
                                  <span className="flex items-center justify-center gap-2">
                                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                                    Creating container...
                                  </span>
                                ) : (
                                  <span className="flex items-center justify-center gap-2">
                                    <span className="material-symbols-outlined text-sm">add</span>
                                    Create Server Container
                                  </span>
                                )}
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
                                  Select Server Container
                                </label>
                                <button
                                  onClick={() => {
                                    setContainerMode(null);
                                    setServerContainers([]);
                                  }}
                                  className="text-xs text-on-surface-variant hover:text-white"
                                >
                                  Back
                                </button>
                              </div>

                              <select
                                value={serverContainerPath}
                                onChange={(e) => setServerContainerPath(e.target.value)}
                                className="w-full bg-surface-container text-white text-sm p-3 rounded border border-surface-bright focus:border-secondary focus:outline-none"
                              >
                                <option value="">Choose a server container...</option>
                                {serverContainers.map((container) => (
                                  <option key={container.path} value={container.path}>
                                    {container.name} ({container.publicId})
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-3">
                          <button
                            onClick={async () => {
                              setIsDeploying(true);
                              addLog(`🚀 Starting deployment of ${approvedTags.size} approved tags...`);

                              try {
                                const gtmSessionId = getGtmSession();
                                if (!gtmSessionId) {
                                  throw new Error('No GTM session found. Please reconnect to Google Tag Manager.');
                                }

                                const result = await apiClient.deployApprovedTags(
                                  runId,
                                  Array.from(approvedTags),
                                  serverContainerPath,
                                  gtmSessionId
                                );

                                processDeploymentResult(result);
                                addLog(`✅ Deployment complete: ${result.deployed} tags deployed, ${result.failed} failed`);

                                // Log detailed errors to console for debugging
                                if (result.errors && result.errors.length > 0) {
                                  console.error('Deployment errors:', result.errors);
                                  result.errors.forEach((err: any) => {
                                    console.error(`Tag "${err.clientTagName}" failed:`, err.error);
                                  });
                                }
                              } catch (error: any) {
                                addLog(`❌ Deployment failed: ${error.message}`);
                                alert(`Deployment failed: ${error.message}\n\nPlease ensure you're connected to Google Tag Manager and have the correct permissions.`);
                              } finally {
                                setIsDeploying(false);
                              }
                            }}
                            disabled={isDeploying || !serverContainerPath}
                            className={`w-full p-4 rounded-lg font-bold transition-all flex items-center justify-center gap-3 ${
                              isDeploying || !serverContainerPath
                                ? 'bg-surface-container text-on-surface-variant cursor-not-allowed'
                                : 'bg-secondary text-on-primary hover:brightness-110'
                            }`}
                          >
                            {isDeploying ? (
                              <>
                                <span className="material-symbols-outlined text-2xl animate-spin">progress_activity</span>
                                <div className="text-left">
                                  <div className="text-sm">Deploying Tags...</div>
                                  <div className="text-[10px] opacity-80">Creating tags in GTM</div>
                                </div>
                              </>
                            ) : (
                              <>
                                <span className="material-symbols-outlined text-2xl">cloud_upload</span>
                                <div className="text-left">
                                  <div className="text-sm">Deploy to Server Container</div>
                                  <div className="text-[10px] opacity-80">Automatically create {approvedTags.size} tags</div>
                                </div>
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {skippedTags.size > 0 && (
                        <div className="mt-4 p-3 bg-surface-container-low rounded-lg border border-outline-variant/20">
                          <p className="text-xs text-on-surface-variant">
                            <span className="material-symbols-outlined text-sm align-middle mr-1">info</span>
                            You have {skippedTags.size} skipped tag{skippedTags.size !== 1 ? 's' : ''} that can be migrated separately in a future iteration.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Deployment Results */}
              {deploymentResult && (
                <div className="bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 rounded-xl p-6 mb-6">
                  <div className="flex items-start gap-4">
                    <div className="bg-primary/20 p-3 rounded-lg">
                      <span className="material-symbols-outlined text-primary text-2xl">description</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-white mb-2">Implementation Guide Generated</h3>

                      {/* API Limitation Notice */}
                      {deploymentResult.apiLimitation && (
                        <div className="bg-[#ffb4a7]/10 border border-[#ffb4a7]/20 p-4 rounded-lg mb-4">
                          <div className="flex items-start gap-2 mb-2">
                            <span className="material-symbols-outlined text-[#ffb4a7] text-sm mt-0.5">info</span>
                            <div className="flex-1">
                              <div className="text-xs font-bold text-white mb-1">GTM API Limitation</div>
                              <div className="text-[11px] text-on-surface-variant mb-2">
                                {deploymentResult.apiLimitation.explanation}
                              </div>
                              <div className="text-[11px] text-on-surface">
                                <strong>Solution:</strong> {deploymentResult.apiLimitation.solution}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <p className="text-sm text-on-surface-variant mb-4">
                        Generated implementation guides for {deploymentResult.guideGenerated} tag{deploymentResult.guideGenerated !== 1 ? 's' : ''}.
                        Follow the steps below to manually add tags to your server-side container.
                      </p>

                      {/* Implementation Guide */}
                      {deploymentResult.implementationGuide && deploymentResult.implementationGuide.length > 0 && (
                        <div className="space-y-4 mb-4 max-h-[500px] overflow-y-auto custom-scrollbar">
                          {deploymentResult.implementationGuide.map((guide: any, idx: number) => (
                            <div key={guide.clientTagId || idx} className="bg-surface-container border border-outline-variant/10 p-4 rounded-lg">
                              <div className="flex items-start gap-3 mb-3">
                                <div className="bg-primary/20 p-2 rounded">
                                  <span className="material-symbols-outlined text-primary text-base">sell</span>
                                </div>
                                <div className="flex-1">
                                  <h5 className="text-sm font-bold text-white mb-1">{guide.tagName}</h5>
                                  <div className="text-[10px] text-on-surface-variant mb-2">
                                    <strong>Template:</strong> {guide.templateInfo?.templateName} <br />
                                    <strong>Source:</strong> {guide.templateInfo?.templateSource}
                                  </div>
                                </div>
                              </div>

                              {guide.templateInfo?.steps && (
                                <div className="bg-surface-container-low p-3 rounded">
                                  <h6 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Implementation Steps</h6>
                                  <ol className="space-y-1.5 text-[11px] text-on-surface list-decimal list-inside">
                                    {guide.templateInfo.steps.map((step: string, stepIdx: number) => (
                                      <li key={stepIdx} className="leading-relaxed">{step}</li>
                                    ))}
                                  </ol>
                                </div>
                              )}

                              {guide.recommendation && (
                                <details className="mt-3">
                                  <summary className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant cursor-pointer hover:text-white transition-colors">
                                    View Original Recommendation
                                  </summary>
                                  <div className="mt-2 text-[10px] text-on-surface-variant bg-surface-container-lowest p-3 rounded font-mono whitespace-pre-wrap">
                                    {guide.recommendation}
                                  </div>
                                </details>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Next Steps */}
                      <div className="bg-surface-container-low p-4 rounded-lg">
                        <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-3">Next Steps</h4>
                        <ol className="space-y-2 text-sm text-on-surface list-decimal list-inside">
                          {deploymentResult.nextSteps?.map((step: string, idx: number) => (
                            <li key={idx}>{step}</li>
                          ))}
                        </ol>
                      </div>

                      <button
                        onClick={() => setDeploymentResult(null)}
                        className="mt-4 px-4 py-2 bg-surface-container-highest text-white rounded-lg text-xs font-bold hover:bg-surface-bright transition-all"
                      >
                        Close Guide
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-12 gap-6 min-h-[600px]">
              {/* Left Sidebar: Detected Elements */}
              <aside className="col-span-12 lg:col-span-4 xl:col-span-3">
                <div className="bg-surface-container-low rounded-lg overflow-hidden border border-outline-variant/10 flex flex-col h-full">
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-outline-variant/10 bg-surface-container-high/50">
                    <div className="flex justify-between items-center mb-3">
                      <h2 className="font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                        Container Elements
                      </h2>
                      <span className="text-[10px] font-mono text-white bg-white/10 px-2 py-0.5 rounded-full border border-white/5">
                        {filteredElements.length}
                      </span>
                    </div>

                    {/* Deployment Status Tabs */}
                    <div className="grid grid-cols-2 gap-1 mb-3 p-1 bg-surface-container-lowest rounded-lg">
                      <button
                        onClick={() => setDeploymentFilter('active')}
                        className={`px-2 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
                          deploymentFilter === 'active'
                            ? 'bg-secondary text-on-primary shadow-sm'
                            : 'text-on-surface-variant hover:text-white'
                        }`}
                      >
                        <span className="material-symbols-outlined text-xs">pending_actions</span>
                        Active ({allElements.filter(e => !deployedTags.has(e.id) && !skippedTags.has(e.id)).length})
                      </button>
                      <button
                        onClick={() => setDeploymentFilter('deployed')}
                        className={`px-2 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
                          deploymentFilter === 'deployed'
                            ? 'bg-secondary text-on-primary shadow-sm'
                            : 'text-on-surface-variant hover:text-white'
                        }`}
                      >
                        <span className="material-symbols-outlined text-xs">check_circle</span>
                        Deployed ({deployedTags.size})
                      </button>
                    </div>

                    {/* Element Type Tabs */}
                    <div className="grid grid-cols-4 gap-1 mb-3 p-1 bg-surface-container-lowest rounded-lg">
                      <button
                        onClick={() => setElementTypeFilter('tag')}
                        className={`px-2 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
                          elementTypeFilter === 'tag'
                            ? 'bg-primary text-on-primary shadow-sm'
                            : 'text-on-surface-variant hover:text-white'
                        }`}
                      >
                        <span className="material-symbols-outlined text-xs">sell</span>
                        Tags
                      </button>
                      <button
                        onClick={() => setElementTypeFilter('trigger')}
                        className={`px-2 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
                          elementTypeFilter === 'trigger'
                            ? 'bg-primary text-on-primary shadow-sm'
                            : 'text-on-surface-variant hover:text-white'
                        }`}
                      >
                        <span className="material-symbols-outlined text-xs">bolt</span>
                        Triggers
                      </button>
                      <button
                        onClick={() => setElementTypeFilter('variable')}
                        className={`px-2 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
                          elementTypeFilter === 'variable'
                            ? 'bg-primary text-on-primary shadow-sm'
                            : 'text-on-surface-variant hover:text-white'
                        }`}
                      >
                        <span className="material-symbols-outlined text-xs">data_object</span>
                        Vars
                      </button>
                      <button
                        onClick={() => setElementTypeFilter('all')}
                        className={`px-2 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all ${
                          elementTypeFilter === 'all'
                            ? 'bg-primary text-on-primary shadow-sm'
                            : 'text-on-surface-variant hover:text-white'
                        }`}
                      >
                        All
                      </button>
                    </div>

                    {/* Status Legend (only for tags) */}
                    {elementTypeFilter === 'tag' && (
                      <div className="flex gap-2 flex-wrap">
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-secondary"></div>
                          <span className="text-[9px] text-on-surface-variant uppercase font-label">Ready</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-[#F63A22]"></div>
                          <span className="text-[9px] text-on-surface-variant uppercase font-label">Review</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-error"></div>
                          <span className="text-[9px] text-on-surface-variant uppercase font-label">Manual</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Search & Show Skipped Toggle */}
                  <div className="px-3 py-2 border-b border-outline-variant/10 bg-surface-container-lowest/50 space-y-2">
                    <div className="flex items-center bg-surface-container-highest/50 border border-white/5 rounded px-2 py-1.5">
                      <span className="material-symbols-outlined text-xs text-on-surface-variant">search</span>
                      <input
                        className="bg-transparent border-none p-0 ml-2 text-xs text-on-surface focus:ring-0 w-full font-label placeholder-on-surface-variant/50"
                        placeholder="Search..."
                        type="text"
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                      />
                    </div>
                    {skippedTags.size > 0 && (
                      <button
                        onClick={() => setShowSkipped(!showSkipped)}
                        className={`w-full px-2 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
                          showSkipped
                            ? 'bg-surface-variant/20 text-on-surface border border-surface-variant/30'
                            : 'bg-surface-container-highest/50 text-on-surface-variant hover:text-white'
                        }`}
                      >
                        <span className="material-symbols-outlined text-xs">
                          {showSkipped ? 'visibility' : 'visibility_off'}
                        </span>
                        {showSkipped ? 'Hide' : 'Show'} Skipped ({skippedTags.size})
                      </button>
                    )}
                  </div>

                  {/* Elements List */}
                  <div className="flex-grow overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {filteredElements.length === 0 ? (
                      <div className="text-center py-8 text-on-surface-variant text-sm">
                        No elements found
                      </div>
                    ) : (
                      filteredElements.map((element) => {
                        const isSkipped = skippedTags.has(element.id);
                        return (
                        <div
                          key={element.id}
                          onClick={() => {
                            setSelectedElement(element);
                            if (element.elementType === 'tag') {
                              const mapping = report.mappings.find((m: MappingRecord) => m.clientTagId === element.id);
                              setSelectedMapping(mapping || null);
                            } else {
                              setSelectedMapping(null);
                            }
                            addLog(`Selected: ${element.name} (${element.elementType})`);
                          }}
                          className={`p-3 rounded-md flex items-center gap-3 cursor-pointer transition-all ${
                            isSkipped ? 'opacity-50' : ''
                          } ${
                            selectedElement?.id === element.id
                              ? 'bg-gradient-to-r from-primary/10 to-transparent border-l-2 border-primary ring-1 ring-inset ring-white/5'
                              : 'hover:bg-white/5 border border-transparent hover:border-white/5'
                          }`}
                        >
                          <div className={`w-9 h-9 rounded flex items-center justify-center ${
                            selectedElement?.id === element.id
                              ? 'bg-primary/20 text-primary'
                              : 'bg-surface-variant/50 text-on-surface-variant'
                          }`}>
                            <span className="material-symbols-outlined text-xl">
                              {element.elementType === 'tag' ? getIconForTagType(element.type) :
                               element.elementType === 'trigger' ? 'bolt' : 'data_object'}
                            </span>
                          </div>
                          <div className="flex-grow min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <div className={`text-sm font-bold truncate ${
                                selectedElement?.id === element.id ? 'text-white' : 'text-on-surface'
                              }`}>
                                {element.name}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[8px] px-1.5 py-0.5 rounded bg-white/5 text-on-surface-variant font-bold uppercase tracking-tighter border border-white/10 whitespace-nowrap">
                                {element.type}
                              </span>
                              {element.elementType === 'tag' && (() => {
                                const mapping = report.mappings.find((m: MappingRecord) => m.clientTagId === element.id);
                                if (mapping?.evidence?.type === 'agent_web') {
                                  return (
                                    <span className="text-[7px] px-1 py-0.5 rounded bg-[#9c27b0]/10 text-[#ce93d8] font-bold uppercase tracking-wider border border-[#9c27b0]/30 whitespace-nowrap flex items-center gap-0.5">
                                      <span className="material-symbols-outlined" style={{ fontSize: '8px' }}>psychology</span>
                                      AI
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1 items-end">
                            {approvedTags.has(element.id) && (
                              <div className="px-2 py-1 rounded text-[9px] font-black border bg-secondary/10 text-secondary border-secondary/30 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                                APPROVED
                              </div>
                            )}
                            {isSkipped && (
                              <div className="px-2 py-1 rounded text-[9px] font-black border bg-surface-variant/20 text-on-surface-variant border-surface-variant/30 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[12px]">visibility_off</span>
                                SKIPPED
                              </div>
                            )}
                            {element.status && (
                              <div className={`px-2 py-1 rounded text-[9px] font-black border flex items-center gap-1 ${getStatusColor(element.status)}`}>
                                <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: element.status === 'ready' ? "'FILL' 1" : "'FILL' 0" }}>
                                  {getStatusIcon(element.status)}
                                </span>
                                {getStatusText(element.status)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                      })
                    )}
                  </div>
                </div>
              </aside>

              {/* Center: Mapping Details */}
              <section className="col-span-12 lg:col-span-5 xl:col-span-6">
                <div className="bg-surface-container rounded-lg border border-outline-variant/10 overflow-hidden flex flex-col h-full">
                  {/* Editor Header */}
                  <div className="bg-surface-container-high px-6 py-4 border-b border-outline-variant/10">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="bg-primary/20 p-2 rounded text-primary">
                          <span className="material-symbols-outlined text-xl">settings_ethernet</span>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-white tracking-tight mb-1">
                            {selectedElement?.name || 'Select a tag'}
                          </h3>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[10px] text-on-surface-variant font-label uppercase">
                              {selectedMapping ? `Confidence: ${selectedMapping.confidence.toFixed(1)}/10` : 'No mapping available'}
                            </p>
                            {selectedMapping && (
                              <>
                                <span className="text-on-surface-variant/30">•</span>
                                {selectedMapping.evidence?.type === 'agent_web' ? (
                                  <div className="flex items-center gap-1 bg-[#9c27b0]/10 border border-[#9c27b0]/30 px-2 py-0.5 rounded text-[10px] font-bold text-[#ce93d8] uppercase tracking-wider">
                                    <span className="material-symbols-outlined text-xs">psychology</span>
                                    AI-Enhanced
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 bg-secondary/10 border border-secondary/30 px-2 py-0.5 rounded text-[10px] font-bold text-secondary uppercase tracking-wider">
                                    <span className="material-symbols-outlined text-xs">book</span>
                                    Rule-Based
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {selectedMapping && (
                        <div className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${
                          selectedMapping.confidence >= 8.5 ? 'bg-secondary/10 text-secondary' :
                          selectedMapping.confidence >= 6 ? 'bg-[#F63A22]/10 text-[#F63A22]' :
                          'bg-error/10 text-error'
                        }`}>
                          {selectedMapping.provisional ? 'PROVISIONAL' : 'VERIFIED'}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-6 flex-grow space-y-6 overflow-y-auto custom-scrollbar">
                    {!selectedElement ? (
                      <div className="text-center py-12 text-on-surface-variant">
                        Select an element from the left to view details
                      </div>
                    ) : selectedElement.elementType === 'trigger' ? (
                      <>
                        {/* Trigger Details */}
                        <div className="bg-[#ffb4a7]/5 border border-[#ffb4a7]/20 p-4 rounded-lg">
                          <div className="flex items-start gap-3 mb-3">
                            <span className="material-symbols-outlined text-[#ffb4a7] text-xl">bolt</span>
                            <div>
                              <p className="text-xs font-bold text-white mb-1">Trigger Overview</p>
                              <p className="text-[10px] text-on-surface-variant">
                                This trigger defines when tags should fire. Triggers stay client-side but are referenced in server-side tag configurations.
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-widest">
                            Trigger Configuration
                          </label>
                          <div className="bg-surface-container-highest p-4 rounded">
                            <pre className="text-xs text-on-surface leading-relaxed whitespace-pre-wrap font-mono">
                              {JSON.stringify(selectedElement.details, null, 2)}
                            </pre>
                          </div>
                        </div>

                        <div className="bg-secondary/5 border border-secondary/10 p-4 rounded-lg">
                          <p className="text-xs text-on-surface leading-relaxed">
                            <span className="font-bold">Migration Note:</span> Triggers remain in your client-side container.
                            When tags fire based on this trigger, events will be forwarded to your server container automatically.
                          </p>
                        </div>
                      </>
                    ) : selectedElement.elementType === 'variable' ? (
                      <>
                        {/* Variable Details */}
                        <div className="bg-[#ffb4a7]/5 border border-[#ffb4a7]/20 p-4 rounded-lg">
                          <div className="flex items-start gap-3 mb-3">
                            <span className="material-symbols-outlined text-[#ffb4a7] text-xl">data_object</span>
                            <div>
                              <p className="text-xs font-bold text-white mb-1">Variable Overview</p>
                              <p className="text-[10px] text-on-surface-variant">
                                Variables need to be manually recreated in your server-side container to access their values server-side.
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-widest">
                            Variable Configuration
                          </label>
                          <div className="bg-surface-container-highest p-4 rounded">
                            <pre className="text-xs text-on-surface leading-relaxed whitespace-pre-wrap font-mono">
                              {JSON.stringify(selectedElement.details, null, 2)}
                            </pre>
                          </div>
                        </div>

                        <div className="bg-[#F63A22]/5 border border-[#F63A22]/20 p-4 rounded-lg">
                          <div className="flex items-start gap-3">
                            <span className="material-symbols-outlined text-[#F63A22]">warning</span>
                            <div>
                              <p className="text-xs font-bold text-white mb-2">Action Required</p>
                              <ol className="text-xs text-on-surface space-y-1 list-decimal list-inside">
                                <li>Open your server-side GTM container</li>
                                <li>Create a new variable with the same name and type</li>
                                <li>Configure it to read from the appropriate server-side source (event data, cookies, headers, etc.)</li>
                                <li>Test in GTM preview mode to verify the value is accessible</li>
                              </ol>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : !selectedMapping ? (
                      <div className="text-center py-12">
                        <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-4">warning</span>
                        <p className="text-on-surface-variant">No mapping available for this tag</p>
                      </div>
                    ) : (
                      <>
                        {/* What You Need to Do - Status-specific guidance */}
                        <div className={`p-4 rounded-lg border-2 ${
                          selectedElement.status === 'ready'
                            ? 'bg-secondary/5 border-secondary/30'
                            : selectedElement.status === 'mapping'
                            ? 'bg-[#F63A22]/5 border-[#F63A22]/30'
                            : 'bg-error/5 border-error/30'
                        }`}>
                          <div className="flex items-start gap-3 mb-3">
                            <span className={`material-symbols-outlined text-2xl ${
                              selectedElement.status === 'ready' ? 'text-secondary' :
                              selectedElement.status === 'mapping' ? 'text-[#F63A22]' : 'text-error'
                            }`} style={{ fontVariationSettings: "'FILL' 1" }}>
                              {selectedElement.status === 'ready' ? 'check_circle' :
                               selectedElement.status === 'mapping' ? 'edit_note' : 'warning'}
                            </span>
                            <div className="flex-1">
                              <h4 className="text-sm font-bold text-white mb-1">
                                {selectedElement.status === 'ready' ? '✓ Ready for Deployment' :
                                 selectedElement.status === 'mapping' ? '⚠️ Review Required' : '🚨 Manual Configuration Needed'}
                              </h4>
                              <p className="text-xs text-on-surface-variant leading-relaxed mb-3">
                                {selectedElement.status === 'ready'
                                  ? 'This tag has been automatically mapped with high confidence. No action needed - it will be included in your server-side container.'
                                  : selectedElement.status === 'mapping'
                                  ? 'This tag needs your review. Check the recommendation below and verify it matches your tracking requirements.'
                                  : 'This tag requires manual configuration. Follow the steps below to properly set up server-side tracking.'}
                              </p>

                              {/* Action buttons based on status */}
                              <div className="flex gap-2 flex-wrap">
                                {deployedTags.has(selectedElement.id) ? (
                                  <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-secondary/10 text-secondary border border-secondary/20">
                                    <span
                                      className="material-symbols-outlined text-sm"
                                      style={{ fontVariationSettings: "'FILL' 1" }}
                                    >
                                      task_alt
                                    </span>
                                    Deployed
                                  </div>
                                ) : selectedElement.status === 'ready' ? (
                                  <>
                                    {approvedTags.has(selectedElement.id) ? (
                                      <>
                                        <button
                                          onClick={() => {
                                            setApprovedTags(prev => {
                                              const next = new Set(prev);
                                              next.delete(selectedElement.id);
                                              return next;
                                            });
                                            addLog(`🔄 Unapproved tag: ${selectedElement.name}`);
                                          }}
                                          className="px-4 py-2 bg-secondary/20 text-secondary rounded-lg text-xs font-bold hover:bg-secondary/30 transition-all flex items-center gap-1"
                                        >
                                          <span className="material-symbols-outlined text-sm">undo</span>
                                          Unapprove
                                        </button>
                                        {serverContainerPath && (
                                          <button
                                            onClick={async () => {
                                              setIsDeploying(true);
                                              addLog(`🚀 Deploying single tag: ${selectedElement.name}`);

                                              try {
                                                const gtmSessionId = getGtmSession();
                                                if (!gtmSessionId) {
                                                  throw new Error('No GTM session found. Please reconnect to Google Tag Manager.');
                                                }

                                                const result = await apiClient.deployApprovedTags(
                                                  runId,
                                                  [selectedElement.id],
                                                  serverContainerPath,
                                                  gtmSessionId
                                                );

                                                processDeploymentResult(result);
                                                addLog(`✅ Deployment complete`);
                                              } catch (error: any) {
                                                addLog(`❌ Deployment failed: ${error.message}`);
                                                alert(`Deployment failed: ${error.message}`);
                                              } finally {
                                                setIsDeploying(false);
                                              }
                                            }}
                                            disabled={isDeploying}
                                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                              isDeploying
                                                ? 'bg-surface-container text-on-surface-variant cursor-not-allowed'
                                                : 'bg-primary text-on-primary hover:brightness-110'
                                            }`}
                                          >
                                            {isDeploying ? (
                                              <>
                                                <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                                                Deploying...
                                              </>
                                            ) : (
                                              <>
                                                <span className="material-symbols-outlined text-sm">cloud_upload</span>
                                                Deploy This Tag
                                              </>
                                            )}
                                          </button>
                                        )}
                                      </>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setApprovedTags(prev => new Set(prev).add(selectedElement.id));
                                          addLog(`✅ Approved tag: ${selectedElement.name}`);
                                        }}
                                        className="px-4 py-2 bg-secondary text-on-primary rounded-lg text-xs font-bold hover:brightness-110 transition-all flex items-center gap-1"
                                      >
                                        <span className="material-symbols-outlined text-sm">check</span>
                                        Approve
                                      </button>
                                    )}
                                  </>
                                ) : selectedElement.status === 'mapping' ? (
                                  <>
                                    {approvedTags.has(selectedElement.id) ? (
                                      <>
                                        <button
                                          onClick={() => {
                                            setApprovedTags(prev => {
                                              const next = new Set(prev);
                                              next.delete(selectedElement.id);
                                              return next;
                                            });
                                            addLog(`🔄 Unapproved mapping for: ${selectedElement.name}`);
                                          }}
                                          className="px-4 py-2 bg-secondary/20 text-secondary rounded-lg text-xs font-bold hover:bg-secondary/30 transition-all flex items-center gap-1"
                                        >
                                          <span className="material-symbols-outlined text-sm">undo</span>
                                          Unapprove
                                        </button>
                                        {serverContainerPath && (
                                          <button
                                            onClick={async () => {
                                              setIsDeploying(true);
                                              addLog(`🚀 Deploying single tag: ${selectedElement.name}`);

                                              try {
                                                const gtmSessionId = getGtmSession();
                                                if (!gtmSessionId) {
                                                  throw new Error('No GTM session found. Please reconnect to Google Tag Manager.');
                                                }

                                                const result = await apiClient.deployApprovedTags(
                                                  runId,
                                                  [selectedElement.id],
                                                  serverContainerPath,
                                                  gtmSessionId
                                                );

                                                processDeploymentResult(result);
                                                addLog(`✅ Deployment complete`);
                                              } catch (error: any) {
                                                addLog(`❌ Deployment failed: ${error.message}`);
                                                alert(`Deployment failed: ${error.message}`);
                                              } finally {
                                                setIsDeploying(false);
                                              }
                                            }}
                                            disabled={isDeploying}
                                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                              isDeploying
                                                ? 'bg-surface-container text-on-surface-variant cursor-not-allowed'
                                                : 'bg-primary text-on-primary hover:brightness-110'
                                            }`}
                                          >
                                            {isDeploying ? (
                                              <>
                                                <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                                                Deploying...
                                              </>
                                            ) : (
                                              <>
                                                <span className="material-symbols-outlined text-sm">cloud_upload</span>
                                                Deploy This Tag
                                              </>
                                            )}
                                          </button>
                                        )}
                                      </>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setApprovedTags(prev => new Set(prev).add(selectedElement.id));
                                          addLog(`✅ Approved mapping for: ${selectedElement.name}`);
                                        }}
                                        className="px-4 py-2 bg-secondary text-on-primary rounded-lg text-xs font-bold hover:brightness-110 transition-all flex items-center gap-1"
                                      >
                                        <span className="material-symbols-outlined text-sm">check</span>
                                        Approve Mapping
                                      </button>
                                    )}
                                    <button
                                      onClick={() => {
                                        console.log('Customize clicked', { selectedMapping, selectedElement });
                                        if (selectedMapping && selectedElement) {
                                          setIsEditing(true);
                                          setEditedRecommendation(selectedMapping.serverRecommendation);
                                          addLog(`✏️ Editing recommendation for: ${selectedElement.name}`);
                                        } else {
                                          console.error('Missing mapping or element', { selectedMapping, selectedElement });
                                          addLog(`⚠️ Error: Cannot edit - mapping not found`);
                                        }
                                      }}
                                      className="px-4 py-2 bg-surface-container-highest text-white rounded-lg text-xs font-bold hover:bg-surface-bright transition-all flex items-center gap-1"
                                    >
                                      <span className="material-symbols-outlined text-sm">edit</span>
                                      Customize
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    {approvedTags.has(selectedElement.id) ? (
                                      <>
                                        <button
                                          onClick={() => {
                                            setApprovedTags(prev => {
                                              const next = new Set(prev);
                                              next.delete(selectedElement.id);
                                              return next;
                                            });
                                            addLog(`🔄 Unapproved tag: ${selectedElement.name}`);
                                          }}
                                          className="px-4 py-2 bg-secondary/20 text-secondary rounded-lg text-xs font-bold hover:bg-secondary/30 transition-all flex items-center gap-1"
                                        >
                                          <span className="material-symbols-outlined text-sm">undo</span>
                                          Unapprove
                                        </button>
                                        {serverContainerPath && (
                                          <button
                                            onClick={async () => {
                                              setIsDeploying(true);
                                              addLog(`🚀 Deploying single tag: ${selectedElement.name}`);

                                              try {
                                                const gtmSessionId = getGtmSession();
                                                if (!gtmSessionId) {
                                                  throw new Error('No GTM session found. Please reconnect to Google Tag Manager.');
                                                }

                                                const result = await apiClient.deployApprovedTags(
                                                  runId,
                                                  [selectedElement.id],
                                                  serverContainerPath,
                                                  gtmSessionId
                                                );

                                                processDeploymentResult(result);
                                                addLog(`✅ Deployment complete`);
                                              } catch (error: any) {
                                                addLog(`❌ Deployment failed: ${error.message}`);
                                                alert(`Deployment failed: ${error.message}`);
                                              } finally {
                                                setIsDeploying(false);
                                              }
                                            }}
                                            disabled={isDeploying}
                                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                              isDeploying
                                                ? 'bg-surface-container text-on-surface-variant cursor-not-allowed'
                                                : 'bg-primary text-on-primary hover:brightness-110'
                                            }`}
                                          >
                                            {isDeploying ? (
                                              <>
                                                <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                                                Deploying...
                                              </>
                                            ) : (
                                              <>
                                                <span className="material-symbols-outlined text-sm">cloud_upload</span>
                                                Deploy This Tag
                                              </>
                                            )}
                                          </button>
                                        )}
                                      </>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setApprovedTags(prev => new Set(prev).add(selectedElement.id));
                                          addLog(`✅ Approved tag (manual config): ${selectedElement.name}`);
                                        }}
                                        className="px-4 py-2 bg-secondary text-on-primary rounded-lg text-xs font-bold hover:brightness-110 transition-all flex items-center gap-1"
                                      >
                                        <span className="material-symbols-outlined text-sm">check</span>
                                        Approve
                                      </button>
                                    )}
                                    <button className="px-4 py-2 bg-primary text-on-primary rounded-lg text-xs font-bold hover:brightness-110 transition-all flex items-center gap-1">
                                      <span className="material-symbols-outlined text-sm">build</span>
                                      Configure Manually
                                    </button>
                                    <button className="px-4 py-2 bg-surface-container-highest text-white rounded-lg text-xs font-bold hover:bg-surface-bright transition-all flex items-center gap-1">
                                      <span className="material-symbols-outlined text-sm">help</span>
                                      Get Help
                                    </button>
                                  </>
                                )}

                                {/* Skip/Unskip button for all statuses */}
                                {skippedTags.has(selectedElement.id) ? (
                                  <button
                                    onClick={() => {
                                      setSkippedTags(prev => {
                                        const next = new Set(prev);
                                        next.delete(selectedElement.id);
                                        return next;
                                      });
                                      addLog(`↩️ Unskipped tag: ${selectedElement.name}`);
                                    }}
                                    className="px-4 py-2 bg-secondary/20 text-secondary rounded-lg text-xs font-bold hover:bg-secondary/30 transition-all flex items-center gap-1"
                                  >
                                    <span className="material-symbols-outlined text-sm">undo</span>
                                    Unskip This Tag
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setSkippedTags(prev => new Set(prev).add(selectedElement.id));
                                      addLog(`⏭️ Skipped tag: ${selectedElement.name}`);
                                      setSelectedElement(null);
                                      setSelectedMapping(null);
                                    }}
                                    className="px-4 py-2 bg-surface-container-highest text-on-surface-variant rounded-lg text-xs font-bold hover:bg-surface-bright transition-all flex items-center gap-1"
                                  >
                                    <span className="material-symbols-outlined text-sm">skip_next</span>
                                    Skip This Tag
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Original GTM Tag Configuration */}
                        <div className="space-y-2">
                          <label className="block text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-widest">
                            Original GTM Configuration
                          </label>
                          <div className="bg-surface-container-highest p-4 rounded space-y-3">
                            {/* Tag Type */}
                            <div>
                              <span className="text-on-surface-variant text-[10px] uppercase tracking-wide font-bold">Tag Type</span>
                              <p className="text-white text-sm font-mono mt-1">{selectedElement.type}</p>
                            </div>

                            {/* Category */}
                            <div>
                              <span className="text-on-surface-variant text-[10px] uppercase tracking-wide font-bold">Category</span>
                              <p className="text-white text-sm mt-1">{(selectedElement.details as DetectedTag).category}</p>
                            </div>

                            {/* Firing Triggers */}
                            <div>
                              <span className="text-on-surface-variant text-[10px] uppercase tracking-wide font-bold">Firing Triggers</span>
                              <p className="text-white text-xs mt-1 leading-relaxed">{(selectedElement.details as DetectedTag).triggerSummary || 'No triggers'}</p>
                            </div>

                            {/* Parameters */}
                            <div>
                              <span className="text-on-surface-variant text-[10px] uppercase tracking-wide font-bold mb-2 block">Configuration Parameters</span>
                              {(selectedElement.details as DetectedTag).parameters && Object.keys((selectedElement.details as DetectedTag).parameters || {}).length > 0 ? (
                                <div className="bg-surface-container p-3 rounded space-y-2">
                                  {Object.entries((selectedElement.details as DetectedTag).parameters || {}).map(([key, value]) => (
                                    <div key={key} className="flex items-start gap-3 text-xs">
                                      <span className="text-secondary font-mono font-bold min-w-[120px]">{key}</span>
                                      <span className="text-on-surface flex-1 break-words">{value}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="bg-[#F63A22]/5 border border-[#F63A22]/20 p-3 rounded text-xs text-on-surface-variant">
                                  Parameter details not available in this report. Re-run the migration to see full GTM configuration.
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Server Recommendation */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="block text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-widest">
                              Server-Side Recommendation
                            </label>
                            <div className="flex gap-2">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={() => {
                                      // Save changes
                                      if (selectedMapping && report && selectedElement) {
                                        const newRecommendation = buildRecommendation(
                                          editServerTagName,
                                          editConfigSteps,
                                          editValidationNotes
                                        );
                                        const updatedMappings = report.mappings.map((m: MappingRecord) =>
                                          m.clientTagId === selectedElement.id
                                            ? { ...m, serverRecommendation: newRecommendation }
                                            : m
                                        );
                                        setReport({ ...report, mappings: updatedMappings });
                                        setSelectedMapping({ ...selectedMapping, serverRecommendation: newRecommendation });
                                        setIsEditing(false);
                                        addLog(`✓ Updated recommendation for: ${selectedElement.name}`);
                                      }
                                    }}
                                    className="px-3 py-1 bg-secondary text-on-primary rounded text-[10px] font-bold hover:brightness-110 transition-all"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => {
                                      setIsEditing(false);
                                      addLog(`Cancelled edit for: ${selectedElement.name}`);
                                    }}
                                    className="px-3 py-1 bg-surface-container-highest text-white rounded text-[10px] font-bold hover:bg-surface-bright transition-all"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => {
                                    setIsEditing(true);
                                    const parsed = parseRecommendation(selectedMapping.serverRecommendation);
                                    setEditServerTagName(parsed.tagName);
                                    setEditConfigSteps(parsed.configSteps);
                                    setEditValidationNotes(parsed.validationNotes);
                                    addLog(`✏️ Editing recommendation for: ${selectedElement.name}`);
                                  }}
                                  className="px-3 py-1 bg-surface-container-highest text-white rounded text-[10px] font-bold hover:bg-surface-bright transition-all flex items-center gap-1"
                                >
                                  <span className="material-symbols-outlined text-sm">edit</span>
                                  Edit
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="bg-surface-container-highest p-4 rounded">
                            {isEditing ? (
                              <div className="space-y-4">
                                {/* Server Tag Name */}
                                <div>
                                  <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2 block">
                                    Server Tag Description
                                  </label>
                                  <input
                                    type="text"
                                    value={editServerTagName}
                                    onChange={(e) => setEditServerTagName(e.target.value)}
                                    className="w-full bg-surface-container text-white text-sm p-2 rounded border border-surface-bright focus:border-secondary focus:outline-none"
                                    placeholder="e.g., Server-side Meta CAPI tag with hashed PII"
                                  />
                                </div>

                                {/* Configuration Steps */}
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                                      Configuration Steps
                                    </label>
                                    <button
                                      onClick={() => setEditConfigSteps([...editConfigSteps, ''])}
                                      className="px-2 py-1 bg-primary/20 text-primary rounded text-[9px] font-bold hover:bg-primary/30 transition-all flex items-center gap-1"
                                    >
                                      <span className="material-symbols-outlined text-xs">add</span>
                                      Add Step
                                    </button>
                                  </div>
                                  <div className="space-y-2">
                                    {editConfigSteps.map((step, index) => (
                                      <div key={index} className="flex items-start gap-2">
                                        <span className="text-primary text-sm mt-2">•</span>
                                        <input
                                          type="text"
                                          value={step}
                                          onChange={(e) => {
                                            const newSteps = [...editConfigSteps];
                                            newSteps[index] = e.target.value;
                                            setEditConfigSteps(newSteps);
                                          }}
                                          className="flex-1 bg-surface-container text-on-surface text-xs p-2 rounded border border-surface-bright focus:border-secondary focus:outline-none"
                                          placeholder="Enter configuration step..."
                                        />
                                        <button
                                          onClick={() => {
                                            const newSteps = editConfigSteps.filter((_, i) => i !== index);
                                            setEditConfigSteps(newSteps);
                                          }}
                                          className="p-1.5 text-error hover:bg-error/10 rounded transition-all"
                                        >
                                          <span className="material-symbols-outlined text-sm">delete</span>
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Validation Notes */}
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                                      Validation Notes
                                    </label>
                                    <button
                                      onClick={() => setEditValidationNotes([...editValidationNotes, ''])}
                                      className="px-2 py-1 bg-primary/20 text-primary rounded text-[9px] font-bold hover:bg-primary/30 transition-all flex items-center gap-1"
                                    >
                                      <span className="material-symbols-outlined text-xs">add</span>
                                      Add Note
                                    </button>
                                  </div>
                                  <div className="space-y-2">
                                    {editValidationNotes.map((note, index) => (
                                      <div key={index} className="flex items-start gap-2">
                                        <span className="text-[#F63A22] text-sm mt-2">⚠</span>
                                        <input
                                          type="text"
                                          value={note}
                                          onChange={(e) => {
                                            const newNotes = [...editValidationNotes];
                                            newNotes[index] = e.target.value;
                                            setEditValidationNotes(newNotes);
                                          }}
                                          className="flex-1 bg-surface-container text-on-surface text-xs p-2 rounded border border-surface-bright focus:border-secondary focus:outline-none"
                                          placeholder="Enter validation note..."
                                        />
                                        <button
                                          onClick={() => {
                                            const newNotes = editValidationNotes.filter((_, i) => i !== index);
                                            setEditValidationNotes(newNotes);
                                          }}
                                          className="p-1.5 text-error hover:bg-error/10 rounded transition-all"
                                        >
                                          <span className="material-symbols-outlined text-sm">delete</span>
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">
                                {selectedMapping.serverRecommendation}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Evidence Source */}
                        {selectedMapping.evidence && (
                          <div className="space-y-2">
                            <label className="block text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-widest">
                              Evidence Source
                            </label>
                            {selectedMapping.evidence.type === 'docs' ? (
                              <div className="bg-secondary/5 border border-secondary/20 p-4 rounded-lg">
                                <div className="flex items-start gap-3">
                                  <div className="bg-secondary/20 p-2 rounded">
                                    <span className="material-symbols-outlined text-secondary text-lg">verified</span>
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-xs font-bold text-white mb-1">Official Documentation</p>
                                    <p className="text-[10px] text-on-surface-variant mb-2">
                                      This mapping is based on verified provider documentation and production rules.
                                    </p>
                                    <a
                                      href={selectedMapping.evidence.ref}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[10px] text-secondary font-mono hover:underline"
                                    >
                                      <span className="material-symbols-outlined text-xs">link</span>
                                      {selectedMapping.evidence.ref}
                                    </a>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="bg-[#9c27b0]/5 border border-[#9c27b0]/20 p-4 rounded-lg">
                                <div className="flex items-start gap-3 mb-3">
                                  <div className="bg-[#9c27b0]/20 p-2 rounded">
                                    <span className="material-symbols-outlined text-[#ce93d8] text-lg">psychology</span>
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-xs font-bold text-white mb-1">AI-Enhanced Web Search</p>
                                    <p className="text-[10px] text-on-surface-variant mb-2">
                                      No dedicated rule was found. AI searched the web and synthesized recommendations from available documentation.
                                    </p>
                                    {selectedMapping.evidence.searchQuery && (
                                      <div className="bg-surface-container-highest/50 p-2 rounded mb-2">
                                        <p className="text-[9px] text-on-surface-variant uppercase font-label mb-1">Search Query:</p>
                                        <p className="text-[10px] text-white font-mono">{selectedMapping.evidence.searchQuery}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {selectedMapping.evidence.sources && selectedMapping.evidence.sources.length > 0 && (
                                  <div className="space-y-1 pt-3 border-t border-[#9c27b0]/20">
                                    <p className="text-[9px] text-on-surface-variant uppercase font-label mb-2">Sources Referenced:</p>
                                    {selectedMapping.evidence.sources.slice(0, 5).map((source, idx) => (
                                      <a
                                        key={idx}
                                        href={source.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-start gap-2 p-2 hover:bg-surface-container-highest/30 rounded transition-colors group"
                                      >
                                        <span className="text-[10px] text-on-surface-variant mt-0.5">{idx + 1}.</span>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-[10px] text-white group-hover:text-[#ce93d8] transition-colors truncate">
                                            {source.title}
                                          </p>
                                          <p className="text-[9px] text-on-surface-variant font-mono truncate">{source.url}</p>
                                        </div>
                                        <span className="material-symbols-outlined text-xs text-on-surface-variant group-hover:text-[#ce93d8] transition-colors">
                                          open_in_new
                                        </span>
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Manual Actions */}
                        {selectedMapping.manualActions.length > 0 && (
                          <div className="space-y-3">
                            <label className="block text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-widest">
                              Action Items ({selectedMapping.manualActions.length})
                            </label>
                            <div className="bg-[#F63A22]/5 border border-[#F63A22]/20 p-4 rounded-lg">
                              <div className="flex items-start gap-3 mb-3">
                                <span className="material-symbols-outlined text-[#F63A22] text-xl">checklist</span>
                                <div>
                                  <p className="text-xs font-bold text-white mb-1">Complete These Steps:</p>
                                  <p className="text-[10px] text-on-surface-variant">
                                    Follow each action below to ensure proper server-side tracking for this tag.
                                  </p>
                                </div>
                              </div>
                              <div className="space-y-2">
                                {selectedMapping.manualActions.map((action, index) => (
                                  <div key={index} className="flex gap-3 items-start">
                                    <div className="bg-surface-container-highest rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                                      <span className="text-[10px] font-bold text-white">{index + 1}</span>
                                    </div>
                                    <p className="text-xs text-on-surface leading-relaxed flex-1">{action}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Confidence Badge */}
                        <div className={`p-4 rounded-lg flex gap-4 ${
                          selectedMapping.confidence >= 8.5 ? 'bg-secondary/5 border border-secondary/10' :
                          'bg-[#F63A22]/5 border border-[#F63A22]/10'
                        }`}>
                          <span className={`material-symbols-outlined ${
                            selectedMapping.confidence >= 8.5 ? 'text-secondary' : 'text-[#F63A22]'
                          }`}>
                            {selectedMapping.confidence >= 8.5 ? 'verified' : 'info'}
                          </span>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-bold text-on-surface">
                                Confidence Score: {selectedMapping.confidence.toFixed(1)}/10
                              </p>
                              <div className="flex gap-1">
                                {[...Array(10)].map((_, i) => (
                                  <div
                                    key={i}
                                    className={`w-2 h-2 rounded-full ${
                                      i < selectedMapping.confidence
                                        ? selectedMapping.confidence >= 8.5 ? 'bg-secondary' : 'bg-[#F63A22]'
                                        : 'bg-surface-variant'
                                    }`}
                                  />
                                ))}
                              </div>
                            </div>
                            <p className="text-xs text-on-surface-variant leading-relaxed">
                              {selectedMapping.confidence >= 8.5
                                ? 'High confidence mapping based on provider documentation. This is production-ready.'
                                : selectedMapping.confidence >= 6
                                ? 'Medium confidence. Review the recommendation above and verify it meets your requirements.'
                                : 'Low confidence. Manual configuration and testing strongly recommended before deployment.'}
                            </p>
                            {selectedMapping.provisional && (
                              <div className="mt-2 pt-2 border-t border-outline-variant/20">
                                <p className="text-[10px] text-[#F63A22] font-bold uppercase tracking-wider flex items-center gap-1">
                                  <span className="material-symbols-outlined text-xs">info</span>
                                  Provisional Mapping - Requires Validation
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </section>

              {/* Right Sidebar: Live Debugger */}
              <aside className="col-span-12 lg:col-span-3">
                <div className="space-y-4">
                  {/* Debugger */}
                  <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-lg overflow-hidden flex flex-col h-[400px]">
                    <div className="px-3 py-3 bg-surface-container-high flex items-center justify-between border-b border-outline-variant/10">
                      <span className="text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-tighter">
                        Activity Log
                      </span>
                      <span className="text-[9px] font-mono text-secondary">LIVE</span>
                    </div>
                    <div className="p-3 font-mono text-[10px] space-y-2 overflow-y-auto custom-scrollbar flex-grow">
                      {logs.length === 0 ? (
                        <p className="text-on-surface-variant">No activity yet</p>
                      ) : (
                        logs.map((log, index) => (
                          <div key={index} className="text-on-surface-variant">
                            {log}
                          </div>
                        ))
                      )}
                    </div>
                    <div className="p-3 border-t border-outline-variant/10 flex justify-center">
                      <button
                        onClick={() => setLogs([])}
                        className="text-[9px] uppercase font-bold text-on-surface-variant hover:text-white border-b border-outline-variant/50 pb-0.5"
                      >
                        Clear Logs
                      </button>
                    </div>
                  </div>

                  {/* Stats Card */}
                  <div className="bg-surface-container-high p-4 rounded-lg border border-outline-variant/10 space-y-3">
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">insights</span>
                      Migration Summary
                    </h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-xs text-secondary">check_circle</span>
                          <span className="text-on-surface-variant">Ready:</span>
                        </div>
                        <span className="text-secondary font-mono font-bold">{completedCount}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-xs text-[#F63A22]">error</span>
                          <span className="text-on-surface-variant">Need Review:</span>
                        </div>
                        <span className="text-[#F63A22] font-mono font-bold">{report.summaryCounts?.warnings || 0}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-xs text-[#ffb4a7]">edit_note</span>
                          <span className="text-on-surface-variant">Action Items:</span>
                        </div>
                        <span className="text-[#ffb4a7] font-mono font-bold">{report.summaryCounts?.manualActions || 0}</span>
                      </div>
                      {(report.summaryCounts?.highRisk || 0) > 0 && (
                        <div className="flex justify-between items-center text-xs pt-2 border-t border-outline-variant/20">
                          <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-xs text-error">warning</span>
                            <span className="text-error font-bold">High Risk:</span>
                          </div>
                          <span className="text-error font-mono font-bold">{report.summaryCounts.highRisk}</span>
                        </div>
                      )}
                    </div>
                    <div className="pt-3 border-t border-outline-variant/20">
                      <p className="text-[9px] text-on-surface-variant leading-relaxed">
                        {completedCount === totalCount
                          ? '🎉 All tags are ready! Export the blueprint to proceed with deployment.'
                          : report.summaryCounts?.warnings > 0
                          ? `⚠️ Review ${report.summaryCounts.warnings} tag${report.summaryCounts.warnings !== 1 ? 's' : ''} before deployment.`
                          : '📋 Complete action items to finalize migration.'}
                      </p>
                    </div>
                  </div>

                  {/* Help Card */}
                  <div className="bg-surface-container-high p-4 rounded-lg border border-outline-variant/10 space-y-3">
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">help</span>
                      Understanding Mappings
                    </h4>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="bg-secondary/20 p-1 rounded flex-shrink-0">
                          <span className="material-symbols-outlined text-secondary text-xs">book</span>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-white">Rule-Based</p>
                          <p className="text-[9px] text-on-surface-variant leading-relaxed">
                            Verified mappings from official provider documentation
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="bg-[#9c27b0]/20 p-1 rounded flex-shrink-0">
                          <span className="material-symbols-outlined text-[#ce93d8] text-xs">psychology</span>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-white">AI-Enhanced</p>
                          <p className="text-[9px] text-on-surface-variant leading-relaxed">
                            AI researched current docs when no rule was found
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="pt-3 border-t border-outline-variant/20">
                      <a className="inline-flex items-center gap-1 text-[10px] text-primary font-bold hover:underline" href="#">
                        Read Migration Guide
                        <span className="material-symbols-outlined text-xs">arrow_forward</span>
                      </a>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
            </>
          )}
        </div>

        {/* Fixed Action Bar */}
        {report && (
          <div className="fixed bottom-0 left-0 w-full bg-surface-container-lowest/90 backdrop-blur-md border-t border-outline-variant/10 z-50">
            <div className="max-w-[1920px] mx-auto px-8 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-6 w-full md:w-auto">
                <div className="space-y-1 flex-grow">
                  <div className="flex justify-between text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-widest mb-1">
                    <span>Migration Progress</span>
                    <span>{deploymentResolvedCount} of {totalCount} tags</span>
                  </div>
                  <div className="w-full md:w-64 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                    <div
                      className="h-full bg-secondary shadow-[0_0_8px_rgba(95,222,143,0.5)] transition-all duration-500"
                      style={{ width: `${deploymentProgressPercent}%` }}
                    ></div>
                  </div>
                </div>
                {totalCount > 0 && (
                  <div className="hidden sm:block text-[11px] font-mono text-on-surface-variant bg-surface-container px-3 py-1.5 rounded">
                    CONFIDENCE:{' '}
                    <span className="text-white">{deploymentConfidenceScore.toFixed(1)}/10</span>
                  </div>
                )}
              </div>
              <div className="flex gap-4 w-full md:w-auto">
                <button
                  onClick={() => addLog('Exporting migration blueprint...')}
                  className="flex-1 md:flex-none border border-outline-variant/30 px-6 py-3 rounded-xl text-sm font-bold text-white hover:bg-white/5 transition-all"
                >
                  Export Report
                </button>
                <button
                  onClick={() => addLog('Blueprint ready for deployment')}
                  className="flex-1 md:flex-none bg-primary px-8 py-3 rounded-xl text-sm font-bold text-on-primary shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  View Deployment Guide
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </ProtectedRoute>
  );
}
