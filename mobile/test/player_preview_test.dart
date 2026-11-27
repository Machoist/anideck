import 'dart:async';

import 'package:flutter/services.dart';

import 'package:anideck_mobile/main.dart';
import 'package:anideck_mobile/player_preview.dart';
import 'package:anideck_mobile/preview_sample.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_player_platform_interface/video_player_platform_interface.dart';
import 'package:video_player/video_player.dart';

class TestVideoPlatform extends VideoPlayerPlatform {
  final events = <int, StreamController<VideoEvent>>{};
  final disposed = <int>[];
  final seeks = <Duration>[];
  final sources = <DataSource>[];
  bool initializeImmediately = true;
  int plays = 0, pauses = 0;
  Duration position = Duration.zero;
  @override
  Future<void> init() async {}
  @override
  Future<int> createWithOptions(VideoCreationOptions options) async {
    final id = events.length + 1;
    sources.add(options.dataSource);
    events[id] = StreamController<VideoEvent>();
    if (initializeImmediately) {
      events[id]!.add(
        VideoEvent(
          eventType: VideoEventType.initialized,
          duration: const Duration(seconds: 8),
          size: const Size(640, 360),
        ),
      );
    }
    return id;
  }

  @override
  Stream<VideoEvent> videoEventsFor(int playerId) => events[playerId]!.stream;
  @override
  Future<void> dispose(int playerId) async {
    disposed.add(playerId);
    await events[playerId]!.close();
  }

  @override
  Future<void> setLooping(int playerId, bool looping) async {}
  @override
  Future<void> setVolume(int playerId, double volume) async {}
  @override
  Future<void> setPlaybackSpeed(int playerId, double speed) async {}
  @override
  Future<void> play(int playerId) async {
    plays++;
  }

