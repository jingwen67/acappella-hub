# A Cappella Hub

A bilingual hub for member profiles, score sharing, and solo voting.

## Run locally

Requires Node.js 22 or newer.

```sh
npm start
```

Open `http://127.0.0.1:4173` on the computer running the app. Other devices on
the same network can use the network address printed in the terminal.

## Private data

Runtime data is stored in `data/` and is intentionally excluded from Git. This
includes accounts, password hashes, sessions, votes, avatars, and Google OAuth
configuration.
