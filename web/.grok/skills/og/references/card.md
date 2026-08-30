# Open Graph card hand-over

Generate or validate the 1200x630 card before hand-over. Keep temporary output under .grok/, then use:

~~~
node scripts/write-atomic.mjs .grok/og.jpg.tmp public/og.jpg
~~~

The target must be a real validated asset and site.json must explicitly declare "card": "custom".
