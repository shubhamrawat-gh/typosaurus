import http from 'node:http';
import crypto from 'node:crypto';
import { biometricsEngine, RawKeystrokeEvent } from './anticheat/keystroke-biometrics';
import { raceEngine, RacerProgress } from './multiplayer/race-engine';
import { rankingEngine } from './leaderboard/ranking-engine';
import { telemetryPipeline, KeystrokeTelemetryEvent } from './analytics/telemetry-pipeline';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

// WebSocket active clients map: socketId -> { socket, roomId?, racerId? }
interface ClientConn {
  socket: any;
  roomId?: string;
  racerId?: string;
}
const clients = new Map<string, ClientConn>();

// Helper to send JSON response
function sendJson(res: http.ServerResponse, status: number, data: any): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(body);
}

// Helper to parse JSON body
function parseBody<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

// RFC 6455 Frame Encoder (Server to Client: unmasked text frames)
function encodeWebSocketFrame(message: string): Buffer {
  const payload = Buffer.from(message, 'utf-8');
  const length = payload.length;

  let header: Buffer;
  if (length <= 125) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text opcode
    header[1] = length;
  } else if (length <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  return Buffer.concat([header, payload]);
}

// RFC 6455 Frame Decoder (Client to Server: masked text frames)
function decodeWebSocketFrame(buffer: Buffer): { message?: string; opcode: number; rest: Buffer } | null {
  if (buffer.length < 2) return null;

  const firstByte = buffer[0];
  const secondByte = buffer[1];
  const opcode = firstByte & 0x0f;
  const isMasked = (secondByte & 0x80) !== 0;
  let payloadLength = secondByte & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < 4) return null;
    payloadLength = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLength === 127) {
    if (buffer.length < 10) return null;
    payloadLength = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }

  let maskingKey: Buffer | null = null;
  if (isMasked) {
    if (buffer.length < offset + 4) return null;
    maskingKey = buffer.subarray(offset, offset + 4);
    offset += 4;
  }

  if (buffer.length < offset + payloadLength) return null;

  const payload = Buffer.from(buffer.subarray(offset, offset + payloadLength));
  const rest = Buffer.from(buffer.subarray(offset + payloadLength));

  if (isMasked && maskingKey) {
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= maskingKey[i % 4];
    }
  }

  return {
    message: opcode === 1 ? payload.toString('utf-8') : undefined,
    opcode,
    rest,
  };
}

// Broadcast to all clients in a room
function broadcastToRoom(roomId: string, data: any): void {
  const frame = encodeWebSocketFrame(JSON.stringify(data));
  for (const client of clients.values()) {
    if (client.roomId === roomId && !client.socket.destroyed) {
      client.socket.write(frame);
    }
  }
}

// Wire RaceEngine events to WebSocket broadcasts
raceEngine.on('racer_joined', ({ roomId, racer }: { roomId: string; racer: any }) => {
  broadcastToRoom(roomId, { event: 'RACER_JOINED', racer });
});

raceEngine.on('racer_left', ({ roomId, racerId }: { roomId: string; racerId: string }) => {
  broadcastToRoom(roomId, { event: 'RACER_LEFT', racerId });
});

raceEngine.on('racer_ready', ({ roomId, racerId, isReady }: { roomId: string; racerId: string; isReady: boolean }) => {
  broadcastToRoom(roomId, { event: 'RACER_READY', racerId, isReady });
});

raceEngine.on('countdown_started', ({ roomId, startsInMs, raceStartTime }: { roomId: string; startsInMs: number; raceStartTime: number }) => {
  broadcastToRoom(roomId, { event: 'COUNTDOWN_STARTED', startsInMs, raceStartTime });
});

raceEngine.on('race_started', ({ roomId, raceStartTime }: { roomId: string; raceStartTime: number }) => {
  broadcastToRoom(roomId, { event: 'RACE_STARTED', raceStartTime });
});

raceEngine.on('racer_finished', ({ roomId, racer }: { roomId: string; racer: any }) => {
  broadcastToRoom(roomId, { event: 'RACER_FINISHED', racer });
});

raceEngine.on('race_finished', ({ roomId, podium }: { roomId: string; podium: any }) => {
  broadcastToRoom(roomId, { event: 'RACE_FINISHED', podium });
});

