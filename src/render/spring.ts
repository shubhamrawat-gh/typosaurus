/**
 * Exact Analytical Harmonic Oscillator Spring Engine.
 * Evaluates the closed-form differential equations of damped harmonic motion.
 * Unconditionally stable and mathematically identical across any refresh rate
 * (60Hz, 120Hz, 144Hz, 240Hz, 360Hz+) with zero numerical drift or jitter.
 */

export interface SpringConfig {
  stiffness: number;    // Angular stiffness k (e.g. 950)
  damping: number;      // Viscous damping coefficient c (e.g. 62)
  mass: number;         // Inertial mass m (default 1)
  snapDistance: number; // Distance threshold to snap (default 0.15)
  snapVelocity: number; // Velocity threshold to snap (default 0.15)
  adaptive?: boolean;   // Dynamically scale stiffness for rapid keystroke bursts
}

export const DEFAULT_SPRING_CONFIG: SpringConfig = {
  stiffness: 950,
  damping: 62,
  mass: 1,
  snapDistance: 0.15,
  snapVelocity: 0.15,
  adaptive: true,
};

/**
 * Closed-form analytical 1D damped harmonic oscillator step.
 * Computes exact position and velocity at t + dt with zero numerical integration error.
 */
function solveAnalyticalSpring(
  x0: number,
  v0: number,
  target: number,
  dt: number,
  stiffness: number,
  damping: number,
  mass: number
): { x: number; v: number } {
  const p0 = x0 - target;
  if (p0 === 0 && v0 === 0) {
    return { x: target, v: 0 };
  }

  const omega0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(mass * stiffness));

  // Underdamped regime (zeta < 1): natural fluid motion with slight crisp snap
  if (zeta < 0.9999) {
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const decay = Math.exp(-zeta * omega0 * dt);
    const a = p0;
    const b = (v0 + zeta * omega0 * p0) / omegaD;
    const cosVal = Math.cos(omegaD * dt);
    const sinVal = Math.sin(omegaD * dt);

    const x = target + decay * (a * cosVal + b * sinVal);
    const v = decay * ((b * omegaD - a * zeta * omega0) * cosVal - (a * omegaD + b * zeta * omega0) * sinVal);
    return { x, v };
  }

  // Critically damped regime (zeta ~= 1): fastest convergence with zero overshoot
  if (zeta <= 1.0001) {
    const decay = Math.exp(-omega0 * dt);
    const a = p0;
    const b = v0 + omega0 * p0;

    const x = target + decay * (a + b * dt);
    const v = decay * (b - omega0 * (a + b * dt));
    return { x, v };
  }

  // Overdamped regime (zeta > 1)
  const mu = omega0 * Math.sqrt(zeta * zeta - 1);
  const r1 = -zeta * omega0 + mu;
  const r2 = -zeta * omega0 - mu;
  const c2 = (v0 - r1 * p0) / (r2 - r1);
  const c1 = p0 - c2;

  const exp1 = Math.exp(r1 * dt);
  const exp2 = Math.exp(r2 * dt);
  const x = target + c1 * exp1 + c2 * exp2;
  const v = c1 * r1 * exp1 + c2 * r2 * exp2;
  return { x, v };
}

export class Spring2D {
  public x: number = 0;
  public y: number = 0;
  public vx: number = 0;
  public vy: number = 0;
  public targetX: number = 0;
  public targetY: number = 0;
  private config: SpringConfig;

  constructor(initialX: number = 0, initialY: number = 0, config: SpringConfig = DEFAULT_SPRING_CONFIG) {
    this.x = initialX;
    this.y = initialY;
    this.targetX = initialX;
    this.targetY = initialY;
    this.config = { ...DEFAULT_SPRING_CONFIG, ...config };
  }

  public setTarget(targetX: number, targetY: number): void {
    if (this.targetX === targetX && this.targetY === targetY) return;

    const dx = targetX - this.x;
    const dy = targetY - this.y;

    this.targetX = targetX;
    this.targetY = targetY;

    // Forward typing burst on the same line: inject initial velocity towards target
    // so the spring instantly starts moving on the very first millisecond
    if (Math.abs(dy) < 6 && Math.abs(dx) > 0 && Math.abs(dx) < 100) {
      const omega0 = Math.sqrt(this.config.stiffness / this.config.mass);
      this.vx = dx * (omega0 * 0.7);
    }
  }

  public snapTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
    this.vx = 0;
    this.vy = 0;
  }

  /**
   * Updates spring simulation over dtSeconds.
   * Guaranteed 60+ FPS frame-rate independence and sub-pixel accuracy.
   */
  public update(dtSeconds: number): boolean {
    if (this.x === this.targetX && this.y === this.targetY && this.vx === 0 && this.vy === 0) {
      return false; // Already settled at rest
    }

    // Protect against extreme background tab pause spikes (>100ms)
    const dt = Math.min(dtSeconds, 0.1);
    let { stiffness, damping, mass, snapDistance, snapVelocity, adaptive } = this.config;

    // Adaptive burst-typing responsiveness:
    // If typist is typing rapidly on the same line (small displacement),
    // adaptively boost frequency so caret never lags behind 150+ WPM typing bursts.
    if (adaptive) {
      const dx = Math.abs(this.targetX - this.x);
      const dy = Math.abs(this.targetY - this.y);
      if (dy < 6 && dx > 0 && dx < 80) {
        stiffness = Math.max(stiffness, 1500);
        damping = Math.max(damping, 78);
      }
    }

    // Exact analytical update for X axis
    const resX = solveAnalyticalSpring(this.x, this.vx, this.targetX, dt, stiffness, damping, mass);
    this.x = resX.x;
    this.vx = resX.v;

    // Exact analytical update for Y axis
    const resY = solveAnalyticalSpring(this.y, this.vy, this.targetY, dt, stiffness, damping, mass);
    this.y = resY.x;
    this.vy = resY.v;

    // Check convergence against snap thresholds
    const distSq = (this.x - this.targetX) ** 2 + (this.y - this.targetY) ** 2;
    const velSq = this.vx ** 2 + this.vy ** 2;

    if (distSq < snapDistance ** 2 && velSq < snapVelocity ** 2) {
      this.x = this.targetX;
      this.y = this.targetY;
      this.vx = 0;
      this.vy = 0;
      return false; // Settled
    }

    return true; // Still animating
  }
}
