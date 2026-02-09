'use client';

import { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { truncateAddress, copyToClipboard, solscanTxUrl } from '@/lib/utils';

interface TxDisplayProps {
  signature: string;
  chars?: number;
  className?: string;
}

export function TxDisplay({ signature, chars = 4, className }: TxDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await copyToClipboard(signature);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`inline-flex items-center gap-1.5 group ${className || ''}`}>
      <a
        href={solscanTxUrl(signature)}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-[13px] leading-5 text-[#67E8F9] hover:underline"
        title={signature}
      >
        {truncateAddress(signature, chars)}
      </a>
      <a
        href={solscanTxUrl(signature)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#63637A] hover:text-[#22D3EE] transition-colors"
        title="View on Solscan"
      >
        <ExternalLink className="w-3 h-3" />
      </a>
      <button
        onClick={handleCopy}
        className="opacity-0 group-hover:opacity-100 text-[#63637A] hover:text-[#22D3EE] transition-all duration-150 cursor-pointer"
        title="Copy signature"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}
