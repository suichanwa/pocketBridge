export interface CompactorOptions {
  workspaceDir?: string;
  systemInstruction?: string;
  maxWorkingTurns?: number;
}

export interface ContentPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  functionCall?: {
    name: string;
    args?: Record<string, any>;
  };
  functionResponse?: {
    name: string;
    response?: Record<string, any>;
  };
}

export interface Content {
  role: 'user' | 'model';
  parts: ContentPart[];
}

/**
 * Extracts a concise summary from git status / diff output.
 */
function squashGitOutput(outputStr: string): string {
  const modified: string[] = [];
  const untracked: string[] = [];
  const staged: string[] = [];

  const lines = outputStr.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('modified:')) {
      const file = trimmed.replace('modified:', '').trim();
      if (!modified.includes(file)) modified.push(file);
    } else if (trimmed.startsWith('new file:')) {
      const file = trimmed.replace('new file:', '').trim();
      if (!staged.includes(file)) staged.push(file);
    } else if (trimmed.startsWith('deleted:')) {
      const file = trimmed.replace('deleted:', '').trim();
      if (!modified.includes(file)) modified.push(`deleted ${file}`);
    } else if (/^\s*([MADRCU?!]{1,2})\s+(\S+)/.test(line)) {
      const match = line.match(/^\s*([MADRCU?!]{1,2})\s+(\S+)/);
      if (match) {
        const flag = match[1];
        const file = match[2];
        if (flag === '??') {
          if (!untracked.includes(file)) untracked.push(file);
        } else {
          if (!modified.includes(file)) modified.push(file);
        }
      }
    }
  }

  if (outputStr.includes('Untracked files:')) {
    const section = outputStr.split('Untracked files:')[1]?.split('\n\n')[0] || '';
    const uLines = section
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('(') && !l.startsWith('nothing'));
    for (const u of uLines) {
      if (!untracked.includes(u)) untracked.push(u);
    }
  }

  const parts: string[] = [];
  if (staged.length > 0) parts.push(`staged: ${staged.join(', ')}`);
  if (modified.length > 0) parts.push(`modified: ${modified.join(', ')}`);
  if (untracked.length > 0) parts.push(`untracked: ${untracked.join(', ')}`);

  if (parts.length > 0) {
    return parts.join(' | ');
  }

  if (outputStr.includes('working tree clean') || outputStr.includes('nothing to commit')) {
    return 'working tree clean';
  }

  if (outputStr.includes('diff --git')) {
    const diffFiles = [...outputStr.matchAll(/diff --git a\/(\S+) b\/\S+/g)].map((m) => m[1]);
    if (diffFiles.length > 0) {
      return `diff modified: ${Array.from(new Set(diffFiles)).join(', ')}`;
    }
  }

  const clean = outputStr.replace(/\s+/g, ' ').trim();
  return clean.length > 200 ? `${clean.slice(0, 200)}...` : clean;
}

/**
 * Truncates shell output, keeping exit code and error lines.
 */
function squashShellOutput(cmd: string, outputStr: string, exitCode?: number): string {
  const code = exitCode !== undefined ? exitCode : 0;

  if (cmd.startsWith('git ') || cmd.includes(' git ')) {
    const gitSummary = squashGitOutput(outputStr);
    return `exit ${code} | git: ${gitSummary}`;
  }

  const clean = outputStr.trim();
  if (clean.length <= 250) {
    return `exit ${code} | ${clean.replace(/\n+/g, ' ')}`;
  }

  const lines = clean
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const errorLines = lines.filter((l) =>
    /\b(error|failed|fatal|exception|cannot|err:|denied|not found)\b/i.test(l)
  );

  if (errorLines.length > 0) {
    const topErrors = errorLines.slice(0, 3).join('; ');
    const truncatedErrors = topErrors.length > 250 ? `${topErrors.slice(0, 250)}...` : topErrors;
    return `exit ${code} | errors: ${truncatedErrors}`;
  }

  const head = clean.slice(0, 120).replace(/\n+/g, ' ').trim();
  const tail = clean.slice(-80).replace(/\n+/g, ' ').trim();
  return `exit ${code} | ${head} ... ${tail}`;
}

/**
 * Retains top 2 titles and links from search results.
 */
function squashSearchResults(results: any): string {
  if (Array.isArray(results)) {
    if (results.length === 0) return 'No results found.';
    const top = results.slice(0, 2).map((r, i) => {
      const title = r.title || 'Untitled';
      const link = r.link || r.url || '';
      return `${i + 1}. "${title}" (${link})`;
    });
    return `Found ${results.length} results. Top: ${top.join('; ')}`;
  }
  if (typeof results === 'object' && results !== null && Array.isArray(results.results)) {
    return squashSearchResults(results.results);
  }
  const str = typeof results === 'string' ? results : JSON.stringify(results);
  return str.length > 200 ? `${str.slice(0, 200)}...` : str;
}

