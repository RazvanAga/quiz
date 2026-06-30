# No app-level auth; nginx Basic Auth gates `/admin`

The application has no login, sessions, or OAuth. Instead, the `/admin` area is protected at the reverse proxy: nginx HTTP Basic Auth (an `.htpasswd` file) gates the `/admin` location. The Player flow (`quiz.domeniu.com`) stays fully open. This keeps the app code auth-free as intended while stopping random visitors and crawlers from reaching the authoring/destructive surface on a public domain.

## Consequences

- There is intentionally no auth code in the app — protection lives entirely in the nginx config, which must be deployed for `/admin` to be safe. Running the app without that nginx gate exposes Quiz create/edit/delete and History to anyone.
- Can be replaced later with real in-app auth without touching gameplay; until then, destructive Admin actions also require an in-app confirm dialog.
