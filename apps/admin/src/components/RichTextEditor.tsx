import { useEffect, useRef } from 'react';
import { Bold, Italic, List, Link as LinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

// Minimal contentEditable-based rich text editor. Uses document.execCommand,
// which is deprecated but still broadly supported and avoids pulling in a
// full editor framework (TipTap's scoped packages can't be installed in this
// sandbox — see CLAUDE.md). Output is HTML stored in announcements.body_html.
export function RichTextEditor({ value, onChange, placeholder, className }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (ref.current && isFirstRender.current) {
      ref.current.innerHTML = value;
      isFirstRender.current = false;
    }
  }, [value]);

  const exec = (command: string, arg?: string) => {
    if (ref.current) ref.current.focus();
    document.execCommand(command, false, arg);
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const handleLink = () => {
    const url = window.prompt('Link URL');
    if (url) exec('createLink', url);
  };

  return (
    <div className={cn('rounded-md border border-input shadow-sm', className)}>
      <div className="flex items-center gap-1 border-b border-input bg-muted/40 px-2 py-1">
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            exec('bold');
          }}
          className="rounded p-1.5 hover:bg-muted"
          title="Bold"
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            exec('italic');
          }}
          className="rounded p-1.5 hover:bg-muted"
          title="Italic"
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            exec('insertUnorderedList');
          }}
          className="rounded p-1.5 hover:bg-muted"
          title="Bulleted list"
        >
          <List className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleLink();
          }}
          className="rounded p-1.5 hover:bg-muted"
          title="Link"
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        onInput={() => ref.current && onChange(ref.current.innerHTML)}
        data-placeholder={placeholder}
        className="rich-text min-h-[120px] px-3 py-2 text-sm focus:outline-none"
      />
    </div>
  );
}

// Renders stored announcement HTML read-only (used in parent-facing web app
// and as a preview here).
export function RichTextView({ html, className }: { html: string; className?: string }) {
  return <div className={cn('rich-text', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
