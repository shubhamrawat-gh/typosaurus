import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

export type RoomStatus = 'LOBBY' | 'COUNTDOWN' | 'ACTIVE' | 'FINISHED';

export interface RacerProgress {
  wordIndex: number;
  charIndex: number;
  progressPercent: number; // 0 to 100
  wpm: number;
  accuracy: number;
}

export interface Racer {
  id: string;
  nickname: string;
  color: string;
  avatar?: string;
  progress: RacerProgress;
  isReady: boolean;
  isFinished: boolean;
  finishTimeMs?: number;
  rank?: number; // 1 = 1st place, 2 = 2nd, etc.
  joinedAt: number;
}

export interface RaceRoomConfig {
  mode: 'words' | 'time' | 'code';
  wordCount?: number;
  duration?: number;
  codeLanguage?: string;
  maxPlayers?: number;
  words: string[];
}

export interface RaceRoom {
  id: string;
  code: string; // 6-char friendly code e.g. "TYPO99"
  config: RaceRoomConfig;
  status: RoomStatus;
  createdAt: number;
  countdownStart?: number;
  raceStart?: number;
  raceEnd?: number;
  racers: Map<string, Racer>;
}

export interface RaceEventMap {
  'racer_joined': { roomId: string; racer: Racer };
  'racer_left': { roomId: string; racerId: string };
  'racer_ready': { roomId: string; racerId: string; isReady: boolean };
  'countdown_started': { roomId: string; startsInMs: number; raceStartTime: number };
  'race_started': { roomId: string; raceStartTime: number };
  'progress_broadcast': { roomId: string; racers: Array<{ id: string; progress: RacerProgress; rank?: number }> };
  'racer_finished': { roomId: string; racer: Racer };
  'race_finished': { roomId: string; podium: Racer[] };
}

export class RaceEngine extends EventEmitter {
  private rooms: Map<string, RaceRoom> = new Map();
  private matchmakingQueue: Array<{ racer: Racer; config: Partial<RaceRoomConfig>; resolve: (room: RaceRoom) => void }> = [];
  private matchmakingTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  /**
   * Generates a unique 6-character room code (e.g. "RAPID7")
   */
  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  /**
   * Creates a new multiplayer race room.
   */
  public createRoom(config: RaceRoomConfig): RaceRoom {
    const id = `race_${crypto.randomUUID().slice(0, 8)}`;
    const code = this.generateRoomCode();

    const room: RaceRoom = {
      id,
      code,
      config: {
        maxPlayers: 8,
        ...config,
      },
      status: 'LOBBY',
      createdAt: Date.now(),
      racers: new Map(),
    };

    this.rooms.set(id, room);
    this.rooms.set(code, room); // Map both UUID and friendly code

    return room;
  }

  public getRoom(idOrCode: string): RaceRoom | undefined {
    return this.rooms.get(idOrCode);
  }

  public getAllActiveRooms(): RaceRoom[] {
    const unique = new Set(this.rooms.values());
    return Array.from(unique);
  }

  /**
   * Adds a racer to a room.
   */
  public joinRoom(idOrCode: string, racerData: { id: string; nickname: string; color?: string; avatar?: string }): { room: RaceRoom; racer: Racer } {
    const room = this.getRoom(idOrCode);
    if (!room) {
      throw new Error(`Race room '${idOrCode}' not found`);
    }

    if (room.status !== 'LOBBY') {
      throw new Error(`Race in room '${idOrCode}' is already ${room.status.toLowerCase()}`);
    }

    if (room.racers.size >= (room.config.maxPlayers || 8)) {
      throw new Error(`Room '${idOrCode}' is full (max ${room.config.maxPlayers} players)`);
    }

    const racer: Racer = {
      id: racerData.id,
      nickname: racerData.nickname.slice(0, 24),
      color: racerData.color || '#10b981',
      avatar: racerData.avatar,
      progress: {
        wordIndex: 0,
        charIndex: 0,
        progressPercent: 0,
        wpm: 0,
        accuracy: 100,
      },
      isReady: false,
      isFinished: false,
      joinedAt: Date.now(),
    };

    room.racers.set(racer.id, racer);
    this.emit('racer_joined', { roomId: room.id, racer });

    return { room, racer };
  }

  /**
   * Removes a racer from a room.
   */
  public leaveRoom(idOrCode: string, racerId: string): void {
    const room = this.getRoom(idOrCode);
    if (!room) return;

    room.racers.delete(racerId);
    this.emit('racer_left', { roomId: room.id, racerId });

    // Clean up empty room
    if (room.racers.size === 0) {
      this.rooms.delete(room.id);
      this.rooms.delete(room.code);
    }
  }

