# Requirements Document

## Introduction

Project RING is a browser-based 3D arcade boxing game for desktop browsers. The player controls one boxer against an AI-controlled opponent inside a stylized 3D ring viewed from a side-on 2.5D camera. Fighters move along a single horizontal axis, throw four punch types (jab, cross, hook, uppercut), defend with blocking and slipping, and manage health, stamina, and guard. Matches run over three rounds and end by KO, TKO, or judges' decision.

The game is built with Vite, React, TypeScript, Three.js, React Three Fiber, Tailwind CSS, Zustand, and Vitest. The game simulation runs at a fixed 60 Hz timestep, independent of rendering, so that combat logic stays deterministic and unit-testable. Fighter behavior is driven by a finite-state machine, and attacks are defined as data. The game runs fully client-side with no backend services.

### Delivery Phases

Each requirement is tagged with the phase that delivers it:

- **M1 – Playable Prototype**: two placeholder fighters, horizontal movement with ring boundaries, a jab attack, hit detection, health bars, a basic AI opponent, and the simulation architecture (fixed timestep, FSM, data-driven attacks, determinism).
- **P2 – Full Combat**: cross, hook, uppercut, blocking, guard, slipping, stamina, combos, counterpunches, and AI difficulty levels.
- **P3 – Match Structure and Menus**: knockdowns, KO/TKO, three rounds, scoring, full fight HUD, main menu, pause menu, and results screen.
- **P4 – Presentation and Polish**: punch animations, impact effects, audio, and performance tuning.

Where a requirement is tagged with one phase but a single acceptance criterion belongs to a later phase, that criterion carries its own phase tag in brackets.

## Glossary

- **Game**: The complete Project RING browser application.
- **Game_Simulation**: The pure TypeScript module that advances all gameplay state (fighters, combat, rounds) in fixed Ticks, with no dependency on rendering, audio, or DOM APIs.
- **Tick**: One fixed simulation step of 1/60 second (approximately 16.667 ms).
- **Gameplay_Tick** [P4-relevant]: A Tick that is not frozen by Hit_Stop; see D36. In M1–P3 every Tick is a Gameplay_Tick.
- **Simulation_Loop**: The component that accumulates elapsed real time and invokes the Game_Simulation once per elapsed Tick.
- **Renderer**: The React Three Fiber / Three.js layer that draws the current simulation state each display frame.
- **Simulation_State**: The complete, serializable snapshot of gameplay data produced by the Game_Simulation after a Tick.
- **Fighter**: A boxer entity in the Game_Simulation, holding position, facing, Health, Stamina, Guard, and a Fighter_FSM.
- **Player_Fighter**: The Fighter controlled by the human player.
- **AI_Fighter**: The Fighter controlled by the AI_Controller.
- **Fighter_FSM**: The finite-state machine that governs which action a Fighter is performing (for example Idle, Walking, Attacking, Blocking, Slipping, HitStun, GuardBroken, KnockedDown, Defeated).
- **Fighter_Command**: An abstract per-Tick intent (move left, move right, jab, cross, hook, uppercut, block, slip) issued to a Fighter by the Input_System or the AI_Controller.
- **Input_System**: The component that converts keyboard events into Fighter_Commands for the Player_Fighter.
- **AI_Controller**: The component that issues Fighter_Commands for the AI_Fighter based on the Simulation_State.
- **Player_Observation**: The Player_Fighter's horizontal position, facing, Fighter_FSM state, and current attack identifier and phase, recorded at the end of a Tick.
- **Player_Observation_History**: A fixed-length ring buffer of the most recent 121 Player_Observations, stored in the Simulation_State (D32).
- **Difficulty_Level**: One of the AI presets Easy, Normal, or Hard, each defined by data parameters.
- **Ring**: The 3D boxing arena, including floor, ropes, and posts.
- **Ring_Boundary**: The minimum and maximum horizontal positions a Fighter may occupy inside the Ring.
- **Attack_Definition**: A data record describing one punch type, including startup Ticks, active Ticks, recovery Ticks, damage, stamina cost, guard damage, Hitbox geometry, and hit-stun Ticks.
- **Attack_Registry**: The collection of all Attack_Definitions loaded by the Game_Simulation.
- **Startup_Phase**: The Ticks of an attack before the Hitbox becomes active.
- **Active_Phase**: The Ticks of an attack during which the Hitbox can register a hit.
- **Recovery_Phase**: The Ticks of an attack after the Active_Phase, before the Fighter can act again.
- **Hitbox**: The attack region, defined in an Attack_Definition, that can strike an opposing Hurtbox.
- **Hurtbox**: The body region of a Fighter that can be struck by an opposing Hitbox.
- **Hitbox_Reach**: The horizontal distance from the attacking Fighter's position to the far edge of its Hitbox in the facing direction.
- **Connect_Range**: Hitbox_Reach plus half the Hurtbox width; the largest center-to-center distance at which an attack can land.
- **Able_To_Act**: The condition of a Fighter in the Idle, Walking, or (P2) Blocking state with 0 Block_Stun Ticks remaining.
- **Block_Stun** [P2]: The Ticks during which a blocking Fighter cannot act after blocking a hit.
- **Cancel_Window** [P2]: The Ticks within the Recovery_Phase during which a permitted follow-up attack may replace the current attack.
- **Hit_Stop** [P4]: The Ticks during which the whole Match simulation is frozen after a landed hit.
- **Trade**: The situation in which both Fighters land hits on the same Tick.
- **Combat_Resolver**: The Game_Simulation component that detects Hitbox–Hurtbox overlaps and applies hit, block, and counter outcomes.
- **Health**: A Fighter's remaining damage capacity, from 0 to a configured maximum.
- **Stamina**: A Fighter's resource consumed by attacks and slips and regenerated over time.
- **Guard**: A Fighter's block-durability resource, reduced by blocked attacks.
- **GuardBroken**: The Fighter_FSM state entered when a Fighter's Guard reaches 0.
- **HitStun**: The Fighter_FSM state in which a struck Fighter cannot act for a defined number of Ticks.
- **Combo**: A sequence of consecutive landed hits by one Fighter while the struck Fighter has not left HitStun (D14).
- **Counterpunch**: A hit landed on an opponent who is in the Startup_Phase or Recovery_Phase of an attack; also the first landed hit within the post-slip window (Requirement 21).
- **Input_Buffer**: A single-slot store that holds one attack Fighter_Command for up to 6 Ticks while the Fighter cannot act (Requirement 20).
- **Knockdown**: The event in which a Fighter falls to the canvas and a count begins.
- **Knockdown_Separation** [P3]: The configured center-to-center distance the Round_Manager places between the standing Fighter and the knocked-down Fighter after a Knockdown (Requirement 23).
- **Knockdown_Count**: The referee count from 1 to 10 that follows a Knockdown.
- **KO**: A knockout, declared when a knocked-down Fighter fails to rise before the Knockdown_Count reaches 10.
- **TKO**: A technical knockout, declared when a Fighter suffers three Knockdowns within a single round.
- **Round_Manager**: The Game_Simulation component that controls round timing, round transitions, and match end.
- **Scoring_System**: The Game_Simulation component that scores each round using the 10-point must system.
- **Match**: A single fight of up to three rounds between the Player_Fighter and the AI_Fighter.
- **Fight_HUD**: The on-screen overlay that displays fight information during a Match.
- **Main_Menu**: The start screen from which the player starts a Match and selects a Difficulty_Level.
- **Pause_Menu**: The overlay shown while a Match is paused.
- **Results_Screen**: The screen shown at the end of a Match with the outcome and statistics.
- **Animation_System**: The Renderer component that maps Fighter_FSM states and attack phases to fighter animations.
- **Effects_System**: The Renderer component that plays visual impact effects.
- **Audio_System**: The component that plays sound effects and music in response to Game_Simulation events.
- **Game_Event**: A discrete notification emitted by the Game_Simulation (for example hit landed, attack blocked, Knockdown, knockdown count, round start, round end) for consumption by the Renderer, Effects_System, and Audio_System.
- **Reference_Desktop**: A desktop computer with a 4-core CPU, integrated graphics of Intel Iris Xe class or better, a 1920×1080 display, and a current version of Chrome, Firefox, or Edge.

### Design Decisions

