/**
 * Footer with "Powered by Uho" branding.
 */

export function Footer() {
  return (
    <footer className="border-t border-border bg-bg-secondary py-6">
      <div className="mx-auto max-w-7xl px-4 flex items-center justify-between text-sm text-text-muted">
        <span>
          Powered by{" "}
          <a
            href="https://github.com/your-org/uho"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-purple hover:text-accent-purple-light transition-colors"
          >
            Uho
          </a>
          {" "}— Solana Event Indexer
        </span>
        <span className="hidden sm:inline">
          Built with Next.js + React Query
        </span>
      </div>
    </footer>
  );
}
