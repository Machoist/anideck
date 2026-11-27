import 'package:anideck_mobile/library_page.dart';
import 'package:anideck_mobile/local_library.dart';
import 'package:anideck_mobile/providers/anikoto_catalog.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  sqfliteFfiInit();
  testWidgets(
    'local list loads and refreshes without returning a Future from setState',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final library = LocalLibrary(
        open: () => databaseFactoryFfiNoIsolate.openDatabase(
          inMemoryDatabasePath,
          options: OpenDatabaseOptions(
            version: LocalLibrary.schemaVersion,
            onCreate: LocalLibrary.createSchema,
            onUpgrade: LocalLibrary.upgradeSchema,
          ),
        ),
      );
      final title = ProviderTitle(
        Uri.parse('https://anikototv.bz/watch/generated-widget-title'),
        'A saved show',
      );
      await tester.runAsync(() async {
        await library.save(title);
        await library.checkpoint(
          title,
          const ResumePoint(
            2,
            'dub',
            Duration(seconds: 137),
            Duration(minutes: 24),
          ),
        );
      });
      await tester.pumpWidget(MaterialApp(home: LibraryPage(library: library)));
      for (
        var i = 0;
        i < 30 && find.text('A saved show').evaluate().isEmpty;
        i++
      ) {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 10)),
        );
        await tester.pump();
      }
      expect(find.text('A saved show'), findsOneWidget);
      expect(find.text('Resume episode 2'), findsOneWidget);
      expect(find.text('Dubbed • 2:17'), findsOneWidget);
      await tester.tap(find.byTooltip('Refresh local list'));
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 30)),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('A saved show'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await tester.runAsync(library.close);
    },
  );
}
