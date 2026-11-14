## What changed and why

<!-- Plain words. -->

## Checklist

- [ ] A change to a port, a binding key or a skill's interface updates `references/architecture.md`.
- [ ] A change to what a skill, gate, hook or `init` does updates its `docs/behaviour/*.feature` and the guide chapter in `docs/guide/`.
- [ ] A finished `docs/roadmap.md` item is removed.
- [ ] `npm run build` ran and `dist/` and `docs/guide.html` are committed.
- [ ] `.claude-plugin/plugin.json` `version` equals `package.json` `version`.
- [ ] `npm run typecheck` and `npm test` pass.
