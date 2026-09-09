import { Link } from "@tanstack/react-router";

export function ProofIntro() {
  return (
    <header className="space-y-4">
      <p className="text-sm text-stone">Agmt / Proof</p>
      <p className="text-sm">Free at launch</p>
      <p className="border-l-2 border-oxblood pl-4 text-sm leading-6">
        Your file is uploaded only when you start Proof. Files and extracted content are deleted from Agmt-controlled content storage within two hours of upload. You can delete them earlier.
      </p>
      <p className="text-sm leading-6 text-stone">
        Downloads close five minutes before deletion is due. We retain limited account and operational records, not document content.{" "}
        <Link to="/proof/help" className="underline underline-offset-4">What Proof checks</Link>
      </p>
    </header>
  );
}
