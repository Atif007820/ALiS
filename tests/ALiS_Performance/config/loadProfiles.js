export const loadProfiles = {
  smoke: {
    threads: 2,
    rampUp: 5,
    duration: 30,
    loops: 1
  },
  normal: {
    threads: 25,
    rampUp: 30,
    duration: 300,
    loops: 1
  },
  peak: {
    threads: 100,
    rampUp: 60,
    duration: 600,
    loops: 1
  },
  stress: {
    threads: 250,
    rampUp: 120,
    duration: 900,
    loops: 1
  }
};
