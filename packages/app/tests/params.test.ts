import { describe, it, expect } from 'vitest';
import { Body, Param, Query, Headers, Req, Res } from '../src/decorators/params.js';
import { KERITH_PARAMS } from '../src/decorators/symbols.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function getParams(proto: object, handlerKey: string) {
  return (proto as any)[KERITH_PARAMS]?.[handlerKey];
}

// ─── Individual decorators ────────────────────────────────────────────────────

describe('@Body()', () => {
  it('should write source:"body" with correct index', () => {
    class Ctrl {
      handler(@Body() body: any) {}
    }

    const params = getParams(Ctrl.prototype, 'handler');
    expect(params).toHaveLength(1);
    expect(params[0]).toEqual({ index: 0, source: 'body', key: undefined });
  });
});

describe('@Param()', () => {
  it('should write source:"param" without key when called with no argument', () => {
    class Ctrl {
      handler(@Param() params: any) {}
    }

    const params = getParams(Ctrl.prototype, 'handler');
    expect(params[0]).toEqual({ index: 0, source: 'param', key: undefined });
  });

  it('should write source:"param" with key when called with a string argument', () => {
    class Ctrl {
      handler(@Param('id') id: string) {}
    }

    const params = getParams(Ctrl.prototype, 'handler');
    expect(params[0]).toEqual({ index: 0, source: 'param', key: 'id' });
  });
});

describe('@Query()', () => {
  it('should write source:"query" without key when called with no argument', () => {
    class Ctrl {
      handler(@Query() query: any) {}
    }

    const params = getParams(Ctrl.prototype, 'handler');
    expect(params[0]).toEqual({ index: 0, source: 'query', key: undefined });
  });

  it('should write source:"query" with key when called with a string argument', () => {
    class Ctrl {
      handler(@Query('search') search: string) {}
    }

    const params = getParams(Ctrl.prototype, 'handler');
    expect(params[0]).toEqual({ index: 0, source: 'query', key: 'search' });
  });
});

describe('@Headers()', () => {
  it('should write source:"headers" without key when called with no argument', () => {
    class Ctrl {
      handler(@Headers() headers: any) {}
    }

    const params = getParams(Ctrl.prototype, 'handler');
    expect(params[0]).toEqual({ index: 0, source: 'headers', key: undefined });
  });

  it('should write source:"headers" with key when called with a string argument', () => {
    class Ctrl {
      // Note: Express lowercases all header names — use lowercase keys
      handler(@Headers('content-type') ct: string) {}
    }

    const params = getParams(Ctrl.prototype, 'handler');
    expect(params[0]).toEqual({ index: 0, source: 'headers', key: 'content-type' });
  });
});

describe('@Req()', () => {
  it('should write source:"req" with correct index', () => {
    class Ctrl {
      handler(@Req() req: any) {}
    }

    const params = getParams(Ctrl.prototype, 'handler');
    expect(params[0]).toEqual({ index: 0, source: 'req', key: undefined });
  });
});

describe('@Res()', () => {
  it('should write source:"res" with correct index', () => {
    class Ctrl {
      handler(@Res() res: any) {}
    }

    const params = getParams(Ctrl.prototype, 'handler');
    expect(params[0]).toEqual({ index: 0, source: 'res', key: undefined });
  });
});

// ─── Multi-param + gaps ───────────────────────────────────────────────────────

describe('Multiple params on one handler (including gaps)', () => {
  it('should record correct index for each decorator when params are mixed with undecorated ones', () => {
    class Ctrl {
      // index 0 → @Body, index 1 → no decorator (gap), index 2 → @Query('id')
      handler(@Body() body: any, req: any, @Query('id') id: string) {}
    }

    const params = getParams(Ctrl.prototype, 'handler');
    expect(params).toHaveLength(2);

    const bodyDef = params.find((p: any) => p.source === 'body');
    const queryDef = params.find((p: any) => p.source === 'query');

    expect(bodyDef).toEqual({ index: 0, source: 'body', key: undefined });
    expect(queryDef).toEqual({ index: 2, source: 'query', key: 'id' });
  });
});

// ─── Constructor guard (Fase 2.0) ─────────────────────────────────────────────

describe('Constructor param decorator guard', () => {
  it('should throw TypeError when a param decorator is applied to a constructor parameter', () => {
    expect(() => {
      // TypeScript passes propertyKey=undefined for constructor params.
      // We simulate the exact runtime call the TS compiler emits.
      Body()(Object.prototype, undefined, 0);
    }).toThrow(TypeError);

    expect(() => {
      Body()(Object.prototype, undefined, 0);
    }).toThrow('Param decorators are not supported on constructors');
  });
});

// ─── Isolation between methods (Fase 2.0 / 2.2) ───────────────────────────────

describe('Params isolation between methods on the same class', () => {
  it('should keep each method\'s params in its own slot and not cross-contaminate', () => {
    class Ctrl {
      getOne(@Param('id') id: string) {}
      create(@Body() body: any) {}
    }

    const getOneParams = getParams(Ctrl.prototype, 'getOne');
    const createParams = getParams(Ctrl.prototype, 'create');

    expect(getOneParams).toHaveLength(1);
    expect(getOneParams[0]).toEqual({ index: 0, source: 'param', key: 'id' });

    expect(createParams).toHaveLength(1);
    expect(createParams[0]).toEqual({ index: 0, source: 'body', key: undefined });

    // Verify the underlying record has exactly two keys and no bleed-over
    const record = (Ctrl.prototype as any)[KERITH_PARAMS];
    expect(Object.keys(record)).toHaveLength(2);
    expect(record['getOne']).not.toEqual(record['create']);
  });
});
