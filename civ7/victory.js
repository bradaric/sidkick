(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const localId = GameContext.localPlayerID;
  if (!Number.isInteger(localId) || localId < 0) throw Error("No local player");
  const localPlayer = Players.get(localId);
  if (!localPlayer) throw Error("No local player");
  const diplomacy = localPlayer.Diplomacy;
  const name = key => key ? Locale.compose(key) : null;
  const age = GameInfo.Ages.lookup(Game.age);

  function modernProjectRequirements() {
    if (age?.AgeType !== "AGE_MODERN") return null;
    const cities = localPlayer.Cities.getCities();
    const completed = localPlayer.LegacyPaths?.getCompletedLegacyPaths();
    const completedPaths = completed == null ? null : new Set(completed
      .map(type => GameInfo.LegacyPaths.lookup(type)?.LegacyPathType).filter(Boolean));
    // Include loaded production projects, not a hardcoded victory chain that may be obsolete.
    const projects = [...GameInfo.Projects].filter(def => !def.TownOnly && !def.UpgradeToCity && def.Cost > 0).map(def => {
      const constructible = def.PrereqConstructible ? GameInfo.Constructibles.lookup(def.PrereqConstructible) : null;
      const legacyPath = def.RequireCompletedLegacyPathType ? GameInfo.LegacyPaths.lookup(def.RequireCompletedLegacyPathType) : null;
      const unlocks = GameInfo.ProgressionTreeNodeUnlocks.filter(unlock => !unlock.Hidden &&
        unlock.TargetKind === "KIND_PROJECT" && unlock.TargetType === def.ProjectType).map(unlock => {
        const node = GameInfo.ProgressionTreeNodes.lookup(unlock.ProgressionTreeNodeType);
        const state = node ? Game.ProgressionTrees.getNode(localId, node.$hash) : null;
        return {id: unlock.ProgressionTreeNodeType, name: name(node?.Name), requiredDepth: unlock.UnlockDepth ?? null,
          depthUnlocked: state?.depthUnlocked ?? null,
          met: state?.depthUnlocked == null || unlock.UnlockDepth == null ? null : state.depthUnlocked >= unlock.UnlockDepth};
      });
      const hasPrerequisite = city => city.Constructibles?.hasConstructible(def.PrereqConstructible, false) ?? null;
      const anyCityPrerequisite = def.PrereqConstructible && def.PrereqAnyCity ? cities.map(hasPrerequisite) : null;
      const empirePrerequisite = anyCityPrerequisite?.some(value => value === true) ? true
        : anyCityPrerequisite?.every(value => value === false) ? false : null;
      return {
        id: def.ProjectType, name: name(def.Name), description: name(def.Description),
        baseProductionCost: def.Cost, maxPlayerInstances: def.MaxPlayerInstances ?? null,
        completedCopies: null, completionForecast: null,
        requirements: {
          cityOnly: Boolean(def.CityOnly), requiresUnlock: def.RequiresUnlock ?? null,
          constructible: def.PrereqConstructible ? {id: def.PrereqConstructible, name: name(constructible?.Name), anyOwnedSettlement: Boolean(def.PrereqAnyCity)} : null,
          legacyPath: def.RequireCompletedLegacyPathType ? {id: def.RequireCompletedLegacyPathType, name: name(legacyPath?.Name),
            complete: completedPaths == null ? null : completedPaths.has(def.RequireCompletedLegacyPathType)} : null,
          unlocks
        },
        settlements: cities.map(city => {
          const result = Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, {ProjectType: def.$index}, false);
          return {
            name: name(city.name), availableNow: result ? Boolean(result.Success) : null,
            failureReasons: (result?.FailureReasons ?? []).map(name).filter(Boolean),
            meetsNativeRequirements: result?.Requirements?.MeetsRequirements ?? null,
            fullFailure: result?.Requirements?.FullFailure ?? null,
            prerequisiteConstructiblePresent: !def.PrereqConstructible ? null : def.PrereqAnyCity ? empirePrerequisite : hasPrerequisite(city),
            inQueue: result?.InQueue ?? null,
            productionCost: city.Production.getProjectProductionCost(def.ProjectType) ?? null,
            turnsAtCurrentProduction: result?.Success ? city.BuildQueue.getTurnsLeft(def.ProjectType) ?? null : null
          };
        })
      };
    });
    return {projects,
      scope: "Loaded Modern non-town, non-upgrade projects with positive definition costs; includes conversion projects, not an assertion that every project wins a victory",
      note: "Owned settlements only. Visible unlock links and definition prerequisites are evidence, not an exhaustive requirement evaluator or an AND dependency chain. Native BUILD checks decide availability; current-production turn quotes are not victory forecasts"
    };
  }

  const players = [];
  for (const playerId of Players.getAliveIds()) {
    const player = Players.get(playerId);
    if (!player?.isMajor || !player.Victories) continue;
    const isLocal = playerId === localId;
    if (!isLocal && !diplomacy?.hasMet(playerId)) continue;
    const leader = GameInfo.Leaders.lookup(player.leaderType);
    players.push({
      id: playerId,
      isLocal,
      team: player.team,
      civilization: name(player.civilizationFullName),
      leader: name(leader?.Name ?? player.leaderName)
    });
  }

  const completedVictories = Game.VictoryManager.getVictories();
  const victoryConditions = [...GameInfo.VictoryTypes]
    .sort((a, b) => a.VictoryType.localeCompare(b.VictoryType))
    .map(type => {
      const definition = GameInfo.Victories.find(
        value => value.VictoryType === type.VictoryType
      );
      if (!definition) return null;
      const progress = players.map(known => {
        const player = Players.get(known.id);
        const status = player.Victories.getVictoryCountdownStatus(type.$hash);
        const turnsProgress = status?.turns ?? 0;
        const duration = type.CountdownDuration;
        return {
          playerId: known.id,
          points: player.Victories.getPointsForVictoryType(type.$hash),
          won: completedVictories.some(
            victory => victory.victory === type.$hash && victory.team === player.team
          ),
          countdown: status ? {
            isDominant: Boolean(status.isDominant),
            turnsProgress,
            turnsRemaining: duration > 0
              ? Math.max(duration - turnsProgress, 0)
              : null,
            prerequisites: (status.prereqs ?? []).map(prereq => ({
              name: name(prereq.description),
              current: prereq.current,
              total: prereq.total,
              complete: prereq.current >= prereq.total
            }))
          } : null,
          scoring: player.Victories.getScoringForVictoryType(type.$hash).map(score => ({
            name: name(score.name),
            points: score.points,
            turn: score.turn,
            age: name(GameInfo.Ages.lookup(score.age)?.Name),
            trackerType: score.trackerType
          }))
        };
      });
      return {
        id: type.VictoryType,
        class: definition.VictoryClassType,
        name: name(type.Name),
        description: name(type.Description),
        finalAge: name(GameInfo.Ages.lookup(type.FinalAge)?.Name),
        enabled: Boolean(Game.VictoryManager.isCountdownVictoryEnabled(type.VictoryType)),
        scoringType: type.ScoringType,
        minimumPoints: type.MinimumPoints,
        targetPoints: Game.VictoryManager.getCountdownVictoryDominanceScore(type.$hash),
        countdownDuration: type.CountdownDuration,
        progress
      };
    })
    .filter(Boolean);

  const currentAgePoints = Game.AgeProgressManager.getCurrentAgeProgressionPoints();
  const maximumAgePoints = Game.AgeProgressManager.getMaxAgeProgressionPoints();
  return {
    turn: Game.turn,
    age: name(GameInfo.Ages.lookup(Game.age)?.Name),
    ageProgress: {
      current: currentAgePoints,
      total: maximumAgePoints,
      percent: maximumAgePoints > 0
        ? currentAgePoints / maximumAgePoints * 100
        : null,
      extendedGame: Boolean(Game.AgeProgressManager.isExtendedGame)
    },
    scope: "Local player and met major players only",
    players,
    victoryConditions,
    modernProjects: modernProjectRequirements()
  };
})()
