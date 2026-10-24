// Compatibilidad hasta el 2026-11-24: `kratos …` sigue funcionando y avisa del nombre nuevo (ver docs/aceptacion-hito11.md).
console.warn("Aviso: kratos ahora se llama nomos; usa scripts/nomos.ts");
await import("./nomos.ts");
