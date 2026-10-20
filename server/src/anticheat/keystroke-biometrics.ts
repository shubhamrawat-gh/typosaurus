import crypto from 'node:crypto';

export interface RawKeystrokeEvent {
  timestamp: number; // millisecond timestamp relative to test start
  key: string;
  code: string;
  expected: string;
  status: 'correct' | 'incorrect' | 'extra' | 'untyped';
  dwellTime?: number; // ms key was held down (if available)
}

export interface AntiCheatReport {
  isVerified: boolean;
  botScore: number; // 0.0 (100% human) to 1.0 (proven bot/macro)
  confidence: number; // 0.0 to 1.0
  reasons: string[];
  metrics: {
    totalKeystrokes: number;
    wpm: number;
    rawWpm: number;
    accuracy: number;
    meanIKI: number; // Mean Inter-Keystroke Interval (ms)
    stdDevIKI: number; // Standard deviation of IKI (ms)
    cvIKI: number; // Coefficient of Variation (stdDev / mean)
    shannonEntropy: number; // Shannon entropy in bits
    pasteEventsDetected: number;
    superhumanBursts: number;
  };
  certificate?: {
    certificateId: string;
    signature: string;
    issuedAt: number;
    issuer: string;
  };
}

export class KeystrokeBiometricsEngine {
  private secretKey: string;

  constructor(secretKey: string = process.env.TYPOSAURUS_INTEGRITY_SECRET || 'typosaurus_production_secret_key_v1') {
    this.secretKey = secretKey;
  }

