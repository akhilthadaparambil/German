# DeutschLift

DeutschLift is a small German language learning website with an AI tutor chat, mini lessons, and quick exercises.

## Run It

On this machine, double-click `start-deutschlift.command`, or run:

```bash
/Users/akhilthadaparambil/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server.js
```

If Node and npm are installed normally, this also works:

```bash
npm start
```

Then open `http://localhost:3000`.

## Configuration

The AI tutor reads `OPENAI_API_KEY` from `.env.local`. You can optionally set `OPENAI_MODEL` there too.

```bash
OPENAI_MODEL=gpt-3.5-turbo
```

The API key stays on the server and is never exposed to the browser.

## Deploy

This project needs a Node.js host because `server.js` keeps the OpenAI API key private and serves `/api/chat`.

Upload these files/folders to GitHub:

```text
.env.example
.gitignore
README.md
package.json
server.js
public/
```

Do not upload `.env.local`; it contains the private API key. In your deployment provider, add these environment variables:

```text
OPENAI_API_KEY=<your key>
OPENAI_MODEL=gpt-3.5-turbo
```

Use this start command:

```bash
npm start
```
