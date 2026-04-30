import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { tmpdir } from 'node:os';

export async function generateOneShotText(prompt: string): Promise<string> {
  const q = query({
    prompt,
    options: {
      cwd: tmpdir(),
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      settingSources: [],
      allowedTools: [],
    },
  });
  for await (const msg of q as AsyncGenerator<SDKMessage>) {
    if (msg.type === 'result') {
      const r = msg as { subtype?: string; result?: string; is_error?: boolean };
      if (r.is_error) throw new Error('claude returned error');
      if (r.subtype === 'success' && r.result) return r.result;
    }
  }
  throw new Error('no result from claude');
}
