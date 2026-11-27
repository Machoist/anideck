import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import 'account_service.dart' show AccountVault;

class AniListFailure implements Exception {
  const AniListFailure(this.message);
  final String message;
  @override
  String toString() => message;
}

class AniListVault implements AccountVault {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      resetOnError: false,
      storageNamespace: 'anideck_anilist_v1',
    ),
  );
  static const _key = 'anideck.anilist.token.v1';
  @override
  Future<String?> read() => _storage.read(key: _key);
  @override
  Future<void> write(String key) => _storage.write(key: _key, value: key);
  @override
  Future<void> delete() => _storage.delete(key: _key);
}

class AniListViewer {
  const AniListViewer(this.id, this.name);
  final int id;
  final String name;
}

class AniListEntry {
  const AniListEntry({
    required this.id,
    required this.mediaId,
    required this.title,
    required this.status,
    required this.progress,
    required this.score,
    this.cover,
  });
  final int id, mediaId, progress;
  final String title, status;
  final double score;
  final Uri? cover;
  AniListEntry changed({
    required String status,
    required int progress,
    required double score,
  }) => AniListEntry(
    id: id,
    mediaId: mediaId,
    title: title,
    cover: cover,
    status: status,
    progress: progress,
    score: score,
  );
}

const aniListStatuses = {
  'CURRENT',
  'PLANNING',
  'COMPLETED',
  'PAUSED',
  'DROPPED',
  'REPEATING',
};

class AniListEdit {
  const AniListEdit({
    required this.status,
    required this.progress,
    required this.score,
  });
  final String status;
  final int progress;
  final double score;
  void validate() {
    if (!aniListStatuses.contains(status) ||
        progress < 0 ||
        progress > 100000 ||
        !score.isFinite ||
        score < 0 ||
        score > 10) {
      throw const AniListFailure(
        'Check your status, episode count and score before saving.',
      );
    }
  }

  Map<String, dynamic> changes(AniListEntry original) {
    validate();
    return {
      if (status != original.status) 'status': status,
      if (progress != original.progress) 'progress': progress,
      if ((score * 10).round() != (original.score * 10).round())
        'scoreRaw': (score * 10).round(),
    };
  }
}

class AniListPage {
  const AniListPage(this.entries, this.hasMore);
  final List<AniListEntry> entries;
  final bool hasMore;
}

/// Catalog IDs are retained independently of
/// provider URLs; a catalog episode total never creates streaming availability.
class AniListApi {
  AniListApi({http.Client? client, DateTime Function()? now})
    : _client = client ?? http.Client(),
      _now = now ?? DateTime.now;
  final http.Client _client;
  final DateTime Function() _now;
  static final endpoint = Uri.parse('https://graphql.anilist.co');
  static final authorization = Uri.https(
    'anilist.co',
    '/api/v2/oauth/authorize',
    {'client_id': '54547', 'response_type': 'token'},
  );
  final _pending = <Completer<void>>{};
  DateTime? _retryAt;
  bool _closed = false;