- **D1 Catch-up cap**: The Simulation_Loop executes at most 5 Ticks per display frame; excess accumulated time is discarded (Requirement 1).
- **D2 Attack Tick ranges**: startup 1–60, active 1–60, recovery 0–60, hit-stun 0–120, block-stun 0–120; validated only in Requirement 5.
- **D3 Interrupted attacks**: A landed hit on a Fighter in any attack phase ends that attack; the ended attack registers no further contact (Requirement 10).
- **D4 Trade**: Both hits are detected against one snapshot and both apply (Requirement 35).
- **D5 Integer resources**: Health, Stamina, and Guard are integers; damage rounds half up; a landed hit deals at least 1.
- **D6 Health zero priority**: Health 0 overrides HitStun.
- **D7 M1 simultaneous Health 0**: Both Fighters become Defeated and the fight is a draw.
- **D8 Restart seed**: Restart reuses the initial seed, so restarts are reproducible.
- **D9 Action priority per Tick**: new attack > buffered attack [P2] > slip [P2] > block [P2] > movement > Idle. When multiple attacks arrive on one Tick: uppercut > hook > cross > jab.
- **D10 Event order within a Tick**: Player_Fighter events before AI_Fighter events; within a Fighter, processing-step order (Requirement 35). Match-level events (for example match-result) are emitted after both Fighters' events.
- **D11 Frame-rate target**: The frame-rate target is a 59 fps average, since vsync averages land just under 60 (Requirement 34).
- **D12 Bufferable states** [P2]: Attack commands are buffered during Startup/Active/Recovery outside a Cancel_Window, HitStun, Block_Stun, and Slipping. They are discarded during GuardBroken, KnockedDown, Defeated, the round-start announcement, the between-round interval, and after Match end. A new attack command replaces the buffered one.
- **D13 Cancel opening**: Cancels open only after a landed hit; blocked or evaded attacks do not open the Cancel_Window.
- **D14 Combo definition**: Consecutive landed hits while the struck Fighter has not left HitStun. The combo counter resets when the struck Fighter leaves HitStun.
- **D15 Low stamina**: Attacks still start with reduced damage; slip requires Stamina ≥ slip cost and is rejected otherwise.
- **D16 Stamina regeneration**: Regeneration is an integer amount per Tick and does not occur on a Tick where an attack or slip started.
- **D17 Hit on GuardBroken**: A hit on a GuardBroken Fighter is a landed hit. The Fighter leaves GuardBroken for HitStun with Guard 0, so the normal guard-break expiry (Requirement 17 criterion 7) does not run; Guard is set to the guard-recovery value when that HitStun ends.
- **D18 AI per-Tick priority**: defense > counterpunch > combo follow-up > regular attack > movement; at most one action command per Tick plus a held block.
- **D19 Double knockdown** [P3]: If both Fighters reach Health 0 on one Tick, both are KnockedDown under one shared Knockdown_Count, each with its own rise count. Neither rises by 10 → draw by KO. Only one rises → the other loses by KO. Third Knockdown in the round for both → draw by TKO; for only one → that Fighter loses by TKO.
- **D20 Chip knockdown** [P3]: Chip damage that reduces Health to 0 also causes a Knockdown.
- **D21 Knockdown freeze** [P3]: Knockdowns pause all commands for both Fighters and clear both Input_Buffers; the standing Fighter's attack is cancelled and the standing Fighter is set to Idle.
- **D22 Round configuration** [P3]: Invalid round configuration refuses initialization, like every other configuration check (no silent defaults).
- **D23 Scoring weights** [P3]: Scoring weights are non-negative integers so round comparisons are exact.
- **D24 Seed policy** [P3]: Each new Match (Start Fight, Restart Match, Rematch) uses the configured seed plus the number of Matches already started this page session; M1 restart reuses the initial seed (D8).
- **D25 Difficulty persistence** [P3]: The selected Difficulty_Level persists only within the page session; nothing is stored across reloads.
- **D26 Menu replaces auto-start** [P3]: From P3 the Main_Menu (Requirement 28) replaces the M1 auto-start (Requirement 13 criterion 1).
- **D27 Rise count growth** [P3]: Rise count grows with each Knockdown in the Match and is clamped at 10, so after enough Knockdowns a Fighter cannot rise and loses by KO. This is intended; the base, increase, and variance values are tuning parameters.
- **D28 Attack blend** [P4]: Entering Attacking uses a 0-Tick blend so the startup pose is visible at once (needed for the input-latency target in Requirement 34).
- **D29 Hit_Stop scope** [P4]: Hit_Stop applies only to landed hits, freezes the whole Match simulation, and uses the larger value in a Trade.
- **D30 Volume controls** [P4]: Volume levels are configuration values with defaults; no in-game volume menu is in scope.
- **D31 Knockdown repositioning** [P3]: The standing Fighter is moved instantly, on the Knockdown Tick, to Knockdown_Separation from the fallen Fighter on its current side (the preferred side); if that point is outside the Ring_Boundary it goes to the opposite side; if neither fits it goes to the Ring_Boundary end farthest from the fallen Fighter, with ties resolved to the preferred side. The fallen Fighter never moves. Requiring Ring_Boundary width ≥ 2 × minimum separation guarantees the result never violates minimum separation. In a double knockdown neither Fighter moves (D19).
- **D32 AI delayed observation**: The Simulation_State keeps a fixed-length Player_Observation_History of 121 entries (reaction delays 0–120). The AI_Controller sees the Player_Fighter only through this history, delayed by the reaction delay; before enough history exists it sees the observation recorded at Match (or round) start. The AI_Fighter's own state is read without delay.
- **D33 Block release into movement** [P2]: Releasing block while exactly one direction is held moves the Fighter directly from Blocking to Walking on that Tick at full walk speed, with no Idle Tick in between.
- **D34 Knockdown recovery** [P3]: On rising, Stamina is unchanged; Guard is set to the guard-recovery value if it is 0, otherwise unchanged; the pending guard recovery from D17 is resolved by this rule; Fighter_Commands are accepted from the Tick after the rise.
- **D35 Round-start reset** [P3]: Each round start clears all transient combat state; persistent Match state (Health, Stamina, Guard, Knockdown totals, scoring) carries over except where Requirement 25 resets it.
- **D36 Hit_Stop timing and Gameplay_Tick** [P4]: The hit fully resolves on its Tick; the frozen Ticks are the following Hit_Stop Ticks. A Gameplay_Tick counter advances only on non-frozen Ticks, and every gameplay duration, entry Tick, and phase boundary is measured in Gameplay_Ticks. Without Hit_Stop (M1–P3) Gameplay_Ticks equal Ticks. This resolves the conflict between Requirement 9 criterion 3 (phases defined by Tick numbers) and Hit_Stop freezing.
- **D37 Combo counter** [P2]: n in the damage formula is the attacker's combo counter after it is updated for the current landed hit; it updates exactly once per landed hit; in a Trade each attacker's counter is updated independently from the shared snapshot.
- **D38 Boundary before separation**: Each Fighter's intended movement is first limited to the Ring_Boundary, then movement toward the opponent is shortened to keep the minimum separation. Shortening moves a Fighter back toward its in-bounds previous position, so it never leaves the Ring_Boundary and a Fighter at a boundary is never pushed.
- **D39 Odd shortfall split**: When both Fighters moved toward each other, each is shortened by half of the shortfall in integer position units; an odd remainder of 1 unit goes to the Fighter with the larger toward-movement, or to the Player_Fighter if equal. If a Fighter's share exceeds its own toward-movement, its shortening is capped at that movement and the rest is applied to the other Fighter.
- **D40 AI inside the Tick with threaded PRNG**: The AI_Controller runs inside the Tick at the start of step (2). It receives a read-only Simulation_State and a copy of the PRNG state, and returns its Fighter_Commands and the advanced PRNG state, which the Game_Simulation commits in step (2). External gameplay input is the Player_Fighter's Fighter_Commands; external AI_Fighter commands are accepted only when the AI_Controller is disabled by configuration (for tests). An AI decision that draws no random values returns the PRNG state unchanged. The M1 AI draws no random values. The AI_Controller may also return AI memory (data it needs on later Ticks, such as a held block), which is stored in the Simulation_State and committed in step (2) like the PRNG state.
- **D41 Zero hit-stun**: A landed hit with 0 hit-stun Ticks does not enter HitStun: Health changes, an in-progress attack of the target ends (D3) and the target becomes Idle; a target in any other state keeps its state (except Slipping and GuardBroken, which become Idle). Zero hit-stun hits never extend a Combo.
- **D42 Configuration fingerprint**: The Simulation_State stores a deterministic 32-bit fingerprint of the validated configuration (FNV-1a over a canonical serialization); restoring a state with a different fingerprint is rejected.
- **D43 Exclusive key release**: A movement or block key is active on every Tick that begins after its press and before its release; it is not active on the first Tick that begins after its release. A press and release that both occur between two Ticks produce no movement or block command.
- **D44 P2 conflict resolutions** [P2]: AI memory is allowed (D40); zero hit-stun hits do not change a combo counter on a stunned target (D41); Cancel_Windows are optional; the P2 AI attack interval counts any attack type; the Able_To_Act limit on AI attacks applies only to regular attacks.

## Requirements

---

## M1 – Playable Prototype

### Requirement 1: Fixed-Timestep Simulation

**Phase:** M1

**User Story:** As a developer, I want the game simulation to advance in fixed 60 Hz steps, so that gameplay behaves the same regardless of display frame rate.

#### Acceptance Criteria

1. THE Game_Simulation SHALL advance gameplay state by exactly one Tick of 1/60 second per invocation, without taking elapsed real time as an input.
2. WHEN a display frame occurs, THE Simulation_Loop SHALL add the real time elapsed since the previous frame to its accumulator, invoke the Game_Simulation once per whole Tick in the accumulator, and carry the remainder to the next frame.
3. IF more than 5 whole Ticks have accumulated within one display frame, THEN THE Simulation_Loop SHALL execute exactly 5 Ticks and set the accumulator to zero.
4. WHILE the Match is paused, THE Simulation_Loop SHALL hold the accumulator at zero and invoke the Game_Simulation zero times. [loop support: M1; pause entry: P3, Requirement 29]
5. WHEN a display frame occurs, THE Renderer SHALL draw each Fighter's position linearly interpolated between the previous and current Simulation_State using fraction = accumulator ÷ Tick duration, in [0, 1).
6. WHEN the Match resumes from pause, THE Simulation_Loop SHALL count only real time elapsed after the resume.
7. IF the elapsed real time between two frames is zero, negative, or not finite, THEN THE Simulation_Loop SHALL add zero and execute no Ticks.
8. WHEN the Game_Simulation is run from the same initial Simulation_State with the same per-Tick Fighter_Commands, THE Game_Simulation SHALL produce identical Simulation_States after the same number of Ticks whether frames arrive at 30, 60, or 144 Hz.

### Requirement 2: Separation of Simulation and Rendering

**Phase:** M1

**User Story:** As a developer, I want the simulation to be independent from rendering, so that I can test gameplay logic without a browser or GPU.

#### Acceptance Criteria

1. THE Game_Simulation SHALL execute in a Node.js test environment without importing Three.js, React, React Three Fiber, DOM APIs, or Web Audio APIs, directly or transitively.
2. THE Game_Simulation SHALL accept, as its only external gameplay input per Tick, the Player_Fighter's Fighter_Commands for that Tick; the AI_Fighter's Fighter_Commands are produced inside the Tick by the AI_Controller (D40), or accepted as external input only when the AI_Controller is disabled by configuration. An empty set means no command.
3. THE Game_Simulation SHALL not read wall-clock time, keyboard or mouse state, display frame rate, or Renderer data when advancing a Tick.
4. WHEN a Tick completes, THE Game_Simulation SHALL expose the resulting Simulation_State and exactly the Game_Events emitted during that Tick, in emission order.
5. WHEN the Renderer draws a display frame, THE Renderer SHALL leave the Simulation_State deep-equal to its value before the frame.
6. THE Game SHALL store UI-level state (current screen, selected Difficulty_Level [P2], pause status [P3]) in a Zustand store separate from the Simulation_State, which contains none of these fields.
7. IF the Game_Simulation receives a Fighter_Command of an undefined type or for a Fighter not in the Simulation_State, THEN THE Game_Simulation SHALL discard the Fighter_Command without error and process other commands normally.

### Requirement 3: Deterministic Combat

**Phase:** M1

**User Story:** As a developer, I want combat calculations to be deterministic, so that fights are reproducible and testable.

#### Acceptance Criteria

1. WHEN the Game_Simulation is run twice from identical initial Simulation_States (including seed) with identical per-Tick Fighter_Command sequences of 1 to 10,800 Ticks, THE Game_Simulation SHALL produce field-equal, bit-identical Simulation_States and identical Game_Event lists after every Tick (property).
2. WHERE randomness is required, THE Game_Simulation SHALL draw all random values from a seeded PRNG whose seed (integer 0–4,294,967,295) and internal state are stored in the Simulation_State.
3. THE Game_Simulation SHALL compute each Tick only from the previous Simulation_State and that Tick's Fighter_Commands, as constrained by Requirement 2 criterion 3.
4. WHEN a Simulation_State is serialized to JSON and deserialized, THE Game_Simulation SHALL produce a field-equal Simulation_State including PRNG state, with every numeric value finite (round-trip property).
5. WHEN a restored Simulation_State and the original receive the same Fighter_Command sequence of 1 to 10,800 Ticks, THE Game_Simulation SHALL produce identical Simulation_States and Game_Events after every Tick (property).
6. IF JSON to deserialize is malformed, lacks a required field, or has a non-finite or out-of-range number, THEN THE Game_Simulation SHALL reject the JSON with an invalid-Simulation_State error and leave the current Simulation_State unchanged.
7. WHEN the AI_Controller is given identical Simulation_States and Difficulty_Level, THE AI_Controller SHALL issue identical Fighter_Commands.
8. THE Game_Simulation SHALL store the configuration fingerprint (D42) in the Simulation_State.
9. IF a serialized Simulation_State's configuration fingerprint differs from the fingerprint of the active validated configuration, THEN THE Game_Simulation SHALL reject the restore with a configuration-mismatch error and leave the current Simulation_State unchanged.

