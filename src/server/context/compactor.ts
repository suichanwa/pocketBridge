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
  if (!result && result !== 0) return 'Completed';

  if (toolName === 'execute_command') {
    const cmd = args?.command || (typeof result === 'object' ? result?.command : '') || '';
    const output =
      typeof result === 'object' && result?.output !== undefined
        ? result.output
        : typeof result === 'string'
        ? result
        : JSON.stringify(result);
    const exitCode = typeof result === 'object' ? result.exitCode : undefined;
    return squashShellOutput(cmd, String(output || ''), exitCode);
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
    const model = result?.model || args?.model || 'gemini-3.8-flash-high';
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

/**
 * Groups a sequence of contents into user-initiated interactions.
 * A new interaction starts when a user turn contains prompt text or images
 * (and is not purely a tool response callback).
 */
function groupIntoInteractions(contents: Content[]): Content[][] {
  const interactions: Content[][] = [];
  let current: Content[] = [];

  for (const item of contents) {
    const isUserPrompt =
      item.role === 'user' &&
      item.parts.some((p) => p.text !== undefined || p.inlineData !== undefined) &&
      !item.parts.every((p) => p.functionResponse !== undefined);

    if (isUserPrompt && current.length > 0) {
      interactions.push(current);
      current = [];
    }
    current.push(item);
  }

  if (current.length > 0) {
    interactions.push(current);
  }

  return interactions;
}

/**
 * Rolls up a Tier 2 interaction into plain conversational text turns:
 * user: requested X -> model: executed Y with result Z
 * Strips raw structural functionCall and functionResponse objects completely.
 */
function compactTier2Interaction(items: Content[]): Content[] {
  if (items.length === 0) return [];

  const userItem = items[0];
  const userParts: ContentPart[] = [];

  for (const p of userItem.parts) {
    if (p.inlineData) {
      userParts.push({ text: '[Attached image: inspected in earlier turn]' });
    } else if (p.text) {
      const trimmed = p.text.trim();
      if (trimmed.length > 300) {
        userParts.push({ text: `${trimmed.slice(0, 250)}... [history summarized]` });
      } else {
        userParts.push({ text: trimmed });
      }
    }
  }

  if (userParts.length === 0) {
    userParts.push({ text: 'User request' });
  }

  const actions: string[] = [];
  const modelTexts: string[] = [];

  const functionCalls: { name: string; args?: any }[] = [];
  const functionResponses: { name: string; response?: any }[] = [];

  for (let i = 1; i < items.length; i++) {
    const item = items[i];
    for (const part of item.parts) {
      if (part.functionCall) {
        functionCalls.push(part.functionCall);
      } else if (part.functionResponse) {
        functionResponses.push(part.functionResponse);
      } else if (part.text && item.role === 'model') {
        const t = part.text.trim();
        if (t) {
          modelTexts.push(t.length > 250 ? `${t.slice(0, 200)}...` : t);
        }
      }
    }
  }

  // Pair functionCalls with matching functionResponses
  for (let i = 0; i < functionCalls.length; i++) {
    const call = functionCalls[i];
    const resp = functionResponses.find((r) => r.name === call.name) || functionResponses[i];
    const argStr = JSON.stringify(call.args || {});
    const shortArgs = argStr.length > 80 ? `${argStr.slice(0, 80)}...` : argStr;
    const squashedRes = squashGenericResult(
      call.name,
      call.args,
      resp?.response?.output ?? resp?.response
    );
    actions.push(`[Action: ${call.name}(${shortArgs}) -> Result: ${squashedRes}]`);
  }

  // Handle any unpaired responses if present
  for (let i = functionCalls.length; i < functionResponses.length; i++) {
    const resp = functionResponses[i];
    const squashedRes = squashGenericResult(resp.name, {}, resp?.response?.output ?? resp?.response);
    actions.push(`[Result of ${resp.name}: ${squashedRes}]`);
  }

  const modelLines = [...actions, ...modelTexts];
  if (modelLines.length === 0) {
    modelLines.push('Completed.');
  }

  return [
    { role: 'user', parts: userParts },
    { role: 'model', parts: [{ text: modelLines.join('\n') }] },
  ];
}

export class ContextCompactor {
  /**
   * Projects an uncompressed conversational contents array into a 3-tier
   * token-optimized representation for outbound Gemini API calls.
   *
   * Invariants:
   * 1. Never mutates input contents or persisted session JSON.
   * 2. Preserves strict user-model alternation and always starts with user.
   * 3. Completely rolls up Tier 2 tool calls into plain text to eliminate Gemini 400 errors.
   * 4. Retains full fidelity and active images for Tier 3 (last 3 turns).
   * 5. Ephemeral vision retention: strips base64 for images older than the immediate preceding turn.
   * 6. Preserves Tier 1 Immutable Anchor (root user goal + workspace context).
   */
  public static project(rawContents: any[], options: CompactorOptions = {}): Content[] {
    if (!Array.isArray(rawContents) || rawContents.length === 0) {
      return [];
    }

    try {
      // 1. Normalize input into uniform Content[] structure (deep copy)
      let contents: Content[] = rawContents.map((item) => {
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

      // Filter out leading model turns (such as welcome messages) so contents always starts with user
      let firstUserIndex = 0;
      while (firstUserIndex < contents.length && contents[firstUserIndex].role === 'model') {
        firstUserIndex++;
      }
      if (firstUserIndex > 0) {
        contents = contents.slice(firstUserIndex);
      }
      if (contents.length === 0) {
        return [];
      }

      const maxWorkingTurns = options.maxWorkingTurns ?? 3;

      // 2. Group into user-initiated interactions
      const interactions = groupIntoInteractions(contents);
      if (interactions.length === 0) {
        return [];
      }

      // 3. Determine tier boundaries across interactions
      const totalInteractions = interactions.length;
      // Working memory covers the last maxWorkingTurns interactions
      const tier3StartIndex = Math.max(1, totalInteractions - maxWorkingTurns);

      // Ephemeral Vision: identify active interaction and immediate preceding interaction
      const activeInteractionIndex = totalInteractions - 1;
      const immediatePrecedingInteractionIndex =
        totalInteractions > 1 ? totalInteractions - 2 : activeInteractionIndex;

      const projected: Content[] = [];

      for (let g = 0; g < totalInteractions; g++) {
        const interaction = interactions[g];
        const isTier1 = g === 0;
        const isTier3 = g >= tier3StartIndex;

        if (isTier1) {
          // Tier 1 (Immutable Anchor): Root user prompt and workspace anchor
          const rootUserItem = interaction[0];
          const clonedUserParts = rootUserItem.parts.map((p) => {
            // Apply vision retention if older than immediate preceding turn
            if (p.inlineData && g < immediatePrecedingInteractionIndex) {
              return { text: '[Attached image: inspected in root turn]' };
            }
            return { ...p };
          });

          // Inject workspace anchor if option provided and not already present
          if (
            options.workspaceDir &&
            clonedUserParts.length > 0 &&
            clonedUserParts[0].text &&
            !clonedUserParts[0].text.includes('Workspace:')
          ) {
            clonedUserParts[0].text = `[Workspace: ${options.workspaceDir}]\n${clonedUserParts[0].text}`;
          }

          projected.push({
            role: 'user',
            parts: clonedUserParts,
          });

          // If the root interaction is within working memory (e.g. session has <= 3 turns),
          // preserve its subsequent turns with full fidelity.
          // Otherwise, if it has tool calls or model responses, roll up the rest of interaction 0 into model text.
          if (isTier3) {
            for (let i = 1; i < interaction.length; i++) {
              const item = interaction[i];
              const clonedParts = item.parts.map((p) => {
                if (p.inlineData && g < immediatePrecedingInteractionIndex) {
                  return { text: '[Attached image: inspected in root turn]' };
                }
                return { ...p };
              });
              projected.push({ role: item.role, parts: clonedParts });
            }
          } else {
            // Root interaction is older than working memory: summarize any tool calls or text into 1 model turn
            if (interaction.length > 1) {
              const rolled = compactTier2Interaction(interaction);
              if (rolled.length > 1) {
                projected.push(rolled[1]);
              }
            }
          }
        } else if (isTier3) {
          // Tier 3 (Working Memory): Full fidelity, active images for current and immediate preceding turns
          for (const item of interaction) {
            const clonedParts = item.parts.map((p) => {
              // Apply Ephemeral Vision Retention: strip base64 if older than immediate preceding turn
              if (p.inlineData && g < immediatePrecedingInteractionIndex) {
                return { text: '[Attached image: inspected in earlier turn]' };
              }
              return { ...p };
            });
            projected.push({
              role: item.role,
              parts: clonedParts,
            });
          }
        } else {
          // Tier 2 (Compacted Semantic History): Roll up interaction into plain conversational text
          const compactedTurns = compactTier2Interaction(interaction);
          projected.push(...compactedTurns);
        }
      }

      // 4. Strict Alternation Normalization Pass
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
          const prevHasPureText = prev.parts.every((p) => p.text !== undefined);
          const itemHasPureText = item.parts.every((p) => p.text !== undefined);

          if (prevHasPureText && itemHasPureText) {
            prev.parts[prev.parts.length - 1].text += `\n${item.parts[0].text}`;
            prev.parts.push(...item.parts.slice(1));
          } else {
            // If one of them contains structural function calls or responses,
            // separate with a minimal synthetic bridge turn to keep roles strictly alternating
            const bridgeRole = item.role === 'user' ? 'model' : 'user';
            const bridgeText = bridgeRole === 'model' ? 'Understood.' : 'Please continue.';
            normalized.push({
              role: bridgeRole,
              parts: [{ text: bridgeText }],
            });
            normalized.push({
              role: item.role,
              parts: [...item.parts],
            });
          }
        } else {
          normalized.push({
            role: item.role,
            parts: [...item.parts],
          });
        }
      }

      // 5. Ensure no orphaned functionCall at the end of the history
      if (normalized.length > 0) {
        const lastTurn = normalized[normalized.length - 1];
        if (lastTurn.role === 'model') {
          for (let pIdx = 0; pIdx < lastTurn.parts.length; pIdx++) {
            const part = lastTurn.parts[pIdx];
            if (part.functionCall) {
              lastTurn.parts[pIdx] = {
                text: `[Pending action: ${part.functionCall.name}]`,
              };
            }
          }
        }
      }

      return normalized;
    } catch (err: any) {
      console.warn('ContextCompactor error, falling back to safe truncation:', err?.message || err);
      return fallbackSafeTruncation(rawContents);
    }
  }
}
