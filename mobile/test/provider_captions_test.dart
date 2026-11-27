import 'package:anideck_mobile/providers/provider_playback.dart';
import 'package:anideck_mobile/providers/embed_resolver.dart';
import 'package:anideck_mobile/providers/anikoto_catalog.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test(
    'real-source captions choose English, preserve headers and parse cues',
    () async {
      final client = MockClient((request) async {
        expect(request.url.path, '/english.vtt');
        expect(request.headers['Referer'], 'https://embed.example.test/');
        return http.Response(
          'WEBVTT\n\n00:00.000 --> 00:02.000\nGenerated subtitle cue\n',
          200,
        );
      });
      addTearDown(client.close);
      final media = ResolvedEpisode(
        Uri.parse('https://media.example.test/a.m3u8'),
        {'Referer': 'https://embed.example.test/'},
        [
          ProviderCaption(
            Uri.parse('https://captions.example.test/other.vtt'),
            'French',
          ),
          ProviderCaption(
            Uri.parse('https://captions.example.test/english.vtt'),
            'English',
          ),
        ],
      );
      final file = await loadProviderCaptions(media, client);
      expect(file.captions.single.text, 'Generated subtitle cue');
    },
  );
  test('caption failure never becomes illustrative sample captions', () async {
    final client = MockClient(
      (_) async => http.Response('<html>Unavailable</html>', 200),
    );
    addTearDown(client.close);
    final media = ResolvedEpisode(
      Uri.parse('https://media.example.test/a.m3u8'),
      {},
      [
        ProviderCaption(
          Uri.parse('https://captions.example.test/a.vtt'),
          'English',
        ),
      ],
    );
    await expectLater(
      loadProviderCaptions(media, client),
      throwsA(isA<ProviderFailure>()),
    );
    final empty = await loadProviderCaptions(
      ResolvedEpisode(media.uri, {}, []),
      client,
    );
    expect(empty.captions, isEmpty);
  });
}
