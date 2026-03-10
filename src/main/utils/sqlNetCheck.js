import dns from 'dns/promises';
import net from 'net';

export function parsePort(portValue, fallback = 1433) {
  const n = Number(portValue);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export async function preflightSqlTcp(host, port, timeoutMs = 5000) {
  const cleanHost = String(host || '').trim();
  const cleanPort = parsePort(port, 1433);
  if (!cleanHost) throw new Error('Server host is missing');

  try {
    await dns.lookup(cleanHost);
  } catch (error) {
    throw new Error(`DNS lookup failed for ${cleanHost}: ${error.message}`);
  }

  await new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(true);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish());
    socket.once('timeout', () =>
      finish(new Error(`TCP ${cleanHost}:${cleanPort} unreachable (timeout ${timeoutMs}ms)`))
    );
    socket.once('error', (err) => finish(new Error(`TCP ${cleanHost}:${cleanPort} error: ${err.message}`)));
    socket.connect(cleanPort, cleanHost);
  });
}
