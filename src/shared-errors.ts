const SHARED_ERROR_REGISTRY = Symbol.for(
  "@nidh-eesh/bug-report/v1/error-constructors",
);

type StoredErrorConstructor = new (...args: never[]) => Error;

function getErrorRegistry(): Map<string, StoredErrorConstructor> {
  const target = globalThis as Record<PropertyKey, unknown>;
  const existing = target[SHARED_ERROR_REGISTRY];
  if (existing instanceof Map) {
    return existing as Map<string, StoredErrorConstructor>;
  }

  const registry = new Map<string, StoredErrorConstructor>();
  Object.defineProperty(target, SHARED_ERROR_REGISTRY, { value: registry });
  return registry;
}

/**
 * Reuses public error constructors across separately bundled package entries.
 * This keeps `instanceof` and constructor identity reliable for ESM, CJS, and
 * subpath imports without coupling the package to a specific bundler layout.
 */
export function shareErrorConstructor<
  TError extends Error,
  TArguments extends unknown[],
>(
  name: string,
  implementation: new (...args: TArguments) => TError,
): new (...args: TArguments) => TError {
  const registry = getErrorRegistry();
  const existing = registry.get(name);
  if (existing) {
    return existing as unknown as new (...args: TArguments) => TError;
  }

  registry.set(name, implementation as unknown as StoredErrorConstructor);
  return implementation;
}