  /**
   * Evaluates keystroke telemetry using neuromuscular biometric profiling.
   * Analyzes IKI variance, Shannon entropy of typing rhythm, robotic periodicity,
   * macro burst injections, and physical human biological bounds.
   */
  public analyze(telemetry: RawKeystrokeEvent[], totalDurationMs: number): AntiCheatReport {
    const reasons: string[] = [];
    let botScore = 0.0;

    if (!telemetry || telemetry.length < 5) {
      return {
        isVerified: false,
        botScore: 1.0,
        confidence: 1.0,
        reasons: ['Insufficient keystroke telemetry data (minimum 5 keystrokes required)'],
        metrics: {
          totalKeystrokes: telemetry?.length || 0,
          wpm: 0,
          rawWpm: 0,
          accuracy: 0,
          meanIKI: 0,
          stdDevIKI: 0,
          cvIKI: 0,
          shannonEntropy: 0,
          pasteEventsDetected: 0,
          superhumanBursts: 0,
        },
      };
    }

    // 1. Calculate Inter-Keystroke Intervals (IKIs)
    const ikis: number[] = [];
    let pasteEventsDetected = 0;
    let superhumanBursts = 0;
    let correctCount = 0;

    for (let i = 0; i < telemetry.length; i++) {
      if (telemetry[i].status === 'correct') correctCount++;

      if (i > 0) {
        const dt = Math.max(0, telemetry[i].timestamp - telemetry[i - 1].timestamp);
        ikis.push(dt);

        // Instantaneous paste injection: interval < 3ms
        if (dt < 3) {
          pasteEventsDetected++;
        }

        // Superhuman burst: keystrokes closer than 20ms (>50 CPS / 600 WPM sustained)
        if (dt < 20) {
          superhumanBursts++;
        }
      }
    }

    // 2. Statistical Moments of IKI
    const n = ikis.length;
    const sum = ikis.reduce((acc, val) => acc + val, 0);
    const mean = n > 0 ? sum / n : 0;

    let varianceSum = 0;
    for (let i = 0; i < n; i++) {
      varianceSum += (ikis[i] - mean) ** 2;
    }
    const variance = n > 1 ? varianceSum / (n - 1) : 0;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 0;

    // 3. Shannon Entropy of IKI Distribution (20ms buckets from 0 to 1000ms)
    const BUCKET_SIZE = 20;
    const BUCKET_COUNT = 50;
    const buckets = new Uint32Array(BUCKET_COUNT);

    for (let i = 0; i < n; i++) {
      const bIdx = Math.min(Math.floor(ikis[i] / BUCKET_SIZE), BUCKET_COUNT - 1);
      buckets[bIdx]++;
    }

    let shannonEntropy = 0;
    for (let i = 0; i < BUCKET_COUNT; i++) {
      if (buckets[i] > 0) {
        const p = buckets[i] / n;
        shannonEntropy -= p * Math.log2(p);
      }
    }

    // 4. Typing Metrics
    const durationMinutes = totalDurationMs > 0 ? totalDurationMs / 60000 : 0.001;
    const rawWpm = Math.round((telemetry.length / 5) / durationMinutes);
    const wpm = Math.round((correctCount / 5) / durationMinutes);
    const accuracy = Math.round((correctCount / telemetry.length) * 1000) / 10;

    // 5. Biometric Heuristic Penalties:
    // A. Constant Interval / Autohotkey Script detection:
    // Real human motor execution has CV between 0.18 and 0.85 due to neuromuscular noise.
    // Fixed timers or naive setTimeout loops yield CV < 0.06.
    if (cv < 0.08 && n > 25) {
      botScore += 0.85;
      reasons.push(`Unnatural rhythmic uniformity detected (Coefficient of Variation = ${cv.toFixed(3)} < 0.08)`);
    } else if (cv < 0.12 && n > 25) {
      botScore += 0.45;
      reasons.push(`Suspiciously low typing variation (CV = ${cv.toFixed(3)})`);
    }

    // B. Low Entropy Check:
    // Natural human typing yields Shannon entropy > 2.8 bits across IKI buckets.
    // Bot scripts with fixed delays yield entropy < 1.4 bits.
    if (shannonEntropy < 1.4 && n > 25) {
      botScore += 0.8;
      reasons.push(`Shannon entropy of inter-keystroke intervals is unnaturally low (${shannonEntropy.toFixed(2)} bits)`);
    } else if (shannonEntropy < 1.7 && n > 25) {
      botScore += 0.3;
      reasons.push(`Low entropy keystroke distribution (${shannonEntropy.toFixed(2)} bits)`);
    }

    // C. Clipboard Paste / Macro Injections:
    if (pasteEventsDetected > 2) {
      botScore += 0.9;
      reasons.push(`Detected ${pasteEventsDetected} instant paste/macro injections (< 3ms intervals)`);
    }

    // D. Superhuman Burst Limits:
    const superhumanRatio = superhumanBursts / Math.max(1, n);
    if (superhumanRatio > 0.15 && wpm > 240) {
      botScore += 0.75;
      reasons.push(`Unrealistic superhuman speed bursts exceed human physiological bounds (${(superhumanRatio * 100).toFixed(1)}% of keys < 20ms)`);
    }

    // E. Total WPM Human Ceiling Check:
    if (wpm > 320) {
      botScore += 0.95;
      reasons.push(`WPM of ${wpm} exceeds verified world record human limit`);
    }

    // Clamp bot score to [0, 1]
    botScore = Math.min(1.0, Math.max(0.0, botScore));
    const isVerified = botScore <= 0.35;
    const confidence = Math.min(1.0, 0.5 + (n / 200));

    // 6. Cryptographic HMAC Certification
    const finalEntropy = Math.round(shannonEntropy * 100) / 100;
    let certificate: AntiCheatReport['certificate'];
    if (isVerified) {
      const certificateId = `cert_${crypto.randomBytes(12).toString('hex')}`;
      const issuedAt = Date.now();
      const payload = `${certificateId}:${wpm}:${accuracy}:${finalEntropy.toFixed(2)}:${issuedAt}`;
      const signature = crypto.createHmac('sha256', this.secretKey).update(payload).digest('hex');

      certificate = {
        certificateId,
        signature,
        issuedAt,
        issuer: 'Typosaurus Enterprise Biometric Engine v1.0',
      };
    }

    return {
      isVerified,
      botScore: Math.round(botScore * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      reasons,
      metrics: {
        totalKeystrokes: telemetry.length,
        wpm,
        rawWpm,
        accuracy,
        meanIKI: Math.round(mean * 10) / 10,
        stdDevIKI: Math.round(stdDev * 10) / 10,
        cvIKI: Math.round(cv * 1000) / 1000,
        shannonEntropy: finalEntropy,
        pasteEventsDetected,
        superhumanBursts,
      },
      certificate,
    };
  }

  /**
   * Cryptographically verifies a previously issued certificate signature.
   */
  public verifyCertificate(
    certificateId: string,
    wpm: number,
    accuracy: number,
    shannonEntropy: number,
    issuedAt: number,
    signature: string
  ): boolean {
    const payload = `${certificateId}:${wpm}:${accuracy}:${shannonEntropy.toFixed(2)}:${issuedAt}`;
    const expectedSignature = crypto.createHmac('sha256', this.secretKey).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'));
  }
}

export const biometricsEngine = new KeystrokeBiometricsEngine();
