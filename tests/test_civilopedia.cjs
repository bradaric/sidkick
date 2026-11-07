const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(args = {}, options = {}) {
  const calls = [];
  const table = (rows, key) => Object.assign(rows, {lookup: id => rows.find(row => row[key] === id)});
  const text = {
    LOC_UNITS: 'Units', LOC_CONCEPTS: 'Concepts', LOC_UNIT: 'Explorer', LOC_SUMMARY: 'Summary',
    LOC_DESCRIPTION: 'Research artifacts at ruins.', LOC_BODY: 'An Explorer is not a Scout.',
    LOC_FIRST: 'First paragraph.', LOC_SECOND: 'Second paragraph.', LOC_OVERRIDE: 'Override title',
    LOC_TECH: 'Natural History', LOC_BUILDING: 'University',
  };
  if (options.longText) text.LOC_DESCRIPTION = 'X'.repeat(5000);
  if (options.missingText) delete text.LOC_DESCRIPTION;
  const info = {
    Ages: {lookup: () => ({AgeType: 'AGE_EXPLORATION'})},
    CivilopediaSections: [{SectionID: 'UNITS', Name: 'LOC_UNITS'}, {SectionID: 'CONCEPTS', Name: 'LOC_CONCEPTS'}, {SectionID: 'SECRET'}],
    CivilopediaSectionExcludes: [{SectionID: 'SECRET'}],
    CivilopediaPageExcludes: [{SectionID: 'UNITS', PageID: 'UNIT_HIDDEN'}],
    CivilopediaPageGroupExcludes: [{SectionID: 'UNITS', PageGroupID: 'HIDDEN_GROUP'}],
    CivilopediaPages: [
      {SectionID: 'CONCEPTS', PageID: 'EXPLORERS', PageLayoutID: 'Concept', Name: 'LOC_UNIT', TextKeyPrefix: 'LOC_CUSTOM'},
      {SectionID: 'SECRET', PageID: 'LEAK', PageLayoutID: 'Concept', Name: 'LOC_UNIT'},
    ],
    CivilopediaPageQueries: [{SectionID: 'UNITS', SQL: 'SELECT PageID, Name, PageLayoutID, PageGroupID FROM UnitPages WHERE Age=?1'},
      ...(options.unsafeSQL ? [{SectionID: 'UNITS', SQL: options.unsafeSQL === true ? 'DELETE FROM Units' : options.unsafeSQL}] : [])],
    CivilopediaPageLayoutChapters: [
      {PageLayoutID: 'Unit', ChapterID: 'SUMMARY', Header: 'LOC_SUMMARY', SortIndex: 1},
      {PageLayoutID: 'Unit', ChapterID: 'HISTORY', SortIndex: 2},
      {PageLayoutID: 'Concept', ChapterID: 'CONTENT', SortIndex: 1},
    ],
    CivilopediaPageLayoutChapterContentQueries: [{PageLayoutID: 'Unit', ChapterID: 'SUMMARY', SQL: 'SELECT Description AS Text FROM Units WHERE UnitType=?1'}],
    CivilopediaPageChapterHeaders: [{SectionID: 'UNITS', PageID: 'UNIT_EXPLORER', ChapterID: 'HISTORY', Header: 'LOC_OVERRIDE'}],
    CivilopediaPageChapterParagraphs: [
      {SectionID: 'UNITS', PageID: 'UNIT_EXPLORER', ChapterID: 'HISTORY', Paragraph: 'LOC_SECOND', SortIndex: 20},
      {SectionID: 'UNITS', PageID: 'UNIT_EXPLORER', ChapterID: 'HISTORY', Paragraph: 'LOC_FIRST', SortIndex: 10},
    ],
    Units: table([{UnitType: 'UNIT_EXPLORER', Name: 'LOC_UNIT', Description: 'LOC_DESCRIPTION', BaseMoves: 4}], 'UnitType'),
    Constructibles: table([{ConstructibleType: 'BUILDING_UNIVERSITY', Name: 'LOC_BUILDING'}], 'ConstructibleType'),
    ProgressionTreeNodeUnlocks: [{TargetType: 'UNIT_EXPLORER', ProgressionTreeNodeType: 'TECH_HISTORY', UnlockDepth: 2},
      {TargetType: 'UNIT_EXPLORER', ProgressionTreeNodeType: 'SECRET_TECH', Hidden: true}],
    ProgressionTreeNodes: table([{ProgressionTreeNodeType: 'TECH_HISTORY', Name: 'LOC_TECH'}], 'ProgressionTreeNodeType'),
    Unit_RequiredConstructibles: [{UnitType: 'UNIT_EXPLORER', ConstructibleType: 'BUILDING_UNIVERSITY'}],
  };
  const context = {
    queryArguments: {query: null, section_id: null, page_id: null, limit: 10, offset: 0, ...args},
    UI: {isInGame: () => true}, Game: {turn: 1, age: 42}, GameInfo: info,
    Locale: {keyExists: key => key in text || key === 'LOC_CUSTOM_EXPLORERS_CHAPTER_CONTENT_BODY',
      compose: key => key === 'LOC_CUSTOM_EXPLORERS_CHAPTER_CONTENT_BODY' ? 'Local concept body.' : text[key] ?? key},
    Network: {supportsSSO: () => false},
    Players: {get: () => {throw Error('No player/hidden empire inspection');}},
    Search: {hasContext: () => Boolean(options.nativeSearch),
      search: (context, query, limit) => {assert.equal(context, 'Civilopedia'); assert.ok(limit <= 100);
        return [{type: 'UNITS|UNIT_EXPLORER'}, {type: 'UNITS|UNIT_HIDDEN'}, {type: 'SECRET|LEAK'}];},
      createContext: () => {throw Error('Never initialize or modify the UI search index');}},
    Database: {query: (database, sql, ...parameters) => {
      calls.push({database, sql, parameters});
      assert.match(sql, /^\s*SELECT\b/i, 'only bounded SELECT statements');
      assert.ok(!/DELETE|DROP|UPDATE|INSERT|ATTACH/i.test(sql), 'no mutating SQL');
      if (sql.includes('FROM UnitPages')) {
        assert.deepEqual(parameters, ['AGE_EXPLORATION']);
        return ['UNIT_EXPLORER', 'UNIT_SCOUT', 'UNIT_HIDDEN', 'UNIT_GROUP_HIDDEN'].map(PageID => ({PageID,
          Name: PageID === 'UNIT_SCOUT' ? 'Scout' : 'LOC_UNIT', PageLayoutID: 'Unit',
          PageGroupID: PageID === 'UNIT_GROUP_HIDDEN' ? 'HIDDEN_GROUP' : null}));
      }
      if (sql.includes('FROM Units')) {
        assert.deepEqual(parameters, ['UNIT_EXPLORER', 'UNITS']);
        return [{Text: 'LOC_DESCRIPTION'}];
      }
      if (database === 'config') {assert.deepEqual(parameters, ['UNIT_EXPLORER']); return [];}
      throw Error(`Unexpected SQL: ${sql}`);
    }},
  };
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/civilopedia.js'), 'utf8'), context);
  return {data: JSON.parse(JSON.stringify(data)), calls};
}

