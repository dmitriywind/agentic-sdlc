import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';

function gh(args, { cwd, tokenEnv }, input) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (tokenEnv) {
      const token = process.env[tokenEnv];
      if (!token) {
        reject(new Error(`GitHub token environment variable '${tokenEnv}' is not set`));
        return;
      }
      env.GH_TOKEN = token;
      if (tokenEnv !== 'GH_TOKEN') delete env[tokenEnv];
    }
    const child = execFile('gh', args, {
      cwd,
      env,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        const detail = (stderr || error.message).trim();
        if (/requires one of the following scopes.*read:project|token has not been granted.*read:project/is.test(detail)) {
          reject(new Error(
            'GitHub Projects authorization is missing. Run: gh auth refresh -h github.com -s project',
          ));
        } else if (/Resource not accessible by personal access token/i.test(detail)) {
          reject(new Error(
            'The configured PAT cannot access this Project. Fine-grained PATs do not support user-owned Projects; use GitHub CLI OAuth with the project scope or a compatible GitHub App.',
          ));
        } else {
          reject(new Error(detail));
        }
      }
      else resolve(stdout ? JSON.parse(stdout) : null);
    });
    if (input !== undefined) child.stdin.end(input);
  });
}

function graphql(query, variables, options) {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [name, value] of Object.entries(variables)) {
    args.push(Number.isInteger(value) ? '-F' : '-f', `${name}=${value}`);
  }
  return gh(args, options).then((body) => {
    if (body.errors?.length) throw new Error(body.errors.map((error) => error.message).join('; '));
    return body.data;
  });
}

function marker(prefix, value) {
  return `<!-- agentic-sdlc:${prefix} ${JSON.stringify(value)} -->`;
}

function parseMarkers(comments, prefix) {
  const expression = new RegExp(`<!--\\s*agentic-sdlc:${prefix}\\s+(.+?)\\s*-->`, 'g');
  return comments.flatMap((comment) => [...comment.body.matchAll(expression)].map((match) => {
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  })).filter(Boolean);
}

function pendingHeading(body, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const section = body.match(new RegExp(`^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s|$)`, 'mi'))?.[1] ?? '';
  return section.split(/\r?\n/).some((line) => line.trim() && !/^<!--/.test(line.trim()));
}

function issueRevision(issue, pull) {
  if (pull?.headRefOid) return pull.headRefOid;
  return createHash('sha256')
    .update(issue.body ?? '')
    .digest('hex')
    .slice(0, 16);
}

function estimateModelCost(model, usage, summary) {
  if (typeof usage?.cost === 'number') return usage.cost;
  
  let inputTokens = usage?.inputTokens;
  let outputTokens = usage?.outputTokens;
  let totalTokens = usage?.totalTokens;

  if (!totalTokens && summary) {
    const match = summary.match(/(\d[\d,]*)\s+tokens/i);
    if (match) totalTokens = parseInt(match[1].replace(/,/g, ''), 10);
  }

  if (inputTokens === undefined && outputTokens === undefined && !totalTokens) return undefined;

  let rates = [2.5, 10.0];
  if (!model) rates = [2.5, 10.0];
  else if (/gemini-3\.6-flash/i.test(model)) rates = [0.5, 3.0];
  else if (/claude-haiku/i.test(model)) rates = [1.0, 5.0];
  else if (/claude-sonnet/i.test(model)) rates = [3.0, 15.0];
  else if (/claude-opus/i.test(model)) rates = [15.0, 75.0];
  else if (/gpt-5\.6-sol|gpt-5\.6-terra/i.test(model)) rates = [2.5, 10.0];
  else if (/qwen/i.test(model)) rates = [0, 0];

  if (inputTokens !== undefined || outputTokens !== undefined) {
    const inCost = ((inputTokens ?? 0) * rates[0]) / 1000000;
    const outCost = ((outputTokens ?? 0) * rates[1]) / 1000000;
    return inCost + outCost;
  }

  const blendedRate = rates[0] * 0.8 + rates[1] * 0.2;
  return (totalTokens * blendedRate) / 1000000;
}

