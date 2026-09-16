/**
 * Brain singleton — initialized on first request and reused.
 * Loads capabilities from DB & seeds core knowledge on first boot.
 */

import {
  loadCapabilitiesFromDB,
  seedCoreSkills,
  seedCoreKnowledge,
} from './core';

let initialized = false;
let initializing = Promise.resolve();

export async function ensureBrainInitialized(): Promise<void> {
  if (initialized) return;
  // Avoid double-init across concurrent requests
  initializing = initializing.then(async () => {
    if (initialized) return;
    await loadCapabilitiesFromDB();
    await seedCoreSkills();
    await seedCoreKnowledge();
    initialized = true;
  });
  return initializing;
}
