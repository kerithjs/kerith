# fixtures

Snapshot reference projects for integration tests.

Each subdirectory here is a **frozen** expected output for one generator scenario.
Tests in `../` compare live generator output against these fixtures.

```
fixtures/
├── core-project/     # expected output of generateCoreTemplate
└── app-project/      # expected output of applyAppTemplate over core-project
```

> Do NOT edit these manually — regenerate them with the fixture-update script
> once the generators are implemented and verified.
