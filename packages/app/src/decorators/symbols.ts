// Use Symbol.for() so these symbols are in the global registry and can be
// recreated from any module (e.g. fixture files, @kerith/core's bridge) using
// the same key string. Symbol() would produce a unique-per-call symbol that
// cannot be cross-referenced outside the originating module.
export const KERITH_CONTROLLER = Symbol.for('kerith:controller');
export const KERITH_ROUTES = Symbol.for('kerith:routes');

