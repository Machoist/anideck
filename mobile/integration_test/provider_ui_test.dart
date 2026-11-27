import 'package:anideck_mobile/main.dart';
import 'package:anideck_mobile/player_preview.dart';
import 'package:anideck_mobile/local_library.dart';
import 'package:anideck_mobile/provider_browser.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:video_player/video_player.dart';

Future<void> waitFor(WidgetTester tester, Finder finder) async {
  final deadline = DateTime.now().add(const Duration(seconds: 45));
  while (finder.evaluate().isEmpty && DateTime.now().isBefore(deadline)) {
    await tester.pump(const Duration(milliseconds: 100));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 100)),
    );
  }
  expect(
    finder,
    findsWidgets,
    reason: tester.allWidgets
        .whereType<Text>()
        .map((t) => t.data ?? '')
        .join(' | '),
  );
}

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  const capture = bool.fromEnvironment('CAPTURE_SCREENSHOTS');
  testWidgets(
    'real source UI search to episode with native video and real subtitles',
    (tester) async {
      await tester.pumpWidget(const AniDeckMobile());
      await tester.ensureVisible(find.byKey(const ValueKey('home-browse')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('home-browse')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), "Hell's Paradise");
      await tester.tap(find.widgetWithText(FilledButton, 'Search'));
      final exactTitle = find.ancestor(
        of: find.textContaining(
          RegExp(r"^(Hell's Paradise|Jigokuraku)$", caseSensitive: false),
        ),
        matching: find.byType(ListTile),
      );
      await waitFor(tester, exactTitle);
      // ignore: avoid_print
      print('PROVIDER_UI result_tile=ready');
      await tester.tap(exactTitle.last);
      await waitFor(tester, find.text('13 listed episodes'));
      await tester.pumpAndSettle();
      final save = find.text('Save to My list');
      if (save.evaluate().isNotEmpty) {
        await tester.tap(save);
      }
      await waitFor(tester, find.text('Saved to My list'));
      // ignore: avoid_print
      print('PROVIDER_UI actual_episodes=13');
      await tester.ensureVisible(find.text('Episode 1 • Subtitled'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Episode 1 • Subtitled'));
      await tester.pump(const Duration(milliseconds: 350));
      await waitFor(tester, find.byTooltip('Play'));
      // ignore: avoid_print
      print('PROVIDER_UI player=ready');
      expect(find.byType(PreviewPlayer), findsOneWidget);
      final controller = tester
          .widget<VideoPlayer>(find.byType(VideoPlayer).first)
          .controller;
      final file = await tester.runAsync(() => controller.closedCaptionFile!);
      expect(file!.captions, isNotEmpty);
      // ignore: avoid_print
      print('PROVIDER_UI caption_file=loaded');
      await tester.ensureVisible(find.byTooltip('Play').last);
      await tester.tap(find.byTooltip('Play').last);
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(seconds: 4)),
      );
      await tester.pump();
      expect(controller.value.position, greaterThan(Duration.zero));
      expect(controller.value.hasError, isFalse);
      final laterCues = file.captions.where(
        (c) => c.start >= const Duration(minutes: 2),
      );
      final cue = laterCues.isEmpty ? file.captions.first : laterCues.first;
      await tester.runAsync(() async {
        await controller.pause();
        await controller.seekTo(cue.start + const Duration(milliseconds: 100));
        await Future<void>.delayed(const Duration(milliseconds: 800));
      });
      await tester.pump(const Duration(milliseconds: 300));
      expect(controller.value.isPlaying, isFalse);
      expect(find.text(cue.text), findsOneWidget);
      await tester.ensureVisible(find.text('Fullscreen'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Fullscreen'));
      await tester.pumpAndSettle();
      expect(find.textContaining(' · Episode 1'), findsOneWidget);
      expect(find.text('Playback preview'), findsNothing);
      final viewport = tester.getRect(
        find.byKey(const ValueKey('fullscreen-viewport')),
      );
      final fitVideo = tester.getRect(find.byType(VideoPlayer).last);
      expect(fitVideo.width / fitVideo.height, closeTo(16 / 9, 0.01));
      expect(
        fitVideo.width == viewport.width || fitVideo.height == viewport.height,
        isTrue,
      );
      await tester.tap(find.byKey(const ValueKey('fullscreen-fit')));
      await tester.pumpAndSettle();
      final fillVideo = tester.getRect(find.byType(VideoPlayer).last);
      expect(fillVideo.width, greaterThanOrEqualTo(viewport.width));
      expect(fillVideo.height, greaterThanOrEqualTo(viewport.height));
      expect(
        tester.widget<VideoPlayer>(find.byType(VideoPlayer).last).controller,
        same(controller),
      );
      await tester.tap(find.byKey(const ValueKey('fullscreen-fit')));
      await tester.pumpAndSettle();
      expect(tester.getRect(find.byType(VideoPlayer).last), fitVideo);
      await tester.tap(find.byTooltip('Exit fullscreen'));
      await tester.pumpAndSettle();
      expect(
        controller.value.position.inSeconds,
        closeTo(cue.start.inSeconds, 2),
      );
      // ignore: avoid_print
      print(
        'PROVIDER_UI search_episode_play_real_captions=pass cue_count=${file.captions.length} video_size=${controller.value.size}',
      );
      // Back must finish its durable checkpoint before closing the player.
      await tester.pageBack();
      await waitFor(tester, find.byType(ProviderEpisodes));
      await tester.pumpAndSettle();
      await tester.pumpWidget(const SizedBox());
      await tester.runAsync(() => LocalLibrary.instance.close());
      await tester.pumpWidget(const AniDeckMobile());
      final libraryTab = find.widgetWithText(NavigationDestination, 'My list');
      await tester.ensureVisible(libraryTab);
      await tester.pumpAndSettle();
      await tester.tap(libraryTab);
      final savedTitle = find.ancestor(
        of: find.textContaining(
          RegExp(r"^(Hell's Paradise|Jigokuraku)$", caseSensitive: false),
        ),
        matching: find.byType(ListTile),
      );
      await waitFor(tester, savedTitle);
      await tester.tap(savedTitle.first);
      await waitFor(tester, find.text('Continue episode 1'));
      await tester.ensureVisible(find.text('Continue episode 1'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue episode 1'));
      await waitFor(tester, find.byTooltip('Play'));
      final resumed = tester
          .widget<VideoPlayer>(find.byType(VideoPlayer).first)
          .controller;
      expect(resumed.value.position.inSeconds, closeTo(cue.start.inSeconds, 2));
      expect(resumed.value.isPlaying, isFalse);
      final restoredSeconds = resumed.value.position.inSeconds;
      await tester.runAsync(() async {
        await resumed.play();
        final deadline = DateTime.now().add(const Duration(seconds: 20));
        while (resumed.value.position.inSeconds < restoredSeconds + 2 &&
            DateTime.now().isBefore(deadline)) {
          await Future<void>.delayed(const Duration(milliseconds: 200));
        }
        await resumed.pause();
        await Future<void>.delayed(const Duration(milliseconds: 500));
      });
      await tester.pump(const Duration(milliseconds: 200));
      expect(
        resumed.value.position.inSeconds,
        greaterThanOrEqualTo(restoredSeconds + 2),
      );
      expect(resumed.value.hasError, isFalse);
      expect(resumed.value.isBuffering, isFalse);
      // ignore: avoid_print
      print(
        'LIBRARY_UI persisted_resume=pass episode=1 audio=sub restored=$restoredSeconds advanced=${resumed.value.position.inSeconds}',
      );
      if (capture) {
        await binding.convertFlutterSurfaceToImage();
        await tester.pump();
        await binding.takeScreenshot('provider-resume');
        await tester.pageBack();
        await waitFor(tester, find.byType(ProviderEpisodes));
        await tester.pumpAndSettle();
        await tester.pageBack();
        await waitFor(tester, savedTitle);
        await tester.pumpAndSettle();
        await binding.takeScreenshot('provider-library');
      }
      await tester.pumpWidget(const SizedBox());
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 300)),
      );
    },
  );
}
