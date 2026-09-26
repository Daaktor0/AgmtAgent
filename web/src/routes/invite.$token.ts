import { createFileRoute } from "@tanstack/react-router";

// Invite links from the first beta week. Access now belongs to an account, so
// an old link just opens the app (where its owner signs in) and clears the
// cookie it used to set.
export const Route = createFileRoute("/invite/$token")({
  server: {
    handlers: {
      GET: () =>
        new Response(null, {
          status: 302,
          headers: {
            location: "/",
            "cache-control": "private, no-store",
            "referrer-policy": "no-referrer",
            "set-cookie": "agmt_invite=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
          },
        }),
    },
  },
});