/**
 * Formats tool results into concise single-line semantic facts.
 */
function squashGenericResult(toolName: string, args: any, result: any): string {
  if (!result) return 'Completed';

  if (toolName === 'execute_command') {
    const cmd = args?.command || (typeof result === 'object' ? result?.command : '') || '';
    const output =
      typeof result === 'object' ? (result.output ?? JSON.stringify(result)) : String(result);
    const exitCode = typeof result === 'object' ? result.exitCode : undefined;
    return squashShellOutput(cmd, output, exitCode);
  }

  if (toolName === 'search_web') {
    return squashSearchResults(result?.results ?? result);
  }

  if (toolName === 'take_screenshot' || toolName === 'take_camera_photo') {
    const url = result?.url || result?.publicUrl || result?.filename;
    return url ? `${toolName} saved: ${url}` : `${toolName} executed successfully`;
  }

  if (toolName === 'run_agy_task') {
    const exit = result?.exitCode ?? (result?.status === 'success' ? 0 : 1);
    const model = result?.model || 'agy';
    const output = String(result?.output || result?.result || '');
    const clean = output.replace(/\n+/g, ' ').trim();
    const shortOut = clean.length > 180 ? `${clean.slice(0, 180)}...` : clean;
    return `AGY [${model}] exit ${exit}: ${shortOut}`;
  }

  if (toolName === 'send_telegram_message') {
    if (result?.success) {
      return `Telegram message sent to ${result.recipient || args?.recipient || 'me'}`;
    }
    return `Telegram send failed: ${result?.error || 'Unknown error'}`;
  }

  if (
    toolName.startsWith('mouse_') ||
    toolName === 'type_text' ||
    toolName === 'press_key' ||
    toolName === 'hotkey' ||
    toolName === 'open_app'
  ) {
    const briefArgs = JSON.stringify(args || {});
    return `${toolName} completed: ${briefArgs.length > 100 ? `${briefArgs.slice(0, 100)}...` : briefArgs}`;
  }

  const str = typeof result === 'string' ? result : JSON.stringify(result);
  return str.length > 200 ? `${str.slice(0, 200)}...` : str;
}

/**
 * Fallback safe truncation if any projection error occurs.
 */
function fallbackSafeTruncation(contents: Content[]): Content[] {
  return contents.map((item) => ({
    role: item.role,
    parts: item.parts.map((p) => {
      if (p.text && p.text.length > 2000) {
        return { text: `${p.text.slice(0, 1500)}\n...[truncated]` };
      }
      return { ...p };
    }),
  }));
}