// Setup HTTP Server
export const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    // 1. Health Endpoint
    if (req.method === 'GET' && (pathname === '/health' || pathname === '/api/v1/health')) {
      const mem = process.memoryUsage();
      sendJson(res, 200, {
        status: 'online',
        service: 'Typosaurus Enterprise Server',
        version: '1.0.0',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: Date.now(),
        memory: {
          heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
          rssMB: Math.round(mem.rss / 1024 / 1024),
        },
        activeRaceRooms: raceEngine.getAllActiveRooms().length,
        connectedSockets: clients.size,
        telemetryPipeline: telemetryPipeline.getStats(),
      });
      return;
    }

    // 2. Anti-Cheat Biometric Verification Endpoint
    if (req.method === 'POST' && pathname === '/api/v1/verify') {
      const body = await parseBody<{ telemetry: RawKeystrokeEvent[]; durationMs: number }>(req);
      if (!body.telemetry || typeof body.durationMs !== 'number') {
        sendJson(res, 400, { error: 'Missing telemetry or durationMs in payload' });
        return;
      }

      const report = biometricsEngine.analyze(body.telemetry, body.durationMs);
      sendJson(res, 200, report);
      return;
    }

    // 3. Leaderboard Submission Endpoint
    if (req.method === 'POST' && pathname === '/api/v1/leaderboard/submit') {
      const body = await parseBody<{
        userId: string;
        username: string;
        mode: string;
        wpm: number;
        rawWpm: number;
        accuracy: number;
        isVerified?: boolean;
        certificateId?: string;
      }>(req);

      if (!body.userId || !body.username || !body.mode || typeof body.wpm !== 'number') {
        sendJson(res, 400, { error: 'Invalid leaderboard submission payload' });
        return;
      }

      const result = rankingEngine.submitScore({
        userId: body.userId,
        username: body.username,
        mode: body.mode,
        wpm: body.wpm,
        rawWpm: body.rawWpm || body.wpm,
        accuracy: body.accuracy || 100,
        isVerified: !!body.isVerified,
        certificateId: body.certificateId,
      });

      sendJson(res, 201, result);
      return;
    }

    // 4. Leaderboard Query Endpoint
    if (req.method === 'GET' && pathname === '/api/v1/leaderboard') {
      const mode = url.searchParams.get('mode') || 'time-30';
      const limit = Math.min(100, parseInt(url.searchParams.get('limit') || '50', 10));
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);
      const userId = url.searchParams.get('userId');

      const top = rankingEngine.getTop(mode, limit, offset);
      const userRank = userId ? rankingEngine.getUserRank(mode, userId) : null;
      const distribution = rankingEngine.getDistribution(mode);

      sendJson(res, 200, {
        ...top,
        userRank,
        distribution,
      });
      return;
    }

    // 5. Multiplayer Room Creation Endpoint
    if (req.method === 'POST' && pathname === '/api/v1/rooms/create') {
      const body = await parseBody<{
        mode?: 'words' | 'time' | 'code';
        wordCount?: number;
        duration?: number;
        codeLanguage?: string;
        words?: string[];
      }>(req);

      const defaultWords = ['the', 'quick', 'brown', 'fox', 'jumps', 'over', 'the', 'lazy', 'dog', 'and', 'runs', 'into', 'the', 'forest', 'with', 'blazing', 'speed', 'and', 'agility', 'through', 'the', 'trees', 'under', 'the', 'starlight'];
      const room = raceEngine.createRoom({
        mode: body.mode || 'words',
        wordCount: body.wordCount || 25,
        duration: body.duration || 30,
        codeLanguage: body.codeLanguage,
        words: body.words || defaultWords,
      });

      sendJson(res, 201, {
        roomId: room.id,
        code: room.code,
        config: room.config,
        status: room.status,
      });
      return;
    }

    // 6. Multiplayer Room Status Endpoint
    if (req.method === 'GET' && pathname.startsWith('/api/v1/rooms/')) {
      const idOrCode = pathname.replace('/api/v1/rooms/', '');
      const room = raceEngine.getRoom(idOrCode);
      if (!room) {
        sendJson(res, 404, { error: `Room '${idOrCode}' not found` });
        return;
      }

      sendJson(res, 200, {
        id: room.id,
        code: room.code,
        status: room.status,
        config: room.config,
        countdownStart: room.countdownStart,
        raceStart: room.raceStart,
        racers: Array.from(room.racers.values()),
      });
      return;
    }

    // 7. Telemetry Ingest Endpoint (High-Throughput)
    if (req.method === 'POST' && pathname === '/api/v1/telemetry/ingest') {
      const body = await parseBody<{ events: KeystrokeTelemetryEvent[] }>(req);
      if (!Array.isArray(body.events)) {
        sendJson(res, 400, { error: 'Expected array of telemetry events' });
        return;
      }

      const result = telemetryPipeline.ingestBatch(body.events);
      sendJson(res, 202, { status: 'buffered', ...result });
      return;
    }

    // 8. Global Stats
    if (req.method === 'GET' && pathname === '/api/v1/stats') {
      sendJson(res, 200, {
        leaderboardModes: ['time-15', 'time-30', 'time-60', 'words-25', 'words-50', 'code-typescript'],
        totalRoomsActive: raceEngine.getAllActiveRooms().length,
        telemetry: telemetryPipeline.getStats(),
      });
      return;
    }

    // 404 Fallback
    sendJson(res, 404, { error: 'Not Found', path: pathname });
  } catch (err: any) {
    sendJson(res, 500, { error: err.message || 'Internal Server Error' });
  }
});

