import 'dart:convert';

import 'package:anideck_mobile/main.dart';
import 'package:anideck_mobile/mobile_home.dart';
import 'package:anideck_mobile/local_library.dart';
import 'package:anideck_mobile/providers/anikoto_catalog.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('spotlight retains order and exact identity but uses its actual card poster', () async {
    final catalog = AnikotoCatalog(
      client: MockClient(
        (_) async => http.Response('''
      <div class="swiper-slide"><h2 class="ak-title">Season two</h2><img src="https://art.test/wide.jpg"><a href="/watch/season-two">Watch now</a></div>
      <div class="swiper-slide"><h2 class="ak-title">Other</h2><img src="https://art.test/other-wide.jpg"><a href="/watch/other">Watch now</a></div>
      <div class="ani items">
        <div class="item"><img src="https://art.test/wrong-season.jpg"><a class="name" href="/watch/season-one">Season one</a></div>
        <div class="item"><img src="https://art.test/portrait.jpg"><a class="name" href="/watch/season-two/ep-2">Season two</a></div>
      </div>''', 200),
      ),
    );
    addTearDown(catalog.close);
    final titles = await catalog.discover();
    expect(titles.map((title) => title.uri.path), [
      '/watch/season-two',
      '/watch/other',
      '/watch/season-one',
    ]);
    expect(titles.first.poster.toString(), 'https://art.test/portrait.jpg');
    expect(titles[1].poster.toString(), 'https://art.test/other-wide.jpg');
  });

  test('home feed uses named source cards, exact identities, artwork and excludes marked adult cards', () async {
    final catalog = AnikotoCatalog(
      client: MockClient(
        (request) async => http.Response('''
      <div class="swiper-slide"><h2 class="ak-title">First show</h2><img src="https://art.test/first.jpg"><a href="/watch/first">Watch now</a></div>
      <div class="ani items"><div class="item"><img src="https://art.test/second.jpg"><a class="name" href="/watch/second/ep-3">Second show</a></div>
      <div class="item"><span class="adult"></span><a class="name" href="/watch/hidden">Marked adult</a></div>
      <div class="item"><a class="name" href="/watch/first/ep-2">First show</a></div></div>
    ''', 200),
      ),
    );
    final titles = await catalog.discover();
    expect(titles.map((t) => t.name), ['First show', 'Second show']);
    expect(titles.last.uri.path, '/watch/second');
    expect(titles.last.poster.toString(), 'https://art.test/second.jpg');
    catalog.close();
  });

  test('details and episodes share one validated source page; explicit retry refreshes it', () async {
    var pageReads = 0;
    final catalog = AnikotoCatalog(
      client: MockClient((request) async {
        if (request.url.path == '/watch/generated') {
          pageReads++;
          return http.Response('''<div class="watch-wrap" data-id="42" data-url="https://anikototv.bz/watch/generated"></div>
          <div id="w-info"><h1>Generated title</h1><div class="poster"><img src="https://art.test/poster.jpg"></div>
          <div class="synopsis"><div class="content">An actual <b>description</b>.</div></div>
          <div class="bmeta"><div class="meta"><div>Type: <span>TV</span></div><div>Duration: <span>? min</span></div></div></div>
          <a href="/genre/action">Action</a></div>''', 200);
        }
        return http.Response(
          jsonEncode({
            'status': 200,
            'result': '<a data-num="3" data-id="103" data-ids="opaque" data-sub="1" data-dub="0"></a>',
          }),
          200,
        );
      }),
    );
    final title = ProviderTitle(
      Uri.parse('https://anikototv.bz/watch/generated'),
      'Selected title',
    );
    final result = await Future.wait<Object>([
      catalog.details(title),
      catalog.episodes(title),
    ]);
    final details = result.first as ProviderDetails;
    expect(pageReads, 1);
    expect(details.synopsis, 'An actual description.');
    expect(details.genres, ['Action']);
    expect(details.facts, {'Type': 'TV'});
    expect((result.last as List<ProviderEpisode>).single.number, 3);
    catalog.refreshTitle(title);
    await catalog.details(title);
    expect(pageReads, 2);
    catalog.close();
  });

  testWidgets(
    'feed failure preserves Continue watching and tab returns do not refetch the feed',
    (tester) async {
      var feedReads = 0;
      final title = ProviderTitle(
        Uri.parse('https://anikototv.bz/watch/generated'),
        'Saved continuation',
      );
      await tester.pumpWidget(
        AniDeckMobile(
          home: PreviewHome(
            loadFeed: () async {
              feedReads++;
              throw const ProviderFailure('Generated feed failure');
            },
            loadLibrary: () async => [
              LibraryEntry(
                title,
                const ResumePoint(
                  3,
                  'sub',
                  Duration(seconds: 123),
                  Duration(minutes: 24),
                ),
              ),
            ],
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Saved continuation'),
        200,
        scrollable: find
            .descendant(
              of: find.byType(HomeDashboard),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      await tester.pumpAndSettle();
      expect(find.text('Saved continuation'), findsOneWidget);
      // User-facing section wording, not the provider's name.
      final feedHeading = find.text('Discover anime', skipOffstage: false);
      expect(feedHeading, findsOneWidget);
      expect(find.text('Explore Anikoto', skipOffstage: false), findsNothing);
      await tester.tap(find.widgetWithText(NavigationDestination, 'Search'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(NavigationDestination, 'Home'));
      await tester.pumpAndSettle();
      expect(feedReads, 1);
      expect(find.text('Saved continuation'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('real feed-card layout contains enlarged text at phone width', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final title = ProviderTitle(
      Uri.parse('https://anikototv.bz/watch/generated'),
      'A longer generated title and its second season',
    );
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(1.5)),
        child: AniDeckMobile(
          home: PreviewHome(
            loadFeed: () async => [title],
            loadLibrary: () async => [],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text(title.name),
      240,
      scrollable: find
          .descendant(
            of: find.byType(HomeDashboard),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(find.text(title.name), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