  Future<Map<String, dynamic>> _query(
    String token,
    String query,
    Map<String, dynamic> variables,
  ) async {
    if (_closed) throw const AniListFailure('AniList request cancelled.');
    if (_retryAt != null && _now().isBefore(_retryAt!)) {
      throw const AniListFailure(
        'AniList is busy. Please wait a minute before refreshing.',
      );
    }
    final abort = Completer<void>();
    _pending.add(abort);
    final timer = Timer(const Duration(seconds: 15), () {
      if (!abort.isCompleted) abort.complete();
    });
    try {
      final request =
          http.AbortableRequest('POST', endpoint, abortTrigger: abort.future)
            ..followRedirects = false
            ..headers.addAll({
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Authorization': 'Bearer $token',
            })
            ..body = jsonEncode({'query': query, 'variables': variables});
      final response = await _client.send(request);
      final bytes = <int>[];
      await for (final chunk in response.stream) {
        if (bytes.length + chunk.length > 1024 * 1024) {
          if (!abort.isCompleted) abort.complete();
          throw const AniListFailure(
            'AniList returned too much data. Try again later.',
          );
        }
        bytes.addAll(chunk);
      }
      if (response.statusCode == 429) {
        final seconds =
            int.tryParse(response.headers['retry-after'] ?? '') ?? 60;
        _retryAt = _now().add(Duration(seconds: seconds.clamp(60, 3600)));
        throw const AniListFailure(
          'AniList is busy. Please wait before refreshing.',
        );
      }
      if (response.statusCode == 401 || response.statusCode == 403) {
        throw const AniListFailure(
          'AniList could not verify this sign-in. Reconnect with a new token.',
        );
      }
      if (response.statusCode != 200) throw const FormatException();
      final result = jsonDecode(utf8.decode(bytes));
      if (result is! Map<String, dynamic>) throw const FormatException();
      final errors = result['errors'];
      if (errors is List && errors.isNotEmpty) {
        if (errors.any((e) => e is Map && e['status'] == 429)) {
          _retryAt = _now().add(const Duration(minutes: 1));
        }
        throw const AniListFailure(
          'AniList could not complete this read. Your lists are unchanged. Try again later.',
        );
      }
      if (result['data'] is! Map<String, dynamic>) {
        throw const FormatException();
      }
      if (_closed) throw const AniListFailure('AniList request cancelled.');
      return result['data'] as Map<String, dynamic>;
    } on AniListFailure {
      rethrow;
    } catch (_) {
      throw const AniListFailure(
        'Could not reach AniList. Your saved connection and local list are kept.',
      );
    } finally {
      timer.cancel();
      _pending.remove(abort);
    }
  }

  Future<AniListViewer> viewer(String token) async {
    final data = await _query(token, 'query { Viewer { id name } }', {});
    final viewer = data['Viewer'];
    if (viewer is! Map ||
        viewer['id'] is! int ||
        viewer['id'] <= 0 ||
        viewer['name'] is! String ||
        (viewer['name'] as String).isEmpty ||
        (viewer['name'] as String).length > 100) {
      throw const AniListFailure(
        'AniList returned an incomplete account. Try reconnecting.',
      );
    }
    return AniListViewer(viewer['id'], viewer['name']);
  }

  Future<AniListPage> list(String token, int userId, int page) async {
    final data = await _query(
      token,
      r'''query($user:Int!,$page:Int!){ Page(page:$page,perPage:50){
      pageInfo{hasNextPage} mediaList(userId:$user,type:ANIME,sort:UPDATED_TIME_DESC){
        id status progress score(format:POINT_10_DECIMAL)
        media{id title{userPreferred romaji english} coverImage{large}}
      } } }''',
      {'user': userId, 'page': page},
    );
    try {
      final value = data['Page'];
      if (value is! Map ||
          value['mediaList'] is! List ||
          value['pageInfo'] is! Map ||
          value['pageInfo']['hasNextPage'] is! bool) {
        throw const FormatException();
      }
      final entries = <AniListEntry>[];
      for (final row in value['mediaList']) {
        final media = row['media'];
        final titles = media['title'];
        final title =
            titles['userPreferred'] ?? titles['english'] ?? titles['romaji'];
        if (row['id'] is! int ||
            row['id'] <= 0 ||
            media['id'] is! int ||
            media['id'] <= 0 ||
            title is! String ||
            title.trim().isEmpty ||
            title.length > 500 ||
            !const {
              'CURRENT',
              'PLANNING',
              'COMPLETED',
              'PAUSED',
              'DROPPED',
              'REPEATING',
            }.contains(row['status']) ||
            row['progress'] is! int ||
            row['progress'] < 0 ||
            row['score'] is! num ||
            !(row['score'] as num).isFinite ||
            row['score'] < 0 ||
            row['score'] > 10) {
          throw const FormatException();
        }
        final rawCover = media['coverImage']?['large'];
        final uri = rawCover is String ? Uri.tryParse(rawCover) : null;
        final cover =
            uri?.scheme == 'https' &&
                uri?.host == 's4.anilist.co' &&
                uri!.userInfo.isEmpty
            ? uri
            : null;
        entries.add(
          AniListEntry(
            id: row['id'],
            mediaId: media['id'],
            title: title,
            status: row['status'],
            progress: row['progress'],
            score: (row['score'] as num).toDouble(),
            cover: cover,
          ),
        );
      }
      if (entries.length > 50 ||
          (entries.isEmpty && value['pageInfo']['hasNextPage'] == true)) {
        throw const FormatException();
      }
      return AniListPage(entries, value['pageInfo']['hasNextPage']);
    } catch (_) {
      throw const AniListFailure(
        'AniList returned an incomplete list. Your lists are unchanged. Retry this page.',
      );
    }
  }

