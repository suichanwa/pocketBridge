import React from 'react';

interface MarkdownViewProps {
  content: string;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content }) => {
  // Simple regex-based markdown parser for fast zero-dependency rendering
  const parseMarkdown = (text: string) => {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];
    let codeBlockLang = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code blocks ```
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          elements.push(
            <pre
              key={`code-${i}`}
              className="my-2 p-2.5 rounded-lg bg-black/70 border border-border/50 font-mono text-xs overflow-x-auto text-emerald-300"
            >
              <code>{codeBlockContent.join('\n')}</code>
            </pre>
          );
          codeBlockContent = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
          codeBlockLang = line.trim().slice(3);
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockContent.push(line);
        continue;
      }

      // Bullet points
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        const bulletText = line.trim().substring(2);
        elements.push(
          <li key={`li-${i}`} className="ml-4 list-disc text-[13px] sm:text-sm my-0.5">
            {formatInline(bulletText)}
          </li>
        );
        continue;
      }

      // Headings
      if (line.startsWith('### ')) {
        elements.push(
          <h4 key={`h4-${i}`} className="font-bold text-sm text-foreground mt-2 mb-1">
            {formatInline(line.substring(4))}
          </h4>
        );
        continue;
      }
      if (line.startsWith('## ')) {
        elements.push(
          <h3 key={`h3-${i}`} className="font-bold text-base text-foreground mt-2.5 mb-1">
            {formatInline(line.substring(3))}
          </h3>
        );
        continue;
      }
      if (line.startsWith('# ')) {
        elements.push(
          <h2 key={`h2-${i}`} className="font-bold text-lg text-foreground mt-3 mb-1.5">
            {formatInline(line.substring(2))}
          </h2>
        );
        continue;
      }

      // Empty lines
      if (!line.trim()) {
        elements.push(<div key={`empty-${i}`} className="h-1.5" />);
        continue;
      }

      // Regular paragraph
      elements.push(
        <p key={`p-${i}`} className="text-[13px] sm:text-sm my-0.5 leading-relaxed">
          {formatInline(line)}
        </p>
      );
    }

    if (inCodeBlock && codeBlockContent.length > 0) {
      elements.push(
        <pre
          key={`code-end`}
          className="my-2 p-2.5 rounded-lg bg-black/70 border border-border/50 font-mono text-xs overflow-x-auto text-emerald-300"
        >
          <code>{codeBlockContent.join('\n')}</code>
        </pre>
      );
    }

    return elements;
  };

  const formatInline = (text: string): React.ReactNode[] => {
    // Regex splits by `code`, **bold**, *italic*, and URLs
    const parts: React.ReactNode[] = [];
    const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|https?:\/\/[^\s]+)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      const matchText = match[0];
      if (matchText.startsWith('`') && matchText.endsWith('`')) {
        parts.push(
          <code
            key={match.index}
            className="px-1.5 py-0.5 rounded bg-secondary/80 text-sky-300 font-mono text-xs border border-border/40"
          >
            {matchText.slice(1, -1)}
          </code>
        );
      } else if (matchText.startsWith('**') && matchText.endsWith('**')) {
        parts.push(
          <strong key={match.index} className="font-semibold text-foreground">
            {matchText.slice(2, -2)}
          </strong>
        );
      } else if (matchText.startsWith('*') && matchText.endsWith('*')) {
        parts.push(
          <em key={match.index} className="italic text-foreground/90">
            {matchText.slice(1, -1)}
          </em>
        );
      } else if (matchText.startsWith('http')) {
        parts.push(
          <a
            key={match.index}
            href={matchText}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline hover:text-primary/80"
          >
            {matchText}
          </a>
        );
      }
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : [text];
  };

  return <div className="space-y-1">{parseMarkdown(content)}</div>;
};
