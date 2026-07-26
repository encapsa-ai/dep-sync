export function displayVersion(version: string): string {
  return version === "unknown" || version === "unversioned"
    ? version
    : `v${version}`;
}

export function packageShortName(name: string): string {
  const slash = name.lastIndexOf("/");
  return slash >= 0 ? name.slice(slash + 1) : name;
}

