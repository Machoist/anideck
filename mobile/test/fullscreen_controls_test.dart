import 'dart:async';

import 'package:anideck_mobile/fullscreen_preview.dart';
import 'package:anideck_mobile/player_preview.dart';
import 'package:anideck_mobile/preview_sample.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:video_player/video_player.dart';
import 'package:video_player_platform_interface/video_player_platform_interface.dart';

/// Minimal platform: play/pause/seek are recorded, the view is a black box.
class _Platform extends VideoPlayerPlatform {
  final events = <int, StreamController<VideoEvent>>{};
  final seeks = <Duration>[];
  int plays = 0, pauses = 0;
  Duration position = Duration.zero;
  @override
  Future<void> init() async {}
  @override
  Future<int> createWithOptions(VideoCreationOptions options) async {
    final id = events.length + 1;
    events[id] = StreamController<VideoEvent>()
      ..add(
        VideoEvent(
          eventType: VideoEventType.initialized,
          duration: const Duration(minutes: 24),
          size: const Size(1920, 1080),
        ),
      );
    return id;
  }

  @override
  Stream<VideoEvent> videoEventsFor(int playerId) => events[playerId]!.stream;
  @override
  Future<void> dispose(int playerId) async => events[playerId]!.close();
  @override
  Future<void> setLooping(int playerId, bool looping) async {}
  @override
  Future<void> setVolume(int playerId, double volume) async {}
  @override
  Future<void> setPlaybackSpeed(int playerId, double speed) async {}
  @override
  Future<void> play(int playerId) async => plays++;
  @override
  Future<void> pause(int playerId) async => pauses++;
  @override
  Future<void> seekTo(int playerId, Duration value) async {
    position = value;
    seeks.add(value);
  }

  @override
  Future<Duration> getPosition(int playerId) async => position;
  @override
  Widget buildViewWithOptions(VideoViewOptions options) =>
      const ColoredBox(color: Colors.black);
}

// Settling animations consume part of the delay, so sample well before it.
const _justBefore = Duration(seconds: 2);
const _past = Duration(milliseconds: 1200);

Finder get _exit => find.byTooltip('Exit fullscreen');

T _barWidget<T extends Widget>(WidgetTester tester, Finder control) => tester
    .widget<T>(find.ancestor(of: control, matching: find.byType(T)).first);