  @override
  Future<void> pause(int playerId) async {
    pauses++;
  }

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

void phoneSize(WidgetTester tester) {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Widget playerFixture({PreviewSample sample = PreviewSample.clip}) =>
    MaterialApp(
      home: PreviewPlayer(
        sample: sample,
        controllerFactory: (uri, captions) => VideoPlayerController.networkUrl(
          uri,
          closedCaptionFile: Future<ClosedCaptionFile>.value(
            WebVTTCaptionFile(
              'WEBVTT\n\n00:00.000 --> 00:08.000\nFixture caption',
            ),
          ),
        ),
      ),
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late TestVideoPlatform platform;
  setUp(() {
    platform = TestVideoPlatform();
    VideoPlayerPlatform.instance = platform;
  });

  testWidgets('home fits narrow screens and enlarged text without overflow', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(1.5)),
        child: AniDeckMobile(
          home: PreviewHome(
            loadFeed: () async => [],
            loadLibrary: () async => [],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('AniDeck'), findsOneWidget);
    expect(
      MediaQuery.textScalerOf(
        tester.element(find.byKey(const ValueKey('home-welcome-title'))),
      ).scale(10),
      15,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('play, seek bounds, captions, lifecycle pause and disposal', (
    tester,
  ) async {
    phoneSize(tester);
    await tester.pumpWidget(playerFixture());
    await tester.pumpAndSettle();
    expect(
      platform.sources.single.uri,
      startsWith('https://flutter.github.io/'),
    );
    expect(platform.plays, 0);
    await tester.ensureVisible(find.byTooltip('Play').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Play').last);
    await tester.pump();
    expect(platform.plays, 1);
    await tester.tap(find.byTooltip('Forward 10 seconds'));
    await tester.pump();
    expect(platform.seeks.last, const Duration(seconds: 8));
    await tester.tap(find.byTooltip('Back 10 seconds'));
    await tester.pump();
    expect(platform.seeks.last, Duration.zero);
    expect(find.text('Fixture caption'), findsOneWidget);
    await tester.ensureVisible(find.text('Captions on'));
    await tester.pumpAndSettle();
    await tester.pump();
    await tester.tap(find.text('Captions on'));
    await tester.pump();
    expect(find.text('Captions off'), findsOneWidget);
    expect(find.text('Fixture caption'), findsNothing);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await tester.pump();
    expect(platform.pauses, greaterThan(0));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpWidget(const SizedBox());
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );
    await tester.pump();
    expect(platform.disposed, [1]);
    expect(tester.takeException(), isNull);
  });

  testWidgets('an initialization failure offers retry and then recovers', (
    tester,
  ) async {
    platform.initializeImmediately = false;
    await tester.pumpWidget(playerFixture());
    await tester.pump();
    platform.events[1]!.addError(
      PlatformException(
        code: 'test-connection',
        message: 'test connection unavailable',
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Try again'), findsOneWidget);
    platform.initializeImmediately = true;
    await tester.ensureVisible(find.text('Try again'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Try again'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );
    await tester.pumpAndSettle();
    expect(find.byTooltip('Play'), findsOneWidget);
    expect(platform.disposed, [1]);
    await tester.pumpWidget(const SizedBox());
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );
    await tester.pump();
    expect(platform.disposed, [1, 2]);
  });

  testWidgets(
    'tablet fullscreen preserves video shape and session in both orientations',
    (tester) async {
      tester.view.physicalSize = const Size(800, 1120);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(playerFixture());
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Fullscreen'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Fullscreen'));
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 10)),
      );
      await tester.pumpAndSettle();
      final controller = tester
          .widget<VideoPlayer>(find.byType(VideoPlayer).last)
          .controller;
      for (final size in [const Size(800, 1120), const Size(1120, 800)]) {
        tester.view.physicalSize = size;
        await tester.pumpAndSettle();
        final video = tester.getRect(find.byType(VideoPlayer).last);
        expect(video.width / video.height, closeTo(16 / 9, 0.001));
        expect(video.width, greaterThan(700));
        expect(video.left, greaterThanOrEqualTo(0));
        expect(video.right, lessThanOrEqualTo(size.width));
        expect(video.top, greaterThanOrEqualTo(0));
        expect(video.bottom, lessThanOrEqualTo(size.height));
        expect(
          tester.widget<VideoPlayer>(find.byType(VideoPlayer).last).controller,
          same(controller),
        );
        expect(find.text('Fixture caption'), findsOneWidget);
        expect(tester.takeException(), isNull);
      }
      expect(platform.sources.length, 1);
      expect(platform.disposed, isEmpty);
      await tester.pumpWidget(const SizedBox());
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 10)),
      );
      await tester.pump();
      expect(platform.disposed, [1]);
    },
  );

  testWidgets(
    'fullscreen preserves media, captions and position across rotation',
    (tester) async {
      phoneSize(tester);
      await tester.pumpWidget(playerFixture());
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Fullscreen'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Fullscreen'));
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 10)),
      );
      await tester.pumpAndSettle();
      expect(find.byTooltip('Exit fullscreen'), findsOneWidget);
      expect(find.text('Sample playback'), findsOneWidget);
      expect(find.text('Playback preview'), findsNothing);
      expect(platform.sources.length, 1);
      await tester.tap(find.byTooltip('Forward 10 seconds').last);
      await tester.pump();
      expect(platform.seeks.last, const Duration(seconds: 8));
      tester.view.physicalSize = const Size(844, 390);
      await tester.pumpAndSettle();
      final fitted = tester.getRect(find.byType(VideoPlayer).last);
      expect(fitted.height, closeTo(390, 0.01));
      expect(fitted.width / fitted.height, closeTo(16 / 9, 0.001));
      expect(
        tester.getSize(find.byKey(const ValueKey('fullscreen-viewport'))),
        const Size(844, 390),
      );
      final session = tester
          .widget<VideoPlayer>(find.byType(VideoPlayer).last)
          .controller;
      await tester.tap(find.byKey(const ValueKey('fullscreen-fit')));
      await tester.pumpAndSettle();
      final filled = tester.getRect(find.byType(VideoPlayer).last);
      expect(filled.width, closeTo(844, 0.01));
      expect(filled.height, greaterThan(390));
      expect(filled.top, lessThan(0));
      expect(find.text('Fill'), findsOneWidget);
      expect(
        tester.widget<VideoPlayer>(find.byType(VideoPlayer).last).controller,
        same(session),
      );
      await tester.tap(find.byKey(const ValueKey('fullscreen-fit')));
      await tester.pumpAndSettle();
      expect(tester.getRect(find.byType(VideoPlayer).last), fitted);
      expect(platform.sources.length, 1);
      expect(tester.takeException(), isNull);
      await tester.tap(find.byTooltip('Turn captions off'));
      await tester.pump();
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      tester.view.physicalSize = const Size(390, 844);
      await tester.pumpAndSettle();
      expect(find.text('Captions off'), findsOneWidget);
      expect(platform.sources.length, 1);
      expect(platform.disposed, isEmpty);
      await tester.pumpWidget(const SizedBox());
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 10)),
      );
      await tester.pump();
      expect(platform.disposed, [1]);
    },
  );

  testWidgets(
    'leaving during initialization releases media and ignores timeout',
    (tester) async {
      platform.initializeImmediately = false;
      await tester.pumpWidget(playerFixture());
      await tester.pump();
      await tester.pumpWidget(const SizedBox());
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 10)),
      );
      await tester.pump(const Duration(seconds: 21));
      expect(platform.disposed, [1]);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('streaming failure stays on the selected source and retries', (
    tester,
  ) async {
    phoneSize(tester);
    platform.initializeImmediately = false;
    await tester.pumpWidget(playerFixture(sample: PreviewSample.streaming));
    await tester.pump();
    expect(platform.sources.single.uri, PreviewSample.streaming.uri.toString());
    platform.events[1]!.addError(
      PlatformException(
        code: 'unsupported-test-codec',
        message: 'fixture unsupported',
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Try the short clip'), findsOneWidget);
    platform.initializeImmediately = true;
    await tester.ensureVisible(find.text('Try again'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Try again'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );
    await tester.pumpAndSettle();
    expect(platform.sources.last.uri, PreviewSample.streaming.uri.toString());
    expect(platform.sources.length, 2);
    expect(find.byTooltip('Play'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );
    await tester.pump();
    expect(platform.disposed, [1, 2]);
  });
}
