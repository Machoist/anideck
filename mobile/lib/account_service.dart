import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

class AccountFailure implements Exception {
  const AccountFailure(this.message);
  final String message;
  @override
  String toString() => message;
}

abstract interface class AccountVault {
  Future<String?> read();
  Future<void> write(String key);
  Future<void> delete();
}

class DeviceAccountVault implements AccountVault {
  static const _key = 'anideck.account.key.v1';
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      resetOnError: false,
      storageNamespace: 'anideck_account_v1',
    ),
  );
  @override
  Future<String?> read() => _storage.read(key: _key);
  @override
  Future<void> write(String key) => _storage.write(key: _key, value: key);
  @override
  Future<void> delete() => _storage.delete(key: _key);
}

class AccountProfile {
  const AccountProfile(this.handle, this.name);
  final String handle, name;
  static AccountProfile parse(dynamic value) {
    if (value is! Map ||
        value['handle'] is! String ||
        !RegExp(r'^[a-zA-Z0-9_]{3,20}$').hasMatch(value['handle'])) {
      throw const AccountFailure(
        'AniDeck returned an incomplete profile. Try again.',
      );
    }
    return AccountProfile(
      value['handle'],
      value['name'] is String
          ? (value['name'] as String).substring(
              0,
              min(80, (value['name'] as String).length),
            )
          : value['handle'],
    );
  }
}

/// Only the public AniDeck origin receives a key, in a POST body, never a URL.
class AccountApi {
  AccountApi({http.Client? client}) : _client = client ?? http.Client();
  final http.Client _client;
  static final base = Uri.parse(
    'https://anideck-cloud.anideck-cloud.workers.dev',
  );
  final _pending = <Completer<void>>{};
  void close() {
    for (final abort in _pending.toList()) {
      if (!abort.isCompleted) abort.complete();
    }
    _client.close();
  }

  Future<Map<String, dynamic>> _call(
    String path,
    Map<String, dynamic> body, {
    String? session,
  }) async {
    final abort = Completer<void>();
    _pending.add(abort);
    final timer = Timer(const Duration(seconds: 12), () {
      if (!abort.isCompleted) abort.complete();
    });
    try {
      final request =
          http.AbortableRequest(
              session == null ? 'POST' : 'PUT',
              base.resolve(path),
              abortTrigger: abort.future,
            )
            ..followRedirects = false
            ..headers['Content-Type'] = 'application/json'
            ..body = jsonEncode(body);
      if (session != null) request.headers['Authorization'] = 'Bearer $session';
      final response = await _client.send(request);
      final bytes = <int>[];
      await for (final chunk in response.stream) {
        if (bytes.length + chunk.length > 65536) {
          if (!abort.isCompleted) abort.complete();
          throw const AccountFailure(
            'AniDeck returned too much account data. Try again.',
          );
        }
        bytes.addAll(chunk);
      }
      if (response.statusCode == 401) {
        throw const AccountFailure(
          'That key could not sign in. Check the complete key and try again.',
        );
      }
      if (response.statusCode == 409) {
        throw const AccountFailure('That handle is taken. Choose another.');
      }
      if (response.statusCode == 429) {
        throw const AccountFailure(
          'AniDeck is busy. Please wait before trying again.',
        );
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw const AccountFailure(
          'AniDeck could not complete this request. Try again shortly.',
        );
      }
      final value = jsonDecode(utf8.decode(bytes));
      if (value is! Map<String, dynamic>) throw const FormatException();
      return value;
    } on AccountFailure {
      rethrow;
    } catch (_) {
      throw const AccountFailure(
        'Could not reach your AniDeck account. Your saved key and local list are kept.',
      );
    } finally {
      timer.cancel();
      _pending.remove(abort);
    }
  }

  Future<Map<String, dynamic>> exchange(String key) =>
      _call('/v1/session', {'provider': 'anideck', 'token': key});
  Future<AccountProfile> create(String session, String handle) async =>
      AccountProfile.parse(
        (await _call('/v1/me', {
          'handle': handle,
          'name': handle,
          'visibility': 'friends',
        }, session: session))['me'],
      );
}

