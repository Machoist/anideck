import 'package:anideck_mobile/player_chrome.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:video_player/video_player.dart';
import 'package:video_player_platform_interface/video_player_platform_interface.dart';

import 'player_preview_test.dart' as fixtures;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('timeline formats long episodes without ambiguous minute counts', () {
    expect(playerTime(const Duration(seconds: 7)), '0:07');
    expect(
      playerTime(const Duration(hours: 1, minutes: 2, seconds: 3)),
      '1:02:03',
    );
  });

  testWidgets('speed sheet changes the existing session and retains position', (
    tester,
  ) async {
    final platform = fixtures.TestVideoPlatform();
    VideoPlayerPlatform.instance = platform;
    final controller = VideoPlayerController.networkUrl(
      Uri.parse('https://example.test/fixture.mp4'),
    );
    await tester.runAsync(() async {
      await controller.initialize();
      await controller.seekTo(const Duration(seconds: 3));
    });
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => showPlayerOptions(context, controller),
              child: const Text('Options'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Options'));
    await tester.pumpAndSettle();
    expect(find.text('Playback settings'), findsOneWidget);
    await tester.tap(find.text('1.5×'));
    await tester.pumpAndSettle();
    expect(controller.value.playbackSpeed, 1.5);
    expect(controller.value.position, const Duration(seconds: 3));
    expect(platform.sources.length, 1);
    await tester.tap(find.text('Normal'));
    await tester.pumpAndSettle();
    expect(controller.value.playbackSpeed, 1);
    await tester.pumpWidget(const SizedBox());
    await tester.runAsync(controller.dispose);
  });
}
