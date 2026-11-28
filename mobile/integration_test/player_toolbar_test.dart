import 'package:anideck_mobile/fullscreen_preview.dart';
import 'package:anideck_mobile/main.dart';
import 'package:anideck_mobile/player_preview.dart';
import 'package:anideck_mobile/preview_sample.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:video_player/video_player.dart';

// Real native controller and Apple's public HLS sample; no accounts or
// provider code. Prints `VISUAL <state>` and holds each state so a host can
// capture the dedicated acceptance emulator.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('fullscreen toolbar on a native player, portrait and landscape', (
    tester,
  ) async {
    VideoPlayerController? controller;
    await tester.pumpWidget(
      AniDeckMobile(
        home: PreviewPlayer(
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
    Future<void> wait(int ms) async {
      await tester.runAsync(
        () => Future<void>.delayed(Duration(milliseconds: ms)),
      );
      await tester.pump();
    }

    Future<void> hold(String state) async {
      // ignore: avoid_print
      print('VISUAL $state speed=${controller!.value.playbackSpeed}');
      await wait(3500);
    }

    Future<void> orient(DeviceOrientation o) async {
      await SystemChrome.setPreferredOrientations([o]);
      await wait(2500);
      await tester.pumpAndSettle();
    }

    for (var i = 0; i < 250 && controller?.value.isInitialized != true; i++) {
      if (controller?.value.hasError == true) fail('media failed to start');
      await wait(100);
    }
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Fullscreen'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Fullscreen'));
    await wait(1500);
    await tester.pumpAndSettle();
    expect(find.byType(FullscreenPreview), findsOneWidget);
    final session = controller!;
    final toolbar = find.byKey(const ValueKey('fullscreen-toolbar'));

    await orient(DeviceOrientation.portraitUp);
    expect(tester.takeException(), isNull);
    expect(find.byTooltip('Exit fullscreen'), findsOneWidget);
    await hold('portrait-paused');

    await orient(DeviceOrientation.landscapeLeft);
    expect(tester.takeException(), isNull);
    await hold('landscape-paused');

    await tester.tap(
      find.descendant(
        of: toolbar,
        matching: find.byTooltip('Playback settings'),
      ),
    );
    await wait(800);
    await tester.pumpAndSettle();
    await hold('landscape-settings');
    await tester.tap(find.text('1.25×'));
    await wait(500);
    await tester.pumpAndSettle();
    expect(session.value.playbackSpeed, 1.25);
    await tester.tapAt(const Offset(20, 20));
    await wait(800);
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Play').last);
    await wait(2500);
    await tester.pumpAndSettle();
    expect(session.value.isPlaying, isTrue);
    await hold('landscape-playing-speed');
    await wait((fullscreenControlsHideDelay.inMilliseconds) + 1000);
    await tester.pumpAndSettle();
    await hold('landscape-hidden');

    await tester.tapAt(
      tester.getCenter(find.byType(FullscreenPreview)) + const Offset(0, -80),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Pause').last);
    await wait(800);
    await tester.pumpAndSettle();
    await orient(DeviceOrientation.portraitUp);
    expect(tester.takeException(), isNull);
    await hold('portrait-paused-speed');
    expect(
      tester.widget<VideoPlayer>(find.byType(VideoPlayer).last).controller,
      same(session),
    );

    await tester.tap(find.byTooltip('Exit fullscreen'));
    await wait(1500);
    await tester.pumpAndSettle();
    expect(find.byType(FullscreenPreview), findsNothing);
    await SystemChrome.setPreferredOrientations([]);
  });
}
