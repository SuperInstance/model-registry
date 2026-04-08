export interface Env {
  MODEL_REGISTRY: KVNamespace;
}

interface ModelRegistration {
  id: string;
  name: string;
  provider: string;
  endpoint: string;
  apiKey?: string;
  modelType: string;
  contextWindow: number;
  maxTokens: number;
  costPerInputToken: number;
  costPerOutputToken: number;
  capabilities: string[];
  registeredAt: number;
  lastHealthCheck: number;
  healthStatus: 'healthy' | 'unhealthy' | 'unknown';
  avgLatency: number;
  totalRequests: number;
  byokEnabled: boolean;
  byokKeyId?: string;
}

interface HealthCheckResponse {
  modelId: string;
  status: 'healthy' | 'unhealthy';
  latency: number;
  timestamp: number;
  message?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const htmlHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com;",
};

const jsonHeaders = {
  'Content-Type': 'application/json',
  ...corsHeaders,
};

const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const performHealthCheck = async (model: ModelRegistration): Promise<HealthCheckResponse> => {
  const startTime = Date.now();
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (model.apiKey) {
      headers['Authorization'] = `Bearer ${model.apiKey}`;
    }

    const healthPayload = JSON.stringify({
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(model.endpoint, {
      method: 'POST',
      headers,
      body: healthPayload,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const latency = Date.now() - startTime;
    const isHealthy = response.ok && response.status >= 200 && response.status < 300;

    return {
      modelId: model.id,
      status: isHealthy ? 'healthy' : 'unhealthy',
      latency,
      timestamp: Date.now(),
      message: isHealthy ? 'Health check passed' : `Health check failed with status: ${response.status}`,
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    return {
      modelId: model.id,
      status: 'unhealthy',
      latency,
      timestamp: Date.now(),
      message: error instanceof Error ? error.message : 'Unknown error during health check',
    };
  }
};

const updateModelHealth = async (env: Env, modelId: string, healthResponse: HealthCheckResponse): Promise<void> => {
  const modelKey = `model:${modelId}`;
  const modelData = await env.MODEL_REGISTRY.get(modelKey, 'json') as ModelRegistration;

  if (modelData) {
    const totalRequests = modelData.totalRequests + 1;
    const newAvgLatency = ((modelData.avgLatency * modelData.totalRequests) + healthResponse.latency) / totalRequests;

    const updatedModel: ModelRegistration = {
      ...modelData,
      lastHealthCheck: Date.now(),
      healthStatus: healthResponse.status,
      avgLatency: newAvgLatency,
      totalRequests,
    };

    await env.MODEL_REGISTRY.put(modelKey, JSON.stringify(updatedModel));
  }
};

const renderDashboard = (models: ModelRegistration[]): string => {
  const healthyCount = models.filter(m => m.healthStatus === 'healthy').length;
  const totalCost = models.reduce((sum, model) => sum + (model.costPerInputToken + model.costPerOutputToken) * 1000, 0);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Universal Model Registry</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --dark-bg: #0a0a0f;
            --dark-surface: #11111f;
            --dark-border: #22223f;
            --accent: #7c3aed;
            --accent-hover: #6d28d9;
            --text-primary: #f8fafc;
            --text-secondary: #cbd5e1;
            --success: #10b981;
            --warning: #f59e0b;
            --danger: #ef4444;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', sans-serif;
            background: var(--dark-bg);
            color: var(--text-primary);
            line-height: 1.6;
            min-height: 100vh;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem 1rem;
        }
        
        header {
            text-align: center;
            margin-bottom: 3rem;
            padding-bottom: 2rem;
            border-bottom: 1px solid var(--dark-border);
        }
        
        h1 {
            font-size: 2.5rem;
            font-weight: 700;
            background: linear-gradient(135deg, var(--accent), #a78bfa);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 0.5rem;
        }
        
        .subtitle {
            color: var(--text-secondary);
            font-size: 1.1rem;
            font-weight: 400;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1.5rem;
            margin-bottom: 3rem;
        }
        
        .stat-card {
            background: var(--dark-surface);
            border-radius: 12px;
            padding: 1.5rem;
            border: 1px solid var(--dark-border);
            transition: transform 0.2s, border-color 0.2s;
        }
        
        .stat-card:hover {
            transform: translateY(-2px);
            border-color: var(--accent);
        }
        
        .stat-value {
            font-size: 2rem;
            font-weight: 700;
            color: var(--accent);
            margin-bottom: 0.5rem;
        }
        
        .stat-label {
            color: var(--text-secondary);
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        
        .models-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 1.5rem;
            margin-bottom: 3rem;
        }
        
        .model-card {
            background: var(--dark-surface);
            border-radius: 12px;
            padding: 1.5rem;
            border: 1px solid var(--dark-border);
            transition: all 0.2s;
        }
        
        .model-card:hover {
            border-color: var(--accent);
            box-shadow: 0 4px 20px rgba(124, 58, 237, 0.1);
        }
        
        .model-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 1rem;
        }
        
        .model-name {
            font-size: 1.25rem;
            font-weight: 600;
            color: var(--text-primary);
        }
        
        .model-provider {
            display: inline-block;
            background: rgba(124, 58, 237, 0.1);
            color: var(--accent);
            padding: 0.25rem 0.75rem;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 500;
        }
        
        .model-type {
            color: var(--text-secondary);
            font-size: 0.9rem;
            margin-bottom: 1rem;
        }
        
        .model-stats {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 1rem;
            margin-bottom: 1rem;
        }
        
        .stat {
            text-align: center;
        }
        
        .stat .value {
            font-size: 1.1rem;
            font-weight: 600;
            color: var(--text-primary);
        }
        
        .stat .label {
            font-size: 0.8rem;
            color: var(--text-secondary);
            margin-top: 0.25rem;
        }
        
        .health-status {
            display: inline-flex;
            align-items: center;
            padding: 0.25rem 0.75rem;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 500;
        }
        
        .health-healthy {
            background: rgba(16, 185, 129, 0.1);
            color: var(--success);
        }
        
        .health-unhealthy {
            background: rgba(239, 68, 68, 0.1);
            color: var(--danger);
        }
        
        .health-unknown {
            background: rgba(245, 158, 11, 0.1);
            color: var(--warning);
        }
        
        .byok-badge {
            display: inline-block;
            background: rgba(139, 92, 246, 0.1);
            color: #8b5cf6;
            padding: 0.25rem 0.75rem;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 500;
            margin-top: 0.5rem;
        }
        
        footer {
            text-align: center;
            padding-top: 2rem;
            border-top: 1px solid var(--dark-border);
            color: var(--text-secondary);
            font-size: 0.9rem;
        }
        
        .fleet-footer {
            margin-top: 1rem;
            font-size: 0.8rem;
            opacity: 0.7;
        }
        
        @media (max-width: 768px) {
            .container {
                padding: 1rem;
            }
            
            h1 {
                font-size: 2rem;
            }
            
            .models-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>Universal Model Registry</h1>
            <p class="subtitle">Provider-agnostic registration • Auto-discovery • Health checks • Latency tracking • Cost per token • BYOK v2</p>
        </header>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">${models.length}</div>
                <div class="stat-label">Total Models</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${healthyCount}</div>
                <div class="stat-label">Healthy Models</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">$${totalCost.toFixed(4)}</div>
                <div class="stat-label">Cost per 1K tokens</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${models.filter(m => m.byokEnabled).length}</div>
                <div class="stat-label">BYOK Enabled</div>
            </div>
        </div>
        
        <div class="models-grid">
            ${models.map(model => `
                <div class="model-card">
                    <div class="model-header">
                        <div>
                            <div class="model-name">${model.name}</div>
                            <div class="model-provider">${model.provider}</div>
                        </div>
                        <div class="health-status health-${model.healthStatus}">
                            ${model.healthStatus}
                        </div>
                    </div>
                    <div class="model-type">${model.modelType} • Context: ${model.contextWindow.toLocaleString()} tokens</div>
                    
                    <div class="model-stats">
                        <div class="stat">
                            <div class="value">${model.avgLatency.toFixed(0)}ms</div>
                            <div class="label">Avg Latency</div>
                        </div>
                        <div class="stat">
                            <div class="value">$${(model.costPerInputToken * 1000).toFixed(6)}</div>
                            <div class="label">Cost/1K input</div>
                        </div>
                        <div class="stat">
                            <div class="value">${model.totalRequests}</div>
                            <div class="label">Total Requests</div>
                        </div>
                        <div class="stat">
                            <div class="value">$${(model.costPerOutputToken * 1000).toFixed(6)}</div>
                            <div class="label">Cost/1K output</div>
                        </div>
                    </div>
                    
                    ${model.byokEnabled ? `<div class="byok-badge">BYOK v2 Enabled</div>` : ''}
                    
                    <div style="margin-top: 1rem; font-size: 0.8rem; color: var(--text-secondary);">
                        Registered: ${new Date(model.registeredAt).toLocaleDateString()}
                    </div>
                </div>
            `).join('')}
        </div>
        
        <footer>
            <p>Universal Model Registry • Provider-agnostic LLM management</p>
            <p class="fleet-footer">Model Fleet Management System v2.0 • Secure • Scalable • Observable</p>
        </footer>
    </div>
</body>
</html>
  `;
};
const sh = {"Content-Security-Policy":"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; frame-ancestors 'none'","X-Frame-Options":"DENY"};
export default { async fetch(r: Request) { const u = new URL(r.url); if (u.pathname==='/health') return new Response(JSON.stringify({status:'ok'}),{headers:{'Content-Type':'application/json',...sh}}); return new Response(html,{headers:{'Content-Type':'text/html;charset=UTF-8',...sh}}); }};