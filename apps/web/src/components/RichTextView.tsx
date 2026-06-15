import { cn } from '@/lib/utils';

// Read-only renderer for announcement body_html, produced by the admin app's
// contentEditable-based RichTextEditor (bold/italic/lists/links only).
export function RichTextView({ html, className }: { html: string; className?: string }) {
  return <div className={cn('rich-text', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
