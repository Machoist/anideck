import 'dart:convert';

import 'package:anideck_mobile/providers/anikoto_catalog.dart';
import 'package:anideck_mobile/providers/embed_resolver.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const rows =
    '<li title="First"><a data-num="1" data-id="101" data-ids="opaque &amp; ids" data-sub="1" data-dub="0"></a></li>'
    '<li><a data-num="3" data-id="103" data-ids="next" data-sub="1" data-dub="1"></a></li>';

void main() {
  test(
    'media headers preserve observed values without case duplicates or cookies',
    () {
      final headers = EmbedResolver.mediaHeaders(
        Uri.parse('https://megaplay.buzz/stream/example'),
        {
          'referer': 'https://megaplay.buzz/',
          'user-agent': 'Observed browser',
          'origin': 'https://megaplay.buzz',
          'Cookie': 'must not transfer',
        },
      );
      expect(headers, {
        'Referer': 'https://megaplay.buzz/',
        'User-Agent': 'Observed browser',
        'Origin': 'https://megaplay.buzz',
      });
      expect(
        EmbedResolver.mediaHeaders(
          Uri.parse('https://megaplay.buzz/stream/example'),
          {},
        )['Referer'],
        'https://megaplay.buzz/',
      );
    },
  );
  test('title identity is bounded to the verified provider origins', () {
    expect(
      AnikotoCatalog.titleUri('https://anikototv.to/watch/fixture/ep-2?q=x#x')
          .toString(),
      'https://anikototv.bz/watch/fixture',
    );
    for (final address in [
      'http://anikototv.bz/watch/x',
      'https://evil.test/watch/x',
      'https://anikototv.bz:9443/watch/x',
      'https://u:p@anikototv.bz/watch/x',
      '/watch/',
    ]) {
      expect(
        () => AnikotoCatalog.titleUri(address),
        throwsA(isA<ProviderFailure>()),
      );
    }
  });
  test(
    'search deduplicates provider identities and ignores unrelated links',
    () {
      final titles = AnikotoCatalog.parseTitles(
        '<a href="/watch/a/ep-1" title="First">First</a><a href="/watch/a/ep-2">First</a><a href="https://evil.test/watch/b">Wrong</a>',
      );
      expect(titles.length, 1);
      expect(titles.single.name, 'First');
    },
  );
  test(
    'actual episode gaps, numbering and audio availability are preserved',
    () {
      final episodes = AnikotoCatalog.parseEpisodes(rows);
      expect(episodes.map((e) => e.number), [1, 3]);
      expect(episodes.first.title, 'First');
      expect(episodes.first.servers, 'opaque & ids');
      expect(episodes.first.supports('dub'), isFalse);
      expect(episodes.last.supports('dub'), isTrue);
      expect(
        () => AnikotoCatalog.parseEpisodes(rows + rows),
        throwsA(isA<ProviderFailure>()),
      );
    },
  );
  test('listing validates page identity and player selection binds episode and audio', () async {
    final calls = <Uri>[];
    final catalog = AnikotoCatalog(
      client: MockClient((request) async {
        calls.add(request.url);
        expect(request.headers['X-Requested-With'], 'XMLHttpRequest');
        switch (request.url.path) {
          case '/watch/fixture':
            return http.Response(
              '<div class="watch-wrap" data-id="22" data-url="https://anikototv.bz/watch/fixture"></div>',
              200,
            );
          case '/ajax/episode/list/22':
            return http.Response(
              jsonEncode({'status': 200, 'result': rows}),
              200,
            );
          case '/ajax/server/list':
            expect(request.url.queryParameters['servers'], 'opaque & ids');
            return http.Response(
              jsonEncode({
                'status': 200,
                'result': '<div data-type="sub"><li data-ep-id="other" data-link-id="wrong"></li><li data-ep-id="101" data-link-id="right"></li></div><div data-type="dub"><li data-ep-id="101" data-link-id="dub"></li></div>',
              }),
              200,
            );
          case '/ajax/server':
            expect(request.url.queryParameters['get'], 'right');
            return http.Response(
              jsonEncode({
                'status': 200,
                'result': {'url': 'https://megaplay.buzz/stream/fixture'},
              }),
              200,
            );
          default:
            fail('Unexpected provider path');
        }
      }),
    );
    addTearDown(catalog.close);
    final episodes = await catalog.episodes(
      ProviderTitle(Uri.parse('https://anikototv.bz/watch/fixture'), 'Fixture'),
    );
    expect(await catalog.embeds(episodes.first, 'sub'), [
      Uri.parse('https://megaplay.buzz/stream/fixture'),
    ]);
    final count = calls.length;
    await expectLater(
      catalog.embeds(episodes.first, 'dub'),
      throwsA(isA<ProviderFailure>()),
    );
    expect(calls.length, count);
  });
  test('network failure and wrong-title pages are errors, never empty availability', () async {
    final failure = AnikotoCatalog(
      client: MockClient((_) async => http.Response('Unavailable', 429)),
    );
    addTearDown(failure.close);
    await expectLater(
      failure.search('Fixture'),
      throwsA(isA<ProviderFailure>()),
    );
    final wrong = AnikotoCatalog(
      client: MockClient(
        (_) async => http.Response(
          '<div class="watch-wrap" data-id="1" data-url="/watch/wrong"></div>',
          200,
        ),
      ),
    );
    addTearDown(wrong.close);
    await expectLater(
      wrong.episodes(
        ProviderTitle(Uri.parse('https://anikototv.bz/watch/right'), 'Right'),
      ),
      throwsA(isA<ProviderFailure>()),
    );
  });
  test('embed policy excludes local files, credentials and literal private network addresses', () {
    for (final address in [
      'file:///test.mp4',
      'http://example.test/a.m3u8',
      'https://127.0.0.1/a.m3u8',
      'https://10.0.0.1/a.m3u8',
      'https://host.local/a.m3u8',
      'https://u:p@example.test/a.m3u8',
    ]) {
      expect(EmbedResolver.publicHttps(Uri.parse(address)), isFalse);
    }
    expect(
      EmbedResolver.publicHttps(Uri.parse('https://media.example.test/a.m3u8')),
      isTrue,
    );
  });
}