export class ContextCompactor {
  /**
   * Projects an uncompressed conversational contents array into a 3-tier
   * token-optimized representation for outbound Gemini API calls.
   *
   * Invariants:
   * 1. Never mutates input contents or persisted session JSON.
   * 2. Preserves strict user-model alternation.
   * 3. Completely rolls up Tier 2 tool calls into plain text to eliminate Gemini 400 errors.
   * 4. Retains full fidelity and active images for Tier 3 (last 3 turns).
   * 5. Ephemeral vision retention: strips base64 for images older than the immediate preceding turn.
   */
  public static project(rawContents: any[], options: CompactorOptions = {}): Content[] {
    if (!Array.isArray(rawContents) || rawContents.length === 0) {
      return [];
    }

    try {
      // 1. Normalize input into uniform Content[] structure
      const contents: Content[] = rawContents.map((item) => {
        if (item.parts && Array.isArray(item.parts)) {
          return {
            role: item.role === 'assistant' ? 'model' : item.role === 'model' ? 'model' : 'user',
            parts: item.parts.map((p: any) => ({ ...p })),
          };
        }
        // If raw ChatMessage-like object was passed
        const role = item.role === 'assistant' ? 'model' : 'user';
        const text = typeof item.content === 'string' ? item.content : '';
        return {
          role,
          parts: [{ text }],
        };
      });

      const maxWorkingTurns = options.maxWorkingTurns ?? 3;

      // 2. Identify user-initiated turn starting boundaries
      const userTurnIndices: number[] = [];
      for (let i = 0; i < contents.length; i++) {
        const item = contents[i];
        if (item.role === 'user') {
          const hasPromptPart = item.parts.some(
            (p) => p.text !== undefined || p.inlineData !== undefined
          );
          const isPureToolResponse = item.parts.every((p) => p.functionResponse !== undefined);
          if (hasPromptPart || !isPureToolResponse || userTurnIndices.length === 0) {
            userTurnIndices.push(i);
          }
        }
      }

      // If 3 or fewer turns total, all items fit in Working Memory (Tier 3)
      let tier3StartIndex = 0;
      if (userTurnIndices.length > maxWorkingTurns) {
        tier3StartIndex = userTurnIndices[userTurnIndices.length - maxWorkingTurns];
      }

      const projected: Content[] = [];

      // Find the index of the immediate preceding user turn for Ephemeral Vision Retention
      const lastUserTurnIndex =
        userTurnIndices.length > 0 ? userTurnIndices[userTurnIndices.length - 1] : contents.length - 1;
      const immediatePrecedingUserTurnIndex =
        userTurnIndices.length > 1 ? userTurnIndices[userTurnIndices.length - 2] : 0;

      for (let i = 0; i < contents.length; i++) {
        const item = contents[i];
        const isTier1 = i === 0;
        const isTier3 = i >= tier3StartIndex;

        if (isTier1) {
          // Tier 1 (Immutable Anchor): Root user prompt / goal
          const clonedParts = item.parts.map((p) => {
            if (p.inlineData && i < immediatePrecedingUserTurnIndex) {
              return { text: '[Attached image: inspected in root turn]' };
            }
            return { ...p };
          });
          projected.push({
            role: item.role,
            parts: clonedParts,
          });
        } else if (isTier3) {
          // Tier 3 (Working Memory - last 3 turns): Full fidelity
          const clonedParts = item.parts.map((p) => {
            // Apply Ephemeral Vision Retention:
            // Strip base64 image data only if older than the immediate preceding user turn
            if (p.inlineData && i < immediatePrecedingUserTurnIndex) {
              return { text: '[Attached image: inspected in earlier turn]' };
            }
            return { ...p };
          });
          projected.push({
            role: item.role,
            parts: clonedParts,
          });
        } else {
          // Tier 2 (Compacted Semantic History - turns older than 3 turns)
          // Roll up functionCall and functionResponse turns into compact conversational text
          const compactedParts: ContentPart[] = [];

          for (const part of item.parts) {
            if (part.functionCall) {
              const call = part.functionCall;
              const argStr = JSON.stringify(call.args || {});
              const shortArgs = argStr.length > 120 ? `${argStr.slice(0, 120)}...` : argStr;
              compactedParts.push({
                text: `[Action: ${call.name}(${shortArgs})]`,
              });
            } else if (part.functionResponse) {
              const resp = part.functionResponse;
              const output = resp.response?.output ?? resp.response;
              const squashed = squashGenericResult(resp.name, resp.response, output);
              compactedParts.push({
                text: `[Result of ${resp.name}: ${squashed}]`,
              });
            } else if (part.inlineData) {
              compactedParts.push({
                text: '[Attached image: inspected in earlier turn]',
              });
            } else if (part.text) {
              const text = part.text.trim();
              if (text.length > 300) {
                compactedParts.push({
                  text: `${text.slice(0, 250)}... [history summarized]`,
                });
              } else {
                compactedParts.push({ text });
              }
            }
          }

          if (compactedParts.length > 0) {
            projected.push({
              role: item.role,
              parts: compactedParts,
            });
          }
        }
      }

      // 3. Strict alternation normalization pass:
      // Merge adjacent turns with identical roles to strictly prevent Gemini HTTP 400 errors
      const normalized: Content[] = [];
      for (const item of projected) {
        if (!item.parts || item.parts.length === 0) continue;

        if (normalized.length === 0) {
          normalized.push({
            role: item.role,
            parts: [...item.parts],
          });
          continue;
        }

        const prev = normalized[normalized.length - 1];
        if (prev.role === item.role) {
          // Check if merging text parts can be consolidated
          const canCombineText =
            prev.parts.length > 0 &&
            prev.parts[prev.parts.length - 1].text !== undefined &&
            item.parts.length > 0 &&
            item.parts[0].text !== undefined;

          if (canCombineText) {
            prev.parts[prev.parts.length - 1].text += `\n${item.parts[0].text}`;
            prev.parts.push(...item.parts.slice(1));
          } else {
            prev.parts.push(...item.parts);
          }
        } else {
          normalized.push({
            role: item.role,
            parts: [...item.parts],
          });
        }
      }

      return normalized;
    } catch (err: any) {
      console.warn('ContextCompactor error, falling back to safe truncation:', err?.message || err);
      return fallbackSafeTruncation(rawContents);
    }
  }
}
