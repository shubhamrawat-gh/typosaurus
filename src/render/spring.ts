/**
 * Semi-implicit Euler Spring simulation with dt clamping.
 * Produces silky smooth 60fps/120Hz/144Hz interpolated motion.
 */

export interface SpringConfig {
  stiffness: number; // e.g. 360
  damping: number;   // e.g. 30
  mass: number;      // e.g. 1
  snapDistance: number; // e.g. 0.15
  snapVelocity: number; // e.g. 0.15
}

export const DEFAULT_SPRING_CONFIG: SpringConfig = {
  stiffness: 380,
  damping: 32,
  mass: 1,
  snapDistance: 0.15,
  snapVelocity: 0.15,
};

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
    this.config = config;
  }

  public setTarget(targetX: number, targetY: number): void {
    this.targetX = targetX;
    this.targetY = targetY;
  }

  public snapTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
    this.vx = 0;
    this.vy = 0;
  }

  public update(dtSeconds: number): boolean {
    // Clamp delta time to 50ms to ensure stability during frame spikes
    const dt = Math.min(dtSeconds, 0.05);

    const { stiffness, damping, mass, snapDistance, snapVelocity } = this.config;

    // Spring forces: F = -k * displacement - c * velocity
    const dx = this.x - this.targetX;
    const dy = this.y - this.targetY;

    const fx = -stiffness * dx - damping * this.vx;
    const fy = -stiffness * dy - damping * this.vy;

    const ax = fx / mass;
    const ay = fy / mass;

    // Semi-implicit Euler integration
    this.vx += ax * dt;
    this.vy += ay * dt;

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Check if settled
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
