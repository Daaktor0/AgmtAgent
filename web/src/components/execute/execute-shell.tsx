import type { ReactNode } from "react";
import { ExecuteLockup } from "@/components/agmt/brand";
import { FeedbackButton } from "./feedback";

/**
 * Execute's page frame: the lock-up on paper under one ink rule. Quieter than
 * a dark bar, which matters at night. Proof keeps its own shell.
 */
export function ExecuteShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <a
        href="#execute-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-paper focus:px-3 focus:py-2 focus:outline-2 focus:outline-oxblood"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-ink bg-paper/95 backdrop-blur-[2px]">
        <div className="mx-auto flex h-[60px] max-w-[1400px] items-center justify-between gap-6 px-4 sm:px-8 lg:px-12">
          <a href="/" aria-label="Execute by Agmt, all signings" className="no-underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-oxblood">
            <ExecuteLockup compact />
          </a>
          <FeedbackButton />
        </div>
      </header>
      <main id="execute-main" className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
        {children}
      </main>
    </div>
  );
}