test('no arguments lists public sections without building pages or initializing the UI', () => {
  const {data, calls} = run();
  assert.deepEqual(data.sections.map(section => section.id), ['CONCEPTS', 'UNITS']);
  assert.equal(data.mode, 'sections');
  assert.equal(calls.length, 0);
});

test('fallback search returns bounded exact identifiers, respects excludes and paginates', () => {
  const {data} = run({query: 'Explorer', limit: 1});
  assert.equal(data.mode, 'search');
  assert.equal(data.results.length, 1);
  assert.equal(data.hasMore, true);
  assert.equal(data.article, null, 'ambiguous search never silently chooses an article');
  assert.deepEqual(data.results[0], {sectionId: 'CONCEPTS', pageId: 'EXPLORERS', title: 'Explorer', layoutId: 'Concept'});
  assert.equal(run({query: 'Explorer', limit: 1, offset: 1}).data.results[0].pageId, 'UNIT_EXPLORER');
  assert.equal(run({query: 'UNIT_HIDDEN'}).data.results.length, 0);
  assert.equal(run({query: 'definitely absent'}).data.results.length, 0);
});

test('existing native search is read without trusting excluded or stale hits', () => {
  const {data} = run({query: 'artifacts'}, {nativeSearch: true});
  assert.equal(data.searchMethod, 'native-existing-index');
  assert.deepEqual(data.results.map(page => page.pageId), ['UNIT_EXPLORER']);
});