  /**
   * Sets player ready status and auto-starts countdown when all are ready.
   */
  public setReady(idOrCode: string, racerId: string, isReady: boolean): void {
    const room = this.getRoom(idOrCode);
    if (!room || room.status !== 'LOBBY') return;

    const racer = room.racers.get(racerId);
    if (!racer) return;

    racer.isReady = isReady;
    this.emit('racer_ready', { roomId: room.id, racerId, isReady });

    // If at least 2 racers and all are ready, start countdown automatically
    if (room.racers.size >= 2) {
      const allReady = Array.from(room.racers.values()).every((r) => r.isReady);
      if (allReady) {
        this.startCountdown(room.id);
      }
    }
  }

  /**
   * Starts 3-second synchronized countdown.
   */
  public startCountdown(idOrCode: string): void {
    const room = this.getRoom(idOrCode);
    if (!room || room.status !== 'LOBBY') return;

    room.status = 'COUNTDOWN';
    const countdownDuration = 3000;
    const now = Date.now();
    room.countdownStart = now;
    room.raceStart = now + countdownDuration;

    this.emit('countdown_started', {
      roomId: room.id,
      startsInMs: countdownDuration,
      raceStartTime: room.raceStart,
    });

    setTimeout(() => {
      if (room.status === 'COUNTDOWN') {
        room.status = 'ACTIVE';
        this.emit('race_started', { roomId: room.id, raceStartTime: room.raceStart! });
      }
    }, countdownDuration);
  }

  /**
   * Updates racer's live position & metrics and checks if finished.
   */
  public updateProgress(idOrCode: string, racerId: string, progress: RacerProgress): void {
    const room = this.getRoom(idOrCode);
    if (!room || room.status !== 'ACTIVE') return;

    const racer = room.racers.get(racerId);
    if (!racer || racer.isFinished) return;

    racer.progress = progress;

    // Check if player reached 100%
    if (progress.progressPercent >= 100) {
      this.finishRacer(room, racer);
    }
  }

  private finishRacer(room: RaceRoom, racer: Racer): void {
    if (racer.isFinished) return;

    racer.isFinished = true;
    const now = Date.now();
    racer.finishTimeMs = room.raceStart ? now - room.raceStart : 0;

    // Determine podium rank
    const finishedCount = Array.from(room.racers.values()).filter((r) => r.isFinished).length;
    racer.rank = finishedCount;

    this.emit('racer_finished', { roomId: room.id, racer });

    // If all racers finished, complete race
    const allFinished = Array.from(room.racers.values()).every((r) => r.isFinished);
    if (allFinished) {
      this.endRace(room);
    }
  }

  private endRace(room: RaceRoom): void {
    room.status = 'FINISHED';
    room.raceEnd = Date.now();

    const podium = Array.from(room.racers.values())
      .filter((r) => r.isFinished)
      .sort((a, b) => (a.rank || 999) - (b.rank || 999));

    this.emit('race_finished', { roomId: room.id, podium });
  }

  /**
   * Matchmaking queue: pairs available typists into auto-scaling rooms.
   */
  public joinMatchmaking(racerData: { id: string; nickname: string; color?: string }, config: Partial<RaceRoomConfig>): Promise<RaceRoom> {
    return new Promise((resolve) => {
      const racer: Racer = {
        id: racerData.id,
        nickname: racerData.nickname,
        color: racerData.color || '#3b82f6',
        progress: { wordIndex: 0, charIndex: 0, progressPercent: 0, wpm: 0, accuracy: 100 },
        isReady: true,
        isFinished: false,
        joinedAt: Date.now(),
      };

      this.matchmakingQueue.push({ racer, config, resolve });
      this.scheduleMatchmakingBatch();
    });
  }

  private scheduleMatchmakingBatch(): void {
    if (this.matchmakingTimer) return;

    this.matchmakingTimer = setTimeout(() => {
      this.matchmakingTimer = null;
      this.flushMatchmaking();
    }, 1500); // 1.5s match window
  }

  private flushMatchmaking(): void {
    if (this.matchmakingQueue.length === 0) return;

    while (this.matchmakingQueue.length > 0) {
      const batch = this.matchmakingQueue.splice(0, 4); // Up to 4 players per match
      const defaultWords = ['the', 'quick', 'brown', 'fox', 'jumps', 'over', 'the', 'lazy', 'dog', 'and', 'runs', 'into', 'the', 'forest', 'with', 'blazing', 'speed', 'and', 'agility', 'through', 'the', 'trees', 'under', 'the', 'starlight'];
      
      const room = this.createRoom({
        mode: 'words',
        wordCount: 25,
        words: defaultWords,
        ...batch[0].config,
      });

      for (const item of batch) {
        room.racers.set(item.racer.id, item.racer);
        item.resolve(room);
      }

      // Auto start countdown if matched 2 or more
      if (room.racers.size >= 2) {
        setTimeout(() => this.startCountdown(room.id), 500);
      }
    }
  }
}

export const raceEngine = new RaceEngine();
