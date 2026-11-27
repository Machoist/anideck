import 'dart:async';

import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:path/path.dart' as path;
import 'package:sqflite/sqflite.dart';

import 'account_service.dart';
import 'anilist_page.dart';
import 'anilist_service.dart' show AniListVault;
import 'local_library.dart';

const _accent = Color(0xffbba5ff);
const _muted = Color(0xffb4afc2);
const _warning = Color(0xffffca8b);

/// Remembers that first-launch onboarding finished (completed or skipped).
abstract interface class OnboardingStore {
  Future<bool> isComplete();
  Future<void> markComplete(String outcome);
}

/// A separate tiny database, so the local-list schema is never touched.
class SqliteOnboardingStore implements OnboardingStore {
  SqliteOnboardingStore({Future<Database> Function()? open})
    : _open = open ?? _openDefault;
  static const fileName = 'anideck-app-state-v1.db';
  static const _row = 'onboarding.v1';
  final Future<Database> Function() _open;
  Future<Database>? _database;

  static Future<Database> _openDefault() async => openDatabase(
    path.join(await getDatabasesPath(), fileName),
    version: 1,
    onCreate: createSchema,
  );

  static Future<void> createSchema(Database db, int version) => db.execute(
    'CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  );

  Future<Database> _db() {
    final pending = _database ??= _open();
    return pending.catchError((Object error) {
      // A failed open stays retryable instead of caching the failure.
      if (identical(_database, pending)) _database = null;
      throw error;
    });
  }

  @override
  Future<bool> isComplete() async {
    final rows = await (await _db()).query(
      'app_state',
      columns: ['value'],
      where: 'key = ?',
      whereArgs: [_row],
    );
    return rows.isNotEmpty;
  }

  /// Outcome is a fixed word (guest/created/signed-in/existing); no secrets.
  @override
  Future<void> markComplete(String outcome) async =>
      (await _db()).insert('app_state', {
        'key': _row,
        'value': '$outcome@${DateTime.now().toUtc().toIso8601String()}',
      }, conflictAlgorithm: ConflictAlgorithm.replace);

  Future<void> close() async {
    final pending = _database;
    _database = null;
    if (pending != null) await (await pending).close();
  }
}

/// True when this device already used AniDeck before onboarding existed:
/// Home always created the local-list database, and sign-ins leave a key or
/// token in secure storage. Only presence is checked; nothing is read out.
/// An unreadable check counts as existing, so no earlier user is ever forced
/// through onboarding by a storage fault.
Future<bool> detectExistingInstallation({
  Future<bool> Function()? libraryExists,
  List<Future<String?> Function()>? secureReads,
}) async {
  final checks = <Future<bool> Function()>[
    libraryExists ??
        () async => databaseExists(
          path.join(await getDatabasesPath(), LocalLibrary.fileName),
        ),
    for (final read
        in secureReads ?? [DeviceAccountVault().read, AniListVault().read])
      () async => await read() != null,
  ];
  for (final check in checks) {
    try {
      if (await check()) return true;
    } catch (_) {
      return true;
    }
  }
  return false;
}

/// Shows onboarding once on a fresh install, otherwise the app's home.
class OnboardingGate extends StatefulWidget {
  const OnboardingGate({
    super.key,
    required this.home,
    this.store,
    this.existingInstallation,
    this.accountService,
    this.screenProtection,
    this.openAniList,
  });
  final Widget home;
  final OnboardingStore? store;
  final Future<bool> Function()? existingInstallation;
  final AccountService Function()? accountService;
  final Future<void> Function(bool enabled)? screenProtection;
  final Future<void> Function(BuildContext context)? openAniList;
  @override
  State<OnboardingGate> createState() => _OnboardingGateState();
}

enum _GatePhase { checking, onboarding, home }

class _OnboardingGateState extends State<OnboardingGate> {
  late final _store = widget.store ?? SqliteOnboardingStore();
  var _phase = _GatePhase.checking;

  @override
  void initState() {
    super.initState();
    unawaited(_decide());
  }

