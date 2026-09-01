# Client

The browser side of the XSP editor: React 19, Vite 7, Tailwind 4, CodeMirror 6
for the XML editor, TanStack Query for server state.

See the [root README](../README.md) for what the application is, how to run both
halves, and configuration. This file covers only the client.

## Commands

```bash
npm install
npm run dev         # Vite dev server, expects the API on its configured port
npm run test        # Vitest and Testing Library, jsdom
npm run lint        # ESLint, warnings are errors
npm run typecheck   # tsc -b, which is the one that checks anything
npm run build       # typecheck, then a production bundle into dist/
```

`npm run typecheck` runs `tsc -b` rather than `tsc --noEmit` on purpose. The root
tsconfig here has `"files": []` and only project references, so `--noEmit`
checked nothing at all and CI caught a type error that the local check had just
passed.

## Configuration

`VITE_API_URL` points the client at the API. See `.env.example`.

## Tests

Component tests live beside the components. Two things worth knowing before
adding more:

- The Testing Library default `asyncUtilTimeout` is one second, which is not
  enough under parallel jsdom load. `src/test/setup.ts` raises it to five, after
  a test failed roughly one run in four for no other reason.
- `mockResolvedValue` hands every caller the same `Response`, and a body can only
  be read once. Use the `mockFetch(make)` helper, which builds a fresh one per
  call.