### Requirement 4: Fighter Finite-State Machine

**Phase:** M1 (states Blocking, Slipping, GuardBroken: P2; KnockedDown: P3)

**User Story:** As a developer, I want each fighter's actions governed by a finite-state machine, so that action rules are explicit and conflicts between actions cannot occur.

#### Acceptance Criteria

1. THE Fighter_FSM SHALL hold exactly one current state per Fighter at every Tick, exposed in the Simulation_State.
2. THE Fighter_FSM SHALL define Idle, Walking, Attacking, HitStun, and Defeated. [M1]
3. THE Fighter_FSM SHALL define Blocking, Slipping, and GuardBroken. [P2]
4. THE Fighter_FSM SHALL define KnockedDown. [P3]
5. THE Fighter_FSM SHALL change state only through transitions in a declared transition table, applying at most one transition per Fighter in each Tick-processing step of Requirement 35 criterion 1 (timer expiry, action selection, hit outcome, Health-zero check, round end), with later steps overriding earlier ones on that Tick.
6. IF a Fighter_Command requests a transition absent from the table and Requirement 20 does not buffer the Fighter_Command, THEN THE Fighter_FSM SHALL keep the current state and discard the Fighter_Command without changing Health, Stamina, Guard, or position.
7. WHEN a Fighter_FSM state changes, THE Game_Simulation SHALL record the new state and its entry Tick in the Simulation_State.
8. THE Fighter_FSM SHALL, for every Fighter_Command sequence, perform only transitions present in the table (invariant property).
9. WHEN a Match starts, THE Game_Simulation SHALL place each Fighter in Idle on the first Tick.
10. WHILE a Fighter is Defeated, THE Fighter_FSM SHALL keep the Fighter Defeated for the rest of the Match and discard the Fighter's commands. [M1]
11. IF an attack Fighter_Command arrives while the Fighter is not Able_To_Act, THEN THE Fighter_FSM SHALL discard the Fighter_Command in M1 and pass the Fighter_Command to the Input_Buffer per Requirement 20 from P2.

### Requirement 5: Data-Driven Attack Definitions

**Phase:** M1

**User Story:** As a designer, I want punch properties defined as data, so that I can tune and add attacks without changing combat code.

#### Acceptance Criteria

1. THE Attack_Registry SHALL define each punch type as an Attack_Definition with identifier (1–32 characters), startup Ticks, active Ticks, recovery Ticks, damage, stamina cost, guard damage, hit-stun Ticks, block-stun Ticks, Hitbox offset, and Hitbox size; plus Cancel_Window and follow-up list [P2] and Hit_Stop Ticks 0–30, default 0 [P4]. Tick fields are integers.
2. THE Attack_Registry SHALL contain the jab in M1 and the cross, hook, and uppercut from P2. [cross, hook, uppercut: P2]
3. THE Combat_Resolver SHALL read all timing, damage, cost, stun, and Hitbox values only from the Attack_Registry, so that changing a value in the Attack_Registry with no code change changes the matching observable outcome.
4. WHEN the Game_Simulation initializes, THE Game_Simulation SHALL validate every Attack_Definition before producing the first Simulation_State.
5. IF an Attack_Definition has a missing field, a non-finite number, a non-integer Tick field, a Tick field outside the ranges in D2, a negative value in another numeric field, a Hitbox size component of 0 or less, or a duplicate identifier, THEN THE Game_Simulation SHALL abort initialization and report every invalid field with the identifier (or registry position if the identifier is missing).
6. IF the Attack_Registry is empty, THEN THE Game_Simulation SHALL abort initialization with an empty-registry error.
7. THE Game_Simulation SHALL keep each uninterrupted attack in the Attacking state for exactly startup + active + recovery Ticks (invariant property).

### Requirement 6: Arena, Fighters, and Camera

**Phase:** M1 (stylized fighter models: P4)

**User Story:** As a player, I want to see a 3D ring with two fighters from a side-on camera, so that I can read the fight clearly.

#### Acceptance Criteria

1. WHEN a Match starts, THE Renderer SHALL display in the first frame the Ring with a floor, four corner posts, and ropes on all four sides.
2. WHEN a Match starts, THE Renderer SHALL display both Fighters as single-solid-color placeholder models in different colors that stay fixed during the Match. [M1]
3. WHERE stylized fighter models are available, THE Renderer SHALL display the stylized fighter models in place of the placeholders for both Fighters. [P4]
4. THE Renderer SHALL use a perspective camera whose viewing direction is perpendicular to the Fighters' axis of movement, so that the axis of movement maps to the screen's horizontal axis.
5. WHILE a Match is in progress, THE Renderer SHALL pan the camera each frame so the Fighters' midpoint lies within 1% of viewport width of the horizontal center.
6. WHILE a Match is in progress and the aspect ratio is between 4:3 and 21:9, THE Renderer SHALL keep both Fighters' full model bounds in view for every pair of positions in the Ring_Boundary, by moving the camera along its viewing direction as separation changes.
7. WHEN the window is resized, THE Renderer SHALL by the next frame set the canvas to the window's inner size and the camera aspect to canvas width ÷ height.
8. THE Renderer SHALL draw each Fighter at the interpolated position (Requirement 1 criterion 5) and the facing from the Simulation_State.
9. IF a stylized model fails to load, THEN THE Renderer SHALL show the placeholder for that Fighter and continue. [P4]

### Requirement 7: Horizontal Movement and Ring Boundaries

**Phase:** M1

**User Story:** As a player, I want to move my fighter forward and backward within the ring, so that I can control distance to my opponent.

#### Acceptance Criteria

1. WHEN a Fighter that is Able_To_Act receives exactly one of move-left or move-right on a Tick, THE Game_Simulation SHALL move the Fighter by its walk speed (greater than 0 world units per Tick) in that direction; a Blocking Fighter moves at reduced speed per Requirement 17 criterion 10 and stays Blocking. [Blocking: P2]
2. WHEN an Idle Fighter receives exactly one movement Fighter_Command, THE Fighter_FSM SHALL transition the Fighter to Walking on that Tick.
3. WHEN a Walking Fighter receives no movement Fighter_Command on a Tick, THE Fighter_FSM SHALL transition the Fighter to Idle without moving the Fighter.
4. IF a Fighter receives both move-left and move-right on one Tick, THEN THE Game_Simulation SHALL treat the commands as no movement.
5. IF a Tick's movement, after the Ring_Boundary limit in criterion 6, would bring the Fighters' centers closer than the minimum separation (greater than 0), THEN THE Game_Simulation SHALL shorten only movement toward the opponent so the distance equals the minimum separation, splitting the shortfall per D39.
6. THE Game_Simulation SHALL limit each Fighter's intended movement to the Ring_Boundary before applying criterion 5, so that no Fighter's position leaves the Ring_Boundary and a Fighter at a boundary is never pushed (D38).
7. IF the Ring_Boundary width is not greater than the minimum separation, THEN THE Game_Simulation SHALL refuse to initialize with a configuration error.
8. THE Game_Simulation SHALL set facing at the end of each Tick: positive if the opponent's position is greater, otherwise negative.
9. WHILE a Fighter is not Able_To_Act, THE Game_Simulation SHALL ignore movement Fighter_Commands for that Fighter.
10. THE Game_Simulation SHALL, after every Tick and for every Fighter_Command sequence, keep every position within the Ring_Boundary inclusive and center distance at least the minimum separation (invariant property).
11. IF the Ring_Boundary does not contain both configured starting positions, or the distance between the starting positions is less than the minimum separation, THEN THE Game_Simulation SHALL refuse to initialize the Match with a configuration error naming the invalid setting, and SHALL NOT adjust the values.
12. WHEN a Blocking Fighter with 0 Block_Stun Ticks receives no block Fighter_Command and exactly one movement Fighter_Command on a Tick, THE Fighter_FSM SHALL transition the Fighter directly to Walking and THE Game_Simulation SHALL move the Fighter at full walk speed on that Tick (D33). [P2]

### Requirement 8: Player Keyboard Input

**Phase:** M1 (block, slip, cross, hook, uppercut bindings: P2)

**User Story:** As a player, I want responsive keyboard controls, so that my fighter reacts immediately to my inputs.

#### Acceptance Criteria

1. THE Input_System SHALL map A and Left arrow to move-left and D and Right arrow to move-right, regardless of Shift or Caps Lock. [M1]
2. THE Input_System SHALL map J to jab, regardless of Shift or Caps Lock. [M1]
3. THE Input_System SHALL map K, L, and I to cross, hook, and uppercut, regardless of Shift or Caps Lock. [P2]
4. THE Input_System SHALL map S and Down arrow to block and Space to slip. [P2]
5. WHEN an attack or slip key changes from released to pressed, THE Input_System SHALL deliver exactly one Fighter_Command on the first Tick that begins after the press, even if the key is released before that Tick, and no more for that key until the key is released and pressed again (auto-repeat ignored).
6. WHILE a movement or block key is held, THE Input_System SHALL deliver the key's Fighter_Command on every Tick that begins after the press and before the release, and not on the first Tick that begins after the release (D43).
7. WHEN the window loses focus, THE Input_System SHALL treat all mapped keys as released and deliver nothing for a key until the key is pressed again after focus returns.
8. IF move-left and move-right keys are both held on a Tick, THEN THE Input_System SHALL deliver neither. [M1]
9. IF two or more attack or slip keys are pressed within one Tick, THEN THE Input_System SHALL deliver only the first-arriving one.
10. IF an unmapped key is pressed, THEN THE Input_System SHALL deliver no Fighter_Command.

### Requirement 9: Jab Attack and Attack Timing

**Phase:** M1

**User Story:** As a player, I want to throw a jab with clear startup, active, and recovery timing, so that attacks feel readable and fair.

#### Acceptance Criteria

1. THE Attack_Registry SHALL contain exactly one jab Attack_Definition whose startup Ticks are strictly fewer than those of every other Attack_Definition.
2. WHEN a Fighter that is Able_To_Act receives a jab Fighter_Command on Tick N, THE Fighter_FSM SHALL enter Attacking with the jab on Tick N, the first Startup_Phase Tick.
3. WHILE a Fighter is Attacking from Tick N with S startup, A active, and R recovery Ticks, THE Game_Simulation SHALL place the Fighter in Startup_Phase on Ticks N to N+S−1, Active_Phase on N+S to N+S+A−1, and Recovery_Phase on N+S+A to N+S+A+R−1, recording attack identifier and phase each Tick.
4. WHEN the Recovery_Phase ends, THE Fighter_FSM SHALL put the Fighter in Idle on Tick N+S+A+R, where the Fighter can accept a new Fighter_Command.
5. THE Game_Simulation SHALL end an attack early only as defined in Requirement 10 criterion 8, and from later phases by a cancel (Requirement 20 criterion 6) [P2], a Knockdown freeze (D21) [P3], or round end (Requirement 25 criterion 4) [P3]; uninterrupted duration follows Requirement 5 criterion 7.
6. IF a Fighter that is not Able_To_Act receives a jab Fighter_Command, THEN THE Fighter_FSM SHALL leave state and phase counters unchanged and handle the Fighter_Command per Requirement 4 criterion 11.