  Future<({int userId, AniListEntry entry})> readEntry(
    String token,
    AniListEntry original,
  ) async {
    final data = await _query(
      token,
      r'''query($id:Int!){MediaList(id:$id){id userId mediaId status progress score(format:POINT_10_DECIMAL)}}''',
      {'id': original.id},
    );
    final row = data['MediaList'];
    if (row is! Map ||
        row['id'] != original.id ||
        row['mediaId'] != original.mediaId ||
        row['userId'] is! int ||
        row['userId'] <= 0 ||
        !aniListStatuses.contains(row['status']) ||
        row['progress'] is! int ||
        row['progress'] < 0 ||
        row['score'] is! num ||
        !(row['score'] as num).isFinite ||
        row['score'] < 0 ||
        row['score'] > 10) {
      throw const AniListFailure(
        'AniList could not verify this exact list entry. Refresh your list before editing.',
      );
    }
    return (
      userId: row['userId'] as int,
      entry: original.changed(
        status: row['status'],
        progress: row['progress'],
        score: (row['score'] as num).toDouble(),
      ),
    );
  }

  Future<void> saveEntry(
    String token,
    int id,
    Map<String, dynamic> changes,
  ) async {
    // Omitted arguments stay omitted: a progress-only save cannot clear a score,
    // overwrite status, repeat count, dates, notes, privacy or custom lists.
    final declarations = <String>['\$id:Int!'];
    final arguments = <String>['id:\$id'];
    for (final key in changes.keys) {
      if (!const {'status', 'progress', 'scoreRaw'}.contains(key)) {
        throw const AniListFailure('Unsupported list change.');
      }
      declarations.add(
        '\$$key:${key == 'status' ? 'MediaListStatus' : 'Int'}!',
      );
      arguments.add('$key:\$$key');
    }
    final data = await _query(
      token,
      'mutation(${declarations.join(',')}){SaveMediaListEntry(${arguments.join(',')}){id}}',
      {'id': id, ...changes},
    );
    if (data['SaveMediaListEntry'] is! Map ||
        data['SaveMediaListEntry']['id'] != id) {
      throw const AniListFailure(
        'AniList did not confirm this list entry. Refresh before trying again.',
      );
    }
  }

  void close() {
    _closed = true;
    for (final abort in _pending.toList()) {
      if (!abort.isCompleted) abort.complete();
    }
    _client.close();
  }
}

class AniListService {
  AniListService({AccountVault? vault, AniListApi? api})
    : vault = vault ?? AniListVault(),
      api = api ?? AniListApi();
  final AccountVault vault;
  final AniListApi api;
  AniListViewer? viewer;
  final entries = <AniListEntry>[];
  String? _token;
  bool hasSavedToken = false, hasMore = false, _busy = false, _closed = false;
  bool requiresRefresh = false;
  int _page = 0;
  static bool validToken(String token) =>
      token.length >= 20 &&
      token.length <= 8192 &&
      RegExp(r'^[A-Za-z0-9._~+/-]+=*$').hasMatch(token);
  void _active() {
    if (_closed) throw const AniListFailure('AniList request cancelled.');
  }

  Future<T> _run<T>(Future<T> Function() action) async {
    if (_busy || _closed) {
      throw const AniListFailure('An AniList request is already in progress.');
    }
    _busy = true;
    try {
      return await action();
    } on AniListFailure {
      rethrow;
    } catch (_) {
      throw const AniListFailure(
        'Secure storage could not complete this step. Your local list is unchanged.',
      );
    } finally {
      _busy = false;
    }
  }

