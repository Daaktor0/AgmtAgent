import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Shell } from "@/components/agmt/shell";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { selectedFileError } from "@/lib/products/proof-state";

export const Route = createFileRoute("/proof")({ component: Proof });

function Proof() {
  const { user, isPending } = useCurrentUserState();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  return <Shell>
    <section className="mx-auto max-w-2xl space-y-7">
      <p className="text-sm text-stone">Agmt / Proof</p>
      <h1 className="font-display text-4xl sm:text-5xl">Proofread your agreement.</h1>
      <p className="text-base leading-7">Safe corrections appear as tracked changes. Items that need your judgment appear as comments.</p>
      <p className="border-l-2 border-oxblood pl-4 text-sm leading-6">The Proof beta is being prepared. Uploads are not available yet.</p>
      <div className="space-y-4 border-y border-rule py-7">
        <label htmlFor="proof-file" className="block text-sm font-medium">Choose Word document</label>
        <input id="proof-file" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="block w-full text-sm file:mr-4 file:border file:border-ink file:bg-transparent file:px-4 file:py-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-oxblood" onChange={(e) => {
          const next = e.target.files?.[0] ?? null;
          const error = next ? selectedFileError(next) : null;
          setError(error); setFile(error ? null : next);
          if (error) e.target.value = "";
        }} />
        <p className="text-sm text-stone">One native, unencrypted English .docx, up to 25 MiB.</p>
        {error ? <p role="alert" className="text-sm text-oxblood">{error}</p> : null}
        {file ? <p className="break-words text-sm" aria-live="polite">{file.name} · {(file.size / 1024).toFixed(1)} KiB selected on your device</p> : null}
        {!isPending && (!user || user.isDevFallback) ? <p className="text-sm"><Link to="/login" search={{ returnTo: "/proof" }} className="underline underline-offset-4">Sign in to Agmt</Link> before uploading. You may need to select your file again.</p> : null}
        <Button disabled aria-describedby="proof-unavailable">Proofread document</Button>
        <p id="proof-unavailable" className="text-sm text-stone">Your selected file stays on this device. No upload has started.</p>
      </div>
      <div className="space-y-3 text-sm leading-6 text-stone">
        <p>Proof checks a small list of common typos, repeated function words, unfinished placeholders, missing internal references, duplicate clause numbers and duplicate definitions.</p>
        <p>It doesn’t provide a comprehensive legal review. You accept or reject proposed corrections in Word.</p>
      </div>
    </section>
  </Shell>;
}