### Requirement 10: Hit Detection

**Phase:** M1

**User Story:** As a player, I want punches to connect only when they physically reach the opponent, so that spacing matters.

#### Acceptance Criteria

1. WHILE an attack is in the Active_Phase, THE Combat_Resolver SHALL test each Tick the attack's Hitbox (Attack_Definition offset from the attacker, mirrored by facing) against the opponent's Hurtbox (configured size, centered on the opponent) by axis-aligned bounding box overlap.
2. WHEN an Active_Phase Hitbox overlaps the opposing Hurtbox, THE Combat_Resolver SHALL register one contact; overlap requires positive intersection length on every axis, so touching edges do not overlap.
3. THE Combat_Resolver SHALL register at most one contact per attack instance; a landed hit, block [P2], or slip-evade [P2] each uses that contact.
4. WHEN a hit lands, THE Combat_Resolver SHALL reduce the target's Health by the damage from Requirement 35 criterion 7, clamped per Requirement 11.
5. WHEN a hit lands, THE Game_Simulation SHALL emit one hit-landed Game_Event with attacker, attack identifier, damage, and hit position (center of the Hitbox–Hurtbox intersection).
6. WHEN both Fighters' Hitboxes overlap the opposing Hurtboxes on the same Tick, THE Combat_Resolver SHALL apply both hits as a Trade using the snapshot in Requirement 35 criterion 4.
7. WHILE an attack is in the Startup_Phase or Recovery_Phase, THE Combat_Resolver SHALL treat the attack's Hitbox as inactive.
8. IF a hit lands on a Fighter that is Attacking in any phase, THEN THE Fighter_FSM SHALL end that attack on the same Tick and the ended attack SHALL register no later contact; in a Trade both hits still apply.
9. FOR ALL positions, facings, and phases where no Active_Phase Hitbox overlaps the opposing Hurtbox, THE Combat_Resolver SHALL leave Health unchanged and emit no hit-landed Game_Event (property).
10. IF a hit lands with 0 hit-stun Ticks, THEN THE Fighter_FSM SHALL apply D41 instead of entering HitStun.
11. WHEN a hit lands with hit-stun Ticks greater than 0, THE Fighter_FSM SHALL put the target in HitStun for those Ticks, subject to Requirement 35 criteria 8 and 9.

### Requirement 11: Health and Health Bars

**Phase:** M1

**User Story:** As a player, I want to see both fighters' health, so that I know who is winning.

#### Acceptance Criteria

1. WHEN a Match starts, THE Game_Simulation SHALL set each Fighter's Health to the configured maximum Health (integer 1–1,000).
2. WHEN damage or healing applies, THE Game_Simulation SHALL clamp Health to 0 through maximum Health.
3. WHILE a Match is in progress, THE Fight_HUD SHALL show a labelled health bar for the Player_Fighter on the left and the AI_Fighter on the right.
4. WHILE a Match is in progress, THE Fight_HUD SHALL fill each health bar to Health ÷ maximum Health within 1% of bar width.
5. WHEN Health changes, THE Fight_HUD SHALL show the new value by the next displayed frame.
6. WHILE in M1 prototype mode, WHEN a Fighter's Health reaches 0, THE Fighter_FSM SHALL put the Fighter in Defeated on that Tick. [M1; superseded by Requirements 23–24 in P3]
7. WHILE in M1 prototype mode, WHEN exactly one Fighter is Defeated, THE Game_Simulation SHALL declare the other Fighter the winner and ignore all further Fighter_Commands for both Fighters. [M1; superseded in P3]
8. WHILE in M1 prototype mode, IF both Fighters reach Health 0 on the same Tick, THEN THE Game_Simulation SHALL put both Fighters in Defeated and declare a draw. [M1; superseded in P3]
9. IF maximum Health is not an integer 1–1,000, THEN THE Game_Simulation SHALL refuse to start with a configuration error.

### Requirement 12: Basic AI Opponent

**Phase:** M1

**User Story:** As a player, I want an AI opponent that moves and jabs, so that the prototype is playable alone.

#### Acceptance Criteria

1. THE AI_Controller SHALL issue Fighter_Commands through the same Fighter_Command interface as the Input_System, with identical Fighter_FSM acceptance rules.
2. THE AI_Controller SHALL read only the Simulation_State, never modify the Simulation_State, and never read input, rendering state, or wall-clock time.
3. WHILE the center distance is at least the jab's Connect_Range, THE AI_Controller SHALL issue one movement Fighter_Command per Tick toward the Player_Fighter.
4. WHILE the center distance is strictly less than the jab's Connect_Range and the AI_Fighter is Able_To_Act, THE AI_Controller SHALL issue no movement and SHALL issue a jab on the first Tick at least the attack interval (integer 1–600 Ticks; per Difficulty_Level from P2, Requirement 22) after the AI_Fighter's previous jab or Match start; from P2, measured from the AI_Fighter's previous attack of any type.
5. WHEN the AI_Controller computes Fighter_Commands for Tick T, THE AI_Controller SHALL read the Player_Fighter only from the Player_Observation recorded at the end of Tick T − 1 − D, where D is the reaction delay (integer 0–120 Ticks), and SHALL read the AI_Fighter's own state from the current Simulation_State.
6. WHERE randomness is required, THE AI_Controller SHALL draw only from the PRNG state copy it receives and return the advanced state for the Game_Simulation to commit (D40).
7. WHILE the AI_Fighter is not Able_To_Act, THE AI_Controller SHALL issue no regular attack; counterpunch and combo follow-up commands (Requirement 22) are handled by buffering and cancels (Requirement 20).
8. WHEN a winner or draw is declared in M1, THE AI_Controller SHALL issue no Fighter_Commands until restart.
9. WHEN a Gameplay_Tick completes, THE Game_Simulation SHALL append the Player_Observation for that Tick to the Player_Observation_History, discarding the oldest entry once 121 entries are held.
10. IF Tick T − 1 − D is earlier than the first Tick of the Match, THEN THE AI_Controller SHALL use the Player_Observation recorded at Match start.
11. THE Game_Simulation SHALL include the Player_Observation_History in the Simulation_State so that the Player_Observation_History is covered by the determinism and serialization round-trip properties of Requirement 3.
12. WHEN the Match is restarted (Requirement 13 criterion 4), THE Game_Simulation SHALL reset the Player_Observation_History to contain only the Match-start observation.
13. THE AI_Controller SHALL use the delayed Player_Observation for every Player_Fighter input to its decisions, including the center distance in criteria 3 and 4.
14. THE M1 AI_Controller SHALL return the received PRNG state unchanged (D40).

### Requirement 13: Prototype Fight Loop

**Phase:** M1

**User Story:** As a player, I want to start and restart a prototype fight, so that I can play repeatedly.

#### Acceptance Criteria

1. WHEN the Game finishes loading in M1 prototype mode, THE Game SHALL start a fight with no player input, both Fighters at starting positions, maximum Health, Idle, and facing each other. [M1; replaced by the Main_Menu in Requirement 28 from P3]
2. WHEN a winner or draw is declared in M1, THE Game SHALL show within 1 second a label naming the winner (player or AI opponent) or "Draw", plus a restart prompt.
3. WHILE a result is shown and restart has not been activated, THE Game_Simulation SHALL ignore all Fighter_Commands and keep Health unchanged.
4. WHEN the player presses Enter or clicks the restart prompt, THE Game_Simulation SHALL within 1 Tick reset both Fighters to starting positions, maximum Health, Idle, facing each other, with in-progress attacks cleared and the PRNG reset to the initial seed (D8).
5. WHEN the restart completes, THE Game SHALL hide the result label and resume processing Fighter_Commands on the next Tick.
6. WHEN the restart prompt is activated N times (1–100), THE Game_Simulation SHALL, given the same validated configuration, seed, and Fighter_Command sequence, produce after every Tick of each restarted fight the same Simulation_State as at the corresponding Tick of the initial fight.

### Requirement 14: Client-Only Delivery

**Phase:** M1

**User Story:** As a player, I want the game to run entirely in my browser, so that I can play without accounts or servers.

#### Acceptance Criteria

1. WHEN the production build runs, THE Game SHALL output only static files needing no server code, server-side rendering, or runtime environment variables.
2. WHEN the build is served by any static host from the root or a subdirectory, THE Game SHALL behave as in local development.
3. THE Game SHALL run all gameplay, AI, and scoring logic in the browser.
4. WHILE loading or running, THE Game SHALL request only static files from its own origin and no backend, API, or third-party origin.
5. THE Game SHALL allow starting and finishing a Match with no account, login, or personal information.
6. THE Game SHALL run a complete Match with no uncaught errors in the latest stable Chrome, Firefox, and Edge on Windows, macOS, and Linux.
7. IF no WebGL2 context is available at startup, THEN THE Game SHALL show, in place of the scene within 2 seconds, a message that WebGL2 is required, and not start the Game_Simulation.
8. IF a required static file fails to load, THEN THE Game SHALL show a failed-to-load message and not start a Match; audio assets follow Requirement 33 and stylized models follow Requirement 6 criterion 9 instead.

### Requirement 15: Automated Testing

**Phase:** M1 (extended in every later phase)

**User Story:** As a developer, I want automated tests for gameplay logic, so that changes do not break combat behavior.

#### Acceptance Criteria

1. THE Game SHALL include Vitest unit tests covering: (a) every declared Fighter_FSM transition plus at least one undeclared transition being ignored; (b) Combat_Resolver outcomes for overlap in the Active_Phase, no overlap, and overlap in Startup_Phase or Recovery_Phase; (c) clamping at both Ring_Boundary ends and at minimum separation; (d) each Attack_Definition rejection case in Requirement 5; (e) the M1 rules in Requirement 35 (Trade, Health-zero priority, simultaneous Health 0).
2. THE Game SHALL include Vitest property-based tests for Requirement 3 criteria 1, 4, and 5; Requirement 4 criterion 8; Requirement 5 criterion 7; Requirement 7 criterion 10; and Requirement 10 criterion 9, each with at least 100 generated cases and Fighter_Command sequences of 1–600 Ticks.
3. WHEN `vitest --run` is executed, THE Game SHALL run the suite once without watch mode, exit 0 on full pass and non-zero on any failure, within 60 seconds on the Reference_Desktop.
4. IF a property-based test fails, THEN THE Game's test run SHALL report the test name, the failing input, and the seed to reproduce the failure.
5. THE Game SHALL run Game_Simulation tests with no browser window, WebGL, DOM, or audio device.
6. WHEN a later phase delivers a criterion labelled property or invariant property, THE Game SHALL add a property-based test for that criterion in that phase with the bounds in criterion 2.
7. THE Game SHALL include an automated test proving that, for the default configuration, at least one center distance between the minimum separation and the Ring_Boundary width lets the jab Hitbox overlap the opposing Hurtbox, and that every distance at which the AI_Controller issues a jab (Requirement 12 criterion 4) lets the jab connect.
8. IF the configured jab can connect at no center distance of at least the minimum separation, THEN THE Game_Simulation SHALL refuse to initialize with a configuration error naming the jab.

