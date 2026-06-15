import { Socket } from 'net';

const MPD_HOST = process.env['HOERMOND_MPD_HOST'] ?? '127.0.0.1';
const MPD_PORT = Number(process.env['HOERMOND_MPD_PORT'] ?? 6600);

/**
 * Response from MPD server is an array of key-value objects.
 * Each object represents a metadata block (file, directory, playlist entry).
 */
export type MpdResponse = Record<string, string>[];

/**
 * Low-level MPD client using TCP socket and command-response protocol.
 *
 * The MPD protocol is line-based:
 * - Commands are sent as text lines followed by newline
 * - Server responds with key: value pairs, ending with "OK\n" or "ACK [...]\n"
 * - Multiple blocks (e.g. multiple files) each start with a key that signals a new object
 *
 * This client maintains a queue of pending commands and buffers incoming data
 * to parse complete responses.
 */
export class MpdClient {
  private sock: Socket | null = null;
  private buffer = '';
  private queue: ((res: MpdResponse) => void)[] = [];
  private errQueue: ((err: Error) => void)[] = [];
  private ready = false;

  /**
   * Connect to MPD server. Resolves when greeting is received.
   * @throws Error if connection fails or greeting is not received
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = new Socket();
      this.sock = sock;
      sock.setEncoding('utf8');
      sock.connect(MPD_PORT, MPD_HOST);
      sock.once('error', reject);
      sock.on('data', (chunk: string) => this.onData(chunk));
      const onFirst = (chunk: string): void => {
        if (chunk.startsWith('OK MPD')) {
          this.ready = true;
          sock.off('data', onFirst);
          resolve();
        }
      };
      sock.on('data', onFirst);
    });
  }

  /**
   * Handle incoming data from socket. Accumulates in buffer and resolves
   * complete responses to waiting promise callbacks.
   */
  private onData(chunk: string): void {
    if (!this.ready) return;
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.findResponseEnd(this.buffer)) !== -1) {
      const raw = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx);
      this.resolveOne(raw);
    }
  }

  /**
   * Find the end of the next complete response in the buffer.
   * MPD responses end with either "OK\n" or "ACK [...]\n".
   * @returns index past the end marker, or -1 if no complete response found
   */
  private findResponseEnd(buf: string): number {
    const ok = buf.indexOf('OK\n');
    const ack = buf.search(/ACK \[.*\].*\n/);
    const ends = [ok === -1 ? Infinity : ok + 3, ack === -1 ? Infinity : buf.indexOf('\n', ack) + 1];
    const end = Math.min(...ends);
    return end === Infinity ? -1 : end;
  }

  /**
   * Resolve a single response (error or success).
   * If ACK error, pass to error callback. Otherwise parse and pass to success callback.
   */
  private resolveOne(raw: string): void {
    if (raw.startsWith('ACK')) {
      const rej = this.errQueue.shift();
      this.queue.shift();
      rej?.(new Error(`MPD error: ${raw.trim()}`));
      return;
    }
    const res = this.parse(raw.replace(/OK\n$/, ''));
    this.errQueue.shift();
    this.queue.shift()?.(res);
  }

  /**
   * Parse MPD response text into array of objects.
   * Each "file" or "directory" key signals the start of a new object.
   * @param text raw response without trailing "OK\n"
   * @returns array of parsed objects
   */
  private parse(text: string): MpdResponse {
    const out: MpdResponse = [];
    let cur: Record<string, string> | null = null;
    for (const line of text.split('\n')) {
      if (!line) continue;
      const sep = line.indexOf(': ');
      if (sep === -1) continue;
      const key = line.slice(0, sep);
      const val = line.slice(sep + 2);
      // Start a new object if we see "file"/"directory" again, or a duplicate key
      if (key === 'file' || key === 'directory' || (cur && key in cur)) {
        if (cur) out.push(cur);
        cur = {};
      }
      if (!cur) cur = {};
      cur[key] = val;
    }
    if (cur) out.push(cur);
    return out;
  }

  /**
   * Send a command to MPD and return the parsed response.
   * Commands are queued and resolved in order.
   * @param command e.g. "play", "status", "add \"/path/to/file\""
   * @returns parsed response array
   * @throws Error if not connected or server returns ACK error
   */
  send(command: string): Promise<MpdResponse> {
    return new Promise((resolve, reject) => {
      if (!this.sock || !this.ready) {
        reject(new Error('MPD not connected'));
        return;
      }
      this.queue.push(resolve);
      this.errQueue.push(reject);
      this.sock.write(command + '\n');
    });
  }

  /**
   * Close the connection to MPD.
   */
  close(): void {
    this.sock?.destroy();
    this.sock = null;
    this.ready = false;
  }
}
