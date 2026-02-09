"use client";

/**
 * Inline copy-to-clipboard button for addresses.
 */

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { copyToClipboard, truncateAddress } from "@/lib/utils";

interface CopyButtonProps {
  text: string;
  truncate?: boolean;
  chars?: number;
  className?: string;
}

export function CopyButton({
  text,
  truncate = true,
  chars = 4,
  className = "",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 font-mono text-sm text-text-secondary hover:text-text-primary transition-colors ${className}`}
      title={text}
    >
      <span>{truncate ? truncateAddress(text, chars) : text}</span>
      {copied ? (
        <Check size={12} className="text-accent-green" />
      ) : (
        <Copy size={12} className="opacity-50 hover:opacity-100" />
      )}
    </button>
  );
}
