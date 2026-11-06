(() => {
  const key=id=>`${id.owner}:${id.id}:${id.type}`,same=(a,b)=>a&&b&&key(a)===key(b),identity=id=>({owner:id.owner,id:id.id,type:id.type});
  const describe=u=>u&&Number.isInteger(u.type)&&Number.isFinite(u.Health?.damage)&&Number.isFinite(u.Health.maxDamage)&&u.Health.damage>=0&&u.Health.damage<u.Health.maxDamage?
    {owner:u.id.owner,instanceId:u.id.id,componentType:u.id.type,unitType:u.type,location:{x:u.location.x,y:u.location.y},damage:u.Health.damage,maxDamage:u.Health.maxDamage}:null;
  function capture(playerId,x,y,radius,attackerId){
    if(!Number.isInteger(radius)||radius<1||radius>3)return null;
    const player=Players.get(playerId),owned=player.Units.getUnits(),records=[],seen=new Set(),width=GameplayMap.getGridWidth(),height=GameplayMap.getGridHeight();
    for(let yy=Math.max(0,y-radius);yy<=Math.min(height-1,y+radius);yy++)for(let xx=Math.max(0,x-radius);xx<=Math.min(width-1,x+radius);xx++){
      if(GameplayMap.getPlotDistance(x,y,xx,yy)>radius||GameplayMap.getRevealedState(playerId,xx,yy)!==RevealedStates.VISIBLE)continue;
      const ids=MapUnits.getUnits(xx,yy);if(!Array.isArray(ids))return null;
      for(const id of ids){
        if(![id.owner,id.id,id.type].every(v=>Number.isInteger(v)&&v>=0)||id.owner!==playerId&&(player.Diplomacy.hasMet(id.owner)!==true||Visibility.isVisible(playerId,id)!==true))continue;
        const u=id.owner===playerId?owned.find(u=>same(u.id,id)):Units.get(id);
        if(!u||!same(u.id,id)||u.location?.x!==xx||u.location?.y!==yy)continue;
        const record=describe(u);if(!record)continue;if(seen.has(key(id)))return null;seen.add(key(id));records.push(record);
      }
    }
    if(!seen.has(key(attackerId))){const u=owned.find(u=>same(u.id,attackerId)),record=describe(u);if(!record)return null;records.push(record);}
    return records.length<=128?records.sort((a,b)=>a.owner-b.owner||a.instanceId-b.instanceId):null;
  }
  function start(playerId,attackerId,units,timeout){
    if(typeof engine?.on!=="function"||!Array.isArray(units)||!units.length||units.length>128||!Number.isInteger(timeout)||timeout<1||timeout>15000)throw Error("Bounded native combat observation unavailable");
    const previous=globalThis.__sidkickCombatObservation;previous?.stop?.();
    const sequence=(previous?.sequence??0)+1,token=`${Game.turn}:${Game.age}:${playerId}:${sequence}:${Date.now()}`,handles=[],known=new Set(units.map(u=>key({owner:u.owner,id:u.instanceId,type:u.componentType})));
    const state={token,sequence,turn:Game.turn,age:Game.age,playerId,attacker:identity(attackerId),units,combats:[],kills:[],expires:Date.now()+timeout,closed:false,overflow:false};
    state.stop=()=>{for(const h of handles)h.clear();handles.length=0;state.closed=true;};
    const current=()=>{if(Game.turn!==state.turn||Game.age!==state.age||GameContext.localPlayerID!==playerId||Date.now()>state.expires){state.stop();return false;}return true;};
    try{
      handles.push(engine.on('Combat',data=>{if(!current()||!same(data?.attacker,attackerId)||!known.has(key(data.defender??{})))return;
        if(state.combats.length>=64){state.overflow=true;state.stop();return;}state.combats.push({attacker:identity(data.attacker),defender:identity(data.defender)});
      }));
      handles.push(engine.on('UnitKilledInCombat',data=>{if(!current())return;
        const killed=data?.unitKilled,killer=data?.unitKiller;
        if(!(same(killer,attackerId)&&known.has(key(killed??{}))||same(killed,attackerId)&&known.has(key(killer??{}))))return;
        if(state.kills.length>=64){state.overflow=true;state.stop();return;}state.kills.push({unitKilled:identity(killed),unitKiller:identity(killer)});
      }));
    }catch(error){state.stop();throw error;}
    globalThis.__sidkickCombatObservation=state;return token;
  }
  function read(token,finish=false){
    const s=globalThis.__sidkickCombatObservation;
    if(!s||s.token!==token)return{available:false,reason:"Observation replaced or missing"};
    if(Game.turn!==s.turn||Game.age!==s.age||GameContext.localPlayerID!==s.playerId){s.stop();return{available:false,reason:"Observation context changed"};}
    const player=Players.get(s.playerId),owned=player.Units.getUnits(),result=[];
    for(const b of s.units){
      const id={owner:b.owner,id:b.instanceId,type:b.componentType},killed=s.kills.some(e=>same(e.unitKilled,id)),out={owner:b.owner,instanceId:b.instanceId,componentType:b.componentType,unitType:b.unitType,beforeDamage:b.damage,killConfirmed:killed?true:null,damageDelta:null};
      if(killed){result.push({...out,status:'native_kill_confirmed'});continue;}
      let u;
      if(b.owner===s.playerId)u=owned.find(u=>same(u.id,id));
      else{
        const l=b.location;if(GameplayMap.getRevealedState(s.playerId,l.x,l.y)!==RevealedStates.VISIBLE){result.push({...out,status:'visibility_lost'});continue;}
        const ids=MapUnits.getUnits(l.x,l.y);if(!Array.isArray(ids)||!ids.some(next=>same(next,id))||Visibility.isVisible(s.playerId,id)!==true){result.push({...out,status:'left_visible_tile_or_hidden'});continue;}
        u=Units.get(id);
      }
      if(!u){result.push({...out,status:'not_present'});continue;}
      if(u.type!==b.unitType||!Number.isFinite(u.Health?.damage)||u.Health.maxDamage!==b.maxDamage){result.push({...out,status:'identity_or_health_changed'});continue;}
      result.push({...out,status:'observed',damageDelta:u.Health.damage-b.damage});
    }
    if(finish||Date.now()>s.expires)s.stop();
    return{available:true,units:result,nativeCombats:s.combats,nativeKills:s.kills,overflow:s.overflow,closed:s.closed,
      capturedSetFullyObserved:!s.overflow&&result.every(u=>['observed','native_kill_confirmed'].includes(u.status)),
      completeEffectAccounting:false,note:'Only captured previously visible units and native local-attack kill attributions. Departures are not kills; hidden/out-of-radius/interception/district/global effects are not fully accounted for'};
  }
  return{capture,start,read};
})()
