# circular-dependency

Esta fixture verifica que el framework falle correctamente al detectar dependencias circulares entre módulos en tiempo de arranque.

**Nota importante**: La versión "boot exitoso con solo un `WARN`" que describía el plan original **no ocurre en runtime**. La detección de ciclos (en `step-07-validations.ts`) solo corre dentro de `if (config.strict)`, y no hay una rama alternativa que loguee algo si `strict` es `false`. La versión "warn, no bloqueante" solo existe actualmente en `kerith check` (CLI), lo cual está fuera del alcance de este paquete.

Por ello, esta fixture utiliza un archivo `kerith.config.ts` con **`strict: true`**, y espera un fallo de tipo `CIRCULAR_DEPENDENCY`.
