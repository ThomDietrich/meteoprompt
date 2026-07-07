// Test stub for the `server-only` npm package.
//
// The real module throws the moment it is imported outside a React Server
// Component bundle. Several lib files (`flux.ts`, `summary.ts`, `transforms.ts`)
// carry a bare `import "server-only";` purely as a build-time guard. Under vitest
// there is no RSC bundle, so `vitest.config.ts` aliases `server-only` to this
// empty module — the guarded files then load fine and their pure exports can be
// exercised directly.
export {};
