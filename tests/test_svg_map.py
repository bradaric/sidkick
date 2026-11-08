import copy
import tempfile
import re
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch
import xml.etree.ElementTree as ET

from mcp.server.mcpserver.exceptions import ToolError
from civ7 import queries
from civ7.svg_preview import PREVIEW_NAME, PREVIEW_URL, TERRAINS, publish_preview, render_svg
from sidkick.server import create_server


def view():
    return {'turn': 11, 'age': 42, 'playerId': 0, 'mapWidth': 20, 'mapHeight': 20,
            'center': {'x': 2, 'y': 2}, 'requestedSize': {'width': 3, 'height': 1},
            'bounds': {'minX': 1, 'maxX': 3, 'minY': 2, 'maxY': 2},
            'coverage': {'settlements': True, 'units': True},
            'tiles': [
                {'x': 1, 'y': 2, 'terrain': None, 'visibility': 'unknown', 'marker': '???'},
                {'x': 2, 'y': 2, 'terrain': 'TERRAIN_HILL', 'visibility': 'visible', 'marker': 'U'},
                {'x': 3, 'y': 2, 'terrain': 'TERRAIN_MOUNTAIN', 'visibility': 'fogged', 'marker': ' '},
            ], 'settlements': [], 'units': [{'x': 2, 'y': 2, 'name': 'Scout <script>alert(1)</script> & "test"'}]}


