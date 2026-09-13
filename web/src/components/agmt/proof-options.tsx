import { PROOF_LANGUAGES, PROOF_PROFILES, type ProofLanguage, type ProofProfile } from "@/lib/products/capabilities";

export function ProofOptions({
  profile,
  language,
  disabled,
  onProfile,
  onLanguage,
}: {
  profile: ProofProfile;
  language: ProofLanguage;
  disabled?: boolean;
  onProfile: (value: ProofProfile) => void;
  onLanguage: (value: ProofLanguage) => void;
}) {
  return (
    <fieldset className="space-y-4" disabled={disabled}>
      <legend className="text-sm font-medium">Document options</legend>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm">Profile</p>
          {PROOF_PROFILES.map((value) => (
            <label key={value} className="flex min-h-11 items-start gap-3 text-sm">
              <input
                type="radio"
                name="proof-profile"
                value={value}
                checked={profile === value}
                onChange={() => onProfile(value)}
                className="mt-1 size-4 shrink-0 accent-oxblood"
              />
              <span>
                <span className="block text-ink">{value === "agreement" ? "Agreement" : "General document"}</span>
                <span className="mt-0.5 block leading-5 text-stone">
                  {value === "agreement"
                    ? "Spelling, punctuation and agreement-structure checks"
                    : "Spelling, punctuation and unfinished drafting checks"}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-sm">English</p>
          {PROOF_LANGUAGES.map((value) => (
            <label key={value} className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="radio"
                name="proof-language"
                value={value}
                checked={language === value}
                onChange={() => onLanguage(value)}
                className="size-4 accent-oxblood"
              />
              {value === "en-GB" ? "English (UK)" : "English (US)"}
            </label>
          ))}
        </div>
      </div>
    </fieldset>
  );
}