  Future<void> _decide() async {
    var complete = false;
    try {
      complete = await _store.isComplete();
    } catch (_) {
      /* Fall back to detecting earlier use. */
    }
    if (!complete) {
      bool existing;
      try {
        existing =
            await (widget.existingInstallation ?? detectExistingInstallation)();
      } catch (_) {
        existing = true;
      }
      if (existing) {
        complete = true;
        try {
          await _store.markComplete('existing');
        } catch (_) {
          /* Detection repeats next launch with the same answer. */
        }
      }
    }
    if (mounted) {
      setState(
        () => _phase = complete ? _GatePhase.home : _GatePhase.onboarding,
      );
    }
  }

  /// Returns false when completion could not be saved.
  Future<bool> _remember(String outcome) async {
    try {
      await _store.markComplete(outcome);
      return true;
    } catch (_) {
      return false;
    }
  }

  @override
  Widget build(BuildContext context) => switch (_phase) {
    _GatePhase.checking => const _Checking(),
    _GatePhase.home => widget.home,
    _GatePhase.onboarding => OnboardingFlow(
      service: widget.accountService?.call(),
      screenProtection: widget.screenProtection,
      openAniList: widget.openAniList,
      remember: _remember,
      onFinished: () {
        if (mounted) setState(() => _phase = _GatePhase.home);
      },
    ),
  };
}

class _Checking extends StatelessWidget {
  const _Checking();
  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: Semantics(
        label: 'Opening AniDeck',
        child: Image.asset('assets/app-icon.png', width: 56, height: 56),
      ),
    ),
  );
}

enum OnboardingStep { welcome, create, signIn, aniList }

class OnboardingFlow extends StatefulWidget {
  const OnboardingFlow({
    super.key,
    required this.remember,
    required this.onFinished,
    this.service,
    this.screenProtection,
    this.openAniList,
  });

  /// Persists completion; returns false when it could not be saved.
  final Future<bool> Function(String outcome) remember;
  final VoidCallback onFinished;
  final AccountService? service;
  final Future<void> Function(bool enabled)? screenProtection;
  final Future<void> Function(BuildContext context)? openAniList;
  @override
  State<OnboardingFlow> createState() => _OnboardingFlowState();
}