class SvgRenderingTests(unittest.TestCase):
    def test_tile_ownership_tooltips_do_not_change_map_geometry_colors_markers_or_health(self):
        ns = {'s': 'http://www.w3.org/2000/svg'}
        for ownership, label in [
            ({'status': 'ours', 'playerId': 0, 'civilization': 'Rome'}, 'ours (Rome)'),
            ({'status': 'foreign', 'playerId': 1, 'civilization': 'Egypt'}, 'Egypt'),
            ({'status': 'foreign', 'playerId': 1, 'civilization': None}, 'player #1'),
            ({'status': 'unowned', 'playerId': None, 'civilization': None}, 'unowned'),
        ]:
            with self.subTest(ownership=ownership):
                data = view()
                data['units'][0]['health'] = {'current': 72, 'maximum': 100}
                baseline = ET.fromstring(render_svg(data))
                data['tiles'][1]['ownership'] = ownership
                root = ET.fromstring(render_svg(data))
                self.assertIn(f'Owner: {label}', root.find('.//s:g[@data-x="2"]/s:title', ns).text)
                for image in (baseline, root):
                    for tile in image.findall('.//s:g[@class="tile"]', ns):
                        tile.remove(tile.find('s:title', ns))
                self.assertEqual(ET.tostring(root), ET.tostring(baseline))

    def test_missing_invalid_or_nonvisible_ownership_is_unknown_without_leaking_labels(self):
        ns = {'s': 'http://www.w3.org/2000/svg'}
        invalid = [None, [], {}, {'status': 'unknown', 'playerId': 1, 'civilization': 'SECRET'},
                   {'status': 'ours', 'playerId': 1, 'civilization': 'SECRET'},
                   {'status': 'foreign', 'playerId': 0, 'civilization': 'SECRET'},
                   {'status': 'foreign', 'playerId': True, 'civilization': 'SECRET'},
                   {'status': 'unowned', 'playerId': 1, 'civilization': 'SECRET'}]
        for ownership in invalid:
            data = view()
            data['tiles'][1]['ownership'] = ownership
            svg = render_svg(data)
            self.assertIn('Owner: unknown', ET.fromstring(svg).find('.//s:g[@data-x="2"]/s:title', ns).text)
            self.assertNotIn('SECRET', svg)
        data = view()
        for tile in (data['tiles'][0], data['tiles'][2]):
            tile['ownership'] = {'status': 'foreign', 'playerId': 1, 'civilization': 'SECRET'}
        self.assertNotIn('SECRET', render_svg(data))

    def test_ownership_labels_are_escaped_as_plain_text(self):
        data = view()
        data['tiles'][1]['ownership'] = {'status': 'foreign', 'playerId': 1,
                                        'civilization': 'Egypt <script>bad()</script> & friends'}
        svg = render_svg(data)
        self.assertIn('Egypt &lt;script&gt;bad()&lt;/script&gt; &amp; friends', svg)
        self.assertFalse(ET.fromstring(svg).findall('.//{http://www.w3.org/2000/svg}script'))

    def test_preview_response_includes_only_visibility_safe_tile_ownership(self):
        data = view()
        data['tiles'][1]['ownership'] = {'status': 'ours', 'playerId': 0, 'civilization': 'Rome'}
        data['tiles'][2]['ownership'] = {'status': 'foreign', 'playerId': 1, 'civilization': 'SECRET'}
        with tempfile.TemporaryDirectory(dir='/tmp/opencode') as directory:
            result = publish_preview(data, Path(directory))
        self.assertEqual(result['tiles'], [
            {'x': 1, 'y': 2, 'ownership': {'status': 'unknown', 'playerId': None, 'civilization': None}},
            {'x': 2, 'y': 2, 'ownership': {'status': 'ours', 'playerId': 0, 'civilization': 'Rome'}},
            {'x': 3, 'y': 2, 'ownership': {'status': 'unknown', 'playerId': None, 'civilization': None}},
        ])

    def test_fog_preserves_terrain_colors_with_only_light_dimming_and_hatching(self):
        ns = {'s': 'http://www.w3.org/2000/svg'}
        for terrain, (color, _, _) in TERRAINS.items():
            with self.subTest(terrain=terrain):
                data = view()
                data['tiles'][1]['terrain'] = terrain
                data['tiles'][2]['terrain'] = terrain
                root = ET.fromstring(render_svg(data))
                visible = root.find('.//s:g[@data-x="2"]', ns)
                fogged = root.find('.//s:g[@data-x="3"]', ns)
                for tile in (visible, fogged):
                    self.assertEqual(tile.find('s:polygon', ns).attrib['fill'], color)
                self.assertEqual(visible.find('s:polygon', ns).attrib['opacity'], '1')
                self.assertEqual(fogged.find('s:polygon', ns).attrib['opacity'], '.85')
                self.assertIsNotNone(fogged.find('s:polygon[@fill="url(#fog)"]', ns))
                self.assertIsNone(visible.find('s:polygon[@fill="url(#fog)"]', ns))
                self.assertIn('FOG', [node.text for node in fogged.findall('s:text', ns)])
                unknown = root.find('.//s:g[@data-x="1"]/s:polygon', ns)
                self.assertEqual(unknown.attrib['fill'], '#293548')
                self.assertEqual(unknown.attrib['opacity'], '1')

    def test_visible_unit_health_bar_percentage_and_exact_hp_tooltip(self):
        ns = {'s': 'http://www.w3.org/2000/svg'}
        for current, maximum, percent, color in [
            (100, 100, '100%', '#4ade80'), (72, 100, '72%', '#4ade80'),
            (40, 100, '40%', '#fbbf24'), (18, 100, '18%', '#f87171'),
            (0, 100, '0%', '#f87171'), (72, 200, '36%', '#fbbf24'),
            (50, 100, '50%', '#fbbf24'), (25, 100, '25%', '#f87171'),
            (1, 3, '33%', '#fbbf24'),
        ]:
            with self.subTest(current=current, maximum=maximum):
                data = view()
                data['units'][0]['health'] = {'current': current, 'maximum': maximum}
                root = ET.fromstring(render_svg(data))
                tile = root.find('.//s:g[@data-x="2"]', ns)
                fill = tile.find('s:rect[@class="health-fill"]', ns)
                self.assertIsNotNone(fill)
                self.assertAlmostEqual(float(fill.attrib['width']), 40 * current / maximum, places=2)
                self.assertEqual(fill.attrib['fill'], color)
                self.assertEqual(tile.find('s:text[@class="unit-health"]', ns).text, percent)
                self.assertIn(f'HP {current}/{maximum}', tile.find('s:title', ns).text)
                self.assertEqual(tile.find('s:text[@class="coord"]', ns).attrib['y'], '-25')

    def test_missing_or_invalid_health_renders_unknown_without_a_filled_bar(self):
        ns = {'s': 'http://www.w3.org/2000/svg'}
        for health in [None, {}, [], {'current': True, 'maximum': 100},
                       {'current': -1, 'maximum': 100}, {'current': 101, 'maximum': 100},
                       {'current': 1, 'maximum': 0}, {'current': float('nan'), 'maximum': 100},
                       {'current': 1, 'maximum': float('inf')}, {'current': '72', 'maximum': 100}]:
            with self.subTest(health=health):
                data = view()
                data['units'][0]['health'] = health
                root = ET.fromstring(render_svg(data))
                self.assertFalse(root.findall('.//s:rect[@class="health-fill"]', ns))
                label = root.find('.//s:text[@class="unit-health"]', ns)
                self.assertIsNotNone(label)
                self.assertEqual(label.text, '?')
                self.assertIn('HP ?', root.find('.//s:g[@data-x="2"]/s:title', ns).text)

    def test_stacked_units_list_individual_hp_without_inventing_combined_health(self):
        data = view()
        data['units'][0]['health'] = {'current': 72, 'maximum': 100}
        data['units'].append({'x': 2, 'y': 2, 'name': 'Infantry',
                              'health': {'current': 18, 'maximum': 100}})
        root = ET.fromstring(render_svg(data))
        ns = {'s': 'http://www.w3.org/2000/svg'}
        self.assertFalse(root.findall('.//s:rect[@class="health-fill"]', ns))
        label = root.find('.//s:text[@class="unit-health"]', ns)
        self.assertIsNotNone(label)
        self.assertEqual(label.text, '?')
        tooltip = root.find('.//s:g[@data-x="2"]/s:title', ns).text
        self.assertIn('HP 72/100', tooltip)
        self.assertIn('Infantry — HP 18/100', tooltip)

    def test_city_markers_do_not_show_unit_health_as_city_health(self):
        data = view()
        data['tiles'][1]['marker'] = 'C'
        data['units'][0]['health'] = {'current': 72, 'maximum': 100}
        root = ET.fromstring(render_svg(data))
        ns = {'s': 'http://www.w3.org/2000/svg'}
        self.assertFalse(root.findall('.//s:text[@class="unit-health"]', ns))
        self.assertIn('HP 72/100', root.find('.//s:g[@data-x="2"]/s:title', ns).text)

    def test_svg_is_north_up_colored_and_escapes_labels_without_active_content(self):
        data = view()
        data['tiles'][0]['terrain'] = None
        svg = render_svg(data)
        root = ET.fromstring(svg)
        ns = {'s': 'http://www.w3.org/2000/svg'}
        self.assertEqual(len(root.findall('.//s:g[@class="tile"]', ns)), 3)
        self.assertFalse(root.findall('.//s:script', ns))
        self.assertFalse(root.findall('.//s:image', ns))
        self.assertIn('North', svg)
        self.assertEqual(root.find('.//s:g[@data-x="2"]/s:polygon', ns).attrib['fill'], '#3f7d46')
        self.assertEqual(root.find('.//s:g[@data-x="3"]/s:polygon', ns).attrib['fill'], '#9b7653')
        legend_colors = {node.attrib['fill'] for node in root.findall('s:rect', ns)}
        self.assertTrue({'#3f7d46', '#9b7653'} <= legend_colors)
        self.assertIn('FOG', svg)
        self.assertIn('&lt;script&gt;', svg)
        self.assertIn('&amp;', svg)
        self.assertNotIn('TERRAIN_COAST', svg, 'unknown tiles contain no terrain data')
        self.assertNotIn('http://', svg.replace('http://www.w3.org/2000/svg', ''))

    def test_hidden_or_fogged_entities_never_enter_svg_tooltips(self):
        data = view()
        data['tiles'][0]['terrain'] = None
        data['units'].append({'x': 1, 'y': 2, 'name': 'HIDDEN UNIT', 'health': {'current': 37, 'maximum': 41}})
        data['units'].append({'x': 3, 'y': 2, 'name': 'FOGGED UNIT', 'health': {'current': 29, 'maximum': 31}})
        data['settlements'].append({'x': 3, 'y': 2, 'name': 'FOGGED CITY'})
        svg = render_svg(data)
        self.assertNotIn('HIDDEN UNIT', svg)
        self.assertNotIn('FOGGED CITY', svg)
        self.assertNotIn('FOGGED UNIT', svg)
        self.assertNotIn('HP 37/41', svg)
        self.assertNotIn('HP 29/31', svg)

    def test_svg_native_north_is_up_and_east_is_right_not_the_ascii_oblique_projection(self):
        data = view()
        data.update(center={'x':2,'y':3},requestedSize={'width':3,'height':3},
                    bounds={'minX':1,'maxX':3,'minY':2,'maxY':4})
        data['tiles'] = [{'x':x,'y':y,'terrain':'TERRAIN_FLAT','visibility':'visible','marker':' '}
                         for y in range(2,5) for x in range(1,4)]
        root = ET.fromstring(render_svg(data))
        centers = {(int(g.attrib['data-x']),int(g.attrib['data-y'])):
                   tuple(map(float,re.findall(r'-?\d+\.\d+',g.attrib['transform'])))
                   for g in root.findall('.//{http://www.w3.org/2000/svg}g')}
        self.assertEqual(centers[2,2][0],centers[2,4][0])
        self.assertLess(centers[2,4][1],centers[2,2][1])
        self.assertEqual(centers[2,2][1],centers[3,2][1])
        self.assertGreater(centers[3,2][0],centers[2,2][0])

    def test_native_signed_age_hash_is_valid_for_the_reported_viewport(self):
        data = view()
        # Historical native Exploration age hash; coordinates from the reported failure.
        data.update(age=-610349106,mapWidth=100,mapHeight=50,center={'x':71,'y':7},
                    requestedSize={'width':11,'height':9},bounds={'minX':66,'maxX':76,'minY':3,'maxY':11})
        data['tiles'] = [{'x':x,'y':y,'terrain':'TERRAIN_FLAT','visibility':'visible','marker':' '}
                         for y in range(3,12) for x in range(66,77)]
        root = ET.fromstring(render_svg(data))
        self.assertEqual(len(root.findall('.//{http://www.w3.org/2000/svg}g')),99)
        with tempfile.TemporaryDirectory(dir='/tmp/opencode') as directory:
            self.assertEqual(publish_preview(data,Path(directory))['age'],-610349106)

    def test_malformed_or_inconsistent_views_reject_instead_of_publishing(self):
        valid = view()
        valid['tiles'][0]['terrain'] = None
        for change in [lambda v: v['tiles'].pop(), lambda v: v['tiles'].append(v['tiles'][0]),
                       lambda v: v['tiles'][0].update(terrain='SECRET'),
                       lambda v: v['tiles'][2].update(marker='U'),
                       lambda v: v['tiles'][1].update(x=19), lambda v: v.update(turn=True),
                       lambda v: v['bounds'].update(maxX=99), lambda v: v.pop('requestedSize'),
                       lambda v: v.pop('coverage'), lambda v: v['units'][0].update(name='invalid\x00name'),
                       lambda v: v.update(age=True), lambda v: v.update(age='AGE_EXPLORATION'),
                       lambda v: v.update(turn=-1), lambda v: v.update(playerId=-1)]:
            data = copy.deepcopy(valid)
            change(data)
            with self.assertRaises(ValueError):
                render_svg(data)

    def test_largest_allowed_view_remains_bounded_and_renders_all_tiles(self):
        data = view()
        data.update(mapWidth=100,mapHeight=100,center={'x':16,'y':11},requestedSize={'width':31,'height':21},
                    bounds={'minX':1,'maxX':31,'minY':1,'maxY':21})
        data['tiles'] = [{'x':x,'y':y,'terrain':'TERRAIN_FLAT','visibility':'visible','marker':' '}
                         for y in range(1,22) for x in range(1,32)]
        root = ET.fromstring(render_svg(data))
        self.assertEqual(len(root.findall('.//{http://www.w3.org/2000/svg}g')),651)

    def test_atomic_publication_reuses_only_the_fixed_preview_name_and_keeps_last_good_on_failure(self):
        self.assertEqual(PREVIEW_NAME,'sidkick-map.svg')
        self.assertEqual(PREVIEW_URL,'http://127.0.0.1:8765/sidkick-map.svg')
        data = view()
        data['tiles'][0]['terrain'] = None
        with tempfile.TemporaryDirectory(dir='/tmp/opencode') as directory:
            root = Path(directory)
            result = publish_preview(data, root)
            self.assertEqual(result['previewUrl'], PREVIEW_URL)
            target = root / PREVIEW_NAME
            first = target.read_text()
            data['turn'] = 12
            with patch('civ7.svg_preview.os.replace', side_effect=OSError('publication failed')):
                with self.assertRaises(OSError):
                    publish_preview(data, root)
            self.assertEqual(target.read_text(), first)
            self.assertEqual([p.name for p in root.iterdir()], [PREVIEW_NAME])
            result2 = publish_preview(data, root)
            self.assertEqual(result2['previewUrl'], result['previewUrl'])
            self.assertIn('Turn 12', target.read_text())
            self.assertNotEqual(target.read_text(), first)


