(() => {
  const {query, section_id: sectionId, page_id: pageId, limit, offset} = queryArguments;
  const validText = (value, maximum) => value === null || typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
  if (!validText(query, 200) || !validText(sectionId, 200) || !validText(pageId, 200) ||
      pageId !== null && (sectionId === null || query !== null) ||
      !Number.isInteger(limit) || limit < 1 || limit > 20 || !Number.isInteger(offset) || offset < 0 || offset > 10000)
    throw Error("Use bounded search text, a section, or exact section/page IDs; never SQL");
  if (!UI.isInGame()) throw Error("Load a save first");
  const warnings = [];
  const warn = message => { if (!warnings.includes(message) && warnings.length < 20) warnings.push(message); };
  const rows = table => { const values = []; GameInfo[table]?.forEach(row => values.push(row)); return values; };
  const exists = key => typeof key === "string" && Locale.keyExists(key);
  const localize = key => {
    if (typeof key !== "string" || !key) return null;
    if (key.startsWith("LOC_") && !exists(key)) { warn(`Missing localization: ${key}`); return null; }
    return Locale.compose(key);
  };
  const firstKey = keys => keys.find(exists) ?? null;
  const currentAge = GameInfo.Ages.lookup(Game.age)?.AgeType ?? null;
  // Only installed Civilopedia SELECT definitions, never caller-supplied SQL.
  // Reject multi-statements/comments/file functions and bound each result in SQL.
  function select(database, sql, parameters, source) {
    const statement = typeof sql === "string" ? sql.trim().replace(/;\s*$/, "") : "";
    if (!/^SELECT\b/i.test(statement) || statement.length > 30000 || /;|--|\/\*|\*\//.test(statement) ||
        /\b(ATTACH|DETACH|PRAGMA|INSERT|UPDATE|DELETE|REPLACE|DROP|CREATE|ALTER|VACUUM|load_extension|readfile|writefile)\b/i.test(statement)) {
      warn(`Unsupported non-read-only Civilopedia query: ${source}`); return [];
    }
    try {
      const result = Database.query(database, `SELECT * FROM (${statement}) AS sidkick_pedia LIMIT 5001`, ...parameters);
      if (!Array.isArray(result)) { warn(`Unavailable query result: ${source}`); return []; }
      if (result.length > 5000) warn(`Query rows truncated: ${source}`);
      return result.slice(0, 5000);
    } catch (_) { warn(`Civilopedia query failed: ${source}`); return []; }
  }
  const excludedSections = new Set(rows("CivilopediaSectionExcludes").map(row => row.SectionID));
  const excludedPages = new Set(rows("CivilopediaPageExcludes").map(row => `${row.SectionID}|${row.PageID}`));
  const excludedGroups = new Set(rows("CivilopediaPageGroupExcludes").map(row => `${row.SectionID}|${row.PageGroupID}`));
  const supportsSSO = typeof Network !== "undefined" && typeof Network.supportsSSO === "function" ? Network.supportsSSO() : null;
  if (supportsSSO !== true && supportsSSO !== false) warn("SSO visibility capability unknown; related Civilopedia pages conservatively omitted");
  if (supportsSSO !== true) for (let i = 1; i <= 5; i++) excludedPages.add(`CONCEPTS|LEGENDS_${i}`);
  if (supportsSSO !== false) excludedPages.add("CONCEPTS|MEMENTOS");
  const sections = rows("CivilopediaSections").filter(row => !excludedSections.has(row.SectionID))
    .map(row => ({id: row.SectionID, name: localize(firstKey([`LOC_PEDIA_${row.SectionID}_TAB_NAME`]) ?? row.Name)}))
    .sort((a, b) => a.id.localeCompare(b.id));
  const sectionIds = new Set(sections.map(section => section.id));
  if (!sections.length) warn("Loaded Civilopedia section data is unavailable");
  const mode = pageId !== null ? "article" : query !== null ? "search" : sectionId !== null ? "browse" : "sections";
  const result = {turn: Game.turn, age: currentAge, mode, available: sections.length > 0,
    source: "Loaded gameplay Civilopedia definitions and localization; native model-civilopedia.js chapter rules",
    sections, results: [], article: null, hasMore: false, warnings,
    note: "Public reference text, not hidden empire data or live eligibility. Missing/partial content is not proof that a requirement does not exist. Native markup is retained; no UI navigation, search-index changes, profile calls or game actions"};
  const finish = () => ({...result, complete: warnings.length === 0});
  if (mode === "sections" || !sectionIds.has(sectionId) && sectionId !== null) return finish();
  const pages = new Map();
  function add(section, row) {
    if (!sectionIds.has(section) || typeof row.PageID !== "string" || typeof row.PageLayoutID !== "string" ||
        typeof row.Name !== "string" || excludedPages.has(`${section}|${row.PageID}`) ||
        excludedGroups.has(`${section}|${row.PageGroupID}`)) return;
    if (pages.size >= 10000) { warn("Civilopedia catalog truncated at 10000 pages"); return; }
    pages.set(`${section}|${row.PageID}`, {sectionId: section, pageId: row.PageID, layoutId: row.PageLayoutID,
      nameKey: row.Name, prefix: row.TextKeyPrefix ?? null});
  }
  for (const row of rows("CivilopediaPages")) add(row.SectionID, row);
  const pageQueries = rows("CivilopediaPageQueries");
  if (pageQueries.length > 100) warn("Civilopedia page queries truncated at 100");
  for (const row of pageQueries.slice(0, 100)) {
    if (!sectionIds.has(row.SectionID) || sectionId !== null && sectionId !== row.SectionID) continue;
    for (const page of select("gameplay", row.SQL, [currentAge ?? "NO_AGE"], `pages:${row.SectionID}`)) add(row.SectionID, page);
  }
  function pageKey(page, tag) {
    return firstKey([...(page.prefix ? [`${page.prefix}_${page.pageId}_${tag}`, `${page.prefix}_${tag}`] : []),
      `LOC_PEDIA_${page.sectionId}_PAGE_${page.pageId}_${tag}`, `LOC_PEDIA_PAGE_${page.pageId}_${tag}`, `LOC_PEDIA_PAGE_${tag}`]);
  }
  const summary = page => ({sectionId: page.sectionId, pageId: page.pageId,
    title: localize(pageKey(page, "TITLE") ?? page.nameKey) ?? page.pageId, layoutId: page.layoutId});
  if (mode !== "article") {
    let candidates = [...pages.values()].filter(page => sectionId === null || page.sectionId === sectionId);
    if (mode === "search") {
      const terms = query.toLocaleLowerCase().split(/\s+/);
      let native = null;
      if (typeof Search !== "undefined" && typeof Search.hasContext === "function" && Search.hasContext("Civilopedia")) {
        try {
          native = Search.search("Civilopedia", query, 100);
          if (!Array.isArray(native)) native = null;
          else if (native.length >= 100) warn("Native search candidates capped at 100; later matches may be omitted");
        } catch (_) { warn("Native Civilopedia search unavailable; using title/ID fallback"); }
      }
      result.searchMethod = native === null ? "localized-title-and-id-fallback" : "native-existing-index";
      const nativeKeys = new Set((native ?? []).map(hit => hit.type));
      candidates = candidates.filter(page => nativeKeys.has(`${page.sectionId}|${page.pageId}`) ||
        terms.every(term => `${summary(page).title} ${page.pageId}`.toLocaleLowerCase().includes(term)));
    }
    const matches = candidates.map(summary).sort((a, b) => a.title.localeCompare(b.title) ||
      a.sectionId.localeCompare(b.sectionId) || a.pageId.localeCompare(b.pageId));
    result.results = matches.slice(offset, offset + limit);
    result.totalMatches = matches.length;
    result.hasMore = offset + limit < matches.length;
    return finish();
  }
  const page = pages.get(`${sectionId}|${pageId}`);
  if (!page) return finish();
  let charactersLeft = 24000;
  const boundedText = text => {
    if (text === null) return null;
    const length = Math.min(4000, charactersLeft), value = text.slice(0, length);
    if (value.length < text.length) warn("Article text truncated at paragraph/article character limits");
    charactersLeft -= value.length;
    return value;
  };
  const chapterKey = (chapter, tag) => firstKey([
    ...(page.prefix ? [`${page.prefix}_${pageId}_CHAPTER_${chapter}_${tag}`, `${page.prefix}_CHAPTER_${chapter}_${tag}`] : []),
    `LOC_PEDIA_${sectionId}_PAGE_${pageId}_CHAPTER_${chapter}_${tag}`, `LOC_PEDIA_${sectionId}_PAGE_CHAPTER_${chapter}_${tag}`,
    `LOC_PEDIA_PAGE_${pageId}_CHAPTER_${chapter}_${tag}`, `LOC_PEDIA_PAGE_CHAPTER_${chapter}_${tag}`]);
  const layouts = rows("CivilopediaPageLayoutChapters").filter(row => row.PageLayoutID === page.layoutId)
    .sort((a, b) => (a.SortIndex ?? 0) - (b.SortIndex ?? 0));
  if (!layouts.length) warn(`No chapter layout data for ${page.layoutId}`);
  if (layouts.length > 20) warn("Article chapters truncated at 20");
  let paragraphCount = 0;
  const chapters = layouts.slice(0, 20).map(chapter => {
    const exact = row => row.SectionID === sectionId && row.PageID === pageId && row.ChapterID === chapter.ChapterID;
    const header = rows("CivilopediaPageChapterHeaders").filter(exact).at(-1)?.Header ?? chapter.Header ?? chapterKey(chapter.ChapterID, "TITLE");
    let keys = rows("CivilopediaPageChapterParagraphs").filter(exact).sort((a, b) => (a.SortIndex ?? 0) - (b.SortIndex ?? 0)).map(row => row.Paragraph);
    let source = "CivilopediaPageChapterParagraphs";
    if (!keys.length) {
      const sql = rows("CivilopediaPageLayoutChapterContentQueries").filter(row => row.PageLayoutID === page.layoutId && row.ChapterID === chapter.ChapterID).at(-1);
      if (sql) {
        const content = select("gameplay", sql.SQL, [pageId, sectionId], `chapter:${page.layoutId}:${chapter.ChapterID}`)
          .map(row => row.Text);
        for (const key of content) if (typeof key === "string" && key.startsWith("LOC_") && !exists(key)) warn(`Missing localization: ${key}`);
        keys = content.filter(exists);
        source = "CivilopediaPageLayoutChapterContentQueries";
      } else {
        source = "Civilopedia localization fallback";
        const body = chapterKey(chapter.ChapterID, "BODY");
        if (body) keys = [body];
        else for (let i = 1; i <= 64; i++) {
          const key = chapterKey(chapter.ChapterID, `PARA_${i}`);
          if (!key) break;
          keys.push(key);
          if (i === 64) warn("Localization paragraph scan capped at 64");
        }
      }
    }
    const paragraphs = [];
    for (const key of keys) {
      if (paragraphCount >= 64) { warn("Article paragraphs truncated at 64"); break; }
      paragraphCount++;
      paragraphs.push({key, text: boundedText(localize(key))});
    }
    return {id: chapter.ChapterID, heading: boundedText(localize(header)), source, paragraphs,
      contentAvailable: paragraphs.some(paragraph => paragraph.text !== null && paragraph.text.length > 0)};
  });
  const lookup = (table, id) => typeof GameInfo[table]?.lookup === "function" ? GameInfo[table].lookup(id) : null;
  let definition = null;
  for (const [table, field] of [["Units", "UnitType"], ["Constructibles", "ConstructibleType"], ["ProgressionTreeNodes", "ProgressionTreeNodeType"],
    ["Resources", "ResourceType"], ["Routes", "RouteType"], ["Beliefs", "BeliefType"], ["UniqueQuarters", "UniqueQuarterType"],
    ["Governments", "GovernmentType"], ["Civilizations", "CivilizationType"], ["Leaders", "LeaderType"], ["Projects", "ProjectType"]]) {
    const row = lookup(table, pageId);
    if (row?.[field] !== pageId) continue;
    definition = {table, fields: Object.fromEntries(Object.entries(row).filter(([key, value]) => !key.startsWith("$") &&
      ["string", "number", "boolean"].includes(typeof value)).map(([key, value]) => [key, typeof value === "string" ? boundedText(value) : value]))};
    break;
  }
  const unlocks = rows("ProgressionTreeNodeUnlocks").filter(row => row.TargetType === pageId && !row.Hidden);
  if (unlocks.length > 100) warn("Unlock references truncated at 100");
  const unlockNodes = unlocks.slice(0, 100).map(row => ({
    id: row.ProgressionTreeNodeType, name: localize(lookup("ProgressionTreeNodes", row.ProgressionTreeNodeType)?.Name),
    requiredDepth: row.UnlockDepth ?? null, requiredGovernment: row.RequiredGovernmentType ?? null,
    source: "ProgressionTreeNodeUnlocks", logicalRelationship: "not evaluated",
  }));
  const constructibleIds = rows("Unit_RequiredConstructibles").filter(row => row.UnitType === pageId).map(row => row.ConstructibleType);
  const route = lookup("Routes", pageId);
  if (route?.RequiredConstructible) constructibleIds.push(route.RequiredConstructible);
  if (constructibleIds.length > 100) warn("Constructible requirements truncated at 100");
  const requiredConstructibles = [...new Set(constructibleIds)].slice(0, 100).map(id => ({id, name: localize(lookup("Constructibles", id)?.Name)}));
  const associations = definition ? select("config", "SELECT Type, CivilizationType, AgeType FROM CivilizationItems WHERE Type=?1 ORDER BY SortIndex", [pageId], "civilization associations") : [];
  if (associations.length > 100) warn("Civilization associations truncated at 100");
  result.article = {...summary(page), chapters, definition,
    requirements: {unlockNodes, requiredConstructibles, civilizationAssociations: associations.slice(0, 100).map(row => ({
      id: row.CivilizationType, name: localize(lookup("Civilizations", row.CivilizationType)?.FullName),
      age: row.AgeType ?? null, source: "config.CivilizationItems",
    })), evaluatedEligibility: null, complete: false,
      note: "Bounded public definition links used by Civilopedia sidebars, not a full dependency/placement evaluator or proof of local unlock, mastery, ownership, affordability or eligibility. Empty links do not establish no requirements"}};
  return finish();
})()
