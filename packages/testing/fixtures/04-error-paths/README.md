# 04-error-paths

Ejercita el manejo de errores en bootstrap con `runFixtureExpectingFailure`:

- Dos módulos declaran el mismo nombre (`alpha`) en directorios distintos → provoca `DUPLICATE_MODULE`
- El proceso debe auto-terminar con código de salida `1` antes de que el health-gate pase
- El test verifica que el código `DUPLICATE_MODULE` aparece en stdout/stderr
- Ningún endpoint responde porque el servidor nunca llega a arrancar
