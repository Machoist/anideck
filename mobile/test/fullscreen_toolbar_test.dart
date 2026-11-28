import 'package:anideck_mobile/fullscreen_preview.dart';
import 'package:anideck_mobile/player_preview.dart';
import 'package:anideck_mobile/preview_sample.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:video_player/video_player.dart';
import 'package:video_player_platform_interface/video_player_platform_interface.dart';

import 'player_preview_test.dart' as fixtures;

Finder byKey(String key) => find.byKey(ValueKey(key));
Finder get toolbar => byKey('fullscreen-toolbar');
Finder inToolbar(Finder finder) =>
    find.descendant(of: toolbar, matching: finder);

/// Opens fullscreen through the real PreviewPlayer, then applies [size].
Future<void> openFullscreen(
  WidgetTester tester, {
  Size size = const Size(844, 390),
  double textScale = 1,
}) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  await tester.pumpWidget(
    MaterialApp(
      home: PreviewPlayer(
        sample: PreviewSample.clip,
        controllerFactory: (uri, _) => VideoPlayerController.networkUrl(
          uri,
          closedCaptionFile: Future<ClosedCaptionFile>.value(
            WebVTTCaptionFile(
              'WEBVTT\n\n00:00.000 --> 00:08.000\nFixture caption line',
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
  tester.view.physicalSize = size;
  await tester.pumpAndSettle();
  expect(find.byType(FullscreenPreview), findsOneWidget);
}

Future<void> unmount(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
  await tester.runAsync(
    () => Future<void>.delayed(const Duration(milliseconds: 10)),
  );
  await tester.pump();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => VideoPlayerPlatform.instance = fixtures.TestVideoPlatform());

  testWidgets('header shows only the title; every option is in the toolbar '
      'below the timeline; transport stays central', (tester) async {
    await openFullscreen(tester);
    final title = byKey('fullscreen-title');
    expect(find.text('Sample playback'), findsOneWidget);
    final header = find.ancestor(of: title, matching: find.byType(SafeArea));
    for (final control in [find.byType(IconButton), find.byType(TextButton)]) {
      expect(
        find.descendant(of: header.first, matching: control),
        findsNothing,
        reason: 'no button in the title header',
      );
    }

    // Desktop order, right-aligned: captions, settings, Fit/Fill, exit.
    final options = [
      inToolbar(find.byTooltip('Turn captions off')),
      inToolbar(find.byTooltip('Playback settings')),
      inToolbar(byKey('fullscreen-fit')),
      inToolbar(find.byTooltip('Exit fullscreen')),
    ];
    final seekRow = tester.getRect(byKey('fullscreen-seek-row'));
    double? previousRight;
    for (final option in options) {
      expect(option, findsOneWidget);
      final rect = tester.getRect(option);
      expect(
        rect.top,
        greaterThanOrEqualTo(seekRow.bottom),
        reason: 'options sit below the timeline',
      );
      expect(rect.width, greaterThanOrEqualTo(48));
      expect(rect.height, greaterThanOrEqualTo(48));
      if (previousRight != null) {
        expect(rect.left, greaterThanOrEqualTo(previousRight));
      }
      previousRight = rect.right;
    }
    expect(previousRight, greaterThan(844 - 48), reason: 'right-aligned');
    expect(find.byTooltip('Exit fullscreen'), findsOneWidget);

    // Seek row: elapsed time, scrubbable timeline, total time.
    final times = find.descendant(
      of: byKey('fullscreen-seek-row'),
      matching: find.byType(Text),
    );
    expect(tester.widget<Text>(times.first).data, '0:00');
    expect(tester.widget<Text>(times.last).data, '0:08');

    // Transport stays centred and out of the toolbar.
    for (final tip in ['Back 10 seconds', 'Play', 'Forward 10 seconds']) {
      expect(inToolbar(find.byTooltip(tip)), findsNothing);
    }
    final play = tester.getCenter(find.byTooltip('Play').last);
    expect(play.dx, closeTo(422, 1));
    expect(play.dy, closeTo(195, 1));
    // The title scrim spans the width but never reaches the transport.
    final scrim = tester.getRect(
      find.ancestor(of: title, matching: find.byType(DecoratedBox)).first,
    );
    expect(scrim.width, 844);
    expect(
      scrim.bottom,
      lessThan(tester.getRect(find.byTooltip('Back 10 seconds').last).top),
    );
    expect(tester.getRect(title).left, lessThan(60), reason: 'left-aligned');
    await unmount(tester);
  });

  for (final (name, size, scale) in [
    ('phone portrait', const Size(390, 844), 1.0),
    ('small phone landscape', const Size(640, 320), 1.0),
    ('phone landscape, large text', const Size(844, 390), 1.4),
    ('tablet landscape', const Size(1280, 800), 1.0),
    ('tablet portrait, large text', const Size(800, 1280), 1.4),
  ]) {
    testWidgets('$name: toolbar fits without clipping; captions clear '
        'the controls', (tester) async {
      await openFullscreen(tester, size: size, textScale: scale);
      expect(tester.takeException(), isNull);
      final bar = tester.getRect(toolbar);
      expect(bar.left, greaterThanOrEqualTo(0));
      expect(bar.right, lessThanOrEqualTo(size.width));
      expect(bar.bottom, lessThanOrEqualTo(size.height));
      for (final tip in [
        'Turn captions off',
        'Playback settings',
        'Exit fullscreen',
      ]) {
        final rect = tester.getRect(inToolbar(find.byTooltip(tip)));
        expect(rect.left, greaterThanOrEqualTo(0));
        expect(rect.right, lessThanOrEqualTo(size.width));
        expect(rect.size.shortestSide, greaterThanOrEqualTo(48));
      }
      final caption = tester.getRect(find.text('Fixture caption line').last);
      final seekRow = tester.getRect(byKey('fullscreen-seek-row'));
      expect(
        caption.bottom,
        lessThanOrEqualTo(seekRow.top),
        reason: 'visible controls never cover subtitles',
      );
      await unmount(tester);
    });
  }

  testWidgets('playback settings change speed on the same controller and the '
      'toolbar shows the active speed', (tester) async {
    await openFullscreen(tester);
    final session = tester
        .widget<VideoPlayer>(find.byType(VideoPlayer).last)
        .controller;
    expect(find.text('1.5×'), findsNothing);
    await tester.tap(inToolbar(find.byTooltip('Playback settings')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('1.5×'));
    await tester.pumpAndSettle();
    expect(session.value.playbackSpeed, 1.5);
    await tester.tapAt(const Offset(10, 10)); // dismiss sheet
    await tester.pumpAndSettle();
    expect(inToolbar(find.text('1.5×')), findsOneWidget);
    expect(
      tester.widget<VideoPlayer>(find.byType(VideoPlayer).last).controller,
      same(session),
    );
    await unmount(tester);
  });

  testWidgets('toolbar exit and system Back both leave fullscreen and keep '
      'the caption choice and session', (tester) async {
    await openFullscreen(tester);
    await tester.tap(inToolbar(find.byTooltip('Turn captions off')));
    await tester.pumpAndSettle();
    expect(inToolbar(find.byTooltip('Turn captions on')), findsOneWidget);
    await tester.tap(inToolbar(find.byTooltip('Exit fullscreen')));
    // Let the player's system-UI restore finish before reopening.
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );
    await tester.pumpAndSettle();
    expect(find.byType(FullscreenPreview), findsNothing);
    tester.view.physicalSize = const Size(390, 844);
    await tester.pumpAndSettle();
    expect(find.text('Captions off'), findsOneWidget);

    await tester.ensureVisible(find.text('Fullscreen'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Fullscreen'));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );
    await tester.pumpAndSettle();
    expect(find.byType(FullscreenPreview), findsOneWidget);
    expect(find.byTooltip('Turn captions on'), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.byType(FullscreenPreview), findsNothing);
    await unmount(tester);
  });
}
