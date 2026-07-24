# Contributing to paper

Thanks for helping improve paper.

## Development

1. Fork the repository and create a focused branch.
2. Run `npm ci`.
3. Copy `env.example` to `.env` and add only the keys needed for your change.
4. Run the app with `npm run dev`.
5. Run `npm test`, `npm run build:analytics`, and `node --check server.js`.

Never commit API keys, wallet secrets, `.env`, logs, databases, or generated browser profiles.

## Pull requests

- Keep each pull request focused on one change.
- Explain the user-facing impact and how it was tested.
- Include screenshots for visual changes.
- Add or update tests when behavior changes.
- Preserve accessibility, responsive layouts, and light/dark themes.

By contributing, you agree that your contribution is licensed under the MIT License.
