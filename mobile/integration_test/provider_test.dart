import 'package:anideck_mobile/providers/anikoto_catalog.dart';
import 'package:anideck_mobile/providers/embed_resolver.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:video_player/video_player.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('Anikoto native catalog to playable episode', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: Text('Provider compatibility check')),
      ),
    );
    final catalog = AnikotoCatalog(), resolver = EmbedResolver();
    VideoPlayerController? player;
    try {
      await tester.runAsync(() async {
        final titles = await catalog.search("Hell's Paradise");
        final title = titles
            .where(
              (t) => {
                "hell's paradise",
                'jigokuraku',
              }.contains(t.name.toLowerCase()),
            )
            .single;
        final episodes = await catalog.episodes(title);
        expect(episodes.map((e) => e.number), List.generate(13, (i) => i + 1));
        final episode = episodes.singleWhere((e) => e.number == 1 && e.sub);
        final started = Stopwatch()..start();
        final media = await resolver.resolve(
          await catalog.embeds(episode, 'sub'),
        );
        // Do not print expiring media addresses or headers.
        // ignore: avoid_print
        print(
          'PROVIDER resolved_ms=${started.elapsedMilliseconds} captions=${media.captions.length}',
        );
        player = VideoPlayerController.networkUrl(
          media.uri,
          httpHeaders: media.headers,
          formatHint: media.uri.path.endsWith('.m3u8') ? VideoFormat.hls : null,
        );
        await player!.initialize().timeout(const Duration(seconds: 25));
      });
      expect(player!.value.size.width, greaterThan(0));
      await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: VideoPlayer(player!))),
      );
      await tester.runAsync(() async {
        await player!.play();
        await Future<void>.delayed(const Duration(seconds: 4));
      });
      expect(player!.value.hasError, isFalse);
      expect(player!.value.position, greaterThan(Duration.zero));
      // ignore: avoid_print
      print('PROVIDER native_video_advance=pass size=${player!.value.size}');
    } finally {
      catalog.close();
      await resolver.close();
      await tester.runAsync(() async {
        await player?.dispose();
      });
    }
  });
}
