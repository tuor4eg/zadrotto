// Standalone service tests use the same no-op boundary as other server tests.
import Module from 'node:module';
import path from 'node:path';
process.env.NODE_PATH = [path.join(process.cwd(), 'tests/fixtures/node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
(Module as unknown as { _initPaths: () => void })._initPaths();