export function formatExecutionHeader(result) {
  const exec = result.execution;
  const usage = result.usage;
  const details = [];

  if (exec?.model) details.push(`**Model:** \`${exec.model}\``);
  if (exec?.profile) details.push(`**Profile:** \`${exec.profile}\``);
  if (exec?.effort) details.push(`**Effort:** \`${exec.effort}\``);
  if (exec?.route) details.push(`**Route:** \`${exec.route}\``);
  if (exec?.durationMs) {
    const totalSec = Math.round(exec.durationMs / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    details.push(`**Duration:** ${mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}`);
  }
  if (exec?.goalContinuations) details.push(`**Continuations:** ${exec.goalContinuations}`);

  let totalTokens = usage?.totalTokens ?? (usage?.inputTokens && usage?.outputTokens ? usage.inputTokens + usage.outputTokens : undefined);
  if (!totalTokens && result.summary) {
    const match = result.summary.match(/(\d[\d,]*)\s+tokens/i);
    if (match) totalTokens = parseInt(match[1].replace(/,/g, ''), 10);
  }

  const cost = estimateModelCost(exec?.model, usage, result.summary);

  if (totalTokens !== undefined) {
    let usageText = `${totalTokens.toLocaleString()} tokens`;
    if (typeof cost === 'number') {
      usageText += ` (est. $${cost < 0.01 && cost > 0 ? '<0.01' : cost.toFixed(2)})`;
    }
    details.push(`**Usage:** ${usageText}`);
  } else if (typeof cost === 'number') {
    details.push(`**Cost:** est. $${cost < 0.01 && cost > 0 ? '<0.01' : cost.toFixed(2)}`);
  }

  if (details.length === 0) return '';
  return `> 🤖 ${details.join(' | ')}`;
}

export function createTracker({ root = process.cwd(), options = {} } = {}) {
  const owner = options.owner;
  const projectNumber = Number(options.projectNumber);
  const repository = options.repository;
  const statusField = options.statusField ?? 'Status';
  const ticketPattern = new RegExp(options.ticketPattern ?? '^\\[([^\\]]+)\\]');
  const decisionHeading = options.decisionHeading ?? 'CEO input';
  const commandOptions = { cwd: root, tokenEnv: options.tokenEnv };
  let metadata;
  let latest = new Map();

  async function stagingEvidence() {
    if (!options.stagingWorkflow || !options.stagingBranch || !options.stagingEvidence) return false;
    const [runs, branch] = await Promise.all([
      gh(['api', `repos/${repository}/actions/workflows/${options.stagingWorkflow}/runs?per_page=1&status=completed`],
        commandOptions),
      gh(['api', `repos/${repository}/commits/${options.stagingBranch}`], commandOptions),
    ]);
    const run = runs.workflow_runs?.[0];
    return run?.conclusion === 'success' && run.head_sha === branch.sha;
  }

  async function read() {
    // ponytail: first 100 project items; add cursor pagination when a configured board exceeds it.
    const data = await graphql(`
      query($owner: String!, $projectNumber: Int!, $statusField: String!) {
        user(login: $owner) {
          projectV2(number: $projectNumber) {
            id
            field(name: $statusField) {
              ... on ProjectV2SingleSelectField {
                id
                options { id name }
              }
            }
            items(first: 100) {
              nodes {
                id
                fieldValues(first: 20) {
                  nodes {
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      name
                      field { ... on ProjectV2FieldCommon { name } }
                    }
                  }
                }
                content {
                  ... on Issue {
                    id number title body state
                    repository { nameWithOwner }
                    assignees(first: 10) { nodes { login } }
                    blockedBy(first: 20) { nodes { state } }
                    comments(last: 100) { nodes { body createdAt } }
                    closedByPullRequestsReferences(last: 10) {
                      nodes {
                        number state isDraft headRefOid mergedAt
                        reviews(last: 20) { nodes { state submittedAt } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `, { owner, projectNumber, statusField }, commandOptions);
    const project = data.user?.projectV2;
    if (!project?.id || !project.field?.id) throw new Error(`GitHub Project ${owner}/${projectNumber} unavailable`);
    metadata = {
      projectId: project.id,
      statusFieldId: project.field.id,
      options: new Map(project.field.options.map((option) => [option.name, option.id])),
    };
    const isStagingLive = await stagingEvidence();
    const tickets = [];
    latest = new Map();

    for (const item of project.items.nodes) {
      const issue = item.content;
      if (!issue || issue.repository?.nameWithOwner !== repository) continue;
      const id = issue.title.match(ticketPattern)?.[1];
      const stage = item.fieldValues.nodes.find((field) => field.field?.name === statusField)?.name;
      const milestone = options.milestoneField
        ? item.fieldValues.nodes.find((field) => field.field?.name === options.milestoneField)?.name
        : undefined;
      if (!id || !stage) continue;
      const pulls = issue.closedByPullRequestsReferences.nodes;
      const pull = pulls.find((candidate) => candidate.state === 'OPEN')
        ?? pulls.find((candidate) => candidate.state === 'MERGED')
        ?? null;
      const revision = issueRevision(issue, pull);
      const results = parseMarkers(issue.comments.nodes, 'result');
      const escalations = parseMarkers(issue.comments.nodes, 'escalation').map((item) => item.reason);
      const evidence = results
        .filter((result) => result.outcome === 'completed'
          && (result.nextRevision ?? result.revision) === revision)
        .flatMap((result) => (typeof result.plan === 'string' && result.plan.trim()
          ? (result.evidence ?? []) : (result.evidence ?? [])
          .filter((evidence) => evidence !== 'plan-ready')));
      const approvedPlan = [...results].reverse().find((result) => (
        result.outcome === 'completed'
        && (result.nextRevision ?? result.revision) === revision
        && result.evidence?.includes('plan-ready')
        && typeof result.plan === 'string'
        && result.plan.trim()
      ))?.plan?.trim();
      if (pull?.state === 'OPEN') evidence.push('change-open');
      if (pull?.state === 'MERGED') evidence.push('change-merged');
      if (pull?.state === 'OPEN' && pull.reviews.nodes.some((review) => review.state === 'CHANGES_REQUESTED')) {
        evidence.push('review-findings');
      }
      if (stage === 'Done' && isStagingLive) evidence.push(options.stagingEvidence);
      const conditions = [];
      if (issue.blockedBy.nodes.some((blocker) => blocker.state === 'OPEN')) conditions.push('waiting:dependency');
      if (issue.assignees.nodes.length || pendingHeading(issue.body ?? '', decisionHeading)
        || results.some((result) => result.outcome === 'needs-human'
          && result.revision === revision)) {
        conditions.push('waiting:decision');
      }
      const attempts = {};
      const retryAt = {};
      for (const result of results.filter((value) => value.outcome === 'failed')) {
        attempts[result.run] = Math.max(attempts[result.run] ?? 0, result.attempt ?? 0);
        if (result.retryAt) retryAt[result.run] = result.retryAt;
      }
      const normalized = {
        id,
        stage,
        conditions: [...new Set(conditions)],
        evidence: [...new Set(evidence)],
        revision,
        attempts,
        retryAt,
        escalations,
        dependencies: issue.blockedBy.nodes.map((_, index) => `dependency-${index + 1}`),
        context: `${issue.title}\n\n${issue.body ?? ''}${approvedPlan ? `\n\n## Current approved implementation plan\n\n${approvedPlan}` : ''}${pull ? `\nPull request: #${pull.number}` : ''}`,
        eligible: !Array.isArray(options.activeMilestones) || options.activeMilestones.includes(milestone),
      };
      latest.set(id, { itemId: item.id, issue: issue.number, comments: issue.comments.nodes, ticket: normalized });
      tickets.push(normalized);
    }
    return { revision: new Date().toISOString(), tickets };
  }

  async function comment(issue, body) {
    return gh([
      'api', '--method', 'POST', `repos/${repository}/issues/${issue}/comments`,
      '--input', '-',
    ], commandOptions, JSON.stringify({ body }));
  }

  return {
    read,
    async transition(action) {
      if (!metadata || !latest.has(action.ticket)) await read();
      const optionId = metadata.options.get(action.to);
      if (!optionId) throw new Error(`GitHub Project has no '${action.to}' status`);
      const item = latest.get(action.ticket);
      await graphql(`
        mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
          updateProjectV2ItemFieldValue(input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: { singleSelectOptionId: $optionId }
          }) { projectV2Item { id } }
        }
      `, {
        projectId: metadata.projectId,
        itemId: item.itemId,
        fieldId: metadata.statusFieldId,
        optionId,
      }, commandOptions);
    },
    async publish(result) {
      await read();
      const item = latest.get(result.ticket);
      if (!item) throw new Error(`Unknown GitHub ticket '${result.ticket}'`);
      const targetRevision = result.nextRevision ?? result.revision;
      if (item.ticket.revision !== targetRevision) {
        const error = new Error(`Stale result for '${result.ticket}'`);
        error.code = 'STALE_RESULT';
        throw error;
      }
      const key = [result.ticket, result.run, result.revision, result.attempt, result.outcome].join(':');
      const duplicate = parseMarkers(item.comments, 'result').some((value) => (
        [value.ticket, value.run, value.revision, value.attempt, value.outcome].join(':') === key
      ));
      if (duplicate) return;
      const plan = typeof result.plan === 'string' && result.plan.trim() ? result.plan.trim() : '';
      const execHeader = formatExecutionHeader(result);
      const summaryLine = result.summary ? `> **Summary:** ${result.summary}` : '';
      const citation = [execHeader, summaryLine].filter(Boolean).join('\n');
      await comment(item.issue, [
        citation || result.summary,
        plan ? `## Implementation plan\n\n${plan}` : '',
        marker('result', result),
      ].filter(Boolean).join('\n\n'));
    },
    async escalate(action) {
      if (!latest.has(action.ticket)) await read();
      const item = latest.get(action.ticket);
      if (item.ticket.escalations.includes(action.reason)) return;
      await comment(item.issue, [
        `Agentic SDLC needs human action: **${action.reason}**.`,
        `The ticket remains in **${item.ticket.stage}** and no further run will start.`,
        '',
        marker('escalation', action),
      ].join('\n'));
    },
  };
}
