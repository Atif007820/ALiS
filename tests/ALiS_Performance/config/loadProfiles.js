export const loadProfiles = {
  // Purpose: Quick health check with minimal load.
  // When to Run: After script or application changes.
  smoke: {
    threads: 1,
    rampUp: 1,
    duration: 30,
    loops: 1
  },

  // Purpose: Measure performance under expected user load.
  // When to Run: For routine release validation.
  load: {
    threads: 5,
    rampUp: 60,
    duration: 600,
    loops: 1
  },

  // Purpose: Find limits beyond expected capacity.
  // When to Run: Before major releases or capacity changes.
  stress: {
    threads: 250,
    rampUp: 120,
    duration: 900,
    loops: 1
  },

  // Purpose: Validate sudden traffic burst handling.
  // When to Run: When rapid scaling or bursts are expected.
  spike: {
    threads: 250,
    rampUp: 5,
    duration: 300,
    loops: 1
  },

  // Purpose: Detect leaks and gradual degradation.
  // When to Run: For long-duration stability validation.
  endurance: {
    threads: 50,
    rampUp: 300,
    duration: 14400,
    loops: 1
  }
};
