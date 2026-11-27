import 'package:anideck_mobile/anilist_editor.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'anilist_edit_test.dart' show TrackerFixture;

Future<void> openEditor(WidgetTester tester, TrackerFixture f) async {
  await tester.pumpWidget(
    MaterialApp(
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context)
            .copyWith(textScaler: const TextScaler.linear(1.5)),
        child: child!,
      ),
      home: Builder(
        builder: (context) => Scaffold(
          body: FilledButton(
            onPressed: () =>
                editAniListEntry(context, f.service, f.service.entries.single),
            child: const Text('Open editor'),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('Open editor'));
  await tester.pumpAndSettle();
}

Future<void> reveal(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'narrow enlarged editor saves reviewed status, count and half score with readback',
    (tester) async {
      tester.view.physicalSize = const Size(320, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final f = TrackerFixture();
      await f.start();
      await openEditor(tester, f);
      await reveal(tester, find.text('Planning'));
      await tester.tap(find.text('Planning'));
      await tester.pumpAndSettle();
      await reveal(tester, find.byType(TextField));
      await tester.enterText(find.byType(TextField), '12');
      await reveal(tester, find.byTooltip('Increase score by 0.5'));
      await tester.tap(find.byTooltip('Increase score by 0.5'));
      await tester.pumpAndSettle();
      expect(find.text('7.5'), findsOneWidget);
      await reveal(tester, find.text('Save to AniList'));
      await tester.tap(find.text('Save to AniList'));
      await tester.pumpAndSettle();
      expect(f.writes, 1);
      expect(f.status, 'PLANNING');
      expect(f.progress, 12);
      expect(f.score, 7.5);
      expect(find.text('YOUR ANILIST'), findsNothing);
      expect(tester.takeException(), isNull);
      f.service.close();
    },
  );
  testWidgets(
    'cancel never writes, uncertain save keeps editor open and blocks resubmission',
    (tester) async {
      final f = TrackerFixture();
      await f.start();
      await openEditor(tester, f);
      await reveal(tester, find.byType(TextField));
      await tester.enterText(find.byType(TextField), '5');
      await reveal(tester, find.text('Cancel'));
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(f.writes, 0);
      await tester.tap(find.text('Open editor'));
      await tester.pumpAndSettle();
      await reveal(tester, find.byType(TextField));
      await tester.enterText(find.byType(TextField), '5');
      f.loseResponse = true;
      await reveal(tester, find.text('Save to AniList'));
      await tester.tap(find.text('Save to AniList'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('result could not be confirmed'),
        findsOneWidget,
      );
      final save = find.widgetWithText(FilledButton, 'Save to AniList');
      expect(tester.widget<FilledButton>(save).onPressed, isNull);
      expect(f.writes, 1);
      expect(find.text('Close editor'), findsOneWidget);
      await reveal(tester, find.text('Close editor'));
      await tester.tap(find.text('Close editor'));
      await tester.pumpAndSettle();
      f.service.close();
    },
  );
}
