import 'dart:convert';

import 'package:anideck_mobile/anilist_page.dart';
import 'package:anideck_mobile/anilist_service.dart';
import 'package:anideck_mobile/main.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';

import 'account_service_test.dart' show MemoryVault;
import 'anilist_service_test.dart'
    show token, viewerResponse, pageResponse, entry;

void main() {
  testWidgets(
    'phone sign-in opens browser, hides token and reads list with half ratings',
    (tester) async {
      tester.view.physicalSize = const Size(320, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final flags = <bool>[];
      var opened = 0;
      final service = AniListService(
        vault: MemoryVault(),
        api: AniListApi(
          client: MockClient(
            (r) async =>
                (jsonDecode(r.body)['query'] as String).contains('Viewer')
                ? viewerResponse()
                : pageResponse([
                    entry(
                      1,
                      title: 'Generated long anime title with a second season and more words',
                    ),
                  ]),
          ),
        ),
      );
      await tester.pumpWidget(
        AniDeckMobile(
          home: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(1.5)),
            child: AniListPageView(
              service: service,
              screenProtection: (b) async {
                flags.add(b);
              },
              openBrowser: () async {
                opened++;
              },
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Open AniList'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open AniList'));
      await tester.pumpAndSettle();
      expect(opened, 1);
      await tester.scrollUntilVisible(
        find.byType(TextField),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), token);
      expect(
        tester.widget<TextField>(find.byType(TextField)).obscureText,
        isTrue,
      );
      await tester.scrollUntilVisible(
        find.text('Connect AniList'),
        100,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Connect AniList'));
      await tester.pumpAndSettle();
      expect(find.text('FixtureTracker'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('6.5 / 10'),
        100,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Episode 4'), findsOneWidget);
      expect(find.text('Watching'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
      expect(flags, [true, false]);
    },
  );
  testWidgets('privacy failure never offers token entry', (tester) async {
    await tester.pumpWidget(
      AniDeckMobile(
        home: AniListPageView(
          service: AniListService(vault: MemoryVault()),
          screenProtection: (b) async {
            if (b) throw Exception('generated');
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(TextField), findsNothing);
    expect(
      find.textContaining('Sign-in privacy could not start'),
      findsOneWidget,
    );
    await tester.pumpWidget(const SizedBox());
  });
}
