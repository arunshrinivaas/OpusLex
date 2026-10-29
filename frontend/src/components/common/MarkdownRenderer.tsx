import React from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  if (!content) return null;

  // Helper to parse inline styles (bold, italic, code, links, citations)
  const renderInline = (text: string): React.ReactNode[] => {
    // Split by inline code, bold, italic, citation patterns
    const tokens: React.ReactNode[] = [];
    let remaining = text;
    let keyIdx = 0;

    while (remaining.length > 0) {
      // 1. Inline code: `code`
      const codeMatch = remaining.match(/^`([^`]+)`/);
      if (codeMatch) {
        tokens.push(
          <code
            key={`code-${keyIdx++}`}
            className="px-1.5 py-0.5 rounded font-mono text-[12px] bg-neutral-200/70 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-300/40 dark:border-neutral-700/60"
          >
            {codeMatch[1]}
          </code>
        );
        remaining = remaining.slice(codeMatch[0].length);
        continue;
      }

      // 2. Citations: [Source: filename, Chunk: N]
      const citMatch = remaining.match(/^\[Source:\s*([^,\]]+)(?:,\s*Chunk:\s*(\d+))?\]/);
      if (citMatch) {
        tokens.push(
          <span
            key={`cit-${keyIdx++}`}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 text-[11px] font-medium rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300/60 dark:border-amber-700/60"
            title={`Source: ${citMatch[1]}${citMatch[2] ? `, Chunk ${citMatch[2]}` : ''}`}
          >
            📄 {citMatch[1].trim()} {citMatch[2] ? `(chunk ${citMatch[2]})` : ''}
          </span>
        );
        remaining = remaining.slice(citMatch[0].length);
        continue;
      }

      // 3. Bold: **text**
      const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
      if (boldMatch) {
        tokens.push(
          <strong key={`bold-${keyIdx++}`} className="font-semibold text-neutral-900 dark:text-neutral-100">
            {renderInline(boldMatch[1])}
          </strong>
        );
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }

      // 4. Italic: *text* or _text_
      const italicMatch = remaining.match(/^(\*|_)([^*_]+)\1/);
      if (italicMatch) {
        tokens.push(
          <em key={`italic-${keyIdx++}`} className="italic">
            {renderInline(italicMatch[2])}
          </em>
        );
        remaining = remaining.slice(italicMatch[0].length);
        continue;
      }

      // 5. Links: [text](url)
      const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        tokens.push(
          <a
            key={`link-${keyIdx++}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-600 dark:text-amber-400 hover:underline inline-flex items-center gap-0.5"
          >
            {linkMatch[1]}
          </a>
        );
        remaining = remaining.slice(linkMatch[0].length);
        continue;
      }

      // Plain text character chunk
      const nextSpecial = remaining.search(/[`*_\[]/);
      if (nextSpecial === -1) {
        tokens.push(remaining);
        break;
      } else if (nextSpecial === 0) {
        // Special character didn't match a rule, take 1 char
        tokens.push(remaining[0]);
        remaining = remaining.slice(1);
      } else {
        tokens.push(remaining.slice(0, nextSpecial));
        remaining = remaining.slice(nextSpecial);
      }
    }

    return tokens;
  };

  // Block parsing (headings, code blocks, lists, tables, paragraphs)
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced Code Block
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // Skip closing ```
      elements.push(
        <div
          key={`code-block-${blockKey++}`}
          className="my-3 rounded-lg overflow-hidden border border-neutral-300 dark:border-neutral-800 bg-neutral-900 text-neutral-100 font-mono text-xs shadow-xs"
        >
          {lang && (
            <div className="px-3 py-1 bg-neutral-800 text-[11px] text-neutral-400 font-sans border-b border-neutral-700/60 uppercase tracking-wider">
              {lang}
            </div>
          )}
          <pre className="p-3.5 overflow-x-auto leading-relaxed whitespace-pre">
            {codeLines.join('\n')}
          </pre>
        </div>
      );
      continue;
    }

    // Markdown Table
    if (line.includes('|') && i + 1 < lines.length && lines[i + 1].includes('|') && lines[i + 1].includes('-')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i]);
        i++;
      }

      const parseRow = (r: string) =>
        r
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());

      const headerCols = parseRow(tableLines[0]);
      const bodyRows = tableLines.slice(2).map(parseRow);

      elements.push(
        <div key={`table-${blockKey++}`} className="my-3.5 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-800 text-xs">
            <thead className="bg-neutral-100/80 dark:bg-neutral-800/80">
              <tr>
                {headerCols.map((col, idx) => (
                  <th
                    key={idx}
                    className="px-3.5 py-2 text-left font-semibold text-neutral-800 dark:text-neutral-200 tracking-wider"
                  >
                    {renderInline(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200/60 dark:divide-neutral-800/60 bg-white dark:bg-neutral-900">
              {bodyRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3.5 py-2 text-neutral-700 dark:text-neutral-300">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Headings
    if (line.startsWith('#### ')) {
      elements.push(
        <h4 key={`h4-${blockKey++}`} className="text-xs font-bold text-neutral-900 dark:text-white mt-3 mb-1">
          {renderInline(line.slice(5))}
        </h4>
      );
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={`h3-${blockKey++}`} className="text-sm font-bold text-neutral-900 dark:text-white mt-3.5 mb-1.5">
          {renderInline(line.slice(4))}
        </h3>
      );
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={`h2-${blockKey++}`} className="text-base font-bold text-neutral-900 dark:text-white mt-4 mb-2">
          {renderInline(line.slice(3))}
        </h2>
      );
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={`h1-${blockKey++}`} className="text-lg font-bold text-neutral-900 dark:text-white mt-4 mb-2">
          {renderInline(line.slice(2))}
        </h1>
      );
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      elements.push(
        <blockquote
          key={`quote-${blockKey++}`}
          className="my-2 pl-3 border-l-2 border-amber-500 text-neutral-600 dark:text-neutral-400 italic text-xs"
        >
          {renderInline(line.slice(2))}
        </blockquote>
      );
      i++;
      continue;
    }

    // Unordered List Items (- , * , • )
    if (/^(\s*[-*•]\s+)/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^(\s*[-*•]\s+)/.test(lines[i])) {
        listItems.push(lines[i].replace(/^(\s*[-*•]\s+)/, ''));
        i++;
      }
      elements.push(
        <ul key={`ul-${blockKey++}`} className="my-2 space-y-1 pl-4 list-disc text-neutral-800 dark:text-neutral-200">
          {listItems.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered List Items (1. , 2. )
    if (/^\s*\d+\.\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      elements.push(
        <ol key={`ol-${blockKey++}`} className="my-2 space-y-1 pl-5 list-decimal text-neutral-800 dark:text-neutral-200">
          {listItems.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Empty line (paragraph break)
    if (!line.trim()) {
      i++;
      continue;
    }

    // Standard Paragraph
    elements.push(
      <p key={`p-${blockKey++}`} className="my-1.5 leading-relaxed">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <div className={`markdown-body space-y-1 ${className}`}>{elements}</div>;
};
