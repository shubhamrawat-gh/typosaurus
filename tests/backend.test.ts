import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KeystrokeBiometricsEngine, RawKeystrokeEvent } from '../server/src/anticheat/keystroke-biometrics';
import { RaceEngine } from '../server/src/multiplayer/race-engine';
import { RankingEngine } from '../server/src/leaderboard/ranking-engine';
import { RingBuffer, TelemetryPipeline } from '../server/src/analytics/telemetry-pipeline';
import { server } from '../server/src/index';
import http from 'node:http';

describe('Enterprise Backend Architecture', () => {
  describe('Anti-Cheat & Keystroke Biometrics Engine', () => {
    let engine: KeystrokeBiometricsEngine;

    beforeEach(() => {
      engine = new KeystrokeBiometricsEngine('test_secret_key_123');
    });

    it('verifies legitimate human keystroke telemetry', () => {
      // Simulate realistic human typing with natural Gaussian/log-normal variance
      const telemetry: RawKeystrokeEvent[] = [];
      let currentTimestamp = 100;

      // Realistic words with natural variance (100ms - 180ms per key)
      const mockKeys = 'the quick brown fox jumps over the lazy dog and types fast'.split('');
      for (const char of mockKeys) {
        // Natural jitter between 110ms and 190ms
        const interval = 110 + Math.floor(Math.sin(currentTimestamp) * 35 + Math.cos(currentTimestamp * 2) * 25 + 30);
        currentTimestamp += interval;
        telemetry.push({
          timestamp: currentTimestamp,
          key: char,
          code: `Key${char.toUpperCase()}`,
          expected: char,
          status: 'correct',
        });
      }

      const totalDuration = currentTimestamp;
      const report = engine.analyze(telemetry, totalDuration);

      expect(report.isVerified).toBe(true);
      expect(report.botScore).toBeLessThan(0.35);
      expect(report.metrics.shannonEntropy).toBeGreaterThan(1.8);
      expect(report.metrics.cvIKI).toBeGreaterThan(0.12);
      expect(report.certificate).toBeDefined();
      expect(report.certificate?.signature).toBeDefined();

      // Verify certificate signature
      const isValidSig = engine.verifyCertificate(
        report.certificate!.certificateId,
        report.metrics.wpm,
        report.metrics.accuracy,
        report.metrics.shannonEntropy,
        report.certificate!.issuedAt,
        report.certificate!.signature
      );
      expect(isValidSig).toBe(true);
    });

    it('detects artificial constant-interval bot scripts', () => {
      // Simulate a bot script typing at an exact 50ms interval (zero motor variance)
      const telemetry: RawKeystrokeEvent[] = [];
      let currentTimestamp = 50;

      for (let i = 0; i < 60; i++) {
        currentTimestamp += 50; // Exact 50ms interval
        telemetry.push({
          timestamp: currentTimestamp,
          key: 'a',
          code: 'KeyA',
          expected: 'a',
          status: 'correct',
        });
      }

      const report = engine.analyze(telemetry, currentTimestamp);

      expect(report.isVerified).toBe(false);
      expect(report.botScore).toBeGreaterThanOrEqual(0.7);
      expect(report.reasons.some((r) => r.includes('uniformity') || r.includes('entropy'))).toBe(true);
      expect(report.certificate).toBeUndefined();
    });

    it('detects macro paste injections (<3ms interval)', () => {
      const telemetry: RawKeystrokeEvent[] = [
        { timestamp: 100, key: 'h', code: 'KeyH', expected: 'h', status: 'correct' },
        { timestamp: 101, key: 'e', code: 'KeyE', expected: 'e', status: 'correct' }, // 1ms
        { timestamp: 102, key: 'l', code: 'KeyL', expected: 'l', status: 'correct' }, // 1ms
        { timestamp: 103, key: 'l', code: 'KeyL', expected: 'l', status: 'correct' }, // 1ms
        { timestamp: 104, key: 'o', code: 'KeyO', expected: 'o', status: 'correct' }, // 1ms
        { timestamp: 200, key: ' ', code: 'Space', expected: ' ', status: 'correct' },
      ];

      const report = engine.analyze(telemetry, 200);
      expect(report.isVerified).toBe(false);
      expect(report.metrics.pasteEventsDetected).toBeGreaterThan(2);
      expect(report.reasons.some((r) => r.includes('paste/macro'))).toBe(true);
    });

    it('rejects tampered certificate verification', () => {
      const isFakeValid = engine.verifyCertificate(
        'cert_fake123',
        180, // claimed WPM
        100,
        4.5,
        Date.now(),
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      );
      expect(isFakeValid).toBe(false);
    });
  });

  describe('Real-Time Multiplayer Race Engine', () => {
    let raceEngine: RaceEngine;

    beforeEach(() => {
      raceEngine = new RaceEngine();
    });

    it('manages room creation, joining, and player lifecycle', () => {
      const room = raceEngine.createRoom({
        mode: 'words',
        wordCount: 10,
        words: ['fast', 'typing', 'race', 'engine'],
      });

      expect(room.id).toBeDefined();
      expect(room.code.length).toBe(6);
      expect(room.status).toBe('LOBBY');

      const { racer: r1 } = raceEngine.joinRoom(room.id, { id: 'p1', nickname: 'Speedy' });
      const { racer: r2 } = raceEngine.joinRoom(room.code, { id: 'p2', nickname: 'Flash' });

      expect(room.racers.size).toBe(2);
      expect(r1.nickname).toBe('Speedy');
      expect(r2.nickname).toBe('Flash');

      // Start race
      room.status = 'ACTIVE';

      // Update progress
      raceEngine.updateProgress(room.id, 'p1', {
        wordIndex: 2,
        charIndex: 5,
        progressPercent: 50,
        wpm: 110,
        accuracy: 98,
      });

      expect(room.racers.get('p1')?.progress.progressPercent).toBe(50);

      // Finish player 1
      raceEngine.updateProgress(room.id, 'p1', {
        wordIndex: 4,
        charIndex: 0,
        progressPercent: 100,
        wpm: 115,
        accuracy: 98,
      });

      expect(room.racers.get('p1')?.isFinished).toBe(true);
      expect(room.racers.get('p1')?.rank).toBe(1);

      // Player leaves
      raceEngine.leaveRoom(room.id, 'p2');
      expect(room.racers.size).toBe(1);
    });

    it('enforces maximum player limits per room', () => {
      const room = raceEngine.createRoom({
        mode: 'words',
        maxPlayers: 2,
        words: ['test'],
      });

      raceEngine.joinRoom(room.id, { id: 'p1', nickname: 'P1' });
      raceEngine.joinRoom(room.id, { id: 'p2', nickname: 'P2' });

      expect(() => {
        raceEngine.joinRoom(room.id, { id: 'p3', nickname: 'P3' });
      }).toThrow(/full/);
    });
  });

  describe('Global Leaderboard & Percentile Ranking Engine', () => {
    let ranking: RankingEngine;

    beforeEach(() => {
      ranking = new RankingEngine();
    });

    it('sorts scores by WPM and assigns competitive tiers', () => {
      const res1 = ranking.submitScore({
        userId: 'u_champion',
        username: 'champion',
        mode: 'test-mode',
        wpm: 210,
        rawWpm: 220,
        accuracy: 99.5,
        isVerified: true,
      });

      const res2 = ranking.submitScore({
        userId: 'u_noob',
        username: 'learner',
        mode: 'test-mode',
        wpm: 45,
        rawWpm: 50,
        accuracy: 90.0,
        isVerified: true,
      });

      expect(res1.rank).toBe(1);
      expect(res1.tier).toBe('Grandmaster');

      expect(res2.rank).toBe(2);
      expect(res2.percentile).toBe(50);

      const top = ranking.getTop('test-mode', 10);
      expect(top.entries[0].username).toBe('champion');
      expect(top.entries[1].username).toBe('learner');
    });

    it('breaks ties using accuracy percentage', () => {
      ranking.submitScore({
        userId: 'u1',
        username: 'User95Acc',
        mode: 'tie-mode',
        wpm: 120,
        rawWpm: 120,
        accuracy: 95.0,
        isVerified: true,
      });

      ranking.submitScore({
        userId: 'u2',
        username: 'User99Acc',
        mode: 'tie-mode',
        wpm: 120,
        rawWpm: 120,
        accuracy: 99.0,
        isVerified: true,
      });

      const top = ranking.getTop('tie-mode', 5);
      expect(top.entries[0].username).toBe('User99Acc'); // higher accuracy wins tie
      expect(top.entries[1].username).toBe('User95Acc');
    });

    it('computes WPM distribution histogram', () => {
      const dist = ranking.getDistribution('time-30');
      expect(dist.length).toBeGreaterThan(0);
      const totalCount = dist.reduce((sum, b) => sum + b.count, 0);
      expect(totalCount).toBeGreaterThan(0);
    });
  });

  describe('High-Throughput Telemetry Pipeline', () => {
    it('buffers and drains events using circular ring buffer with zero allocation', () => {
      const ring = new RingBuffer<number>(16);

      for (let i = 0; i < 10; i++) {
        expect(ring.push(i)).toBe(true);
      }
      expect(ring.size()).toBe(10);

      const drained = ring.drain(5);
      expect(drained).toEqual([0, 1, 2, 3, 4]);
      expect(ring.size()).toBe(5);

      // Push more to wrap around ring
      for (let i = 10; i < 20; i++) {
        expect(ring.push(i)).toBe(true);
      }
      expect(ring.size()).toBe(15);
    });

    it('ingests batch telemetry in pipeline', () => {
      const pipeline = new TelemetryPipeline(1024, 100);

      const events = Array.from({ length: 50 }, (_, i) => ({
        userId: 'usr_test',
        testId: 'test_1',
        timestamp: i * 50,
        key: 'a',
        code: 'KeyA',
        status: 'correct' as const,
      }));

      const res = pipeline.ingestBatch(events);
      expect(res.ingested).toBe(50);
      expect(res.dropped).toBe(0);

      const stats = pipeline.getStats();
      expect(stats.totalIngested).toBe(50);

      pipeline.flush();
      expect(pipeline.getStats().totalFlushed).toBe(50);
      pipeline.stop();
    });
  });

  describe('HTTP REST API Server Endpoints', () => {
    let testPort: number;
    let testServer: http.Server;

    beforeEach(async () => {
      testServer = http.createServer(server.listeners('request')[0] as any);
      await new Promise<void>((resolve) => {
        testServer.listen(0, '127.0.0.1', () => {
          testPort = (testServer.address() as any).port;
          resolve();
        });
      });
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => testServer.close(() => resolve()));
    });

    it('responds to GET /health with system telemetry', async () => {
      const res = await fetch(`http://127.0.0.1:${testPort}/health`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('online');
      expect(data.service).toContain('Typosaurus');
      expect(data.memory).toBeDefined();
    });

    it('verifies telemetry via POST /api/v1/verify', async () => {
      const telemetry: RawKeystrokeEvent[] = [
        { timestamp: 100, key: 'a', code: 'KeyA', expected: 'a', status: 'correct' },
        { timestamp: 250, key: 'b', code: 'KeyB', expected: 'b', status: 'correct' },
        { timestamp: 390, key: 'c', code: 'KeyC', expected: 'c', status: 'correct' },
        { timestamp: 540, key: 'd', code: 'KeyD', expected: 'd', status: 'correct' },
        { timestamp: 680, key: 'e', code: 'KeyE', expected: 'e', status: 'correct' },
        { timestamp: 810, key: ' ', code: 'Space', expected: ' ', status: 'correct' },
      ];

      const res = await fetch(`http://127.0.0.1:${testPort}/api/v1/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telemetry, durationMs: 810 }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.isVerified).toBe(true);
      expect(data.metrics.wpm).toBeGreaterThan(0);
      expect(data.certificate).toBeDefined();
    });

    it('creates race rooms via POST /api/v1/rooms/create', async () => {
      const res = await fetch(`http://127.0.0.1:${testPort}/api/v1/rooms/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'words', wordCount: 25 }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.roomId).toBeDefined();
      expect(data.code).toHaveLength(6);
      expect(data.status).toBe('LOBBY');
    });

    it('submits and retrieves leaderboard rankings via /api/v1/leaderboard', async () => {
      const submitRes = await fetch(`http://127.0.0.1:${testPort}/api/v1/leaderboard/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'usr_api_test',
          username: 'ApiTester',
          mode: 'time-30',
          wpm: 165,
          accuracy: 99.0,
          isVerified: true,
        }),
      });

      expect(submitRes.status).toBe(201);
      const submitData = await submitRes.json();
      expect(submitData.rank).toBeGreaterThanOrEqual(1);

      const queryRes = await fetch(`http://127.0.0.1:${testPort}/api/v1/leaderboard?mode=time-30&userId=usr_api_test`);
      expect(queryRes.status).toBe(200);
      const queryData = await queryRes.json();
      expect(queryData.entries.length).toBeGreaterThan(0);
      expect(queryData.userRank).toBeDefined();
      expect(queryData.userRank.entry.username).toBe('ApiTester');
    });
  });
});
