import 'package:anideck_mobile/library_editor.dart';
import 'package:anideck_mobile/local_library.dart';
import 'package:anideck_mobile/providers/anikoto_catalog.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

Future<void> settleStorage(WidgetTester tester) async {
  await tester.runAsync(
    () => Future<void>.delayed(const Duration(milliseconds: 50)),
  );
  await tester.pumpAndSettle();
}

void main() {
  sqfliteFfiInit();
  final title = ProviderTitle(
    Uri.parse('https://anikototv.bz/watch/generated-editor-fixture'),
    'A saved show',
  );
  testWidgets(
    'half-step editing supports cancel/save at narrow widths and enlarged text',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      tester.view.padding = const FakeViewPadding(bottom: 48);
      tester.view.viewPadding = const FakeViewPadding(bottom: 48);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPadding);
      addTearDown(tester.view.resetViewPadding);
      final library = LocalLibrary(
        open: () => databaseFactoryFfiNoIsolate.openDatabase(
          inMemoryDatabasePath,
          options: OpenDatabaseOptions(
            version: LocalLibrary.schemaVersion,
            onCreate: LocalLibrary.createSchema,
          ),
        ),
      );
      late LibraryEntry entry;
      await tester.runAsync(() async {
        await library.save(title);
        await library.updateDetails(
          title,
          status: WatchStatus.planning,
          watched: 2,
          scoreHalf: 12,
        );
        entry = (await library.entries()).single;
      });
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: TextScaler.linear(1.5)),
            child: child!,
          ),
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => editLibraryEntry(context, library, entry),
                child: const Text('Edit fixture'),
              ),
            ),
          ),
        ),
      );
      for (final save in [false, true]) {
        await tester.tap(find.text('Edit fixture'));
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(ChoiceChip, 'Watching'));
        await tester.ensureVisible(find.byType(TextField));
        await tester.enterText(find.byType(TextField), '3');
        await tester.ensureVisible(find.byTooltip('Increase score by 0.5'));
        await tester.pumpAndSettle();
        await tester.tap(find.byTooltip('Increase score by 0.5'));
        await tester.pump();
        expect(find.text('6.5'), findsOneWidget);
        final action = find.text(save ? 'Save changes' : 'Cancel');
        await tester.ensureVisible(action);
        await tester.pumpAndSettle();
        if (save) {
          expect(
            tester
                .getRect(find.widgetWithText(FilledButton, 'Save changes'))
                .bottom,
            lessThanOrEqualTo(844 - 48),
          );
        }
        await tester.tap(action);
        await settleStorage(tester);
        expect(find.byType(LibraryEditor), findsNothing);
        final persisted = await tester.runAsync(
          () async => (await library.entries()).single,
        );
        expect(persisted!.scoreHalf, save ? 13 : 12);
        expect(persisted.watched, save ? 3 : 2);
        expect(
          persisted.status,
          save ? WatchStatus.watching : WatchStatus.planning,
        );
        expect(tester.takeException(), isNull);
      }
      await tester.pumpWidget(const SizedBox());
      await tester.runAsync(library.close);
    },
  );

  testWidgets('failed storage keeps editor open with an honest retry state', (
    tester,
  ) async {
    final library = LocalLibrary(
      open: () async => throw StateError('Generated storage failure'),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: LibraryEditor(
            library: library,
            entry: LibraryEntry(title, null),
          ),
        ),
      ),
    );
    await tester.ensureVisible(find.text('Save changes'));
    await tester.tap(find.text('Save changes'));
    await settleStorage(tester);
    expect(find.byType(LibraryEditor), findsOneWidget);
    expect(find.textContaining('Couldn’t save your changes.'), findsOneWidget);
    expect(find.text('Save changes'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