class SvgMapToolTests(unittest.IsolatedAsyncioTestCase):
    async def test_mcp_preserves_expected_svg_diagnostics_instead_of_a_generic_crash(self):
        for failure, detail in [(ValueError('Unverified map context'),'Unverified map context'),
                                (PermissionError(13,'Permission denied'),'PermissionError')]:
            with patch('civ7.queries.run_script',new_callable=AsyncMock,return_value=view()), \
                    patch('civ7.queries.publish_preview',side_effect=failure):
                with self.assertRaises(ToolError)as error:
                    await create_server().call_tool('get_civ7_svg_map',{'x':71,'y':7,'width':11,'height':9})
            self.assertIn(detail,str(error.exception))
            self.assertIn('previous preview',str(error.exception).lower())

    async def test_tool_pipeline_updates_fixed_cache_from_one_mocked_game_read(self):
        data = view()
        data['age'] = -610349106
        data['units'][0]['health'] = {'current': 72, 'maximum': 100}
        data['tiles'][1]['ownership'] = {'status': 'ours', 'playerId': 0, 'civilization': 'Rome'}
        with tempfile.TemporaryDirectory(dir='/tmp/opencode') as directory, \
                patch('civ7.svg_preview.PREVIEW_DIR', Path(directory)), \
                patch('civ7.queries.run_script', new_callable=AsyncMock, return_value=data) as run:
            result = await create_server().call_tool('get_civ7_svg_map',{'x':2,'y':2,'width':3,'height':1})
            self.assertFalse(result.is_error)
            self.assertEqual(result.structured_content['age'],-610349106)
            self.assertEqual(result.structured_content['previewUrl'],PREVIEW_URL)
            self.assertIn('Turn 11',(Path(directory)/PREVIEW_NAME).read_text())
            self.assertIn('72%', (Path(directory)/PREVIEW_NAME).read_text())
            self.assertIn('Owner: ours (Rome)', (Path(directory)/PREVIEW_NAME).read_text())
            self.assertEqual(result.structured_content['tiles'][1]['ownership'], data['tiles'][1]['ownership'])
            run.assert_awaited_once_with('ascii_map.js',{'x':2,'y':2,'width':3,'height':1,'render':'svg'})

    async def test_tool_is_default_game_read_only_and_publishes_one_bounded_snapshot(self):
        for enabled in (False, True):
            tool = next(t for t in create_server(enable_writes=enabled)._tool_manager.list_tools()
                        if t.name == 'get_civ7_svg_map')
            self.assertTrue(tool.annotations.read_only_hint)
            self.assertFalse(tool.annotations.destructive_hint)
            self.assertEqual(set(tool.parameters['required']), {'x', 'y'})
        with patch('civ7.queries.run_script', new_callable=AsyncMock, return_value=view()) as run, \
                patch('civ7.queries.publish_preview', return_value={'previewUrl': PREVIEW_URL}) as publish:
            result = await create_server().call_tool('get_civ7_svg_map', {'x': 2, 'y': 2})
        self.assertFalse(result.is_error)
        run.assert_awaited_once_with('ascii_map.js', {'x': 2, 'y': 2, 'width': 15, 'height': 9, 'render': 'svg'})
        publish.assert_called_once()
        self.assertEqual(result.structured_content['previewUrl'], PREVIEW_URL)

    async def test_invalid_arguments_or_failed_reads_do_not_publish(self):
        with patch('civ7.queries.run_script', new_callable=AsyncMock) as run, patch('civ7.queries.publish_preview') as publish:
            for args in [(True, 0), (0, -1), (0, 0, 4), (0, 0, 33), (0, 0, 3, 23)]:
                with self.assertRaises(ValueError):
                    await queries.svg_map(*args)
            with self.assertRaises(ToolError):
                await create_server().call_tool('get_civ7_svg_map', {'x': True, 'y': 0})
            run.assert_not_awaited()
            publish.assert_not_called()
        with patch('civ7.queries.run_script', new_callable=AsyncMock, side_effect=RuntimeError('unavailable')), \
                patch('civ7.queries.publish_preview') as publish:
            with self.assertRaises(RuntimeError):
                await queries.svg_map(2, 2)
            publish.assert_not_called()