class _OnboardingFlowState extends State<OnboardingFlow>
    with WidgetsBindingObserver {
  late final _service = widget.service ?? AccountService();
  final _input = TextEditingController();
  final _focus = FocusNode();
  static const _privacy = MethodChannel('anideck/privacy');
  var _step = OnboardingStep.welcome;
  bool _busy = false, _protected = false, _savedWarning = false;
  String? _fieldError, _requestError;
  Future<void> Function()? _retry;

  Future<void> _protect(bool enabled) =>
      widget.screenProtection?.call(enabled) ??
      _privacy.invokeMethod<void>('setScreenProtected', enabled);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Never leave a typed private key behind in a backgrounded app.
    if (state != AppLifecycleState.resumed && _step == OnboardingStep.signIn) {
      _input.clear();
      _retry = null;
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _input.dispose();
    _focus.dispose();
    _service.close();
    if (_protected) _protect(false).catchError((_) {});
    super.dispose();
  }

  Future<void> _go(OnboardingStep step) async {
    if (_busy) return;
    final wantsProtection = step == OnboardingStep.signIn;
    if (wantsProtection != _protected) {
      try {
        await _protect(wantsProtection);
        _protected = wantsProtection;
      } catch (_) {
        if (wantsProtection) {
          // Do not accept a private key on a screen that can be captured.
          if (mounted) {
            setState(
              () => _requestError = 'Private sign-in could not start securely. Try again, or continue without an account.',
            );
          }
          return;
        }
      }
    }
    if (!mounted) return;
    _input.clear();
    setState(() {
      _step = step;
      _fieldError = null;
      _requestError = null;
      _retry = null;
    });
    if (step == OnboardingStep.create || step == OnboardingStep.signIn) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _focus.requestFocus();
      });
    }
  }

  Future<void> _finishSetup(String outcome) async {
    _savedWarning = !await widget.remember(outcome);
    await _go(OnboardingStep.aniList);
  }

  /// Runs an account request; failures leave the vault and local list as
  /// they were (enforced by AccountService) and offer a retry.
  Future<void> _request(Future<void> Function() work, String outcome) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _requestError = null;
      _retry = null;
    });
    try {
      await work();
      if (!mounted) return;
      setState(() => _busy = false);
      await _finishSetup(outcome);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _requestError = error is AccountFailure
            ? error.message
            : 'Something went wrong. Your local list is unchanged. Try again.';
        _retry = () => _request(work, outcome);
      });
    }
  }

  void _submitCreate() {
    final handle = _input.text.trim();
    if (!RegExp(r'^[a-zA-Z0-9_]{3,20}$').hasMatch(handle)) {
      setState(() => _fieldError = 'Use 3–20 letters, numbers or underscores.');
      return;
    }
    setState(() => _fieldError = null);
    _request(() => _service.create(handle), 'created');
  }

  void _submitSignIn() {
    final key = _input.text.trim();
    if (!AccountService.validKey(key)) {
      setState(
        () => _fieldError = 'Enter the complete private key: adk_ followed by 64 characters (0–9, a–f).',
      );
      return;
    }
    setState(() => _fieldError = null);
    _request(() async {
      await _service.signIn(key);
      _input.clear();
    }, 'signed-in');
  }

  Future<void> _skip() async {
    if (_busy) return;
    setState(() => _busy = true);
    _savedWarning = !await widget.remember('guest');
    if (!mounted) return;
    setState(() => _busy = false);
    await _go(OnboardingStep.aniList);
  }

  Future<void> _connectAniList() async {
    final open =
        widget.openAniList ??
        (context) => Navigator.of(context).push(
          MaterialPageRoute<void>(builder: (_) => const AniListPageView()),
        );
    await open(context);
    if (mounted) widget.onFinished();
  }

  @override
  Widget build(BuildContext context) => PopScope(
    // Back leaves the app from the first and last steps (setup can repeat
    // or is already remembered); inside an account step it returns to the
    // welcome. Never while a request is running.
    canPop:
        !_busy &&
        (_step == OnboardingStep.welcome || _step == OnboardingStep.aniList),
    onPopInvokedWithResult: (didPop, _) {
      if (didPop || _busy) return;
      if (_step == OnboardingStep.create || _step == OnboardingStep.signIn) {
        _go(OnboardingStep.welcome);
      }
    },
    child: Scaffold(
      appBar: _step == OnboardingStep.create || _step == OnboardingStep.signIn
          ? AppBar(
              leading: IconButton(
                tooltip: 'Back',
                onPressed: _busy ? null : () => _go(OnboardingStep.welcome),
                icon: const Icon(Icons.arrow_back_rounded),
              ),
            )
          : null,
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: Column(
              children: [
                Expanded(
                  child: ListView(
                    key: ValueKey('onboarding-${_step.name}'),
                    padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
                    keyboardDismissBehavior:
                        ScrollViewKeyboardDismissBehavior.manual,
                    children: switch (_step) {
                      OnboardingStep.welcome => _welcome(),
                      OnboardingStep.create => _create(),
                      OnboardingStep.signIn => _signIn(),
                      OnboardingStep.aniList => _aniList(),
                    },
                  ),
                ),
                if (_step == OnboardingStep.welcome)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(24, 8, 24, 16),
                    child: _welcomeActions(),
                  ),
              ],
            ),
          ),
        ),
      ),
    ),
  );

  Widget _eyebrow(String text) => Text(
    text,
    style: const TextStyle(
      color: _accent,
      fontSize: 11,
      letterSpacing: 2,
      fontWeight: FontWeight.w700,
    ),
  );

  Widget _title(String text) => Padding(
    padding: const EdgeInsets.only(top: 14, bottom: 14),
    child: Semantics(
      header: true,
      child: Text(
        text,
        style: const TextStyle(
          fontSize: 32,
          height: 1.12,
          fontWeight: FontWeight.w800,
          letterSpacing: -1,
        ),
      ),
    ),
  );

  Widget _body(String text) => Text(
    text,
    style: const TextStyle(color: _muted, height: 1.55, fontSize: 15),
  );

  Widget _wide(Widget button) =>
      SizedBox(width: double.infinity, child: button);

  Widget _status() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      if (_busy)
        const Padding(
          padding: EdgeInsets.only(bottom: 16),
          child: LinearProgressIndicator(semanticsLabel: 'Contacting AniDeck'),
        ),
      if (_requestError != null)
        Container(
          margin: const EdgeInsets.only(bottom: 16),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: const Color(0xff2b2220),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xff5a4633)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(
                liveRegion: true,
                child: Text(
                  _requestError!,
                  key: const ValueKey('onboarding-error'),
                  style: const TextStyle(color: _warning, height: 1.45),
                ),
              ),
              if (_retry != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: TextButton.icon(
                    onPressed: _busy ? null : _retry,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Try again'),
                  ),
                ),
            ],
          ),
        ),
    ],
  );

  List<Widget> _welcome() => [
    Row(
      children: [
        Image.asset('assets/app-icon.png', width: 40, height: 40),
        const SizedBox(width: 12),
        const Flexible(
          child: Text(
            'AniDeck',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.8,
            ),
          ),
        ),
      ],
    ),
    const SizedBox(height: 40),
    _eyebrow('YOUR NEXT WATCH, ON DECK'),
    _title('Welcome to AniDeck.'),
    _body(
      'Find something to watch, keep your list and pick up where you left off. Your list and playback progress stay on this device, with or without an account.',
    ),
    const SizedBox(height: 28),
    Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xff383049), Color(0xff201e2b)],
        ),
        border: Border.all(color: const Color(0xff514660)),
        borderRadius: BorderRadius.circular(24),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.key_rounded, color: _accent),
          SizedBox(width: 14),
          Expanded(
            child: Text(
              'An AniDeck profile is optional. It comes with a private key that lets you sign in on another device. AniDeck keeps the key in this phone’s secure storage and never shows or copies it unless you ask in Your account.',
              style: TextStyle(height: 1.5, color: Color(0xffd9d2e6)),
            ),
          ),
        ],
      ),
    ),
  ];

  /// Pinned below the scrolling welcome so all three choices, including
  /// continuing without an account, are always visible without scrolling.
  Widget _welcomeActions() => Column(
    mainAxisSize: MainAxisSize.min,
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      _status(),
      _wide(
        FilledButton.icon(
          key: const ValueKey('onboarding-create'),
          onPressed: _busy ? null : () => _go(OnboardingStep.create),
          icon: const Icon(Icons.person_add_alt_rounded),
          label: const Text('Create AniDeck profile'),
        ),
      ),
      const SizedBox(height: 12),
      _wide(
        FilledButton.tonalIcon(
          key: const ValueKey('onboarding-sign-in'),
          style: FilledButton.styleFrom(minimumSize: const Size(48, 52)),
          onPressed: _busy ? null : () => _go(OnboardingStep.signIn),
          icon: const Icon(Icons.login_rounded),
          label: const Text('Sign in with private key'),
        ),
      ),
      const SizedBox(height: 12),
      _wide(
        OutlinedButton.icon(
          key: const ValueKey('onboarding-skip'),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size(48, 52),
            side: const BorderSide(color: Color(0xff6b5e80)),
          ),
          onPressed: _busy ? null : _skip,
          icon: const Icon(Icons.arrow_forward_rounded),
          label: const Text('Continue without an account'),
        ),
      ),
      const SizedBox(height: 16),
      const Text(
        'You can set up an account any time from the profile icon on Home.',
        textAlign: TextAlign.center,
        style: TextStyle(color: Color(0xff8f899e), fontSize: 12, height: 1.5),
      ),
    ],
  );

  Widget _field({
    required String label,
    required String hint,
    required bool secret,
    required VoidCallback onSubmit,
  }) => TextField(
    key: const ValueKey('onboarding-field'),
    controller: _input,
    focusNode: _focus,
    enabled: !_busy,
    obscureText: secret,
    enableSuggestions: false,
    autocorrect: false,
    enableIMEPersonalizedLearning: !secret,
    keyboardType: secret ? TextInputType.visiblePassword : TextInputType.text,
    textInputAction: TextInputAction.done,
    scrollPadding: const EdgeInsets.only(bottom: 160),
    onChanged: (_) {
      if (_fieldError != null) setState(() => _fieldError = null);
    },
    onSubmitted: (_) => onSubmit(),
    decoration: InputDecoration(
      labelText: label,
      hintText: hint,
      errorText: _fieldError,
      errorMaxLines: 3,
      border: const OutlineInputBorder(),
    ),
  );

  List<Widget> _create() => [
    _eyebrow('CREATE YOUR PROFILE'),
    _title('Pick a public handle.'),
    _body(
      'Friends see your handle. A private key is generated and saved securely on this phone before your profile is created, so an interrupted setup can finish later.',
    ),
    const SizedBox(height: 24),
    _field(
      label: 'Public handle',
      hint: '3–20 letters, numbers or underscores',
      secret: false,
      onSubmit: _submitCreate,
    ),
    const SizedBox(height: 16),
    _status(),
    _wide(
      FilledButton.icon(
        key: const ValueKey('onboarding-submit'),
        onPressed: _busy ? null : _submitCreate,
        icon: const Icon(Icons.person_add_alt_rounded),
        label: const Text('Create profile'),
      ),
    ),
    const SizedBox(height: 16),
    _body(
      'To sign in on another device later, open Your account → Sign-in & recovery and choose to show or copy your private key. Keep it somewhere private.',
    ),
  ];

  List<Widget> _signIn() => [
    _eyebrow('WELCOME BACK'),
    _title('Sign in with your private key.'),
    _body(
      'Paste the complete key from another AniDeck device: Settings or Your account → Sign-in & recovery. It is checked with AniDeck, then saved only in this phone’s secure storage.',
    ),
    const SizedBox(height: 24),
    _field(
      label: 'Private AniDeck key',
      hint: 'adk_…',
      secret: true,
      onSubmit: _submitSignIn,
    ),
    const SizedBox(height: 16),
    _status(),
    _wide(
      FilledButton.icon(
        key: const ValueKey('onboarding-submit'),
        onPressed: _busy ? null : _submitSignIn,
        icon: const Icon(Icons.login_rounded),
        label: const Text('Sign in'),
      ),
    ),
    const SizedBox(height: 16),
    _body(
      'A failed sign-in changes nothing: your local list and any saved account stay as they are.',
    ),
  ];

  List<Widget> _aniList() {
    final profile = _service.profile;
    return [
      _eyebrow(profile == null ? 'YOU’RE ALL SET' : 'SIGNED IN'),
      _title(
        profile == null
            ? 'Ready when you are.'
            : 'Welcome, @${profile.handle}.',
      ),
      _body(
        profile == null
            ? 'Your list works on this device without an account. You can create or sign in to an AniDeck profile later from the profile icon on Home.'
            : 'Your private key is saved securely on this phone. Find it later in Your account → Sign-in & recovery.',
      ),
      if (_savedWarning)
        const Padding(
          padding: EdgeInsets.only(top: 16),
          child: Text(
            'AniDeck couldn’t remember finishing setup on this device, so you may see this welcome again. Your list and account are unaffected.',
            key: ValueKey('onboarding-save-warning'),
            style: TextStyle(color: _warning, height: 1.45),
          ),
        ),
      const SizedBox(height: 28),
      Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: const Color(0xff211e2b),
          border: Border.all(color: const Color(0xff383141)),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.sync_rounded, color: _accent),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Connect AniList',
                    style: TextStyle(fontSize: 19, fontWeight: FontWeight.w700),
                  ),
                ),
                Chip(
                  label: const Text('Optional'),
                  labelStyle: const TextStyle(fontSize: 11),
                  visualDensity: VisualDensity.compact,
                ),
              ],
            ),
            const SizedBox(height: 10),
            const Text(
              'See your AniList list and make reviewed edits from AniDeck. You can connect any time from the sync icon on Home.',
              style: TextStyle(height: 1.5, color: Color(0xffd9d2e6)),
            ),
            const SizedBox(height: 18),
            _wide(
              FilledButton.icon(
                key: const ValueKey('onboarding-anilist'),
                onPressed: _connectAniList,
                icon: const Icon(Icons.link_rounded),
                label: const Text('Connect AniList'),
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: 12),
      _wide(
        OutlinedButton(
          key: const ValueKey('onboarding-done'),
          style: OutlinedButton.styleFrom(minimumSize: const Size(48, 52)),
          onPressed: widget.onFinished,
          child: const Text('Not now — go to AniDeck'),
        ),
      ),
    ];
  }
}
