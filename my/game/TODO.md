# Nova Orbis to-do

## Zombies

- **Hearing as a heritable trait.** Zombies (and the other rule-AI animals) sense only by sight today. Hearing needs its own sim-side sound events: the `sound` port is playback only and does nothing with sound off, and NPC footsteps come from the renderer, whose LOD would break "every creature gets the same update rate and precision". Gunshots are already raised in sim code (`shootStep`, the player's gun in 8b). Decide which sounds count, the hearing range and its energy cost.
- **Team goals and group dynamics.** Zombies hunting together, and other group behaviour. Not started.
