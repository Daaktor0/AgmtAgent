# X feed banner hand-over

For a game or visually rich app, validate the 1200x264 feed card and use:

~~~
node scripts/write-atomic.mjs .grok/x-banner.jpg.tmp public/x-banner.jpg
~~~

The temporary file stays outside public/ until the atomic hand-over succeeds.
