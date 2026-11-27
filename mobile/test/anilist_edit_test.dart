import 'dart:convert';

import 'package:anideck_mobile/anilist_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'account_service_test.dart' show MemoryVault;
import 'anilist_service_test.dart' show token;

class TrackerFixture {
  final vault = MemoryVault()..value = token;
  String status = 'CURRENT';
  int progress = 4;
  double score = 7;
  int account = 123, owner = 123, media = 1001, writes = 0;
  bool loseResponse = false, failReadback = false;
  final requests = <Map<String, dynamic>>[];
  late final service = AniListService(
    vault: vault,
    api: AniListApi(
      client: MockClient((request) async {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        requests.add(body);
        final query = body['query'] as String;
        final vars = body['variables'] as Map<String, dynamic>;
        dynamic data;
        if (query.contains('Viewer')) {
          data = {
            'Viewer': {'id': account, 'name': 'EditFixture'},
          };
        } else if (query.contains('SaveMediaListEntry')) {
          writes++;
          status = vars['status'] as String? ?? status;
          progress = vars['progress'] as int? ?? progress;
          score = vars.containsKey('scoreRaw')
              ? (vars['scoreRaw'] as num) / 10
              : score;
          if (loseResponse) return http.Response('generated failure', 503);
          data = {
            'SaveMediaListEntry': {'id': 1},
          };
        } else if (query.contains('MediaList(id:')) {
          if (failReadback && writes > 0) return http.Response('', 503);
          data = {
            'MediaList': {
              'id': 1,
              'userId': owner,
              'mediaId': media,
              'status': status,
              'progress': progress,
              'score': score,
            },
          };
        } else {
          data = {
            'Page': {
              'pageInfo': {'hasNextPage': false},
              'mediaList': [
                {
                  'id': 1,
                  'status': status,
                  'progress': progress,
                  'score': score,
                  'media': {
                    'id': 1001,
                    'title': {'userPreferred': 'Generated edit title'},
                    'coverImage': {'large': null},
                  },
                },
              ],
            },
          };
        }
        return http.Response(
          jsonEncode({'data': data}),
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    ),
  );
  Future<void> start() async {
    await service.restore();
    await service.load();
  }

  AniListEdit draft({String? status, int? progress, double? score}) {
    final row = service.entries.single;
    return AniListEdit(
      status: status ?? row.status,
      progress: progress ?? row.progress,
      score: score ?? row.score,
    );
  }
}

void main() {
  test('refresh never carries cached entries into a different or removed connection', () async {
    final f = TrackerFixture();
    await f.start();
    f.account = 456;
    await f.service.restore();
    expect(f.service.viewer!.id, 456);
    expect(f.service.entries, isEmpty);
    f.vault.value = null;
    await f.service.restore();
    expect(f.service.viewer, isNull);
    expect(f.service.entries, isEmpty);
    expect(f.service.hasSavedToken, isFalse);
    f.service.close();
  });
  test('half-step score uses raw 100-point scale and verifies the exact account and readback', () async {
    final f = TrackerFixture();
    await f.start();
    final original = f.service.entries.single;
    await f.service.save(original, f.draft(score: 8.5));
    final mutation = f.requests.singleWhere(
      (r) => (r['query'] as String).startsWith('mutation'),
    );
    expect(mutation['variables'], {'id': 1, 'scoreRaw': 85});
    expect(mutation['query'], isNot(contains('mediaId:')));
    expect(f.service.entries.single.score, 8.5);
    expect(f.service.entries.single.progress, 4);
    expect(f.service.entries.single.status, 'CURRENT');
    expect(f.requests.takeLastQueries(4), ['viewer', 'entry', 'save', 'entry']);
    expect(f.service.requiresRefresh, isFalse);
    f.service.close();
  });
  test('progress-only save preserves a remotely changed score and status with no unused mutation arguments', () async {
    final f = TrackerFixture();
    await f.start();
    final original = f.service.entries.single;
    f.score = 9.3;
    f.status = 'PAUSED';
    await f.service.save(original, f.draft(progress: 5));
    expect(
      f.requests.singleWhere(
        (r) => (r['query'] as String).startsWith('mutation'),
      )['variables'],
      {'id': 1, 'progress': 5},
    );
    expect(f.score, 9.3);
    expect(f.status, 'PAUSED');
    expect(f.service.entries.single.score, 9.3);
    expect(f.service.entries.single.status, 'PAUSED');
    f.service.close();
  });
  test(
    'all six statuses, clear score and no-change save are explicit',
    () async {
      final f = TrackerFixture();
      await f.start();
      final count = f.requests.length;
        expect(await f.service.save(f.service.entries.single, f.draft()), isFalse);
      expect(f.requests.length, count);
      for (final status in aniListStatuses) {
        await f.service.save(f.service.entries.single, f.draft(status: status));
        expect(f.service.entries.single.status, status);
      }
      await f.service.save(f.service.entries.single, f.draft(score: 0));
      expect(f.score, 0);
      expect(
        f.requests.lastWhere(
          (r) => (r['query'] as String).startsWith('mutation'),
        )['variables'],
        {'id': 1, 'scoreRaw': 0},
      );
      f.service.close();
    },
  );
  test(
    'concurrent progress change refuses overwrite and requires refresh',
    () async {
      final f = TrackerFixture();
      await f.start();
      final old = f.service.entries.single;
      f.progress = 6;
      await expectLater(
        f.service.save(old, f.draft(progress: 5)),
        throwsA(isA<AniListFailure>()),
      );
      expect(f.writes, 0);
      expect(f.service.requiresRefresh, isTrue);
      await f.service.load(refresh: true);
      expect(f.service.entries.single.progress, 6);
      expect(f.service.requiresRefresh, isFalse);
      await expectLater(
        f.service.save(old, f.draft(progress: 7)),
        throwsA(isA<AniListFailure>()),
      );
      expect(f.writes, 0);
      f.service.close();
    },
  );
  test(
    'changed account, owner, media or saved token cannot cause a mutation',
    () async {
      for (final kind in ['account', 'owner', 'media', 'token']) {
        final f = TrackerFixture();
        await f.start();
        final row = f.service.entries.single;
        switch (kind) {
          case 'account':
            f.account = 456;
          case 'owner':
            f.owner = 456;
          case 'media':
            f.media = 2000;
          case 'token':
            f.vault.value = 'other_generated_token_123456789';
        }
        await expectLater(
          f.service.save(row, f.draft(score: 8)),
          throwsA(isA<AniListFailure>()),
        );
        expect(f.writes, 0);
        f.service.close();
      }
    },
  );
  test('lost save response is not success or retried; refresh reconciles the actual remote result', () async {
    final f = TrackerFixture();
    await f.start();
    final row = f.service.entries.single;
    f.loseResponse = true;
    await expectLater(
      f.service.save(row, f.draft(progress: 5)),
      throwsA(
        predicate(
          (e) => e.toString().contains('result could not be confirmed'),
        ),
      ),
    );
    expect(f.progress, 5);
    expect(f.service.entries.single.progress, 4);
    expect(f.service.requiresRefresh, isTrue);
    await expectLater(
      f.service.save(row, f.draft(progress: 5)),
      throwsA(isA<AniListFailure>()),
    );
    expect(f.writes, 1);
    f.loseResponse = false;
    await f.service.load(refresh: true);
    expect(f.service.entries.single.progress, 5);
    expect(f.service.requiresRefresh, isFalse);
    f.service.close();
  });
  test('failed readback never reports verified success, invalid drafts never write', () async {
    final f = TrackerFixture();
    await f.start();
    final row = f.service.entries.single;
    await expectLater(
      f.service.save(row, f.draft(progress: -1)),
      throwsA(isA<AniListFailure>()),
    );
    await expectLater(
      f.service.save(row, f.draft(score: double.nan)),
      throwsA(isA<AniListFailure>()),
    );
    expect(f.writes, 0);
    f.failReadback = true;
    await expectLater(
      f.service.save(row, f.draft(score: 8)),
      throwsA(isA<AniListFailure>()),
    );
    expect(f.service.entries.single.score, 7);
    expect(f.service.requiresRefresh, isTrue);
    f.service.close();
  });
}

extension QueryNames on List<Map<String, dynamic>> {
  List<String> takeLastQueries(int count) => skip(length - count).map((r) {
    final q = r['query'] as String;
    return q.contains('Viewer')
        ? 'viewer'
        : q.startsWith('mutation')
        ? 'save'
        : 'entry';
  }).toList();
}
