import 'dart:convert';

import 'package:anideck_mobile/local_library.dart';
import 'package:anideck_mobile/provider_browser.dart';
import 'package:anideck_mobile/providers/anikoto_catalog.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  sqfliteFfiInit();
  testWidgets(
    'long source lists render 50 actual entries per page and retain episode gaps',
    (tester) async {
      final title = ProviderTitle(
        Uri.parse('https://anikototv.bz/watch/generated'),
        'Generated long title',
      );
      final library = LocalLibrary(
        open: () => databaseFactoryFfiNoIsolate.openDatabase(
          inMemoryDatabasePath,
          options: OpenDatabaseOptions(
            version: LocalLibrary.schemaVersion,
            onCreate: LocalLibrary.createSchema,
          ),
        ),
      );
      final catalog = AnikotoCatalog(
        client: MockClient((request) async {
          if (request.url.path == '/watch/generated') {
            return http.Response(
              '<div class="watch-wrap" data-id="42" data-url="${title.uri}"></div>',
              200,
            );
          }
          return http.Response(
            jsonEncode({
              'status': 200,
              'result': [
                for (var i = 1; i <= 101; i++)
                  if (i != 2)
                    '<a data-num="$i" data-id="${1000 + i}" data-ids="opaque" data-sub="1" data-dub="0"></a>',
              ].join(),
            }),
            200,
          );
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: ProviderEpisodes(
            title: title,
            library: library,
            catalog: catalog,
          ),
        ),
      );
      for (
        var i = 0;
        i < 30 && find.text('100 listed episodes').evaluate().isEmpty;
        i++
      ) {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 10)),
        );
        await tester.pump();
      }
      expect(find.text('100 listed episodes'), findsOneWidget);
      expect(find.text('1–51'), findsOneWidget);
      expect(find.text('Episode 2 • Subtitled'), findsNothing);
      await tester.ensureVisible(find.byTooltip('Next episodes'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Next episodes'));
      await tester.pumpAndSettle();
      expect(find.text('52–101'), findsOneWidget);
      await tester.ensureVisible(find.text('Episode 52 • Subtitled'));
      expect(find.text('Episode 52 • Subtitled'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      await tester.runAsync(library.close);
    },
  );
}