// Setup RFC 6455 WebSocket Upgrade Handler
server.on('upgrade', (req, socket, head) => {
  const upgradeHeader = req.headers['upgrade'];
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    socket.destroy();
    return;
  }

  const clientKey = req.headers['sec-websocket-key'];
  if (!clientKey) {
    socket.destroy();
    return;
  }

  // WebSocket Handshake response
  const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
  const acceptKey = crypto.createHash('sha1').update(clientKey + GUID).digest('base64');

  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
    '\r\n',
  ];
  socket.write(responseHeaders.join('\r\n'));

  const clientId = `ws_${crypto.randomUUID().slice(0, 8)}`;
  const clientConn: ClientConn = { socket };
  clients.set(clientId, clientConn);

  let buffer: any = head && head.length > 0 ? head : Buffer.alloc(0);

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length > 0) {
      const decoded = decodeWebSocketFrame(buffer);
      if (!decoded) break;

      buffer = decoded.rest;

      // Handle Opcode 8 (Close)
      if (decoded.opcode === 8) {
        socket.end();
        break;
      }

      // Handle Opcode 9 (Ping) -> respond with Pong (Opcode 10)
      if (decoded.opcode === 9) {
        const pong = Buffer.from([0x8a, 0x00]);
        socket.write(pong);
        continue;
      }

      // Handle Opcode 1 (Text Frame)
      if (decoded.opcode === 1 && decoded.message) {
        try {
          const msg = JSON.parse(decoded.message);

          if (msg.type === 'JOIN') {
            const { roomId, racerId, nickname, color } = msg;
            clientConn.roomId = roomId;
            clientConn.racerId = racerId;
            raceEngine.joinRoom(roomId, { id: racerId, nickname, color });
            socket.write(encodeWebSocketFrame(JSON.stringify({ event: 'JOINED_SUCCESS', roomId, racerId })));
          } else if (msg.type === 'READY') {
            if (clientConn.roomId && clientConn.racerId) {
              raceEngine.setReady(clientConn.roomId, clientConn.racerId, !!msg.isReady);
            }
          } else if (msg.type === 'PROGRESS') {
            if (clientConn.roomId && clientConn.racerId && msg.progress) {
              raceEngine.updateProgress(clientConn.roomId, clientConn.racerId, msg.progress as RacerProgress);
              broadcastToRoom(clientConn.roomId, {
                event: 'PROGRESS_UPDATE',
                racerId: clientConn.racerId,
                progress: msg.progress,
              });
            }
          } else if (msg.type === 'PING') {
            socket.write(encodeWebSocketFrame(JSON.stringify({ event: 'PONG', timestamp: Date.now() })));
          }
        } catch (e) {
          // Ignore malformed frames
        }
      }
    }
  });

  const cleanup = () => {
    if (clientConn.roomId && clientConn.racerId) {
      raceEngine.leaveRoom(clientConn.roomId, clientConn.racerId);
    }
    clients.delete(clientId);
  };

  socket.on('close', cleanup);
  socket.on('error', cleanup);
});

// Start listening if run directly
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  server.listen(PORT, HOST, () => {
    console.log(`\n🚀 Typosaurus Enterprise Backend running at http://${HOST}:${PORT}`);
    console.log(`⚡ WebSocket endpoint ready at ws://${HOST}:${PORT}/ws\n`);
  });
}
