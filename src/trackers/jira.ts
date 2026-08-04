import type { EscalateAction, RunResult, Snapshot, Ticket, TrackerAdapter, TransitionAction } from '../types.js';

export interface JiraTrackerOptions {
  root?: string;
  options?: {
    host?: string;
    email?: string;
    apiTokenEnv?: string;
    projectKey?: string;
    jql?: string;
    customFields?: {
      stage?: string;
      evidence?: string;
      revision?: string;
    };
  };
}

export function formatJiraExecutionHeader(result: RunResult): string {
  const exec = result.execution;
  const usage = result.usage;
  const details: string[] = [];

  if (exec?.model) details.push(`*Model:* \`${exec.model}\``);
  if (exec?.profile) details.push(`*Profile:* \`${exec.profile}\``);
  if (exec?.effort) details.push(`*Effort:* \`${exec.effort}\``);
  if (exec?.route) details.push(`*Route:* \`${exec.route}\``);
  if (exec?.durationMs) {
    const totalSec = Math.round(exec.durationMs / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    details.push(`*Duration:* ${mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}`);
  }

  if (usage?.inputTokens && usage?.outputTokens) {
    const total = usage.inputTokens + usage.outputTokens;
    details.push(`*Tokens:* ${total.toLocaleString()}`);
  }

  if (details.length === 0) return '';
  return `🤖 ${details.join(' | ')}`;
}

export function createJiraTracker({ options = {} }: JiraTrackerOptions = {}): TrackerAdapter {
  const host = options.host || process.env.JIRA_HOST;
  const email = options.email || process.env.JIRA_EMAIL;
  const tokenEnv = options.apiTokenEnv ?? 'JIRA_API_TOKEN';
  const apiToken = process.env[tokenEnv];
  const projectKey = options.projectKey || process.env.JIRA_PROJECT_KEY || 'SDLC';

  async function jiraFetch(path: string, opts: { method?: string; body?: any } = {}): Promise<any> {
    if (!host || !email || !apiToken) {
      throw new Error(`Jira credentials missing. Require host, email, and ${tokenEnv}.`);
    }

    const url = `${host.replace(/\/$/, '')}${path}`;
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');

    const headers: Record<string, string> = {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira API HTTP ${res.status}: ${text}`);
    }

    if (res.status === 204) return null;
    return res.json();
  }

  return {
    async read(): Promise<Snapshot> {
      if (!host || !email || !apiToken) {
        return { revision: '0', tickets: [] };
      }

      const jql = options.jql || `project = "${projectKey}" ORDER BY updated DESC`;
      const data = await jiraFetch(`/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=100`);

      const tickets: Ticket[] = (data.issues || []).map((issue: any) => {
        const stageField = options.customFields?.stage
          ? issue.fields[options.customFields.stage]
          : issue.fields.status?.name?.toLowerCase().replace(/\s+/g, '-');

        const labels: string[] = issue.fields.labels || [];
        const conditions = labels.filter((l) => l.startsWith('cond:')).map((l) => l.slice(5));
        const evidence = labels.filter((l) => l.startsWith('ev:')).map((l) => l.slice(3));

        return {
          id: issue.key,
          stage: stageField || 'triage',
          conditions,
          evidence,
          revision: issue.fields.updated || '1',
          priority: issue.fields.priority?.id ? parseInt(issue.fields.priority.id, 10) : undefined,
          context: issue.fields.summary || '',
        };
      });

      return {
        revision: String(Date.now()),
        tickets,
      };
    },

    async transition(action: TransitionAction): Promise<void> {
      if (!host || !email || !apiToken) return;

      const transitionsData = await jiraFetch(`/rest/api/3/issue/${action.ticket}/transitions`);
      const transitions: Array<{ id: string; name: string }> = transitionsData.transitions || [];

      const target = transitions.find(
        (t) => t.name.toLowerCase().replace(/\s+/g, '-') === action.to.toLowerCase() || t.name.toLowerCase() === action.to.toLowerCase()
      );

      if (target) {
        await jiraFetch(`/rest/api/3/issue/${action.ticket}/transitions`, {
          method: 'POST',
          body: { transition: { id: target.id } },
        });
      }
    },

    async publish(result: RunResult): Promise<void> {
      if (!host || !email || !apiToken) return;

      const header = formatJiraExecutionHeader(result);
      const commentText = [
        header,
        `*Outcome:* ${result.outcome}`,
        `*Summary:* ${result.summary}`,
        result.evidence?.length ? `*Evidence:* ${result.evidence.join(', ')}` : '',
        `<!-- agentic-sdlc:result ${JSON.stringify(result)} -->`,
      ]
        .filter(Boolean)
        .join('\n\n');

      await jiraFetch(`/rest/api/3/issue/${result.ticket}/comment`, {
        method: 'POST',
        body: {
          body: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: commentText }],
              },
            ],
          },
        },
      });
    },

    async escalate(action: EscalateAction): Promise<void> {
      if (!host || !email || !apiToken) return;

      await jiraFetch(`/rest/api/3/issue/${action.ticket}/comment`, {
        method: 'POST',
        body: {
          body: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: `🚨 *Escalation:* ${action.reason}` }],
              },
            ],
          },
        },
      });
    },
  };
}
