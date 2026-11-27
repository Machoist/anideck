import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import 'account_service.dart';

class AccountPage extends StatefulWidget {
  const AccountPage({super.key, this.service, this.screenProtection});
  final AccountService? service;
  final Future<void> Function(bool enabled)? screenProtection;
  @override
  State<AccountPage> createState() => _AccountPageState();
}

class _AccountPageState extends State<AccountPage> with WidgetsBindingObserver {
  late final _service = widget.service ?? AccountService();
  final _input = TextEditingController();
  final _scroll = ScrollController();
  bool _busy = true, _protected = false, _create = false, _foreground = true;
  String? _error, _revealed;
  static const _privacy = MethodChannel('anideck/privacy');
  Future<void> _protect(bool enabled) =>
      widget.screenProtection?.call(enabled) ??
      _privacy.invokeMethod<void>('setScreenProtected', enabled);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _start();
  }

  Future<void> _start() async {
    try {
      await _protect(true);
      if (!mounted) return;
      setState(() => _protected = true);
      await _service.restore();
    } catch (error) {
      if (mounted) {
        setState(
          () => _error = _protected ? error.toString() : 'Account privacy could not start. Close this page and try again.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    if (state != AppLifecycleState.resumed) {
      _input.clear();
      if (mounted) setState(() => _revealed = null);
    }
  }

  Future<void> _run(Future<void> Function() operation) async {
    if (_busy || !_protected) return;
    final previousProfile = _service.profile;
    setState(() {
      _busy = true;
      _error = null;
      _revealed = null;
    });
    try {
      await operation();
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      _input.clear();
      if (mounted) {
        setState(() => _busy = false);
        if (previousProfile == null && _service.profile != null) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted && _scroll.hasClients) _scroll.jumpTo(0);
          });
        }
      }
    }
  }

  Future<void> _submit() async {
    final value = _input.text;
    await _run(() async {
      if (_create) {
        await _service.create(value);
      } else {
        await _service.signIn(value);
      }
    });
  }

  Future<void> _signOut() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out on this device?'),
        content: const Text(
          'Save your private key first. Your cloud profile stays intact and your local watchlist stays on this tablet.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) await _run(_service.signOut);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _input.dispose();
    _scroll.dispose();
    _service.close();
    _protect(false).catchError((_) {});
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy,
    child: Scaffold(
      appBar: AppBar(title: const Text('Your AniDeck account')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 640),
            child: ListView(
              controller: _scroll,
              padding: const EdgeInsets.all(24),
              children: [
                const Text(
                  'YOUR CIRCLE, ACROSS DEVICES',
                  style: TextStyle(
                    color: Color(0xffbba5ff),
                    fontSize: 11,
                    letterSpacing: 2,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  _service.profile == null
                      ? 'Bring your profile with you.'
                      : '@${_service.profile!.handle}',
                  style: const TextStyle(
                    fontSize: 30,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'An AniDeck account is optional. Your local watchlist and playback progress stay on this device; signing in does not sync them.',
                  style: TextStyle(height: 1.5),
                ),
                const SizedBox(height: 24),
                if (_busy) const LinearProgressIndicator(),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Text(
                      _error!,
                      style: const TextStyle(color: Color(0xffffca8b)),
                      semanticsLabel: 'Account error: $_error',
                    ),
                  ),
                if (_protected && !_busy) ...[
                  if (_service.profile != null)
                    Card(
                      child: ListTile(
                        leading: const Icon(Icons.verified_user_outlined),
                        title: Text(_service.profile!.name),
                        subtitle: const Text(
                          'Signed in with your private AniDeck key',
                        ),
                      ),
                    ),
                  if (_service.hasSavedKey) ...[
                    const SizedBox(height: 16),
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Sign-in & recovery',
                              style: TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 10),
                            const Text(
                              'Your handle is public. Your private key proves ownership. Anyone with it can sign in. Keep a private backup; a lost key cannot be recovered.',
                            ),
                            const SizedBox(height: 16),
                            if (_revealed != null)
                              SelectableText(
                                _revealed!,
                                style: const TextStyle(fontFamily: 'monospace'),
                              ),
                            Wrap(
                              spacing: 8,
                              children: [
                                TextButton.icon(
                                  onPressed: () => _run(() async {
                                    final key = await _service.privateKey();
                                    if (mounted && _foreground) {
                                      setState(() => _revealed = key);
                                    }
                                  }),
                                  icon: const Icon(Icons.visibility_outlined),
                                  label: const Text('Show private key'),
                                ),
                                TextButton.icon(
                                  onPressed: () => _run(() async {
                                    final key = await _service.privateKey();
                                    if (key != null) {
                                      await Clipboard.setData(
                                        ClipboardData(text: key),
                                      );
                                      if (mounted) {
                                        ScaffoldMessenger.of(this.context)
                                            .showSnackBar(
                                              const SnackBar(
                                                content: Text(
                                                  'Private key copied. Keep it somewhere safe.',
                                                ),
                                              ),
                                            );
                                      }
                                    }
                                  }),
                                  icon: const Icon(Icons.copy_outlined),
                                  label: const Text('Copy private key'),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (_service.profile == null) ...[
                      TextButton.icon(
                        onPressed: () => _run(() async {
                          await _service.restore();
                        }),
                        icon: const Icon(Icons.refresh),
                        label: const Text('Retry saved sign-in'),
                      ),
                      const Text(
                        'If profile creation was interrupted, choose a handle below to finish using the same saved key.',
                      ),
                      TextField(
                        controller: _input,
                        autocorrect: false,
                        decoration: const InputDecoration(
                          labelText: 'Profile handle',
                          hintText: '3–20 letters, numbers or underscores',
                        ),
                      ),
                      FilledButton(
                        onPressed: () => _run(() async {
                          await _service.create(_input.text);
                        }),
                        child: const Text('Finish creating profile'),
                      ),
                    ],
                    const SizedBox(height: 20),
                    OutlinedButton.icon(
                      onPressed: _signOut,
                      icon: const Icon(Icons.logout),
                      label: const Text('Sign out on this device'),
                    ),
                  ] else ...[
                    SegmentedButton<bool>(
                      segments: const [
                        ButtonSegment(value: false, label: Text('Sign in')),
                        ButtonSegment(
                          value: true,
                          label: Text('Create profile'),
                        ),
                      ],
                      selected: {_create},
                      onSelectionChanged: (value) => setState(() {
                        _create = value.first;
                        _input.clear();
                        _error = null;
                      }),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      _create
                          ? 'Choose a public handle. A private recovery key will be saved securely before your profile is created.'
                          : 'Use the complete private key from desktop Settings → Account → Sign-in & recovery. Profiles created through AniList or Kitsu require that provider; those Android connections come next.',
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _input,
                      obscureText: !_create,
                      enableSuggestions: false,
                      autocorrect: false,
                      enableIMEPersonalizedLearning: false,
                      keyboardType: _create
                          ? TextInputType.text
                          : TextInputType.visiblePassword,
                      onSubmitted: (_) => _submit(),
                      decoration: InputDecoration(
                        labelText: _create
                            ? 'Public handle'
                            : 'Private AniDeck key',
                        hintText: _create ? 'Your handle' : 'adk_…',
                        border: const OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: _submit,
                      icon: Icon(
                        _create ? Icons.person_add_outlined : Icons.login,
                      ),
                      label: Text(
                        _create ? 'Create AniDeck profile' : 'Sign in with key',
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Continue without an account'),
                    ),
                  ],
                ],
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