test('exact page reads native chapter SQL, sorted overrides and bounded requirement definitions', () => {
  const {data} = run({section_id: 'UNITS', page_id: 'UNIT_EXPLORER'});
  assert.equal(data.mode, 'article');
  assert.equal(data.article.title, 'Explorer');
  assert.equal(data.article.chapters[0].paragraphs[0].text, 'Research artifacts at ruins.');
  assert.equal(data.article.chapters[1].heading, 'Override title');
  assert.deepEqual(data.article.chapters[1].paragraphs.map(paragraph => paragraph.text), ['First paragraph.', 'Second paragraph.']);
  assert.equal(data.article.definition.fields.BaseMoves, 4);
  assert.equal(data.article.requirements.unlockNodes[0].requiredDepth, 2);
  assert.equal(data.article.requirements.requiredConstructibles[0].id, 'BUILDING_UNIVERSITY');
  assert.equal(data.article.requirements.evaluatedEligibility, null);
  assert.equal(data.article.requirements.complete, false, 'pedia requirements are not a live eligibility simulator');
  assert.equal(data.article.requirements.unlockNodes.length, 1);
});

test('localized prefix fallback returns article content and excluded/unknown pages remain not found', () => {
  assert.equal(run({section_id: 'CONCEPTS', page_id: 'EXPLORERS'}).data.article.chapters[0].paragraphs[0].text, 'Local concept body.');
  for (const [section_id, page_id] of [['UNITS', 'UNIT_HIDDEN'], ['UNITS', 'UNIT_GROUP_HIDDEN'], ['SECRET', 'LEAK'], ['UNITS', 'MISSING']]) {
    assert.equal(run({section_id, page_id}).data.article, null);
  }
});

test('only vetted native SELECT definitions execute; user input is never interpolated as SQL', () => {
  const {data, calls} = run({query: "x'; DROP TABLE Units;--"}, {unsafeSQL: true});
  assert.equal(data.results.length, 0);
  assert.equal(data.complete, false);
  assert.ok(data.warnings.length);
  assert.ok(calls.every(call => !call.sql.includes('DROP TABLE')));
  for (const unsafeSQL of ['SELECT 1; DELETE FROM Units', "SELECT load_extension('x')", 'SELECT 1 /* hidden statement */']) {
    const blocked = run({query: 'Explorer'}, {unsafeSQL});
    assert.equal(blocked.data.complete, false);
    assert.ok(blocked.calls.every(call => !call.sql.includes(unsafeSQL)));
  }
});

test('missing localization and truncated article text are explicit, not fabricated content', () => {
  const args = {section_id: 'UNITS', page_id: 'UNIT_EXPLORER'};
  const missing = run(args, {missingText: true}).data;
  assert.equal(missing.complete, false);
  assert.equal(missing.article.chapters[0].contentAvailable, false);
  assert.ok(missing.warnings.some(warning => warning.includes('LOC_DESCRIPTION')));
  const long = run(args, {longText: true}).data;
  assert.equal(long.complete, false);
  assert.equal(long.article.chapters[0].paragraphs[0].text.length, 4000);
  assert.ok(long.warnings.some(warning => warning.includes('truncated')));
});