### Requirement 35: Tick Resolution Order

**Phase:** M1 (later-phase steps tagged [P2]/[P3]/[P4])

**User Story:** As a developer, I want a fixed order of operations within each Tick, so that simultaneous events always resolve the same way.

#### Acceptance Criteria

1. THE Game_Simulation SHALL process each Tick in this order: (1) Hit_Stop check [P4]; (2) AI_Controller decision and PRNG commit (D40), then command intake and validation; (3) timer advancement (attack phase, HitStun, Block_Stun [P2], Slipping [P2], GuardBroken [P2], Input_Buffer age [P2], Knockdown_Count [P3]); (4) action selection per Fighter; (5) stamina deduction for actions started this Tick [P2]; (6) movement limited to the Ring_Boundary, separation, facing (D38); (7) hit detection and outcome application for both Fighters against one shared snapshot; (8) Health-zero checks; (9) round timer and round end [P3]; (10) Game_Event emission.
2. WHEN a Fighter is Able_To_Act, THE Fighter_FSM SHALL start at most one action that Tick, chosen by the priority in D9.
3. IF a Fighter receives more than one attack Fighter_Command on one Tick, THEN THE Fighter_FSM SHALL start only the highest-priority attack per D9 and discard the rest.
4. THE Combat_Resolver SHALL detect hits for both Fighters from one snapshot taken after step 6, so that results do not depend on processing order.
5. WHEN a Hitbox overlaps a Hurtbox, THE Combat_Resolver SHALL apply the first matching outcome: slip-evade [P2] (Slipping within invulnerable Ticks, attack not uppercut), then block [P2] (Blocking and not GuardBroken), then landed hit.
6. WHEN both attacks in a Trade are in the Active_Phase, THE Combat_Resolver SHALL classify neither hit as a Counterpunch. [P2]
7. THE Combat_Resolver SHALL compute damage as base damage × combo scaling^(n−1) (n as defined in Requirement 20 criterion 10) [P2] × low-stamina multiplier if applicable [P2] × counter multiplier if applicable [P2], rounded half up; a landed hit deals at least 1; blocked chip damage is round-half-up(damage × chip fraction) and may be 0 [P2].
8. WHEN a landed hit strikes a Fighter already in HitStun, THE Combat_Resolver SHALL reset remaining HitStun to the new hit's hit-stun Ticks; a new blocked hit likewise resets Block_Stun [P2].
9. WHEN a hit reduces a Fighter's Health to 0, THE Fighter_FSM SHALL put the Fighter in Defeated (M1) or KnockedDown (P3) instead of HitStun on that Tick.
10. IF both Fighters reach Health 0 on the same Tick, THEN THE Game_Simulation SHALL apply the M1 draw rule in Requirement 11, and from P3 put both Fighters in KnockedDown with outcomes defined in Requirement 24.
11. IF a Knockdown occurs on the Tick the round timer reaches 0, THEN THE Round_Manager SHALL process the Knockdown first, with the timer held at 0; if the Fighter rises the round ends that Tick, otherwise KO applies; TKO is checked before round end. [P3]
12. THE Game_Simulation SHALL emit Game_Events within a Tick in the order defined by D10.

---

## P2 – Full Combat

### Requirement 16: Cross, Hook, and Uppercut

**Phase:** P2

**User Story:** As a player, I want four distinct punches, so that I can choose between speed, power, and range.

#### Acceptance Criteria

1. THE Attack_Registry SHALL contain exactly one Attack_Definition each for the jab, cross, hook, and uppercut, each with a unique identifier.
2. THE Attack_Registry SHALL define the cross with damage strictly greater than the jab's and startup Ticks strictly greater than the jab's.
3. THE Attack_Registry SHALL define the hook with guard damage strictly greater than the cross's and Hitbox_Reach strictly less than the cross's.
4. THE Attack_Registry SHALL define the uppercut with damage strictly greater than each of the jab, cross, and hook, and recovery Ticks strictly greater than each of theirs.
5. WHEN a Fighter that is Able_To_Act receives a cross, hook, or uppercut Fighter_Command, THE Fighter_FSM SHALL enter Attacking with the matching Attack_Definition on that Tick, the first Startup_Phase Tick.
6. IF a Fighter that is not Able_To_Act receives a cross, hook, or uppercut Fighter_Command, THEN THE Fighter_FSM SHALL leave its state unchanged and buffer or discard the Fighter_Command per Requirement 20.
7. IF more than one attack Fighter_Command arrives on one Tick, THEN THE Fighter_FSM SHALL apply Requirement 35 criterion 3.
8. IF any Attack_Definition violates criteria 2, 3, or 4 at initialization, THEN THE Game_Simulation SHALL abort initialization per Requirement 5 with an error naming the punch type and the violated relation.

### Requirement 17: Blocking and Guard

**Phase:** P2

**User Story:** As a player, I want to block incoming punches at the cost of guard durability, so that defense is rewarding but not unlimited.

#### Acceptance Criteria

1. WHEN a Fighter that is Able_To_Act receives a block Fighter_Command, THE Fighter_FSM SHALL place the Fighter in Blocking on that Tick.
2. WHEN a Blocking Fighter with 0 Block_Stun Ticks receives neither a block Fighter_Command nor exactly one movement Fighter_Command on a Tick, THE Fighter_FSM SHALL transition the Fighter to Idle on that Tick; with exactly one movement Fighter_Command, Requirement 7 criterion 12 applies instead.
3. WHEN a hit is blocked, THE Combat_Resolver SHALL on that Tick reduce Health by chip damage per Requirement 35 criterion 7 (chip-damage fraction 0–1), reduce Guard by the attack's guard damage (minimum 0), and set Block_Stun to the attack's block-stun Ticks without entering HitStun.
4. WHEN a hit is blocked, THE Game_Simulation SHALL emit an attack-blocked Game_Event with the blocking Fighter, the attack identifier, and the contact position (center of the Hitbox–Hurtbox intersection).
5. IF a blocked hit reduces Guard to 0, THEN THE Fighter_FSM SHALL put the Fighter in GuardBroken on that Tick for the configured guard-break Ticks (integer 1–180), discarding remaining Block_Stun, and THE Game_Simulation SHALL emit a guard-break Game_Event for that Fighter.
6. WHILE a Fighter is GuardBroken, THE Fighter_FSM SHALL reject block, slip, movement, and attack Fighter_Commands and keep Guard at 0.
7. WHEN the guard-break Ticks elapse, THE Game_Simulation SHALL set Guard to the configured guard-recovery value (integer 1 to maximum Guard) and THE Fighter_FSM SHALL put the Fighter in Idle on that Tick.
8. IF a hit lands on a GuardBroken Fighter, THEN THE Combat_Resolver SHALL treat it as a landed hit per D17. With 0 hit-stun Ticks, D41 applies and the guard-recovery value is applied on that Tick.
9. WHILE a Fighter is not GuardBroken and has blocked no hit during the last guard-regeneration delay Ticks (integer 0–600), THE Game_Simulation SHALL increase Guard by the regeneration rate (integer ≥ 0 per Tick), up to maximum Guard.
10. WHILE a Fighter is Blocking with 0 Block_Stun Ticks, THE Game_Simulation SHALL move the Fighter at walk speed × block walk-speed multiplier (0–1) and keep the Fighter in Blocking.
11. WHILE a Blocking Fighter has 1 or more Block_Stun Ticks, THE Fighter_FSM SHALL keep the Fighter Blocking and stationary, execute no attack, slip, or movement Fighter_Commands (attacks are buffered per Requirement 20), and decrease Block_Stun by 1 each Tick.
12. WHEN a Match starts, THE Game_Simulation SHALL set each Fighter's Guard to maximum Guard (integer 1–1,000).

### Requirement 18: Slipping

**Phase:** P2

**User Story:** As a player, I want to slip punches, so that I can evade and create counter opportunities.

#### Acceptance Criteria

1. WHEN a Fighter that is Able_To_Act receives a slip Fighter_Command and has Stamina at least the slip stamina cost, THE Fighter_FSM SHALL enter Slipping on that Tick and THE Game_Simulation SHALL deduct the slip stamina cost on that Tick.
2. IF a Fighter that is Able_To_Act receives a slip Fighter_Command with Stamina below the slip stamina cost, THEN THE Fighter_FSM SHALL keep its current state and THE Game_Simulation SHALL leave Stamina unchanged (D15).
3. WHILE a Fighter is within the slip invulnerable Ticks (integer 1 to slip duration), counted from the first Slipping Tick, THE Combat_Resolver SHALL treat the Fighter's Hurtbox as unhittable by jab, cross, and hook. Slip duration is an integer 1–60 Ticks.
4. WHILE a Fighter is Slipping, THE Combat_Resolver SHALL allow uppercuts to land on every Slipping Tick, and jab, cross, and hook after the invulnerable Ticks, with the same outcome as against an Idle Fighter.
5. WHEN a jab, cross, or hook Active_Phase Hitbox overlaps a Slipping Fighter's Hurtbox during the invulnerable Ticks, THE Game_Simulation SHALL emit one slip-evaded Game_Event per attack instance (slipping Fighter and attack identifier), leave Health, Stamina, and Guard unchanged, and count the contact as used per Requirement 10 criterion 3.
6. WHEN a Fighter has been Slipping for the slip duration without being struck, THE Fighter_FSM SHALL transition the Fighter to Idle on the next Tick.
7. WHILE a Fighter is Slipping, THE Fighter_FSM SHALL reject movement, block, and slip Fighter_Commands and buffer attack Fighter_Commands per Requirement 20.
8. IF a Slipping Fighter is struck, THEN THE Fighter_FSM SHALL end Slipping on that Tick and enter HitStun per Requirement 10 criterion 11, or Idle per D41.

### Requirement 19: Stamina

**Phase:** P2

**User Story:** As a player, I want punches to cost stamina, so that I must pace my offense.

#### Acceptance Criteria

1. WHEN a Fighter starts an attack (including from the Input_Buffer or a Cancel_Window), THE Game_Simulation SHALL subtract that attack's stamina cost once on that Tick, with a minimum of 0.
2. IF a Fighter's Stamina before the deduction is below the attack's stamina cost, THEN THE Game_Simulation SHALL still start the attack and apply the low-stamina damage multiplier (greater than 0 and at most 1) to its hits per Requirement 35 criterion 7.
3. WHILE a Fighter is Idle, Walking, or Blocking, THE Game_Simulation SHALL increase Stamina by the regeneration rate (integer ≥ 0 per Tick) up to maximum Stamina, except on a Tick where an attack or slip started (D16).
4. WHILE a Fighter is in any other Fighter_FSM state, THE Game_Simulation SHALL change Stamina only by the deductions in this requirement and Requirement 18.
5. WHEN a Match starts, THE Game_Simulation SHALL set each Fighter's Stamina to maximum Stamina (integer 1–1,000).
6. THE Game_Simulation SHALL keep every Fighter's Health, Stamina, and Guard between 0 and their configured maximums inclusive after every Tick, for every Fighter_Command sequence (invariant property).
7. IF maximum Stamina, the regeneration rate, or the low-stamina damage multiplier is outside its range, THEN THE Game_Simulation SHALL refuse to initialize with an error naming the setting.

