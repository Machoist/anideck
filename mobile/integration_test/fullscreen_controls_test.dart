import 'package:anideck_mobile/fullscreen_preview.dart';
import 'package:anideck_mobile/player_preview.dart';
import 'package:anideck_mobile/preview_sample.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:video_player/video_player.dart';

// Real native controller and public HLS sample; no accounts or provider code.
// Prints `VISUAL <state>` and holds each state so a host can capture the
// emulator screen (see docs/audits/MOBILE-CONTROLS-AUTOHIDE-2026-11-27.md).
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('fullscreen controls auto-hide on a native player', (
    tester,
  ) async {
    VideoPlayerController? controller;
    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData(brightness: Brightness.dark, useMaterial3: true),
        home: PreviewPlayer(
          // Long public HLS sample: the short MP4 clip would end mid-check.
          sample: PreviewSample.streaming,
          controllerFactory: (uri, captions) =>
              controller = VideoPlayerController.networkUrl(
                uri,
                closedCaptionFile: captions,
                formatHint: VideoFormat.hls,
              ),
        ),
      ),
    );
    Future<void> waitFor(bool Function() done, String what) =>
        tester.runAsync(() async {
          final deadline = DateTime.now().add(const Duration(seconds: 25));
          while (!done()) {
            if (controller?.value.hasError == true) {
              fail('$what: ${controller!.value.errorDescription}');
            }
            if (DateTime.now().isAfter(deadline)) fail('$what timed out');
            await Future<void>.delayed(const Duration(milliseconds: 100));
            await tester.pump();
          }
        });
    Future<void> hold(String state, {int seconds = 4}) async {
      // ignore: avoid_print
      print('VISUAL $state position=${controller!.value.position}');
      await tester.runAsync(
        () => Future<void>.delayed(Duration(seconds: seconds)),
      );
      await tester.pump();
    }

    double opacity() => tester
        .widget<AnimatedOpacity>(
          find
              .ancestor(
                of: find.byTooltip('Exit fullscreen'),
                matching: find.byType(AnimatedOpacity),
              )
              .first,
        )
        .opacity;

    await waitFor(() => controller?.value.isInitialized == true, 'init');
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Fullscreen'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Fullscreen'));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(seconds: 2)),
    );
    await tester.pumpAndSettle();
    expect(find.byType(FullscreenPreview), findsOneWidget);
    // Rotate only once fullscreen is open; the inline page lays out lazily.
    await SystemChrome.setPreferredOrientations([
      DeviceOrientation.landscapeLeft,
    ]);
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(seconds: 2)),
    );
    await tester.pumpAndSettle();
    await hold('paused-shown');
    expect(opacity(), 1);

    await tester.tap(find.byTooltip('Play').last);
    await waitFor(() => controller!.value.isPlaying, 'play');
    await hold('playing-shown', seconds: 1);
    expect(opacity(), 1);
    await tester.runAsync(
      () => Future<void>.delayed(
        fullscreenControlsHideDelay + const Duration(seconds: 1),
      ),
    );
    await tester.pumpAndSettle();
    expect(opacity(), 0);
    expect(controller!.value.isPlaying, isTrue);
    await hold('playing-hidden');

    final center = tester.getCenter(find.byType(FullscreenPreview));
    await tester.tapAt(center);
    await tester.pumpAndSettle();
    expect(opacity(), 1);
    await hold('tap-shown', seconds: 2);

    await tester.tap(find.byKey(const ValueKey('fullscreen-fit')));
    await tester.pumpAndSettle();
    expect(find.text('Fill'), findsOneWidget);
    await tester.runAsync(
      () => Future<void>.delayed(
        fullscreenControlsHideDelay + const Duration(seconds: 1),
      ),
    );
    await tester.pumpAndSettle();
    expect(opacity(), 0);
    await hold('fill-hidden');

    await tester.tapAt(center);
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Pause').last);
    await waitFor(() => !controller!.value.isPlaying, 'pause');
    await tester.runAsync(
      () => Future<void>.delayed(
        fullscreenControlsHideDelay + const Duration(seconds: 2),
      ),
    );
    await tester.pumpAndSettle();
    expect(opacity(), 1);
    await hold('paused-after-delay-shown');
    await SystemChrome.setPreferredOrientations([]);
  });
}
