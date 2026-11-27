import 'package:anideck_mobile/anilist_page.dart';
import 'package:anideck_mobile/main.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:material_ui/material_ui.dart';

import '../test/anilist_edit_test.dart' show TrackerFixture;

// Isolated native emulator, generated tracker API only; no real-account writes.
void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  const capture = bool.fromEnvironment('CAPTURE_SCREENSHOTS');
  testWidgets(
    'native AniList editor saves changed fields and verifies readback',
    (tester) async {
      final f = TrackerFixture();
      await f.start();
      await tester.pumpWidget(
        AniDeckMobile(home: AniListPageView(service: f.service)),
      );
      Future<void> wait(Finder target) async {
        for (var i = 0; i < 100 && target.evaluate().isEmpty; i++) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 100)),
          );
          await tester.pump(const Duration(milliseconds: 100));
        }
        expect(target, findsOneWidget);
      }

      await wait(find.byTooltip('Edit Generated edit title on AniList'));
      await tester.ensureVisible(
        find.byTooltip('Edit Generated edit title on AniList'),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Edit Generated edit title on AniList'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Planning'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Planning'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byTooltip('Increase episodes watched'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Increase episodes watched'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byTooltip('Increase score by 0.5'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Increase score by 0.5'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Save to AniList'));
      await tester.pumpAndSettle();
      if (capture) {
        await binding.convertFlutterSurfaceToImage();
        await tester.pump();
        await binding.takeScreenshot('provider-editor');
      }
      await tester.tap(find.text('Save to AniList'));
      await wait(find.text('Saved and verified on AniList.'));
      expect(f.writes, 1);
      expect(f.progress, 5);
      expect(f.score, 7.5);
      expect(f.status, 'PLANNING');
      expect(f.service.entries.single.score, 7.5);
      expect(f.service.requiresRefresh, isFalse);
      await tester.pumpAndSettle();
      if (capture) {
        await binding.takeScreenshot('provider-edited');
      }
      await tester.pumpWidget(const AniDeckMobile());
      await tester.pump(const Duration(milliseconds: 500));
      expect(
        mobileDiagnosticsEnabled,
        isFalse,
        reason: 'Run this test with ANIDECK_DIAGNOSTICS=false',
      );
      expect(find.byTooltip('More'), findsNothing);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
      // ignore: avoid_print
      print(
        'ANILIST_EDIT_NATIVE generated_save=pass score=7.5 progress=5 status=PLANNING readback=pass diagnostics_hidden=pass',
      );
    },
  );
}
