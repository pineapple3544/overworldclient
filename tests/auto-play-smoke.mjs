import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const exec = promisify(execFile);
const root = resolve('.test-data', 'auto-play-' + Date.now());
await mkdir(root, { recursive: true });
const psRoot = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0');
const ps = join(psRoot, 'powershell.exe');
const source = await readFile('electron/auto-play.ps1', 'utf8');
await writeFile(
  join(root, 'auto-play-accessible.cs'),
  await readFile('electron/auto-play-accessible.cs'),
);
// Inject only fixture process discovery and a shorter timeout; use the real UI selection and InvokePattern.
const helper = source
  .replace(
    "$processes = Get-CimInstance Win32_Process -Filter \"Name='MinecraftLauncher.exe' OR Name='Minecraft.exe'\"",
    '$processes = @([pscustomobject]@{ ProcessId = [int]$env:OVERWORLD_FIXTURE_PID; CommandLine = $scope })',
  )
  .replace('$games = Get-CimInstance Win32_Process -Filter "Name=\'java.exe\' OR Name=\'javaw.exe\'"', '$games = @()')
  .replace('AddSeconds(25)', 'AddSeconds(6)');
await writeFile(join(root, 'helper.ps1'), '\ufeff' + helper);
await writeFile(
  join(root, 'fixture.ps1'),
  `\ufeffAdd-Type -AssemblyName PresentationFramework
$form=New-Object Windows.Window
$form.Title='Overworld macro test fixture'
$form.Width=420; $form.Height=200; $form.ShowActivated=$false; $form.ShowInTaskbar=$false
$stack=New-Object Windows.Controls.StackPanel
$form.Content=$stack
if($env:OVERWORLD_FIXTURE_KIND -eq 'menu') {
  $profile=New-Object Windows.Controls.MenuItem
  $profile.Header='설치 설정 선택: ' + $env:OVERWORLD_FIXTURE_PROFILE + ' 26.2'
  [Windows.Automation.AutomationProperties]::SetAutomationId($profile,'installation_select__toggle')
} else {
  $profile=New-Object Windows.Controls.Button
  $profile.Content=$env:OVERWORLD_FIXTURE_PROFILE
}
$stack.Children.Add($profile) | Out-Null
$play=New-Object Windows.Controls.Button
$play.Content='PLAY'
$play.add_Click({
  if($env:OVERWORLD_FIXTURE_KIND -eq 'warning' -or $env:OVERWORLD_FIXTURE_KIND -eq 'unrelated') {
    $stack.Children.Clear()
    $message=New-Object Windows.Controls.TextBlock
    $message.Text=if($env:OVERWORLD_FIXTURE_KIND -eq 'warning'){'This installation has been modified and might not support the latest player safety features.'}else{'An unrelated error occurred.'}
    $stack.Children.Add($message) | Out-Null
    $option=New-Object Windows.Controls.CheckBox;$option.Content="Don't warn me again about this installation."
    $stack.Children.Add($option) | Out-Null
    $confirm=New-Object Windows.Controls.Button;$confirm.Content='PLAY'
    $confirm.add_Click({[IO.File]::WriteAllText($env:OVERWORLD_FIXTURE_MARKER,'clicked');$form.Close()})
    $stack.Children.Add($confirm) | Out-Null
  } else {[IO.File]::WriteAllText($env:OVERWORLD_FIXTURE_MARKER,'clicked');$form.Close()}
})
$stack.Children.Add($play) | Out-Null
if($env:OVERWORLD_FIXTURE_LOGIN -eq '1'){$login=New-Object Windows.Controls.Button;$login.Content='Sign in';$stack.Children.Add($login) | Out-Null}
$timer=New-Object Windows.Threading.DispatcherTimer
$timer.Interval=[TimeSpan]::FromSeconds(20)
$timer.add_Tick({$timer.Stop();$form.Close()})
$form.add_ContentRendered({[IO.File]::WriteAllText($env:OVERWORLD_FIXTURE_READY,'ready');$timer.Start()})
$form.ShowDialog() | Out-Null
`,
);
await writeFile(
  join(root, 'launcher_profiles.json'),
  JSON.stringify({
    profiles: { 'overworld-managed': { name: 'Overworld', gameDir: join(root, 'game') } },
  }),
);
async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}
for (const [name, profile, login, expected, clicked = expected === 'invoked'] of [
  ['correct', 'Overworld', false, 'invoked'],
  ['menu', 'Overworld', false, 'invoked'],
  ['wrong', 'Personal', false, 'manual'],
  ['login', 'Overworld', true, 'manual'],
  ['warning', 'Overworld', false, 'invoked', true],
  ['unrelated', 'Overworld', false, 'invoked', false],
]) {
  const marker = join(root, name + '.clicked'),
    ready = join(root, name + '.ready');
  const env = {
    ...process.env,
    PSModulePath: join(psRoot, 'Modules'),
    OVERWORLD_LAUNCHER_DIRECTORY: root,
    OVERWORLD_GAME_DIRECTORY: join(root, 'game'),
    OVERWORLD_FIXTURE_PROFILE: profile,
    OVERWORLD_FIXTURE_KIND: name,
    OVERWORLD_FIXTURE_LOGIN: login ? '1' : '0',
    OVERWORLD_FIXTURE_MARKER: marker,
    OVERWORLD_FIXTURE_READY: ready,
  };
  const child = spawn(ps, ['-NoProfile', '-NonInteractive', '-File', join(root, 'fixture.ps1')], {
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', (b) => (errors += b));
  const ended = new Promise((r) => child.once('exit', r));
  for (let i = 0; i < 60 && !(await exists(ready)); i++)
    await new Promise((r) => setTimeout(r, 100));
  assert.equal(await exists(ready), true, errors);
  const result = await exec(
    ps,
    ['-NoProfile', '-NonInteractive', '-File', join(root, 'helper.ps1')],
    {
      env: { ...env, OVERWORLD_FIXTURE_PID: String(child.pid) },
      windowsHide: true,
      timeout: 20000,
    },
  );
  assert.equal(result.stdout.trim().split(':')[0], expected);
  assert.equal(await exists(marker), clicked);
  if (child.exitCode === null) child.kill();
  await ended;
}
console.log(
  'UI Automation passed: background InvokePattern clicks only matching Overworld profile and refuses wrong-profile/login screens.',
);
