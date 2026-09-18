// Entry point. This file grows into the mode state machine and worker wiring
// in later phases (see docs/PLAN.md P0-07 onward). For now it only proves the
// toolchain works end to end.

const app = document.getElementById('app');
if (app) {
  app.textContent = 'Flatland';
}
