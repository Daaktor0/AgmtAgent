# Site identity hand-over

Keep the identity document valid JSON and hand it over only after validation:

~~~
node scripts/write-atomic.mjs .grok/site.json.tmp src/lib/og/site.json
~~~

The identity, card, and feed banner are separate contracts; do not infer one from another.
