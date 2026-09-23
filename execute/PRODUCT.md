# Agmt Execute: product note

## The problem

Closing a multi-party agreement ends with manual assembly work, usually late at
night:

1. Copy each signature page into a new Word file and make a PDF.
2. Send each party its page. Collect the countersigned page from each.
3. Make the PDF of the final agreement. Collect the stamp papers from the
   parties who bought them.
4. On a free PDF site, merge stamp paper + agreement + signature pages, once
   for every party.

The work multiplies with the parties. A shareholders' agreement with 15
investors means 15 signature packs, about 30 returns to track, and 15 merges,
each with a different stamp paper in front. The main parties take the originals,
the others get counterparts, and each stamp paper has its own number. Two-party
commercial agreements go through the same steps on a smaller scale.

It also carries risk. The signature page retyped in Word can differ from the
final version. A copy goes out missing someone's page. Confidential client
agreements are uploaded to free merge websites.

## The product

A browser tool that does steps 1 and 4 in a few clicks and keeps count during
steps 2 and 3. It is deterministic: no AI model, no server, no upload. The
confidentiality claim is provable, because the page works with the internet
off and the browser blocks every outbound connection.

## Why start here

- It is a real, recurring and measurable pain: hours per closing, done by
  associates.
- It needs no legal judgement, so a deterministic tool can be fully correct.
- The pitch is concrete: "stop uploading client agreements to free PDF sites".
- It builds on existing work without depending on the unfinished Proof engine.
  Proof can later become a free "check before signing" step inside this flow.

## Next steps

1. **Use it on a real closing.** Note every place it slows you down or gets a
   name wrong.
2. **Check returns against the final version.** OCR each returned page locally
   (Tesseract.js) and compare it with the final page, catching a party that
   signed an older draft.
3. **Save and resume a deal** as a local file, so a closing can span days.
4. **Status list for chasing**: who has sent their signature page and stamp
   paper, as a table to paste into email.
5. **Closing bundle**: all executed copies plus an index.

## Commercial test

Give it to 5 to 10 transactional lawyers you know, and watch them use it on a
live deal. When it saves them a night, ask for a per-closing or per-seat price.
The measures that matter are copies assembled on real deals and whether anyone
pays, not features.
