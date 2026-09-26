import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { adminUnlock, type BuilderRow, type WaitlistRow } from "@/lib/admin";
import { formatDate } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin · Agmt" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminPage,
});

const STATUS_LABEL: Record<string, string> = {
  "seat-fcfs": "Beta seat",
  "reserved-allotted": "Reserved seat",
  waitlist: "Waitlist",
  "reminder-only": "Updates only",
};

/** Quote a cell for CSV. A leading =, +, - or @ is prefixed so spreadsheets read it as text. */
function csvCell(value: string): string {
  const v = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

function downloadCsv(header: string[], rows: string[][], name: string) {
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function AdminPage() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ waitlist: WaitlistRow[]; builders: BuilderRow[] } | null>(null);

  async function unlock(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await adminUnlock({ data: { password } });
      if (result.ok) setData({ waitlist: result.waitlist, builders: result.builders });
      else setError(result.error);
    } catch {
      setError("The server couldn't be reached.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <section className="container-site py-20 md:py-28">
        <form onSubmit={unlock} className="max-w-sm">
          <p className="label">Admin</p>
          <h1 className="display-2 mt-4">Sign-up lists</h1>
          <label htmlFor="admin-password" className="mt-10 block text-[0.9rem] font-semibold">
            Password
          </label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 block h-12 w-full rounded-[10px] border border-line-2 bg-bg px-4 text-base outline-none focus:border-blue"
          />
          {error ? (
            <p role="alert" className="mt-3 text-[0.9rem] text-execute">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={busy || !password} className="btn btn-primary mt-6 disabled:opacity-50">
            {busy ? "Checking…" : "Unlock"}
          </button>
        </form>
      </section>
    );
  }

  const { waitlist, builders } = data;

  return (
    <section className="container-site py-16 md:py-20">
      <p className="label">Admin · read only</p>
      <h1 className="display-2 mt-4">Sign-up lists</h1>
      <p className="lead mt-4 max-w-[60ch]">
        People who signed up through forms on earlier versions of the site. The forms are closed;
        these lists only change if you change the database. Exports include every column.
      </p>

      <AdminTable
        title="Product updates list"
        count={waitlist.length}
        onExport={() =>
          downloadCsv(
            ["time", "name", "email", "firm", "role", "interest", "remind_beta", "remind_launch", "status", "fcfs_seat", "reserved_seat"],
            waitlist.map((r) => [
              r.created_at,
              r.name,
              r.email,
              r.firm ?? "",
              r.role ?? "",
              r.interest,
              r.remind_beta ? "yes" : "no",
              r.remind_launch ? "yes" : "no",
              r.status,
              r.fcfs_seat?.toString() ?? "",
              r.reserved_seat?.toString() ?? "",
            ]),
            "agmt-updates-list",
          )
        }
        head={["Signed up", "Name", "Email", "Firm", "Role", "Status"]}
        rows={waitlist.map((r) => [
          formatDate(r.created_at, "short"),
          r.name,
          r.email,
          r.firm ?? "",
          r.role ?? "",
          STATUS_LABEL[r.status] ?? r.status,
        ])}
      />

      <AdminTable
        title="Legal-tech builders"
        count={builders.length}
        onExport={() =>
          downloadCsv(
            ["time", "email", "product_url", "consent"],
            builders.map((r) => [r.created_at, r.email, r.product_url ?? "", r.consent ? "yes" : "no"]),
            "agmt-builders",
          )
        }
        head={["Signed up", "Email", "Product website", "Consent"]}
        rows={builders.map((r) => [
          formatDate(r.created_at, "short"),
          r.email,
          r.product_url ?? "",
          r.consent ? "Yes" : "No",
        ])}
      />
    </section>
  );
}

function AdminTable({
  title,
  count,
  head,
  rows,
  onExport,
}: {
  title: string;
  count: number;
  head: string[];
  rows: string[][];
  onExport: () => void;
}) {
  return (
    <div className="mt-14">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-3">
        <h2 className="title-3">
          {title} <span className="font-mono text-[0.9rem] text-ink-3">{count}</span>
        </h2>
        <button type="button" onClick={onExport} disabled={!count} className="btn btn-ghost btn-sm disabled:opacity-50">
          Export CSV
        </button>
      </div>
      {count ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left text-[0.92rem]">
            <thead>
              <tr>
                {head.map((h) => (
                  <th key={h} scope="col" className="label px-3 py-3 first:pl-0">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-line align-top">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-3 break-words first:pl-0 first:whitespace-nowrap">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-6 text-ink-3">No rows.</p>
      )}
    </div>
  );
}
