"""Offline semantic consistency of crawlable category cards and the catalog."""
import html
import json
from pathlib import Path
import re
import unittest
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://shinjigolfguts-cmd.github.io/guts-base/'
CATEGORY_PAGES = {1: 'clubs.html', 2: 'balls.html', 3: 'shoes.html', 4: 'gloves.html', 5: 'apparel.html', 6: 'courses.html', 7: 'ranges.html', 8: 'schools.html', 10: 'accessories.html'}

def text(value):
    return html.unescape(re.sub(r'<[^>]+>', '', value))

def capture(pattern, value):
    match = re.search(pattern, value, re.S)
    if match is None:
        raise AssertionError('Missing expected static field: ' + pattern)
    return match[1]

class DiscoveryConsistency(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = (ROOT / 'catalog.js').read_text()
        cls.items = {item['id']: item for item in json.loads(source[source.index('['):source.rindex(']') + 1])}
        cls.pages = {p.name: p.read_text() for p in sorted((ROOT / 'categories').glob('*.html'))}
        cls.cards = []
        for page, markup in cls.pages.items():
            for card in re.findall(r'<article class="discoveryCard">(.*?)</article>', markup, re.S):
                query = parse_qs(urlparse(html.unescape(capture(r'<a href="([^"]+)"', card))).query)
                cls.cards.append((page, int(query['item'][0]), query, card))

    def test_one_static_card_for_each_catalog_item(self):
        ids = [entry[1] for entry in self.cards]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(set(ids), set(self.items))

    def test_deep_links_match_item_category_and_audience(self):
        for page, item_id, query, card in self.cards:
            with self.subTest(page=page, item=item_id):
                item = self.items[item_id]
                destination = urlparse(html.unescape(capture(r'<a href="([^"]+)"', card)))
                self.assertEqual(destination.path, '/guts-base/')
                self.assertIn((destination.scheme, destination.netloc), [('', ''), ('https', 'shinjigolfguts-cmd.github.io')])
                self.assertEqual(page, CATEGORY_PAGES[item['cat']])
                self.assertEqual(int(query['category'][0]), item['cat'])
                self.assertIn(query['audience'][0], ['men', 'women'])
                self.assertIn(item['audience'], ['shared', query['audience'][0]])

    def test_visible_card_fields_match_the_existing_catalog(self):
        for page, item_id, _, card in self.cards:
            with self.subTest(page=page, item=item_id):
                item = self.items[item_id]
                expected_price = '料金条件は詳細へ' if item['price'] is None else f"¥{item['price']:,} / {item['unit']}"
                self.assertEqual(text(capture(r'<h2>(.*?)</h2>', card)), item['name'])
                self.assertEqual(html.unescape(capture(r'<img[^>]+ alt="([^"]+)"', card)), item['name'])
                self.assertEqual(text(capture(r'<p class="discoveryPrice">(.*?)</p>', card)), expected_price)
                self.assertEqual(text(capture(r'<details>.*?<p>(.*?)</p>', card)), item['priceNote'])
                self.assertEqual(text(capture(r'情報確認日：([^<]+)', card)), item['checked'])
                self.assertEqual(html.unescape(capture(r'class="discoveryOfficial" href="([^"]+)"', card)), item['source'])
                self.assertEqual(html.unescape(capture(r'<img src="([^"]+)"', card)), '/guts-base/' + item['image'])
                self.assertEqual(text(capture(r'</a><p>(.*?)</p><p class="discoveryPrice">', card)), item['recommendationReason'])

    def test_collection_schema_matches_visible_page_metadata(self):
        for page, markup in self.pages.items():
            with self.subTest(page=page):
                schemas = [json.loads(s) for s in re.findall(r'<script type="application/ld\+json">(.*?)</script>', markup, re.S)]
                self.assertEqual(len(schemas), 1)
                schema = schemas[0]
                self.assertEqual(schema['@type'], 'CollectionPage')
                self.assertEqual(schema['url'], BASE + 'categories/' + page)
                self.assertEqual(schema['url'], capture(r'rel="canonical" href="([^"]+)"', markup))
                self.assertEqual(schema['name'], text(capture(r'<h1>(.*?)</h1>', markup)) + ' | GOLF GUTS')
                self.assertEqual(schema['description'], html.unescape(capture(r'<meta name="description" content="([^"]+)"', markup)))

    def test_related_links_and_both_sitemaps_cover_current_category_pages(self):
        expected = {'/guts-base/categories/' + p for p in self.pages}
        for page, markup in self.pages.items():
            with self.subTest(page=page):
                section = capture(r'<section class="discoveryRelated">(.*?)</section>', markup)
                links = re.findall(r'<a href="([^"]+)"', section)
                self.assertEqual(len(links), len(expected))
                self.assertEqual(set(links), expected)
        expected_urls = {BASE} | {BASE + 'categories/' + p for p in self.pages}
        for path in ['sitemap.xml', 'sitemap-v2.xml']:
            urls = re.findall(r'<loc>\s*(.*?)\s*</loc>', (ROOT / path).read_text())
            self.assertEqual(len(urls), len(expected_urls))
            self.assertEqual(set(urls), expected_urls)

if __name__ == '__main__':
    unittest.main()
