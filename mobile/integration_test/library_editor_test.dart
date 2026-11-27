import 'package:anideck_mobile/library_page.dart';
import 'package:anideck_mobile/local_library.dart';
import 'package:anideck_mobile/main.dart';
import 'package:anideck_mobile/providers/anikoto_catalog.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:path/path.dart' as path;
import 'package:sqflite/sqflite.dart';

Future<void> waitFor(WidgetTester tester, Finder finder) async {
  final deadline = DateTime.now().add(const Duration(seconds: 15));
  while (finder.evaluate().isEmpty && DateTime.now().isBefore(deadline)) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 100)),
    );
    await tester.pump(const Duration(milliseconds: 100));
  }
  expect(finder, findsWidgets);
}

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  const capture = bool.fromEnvironment('CAPTURE_SCREENSHOTS');
  testWidgets(
    'native My list status, episode count and half-step score persist independently of resume',
    (tester) async {
      Future<Database> open() async => openDatabase(
        path.join(await getDatabasesPath(), 'anideck-editor-acceptance.db'),
        version: LocalLibrary.schemaVersion,
        onCreate: LocalLibrary.createSchema,
        onUpgrade: LocalLibrary.upgradeSchema,
      );
      final library = LocalLibrary(open: open);
      final title = ProviderTitle(
        Uri.parse('https://anikototv.bz/watch/generated-editor-fixture'),
        'Generated editor acceptance',
      );
      await tester.runAsync(() async {
        await library.save(title);
        await library.updateDetails(
          title,
          status: WatchStatus.planning,
          watched: 2,
          scoreHalf: 12,
        );
        await library.checkpoint(
          title,
          const ResumePoint(
            1,
            'sub',
            Duration(seconds: 123),
            Duration(minutes: 24),
          ),
        );
      });
      await tester.pumpWidget(
        const AniDeckMobile(
          home: Scaffold(body: Text('Generated navigation fixture')),
        ),
      );
      tester
          .state<NavigatorState>(find.byType(Navigator))
          .push(
            MaterialPageRoute<void>(
              builder: (_) => LibraryPage(library: library),
            ),
          );
      await waitFor(tester, find.byTooltip('Edit Generated editor acceptance'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Edit Generated editor acceptance'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(ChoiceChip, 'Watching'));
      await tester.ensureVisible(find.byType(TextField));
      await tester.enterText(find.byType(TextField), '3');
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.ensureVisible(find.byTooltip('Increase score by 0.5'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Increase score by 0.5'));
      await tester.pump();
      expect(find.text('6.5'), findsOneWidget);
      await tester.ensureVisible(find.text('Save changes'));
      await tester.pumpAndSettle();
      if (capture) {
        await binding.convertFlutterSurfaceToImage();
        await tester.pump();
        await binding.takeScreenshot('provider-editor');
      }
      await tester.tap(find.text('Save changes'));
      await waitFor(tester, find.text('3 watched'));
      await tester.pumpAndSettle();
      expect(find.text('Watching'), findsOneWidget);
      expect(find.text('★ 6.5'), findsOneWidget);
      expect(find.text('Resume episode 1'), findsOneWidget);
      expect(find.text('Subtitled • 2:03'), findsOneWidget);
      if (capture) await binding.takeScreenshot('provider-editedlist');
      await tester.pumpWidget(const SizedBox());
      await tester.runAsync(() async {
        await library.close();
        final reopened = LocalLibrary(open: open);
        final entry = (await reopened.entries()).single;
        expect(entry.status, WatchStatus.watching);
        expect(entry.watched, 3);
        expect(entry.scoreHalf, 13);
        expect(entry.resume!.position.inSeconds, 123);
        await reopened.close();
        // ignore: avoid_print
        print(
          'EDITOR_NATIVE status=watching watched=3 score=6.5 resume=123 reopen=pass',
        );
      });
    },
  );
}
