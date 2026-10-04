$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  Add-Type -AssemblyName Accessibility
  $accessibleSource = Join-Path $PSScriptRoot 'auto-play-accessible.cs'
  if (Test-Path -LiteralPath $accessibleSource) {
    Add-Type -TypeDefinition ([IO.File]::ReadAllText($accessibleSource, [Text.Encoding]::UTF8)) -ReferencedAssemblies ([Accessibility.IAccessible].Assembly.Location)
  }
  $scope = $env:OVERWORLD_LAUNCHER_DIRECTORY
  $game = $env:OVERWORLD_GAME_DIRECTORY
  if (!$scope -or !$game) { throw 'Missing scope' }
  $deadline = [DateTime]::UtcNow.AddSeconds(25)
  $lastSelectorType = 'none'
  $lastButtonCount = 0
  $lastRootCount = 0
  $lastAccessible = 'missing'
  $playInvoked = $false
  while ([DateTime]::UtcNow -lt $deadline) {
    # Read only installation metadata. Never read launcher account or token files.
    $validProfile = $false
    foreach ($name in @('launcher_profiles.json', 'launcher_profiles_microsoft_store.json')) {
      $profileFile = Join-Path $scope $name
      if (Test-Path -LiteralPath $profileFile) {
        $profiles = Get-Content -LiteralPath $profileFile -Raw -Encoding UTF8 | ConvertFrom-Json
        $selected = $profiles.profiles.'overworld-managed'
        if ($selected.gameDir -eq $game -and $selected.name -eq 'Overworld') { $validProfile = $true }
      }
    }
    if (!$validProfile) { 'profile-mismatch'; exit 0 }
    if ($playInvoked) {
      $games = Get-CimInstance Win32_Process -Filter "Name='java.exe' OR Name='javaw.exe'"
      foreach ($runningGame in $games) {
        if ($runningGame.CommandLine -and $runningGame.CommandLine.IndexOf($game, [StringComparison]::OrdinalIgnoreCase) -ge 0) { 'invoked'; exit 0 }
      }
    }
    $processes = Get-CimInstance Win32_Process -Filter "Name='MinecraftLauncher.exe' OR Name='Minecraft.exe'"
    foreach ($proc in $processes) {
      if (!$proc.CommandLine -or $proc.CommandLine.IndexOf($scope, [StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
      if ('OverworldAccessible' -as [type]) {
        $nativeWindow = (Get-Process -Id $proc.ProcessId -ErrorAction SilentlyContinue).MainWindowHandle
        if ($nativeWindow -and $nativeWindow -ne [IntPtr]::Zero) {
          $lastAccessible = [OverworldAccessible]::Play($nativeWindow, $playInvoked)
          if ($lastAccessible -eq 'warning-invoked') { 'invoked'; exit 0 }
          if ($lastAccessible -eq 'invoked') { $playInvoked = $true; continue }
          if ($lastAccessible -eq 'login') { 'manual'; exit 0 }
        }
      }
      $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, [int]$proc.ProcessId)
      $roots = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
      if ($roots.Count -gt 0) { $lastRootCount = $roots.Count }
      foreach ($root in $roots) {
        try {
          $elements = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
          $profileReady = $false
          $buttons = @()
          $blocked = $false
          $warning = $false
          $warningOption = $false
          foreach ($element in $elements) {
            $current = $element.Current
            $label = $current.Name.Trim()
            if ($current.IsOffscreen -or !$current.IsEnabled) { continue }
            if ($label -match '^(Sign in|Log in|Microsoft Login|로그인|Microsoft 로그인|Play Demo|Play trial|데모 플레이|체험판 플레이)$') { $blocked = $true }
            if ($label -match 'player safety features|installation.{0,40}modified|modified.{0,40}installation|설치.{0,30}수정|수정.{0,30}설치|플레이어.{0,20}안전') { $warning = $true }
            if ($current.ControlType -eq [System.Windows.Automation.ControlType]::CheckBox -and $label -match "(?:don't|do not).{0,20}(?:warn|show)|다시.{0,30}(?:표시|경고)") { $warningOption = $true }
            # The official CEF launcher exposes the active installation selector as a MenuItem.
            # Do not accept Overworld text from installation cards or news content.
            $selectorType = $current.ControlType -eq [System.Windows.Automation.ControlType]::Button -or $current.ControlType -eq [System.Windows.Automation.ControlType]::ComboBox -or $current.ControlType -eq [System.Windows.Automation.ControlType]::MenuItem
            $selectorName = $label -match '^(?:(?:설치 설정 선택:|Select installation:|Installation selection:)\s*)?Overworld(?:\s|$)'
            if ($selectorName) { $lastSelectorType = $current.ControlType.ProgrammaticName }
            if ($selectorType -and $selectorName) { $profileReady = $true }
            if ($label -match '^(PLAY|플레이|플레이하기|게임 시작)$' -and $current.ControlType -eq [System.Windows.Automation.ControlType]::Button) { $buttons += $element }
          }
          if ($blocked) { 'manual'; exit 0 }
          $lastButtonCount = $buttons.Count
          if (((!$playInvoked -and $profileReady) -or ($playInvoked -and $warning -and $warningOption)) -and $buttons.Count -eq 1) {
            $pattern = $null
            if ($buttons[0].TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
              ([System.Windows.Automation.InvokePattern]$pattern).Invoke()
              if ($playInvoked) { 'invoked'; exit 0 }
              $playInvoked = $true
              break
            }
            if ($buttons[0].TryGetCurrentPattern([System.Windows.Automation.LegacyIAccessiblePattern]::Pattern, [ref]$pattern)) {
              ([System.Windows.Automation.LegacyIAccessiblePattern]$pattern).DoDefaultAction()
              if ($playInvoked) { 'invoked'; exit 0 }
              $playInvoked = $true
              break
            }
          }
        } catch { }
      }
    }
    Start-Sleep -Milliseconds 600
  }
  if ($playInvoked) { 'invoked'; exit 0 }
  "manual:selector=${lastSelectorType}:buttons=${lastButtonCount}:roots=${lastRootCount}:${lastAccessible}"
} catch { 'unavailable' }
