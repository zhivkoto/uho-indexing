'use client';

import { useCallback, useState } from 'react';
import { Upload, FileJson, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface IdlUploadProps {
  onIdlParsed: (idl: object, events: ParsedEvent[]) => void;
  className?: string;
}

interface ParsedEvent {
  name: string;
  type: 'event' | 'instruction';
  fields: Array<{ name: string; type: string }>;
}

export function IdlUpload({ onIdlParsed, className }: IdlUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const parseIdlFile = useCallback((file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('IDL file must be under 5MB');
      return;
    }

    if (!file.name.endsWith('.json')) {
      toast.error('Please upload a JSON file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const events: ParsedEvent[] = [];

        // Extract events
        if (parsed.events) {
          for (const event of parsed.events) {
            events.push({
              name: event.name,
              type: 'event',
              fields: (event.fields || []).map((f: { name: string; type: unknown }) => ({
                name: f.name,
                type: typeof f.type === 'string' ? f.type : JSON.stringify(f.type),
              })),
            });
          }
        }

        // Extract instructions with args
        if (parsed.instructions) {
          for (const ix of parsed.instructions) {
            if (ix.args?.length > 0) {
              events.push({
                name: ix.name,
                type: 'instruction',
                fields: (ix.args || []).map((a: { name: string; type: unknown }) => ({
                  name: a.name,
                  type: typeof a.type === 'string' ? a.type : JSON.stringify(a.type),
                })),
              });
            }
          }
        }

        setFileName(file.name);
        onIdlParsed(parsed, events);
        toast.success('IDL parsed successfully');
      } catch {
        toast.error('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  }, [onIdlParsed]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseIdlFile(file);
  }, [parseIdlFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseIdlFile(file);
  }, [parseIdlFile]);

  return (
    <label
      className={`
        flex flex-col items-center justify-center p-8
        border-2 border-dashed rounded-xl
        transition-colors cursor-pointer
        ${isDragging
          ? 'border-[#22D3EE]/50 bg-[#22D3EE]/5'
          : fileName
            ? 'border-emerald-500/30 bg-emerald-900/5'
            : 'border-[#2A2A35] hover:border-[#22D3EE]/30'
        }
        ${className || ''}
      `}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {fileName ? (
        <>
          <div className="w-10 h-10 rounded-xl bg-emerald-900/20 flex items-center justify-center text-emerald-400 mb-3">
            <Check className="w-5 h-5" />
          </div>
          <span className="text-sm font-medium text-[#EDEDEF]">{fileName}</span>
          <span className="text-xs text-[#63637A] mt-1">Click or drop to replace</span>
        </>
      ) : (
        <>
          <div className="w-10 h-10 rounded-xl bg-[#1C1C22] flex items-center justify-center text-[#63637A] mb-3">
            <Upload className="w-5 h-5" />
          </div>
          <span className="text-sm font-medium text-[#EDEDEF]">Click to upload IDL JSON</span>
          <span className="text-xs text-[#63637A] mt-1">or drag and drop · Max 5MB · Anchor IDL format</span>
        </>
      )}
      <input
        type="file"
        accept=".json"
        onChange={handleChange}
        className="hidden"
      />
    </label>
  );
}
