/** Drizzle wraps driver errors in `cause`, so walk the chain looking for the named unique violation. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (let current = error; typeof current === 'object' && current !== null;) {
    if (
      'code' in current &&
      current.code === '23505' &&
      'constraint' in current &&
      current.constraint === constraint
    ) {
      return true;
    }
    current = 'cause' in current ? current.cause : null;
  }
  return false;
}
