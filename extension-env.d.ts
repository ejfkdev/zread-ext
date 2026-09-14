// Required Extension.js types for TypeScript projects.
// This file is auto-generated and should not be excluded.
// If you need additional types, consider creating a new *.d.ts file and
// referencing it in the "include" array of your tsconfig.json file.
// See https://www.typescriptlang.org/tsconfig#include for more information.
/// <reference types="extension/types" />

// Polyfill types for browser.* APIs
/// <reference types="extension/types/polyfill" />

// Asset and stylesheet imports. These wildcard declarations also live in
// extension/types, but TypeScript 7 native does not apply them through the
// reference above, so they are emitted here as well.
declare module '*.css' {
  const content: Readonly<Record<string, string>>
  export default content
}
declare module '*.module.css' {
  const content: Readonly<Record<string, string>>
  export default content
}
declare module '*.module.scss' {
  const content: Readonly<Record<string, string>>
  export default content
}
declare module '*.module.sass' {
  const content: Readonly<Record<string, string>>
  export default content
}
declare module '*.png' {
  const content: string
  export default content
}
declare module '*.jpg' {
  const content: string
  export default content
}
declare module '*.jpeg' {
  const content: string
  export default content
}
declare module '*.gif' {
  const content: string
  export default content
}
declare module '*.webp' {
  const content: string
  export default content
}
declare module '*.avif' {
  const content: string
  export default content
}
declare module '*.ico' {
  const content: string
  export default content
}
declare module '*.bmp' {
  const content: string
  export default content
}
declare module '*.svg' {
  const content: any
  export default content
}
