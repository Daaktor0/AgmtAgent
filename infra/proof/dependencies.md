# Proof compute dependencies

## Adopted for browser-only spelling (PEE-20 / PWC-40)

| Package | Version | Licence | Use |
|---|---|---|---|
| nspell | 2.1.5 | MIT | In-process Hunspell-compatible checker. No network. |
| dictionary-en-gb | 3.0.0 | Wrapper MIT; wordlist/affix (MIT AND BSD) SCOWL | en-GB ordinary-prose comments |
| dictionary-en | 4.0.0 | Wrapper MIT; wordlist/affix (MIT AND BSD) SCOWL | en-US ordinary-prose comments |

Copies used at runtime live in `web/src/lib/agmt/proof/dictionaries/` so the
browser worker never imports `node:fs`. Document-derived words are not stored.
Suggestions are comments only; the first suggestion is never an automatic correction.

SHA-256 of the copied files:

| File | Bytes | SHA-256 |
|---|---|---|
| `en-GB.aff` | 3086 | `8ae1f19d4840d957728ad90555d5a8dff6cc5c046279c95ff0c00fc0a0136c7b` |
| `en-GB.dic` | 552106 | `869fe17ba4ee4b5401c60a666ee2d6a3dcc237f460b7294435df1cc6a799aa57` |
| `en.aff` | 3086 | `8ae1f19d4840d957728ad90555d5a8dff6cc5c046279c95ff0c00fc0a0136c7b` |
| `en.dic` | 551762 | `f0b1a234bd178bdd01875b2a392a9647f888b8fe879f79c52aae62c2759b3647` |