/// Visible means opaque, hit-testable, focusable and in the semantics tree;
/// hidden means none of those, so nothing invisible can be activated.
void expectControls(WidgetTester tester, {required bool shown}) {
  for (final control in [_exit, find.byTooltip('Forward 10 seconds')]) {
    expect(_barWidget<AnimatedOpacity>(tester, control).opacity, shown ? 1 : 0);
    expect(_barWidget<IgnorePointer>(tester, control).ignoring, !shown);
    expect(_barWidget<ExcludeFocus>(tester, control).excluding, !shown);
    expect(_barWidget<ExcludeSemantics>(tester, control).excluding, !shown);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Platform platform;
  setUp(() {
    platform = _Platform();
    VideoPlayerPlatform.instance = platform;
  });

  Future<void> openFullscreen(WidgetTester tester, {bool play = true}) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: PreviewPlayer(
          sample: PreviewSample.clip,
          controllerFactory: (uri, _) => VideoPlayerController.networkUrl(
            uri,
            closedCaptionFile: Future<ClosedCaptionFile>.value(
              WebVTTCaptionFile(
                'WEBVTT\n\n00:00.000 --> 24:00.000\nFixture caption',
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Fullscreen'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Fullscreen'));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );
    await tester.pumpAndSettle();
    expect(find.byType(FullscreenPreview), findsOneWidget);
    // Watch in landscape, like the Android acceptance emulator.
    tester.view.physicalSize = const Size(844, 390);
    await tester.pumpAndSettle();
    if (play) {
      await tester.tap(find.byTooltip('Play').last);
      await tester.pumpAndSettle();
      expect(find.byTooltip('Pause'), findsWidgets);
    }
  }

  Future<void> unmount(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );
    await tester.pump();
  }

  testWidgets('playing hides after inactivity; taps toggle; hidden controls '
      'cannot be activated', (tester) async {
    await openFullscreen(tester);
    expectControls(tester, shown: true);
    await tester.pump(_justBefore);
    expectControls(tester, shown: true);
    await tester.pump(_past);
    await tester.pumpAndSettle();
    expectControls(tester, shown: false);

    // A tap where the invisible Forward button sits reveals controls
    // instead of seeking.
    final seeks = platform.seeks.length;
    await tester.tap(
      find.byTooltip('Forward 10 seconds').last,
      warnIfMissed: false,
    );
    await tester.pumpAndSettle();
    expect(platform.seeks.length, seeks);
    expectControls(tester, shown: true);

    // Tapping the video while shown and playing hides immediately.
    await tester.tapAt(const Offset(422, 195));
    await tester.pumpAndSettle();
    expectControls(tester, shown: false);
    await tester.tapAt(const Offset(422, 195));
    await tester.pumpAndSettle();
    expectControls(tester, shown: true);

    // Using a control restarts the inactivity delay.
    await tester.pump(const Duration(seconds: 2));
    await tester.tap(find.byTooltip('Forward 10 seconds').last);
    await tester.pump();
    expect(platform.seeks.length, seeks + 1);
    await tester.pump(const Duration(seconds: 2));
    expectControls(tester, shown: true);
    await tester.pump(const Duration(seconds: 1, milliseconds: 100));
    await tester.pumpAndSettle();
    expectControls(tester, shown: false);
    await unmount(tester);
  });

  testWidgets('paused stays visible; resuming re-arms the delay', (
    tester,
  ) async {
    await openFullscreen(tester, play: false);
    await tester.pump(const Duration(seconds: 10));
    expectControls(tester, shown: true);
    // Tapping the video while paused never hides the controls.
    await tester.tapAt(const Offset(422, 195));
    await tester.pumpAndSettle();
    expectControls(tester, shown: true);

    await tester.tap(find.byTooltip('Play').last);
    await tester.pump();
    await tester.pump(fullscreenControlsHideDelay + _past);
    await tester.pumpAndSettle();
    expectControls(tester, shown: false);

    // Pausing (here via keyboard reveal then the Pause control) shows them.
    await tester.tapAt(const Offset(422, 195));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Pause').last);
    await tester.pump();
    await tester.pump(const Duration(seconds: 10));
    expectControls(tester, shown: true);
    expect(platform.pauses, greaterThan(0));
    await unmount(tester);
  });

  testWidgets('a playback error reveals hidden controls and keeps them', (
    tester,
  ) async {
    await openFullscreen(tester);
    await tester.pump(fullscreenControlsHideDelay + _past);
    await tester.pumpAndSettle();
    expectControls(tester, shown: false);
    platform.events[1]!.addError(
      PlatformException(code: 'decode', message: 'Fixture decoder failure'),
    );
    await tester.pump();
    await tester.pump(const Duration(seconds: 10));
    expectControls(tester, shown: true);
    expect(
      find.text('Playback stopped. Exit fullscreen to reload.'),
      findsOneWidget,
    );
    await unmount(tester);
  });

  testWidgets('holding the seek slider keeps controls until release', (
    tester,
  ) async {
    await openFullscreen(tester);
    final slider = find.byType(VideoProgressIndicator).last;
    final gesture = await tester.startGesture(tester.getCenter(slider));
    await tester.pump(const Duration(seconds: 2));
    await gesture.moveBy(const Offset(40, 0));
    await tester.pump(const Duration(seconds: 8));
    expectControls(tester, shown: true);
    await gesture.up();
    await tester.pump();
    expect(platform.seeks, isNotEmpty);
    await tester.pump(_justBefore);
    expectControls(tester, shown: true);
    await tester.pump(_past);
    await tester.pumpAndSettle();
    expectControls(tester, shown: false);
    await unmount(tester);
  });

  testWidgets('an open menu or dialog above the player keeps controls', (
    tester,
  ) async {
    await openFullscreen(tester);
    final context = tester.element(find.byType(FullscreenPreview));
    unawaited(
      showMenu<void>(
        context: context,
        position: const RelativeRect.fromLTRB(600, 40, 0, 0),
        items: const [PopupMenuItem(child: Text('Fixture menu item'))],
      ),
    );
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 10));
    expectControls(tester, shown: true);
    Navigator.of(context).pop();
    await tester.pumpAndSettle();
    await tester.pump(_justBefore);
    expectControls(tester, shown: true);
    await tester.pump(_past);
    await tester.pumpAndSettle();
    expectControls(tester, shown: false);
    await unmount(tester);
  });

  testWidgets('screen-reader navigation never hides controls', (tester) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue =
        const FakeAccessibilityFeatures(accessibleNavigation: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await openFullscreen(tester);
    await tester.pump(const Duration(seconds: 10));
    await tester.tapAt(const Offset(422, 195));
    await tester.pumpAndSettle();
    expectControls(tester, shown: true);
    await unmount(tester);
  });

  testWidgets('reduced motion switches visibility without a fade', (
    tester,
  ) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue =
        const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await openFullscreen(tester);
    expect(_barWidget<AnimatedOpacity>(tester, _exit).duration, Duration.zero);
    await tester.pump(fullscreenControlsHideDelay + _past);
    await tester.pump();
    expectControls(tester, shown: false);
    await unmount(tester);
  });

  testWidgets('a key press reveals hidden controls', (tester) async {
    await openFullscreen(tester);
    await tester.pump(fullscreenControlsHideDelay + _past);
    await tester.pumpAndSettle();
    expectControls(tester, shown: false);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.pumpAndSettle();
    expectControls(tester, shown: true);
    await unmount(tester);
  });

  testWidgets('hiding never moves video or captions; Fit/Fill and captions '
      'still work', (tester) async {
    await openFullscreen(tester);
    final video = find.byType(VideoPlayer).last;
    final caption = find.text('Fixture caption').last;
    final videoShown = tester.getRect(video);
    final captionShown = tester.getRect(caption);
    await tester.pump(fullscreenControlsHideDelay + _past);
    await tester.pumpAndSettle();
    expectControls(tester, shown: false);
    expect(tester.getRect(video), videoShown);
    expect(tester.getRect(caption), captionShown);

    await tester.tapAt(const Offset(422, 195));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('fullscreen-fit')));
    await tester.pumpAndSettle();
    final filled = tester.getRect(video);
    expect(filled.width, closeTo(844, 0.01));
    expect(filled.height, greaterThan(390));
    await tester.pump(fullscreenControlsHideDelay + _past);
    await tester.pumpAndSettle();
    expectControls(tester, shown: false);
    expect(tester.getRect(video), filled, reason: 'Fill survives hiding');

    await tester.tapAt(const Offset(422, 195));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Turn captions off'));
    await tester.pumpAndSettle();
    expect(find.text('Fixture caption'), findsNothing);
    await unmount(tester);
  });
}
