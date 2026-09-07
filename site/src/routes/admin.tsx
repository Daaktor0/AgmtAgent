"use client";

import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Wordmark } from "@/brand/wordmark";
import { FOOTER_DESCRIPTION } from "@/brand/copy";
import { SeatMeter } from "@/components/site/seat-meter";
import {
  adminAllotReserved,
  adminExportCsv,
  adminUnlock,
  SEAT_OPEN,
  SEAT_RESERVED,
  type SeatCounts,
  type WaitlistRow,
} from "@/lib/waitlist";
import { adminListBuilderInterest, type BuilderInterestRow } from "@/lib/builders";
import { cn } from "@/lib/utils";

/** Same CSV-injection guard as adminExportCsv: quote a leading =, +, - or @. */
function csvCell(value: string): string {
  const v = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

function downloadCsv(rows: string[][], filename: string) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({
    meta: [{ title: "Admin — Agmt" }, { name: "robots", content: "noindex, nofollow" }],
  }),
});

function AdminPage() {
  const [password, setPassword] = useState("");
  const [view, setView] = useState<{ counts: SeatCounts; rows: WaitlistRow[] } | null>(null);
  const [builders, setBuilders] = useState<BuilderInterestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run<T>(fn: () => Promise<T>, onOk: (value: T) => void) {
    setBusy(true);
    setError(null);
    try {
      onOk(await fn());
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const unlock = (e: FormEvent) => {
    e.preventDefault();
    void run(
      () => adminUnlock({ data: { password } }),
      (r) => (r.ok ? setView({ counts: r.counts, rows: r.rows }) : setError(r.error)),
    );
    void run(
      () => adminListBuilderInterest({ data: { password } }),
      (r) => (r.ok ? setBuilders(r.rows) : undefined),
    );
  };

  const exportBuildersCsv = () => {
    if (!builders) return;
    downloadCsv(
      [
        ["time", "email", "product_url", "consent"],
        ...builders.map((r) => [r.created_at, r.email, r.product_url ?? "", r.consent ? "yes" : "no"]),
      ],
      `agmt-builders-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  };

  const allot = (id: number) =>
    void run(
      () => adminAllotReserved({ data: { password, id } }),
      (r) => (r.ok ? setView({ counts: r.counts, rows: r.rows }) : setError(r.error)),
    );

  const exportCsv = () =>
    void run(
      () => adminExportCsv({ data: { password } }),
      (r) => {
        if (!r.ok) return setError(r.error);
        const url = URL.createObjectURL(new Blob([r.csv], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `agmt-waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
    );

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-6xl items-end justify-between px-6 pb-4 pt-6">
          <Wordmark />
          <span className="label">Admin</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
        {!view ? (
          <form onSubmit={unlock} className="max-w-sm">
            <h1 className="text-[1.75rem] text-ink">Signups</h1>
            <label htmlFor="admin-pw" className="label mt-6 block">
              Password
            </label>
            <input
              id="admin-pw"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 block h-11 w-full border border-rule-strong bg-card px-3 text-base outline-none focus:border-accent"
            />
            {error ? (
              <p role="alert" className="mt-3 text-sm text-accent">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy || !password}
              className="mt-5 inline-flex min-h-11 items-center bg-accent px-6 text-[0.9375rem] font-medium text-accent-ink hover:bg-accent-hover disabled:opacity-60"
            >
              {busy ? "Checking…" : "Unlock"}
            </button>
          </form>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <h1 className="text-[1.75rem] text-ink">Signups</h1>
                <p className="mt-1 font-mono text-sm tabular-nums text-muted">
                  {view.counts.fcfsTaken}/{SEAT_OPEN} first-come · {view.counts.reservedAllotted}/
                  {SEAT_RESERVED} reserved allotted · {view.rows.length} row
                  {view.rows.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                onClick={exportCsv}
                disabled={busy}
                className="inline-flex min-h-11 items-center border border-rule-strong bg-card px-4 text-[0.9375rem] text-ink-2 hover:border-ink disabled:opacity-60"
              >
                Export CSV
              </button>
            </div>

            <div className="mt-6 max-w-xl border border-rule bg-card p-5">
              <SeatMeter counts={view.counts} />
            </div>

            {error ? (
              <p
                role="alert"
                className="mt-4 border-l-2 border-accent pl-3 text-[0.9375rem] text-accent"
              >
                {error}
              </p>
            ) : null}

            {view.rows.length === 0 ? (
              <p className="mt-10 text-muted">
                No rows yet. The form is live; the list is simply empty.
              </p>
            ) : (
              <div className="mt-6 overflow-x-auto border border-rule bg-card">
                <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-rule">
                      {[
                        "Time",
                        "Name",
                        "Email",
                        "Firm",
                        "Role",
                        "Mode",
                        "Remind",
                        "Status",
                        "",
                      ].map((h, i) => (
                        <th key={h || i} scope="col" className="label px-3 py-2.5">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {view.rows.map((row) => (
                      <tr key={row.id} className="border-b border-rule last:border-0 align-top">
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-xs tabular-nums text-muted">
                          {row.created_at.slice(0, 16).replace("T", " ")}
                        </td>
                        <td className="px-3 py-3 text-ink">{row.name}</td>
                        <td className="px-3 py-3 text-ink-2">{row.email}</td>
                        <td className="px-3 py-3 text-muted">{row.firm ?? "—"}</td>
                        <td className="px-3 py-3 text-muted">{row.role ?? "—"}</td>
                        <td className="px-3 py-3 text-ink-2">{row.interest}</td>
                        <td className="px-3 py-3 text-muted">
                          {[row.remind_beta && "beta", row.remind_launch && "launch"]
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </td>
                        <td className="px-3 py-3">
                          <Status row={row} />
                        </td>
                        <td className="px-3 py-3">
                          {row.status === "waitlist" && view.counts.reservedRemaining > 0 ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => allot(row.id)}
                              className="whitespace-nowrap text-accent underline underline-offset-4 disabled:opacity-60"
                            >
                              Allot reserved
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-14 flex flex-wrap items-end justify-between gap-6">
              <div>
                <h2 className="text-[1.5rem] text-ink">Builder interest</h2>
                <p className="mt-1 text-sm text-muted">
                  {builders ? `${builders.length} registration${builders.length === 1 ? "" : "s"}` : "Loading…"}
                </p>
              </div>
              <button
                type="button"
                onClick={exportBuildersCsv}
                disabled={!builders || builders.length === 0}
                className="inline-flex min-h-11 items-center border border-rule-strong bg-card px-4 text-[0.9375rem] text-ink-2 hover:border-ink disabled:opacity-60"
              >
                Export CSV
              </button>
            </div>

            {builders && builders.length === 0 ? (
              <p className="mt-6 text-muted">No registrations yet.</p>
            ) : builders && builders.length > 0 ? (
              <div className="mt-6 overflow-x-auto border border-rule bg-card">
                <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-rule">
                      {["Time", "Email", "Product URL", "Consent"].map((h) => (
                        <th key={h} scope="col" className="label px-3 py-2.5">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {builders.map((row) => (
                      <tr key={row.id} className="border-b border-rule last:border-0 align-top">
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-xs tabular-nums text-muted">
                          {row.created_at.slice(0, 16).replace("T", " ")}
                        </td>
                        <td className="px-3 py-3 text-ink-2">{row.email}</td>
                        <td className="px-3 py-3 text-muted">{row.product_url ?? "—"}</td>
                        <td className="px-3 py-3 text-muted">{row.consent ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        )}
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted">{FOOTER_DESCRIPTION}</div>
      </footer>
    </div>
  );
}

function Status({ row }: { row: WaitlistRow }) {
  const seat =
    row.status === "seat-fcfs"
      ? row.fcfs_seat
      : row.status === "reserved-allotted"
        ? row.reserved_seat
        : null;
  const held = row.status === "seat-fcfs" || row.status === "reserved-allotted";
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap border px-1.5 py-0.5 font-mono text-[0.6875rem] uppercase tracking-wider",
        held ? "border-accent text-accent" : "border-rule-strong text-muted",
      )}
    >
      {row.status}
      {seat != null ? ` ${seat}` : ""}
    </span>
  );
}
