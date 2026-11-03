(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const localId = GameContext.localPlayerID;
  if (!Number.isInteger(localId) || localId < 0) throw Error("No local player");
  const localPlayer = Players.get(localId);
  if (!localPlayer) throw Error("No local player");
  const diplomacy = localPlayer.Diplomacy;
  const name = key => key ? Locale.compose(key) : null;

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
    victoryConditions
  };
})()
