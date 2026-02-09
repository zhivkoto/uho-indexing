'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { copyToClipboard, cn } from '@/lib/utils';

interface JsonViewerProps {
  data: unknown;
  title?: string;
  className?: string;
}

function colorizeValue(value: unknown): { text: string; className: string } {
  if (value === null || value === undefined) {
    return { text: 'null', className: 'text-red-400' };
  }
  if (typeof value === 'boolean') {
    return { text: String(value), className: 'text-amber-400' };
  }
  if (typeof value === 'number') {
    return { text: String(value), className: 'text-[#67E8F9]' };
  }
  if (typeof value === 'string') {
    return { text: `"${value}"`, className: 'text-emerald-400' };
  }
  return { text: String(value), className: 'text-[#EDEDEF]' };
}

function JsonLine({ keyName, value, indent = 0, isLast = false }: {
  keyName?: string;
  value: unknown;
  indent?: number;
  isLast?: boolean;
}) {
  const spaces = '  '.repeat(indent);

  if (value !== null && typeof value === 'object') {
    const isArray = Array.isArray(value);
    const entries = isArray ? (value as unknown[]) : Object.entries(value as Record<string, unknown>);
    const openBrace = isArray ? '[' : '{';
    const closeBrace = isArray ? ']' : '}';

    if (entries.length === 0) {
      return (
        <div>
          <span className="text-[#63637A]">{spaces}</span>
          {keyName && <><span className="text-[#63637A]">&quot;{keyName}&quot;</span><span className="text-[#63637A]">: </span></>}
          <span className="text-[#63637A]">{openBrace}{closeBrace}</span>
          {!isLast && <span className="text-[#63637A]">,</span>}
        </div>
      );
    }

    return (
      <>
        <div>
          <span className="text-[#63637A]">{spaces}</span>
          {keyName && <><span className="text-[#63637A]">&quot;{keyName}&quot;</span><span className="text-[#63637A]">: </span></>}
          <span className="text-[#63637A]">{openBrace}</span>
        </div>
        {isArray
          ? (value as unknown[]).map((item, i) => (
              <JsonLine key={i} value={item} indent={indent + 1} isLast={i === (value as unknown[]).length - 1} />
            ))
          : Object.entries(value as Record<string, unknown>).map(([k, v], i, arr) => (
              <JsonLine key={k} keyName={k} value={v} indent={indent + 1} isLast={i === arr.length - 1} />
            ))
        }
        <div>
          <span className="text-[#63637A]">{spaces}{closeBrace}</span>
          {!isLast && <span className="text-[#63637A]">,</span>}
        </div>
      </>
    );
  }

  const colored = colorizeValue(value);
  return (
    <div>
      <span className="text-[#63637A]">{spaces}</span>
      {keyName && <><span className="text-[#63637A]">&quot;{keyName}&quot;</span><span className="text-[#63637A]">: </span></>}
      <span className={colored.className}>{colored.text}</span>
      {!isLast && <span className="text-[#63637A]">,</span>}
    </div>
  );
}

export function JsonViewer({ data, title = 'Event Data', className }: JsonViewerProps) {
  const [mode, setMode] = useState<'formatted' | 'raw'>('formatted');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyToClipboard(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn('rounded-xl bg-[#09090B] border border-[#1E1E26] overflow-hidden', className)}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1E1E26] bg-[#0F0F12]">
        <span className="text-xs font-medium leading-4 text-[#63637A]">{title}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMode('raw')}
            className={cn(
              'rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors cursor-pointer',
              mode === 'raw' ? 'bg-[#22D3EE]/10 text-[#22D3EE]' : 'text-[#63637A] hover:text-[#EDEDEF] hover:bg-[#1C1C22]'
            )}
          >
            Raw
          </button>
          <button
            type="button"
            onClick={() => setMode('formatted')}
            className={cn(
              'rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors cursor-pointer',
              mode === 'formatted' ? 'bg-[#22D3EE]/10 text-[#22D3EE]' : 'text-[#63637A] hover:text-[#EDEDEF] hover:bg-[#1C1C22]'
            )}
          >
            Formatted
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-full w-7 h-7 flex items-center justify-center text-[#63637A] hover:text-[#EDEDEF] hover:bg-[#1C1C22] transition-colors ml-1 cursor-pointer"
            title="Copy JSON"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      <pre className="p-4 overflow-x-auto max-h-[500px] overflow-y-auto">
        {mode === 'formatted' ? (
          <code className="font-mono text-xs leading-5">
            <JsonLine value={data} isLast />
          </code>
        ) : (
          <code className="font-mono text-xs leading-5 text-[#A0A0AB]">
            {JSON.stringify(data)}
          </code>
        )}
      </pre>
    </div>
  );
}
