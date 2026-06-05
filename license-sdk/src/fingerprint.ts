import os from 'os';
import crypto from 'crypto';

/**
 * Collect hardware fingerprint from this machine.
 * Returns "sha256:<hex>" — same format the license server expects.
 *
 * Combines: CPU model + core count + first non-internal MAC address.
 * Does NOT send raw hardware data — only the SHA-256 hash.
 */
export function collectFingerprint(): string {
  try {
    const cpus = os.cpus();
    const cpuModel = cpus[0]?.model?.trim() ?? 'unknown';
    const cpuCores = cpus.length;

    // Find first non-internal, non-loopback MAC address
    const interfaces = os.networkInterfaces();
    let mac = 'no-mac';
    outer: for (const ifaces of Object.values(interfaces)) {
      if (!ifaces) continue;
      for (const iface of ifaces) {
        if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
          mac = iface.mac;
          break outer;
        }
      }
    }

    const raw = `${cpuModel}|${cpuCores}|${mac}`;
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    return `sha256:${hash}`;
  } catch {
    // Fallback: hostname-based (less reliable but never crashes)
    const fallback = crypto.createHash('sha256').update(os.hostname()).digest('hex');
    return `sha256:${fallback}`;
  }
}
