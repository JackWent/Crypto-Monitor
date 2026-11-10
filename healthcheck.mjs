// Container healthcheck. The runtime image has no shell or curl, so this runs under node.
const port = process.env.PORT || 7050;

try {
  const res = await fetch(`http://localhost:${port}/healthz`, { signal: AbortSignal.timeout(5000) });
  process.exit(res.ok ? 0 : 1);
} catch {
  process.exit(1);
}