class AccountService {
  AccountService({
    AccountVault? vault,
    AccountApi? api,
    String Function()? newKey,
  }) : vault = vault ?? DeviceAccountVault(),
       api = api ?? AccountApi(),
       _newKey = newKey ?? generateKey;
  final AccountVault vault;
  final AccountApi api;
  final String Function() _newKey;
  AccountProfile? profile;
  bool hasSavedKey = false;
  bool _busy = false, _closed = false;
  static bool validKey(String key) =>
      RegExp(r'^adk_[a-f0-9]{64}$').hasMatch(key);
  static String generateKey() {
    final random = Random.secure();
    return 'adk_${List.generate(32, (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0')).join()}';
  }

  Future<T> _operation<T>(Future<T> Function() work) async {
    if (_closed || _busy) {
      throw const AccountFailure('An account request is already in progress.');
    }
    _busy = true;
    try {
      return await work();
    } on AccountFailure {
      rethrow;
    } catch (_) {
      throw const AccountFailure(
        'Secure storage could not complete this step. Your local list is unchanged. Try again.',
      );
    } finally {
      _busy = false;
    }
  }

  void _active() {
    if (_closed) throw const AccountFailure('Account request cancelled.');
  }

  AccountProfile _joined(Map<String, dynamic> data) {
    if (data['joined'] != true) {
      throw const AccountFailure(
        'No profile was found for this key. Use the key from your existing device.',
      );
    }
    return AccountProfile.parse(data['me']);
  }

  Future<AccountProfile?> restore() => _operation(() async {
    final key = await vault.read();
    _active();
    hasSavedKey = key != null;
    if (key == null) return null;
    if (!validKey(key)) {
      throw const AccountFailure(
        'The saved key could not be read. Use your private backup to sign in again.',
      );
    }
    final next = _joined(await api.exchange(key));
    _active();
    return profile = next;
  });

  Future<AccountProfile> signIn(String raw) => _operation(() async {
    final key = raw.trim();
    if (!validKey(key)) {
      throw const AccountFailure(
        'Enter the complete AniDeck key starting with adk_.',
      );
    }
    if (await vault.read() != null) {
      throw const AccountFailure(
        'Sign out of the saved account before switching profiles.',
      );
    }
    _active();
    final next = _joined(await api.exchange(key));
    _active();
    await vault.write(key); // Never claim success unless the key is durable.
    hasSavedKey = true;
    return profile = next;
  });

  Future<AccountProfile> create(String handle) => _operation(() async {
    handle = handle.trim();
    if (!RegExp(r'^[a-zA-Z0-9_]{3,20}$').hasMatch(handle)) {
      throw const AccountFailure('Use 3–20 letters, numbers or underscores.');
    }
    if (profile != null) {
      throw const AccountFailure('Sign out before creating another profile.');
    }
    var key = await vault.read();
    _active();
    if (key == null) {
      key = _newKey();
      if (!validKey(key)) {
        throw const AccountFailure(
          'Could not generate an account key. Try again.',
        );
      }
      // Persist before any account write: an interrupted creation must remain recoverable.
      await vault.write(key);
    }
    if (!validKey(key)) {
      throw const AccountFailure(
        'The saved key could not be read. Restore it from your private backup.',
      );
    }
    hasSavedKey = true;
    final data = await api.exchange(key);
    _active();
    if (data['joined'] == true) return profile = _joined(data);
    final session = data['session'];
    if (session is! String || session.isEmpty || session.length > 4096) {
      throw const AccountFailure(
        'AniDeck could not verify this account. Try again.',
      );
    }
    final next = await api.create(session, handle);
    _active();
    return profile = next;
  });

  Future<String?> privateKey() => _operation(() async {
    final key = await vault.read();
    return key != null && validKey(key) ? key : null;
  });
  Future<void> signOut() => _operation(() async {
    await vault.delete(); // Forget only this account key; never delete the cloud profile or local list.
    profile = null;
    hasSavedKey = false;
  });
  void close() {
    _closed = true;
    api.close();
  }
}
