import 'dart:async';
import 'dart:convert';

import 'package:anideck_mobile/anilist_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'account_service_test.dart' show MemoryVault;

final token = 'generated_token_${'x' * 32}';
http.Response viewerResponse() => http.Response(
  jsonEncode({
    'data': {
      'Viewer': {'id': 123, 'name': 'FixtureTracker'},
    },
  }),
  200,
  headers: {'content-type': 'application/json; charset=utf-8'},
);
Map<String, dynamic> entry(
  int id, {
  String title = 'Generated anime',
  double score = 6.5,
}) => {
  'id': id,
  'status': 'CURRENT',
  'progress': 4,
  'score': score,
  'media': {
    'id': id + 1000,
    'title': {'userPreferred': title},
    'coverImage': {'large': null},
  },
};
http.Response pageResponse(
  List<Map<String, dynamic>> entries, {
  bool more = false,
}) => http.Response(
  jsonEncode({
    'data': {
      'Page': {
        'pageInfo': {'hasNextPage': more},
        'mediaList': entries,
      },
    },
  }),
  200,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

void main() {
  test('fixed origin, header-only token, queries only and verified durable sign-in', () async {
    final vault = MemoryVault();
    var reads = 0;
    final service = AniListService(
      vault: vault,
      api: AniListApi(
        client: MockClient((request) async {
          reads++;
          expect(request.url.toString(), 'https://graphql.anilist.co');
          expect(request.url.query, isEmpty);
          expect(request.headers['Authorization'], 'Bearer $token');
          expect(request.followRedirects, isFalse);
          final body = jsonDecode(request.body);
          expect(body['query'], startsWith('query'));
          expect(request.body, isNot(contains(token)));
          if ((body['query'] as String).contains('Viewer')) {
            expect(vault.value, isNull);
            return viewerResponse();
          }
          expect(body['variables'], {'user': 123, 'page': 1});
          return pageResponse([entry(1, title: '進撃の巨人 — Season 2')]);
        }),
      ),
    );
    await expectLater(
      service.signIn('password'),
      throwsA(isA<AniListFailure>()),
    );
    expect(reads, 0);
    await service.signIn(' $token ');
    expect(vault.value, token);
    expect(service.viewer!.id, 123);
    await service.load();
    expect(service.entries.single.mediaId, 1001);
    expect(service.entries.single.title, '進撃の巨人 — Season 2');
    expect(service.entries.single.score, 6.5);
    expect(service.entries.single.progress, 4);
    expect(AniListApi.authorization.queryParameters, {
      'client_id': '54547',
      'response_type': 'token',
    });
    service.close();
  });
  test(
    'invalid viewer and storage write failure never claim a connection',
    () async {
      final vault = MemoryVault();
      var valid = false;
      final service = AniListService(
        vault: vault,
        api: AniListApi(
          client: MockClient(
            (_) async => valid
                ? viewerResponse()
                : http.Response('{"data":{"Viewer":null}}', 200),
          ),
        ),
      );
      await expectLater(service.signIn(token), throwsA(isA<AniListFailure>()));
      expect(vault.value, isNull);
      expect(service.viewer, isNull);
      valid = true;
      vault.failWrite = true;
      await expectLater(service.signIn(token), throwsA(isA<AniListFailure>()));
      expect(service.viewer, isNull);
      expect(service.hasSavedToken, isFalse);
      service.close();
    },
  );
  test('pagination deduplicates IDs, preserves half scores and failed pages retry without losing rows', () async {
    var fail = true;
    final pages = <int>[];
    final vault = MemoryVault()..value = token;
    final service = AniListService(
      vault: vault,
      api: AniListApi(
        client: MockClient((request) async {
          final body = jsonDecode(request.body);
          if ((body['query'] as String).contains('Viewer')) {
            return viewerResponse();
          }
          final page = body['variables']['page'] as int;
          pages.add(page);
          if (page == 1) return pageResponse([entry(1), entry(2)], more: true);
          if (fail) return http.Response('generated unavailable', 503);
          return pageResponse([entry(2), entry(3)]);
        }),
      ),
    );
    await service.restore();
    await service.load();
    await expectLater(service.load(), throwsA(isA<AniListFailure>()));
    expect(service.entries.map((e) => e.id), [1, 2]);
    expect(service.hasMore, isTrue);
    fail = false;
    await service.load();
    await service.load();
    expect(pages, [1, 2, 2]);
    expect(service.entries.map((e) => e.id), [1, 2, 3]);
    expect(service.hasMore, isFalse);
    service.close();
  });
  test(
    'rate limit blocks repeated reads locally and resumes after cooldown',
    () async {
      var now = DateTime.utc(2026);
      var reads = 0;
      final api = AniListApi(
        now: () => now,
        client: MockClient((_) async {
          reads++;
          return http.Response('', 429, headers: {'retry-after': '120'});
        }),
      );
      await expectLater(api.viewer(token), throwsA(isA<AniListFailure>()));
      await expectLater(api.viewer(token), throwsA(isA<AniListFailure>()));
      expect(reads, 1);
      now = now.add(const Duration(seconds: 121));
      await expectLater(api.viewer(token), throwsA(isA<AniListFailure>()));
      expect(reads, 2);
      api.close();
    },
  );
  test('offline and auth errors keep secure connection, refuse switching and local disconnect is exact', () async {
    final vault = MemoryVault()..value = token;
    var reads = 0;
    final service = AniListService(
      vault: vault,
      api: AniListApi(
        client: MockClient((_) async {
          reads++;
          return http.Response(token, 401);
        }),
      ),
    );
    try {
      await service.restore();
      fail('expected failure');
    } catch (e) {
      expect(e.toString(), isNot(contains(token)));
    }
    expect(vault.value, token);
    expect(service.hasSavedToken, isTrue);
    await expectLater(service.signIn(token), throwsA(isA<AniListFailure>()));
    expect(reads, 1);
    vault.failDelete = true;
    await expectLater(service.signOut(), throwsA(isA<AniListFailure>()));
    expect(vault.value, token);
    vault.failDelete = false;
    await service.signOut();
    expect(vault.value, isNull);
    expect(reads, 1);
    service.close();
  });
  test('malformed pages fail instead of silently dropping entries or exposing external covers', () async {
    var row = entry(1);
    row['progress'] = -1;
    final api = AniListApi(
      client: MockClient((_) async => pageResponse([row])),
    );
    await expectLater(api.list(token, 123, 1), throwsA(isA<AniListFailure>()));
    row = entry(1);
    (row['media'] as Map)['coverImage'] = {
      'large': 'https://example.com/track',
    };
    expect((await api.list(token, 123, 1)).entries.single.cover, isNull);
    row = entry(1);
    row['status'] = 'UNKNOWN';
    await expectLater(api.list(token, 123, 1), throwsA(isA<AniListFailure>()));
    api.close();
  });
  test('closing pending verification prevents storing token, overlapping operations refused', () async {
    final wait = Completer<http.Response>();
    final vault = MemoryVault();
    final service = AniListService(
      vault: vault,
      api: AniListApi(client: MockClient((_) => wait.future)),
    );
    final first = service.signIn(token);
    final rejected = expectLater(first, throwsA(isA<AniListFailure>()));
    await Future<void>.delayed(Duration.zero);
    await expectLater(service.signIn(token), throwsA(isA<AniListFailure>()));
    service.close();
    wait.complete(viewerResponse());
    await rejected;
    expect(vault.value, isNull);
    expect(service.viewer, isNull);
  });
  test(
    'GraphQL error text is sanitized, failed refresh keeps successful rows',
    () async {
      var failRead = false;
      final service = AniListService(
        vault: MemoryVault()..value = token,
        api: AniListApi(
          client: MockClient((r) async {
            if ((jsonDecode(r.body)['query'] as String).contains('Viewer')) {
              return viewerResponse();
            }
            return failRead
                ? http.Response(
                    jsonEncode({
                      'errors': [
                        {'message': token},
                      ],
                    }),
                    200,
                  )
                : pageResponse([entry(1)]);
          }),
        ),
      );
      await service.restore();
      await service.load();
      failRead = true;
      try {
        await service.load(refresh: true);
        fail('expected failure');
      } catch (e) {
        expect(e.toString(), isNot(contains(token)));
      }
      expect(service.entries.single.id, 1);
      service.close();
    },
  );
}