### Requirement 20: Input Buffering and Combos

**Phase:** P2

**User Story:** As a player, I want to chain punches into combos, so that skilled timing is rewarded.

#### Acceptance Criteria

1. WHEN a Fighter in a bufferable state (D12) receives an attack Fighter_Command, THE Input_Buffer SHALL hold it for 6 Ticks, counting the receiving Tick as the first, replacing any held command.
2. WHEN a Fighter becomes Able_To_Act while the Input_Buffer holds an unexpired command, THE Fighter_FSM SHALL start that attack on that Tick and clear the Input_Buffer.
3. IF a held command's 6 Ticks end before the Fighter becomes Able_To_Act, THEN THE Input_Buffer SHALL discard it.
4. IF a Fighter in a non-bufferable state (D12) receives an attack Fighter_Command, THEN THE Input_Buffer SHALL discard it.
5. WHERE an Attack_Definition defines a Cancel_Window, THE Attack_Registry SHALL store the Cancel_Window as integer start and end Ticks counted from the first Recovery_Phase Tick (0-based), with a list of 0–4 permitted follow-up attacks.
6. WHEN a Fighter whose current attack landed a hit (D13) receives or holds a permitted follow-up command on a Tick within its Cancel_Window, THE Fighter_FSM SHALL end the current attack and start the follow-up's Startup_Phase on that Tick.
7. WHEN an attack lands while the struck Fighter is not in HitStun, THE Game_Simulation SHALL set the attacker's combo counter to 1.
8. WHEN an attack lands while the struck Fighter is still in HitStun from the attacker's previous hit, THE Game_Simulation SHALL increment the combo counter by 1 and emit a combo Game_Event with the attacker and the new count (D14).
9. WHEN a struck Fighter leaves HitStun, THE Game_Simulation SHALL reset the attacker's combo counter to 0.
10. THE Combat_Resolver SHALL apply the combo damage-scaling factor (0.5–1.0) per Requirement 35 criterion 7, with n equal to the attacker's combo counter after the update in criterion 7 or 8 for the current hit (D37).
11. IF a Cancel_Window's end Tick is before its start Tick or beyond the last Recovery_Phase Tick, THEN THE Game_Simulation SHALL reject that Attack_Definition per Requirement 5.
12. THE Game_Simulation SHALL update a Fighter's combo counter exactly once per landed hit by that Fighter, except that a 0 hit-stun hit on a Fighter in HitStun leaves the counter unchanged (D41).
13. WHEN a Trade occurs, THE Game_Simulation SHALL update each attacker's combo counter independently, evaluating the "struck Fighter is in HitStun" condition from the shared snapshot (Requirement 35 criterion 4).
14. WHEN an attack is blocked or slip-evaded, THE Game_Simulation SHALL leave the attacker's combo counter unchanged.
15. IF an Attack_Definition defines no Cancel_Window, THEN THE Fighter_FSM SHALL let no follow-up attack cancel that attack.
16. IF an Attack_Definition has 0 recovery Ticks, THEN THE Game_Simulation SHALL reject a Cancel_Window on it per Requirement 5.

### Requirement 21: Counterpunches

**Phase:** P2

**User Story:** As a player, I want to punish opponents who attack carelessly, so that timing and reading matter.

#### Acceptance Criteria

