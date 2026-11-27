import 'dart:convert';
import 'dart:async';

import 'package:anideck_mobile/account_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

final key = 'adk_${'a' * 64}';

class MemoryVault implements AccountVault {
  String? value;
  bool failWrite = false, failRead = false, failDelete = false;
  @override
  Future<String?> read() async {
    if (failRead) throw Exception('generated read failure');
    return value;
  }

  @override
  Future<void> write(String key) async {
    if (failWrite) throw Exception('generated write failure');
    value = key;
  }

  @override
  Future<void> delete() async {
    if (failDelete) throw Exception('generated delete failure');
    value = null;
  }
}

http.Response joined() => http.Response(
  jsonEncode({
    'joined': true,
    'session': 'generated.session',
    'me': {'handle': 'Fixture', 'name': 'Fixture Name'},
  }),
  200,
);
void main() {
  test('recovery validates key locally, posts only to public account origin and persists after verification', () async {
    final vault = MemoryVault();
    var reads = 0;
    final service = AccountService(
      vault: vault,
      api: AccountApi(
        client: MockClient((request) async {
          reads++;
          expect(request.url.toString(), '${AccountApi.base}/v1/session');
          expect(request.method, 'POST');
          expect(request.followRedirects, isFalse);
          expect(request.url.query, isEmpty);
          expect(jsonDecode(request.body), {
            'provider': 'anideck',
            'token': key,
          });
          expect(vault.value, isNull);
          return joined();
        }),
      ),
    );
    await expectLater(service.signIn('bad'), throwsA(isA<AccountFailure>()));
    expect(reads, 0);
    expect((await service.signIn(' $key ')).handle, 'Fixture');
    expect(vault.value, key);
    expect(reads, 1);
    service.close();
  });
  test('unknown profile and failed server responses never replace stored identity or expose response text', () async {
    for (final response in [
      http.Response(
        jsonEncode({'joined': false, 'session': 'generated.session'}),
        200,
      ),
      http.Response('private $key', 401),
      http.Response('private $key', 503),
      http.Response('{}', 302),
    ]) {
      final vault = MemoryVault();
      final active = AccountService(
        vault: vault,
        api: AccountApi(client: MockClient((_) async => response)),
      );
      try {
        await active.signIn(key);
        fail('must reject');
      } on AccountFailure catch (error) {
        expect(error.message.contains(key), isFalse);
      }
      expect(vault.value, isNull);
      expect(active.profile, isNull);
      active.close();
    }
  });
  test('failed secure write does not report signed in', () async {
    final vault = MemoryVault()..failWrite = true;
    final service = AccountService(
      vault: vault,
      api: AccountApi(client: MockClient((_) async => joined())),
    );
    await expectLater(service.signIn(key), throwsA(isA<AccountFailure>()));
    expect(service.profile, isNull);
    expect(vault.value, isNull);
    service.close();
  });
  test(
    'restore keeps key on offline verification and sign-out failure',
    () async {
      final vault = MemoryVault()..value = key;
      final service = AccountService(
        vault: vault,
        api: AccountApi(
          client: MockClient(
            (_) async => throw Exception('generated network failure'),
          ),
        ),
      );
      await expectLater(service.restore(), throwsA(isA<AccountFailure>()));
      expect(vault.value, key);
      expect(service.hasSavedKey, isTrue);
      vault.failDelete = true;
      await expectLater(service.signOut(), throwsA(isA<AccountFailure>()));
      expect(vault.value, key);
      vault.failDelete = false;
      await service.signOut();
      expect(vault.value, isNull);
      service.close();
    },
  );
  test('creation persists recovery key before network and retries with same key after interruption', () async {
    final vault = MemoryVault();
    var puts = 0, failCreate = true;
    final service = AccountService(
      vault: vault,
      newKey: () => key,
      api: AccountApi(
        client: MockClient((request) async {
          expect(vault.value, key);
          if (request.url.path == '/v1/session') {
            return http.Response(
              jsonEncode({'joined': false, 'session': 'generated.session'}),
              200,
            );
          }
          puts++;
          expect(request.method, 'PUT');
          expect(request.headers['Authorization'], 'Bearer generated.session');
          expect(jsonDecode(request.body), {
            'handle': 'NewFixture',
            'name': 'NewFixture',
            'visibility': 'friends',
          });
          if (failCreate) return http.Response('{}', 503);
          return http.Response(
            jsonEncode({
              'me': {'handle': 'NewFixture'},
            }),
            200,
          );
        }),
      ),
    );
    await expectLater(
      service.create('NewFixture'),
      throwsA(isA<AccountFailure>()),
    );
    expect(vault.value, key);
    expect(service.profile, isNull);
    failCreate = false;
    expect((await service.create('NewFixture')).handle, 'NewFixture');
    expect(puts, 2);
    service.close();
  });
  test('creation cannot write remotely when durable storage fails', () async {
    var reads = 0;
    final vault = MemoryVault()..failWrite = true;
    final service = AccountService(
      vault: vault,
      newKey: () => key,
      api: AccountApi(
        client: MockClient((_) async {
          reads++;
          return joined();
        }),
      ),
    );
    await expectLater(
      service.create('ValidFixture'),
      throwsA(isA<AccountFailure>()),
    );
    expect(reads, 0);
    service.close();
  });
  test('existing account requires explicit sign-out before switching; no profile deletion endpoint is used', () async {
    var reads = 0;
    final vault = MemoryVault()..value = key;
    final service = AccountService(
      vault: vault,
      api: AccountApi(
        client: MockClient((_) async {
          reads++;
          return joined();
        }),
      ),
    );
    await expectLater(
      service.signIn('adk_${'b' * 64}'),
      throwsA(isA<AccountFailure>()),
    );
    expect(reads, 0);
    expect(vault.value, key);
    await service.signOut();
    expect(reads, 0);
    expect(vault.value, isNull);
    service.close();
  });
  test('closing during verification prevents a late credential write and concurrent sign-in is refused', () async {
    final vault = MemoryVault(), response = Completer<http.Response>();
    final service = AccountService(
      vault: vault,
      api: AccountApi(client: MockClient((_) => response.future)),
    );
    final pending = service.signIn(key);
    await Future<void>.delayed(Duration.zero);
    await expectLater(service.signIn(key), throwsA(isA<AccountFailure>()));
    service.close();
    response.complete(joined());
    await expectLater(pending, throwsA(isA<AccountFailure>()));
    expect(vault.value, isNull);
  });
  test('oversized responses and corrupt saved credentials fail without deleting or replacing a key', () async {
    final vault = MemoryVault();
    final service = AccountService(
      vault: vault,
      api: AccountApi(
        client: MockClient((_) async => http.Response('x' * 65537, 200)),
      ),
    );
    await expectLater(service.signIn(key), throwsA(isA<AccountFailure>()));
    expect(vault.value, isNull);
    vault.value = 'corrupt generated fixture';
    await expectLater(service.restore(), throwsA(isA<AccountFailure>()));
    await expectLater(
      service.create('Fixture'),
      throwsA(isA<AccountFailure>()),
    );
    expect(vault.value, 'corrupt generated fixture');
    service.close();
  });
  test('locally generated keys meet existing desktop/server format and have independent entropy', () {
    final keys = List.generate(10, (_) => AccountService.generateKey());
    expect(keys.every(AccountService.validKey), isTrue);
    expect(keys.toSet().length, 10);
  });
}
