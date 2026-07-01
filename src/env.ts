function readEnvValue(key: keyof ImportMetaEnv): string | undefined {
  const value = import.meta.env[key];
  if (typeof value !== "string") return undefined;

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : undefined;
}

export function readAppEnv(...keys: Array<keyof ImportMetaEnv>): string | undefined {
  for (const key of keys) {
    const value = readEnvValue(key);
    if (value) return value;
  }

  return undefined;
}