1. WHEN a hit lands on a Fighter that is in the Startup_Phase or Recovery_Phase of an attack in the Tick snapshot (Requirement 35 criterion 4), THE Combat_Resolver SHALL classify the hit as a Counterpunch.
2. WHEN a Fighter lands a hit within the post-slip window (integer 1–60 Ticks, starting the Tick after that Fighter's slip-evaded Game_Event), THE Combat_Resolver SHALL classify the first such hit as a Counterpunch.
3. WHEN a Counterpunch lands, THE Combat_Resolver SHALL apply the counter damage multiplier (1.0–3.0) once per Requirement 35 criterion 7.
4. WHEN a Counterpunch lands, THE Combat_Resolver SHALL multiply hit-stun Ticks by the counter hit-stun multiplier (1.0–3.0), rounded half up.
5. WHEN a Counterpunch lands, THE Game_Simulation SHALL emit one counterpunch Game_Event with attacker, struck Fighter, attack identifier, and final damage.
6. IF a hit meets both criterion 1 and criterion 2, THEN THE Combat_Resolver SHALL treat it as one Counterpunch with the multipliers applied once.
7. IF an attack is blocked or slip-evaded, THEN THE Combat_Resolver SHALL not classify it as a Counterpunch.
8. WHEN a Trade occurs with both attacks in the Active_Phase, THE Combat_Resolver SHALL apply Requirement 35 criterion 6.

### Requirement 22: AI Difficulty Levels

**Phase:** P2

**User Story:** As a player, I want to choose the AI difficulty, so that the challenge matches my skill.

#### Acceptance Criteria

1. THE AI_Controller SHALL support exactly three Difficulty_Levels: Easy, Normal, and Hard.
2. THE AI_Controller SHALL read for the selected Difficulty_Level: reaction delay (Ticks), block probability, slip probability, attack interval (integer 1–600 Ticks), combo probability, counterpunch probability, and a selection weight (greater than 0) per punch type; probabilities are 0.0–1.0 and block plus slip must not exceed 1.0.
3. THE AI_Controller SHALL use reaction delays of 20–40 Ticks for Easy, 12–19 for Normal, and 6–11 for Hard; Easy's block, slip, combo, and counterpunch probabilities SHALL be at most Normal's, and Hard's at least Normal's.
4. WHEN the Player_Fighter enters an attack's Startup_Phase within that attack's Connect_Range, THE AI_Controller SHALL, exactly reaction-delay Ticks later (as observed through D32), choose block, slip, or no defense by the Difficulty_Level's probabilities using the Simulation_State's PRNG; a chosen block is held until the Player_Fighter's attack ends.
5. WHEN the Player_Fighter enters an attack's Recovery_Phase within the AI_Fighter's jab Connect_Range, THE AI_Controller SHALL, exactly reaction-delay Ticks later (as observed through D32), issue an attack Fighter_Command with the counterpunch probability using the Simulation_State's PRNG.
6. WHEN the AI_Controller makes an attack decision, THE AI_Controller SHALL choose a punch type with probability proportional to its selection weight.
7. WHEN the AI_Fighter's Cancel_Window opens after a landed hit, THE AI_Controller SHALL issue a permitted follow-up within that window with the combo probability.
8. WHILE the AI_Fighter's Stamina is below the low-stamina threshold (fraction 0.0–1.0 of maximum Stamina), THE AI_Controller SHALL multiply its attack interval by the low-stamina interval multiplier (greater than 1.0, result rounded up) and move away from the Player_Fighter on Ticks with no other action unless at the Ring_Boundary, returning to normal behavior on the first Tick Stamina is at or above the threshold.
9. WHEN more than one AI decision applies on one Tick, THE AI_Controller SHALL follow the priority in D18.
10. WHEN a Match starts, THE AI_Controller SHALL use the Difficulty_Level selected in the Main_Menu (Normal if none) and keep it for the whole Match.
11. IF a Difficulty_Level's parameters are missing or violate criteria 2, 3, or 8, THEN THE Game SHALL not start the Match and SHALL show an error naming the Difficulty_Level and parameter, leaving the Main_Menu selection unchanged.

---

## P3 – Match Structure and Menus

### Requirement 23: Knockdowns

**Phase:** P3

**User Story:** As a player, I want heavy damage to cause knockdowns, so that fights have dramatic turning points.

#### Acceptance Criteria

1. WHEN a hit (landed, or blocked chip damage per D20) reduces a Fighter's Health to 0, THE Fighter_FSM SHALL put the Fighter in KnockedDown on that Tick (Requirement 35 criterion 9), THE Game_Simulation SHALL add 1 to that Fighter's round and Match Knockdown totals, and THE Game_Simulation SHALL emit a Knockdown Game_Event with the Fighter, round number, and elapsed round time.
2. WHEN a Fighter enters KnockedDown and it is not that Fighter's third Knockdown in the round, THE Round_Manager SHALL on that Tick pause the round timer, reposition the standing Fighter per criteria 3–9, set the Knockdown_Count to 1, and add 1 to it every 60 Ticks.
3. WHEN exactly one Fighter enters KnockedDown and the Knockdown_Count starts, THE Round_Manager SHALL move the standing Fighter on that Tick to F + d × K (the preferred side) if that point lies within the Ring_Boundary inclusive, where F is the fallen Fighter's position, S is the standing Fighter's position, K is the Knockdown_Separation, [Bmin, Bmax] is the Ring_Boundary, and d = +1 if S > F, else −1 (S never equals F because of minimum separation).
4. IF F + d × K lies outside the Ring_Boundary and F − d × K lies within it, THEN THE Round_Manager SHALL move the standing Fighter to F − d × K (the opposite side).
5. IF both F + d × K and F − d × K lie outside the Ring_Boundary and Bmin and Bmax are at different distances from F, THEN THE Round_Manager SHALL move the standing Fighter to whichever of Bmin or Bmax is farther from F.
6. IF both F + d × K and F − d × K lie outside the Ring_Boundary and Bmin and Bmax are equally far from F, THEN THE Round_Manager SHALL move the standing Fighter to the Ring_Boundary end on the preferred side.
7. THE Round_Manager SHALL leave the fallen Fighter's position unchanged and SHALL set both Fighters' facing per Requirement 7 criterion 8 at the end of that Tick.
8. THE Round_Manager SHALL place the standing Fighter so that its center distance from the fallen Fighter is at least the minimum separation after repositioning, for every F within the Ring_Boundary (invariant property).
9. WHEN the standing Fighter is repositioned, THE Renderer SHALL draw that Fighter at its new position without interpolating from its previous position on that Tick, so it is never drawn passing through the fallen Fighter.
10. IF Knockdown_Separation is less than the minimum separation, or the Ring_Boundary width is less than 2 × the minimum separation, THEN THE Game_Simulation SHALL refuse to initialize with a configuration error naming the setting.
11. WHEN a Fighter enters KnockedDown, THE Game_Simulation SHALL compute its rise count once as base rise count + per-knockdown increase × the Fighter's Knockdowns earlier in the Match, not counting the current one, + a PRNG integer from 0 to rise variance, clamped to 2–10; 10 means the Fighter does not rise (Requirement 24).
12. WHEN the Knockdown_Count reaches a rise count of 9 or lower, THE Game_Simulation SHALL put that Fighter in Idle on that Tick with Health = round-half-up(maximum Health × (recovery fraction − per-knockdown penalty × the Fighter's Knockdowns earlier in the Match, not counting the current one)), limited to 1 through maximum Health; recovery fraction and penalty are 0–1.
13. WHEN the last knocked-down Fighter leaves KnockedDown, THE Round_Manager SHALL resume the round timer on that Tick from its paused value.
14. WHILE any Fighter is KnockedDown, THE Game_Simulation SHALL apply D21 and THE Combat_Resolver SHALL register no hits.
15. WHEN the Knockdown_Count increases, THE Game_Simulation SHALL emit a knockdown-count Game_Event with the new value.
16. WHILE a Fighter is KnockedDown, THE Fight_HUD SHALL show the Knockdown_Count (1–10) by the next displayed frame after each change.
17. WHEN both Fighters reach Health 0 on the same Tick, THE Round_Manager SHALL apply D19 (Requirement 35 criterion 10) and D31, moving neither Fighter.
18. WHEN a Fighter rises from KnockedDown, THE Game_Simulation SHALL leave that Fighter's Stamina unchanged.
19. WHEN a Fighter rises from KnockedDown with Guard 0, THE Game_Simulation SHALL set that Fighter's Guard to the configured guard-recovery value (D34).
20. WHEN a Fighter rises from KnockedDown with Guard above 0, THE Game_Simulation SHALL leave that Fighter's Guard unchanged (D34).
21. WHEN a Fighter rises from KnockedDown, THE Game_Simulation SHALL clear that Fighter's HitStun, Block_Stun, GuardBroken, and Slipping timers, any pending guard recovery from D17, and its post-slip window, and SHALL set both Fighters' combo counters to 0.
22. WHEN a Fighter rises from KnockedDown, THE Game_Simulation SHALL clear both Fighters' Input_Buffers, discard all Fighter_Commands on the rise Tick, and accept Fighter_Commands for both Fighters from the next Tick, unless another Fighter is still KnockedDown (D21 continues to apply).
23. WHEN a Fighter enters KnockedDown, THE Game_Simulation SHALL set both Fighters' combo counters to 0.

### Requirement 24: KO and TKO

**Phase:** P3

**User Story:** As a player, I want fights to end by KO or TKO, so that dominant performances end the match early.

#### Acceptance Criteria

1. IF the Knockdown_Count reaches 10 while a Fighter is still KnockedDown, THEN THE Round_Manager SHALL declare a KO for the opposing Fighter and end the Match on that Tick (540 Ticks after the count started at 1).
2. IF a Fighter suffers a third Knockdown in one round, THEN THE Round_Manager SHALL declare a TKO for the opposing Fighter and end the Match on that Tick without starting a Knockdown_Count.
3. WHEN both Fighters are knocked down on the same Tick, THE Round_Manager SHALL decide the result per D19.
4. WHEN a new round starts, THE Round_Manager SHALL reset each Fighter's round Knockdown total to 0.
5. WHEN the Match ends by KO or TKO, THE Game_Simulation SHALL emit one match-end Game_Event with the result (Player_Fighter, AI_Fighter, or draw), method (KO or TKO), round (1–3), and elapsed round time in Ticks counting only Ticks the round timer ran.
6. WHILE the Match has ended, THE Game_Simulation SHALL ignore all Fighter_Commands, stop the round timer, and leave Health, Stamina, and Guard unchanged.

### Requirement 25: Rounds

**Phase:** P3

**User Story:** As a player, I want a three-round match structure, so that the fight has pacing and comebacks.

#### Acceptance Criteria

1. THE Round_Manager SHALL run at most 3 rounds, each lasting the configured duration (integer 1,800–10,800 Ticks; default 5,400 Ticks = 90 s), with the round timer decreasing 1 per Tick only while the round is in progress and not during the round-start announcement, between-round interval, a Knockdown_Count, Hit_Stop [P4], or pause.
2. WHEN a round starts, THE Round_Manager SHALL place both Fighters at their starting positions in Idle with empty Input_Buffers and show a round-start announcement for 120 Ticks, discarding all Fighter_Commands during it.
3. WHEN the 120-Tick announcement ends, THE Round_Manager SHALL emit a round-start Game_Event, start the round timer, and accept Fighter_Commands from the next Tick.
4. WHEN the round timer reaches 0, THE Round_Manager SHALL end the round after that Tick's hits are applied (Requirement 35 criterion 11), cancel attacks, put both Fighters in Idle, discard further commands, and emit a round-end Game_Event with the round number.
5. WHEN round 1 or 2 ends by time, THE Round_Manager SHALL run the between-round interval (integer 0–3,600 Ticks; default 300), discarding commands, set Stamina and Guard to maximum, add the between-round recovery amount (integer 0 to maximum Health) to Health up to maximum, then start the next round.
6. WHEN round 3 ends by time with no KO or TKO, THE Round_Manager SHALL end the Match by decision and emit a match-end Game_Event with method Decision and the Scoring_System's result.
7. IF a KO or TKO occurs in round 1 or 2, THEN THE Round_Manager SHALL end the Match on that Tick without further intervals or rounds.
8. IF the round duration or between-round interval is outside its range, THEN THE Game_Simulation SHALL refuse to initialize with a configuration error (D22).
9. WHEN a round starts, THE Round_Manager SHALL reset for both Fighters: combo counters to 0; HitStun, Block_Stun, GuardBroken, and Slipping timers; any pending guard recovery from D17; post-slip windows; guard-regeneration delay counters (treated as having no recent blocked hit); Input_Buffers; any attack in progress; and any Hit_Stop counter [P4] (D35).
10. WHEN a round starts, THE Round_Manager SHALL reset the Player_Observation_History to contain only the round-start observation.
11. WHEN a round starts, THE AI_Controller SHALL measure its attack interval from the round's first Tick that accepts Fighter_Commands.
12. WHEN a round starts, THE Round_Manager SHALL keep each Fighter's Health, Stamina, Guard, Match Knockdown totals, and scoring statistics unchanged except for the changes defined in criterion 5 (between-round recovery) and Requirement 24 criterion 4 (round Knockdown totals).

### Requirement 26: Scoring

**Phase:** P3

**User Story:** As a player, I want rounds scored fairly, so that a decision reflects who fought better.

#### Acceptance Criteria

1. THE Scoring_System SHALL track per Fighter per round, as non-negative integers starting at 0: punches thrown, punches landed, punches blocked, Counterpunches landed, damage dealt, and Knockdowns scored.
2. WHEN a Fighter's attack enters its Startup_Phase, THE Scoring_System SHALL add 1 to that Fighter's punches thrown.
3. WHEN a hit lands, THE Scoring_System SHALL add 1 to the attacker's punches landed and add the Health removed to the attacker's damage dealt.
4. WHEN a hit is blocked, THE Scoring_System SHALL add 1 to the attacker's punches blocked.
5. WHEN a Counterpunch lands, THE Scoring_System SHALL add 1 to the attacker's Counterpunches landed.
6. WHEN a Knockdown occurs, THE Scoring_System SHALL add 1 to the opposing Fighter's Knockdowns scored (in a double knockdown each Fighter scores 1).
7. WHEN a round ends, THE Scoring_System SHALL compute each Fighter's performance value as punches landed × landed weight + damage dealt × damage weight + Counterpunches landed × counter weight, with integer weights ≥ 0 (D23).
8. WHEN a round ends with one performance value strictly greater, THE Scoring_System SHALL give that Fighter 10 base points and the other 9.
9. WHEN a round ends with equal performance values, THE Scoring_System SHALL give each Fighter 10 base points.
10. WHEN a round ends, THE Scoring_System SHALL set each Fighter's round points to base points minus 1 per Knockdown that Fighter suffered that round, minimum 6.
11. WHEN the Match ends by KO or TKO, THE Scoring_System SHALL record that round's points from the statistics so far, using criteria 7–10.
12. WHEN the Match ends by decision, THE Scoring_System SHALL total each Fighter's round points and declare the higher total the winner, or a draw if equal.
13. THE Scoring_System SHALL keep every completed round's points as an integer from 6 to 10 inclusive (invariant property).

### Requirement 27: Fight HUD

**Phase:** P3

**User Story:** As a player, I want a clear fight HUD, so that I can track the fight at a glance.

#### Acceptance Criteria

1. WHILE a Match is in progress, THE Fight_HUD SHALL show the Player_Fighter's name, health bar (Requirement 11), stamina bar, and guard bar on the left half, and the AI_Fighter's on the right half.
2. WHILE a Match is in progress, THE Fight_HUD SHALL fill stamina and guard bars to Stamina ÷ maximum Stamina and Guard ÷ maximum Guard within 1% of bar width, updated by the next displayed frame after a change.
3. WHILE a Match is in progress, THE Fight_HUD SHALL show the round number (1–3) and remaining time as ceil(remaining Ticks ÷ 60) seconds, so a default round starts at 90 and shows 0 only at timer 0.
4. WHILE the round timer is paused, THE Fight_HUD SHALL keep showing the paused time.
5. WHILE the round-start announcement runs, THE Fight_HUD SHALL show the round number announcement.
6. WHEN a combo Game_Event with count 2 or more occurs, THE Fight_HUD SHALL show the count on the attacker's side for 60 Ticks; a newer combo event for that Fighter replaces it and restarts the 60 Ticks.
7. WHEN a counterpunch Game_Event occurs, THE Fight_HUD SHALL show "COUNTER" on the attacker's side for 60 Ticks.
8. WHEN a guard-break Game_Event occurs, THE Fight_HUD SHALL show "GUARD BREAK" on the broken Fighter's side for 60 Ticks.
9. IF "COUNTER" and "GUARD BREAK" appear on the same Tick, THEN THE Fight_HUD SHALL show both without overlap.
10. THE Fight_HUD SHALL render as an HTML overlay styled with Tailwind CSS above the 3D canvas.

### Requirement 28: Main Menu

**Phase:** P3

**User Story:** As a player, I want a main menu, so that I can start a fight and pick a difficulty.

#### Acceptance Criteria

1. WHEN the Game loads, THE Game SHALL show the Main_Menu with no Match in progress and no Ticks advancing (D26).
2. THE Main_Menu SHALL show exactly three items: Start Fight, a Difficulty_Level selector (Easy, Normal, Hard), and Controls.
3. WHILE the Main_Menu is shown, THE Main_Menu SHALL indicate exactly one selected Difficulty_Level.
4. WHEN the Game loads, THE Main_Menu SHALL preselect Normal.
5. WHEN the Main_Menu is shown again in the same page session, THE Main_Menu SHALL preselect the Difficulty_Level of the most recent Match (D25).
6. WHEN the player selects Start Fight, THE Game SHALL hide the Main_Menu and start a new Match at round 1 with the selected Difficulty_Level and the seed from D24.
7. WHEN the player selects Controls, THE Main_Menu SHALL list every Input_System binding (move left, move right, jab, cross, hook, uppercut, block, slip) and the pause keys (Escape, P) with action name and key.
8. WHEN the player presses Escape or selects Back in the Controls list, THE Main_Menu SHALL return to the menu items without changing the Difficulty_Level.
9. WHILE the Main_Menu is shown, THE Main_Menu SHALL support Up/Down arrows and Tab to move focus, Left/Right arrows to change Difficulty_Level when the selector has focus, and Enter or Space to activate.
10. WHILE the Main_Menu is shown, THE Main_Menu SHALL let a single left click activate any item or choose any Difficulty_Level.
11. WHILE the Main_Menu is shown, THE Main_Menu SHALL show a visible focus indicator on exactly one item, moved by mouse hover or keyboard navigation.

### Requirement 29: Pause Menu

**Phase:** P3

**User Story:** As a player, I want to pause a fight, so that I can step away or quit.

#### Acceptance Criteria

1. WHEN the player presses Escape or P during an unpaused Match (from round 1 start until Match end, including between-round intervals and Knockdown_Counts), THE Game SHALL stop advancing Ticks and show the Pause_Menu within 100 ms.
2. WHEN the tab becomes hidden or the window loses focus during an unpaused Match, THE Game SHALL pause and show the Pause_Menu, staying paused when focus returns.
3. THE Pause_Menu SHALL show exactly Resume, Restart Match, and Quit to Main Menu, in that order, with Resume highlighted on open, selectable by mouse click or Up/Down arrows plus Enter.
4. WHEN the player selects Resume or presses Escape or P while paused, THE Game SHALL hide the Pause_Menu and continue from the paused Simulation_State, counting no paused time (Requirement 1 criteria 4 and 6).
5. WHEN the player selects Restart Match, THE Game SHALL start a new Match at the same Difficulty_Level (round 1, full timer, maximum Health, Stamina, and Guard, starting positions, all scores and statistics 0, seed per D24) without showing a Results_Screen.
6. WHEN the player selects Quit to Main Menu, THE Game SHALL discard the Match without a Results_Screen and show the Main_Menu with the same Difficulty_Level selected.
7. WHILE paused, THE Input_System SHALL issue no Fighter_Commands, and keys held at resume SHALL be pressed again before producing commands (Requirement 8 criterion 7).
8. IF Escape or P is pressed while no Match is in progress, THEN THE Game SHALL not show the Pause_Menu.
9. WHILE paused, THE Audio_System SHALL behave as defined in Requirement 33. [P4]

### Requirement 30: Results Screen

**Phase:** P3

**User Story:** As a player, I want to see the fight result and statistics, so that I understand how the fight was won.

#### Acceptance Criteria

1. WHEN the match-end Game_Event is emitted, THE Game SHALL stop advancing Ticks and show the Results_Screen within 3 seconds.
2. WHEN the Results_Screen is shown, THE Results_Screen SHALL show the winner (Player_Fighter or AI_Fighter) or "Draw", the method (KO, TKO, or Decision; a draw may have any of these per D19), and the round the Match ended in.
3. WHEN the Match ended by decision, THE Results_Screen SHALL show each Fighter's round points for rounds 1–3 and the totals, equal to the Scoring_System's values.
4. WHEN the Results_Screen is shown, THE Results_Screen SHALL show per Fighter the Match totals of punches thrown, punches landed, Counterpunches landed, and Knockdowns scored.
5. WHEN the Results_Screen is shown, THE Results_Screen SHALL show per Fighter a landing percentage = round-half-up(punches landed ÷ punches thrown × 100), or 0% if none were thrown.
6. THE Results_Screen SHALL offer Rematch and Main Menu, selectable by keyboard and mouse.
7. WHEN the player selects Rematch, THE Game SHALL start a new Match at the same Difficulty_Level from round 1 with full resources, zeroed statistics, and the seed per D24.
8. WHEN the player selects Main Menu, THE Game SHALL show the Main_Menu with the ended Match's Difficulty_Level selected.

---

## P4 – Presentation and Polish

### Requirement 31: Punch and Fighter Animations

**Phase:** P4

**User Story:** As a player, I want fluid animations that match the attack timing, so that I can read what each fighter is doing.

#### Acceptance Criteria

1. THE Animation_System SHALL provide, for both Fighters, a distinct animation for each Fighter_FSM state (Idle, Walking, Attacking, Blocking, Slipping, HitStun, GuardBroken, KnockedDown, Defeated) and a distinct punch animation for each of the jab, cross, hook, and uppercut.
2. WHILE a Fighter is Attacking, THE Animation_System SHALL map the punch animation's startup, active, and recovery segments to the Attack_Definition's Startup_Phase, Active_Phase, and Recovery_Phase Ticks, with each segment boundary displayed within 1 Tick of the phase boundary.
3. WHEN a Fighter_FSM state changes, THE Animation_System SHALL blend from the displayed pose to the new animation over the configured blend duration (integer 0–6 Ticks; 0 switches immediately).
4. WHEN a Fighter enters Attacking, THE Animation_System SHALL use a blend of 0 Ticks so the startup pose shows on the first frame (D28).
5. IF a Fighter leaves Attacking before the Recovery_Phase ends, THEN THE Animation_System SHALL stop the punch animation and blend to the new state's animation.
6. IF a state change occurs during a blend, THEN THE Animation_System SHALL start a new blend from the displayed pose, completing within the blend duration from the newest change.
7. THE Animation_System SHALL choose poses from the Simulation_State Tick and phase progress, so that at 30–144 fps the same Simulation_State gives the same animation segment, within 1 Tick of the attack phase.
8. WHILE Hit_Stop is active, THE Animation_System SHALL hold both Fighters' poses.
9. THE Animation_System SHALL never write to the Simulation_State, so the Simulation_State is identical with animation enabled or disabled.

### Requirement 32: Impact Effects

**Phase:** P4

**User Story:** As a player, I want visible impact feedback, so that hits feel powerful.

#### Acceptance Criteria

1. WHEN a hit-landed Game_Event occurs, THE Effects_System SHALL spawn an impact effect at the hit position in the next displayed frame and remove it after the configured lifetime (100–1,000 ms).
2. WHEN a hit lands on Tick T with Hit_Stop value H greater than 0, THE Game_Simulation SHALL fully resolve that hit on Tick T (damage, state changes, and Game_Events) and treat Ticks T+1 through T+H as frozen Ticks; in a Trade, H is the larger value (D29).
3. WHILE a Tick is frozen, THE Game_Simulation SHALL execute only the Hit_Stop counter decrement and command intake per Requirement 20: no movement, hit detection, timer advancement (round timer, Knockdown_Count, stun, phase, Input_Buffer age), AI_Controller decisions, Player_Observation_History updates, or Gameplay_Tick increment (D36).
4. THE Game_Simulation SHALL measure every gameplay duration, Fighter_FSM entry Tick (Requirement 4 criterion 7), and attack phase boundary (Requirement 9 criterion 3) in Gameplay_Ticks (D36).
5. IF a Fighter_Command arrives during Hit_Stop, THEN THE Game_Simulation SHALL buffer or discard it per Requirement 20, with buffer age frozen during Hit_Stop.
6. WHEN a blocked hit occurs, THE Game_Simulation SHALL apply no Hit_Stop (D29).
7. WHEN a counterpunch or Knockdown Game_Event occurs, THE Effects_System SHALL shake the camera with the configured intensity (0–0.5 world units) and duration (0–1,000 ms), then return the camera to its pre-shake pose.
8. IF a shake is triggered while one is active, THEN THE Effects_System SHALL restart it with the greater intensity and the new duration.
9. WHEN an attack-blocked Game_Event occurs, THE Effects_System SHALL spawn a block spark at the contact position using an effect type separate from the hit impact.
10. THE Effects_System SHALL draw effects from a pool allocated at Match load, with at most the configured maximum (1–64) active.
11. IF an effect is requested while the pool is at its maximum, THEN THE Effects_System SHALL recycle the oldest active effect.
12. THE Effects_System SHALL never modify the Simulation_State or Game_Events, so the Simulation_State is identical with effects enabled or disabled.

### Requirement 33: Audio

**Phase:** P4

**User Story:** As a player, I want sound effects and music, so that the fight feels alive.

#### Acceptance Criteria

1. WHEN an attack-blocked, slip-evaded, counterpunch, Knockdown, round-start, or round-end Game_Event occurs, THE Audio_System SHALL start that event's sound within 50 ms of the emitting Tick, playing one sound per event when several occur on one Tick.
2. WHEN a hit-landed Game_Event occurs, THE Audio_System SHALL play the hit sound for that attack identifier, with a distinct sound for each of the jab, cross, hook, and uppercut, and no additional generic hit sound.
3. WHEN a knockdown-count Game_Event occurs, THE Audio_System SHALL play one count sound within 50 ms.
4. THE Audio_System SHALL hold master, music, and sound-effect volumes as integers 0–100 (defaults 80, 60, 80) with effective volume = master ÷ 100 × channel ÷ 100; 0 is silent.
5. WHEN the player first presses a key or clicks on the page, THE Audio_System SHALL start audio within 100 ms; before that it SHALL play nothing, discard Game_Events without queueing, and show no error.
6. WHILE a Match is in progress and not paused, THE Audio_System SHALL loop the match music at the effective music volume.
7. WHILE the Match is paused, THE Audio_System SHALL pause playing sound effects at their position, start no new ones, and lower music by the pause attenuation (integer 0–100%, default 50).
8. WHEN the Match resumes, THE Audio_System SHALL resume paused sound effects from their position and restore music volume within 100 ms.
9. IF an audio asset fails to load, THEN THE Audio_System SHALL log one warning naming the asset, skip that sound, and continue gameplay with no player-facing error.

### Requirement 34: Performance

**Phase:** P4 (M1 baseline applies to criterion 1)

**User Story:** As a player, I want smooth frame rates on a typical desktop, so that the game feels responsive.

#### Acceptance Criteria

1. WHILE a Match is in progress on the Reference_Desktop, maximized on a 60 Hz display, THE Renderer SHALL average at least 59 fps over a continuous 60-second window (D11). [M1 baseline with placeholder models; P4 with full assets]
2. WHILE a Match is in progress on the Reference_Desktop, maximized on a 60 Hz display, THE Renderer SHALL keep 99% of frame times at or below 20 ms and none above 50 ms over a continuous 60-second window. [M1 baseline; P4 with full assets]
3. THE Game_Simulation SHALL complete each Tick, including AI_Controller decisions, with a mean under 1 ms and a maximum under 4 ms over 3,600 consecutive Ticks on the Reference_Desktop.
4. WHEN the player presses an attack key while the Player_Fighter is Able_To_Act, THE Game SHALL present the first frame showing the attack's startup pose within 50 ms for at least 95 of 100 consecutive presses and within 100 ms for all of them, on the Reference_Desktop.
5. WHILE a Match is in progress, THE Renderer SHALL issue at most 100 draw calls per frame, counting the Ring, both Fighters, and all active effects.
6. WHEN the Game is opened with an empty cache on a 50 Mbit/s connection on the Reference_Desktop, THE Game SHALL be ready for input within 5 seconds of navigation start, showing the fight in M1 and the Main_Menu from P3.
7. WHILE a Match is in progress, THE Game SHALL update React state for the Fight_HUD at most once per displayed frame, using the latest Simulation_State.
