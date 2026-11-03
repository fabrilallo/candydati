// TypeScript 6 checks side-effect imports such as `import './custom.css'`;
// Vite bundles the stylesheet, so declare CSS modules for the type checker.
declare module '*.css'