  Future<void> restore() => _run(() async {
    final token = await vault.read();
    _active();
    hasSavedToken = token != null;
    if (token != _token) {
      _token = null;
      viewer = null;
      entries.clear();
      _page = 0;
      hasMore = false;
      requiresRefresh = false;
    }
    if (token == null) return;
    if (!validToken(token)) {
      throw const AniListFailure(
        'The saved AniList connection is unreadable. Disconnect and sign in again.',
      );
    }
    final next = await api.viewer(token);
    _active();
    if (viewer != null && viewer!.id != next.id) {
      entries.clear();
      _page = 0;
      hasMore = false;
      requiresRefresh = false;
    }
    _token = token;
    viewer = next;
  });
  Future<void> signIn(String raw) => _run(() async {
    final token = raw.trim();
    if (!validToken(token)) {
      throw const AniListFailure(
        'Paste the complete access token from AniList, not your password or a URL.',
      );
    }
    final previous = await vault.read();
    _active();
    if (previous != null) {
      throw const AniListFailure(
        'Disconnect the saved AniList account before switching accounts.',
      );
    }
    final next = await api.viewer(token);
    _active();
    await vault.write(token);
    _active();
    hasSavedToken = true;
    _token = token;
    viewer = next;
  });
  Future<void> load({bool refresh = false}) => _run(() async {
    if (_token == null || viewer == null) {
      throw const AniListFailure('Connect AniList first.');
    }
    if (!refresh && _page > 0 && !hasMore) return;
    final page = refresh ? 1 : _page + 1;
    final result = await api.list(_token!, viewer!.id, page);
    _active();
    if (refresh) entries.clear();
    final seen = entries.map((e) => e.id).toSet();
    entries.addAll(result.entries.where((e) => seen.add(e.id)));
    _page = page;
    hasMore = result.hasMore;
    if (refresh) requiresRefresh = false;
  });
  Future<bool> save(AniListEntry original, AniListEdit edit) => _run(() async {
    _active();
    if (_token == null ||
        viewer == null ||
        requiresRefresh ||
        !entries.any((e) => identical(e, original))) {
      throw const AniListFailure('Refresh AniList before editing this entry.');
    }
    final changes = edit.changes(original);
    if (changes.isEmpty) return false;
    if (await vault.read() != _token) {
      throw const AniListFailure(
        'Your saved AniList connection changed. Reconnect before saving.',
      );
    }
    _active();
    final account = await api.viewer(_token!);
    _active();
    if (account.id != viewer!.id) {
      throw const AniListFailure(
        'Your AniList account changed. Reconnect before saving.',
      );
    }
    final latest = await api.readEntry(_token!, original);
    _active();
    if (latest.userId != account.id) {
      throw const AniListFailure(
        'This entry does not belong to the connected AniList account.',
      );
    }
    final state = latest.entry;
    if ((changes.containsKey('status') && state.status != original.status) ||
        (changes.containsKey('progress') &&
            state.progress != original.progress) ||
        (changes.containsKey('scoreRaw') &&
            (state.score * 10).round() != (original.score * 10).round())) {
      requiresRefresh = true;
      throw const AniListFailure(
        'This entry changed on AniList while you were editing. Close this editor and refresh before saving.',
      );
    }
    // Once sent, a lost response is an unknown outcome, never an automatic retry.
    if (await vault.read() != _token) {
      throw const AniListFailure(
        'Your saved AniList connection changed. Reconnect before saving.',
      );
    }
    _active();
    requiresRefresh = true;
    try {
      await api.saveEntry(_token!, original.id, changes);
      _active();
      final confirmed = await api.readEntry(_token!, original);
      _active();
      if (confirmed.userId != account.id ||
          (changes.containsKey('status') &&
              confirmed.entry.status != edit.status) ||
          (changes.containsKey('progress') &&
              confirmed.entry.progress != edit.progress) ||
          (changes.containsKey('scoreRaw') &&
              (confirmed.entry.score * 10).round() != changes['scoreRaw'])) {
        throw const AniListFailure('Saved values could not be confirmed.');
      }
      final index = entries.indexWhere((e) => e.id == original.id);
      if (index >= 0) entries[index] = confirmed.entry;
      requiresRefresh = false;
      return true;
    } catch (_) {
      throw const AniListFailure(
        'The save was sent, but its result could not be confirmed. Close this editor and refresh AniList before making another change.',
      );
    }
  });
  Future<void> signOut() => _run(() async {
    await vault.delete();
    _active();
    hasSavedToken = false;
    _token = null;
    viewer = null;
    entries.clear();
    _page = 0;
    hasMore = false;
    requiresRefresh = false;
  });
  void close() {
    _closed = true;
    _token = null;
    api.close();
  }
}
