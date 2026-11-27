import 'package:anideck_mobile/main.dart';
import 'package:anideck_mobile/provider_browser.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:material_ui/material_ui.dart';

Future<void> waitFor(
  WidgetTester tester,
  Finder finder, {
  bool scrollHome = false,
}) async {
  final deadline = DateTime.now().add(const Duration(seconds: 30));
  while (finder.evaluate().isEmpty && DateTime.now().isBefore(deadline)) {
    if (scrollHome) {
      await tester.drag(find.byType(ListView).first, const Offset(0, -180));
    }
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 100)),
    );
    await tester.pump(const Duration(milliseconds: 100));
  }
  expect(
    finder,
    findsWidgets,
    reason: tester.allWidgets
        .whereType<Text>()
        .map((t) => t.data ?? '')
        .join(' | '),
  );
}

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  const capture = bool.fromEnvironment('CAPTURE_SCREENSHOTS');
  testWidgets(
    'public Home feed, source title details, return retention and Search navigation work',
    (tester) async {
      await tester.pumpWidget(const AniDeckMobile());
      final card = find.byKey(const ValueKey('home-feed-0'));
      await waitFor(tester, card, scrollHome: true);
      await tester.ensureVisible(card);
      await tester.pumpAndSettle();
      if (capture) {
        await binding.convertFlutterSurfaceToImage();
        await tester.pump();
        final homeScroll = tester.state<ScrollableState>(
          find
              .descendant(
                of: find.byType(ListView).first,
                matching: find.byType(Scrollable),
              )
              .first,
        );
        homeScroll.position.jumpTo(0);
        await tester.pumpAndSettle();
        await binding.takeScreenshot('provider-homehero');
        await waitFor(tester, card, scrollHome: true);
        await tester.ensureVisible(card);
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(seconds: 2)),
        );
        await tester.pumpAndSettle();
        await binding.takeScreenshot('provider-home');
      }
      await tester.tap(card);
      await waitFor(tester, find.text('About'));
      await tester.pumpAndSettle();
      expect(find.byType(ProviderEpisodes), findsOneWidget);
      expect(find.text('Save to My list'), findsOneWidget);
      if (capture) await binding.takeScreenshot('provider-details');
      await tester.pageBack();
      await waitFor(tester, card);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(NavigationDestination, 'Search'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(TextField, 'Search anime'), findsOneWidget);
      await tester.tap(find.widgetWithText(NavigationDestination, 'Home'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(card);
      expect(card, findsOneWidget);
      // ignore: avoid_print
      print(
        'HOME_NATIVE live_feed=pass source_details=pass return_retention=pass navigation=pass',
      );
      await tester.pumpWidget(const SizedBox());
    },
  );
}
