import 'package:anideck_mobile/player_preview.dart';
import 'package:anideck_mobile/preview_sample.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:video_player/video_player.dart';

// Real platform player and public sample URLs. No mocked media events or accounts.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  for (final sample in PreviewSample.values) {
    testWidgets('${sample.name}: native playback, seeking and captions', (
      tester,
    ) async {
      VideoPlayerController? controller;
      final startup = Stopwatch()..start();
      await tester.pumpWidget(
        MaterialApp(
          home: PreviewPlayer(
            sample: sample,
            controllerFactory: (uri, captions) =>
                controller = VideoPlayerController.networkUrl(
                  uri,
                  closedCaptionFile: captions,
                  formatHint: sample == PreviewSample.streaming
                      ? VideoFormat.hls
                      : null,
                ),
          ),
        ),
      );
      await tester.runAsync(() async {
        final deadline = DateTime.now().add(const Duration(seconds: 25));
        while (controller == null || !controller!.value.isInitialized) {
          if (controller?.value.hasError == true) {
            fail(
              'Native media initialization: ${controller!.value.errorDescription}',
            );
          }
          if (DateTime.now().isAfter(deadline)) {
            fail('Native initialization timed out');
          }
          await Future<void>.delayed(const Duration(milliseconds: 100));
        }
      });
      await tester.pump();
      final media = controller!;
      expect(media.value.size.width, greaterThan(0));
      expect(media.value.duration, greaterThan(Duration.zero));
      expect(media.value.isPlaying, isFalse);
      expect(find.text('Your next watch, on deck.'), findsOneWidget);
      // ignore: avoid_print
      print(
        'NATIVE ${sample.name} initialized_ms=${startup.elapsedMilliseconds} duration_ms=${media.value.duration.inMilliseconds} size=${media.value.size}',
      );
      await tester.ensureVisible(find.byTooltip('Play').last);
      await tester.tap(find.byTooltip('Play').last);
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(seconds: 3)),
      );
      await tester.pump();
      expect(media.value.hasError, isFalse);
      expect(media.value.position, greaterThan(Duration.zero));
      await tester.tap(find.byTooltip('Pause').last);
      await tester.pump();
      expect(media.value.isPlaying, isFalse);
      await tester.tap(find.byTooltip('Back 10 seconds'));
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 500)),
      );
      await tester.pump();
      expect(media.value.position.inMilliseconds, lessThan(500));
      expect(find.text('Your next watch, on deck.'), findsOneWidget);
      await tester.ensureVisible(find.text('Fullscreen'));
      await tester.tap(find.text('Fullscreen'));
      await tester.pumpAndSettle();
      expect(find.byTooltip('Exit fullscreen'), findsOneWidget);
      expect(media.value.isInitialized, isTrue);
      await tester.tap(find.byTooltip('Play').last);
      await tester.pump();
      await tester.runAsync(() async {
        final deadline = DateTime.now().add(const Duration(seconds: 10));
        while (media.value.position == Duration.zero &&
            !media.value.hasError &&
            DateTime.now().isBefore(deadline)) {
          await Future<void>.delayed(const Duration(milliseconds: 100));
        }
      });
      await tester.pump();
      expect(
        media.value.position,
        greaterThan(Duration.zero),
        reason:
            'fullscreen playing=${media.value.isPlaying} buffering=${media.value.isBuffering} error=${media.value.errorDescription}',
      );
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 300)),
      );
      await tester.pump();
      expect(media.value.isPlaying, isFalse);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.tap(find.byTooltip('Exit fullscreen'));
      await tester.pumpAndSettle();
      expect(media.value.hasError, isFalse);
      await tester.ensureVisible(find.text('Captions on'));
      await tester.tap(find.text('Captions on'));
      await tester.pump();
      expect(find.text('Your next watch, on deck.'), findsNothing);
      expect(find.text('Captions off'), findsOneWidget);
      // ignore: avoid_print
      print(
        'NATIVE ${sample.name} playback_seek_captions_fullscreen_lifecycle=pass',
      );
      await tester.pumpWidget(const SizedBox());
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 300)),
      );
    });
  }
}
